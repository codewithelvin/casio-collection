// Casio's OWN product page, fetched from the Internet Archive — the answer to
// O12 and the reason Sheen and Oceanus stopped being empty.
//
//   node archive.ts <line> <REF>     one page: its spec rows and its image
//   node archive.ts <line> --tags    the DOM shape of the spec block (diagnostic)
//   node archive.ts <line> --all     every archived reference, as JSON
//
// WHY THIS EXISTS. D44 routed around casio.com's 403 by reading the module's
// operation guide for fields and a roster for identity. That route has two
// costs: the guide describes a **module**, so `case`, `water_resistance_m` and
// `colorway` can never be written from it (D25 and sources.md), and a line whose
// series have no known module — Sheen, Oceanus — cannot be seeded at all.
//
// The product page has every one of those fields and states them about the
// **reference**. It answers 403 live. It answers **200 from the archive**, and
// what comes back is Casio's own HTML: the same AEM markup, the same
// Specifications accordion, and the same `/content/dam/` image URLs, which are
// still served live at 200 by casio.com today.
//
// So this is not a new source. It is Casio's page, retrieved somewhere else,
// and §10.6's one-page rule holds harder here than anywhere: every field on a
// model seeded this way, and its photograph, come from the single page named in
// `source.url`.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CACHE = join(tmpdir(), 'casio-catalog-cache', 'archive')
mkdirSync(CACHE, { recursive: true })

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * How long to leave between requests once one has succeeded. The archive is a
 * charity serving a copy of somebody else's website for free; 162 references is
 * not an emergency.
 */
const PACE_MS = 5_000

/**
 * The archive's playback endpoint answers **503 under load**, and it does it
 * often enough that a script without backoff reports "not archived" for a page
 * that is. That is the same shape of lie as casiofanmag's 301 (sources.md): a
 * transport failure wearing the costume of an empty result.
 *
 * The backoff is in **tens of seconds, not seconds**, and that was measured
 * rather than chosen: after a burst of fast requests, ten consecutive fetches
 * three seconds apart returned ten 503s, and every playback mode — `id_`, plain,
 * `if_`, http — was blocked together while the CDX index kept answering 200. So
 * this is a per-IP cooldown on one service and not a page that has gone away,
 * and the only thing that clears it is waiting. A tight retry loop makes it
 * worse and then reports the line as unarchived.
 */
async function fetchText(url: string, tries = 4): Promise<string | null> {
  const backoff = [30_000, 60_000, 120_000, 240_000]
  for (let attempt = 0; attempt < tries; attempt++) {
    const res = await fetch(url, { headers: { 'user-agent': UA } }).catch(() => null)
    if (res?.status === 200) {
      const body = await res.text()
      await wait(PACE_MS)
      return body
    }
    if (res && res.status !== 503 && res.status !== 429) return null
    if (attempt < tries - 1) await wait(backoff[attempt])
  }
  return null
}

/**
 * Everything downloaded is cached outside the repo — it is large, and it is not
 * source.
 *
 * **Only successes are cached.** Writing an empty file for a page that 503'd
 * would turn a transport failure into a permanent "this reference has no
 * archived page", which is the same lie the backoff above exists to prevent —
 * and a cached lie survives the retry that would have fixed it.
 */
async function cached(key: string, url: string): Promise<string | null> {
  const file = join(CACHE, key)
  if (existsSync(file)) return readFileSync(file, 'utf8')
  const body = await fetchText(url)
  if (body !== null) writeFileSync(file, body)
  return body
}

export interface Snapshot {
  ref: string
  /** The archived URL — this is what goes in `source.url`, because it answers. */
  url: string
  /** The live casio.com URL it is a copy of, for `official_url` if it ever answers. */
  original: string
  timestamp: string
}

