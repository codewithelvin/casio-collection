// Casio's OWN sitemap is the roster for every line — the answer to O11.
//
//   node sitemap.ts              refresh the local copies and summarise
//   node sitemap.ts <line>       print the references for one sitemap line
//
// casio.com's product PAGES answer 403, but `casio.com/<loc>/sitemap.xml`
// answers 200 and lists every product URL, and the reference is in the path:
// `https://www.casio.com/us/watches/edifice/product.EFR-527D-1AV/`.
//
// That makes the roster **official** — Casio saying which references exist —
// where G-SHOCK's roster is a community index saying the same thing. It is still
// provenance for a model's IDENTITY only. It states no specifications, so every
// field still comes from the module guide (D44).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Downloads are cached OUTSIDE the repo — they are large and they are not source. */
const CACHE = join(tmpdir(), 'casio-catalog-cache')
mkdirSync(CACHE, { recursive: true })

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const LOCALES = ['us', 'intl', 'de']

export async function refresh(): Promise<void> {
  for (const loc of LOCALES) {
    const f = join(CACHE, `sm-${loc}.xml`)
    if (existsSync(f)) continue
    const res = await fetch(`https://www.casio.com/${loc}/sitemap.xml`, {
      headers: { 'user-agent': UA },
    })
    if (!res.ok) throw new Error(`${loc} → HTTP ${res.status}`)
    writeFileSync(f, await res.text())
  }
}

/** sitemap line path → the reference set Casio lists under it, deduped. */
export function roster(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  for (const loc of LOCALES) {
    const f = join(CACHE, `sm-${loc}.xml`)
    if (!existsSync(f)) continue
    for (const [, url] of readFileSync(f, 'utf8').matchAll(/<loc>([^<]*)<\/loc>/g)) {
      const m = /\/watches\/([a-z/-]+)\/product\.([^/]+)\/?$/.exec(url)
      if (!m) continue
      const [, line, ref] = m
      if (!out.has(line)) out.set(line, new Set())
      out.get(line)!.add(ref)
    }
  }
  return out
}

/** The series a reference belongs to: its prefix, mechanically (D32). */
export function seriesOf(ref: string): string {
  // EFR-527D-1AV → efr-527 ; GA-2100-1A1 → ga-2100 ; A168WA-1 → a168
  const m = /^([A-Z]+(?:-[A-Z]+)?-?\d{2,5})/.exec(ref)
  return (m ? m[1] : ref).toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

// Only act as a CLI when run directly — importing this file must not execute it.
const isMain = process.argv[1]?.endsWith("sitemap.ts") ?? false
const arg = process.argv[2]
if (isMain) {
await refresh()
const r = roster()
if (!arg) {
  for (const [line, refs] of [...r].sort((a, b) => b[1].size - a[1].size))
    console.log(`${line.padEnd(20)} ${refs.size} references`)
} else {
  const refs = [...(r.get(arg) ?? [])].sort()
  const bySeries = new Map<string, string[]>()
  for (const ref of refs) {
    const s = seriesOf(ref)
    if (!bySeries.has(s)) bySeries.set(s, [])
    bySeries.get(s)!.push(ref)
  }
  console.log(`# ${arg} — ${refs.length} references in ${bySeries.size} series`)
  for (const [s, list] of [...bySeries].sort((a, b) => b[1].length - a[1].length))
    console.log(`${s.padEnd(16)} ${String(list.length).padStart(3)}  ${list.slice(0, 4).join(' ')}`)
}

}
