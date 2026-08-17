// The join: Casio's own roster (which references exist, per series) against the
// community series→module table (which guide states the fields). A series needs
// both to be seedable, and this prints them ranked by how many references each
// one would bring in.
//
//   node candidates.ts edifice:edifice protrek:protrek oceanus:oceanus …
//     <sitemap line>:<casiofanmag line>
import { roster, seriesOf } from './sitemap.ts'
import { seriesModules } from './modules.ts'

const r = roster()
for (const pair of process.argv.slice(2)) {
  const [smLine, cfmLine] = pair.split(':')
  const refs = [...(r.get(smLine) ?? [])].sort()
  const mods = await seriesModules(cfmLine)

  const bySeries = new Map<string, string[]>()
  for (const ref of refs) {
    const s = seriesOf(ref)
    if (!bySeries.has(s)) bySeries.set(s, [])
    bySeries.get(s)!.push(ref)
  }

  const withModule = [...bySeries].filter(([s]) => mods.has(s))
  const without = [...bySeries].filter(([s]) => !mods.has(s))
  const covered = withModule.reduce((n, [, l]) => n + l.length, 0)
  console.log(
    `\n##### ${smLine} — ${refs.length} references in ${bySeries.size} series;` +
      ` ${withModule.length} series have a known module (${covered} references)`,
  )
  for (const [s, list] of withModule.sort((a, b) => b[1].length - a[1].length).slice(0, 14))
    console.log(`  ${s.padEnd(14)} ${String(list.length).padStart(3)} refs  module ${mods.get(s)!.join('/')}`)
  const lost = without.reduce((n, [, l]) => n + l.length, 0)
  console.log(`  … and ${without.length} series with no module in the table (${lost} references)`)
}