/**
 * Which references Casio published a page for, per line, from the CDX index.
 *
 * `collapse=urlkey` keeps one row per URL and `filter=statuscode:200` drops the
 * redirects and the 404s the archive also stores.
 *
 * Every capture of a reference is kept, largest first, because **size is not
 * richness**. OCW-S400-2A's biggest capture is 53 KB and states exactly one
 * specification; a 33 KB capture of the reference beside it states eleven. The
 * larger file is the newer template, which carries more chrome and fewer
 * server-rendered rows. `read()` below settles it by parsing rather than by
 * guessing which year to prefer.
 */
export async function snapshots(line: string): Promise<Map<string, Snapshot[]>> {
  const sized = new Map<string, (Snapshot & { length: number })[]>()
  for (const locale of ['us', 'intl', 'de', 'uk', 'europe', 'asia', 'sg', 'in']) {
    const query = `www.casio.com/${locale}/watches/${line}/product.*`
    const url =
      `http://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(query)}` +
      `&output=json&filter=statuscode:200&collapse=urlkey&fl=original,timestamp,length&limit=4000`
    // Casio files some lines under a nested path — `gshock/lifestyle`,
    // `casio/vintage` — and a slash is a directory separator, not a filename.
    const body = await cached(`cdx-${line.replace(/\//g, '-')}-${locale}.json`, url)
    if (!body || !body.trim()) continue
    for (const [original, timestamp, length] of JSON.parse(body).slice(1) as string[][]) {
      const match = /product\.([^/]+)\/?$/.exec(original)
      if (!match) continue
      const ref = match[1].toUpperCase()
      if (!sized.has(ref)) sized.set(ref, [])
      sized.get(ref)!.push({
        ref,
        length: Number(length),
        timestamp,
        original,
        url: `https://web.archive.org/web/${timestamp}id_/${original}`,
      })
    }
  }
  return new Map(
    [...sized].map(([ref, list]) => [
      ref,
      // Four is a bound on politeness, not on correctness: a reference captured
      // in eight locales does not need eight requests to the archive to be read.
      list.sort((a, b) => b.length - a.length).slice(0, 4),
    ]),
  )
}

/** A specification table worth the name. Below this the page is reported, not read. */
export const ENOUGH_ROWS = 4

export interface Reading {
  snapshot: Snapshot
  rows: Map<string, string>
  image: string | null
}

export type ReadResult =
  | { ok: true; reading: Reading }
  /** Fetched, and Casio's page genuinely states nothing. D46 — report and move on. */
  | { ok: false; why: 'silent' }
  /** Never fetched. Says nothing about the page, only about the archive today. */
  | { ok: false; why: 'unreachable' }

/**
 * The best reading of a reference across its captures.
 *
 * Stops at the first capture carrying a real table, and otherwise keeps the
 * richest of the ones it managed to fetch.
 *
 * **The two ways of failing are kept apart, and that is the point of this
 * function.** A page that came back empty is D46 — Casio states nothing, so
 * there is nothing to seed. A page that never came back is the archive's
 * cooldown, and says nothing whatever about the page. Collapsing them into one
 * `null` is precisely the failure `sources.md` records for casiofanmag's 301:
 * a transport failure wearing the costume of an empty result, which then gets
 * written down as "no source exists" and believed by the next session.
 */
export async function read(candidates: readonly Snapshot[]): Promise<ReadResult> {
  let best: Reading | null = null
  let fetched = 0
  for (const snapshot of candidates) {
    const html = await page(snapshot)
    if (!html) continue
    fetched += 1
    const rows = specRows(html)
    const reading = { snapshot, rows, image: imageUrl(html, snapshot.ref) }
    if (!best || rows.size > best.rows.size) best = reading
    if (rows.size >= ENOUGH_ROWS) break
  }
  if (best && best.rows.size > 0) return { ok: true, reading: best }
  return { ok: false, why: fetched === 0 ? 'unreachable' : 'silent' }
}

