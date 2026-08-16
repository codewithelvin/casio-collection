// D28 / NFR-3 — the initial-JavaScript budget, gzipped.
//
// 380 KB, and the decision is explicit that when this fails the answer is a
// named mitigation — narrower AntD imports, a lighter route, deferring the
// Supabase client — never a bigger number. Raising it costs a D-number, so at
// least the erosion is visible.
//
// "Initial" means what the browser must execute before the first route renders:
// the entry chunk and everything it statically imports. A lazily imported route
// chunk is not in the budget, which is the whole point of route splitting.
import { readFile, readdir } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const BUDGET_BYTES = 380 * 1024

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')

const html = await readFile(join(dist, 'index.html'), 'utf8')

// The entry is whatever index.html loads as a module; modulepreload marks the
// chunks it statically depends on. Together, that is the initial graph.
const entries = new Set()
for (const match of html.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/g)) {
  entries.add(match[1])
}
for (const match of html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)) {
  entries.add(match[1])
}

if (entries.size === 0) {
  console.error('bundle-budget: found no entry scripts in dist/index.html — refusing to pass')
  process.exit(1)
}

const assets = join(dist, 'assets')
const present = new Set(await readdir(assets).catch(() => []))

let total = 0
const rows = []
for (const href of entries) {
  const name = href.split('/').pop()
  if (!name || !present.has(name)) continue
  const bytes = gzipSync(await readFile(join(assets, name))).length
  total += bytes
  rows.push([name, bytes])
}

rows.sort((a, b) => b[1] - a[1])
for (const [name, bytes] of rows) {
  console.log(`  ${(bytes / 1024).toFixed(1).padStart(7)} KB  ${name}`)
}

const kb = (total / 1024).toFixed(1)
const budgetKb = (BUDGET_BYTES / 1024).toFixed(0)
console.log(`\nInitial JS, gzipped: ${kb} KB of ${budgetKb} KB (NFR-3, D28)`)

if (total > BUDGET_BYTES) {
  console.error(
    `\nOver budget by ${((total - BUDGET_BYTES) / 1024).toFixed(1)} KB.\n` +
      'D28: the answer is a named mitigation, not a larger number. Try narrower\n' +
      'AntD imports, a lighter route, or deferring the Supabase client.',
  )
  process.exit(1)
}
