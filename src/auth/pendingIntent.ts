import { z } from 'zod'
import { ID_PATTERN } from '../catalog/schema.ts'

/**
 * §9.4 — **the pending intent.** D6 says browsing needs no account and every
 * write needs a session, which means a guest who presses *Owned One* is sent
 * away to Google mid-gesture. This is the one concession that makes that
 * bearable: what they pressed is remembered across the round trip and applied
 * when they come back.
 *
 * It is deliberately **a single slot, not a queue and not a sync engine** —
 * §9.4 is explicit, and the distinction is the whole point of D6. A queue is an
 * offline collection by another name, and an offline collection recreates the
 * merge problem D6 exists to prevent.
 *
 * Under D31 this module carries the 90% coverage floor, alongside `src/catalog/`
 * and `src/collection/`. It is on that list for a reason: every one of its
 * failure modes is silent. A slot that never expires applies a stale press days
 * later; a slot that is not cleared applies the same press twice; a slot that
 * throws on unparseable JSON takes down the sign-in return with it.
 */

/** §9.4 — thirty minutes. Older than that and the press is not what they meant. */
export const INTENT_TTL_MS = 30 * 60 * 1000

/** One key. §9.4: "two mechanisms for one problem is how the second one rots". */
export const INTENT_KEY = 'cc.intent'

/**
 * Where to put the user back. This is a **path**, never a URL, and it is checked
 * rather than trusted: the value survives a round trip through an external
 * identity provider, and a redirect target that came back from off-site is the
 * classic open-redirect shape. Anything not a plain same-origin path is refused
 * and the slot falls back to `/`.
 *
 * `//evil.example` is the case worth naming — a browser reads a protocol-
 * relative URL as another origin while it still starts with the `/` a naive
 * check looks for. A backslash is refused for the same reason: several browsers
 * normalise `/\` to `//`.
 */
export function isSafeReturnPath(value: string): boolean {
  if (value.length === 0 || value.length > 512) return false
  if (!value.startsWith('/')) return false
  if (value.startsWith('//')) return false
  if (value.includes('\\')) return false
  return true
}

const returnTo = z.string().refine(isSafeReturnPath, 'must be a same-origin path')
const ts = z.number().int().positive()

/**
 * The action the user was in the middle of, discriminated by `kind` (§9.4).
 *
 * `'return'` is the case with no action at all — someone who pressed **Sign in**
 * in the header, or landed on `/collection` while signed out. It exists so the
 * return path can travel in the slot like everything else, which is what keeps
 * the OAuth redirect URI a single fixed string with no query on it (§9.1). One
 * key, one payload, one shape.
 */
const COLLECTION_INTENT = z.strictObject({
  kind: z.literal('collection'),
  // The same pattern the database will check (§6.3). The slot is browser state,
  // but what comes out of it becomes a write, and D2 makes the id permanent.
  modelId: z.string().regex(ID_PATTERN),
  status: z.enum(['owned', 'wishlist']),
  returnTo,
  ts,
})

const REQUEST_INTENT = z.strictObject({
  kind: z.literal('request'),
  // FR-9.3's unsent draft, carried by the same slot. Bounds match §6.3's
  // constraints on catalog_requests, so a draft that could never be stored
  // cannot survive a sign-in either.
  ref: z.string().min(2).max(40),
  link: z.string().max(500).optional(),
  note: z.string().max(500).optional(),
  returnTo,
  ts,
})

const RETURN_INTENT = z.strictObject({
  kind: z.literal('return'),
  returnTo,
  ts,
})

export const PENDING_INTENT = z.discriminatedUnion('kind', [
  COLLECTION_INTENT,
  REQUEST_INTENT,
  RETURN_INTENT,
])

export type PendingIntent = z.infer<typeof PENDING_INTENT>

/** Distributes over the union — a plain `Omit` would collapse the discriminant. */
type WithoutTimestamp<T> = T extends unknown ? Omit<T, 'ts'> : never
export type PendingIntentInput = WithoutTimestamp<PendingIntent>

function readRaw(): string | null {
  try {
    return sessionStorage.getItem(INTENT_KEY)
  } catch {
    // Private mode, or storage disabled. Losing the press is a worse experience
    // than keeping it, and it is not a reason to fail the sign-in.
    return null
  }
}

/**
 * Writes the slot, stamping the time here rather than taking it from the caller
 * so there is one clock and the expiry cannot be argued with.
 */
export function writePendingIntent(intent: PendingIntentInput, now: number = Date.now()): void {
  const stamped = { ...intent, ts: now }
  try {
    sessionStorage.setItem(INTENT_KEY, JSON.stringify(stamped))
  } catch {
    // Quota, or storage disabled. The sign-in still works; the press is lost.
  }
}

/**
 * Writes a bare return path **only if the slot is empty**.
 *
 * The order matters and it is easy to get backwards. A guest pressing *Owned
 * One* writes a `collection` intent and *then* the modal opens; if opening the
 * modal overwrote the slot with a plain `return`, the press D6 promised to keep
 * would be thrown away by the dialogue that exists to keep it.
 */
export function ensureReturnPath(path: string, now: number = Date.now()): void {
  if (readPendingIntent(now)) return
  writePendingIntent({ kind: 'return', returnTo: safePathOr(path) }, now)
}

export function clearPendingIntent(): void {
  try {
    sessionStorage.removeItem(INTENT_KEY)
  } catch {
    // Nothing to do. A slot we cannot clear is a slot we could not have written.
  }
}

/**
 * Reads without consuming. Returns `null` — and **clears the key** — for
 * anything that is not a live, well-formed intent.
 *
 * Clearing on a bad read is the part that is easy to leave out. A value that
 * cannot be parsed is not going to start parsing later, and a slot that keeps
 * failing is a slot that fails on every future sign-in too.
 */
export function readPendingIntent(now: number = Date.now()): PendingIntent | null {
  const raw = readRaw()
  if (raw === null) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    clearPendingIntent()
    return null
  }

  const result = PENDING_INTENT.safeParse(parsed)
  if (!result.success) {
    clearPendingIntent()
    return null
  }

  // A clock that has gone backwards (a machine that resynced NTP, or a stamp
  // written by a different tab) is treated as expired rather than as valid
  // forever. `ts` in the future is not a case this needs to support.
  const age = now - result.data.ts
  if (age < 0 || age > INTENT_TTL_MS) {
    clearPendingIntent()
    return null
  }

  return result.data
}

/**
 * Reads **and clears**, which is how §9.4 says the slot is consumed: "the key is
 * ignored and cleared". Every caller on the authenticated return uses this one,
 * so "never applied twice" is a property of the function rather than of each
 * call site remembering to tidy up.
 */
export function takePendingIntent(now: number = Date.now()): PendingIntent | null {
  const intent = readPendingIntent(now)
  clearPendingIntent()
  return intent
}

/** A path that failed the check is not an error to show anyone — it is `/`. */
export function safePathOr(path: string, fallback = '/'): string {
  return isSafeReturnPath(path) ? path : fallback
}