/**
 * The page itself.
 *
 * Two playback modes are tried, and the order matters. `…/<ts>id_/<url>` returns
 * the **original bytes** — no rewritten links, no injected toolbar — which is
 * what a parser wants, but it is also the more heavily throttled of the two and
 * exhausts its retries on pages the archive will happily serve the other way.
 * The fallback is normal playback, whose only difference here is a banner and
 * rewritten `src` attributes; `imageUrl()` strips the host back off, so a DAM
 * path survives both forms identically.
 */
export async function page(snapshot: Snapshot): Promise<string | null> {
  const key = `page-${snapshot.ref}-${snapshot.timestamp}.html`
  const raw = await cached(key, snapshot.url)
  if (raw) return raw
  return await cached(
    key,
    `https://web.archive.org/web/${snapshot.timestamp}/${snapshot.original}`,
  )
}

/* ------------------------------------------------------------------------- *
 * Reading the page
 * ------------------------------------------------------------------------- */

const decode = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * The specifications accordion only — the page repeats these words elsewhere,
 * and the Model Comparison table below it is about *other* references entirely.
 *
 * The bounds are the accordion's own container and the `-spec-related` block AEM
 * closes it with. They are **bounds, not finds**: an earlier attempt ended the
 * block at the next `p-product_detail-` class and cut it to 42 bytes, because
 * the very next element inside the section is `p-product_detail-hdg-lv2` — the
 * section's own heading. A bound that can land inside what it is bounding is not
 * a bound.
 */
function specBlock(html: string): string {
  const start = html.indexOf('p-product_detail-spec-accordion')
  if (start < 0) return ''
  const rest = html.slice(start, start + 80000)
  const end = rest.indexOf('p-product_detail-spec-related')
  return end > 0 ? rest.slice(0, end) : rest
}

/**
 * The label → value rows of the Specifications accordion.
 *
 * AEM renders each row as a `panel-item` holding an `…-item-ttl` and an
 * `…-item-cont`. Reading that pair rather than flattening the block to
 * alternating lines is the difference between a value that survives and one that
 * does not: `Other features` holds two paragraphs and a `<br>`, and an
 * alternating reader hands its second line to the next label.
 *
 * **There are two generations of this markup and they differ by one tag.** The
 * captures from 2024 wrap the label in `<h4>`; the ones from 2022 wrap it in a
 * bare `<div>`. A reader written against either returns *zero rows* on the
 * other — not a parse error, not a short table, nothing at all, which reads
 * exactly like a page that states no specifications and would have quietly
 * written off 144 Sheen references as unseedable. So the label is whatever text
 * sits between the two class names, with tags stripped, and neither tag is named.
 *
 * The accordion's own section titles — *Basic Information*, *Exterior*, *Watch
 * Features* — are deliberately not returned. They group rows for a reader and
 * carry no value of their own, and Casio does not file the same row under the
 * same heading on every page.
 */
export function specRows(html: string): Map<string, string> {
  const block = specBlock(html)
  const rows = new Map<string, string>()
  const item = /panel-item-ttl[^>]*>([\s\S]*?)panel-item-cont[^>]*>([\s\S]*?)<\/div>/g
  for (const [, title, cont] of block.matchAll(item)) {
    const label = decode(
      title
        // The capture runs up to the *class name* of the value element, so it
        // ends mid-tag — `<div class="p-product_detail-…`. That fragment has no
        // closing bracket, so the tag stripper below leaves it in the label.
        .replace(/<[^>]*$/, '')
        .replace(/<[^>]+>/g, ' '),
    )
    const value = decode(cont.replace(/<br\s*\/?>/gi, ' · ').replace(/<[^>]+>/g, ' '))
    if (label && value) rows.set(label, value)
  }
  return rows
}

