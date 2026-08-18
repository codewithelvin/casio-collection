// Fetch the photographs `seed.ts` listed, into `catalog-src/images/raw/`.
//
//   node photos.ts <line>
//
// The URLs come from the archived product page (D52) and the **files come from
// casio.com**, live, at 200 — that is the whole shape of O12's answer. D41 is met
// because the page named the file: nothing here derives a URL from a reference,
// it only fetches a URL that was read.
//
// The raw files are not committed. `npm run catalog:images` normalises them to
// 400 px and 800 px WebP under §10.3's budgets, and that output is.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import { allowed } from './robots.ts'

const CACHE = join(tmpdir(), 'casio-catalog-cache', 'archive')
const RAW = join(import.meta.dirname, '..', '..', '..', '..', 'catalog-src', 'images', 'raw')

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

const line = process.argv[2]
if (!line) {
  console.error('usage: photos.ts <line>')
  process.exit(1)
}

/**
 * Which list to fetch. Defaults to the line's own, so every existing call is
 * unchanged; `seed-into.ts` writes a per-series list and passes its name, because
 * adding 24 A168 photographs must not overwrite the vintage line's list.
 */
const listKey = process.argv[3] ?? line

const list = join(CACHE, `${listKey}-images.tsv`)
if (!existsSync(list)) {
  console.error(`No ${list}. Run: node seed.ts ${line} --write`)
  process.exit(1)
}

mkdirSync(RAW, { recursive: true })

/**
 * Which URL each raw file was actually fetched from.
 *
 * **The filename is not enough to decide whether a file is current**, because
 * Casio publishes a *different* copy of the same asset under each locale — the
 * `intl`, `sg` and `in` copies of `SHE-3048PGL-7B_Seq1.png` have three different
 * SHA-256s, and two different byte lengths. So when `seed.ts` changes which
 * capture a reference is credited to, the photograph on disk can quietly stop
 * being the one the credit page names, which is precisely the claim D41 makes.
 * Skipping on "a file with that name exists" would preserve the mismatch
 * forever.
 */
const manifestPath = join(CACHE, `photos-${listKey}.json`)
const manifest: Record<string, string> = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, 'utf8'))
  : {}

let written = 0
let already = 0
const refused: string[] = []

for (const row of readFileSync(list, 'utf8').split('\n').filter(Boolean)) {
  const [id, url] = row.split('\t')
  // The extension is the one Casio published the file under. `catalog:images`
  // reads the format from the bytes, but it picks the model id off the
  // **filename**, so the stem has to be exactly the id and nothing else.
  const extension = extname(new URL(url).pathname).toLowerCase() || '.png'
  const target = join(RAW, `${id}${extension}`)
  if (existsSync(target) && manifest[id] === url) {
    already += 1
    continue
  }

  if (!(await allowed(url))) {
    refused.push(`${id}: robots.txt disallows ${url}`)
    continue
  }
  const res = await fetch(url, { headers: { 'user-agent': UA } }).catch(() => null)
  if (!res || res.status !== 200) {
    refused.push(`${id}: HTTP ${res?.status ?? 'no response'}`)
    continue
  }
  const body = Buffer.from(await res.arrayBuffer())
  // A 403 or a location picker comes back as HTML with a 200 in front of it —
  // the same "a 200 that means no" this project has already been caught by once
  // (sources.md, the AEM location picker). A PNG starts with its own signature.
  const looksLikeImage =
    body.subarray(0, 4).toString('hex') === '89504e47' || body.subarray(0, 3).toString('hex') === 'ffd8ff'
  if (!looksLikeImage) {
    refused.push(`${id}: 200 but the bytes are not an image (${body.length} bytes)`)
    continue
  }
  writeFileSync(target, body)
  manifest[id] = url
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  written += 1
  console.log(`  ${id}${extension}  ${(body.length / 1024).toFixed(0)} KB`)
  await wait(500)
}

console.log(`\n${written} fetched, ${already} already there`)
if (refused.length > 0) {
  console.error(`\n${refused.length} refused:`)
  for (const line of refused) console.error(`  ${line}`)
}
console.log(`\nNext: npm run catalog:images`)
