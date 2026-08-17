// The roster for a G-SHOCK series: which references exist, and which module
// each one is on.
//
//   node roster.ts modules 6900        which modules the 6900 series uses
//   node roster.ts refs 1289 DW-6900   every DW-6900 reference on module 1289
//
// TWO PAGES, AND THEY ARE NOT INTERCHANGEABLE. The series page groups by
// subseries and states each group's module, but lists only a SAMPLE of each —
// its "(157 in total)" heading sits above sixteen entries. The module page lists
// the whole roster. So: series page to discover the modules, module page for the
// references, filtered to the prefix.
//
// THE FILTER MATTERS. The lists mix references with collaboration NICKNAMES —
// DW-6900-Tommy, DW-6900FS-Bape-2007, DW-6900-Space-Invaders. Those are real
// watches and they are not references, and a nickname written as a `ref` would
// publish a permanent id (D2) that no Casio document supports. The
// discriminator: a reference's last hyphen group begins with a digit.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

/**
 * A reference in the shape Casio actually prints: prefix letters, the model
 * number, a variant block of at most four letters, and one suffix — digits, at
 * most one letter, at most one more digit. That covers -1, -1G, -02 and the
 * newer -1A1 / -7A2 style.
 *
 * WHAT THIS EXCLUDES, AND WHY IT IS NOT SQUEAMISHNESS. ShockBase lists
 * collaborations under strings that are community constructions rather than
 * references: DW-5600MW-7INSA is really DW-5600MW-7 with a collaborator's name
 * appended, DW-5600-BAIT20-7 carries a doubled hyphen no Casio document has, and
 * DW-5600-Space-Invaders is a nickname. Under D2 an id is permanent, and the
 * sourcing rule is explicit that where sources disagree on the reference itself
 * the model is not written at all. So these are reported, never seeded.
 *
 * The rule is not invented here — it is the one the reviewed M2b commits used,
 * recovered by testing candidates against them. It reproduces all three exactly:
 * DW-5600 122 of 199, GW-M5610 27 of 29, GA-2100 77 of 90, with nothing kept
 * that was not committed and nothing dropped that was.
 */
export const CANONICAL_REF = /^[A-Z]{1,5}-?[A-Z]{0,2}\d{2,5}[A-Z]{0,4}-\d{1,2}[A-Z]?\d?$/

export const isReference = (token: string): boolean => CANONICAL_REF.test(token)

async function lines(url: string): Promise<string[]> {
  const res = await fetch(url, { headers: { 'user-agent': UA } })
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  // Only BLOCK ends may become newlines: "GA-2100 [5611] (77 in total)" is one
  // heading split across inline tags, and turning every tag into a newline
  // breaks it into three lines that match nothing.
  return (await res.text())
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<\/(tr|div|p|li|h[1-6]|table)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

/** Subseries prefix → module, from the series page's own headings. */
export async function seriesModules(series: string): Promise<{ prefix: string; module: string }[]> {
  const text = await lines(`https://shockbase.org/watches/series_dyn.php?series=${series}`)
  const from = text.findIndex((l) => l === 'Subseries')
  const to = text.findIndex((l) => /^Watches sorted by subseries/.test(l))
  if (from === -1 || to === -1) throw new Error(`series ${series}: no subseries block`)
  const out: { prefix: string; module: string }[] = []
  for (const line of text.slice(from + 1, to)) {
    const m = /^([A-Z][A-Z-]*\d+[A-Z]*)\s*\[(\w+)\]$/.exec(line)
    if (m) out.push({ prefix: m[1], module: m[2] })
  }
  return out
}

/**
 * Every reference on a module, from the page that says so in words: "These are
 * all watches with module 1289." That sentence is why the roster can stand as
 * provenance for a model's identity while every field still comes from Casio's
 * own guide.
 */
export async function moduleRoster(module: string, prefix?: string): Promise<string[]> {
  const text = await lines(`https://shockbase.org/watches/modules_dyn.php?module=${module}`)
  const from = text.findIndex((l) => /^These are all watches with module/.test(l))
  if (from === -1) throw new Error(`module ${module}: not the roster page`)
  const refs = new Set<string>()
  for (const line of text.slice(from + 1)) {
    const token = line.replace(/\[\w+\]\s*$/, '').trim()
    if (!isReference(token)) continue
    // A prefix must end at a boundary: DW-5600 must not collect DW-5610, and
    // GM-2100 must not collect GM-2110.
    if (prefix && !new RegExp(`^${prefix}(?![0-9])`).test(token)) continue
    refs.add(token)
  }
  return [...refs].sort()
}

const [cmd, arg, prefix] = process.argv.slice(2)
if (cmd === 'modules') {
  for (const { prefix: p, module } of await seriesModules(arg)) console.log(`${p}\t${module}`)
} else if (cmd === 'refs') {
  const refs = await moduleRoster(arg, prefix)
  console.log(`# module ${arg}${prefix ? `, prefix ${prefix}` : ''} — ${refs.length} references`)
  console.log(refs.join('\n'))
}