/**
 * The photograph Casio publishes of this reference, as the page names it.
 *
 * D41's rule is that a file whose page does not name it is not published, so
 * this reads the `src` rather than deriving it from the reference — the two
 * differ often enough to matter (`_Seq1.png` against `.jpg`, and a handful of
 * references whose asset folder is spelled in lower case).
 *
 * `main-visual` is the product shot. The `color-variation` URLs on the same page
 * are the *other* references in the series and belong to those models, not this
 * one — taking the first image on the page would silently publish a photograph
 * of a different watch.
 */
export function imageUrl(html: string, ref: string, others?: ReadonlySet<string>): string | null {
  const wanted = ref.toUpperCase()
  const candidates = [
    ...new Set(
      [...html.matchAll(/\/content\/dam\/casio\/product-info\/[^"'\s)\\]+/g)].map((m) => m[0]),
    ),
  ]
  /** `…/assets/SHE-4539CM-4AU_Seq1.png` → `SHE-4539CM-4AU`. */
  const stemOf = (u: string) => {
    const asset = /\/assets\/([^/]+?)(?:_Seq\d+)?\.(?:png|jpg|jpeg)/i.exec(u)
    return asset ? asset[1].toUpperCase() : null
  }

  /** `DW-5600THC-1_L` → `DW-5600THC-1`. The part before any underscore. */
  const headOf = (stem: string) => stem.split('_')[0]

  /**
   * A second reference in the filename means a second watch in the picture.
   *
   * The underscore itself is innocent — `DW-5600THC-1_l.png` and
   * `DW-5600BBM-1_01.png` are this watch, at another size and from another
   * angle. What is not innocent is `SHE-4539CM-4A_SHE-4540CM-3A.jpg`, which is a
   * photograph of **two** watches and would go under one of them.
   */
  const sharesTheFrame = (stem: string) =>
    stem
      .split('_')
      .slice(1)
      .some((part) => others?.has(part) || /^[A-Z]{2,}-[A-Z0-9-]*\d/.test(part))
  /**
   * **A prefix match is right most of the time and catastrophic the rest.**
   * Casio names the asset for `SHE-4539CM-4A` as `SHE-4539CM-4AU`, so an exact
   * match alone loses 83 of Sheen's 141 photographs. But `GA-2100-1A` is also a
   * prefix of `GA-2100-1A1`, which is **a different watch in this catalogue** —
   * and its `color-variation` URL sits on the same page. Taking it would publish
   * a photograph of the wrong watch under the right reference, and nothing would
   * go red.
   *
   * So `others` is the set of references known to exist — the catalogue's and the
   * archive's roster — and a stem that extends `ref` into one of them is that
   * watch's photograph, not this one's. Optional, and absent it behaves exactly
   * as before, which is what keeps the reviewed Sheen and Oceanus files
   * reproducible.
   */
  const mine = candidates
    .filter((u) => {
      const stem = stemOf(u)
      if (!stem || sharesTheFrame(stem)) return false
      const head = headOf(stem)
      if (head === wanted) return true
      if (!head.startsWith(wanted)) return false
      // Casio's own asset suffix is a letter or two — `SHE-4539CM-4A` is
      // published as `SHE-4539CM-4AU`, and refusing that costs 83 of Sheen's
      // 141 photographs. A **digit** is not a suffix, it is another reference:
      // `GA-2100-1A` extends to `GA-2100-1A1`, a different watch in this
      // catalogue whose photograph sits on the same page.
      const extra = head.slice(wanted.length)
      if (!/^[A-Z]{1,3}$/.test(extra)) return false
      return !others?.has(head)
    })
  // **Page order is kept, and ranking by anything else makes it worse.** Sorting
  // an exact stem ahead of an extended one sounds safer and is not: Casio's main
  // product shot is `<REF>U.png` on some templates, and the exactly-named files
  // beside it are `_front`, `_square`, `_model-cut` and `_beautycut` — crops and
  // a photograph of somebody's wrist. The main visual comes first in the markup,
  // which is the only signal that actually tracks what is wanted.
  // The untransformed asset is the original; a `.transform/…` URL is a rendition
  // capped at the width its CSS breakpoint wanted.
  const original = mine.find((u) => !u.includes('.transform/') && /_Seq1\./i.test(u))
  const chosen = original ?? mine.find((u) => !u.includes('.transform/')) ?? mine[0]
  return chosen ? `https://www.casio.com${chosen.replace(/^https?:\/\/[^/]+/, '')}` : null
}

/* ------------------------------------------------------------------------- *
 * CLI
 * ------------------------------------------------------------------------- */

const isMain = process.argv[1]?.endsWith('archive.ts') ?? false
if (isMain) {
  const [line, arg] = process.argv.slice(2)
  if (!line) {
    console.error('usage: archive.ts <line> [<REF> | --tags | --all]')
    process.exit(1)
  }
  const found = await snapshots(line)
  console.log(`# ${line}: ${found.size} archived product pages`)

  if (!arg) {
    for (const ref of [...found.keys()].sort()) console.log(ref)
  } else if (arg === '--tags') {
    const first = [...found.values()][0][0]
    const html = (await page(first)) ?? ''
    const block = specBlock(html)
    const tags = new Map<string, number>()
    for (const [, tag] of block.matchAll(/<([a-z]+[0-9]?)[\s>]/g))
      tags.set(tag, (tags.get(tag) ?? 0) + 1)
    console.log(`${first.ref} — spec block ${block.length} bytes`)
    console.log([...tags].sort((a, b) => b[1] - a[1]).map(([t, n]) => `  ${t} ${n}`).join('\n'))
    console.log(block.slice(0, 2500))
  } else if (arg === '--all') {
    const out: unknown[] = []
    let silent = 0
    let unreachable = 0
    let dry = 0
    for (const [ref, candidates] of found) {
      const result = await read(candidates)
      if (!result.ok) {
        if (result.why === 'silent') {
          silent += 1
          dry = 0
          console.error(`  ${ref}: Casio's page states no specification (D46)`)
          continue
        }
        unreachable += 1
        console.error(`  ${ref}: unreachable — the archive did not serve any capture`)
        // Consecutive *unreachable* references are the cooldown, not the
        // catalogue. Without this the run spends hours proving the same thing
        // 152 times and finishes by reporting a whole line as unarchived.
        if ((dry += 1) >= 5) {
          console.error(`\nSTOPPING: ${dry} references in a row could not be fetched.`)
          console.error(`That is the archive's per-IP cooldown, not an absent page.`)
          console.error(`Everything fetched so far is cached; run this again later.`)
          break
        }
        continue
      }
      dry = 0
      const { reading } = result
      console.error(`  ${ref}: ${reading.rows.size} rows${reading.image ? ' + image' : ''}`)
      out.push({
        ...reading.snapshot,
        rows: reading.rows.size,
        specs: Object.fromEntries(reading.rows),
        image: reading.image,
      })
    }
    writeFileSync(join(CACHE, `${line}.json`), JSON.stringify(out, null, 2))
    console.log(
      `${out.length} readable, ${silent} state nothing, ${unreachable} not served → ` +
        join(CACHE, `${line}.json`),
    )
  } else {
    const candidates = found.get(arg.toUpperCase())
    if (!candidates) {
      console.error(`${arg} has no archived page`)
      process.exit(1)
    }
    const result = await read(candidates)
    if (!result.ok) {
      console.error(
        result.why === 'silent'
          ? `${arg}: no capture of this page states a specification (D46)`
          : `${arg}: the archive served none of its ${candidates.length} captures — try later`,
      )
      process.exit(1)
    }
    const { reading } = result
    console.log(reading.snapshot.url)
    for (const [label, value] of reading.rows) console.log(`  ${label.padEnd(32)} ${value}`)
    console.log(`  ${'IMAGE'.padEnd(32)} ${reading.image ?? '—'}`)
  }
}
