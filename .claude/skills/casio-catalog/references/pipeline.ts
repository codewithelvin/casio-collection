// Run a seeding campaign with the two hosts overlapped.
//
//   node pipeline.ts photos <line>...              backfill photographs on seeded lines
//   node pipeline.ts series <line>:<series>...     seed new or existing series
//
// WHY THIS EXISTS. A campaign is two jobs against two different hosts:
//
//   * the **archive** (`web.archive.org`) serves the product pages, at one
//     request per five seconds with 30–240 s backoffs when it pushes back;
//   * **casio.com** serves the photograph files those pages name, at one every
//     half second.
//
// Run one after the other and the second host sits idle while the first works,
// and vice versa. Measured on the 2026-08-19 campaign: 160 minutes of crawling,
// of which 67 was the mandated pace alone, with every download waiting its turn
// behind a crawl that had nothing to do with it.
//
// **What is NOT parallelised, and this is the whole design.** Only one job ever
// talks to the archive. Its limit is per-IP, so two crawls at once do not go
// twice as fast — they trip the same cooldown and both stall, which is the
// failure `sources.md` records as making a whole line look unarchived. The
// overlap here is strictly *across hosts*: the archive crawls unit N+1 while
// casio.com downloads unit N's photographs.
//
// At most one job per host is in flight at any moment. That is a deliberate
// ceiling, not an implementation limit.
import { spawn } from 'node:child_process'
import { join } from 'node:path'

const HERE = import.meta.dirname

/** One child process, resolved when it exits. Its output passes straight through. */
function run(script: string, args: string[], label: string): Promise<number> {
  return new Promise((resolve) => {
    const started = new Date().toISOString().slice(11, 19)
    console.log(`\n=== ${started}  ${label}`)
    const child = spawn(process.execPath, [join(HERE, script), ...args], {
      stdio: 'inherit',
      cwd: HERE,
    })
    child.on('close', (code) => resolve(code ?? 1))
  })
}

const [mode, ...units] = process.argv.slice(2)
if (!['photos', 'series'].includes(mode ?? '') || units.length === 0) {
  console.error('usage: pipeline.ts photos <line>...')
  console.error('       pipeline.ts series <line>:<series>...')
  process.exit(1)
}

/**
 * The archive stage for a unit: everything that has to queue behind the
 * five-second pace. Returns the arguments for its download stage, or null when
 * there is nothing to download.
 */
async function archiveStage(unit: string): Promise<string[] | null> {
  if (mode === 'photos') {
    const status = await run('backfill-photos.ts', [unit, '--crawl'], `${unit} crawl`)
    // Exit 2 is the circuit breaker — the cooldown, not the catalogue. What was
    // fetched is cached and listed, so the download stage still has work.
    if (status !== 0 && status !== 2) return null
    return [unit]
  }
  const [line, series] = unit.split(':')
  if (!line || !series) {
    console.error(`  skipping "${unit}": expected <line>:<series>`)
    return null
  }
  const crawled = await run('seed-into.ts', [line, series, '--crawl'], `${line}/${series} crawl`)
  if (crawled !== 0) return null
  // `--write` reads the cache and never fetches, so it belongs on this side of
  // the pipeline: it is fast, and the download stage needs the list it writes.
  const written = await run('seed-into.ts', [line, series, '--write'], `${line}/${series} write`)
  if (written !== 0) return null
  return [line, `${line}-${series}`]
}

let downloading: Promise<number> = Promise.resolve(0)

for (const unit of units) {
  const next = await archiveStage(unit)

  // Wait for the previous download only now, so it has been running underneath
  // the crawl above rather than blocking it. This is the entire saving, and it
  // also caps casio.com at one job.
  await downloading

  if (next) downloading = run('photos.ts', next, `${unit} photographs`)
}

await downloading
console.log(`\nPIPELINE DONE ${new Date().toISOString()}`)
console.log(`Next: npm run catalog:images && npm run catalog:build && npm run catalog:validate`)
