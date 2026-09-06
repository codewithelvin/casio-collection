/**
 * D70 — the optional things a profile may say about its owner, and the rules
 * that keep them safe to render on a public page.
 *
 * Everything here is a pure function, which is why it is in `src/collection/`
 * under D31's 90% floor rather than inside the settings screen. Two of these
 * decide what a stranger's browser is told to load; they are exactly the shape
 * of thing that fails quietly and correctly-looking.
 */

/**
 * **A link is a platform and a handle, never a URL.**
 *
 * FR-5.3 already refuses to parse links out of a note, because this site renders
 * user-authored text on a public page. A free URL field is `javascript:`, an
 * open redirect, a link farm and a phishing target in one input. A fixed list
 * plus a handle shape is none of them: `buildLinkUrl` below constructs the whole
 * address and the person supplies only its last segment.
 *
 * `watchuseek` was in the first draft of this list and is deliberately absent:
 * its member URLs carry a numeric id (`/members/name.12345/`) that a handle
 * cannot produce, so the site could not have built the address — which is the
 * one thing every entry here has to be able to do. A forum profile goes in
 * `website` instead.
 */
export const LINK_PLATFORMS = [
  'instagram',
  'x',
  'reddit',
  'youtube',
  'tiktok',
  'facebook',
  'github',
  'website',
] as const

export type LinkPlatform = (typeof LINK_PLATFORMS)[number]

export interface ProfileLink {
  platform: LinkPlatform
  handle: string
}

/** Mirrors 0005's `handle_shape` check. The database is the rule; this is the form. */
const HANDLE_PATTERN = /^[A-Za-z0-9._-]{1,40}$/

/**
 * The one exception, and the only place a person's own address is stored.
 *
 * Matched case-insensitively here and stored lower-cased in its scheme and host
 * by `normaliseWebsite`, because 0005's check is `^https://[a-z0-9.-]+…` — a
 * database that refuses `HTTPS://Example.com` while the form accepts it is a
 * save that fails with a message nobody can act on. The path keeps its case:
 * hosts are case-insensitive and paths are not.
 *
 * `https` only. There is no argument for publishing an `http://` link in 2026,
 * and the shorter the accepted grammar the smaller the surface.
 */
const WEBSITE_PATTERN = /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/[^\s]*)?$/i

const MAX_WEBSITE = 200

/** `https://Example.COM/Path` → `https://example.com/Path`. */
export function normaliseWebsite(raw: string): string {
  const trimmed = raw.trim()
  const match = /^(https:\/\/[^/?#]+)(.*)$/i.exec(trimmed)
  if (!match) return trimmed
  return `${(match[1] ?? '').toLowerCase()}${match[2] ?? ''}`
}

/** Strips what people paste in out of habit: a leading `@`, and stray spaces. */
export function normaliseLinkHandle(platform: LinkPlatform, raw: string): string {
  if (platform === 'website') return normaliseWebsite(raw)
  return raw.trim().replace(/^@+/, '')
}

export function isValidLink(platform: LinkPlatform, handle: string): boolean {
  const value = normaliseLinkHandle(platform, handle)
  if (value === '') return false
  if (platform === 'website') return value.length <= MAX_WEBSITE && WEBSITE_PATTERN.test(value)
  return HANDLE_PATTERN.test(value)
}

/**
 * The site builds the address. **Nothing a person typed is ever used as an
 * `href`** (S10) — every value below is interpolated into a template this file
 * owns, and `encodeURIComponent` means even a handle that got past the shape
 * check cannot break out of the path segment it belongs in.
 */
export function buildLinkUrl(platform: LinkPlatform, handle: string): string {
  const value = normaliseLinkHandle(platform, handle)
  if (platform === 'website') return value
  const segment = encodeURIComponent(value)
  switch (platform) {
    case 'instagram':
      return `https://instagram.com/${segment}`
    case 'x':
      return `https://x.com/${segment}`
    case 'reddit':
      return `https://reddit.com/user/${segment}`
    case 'youtube':
      return `https://youtube.com/@${segment}`
    case 'tiktok':
      return `https://tiktok.com/@${segment}`
    case 'facebook':
      return `https://facebook.com/${segment}`
    case 'github':
      return `https://github.com/${segment}`
  }
}

/**
 * What the reader sees, which is not the address. A row of full URLs is a row of
 * noise; `@handle` is how every one of these platforms names a person, and for a
 * website the host is the part that says where you are being sent — which is the
 * half of a link that matters when the other half was typed by a stranger.
 */
export function linkLabel(platform: LinkPlatform, handle: string): string {
  const value = normaliseLinkHandle(platform, handle)
  if (platform !== 'website') return `@${value}`
  const host = /^https:\/\/([^/?#]+)/i.exec(value)?.[1]
  return (host ?? value).replace(/^www\./i, '')
}

/**
 * D70 — the age is derived and the year is stored.
 *
 * A stored age is right today and wrong on a birthday, which is D59's rule (*a
 * field is measured or it is not written*) pointed at a person rather than at a
 * watch. What a year alone supports is **the age they reach this year**, and
 * that is what this returns: it is off by up to one for somebody before their
 * birthday, and closing that gap means holding a full date of birth — more
 * personal data for a more precise answer to a question nobody asked precisely.
 *
 * Returns `null` for absent, for a year in the future and for anything before
 * 1900, matching 0005's constraint and its trigger. Unknown renders as itself.
 */
export function ageFromBirthYear(birthYear: number | null | undefined, now: Date): number | null {
  if (birthYear === null || birthYear === undefined) return null
  if (!Number.isInteger(birthYear) || birthYear < 1900) return null
  const age = now.getFullYear() - birthYear
  if (age < 0) return null
  return age
}

export const ABOUT_MAX = 500
export const LOCATION_MAX = 60
export const BIRTH_YEAR_MIN = 1900

/**
 * S5 — the bounds are the database's and these are the form's copy of them. The
 * one that is not a length is the year, and it is the one worth stating: a value
 * this rejects is a value 0005's trigger would raise on, so the form refusing it
 * is the difference between a hint and a failed save.
 */
export function isValidBirthYear(year: number | null, now: Date): boolean {
  if (year === null) return true
  return Number.isInteger(year) && year >= BIRTH_YEAR_MIN && year <= now.getFullYear()
}

export function isValidAbout(about: string): boolean {
  return about.length <= ABOUT_MAX
}

export function isValidLocation(location: string): boolean {
  return location.length <= LOCATION_MAX
}

/**
 * The trim-to-null every optional text field on this row shares. An empty string
 * and an absent value must not be two ways of having nothing: `about` is
 * rendered only when it is present, and an empty string would render a blank
 * paragraph where the design says render nothing at all.
 */
export function emptyToNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}
