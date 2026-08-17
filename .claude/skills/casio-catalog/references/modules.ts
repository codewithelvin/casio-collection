// series → module, for the lines ShockBase does not cover.
//
//   node modules.ts edifice protrek oceanus babyg sheen
//
// casiofanmag publishes a table per line: "Series | Module number | Manual".
// It is a community source and says so itself — "we are not affiliated with
// CASIO ... cannot guarantee that our data is 100% accurate" — so it is used the
// way ShockBase is: provenance for a model's IDENTITY (which module a series is
// on), never for its fields. Every field still comes from Casio's own guide.
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Downloads are cached OUTSIDE the repo — they are large and they are not source. */
const CACHE = join(tmpdir(), 'casio-catalog-cache')
mkdirSync(CACHE, { recursive: true })

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

export async function seriesModules(line: string): Promise<Map<string, string[]>> {
  const f = join(CACHE, `cfm-${line}.html`)
  if (!existsSync(f)) {
    const res = await fetch(`https://casiofanmag.com/getmanuals/${line}/`, {
      headers: { 'user-agent': UA },
    })
    if (!res.ok) throw new Error(`${line} → HTTP ${res.status}`)
    // A line with no table does not 404 — it **301s to the line's category page**,
    // which is a 200 holding no table at all. `res.ok` is true, the parse below
    // finds nothing, and the caller reports "0 series have a known module": a
    // sentence that reads as "no source exists" when it means "wrong URL shape".
    // Two sessions read it the first way. Say so instead.
    if (res.redirected && !new URL(res.url).pathname.startsWith('/getmanuals/'))
      console.warn(
        `!! ${line}: getmanuals/ redirected to ${res.url} — there is no table for this line.\n` +
          `   That category holds one post per series and its <title> names the module.\n` +
          `   Read references/sources.md before concluding the module is unknown.`,
      )
    writeFileSync(f, await res.text())
  }
  const rows = readFileSync(f, 'utf8')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<\/t[dh]>/gi, '\t')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .split('\n')

  const out = new Map<string, string[]>()
  for (const row of rows) {
    // "ECB-10 | ECB10 <tab> 5618 <tab> Link"
    const m = /^\s*([A-Z][A-Z0-9-]*\d[A-Z0-9]*)\s*(?:\|[^\t]*)?\t\s*([\d\s,/]+?)\s*\t/.exec(row)
    if (!m) continue
    const series = m[1].toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const mods = m[2].split(/[\s,/]+/).filter((x) => /^\d{3,4}$/.test(x))
    if (mods.length) out.set(series, mods)
  }
  return out
}

// Only act as a CLI when run directly.
if (process.argv[1]?.endsWith("modules.ts"))
for (const line of process.argv.slice(2)) {
  const m = await seriesModules(line)
  console.log(`\n##### ${line} — ${m.size} series with a module`)
  for (const [s, mods] of [...m].slice(0, 200)) console.log(`${s.padEnd(14)} ${mods.join(' ')}`)
}
