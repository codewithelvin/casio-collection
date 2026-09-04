/**
 * **`<lastmod>`, taken from the commit that last touched the source of the page.**
 *
 * The sitemap has always carried `<changefreq>monthly</changefreq>` and a
 * `<priority>`, and Google has been explicit for years that it reads neither.
 * `lastmod` is the one hint in the format it does use, to decide which of 3 500
 * URLs are worth recrawling — which for a catalogue that grows by a series at a
 * time is the difference between a new reference being found this week and
 * being found whenever the crawler comes back round.
 *
 * **The date has to be true or it is worse than absent.** Google's stated
 * behaviour is to stop trusting the field across the whole file once it catches
 * it lying, so the two easy implementations are both traps: stamping every URL
 * with the build time says all 3 500 pages changed every deploy, and stamping
 * them with a value a human maintains says whatever that human last remembered.
 * The commit date of the YAML that a page is generated from is neither — it is
 * the moment the content behind that URL actually changed, and it is already
 * recorded, exactly once, by the thing that recorded the change.
 *
 * The whole file therefore hinges on one question — is the git history here
 * complete? — and answers it by refusing to guess. A shallow clone is the
 * normal state of a CI checkout and it makes `git log` report the single commit
 * it fetched as the last change to every file in the repository. That is the
 * lie, in the exact form the crawler punishes. `fileDates` returns null in that
 * case and the sitemap goes out with no `lastmod` at all, which costs a hint
 * and keeps the file honest.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

/** An ISO 8601 timestamp with an offset, which is what `%cI` prints. */
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/

/**
 * Fold `git log --pretty=format:%cI --name-only` into path → newest commit date.
 *
 * The log arrives newest first, so **the first date seen for a path is the
 * answer** and every later one is history. Merge commits list no files, which
 * is the behaviour wanted rather than a limitation to work around: a merge did
 * not change the file, the commit it merged did.
 *
 * Separated from the process call so it can be tested against a fixture instead
 * of against whatever this repository's history happens to look like today.
 */
export function parseGitLog(output: string): Map<string, string> {
  const dates = new Map<string, string>()
  let commit: string | undefined

  for (const line of output.split('\n')) {
    const path = line.trim()
    if (path === '') continue
    if (ISO.test(path)) {
      commit = path
      continue
    }
    // A path before any date means the output is not the shape this expects —
    // skip it rather than attributing it to the wrong commit.
    if (commit && !dates.has(path)) dates.set(path, commit)
  }

  return dates
}

/**
 * The commit date of every file under `paths`, or null when git cannot be
 * trusted to know.
 *
 * Null is returned for a shallow clone, for a checkout that is not a git
 * repository at all (an unpacked tarball, someone else's CI), and for any
 * failure of the command itself. All three are the same answer to the caller:
 * emit no `lastmod`.
 *
 * `maxBuffer` is raised because the log is one line per file per commit across
 * 585 YAML files and the whole history of the catalogue — comfortably past
 * Node's 1 MB default, and the failure when it is not raised is a truncated
 * log, which would silently date the older half of the site wrongly.
 */
export async function fileDates(cwd: string, paths: string[]): Promise<Map<string, string> | null> {
  try {
    const shallow = await run('git', ['rev-parse', '--is-shallow-repository'], { cwd })
    if (shallow.stdout.trim() !== 'false') return null

    const log = await run(
      'git',
      [
        // Paths are compared against the catalogue's own file names, so a path
        // git decided to quote and escape would simply never match.
        '-c',
        'core.quotepath=false',
        'log',
        '--pretty=format:%cI',
        '--name-only',
        '--no-renames',
        '--',
        ...paths,
      ],
      { cwd, maxBuffer: 64 * 1024 * 1024 },
    )

    const dates = parseGitLog(log.stdout)
    return dates.size > 0 ? dates : null
  } catch {
    return null
  }
}

/** The newest of a set of dates, or undefined if the set is empty. */
export function newest(dates: Iterable<string | undefined>): string | undefined {
  let best: string | undefined
  for (const date of dates) {
    if (date === undefined) continue
    // ISO 8601 with an offset does not sort lexically across time zones — every
    // commit here could have been made in a different one — so the comparison
    // is on the instant, not on the string.
    if (best === undefined || Date.parse(date) > Date.parse(best)) best = date
  }
  return best
}
