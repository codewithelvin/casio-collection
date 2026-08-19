// Did the pipeline that ran on this commit go green?
//
//   npm run ci:status          the run for HEAD, waiting until it finishes
//   npm run ci:status -- --last  the most recent run on any commit
//
// WHY THIS EXISTS. A push is not a deploy. On 2026-08-19 two pushes in a row
// failed the Lint step and neither was noticed, because the local suite was
// green and `git push` said everything was fine — so the live site sat two
// commits behind while the work was reported as shipped. The failure was one
// zero-width space in a comment.
//
// The repository is public, so the Actions API answers without a token and this
// needs no `gh` and no secret. If it ever goes private, this asks for
// `GITHUB_TOKEN` rather than pretending it cannot tell.
import { execFileSync } from 'node:child_process'

const REPO = 'codewithelvin/casio-collection'
const API = `https://api.github.com/repos/${REPO}/actions/runs`

const last = process.argv.includes('--last')
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()

const token = process.env.GITHUB_TOKEN
const headers = {
  accept: 'application/vnd.github+json',
  'user-agent': 'casio-vault-ci-status',
  ...(token ? { authorization: `Bearer ${token}` } : {}),
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * The workflow whose verdict decides whether anything reached the site.
 *
 * **More than one workflow runs on a commit**, and the first version of this
 * took whichever the API listed first. On the campaign commit that was
 * *Supabase keep-alive*, which fails while M4's project has no tables to ping —
 * so the check reported a failure that had nothing to do with the deploy, on a
 * push that deployed fine. A status check that cries wolf is D43's problem
 * exactly: it gets ignored, and then it is ignored on the day it is right.
 */
const DEPLOY = 'Deploy'

/** Every run for this commit, or the newest run if `--last`. */
async function runsFor(sha) {
  const res = await fetch(`${API}?per_page=30`, { headers })
  if (!res.ok) {
    throw new Error(
      `GitHub answered ${res.status}. ` +
        (res.status === 404 ? 'If the repository is private, set GITHUB_TOKEN.' : ''),
    )
  }
  const { workflow_runs: all } = await res.json()
  return last ? all.slice(0, 1) : all.filter((run) => run.head_sha === sha)
}

/** The deploy for this commit, which is the one the exit code speaks for. */
async function runFor(sha) {
  const found = await runsFor(sha)
  return found.find((run) => run.name === DEPLOY) ?? found[0]
}

let run = await runFor(head)

// A push and its run are not simultaneous: give Actions a moment to register one
// before concluding there is nothing to look at.
for (let i = 0; !run && i < 10; i++) {
  process.stdout.write(i === 0 ? 'waiting for a run to appear' : '.')
  await sleep(6000)
  run = await runFor(head)
}
if (!run) {
  console.error(`\nNo workflow run for ${head.slice(0, 7)}. Has it been pushed?`)
  process.exit(2)
}

while (run.status !== 'completed') {
  process.stdout.write(`\r${run.name} — ${run.status}${' '.repeat(20)}`)
  await sleep(15000)
  run = await runFor(last ? null : head)
}
process.stdout.write('\r')

console.log(`${run.name}  ${run.head_sha.slice(0, 7)}  ${run.conclusion}`)
console.log(`${run.display_title}`)
console.log(run.html_url)

// Every other workflow on the same commit is named too, so a failure elsewhere
// is visible without being mistaken for the deploy's verdict.
for (const other of await runsFor(run.head_sha)) {
  if (other.id === run.id) continue
  const state = other.status === 'completed' ? other.conclusion : other.status
  console.log(`\n  also on this commit: ${other.name} — ${state}`)
  if (state !== 'success') console.log(`    ${other.html_url}`)
}

if (run.conclusion !== 'success') {
  // Name the step, because "the build failed" sends somebody to the wrong place.
  const jobs = await (await fetch(run.jobs_url, { headers })).json()
  for (const job of jobs.jobs ?? []) {
    if (job.conclusion === 'success' || job.conclusion === 'skipped') continue
    console.error(`\n  job ${job.name}: ${job.conclusion}`)
    for (const step of job.steps ?? []) {
      if (step.conclusion && step.conclusion !== 'success' && step.conclusion !== 'skipped') {
        console.error(`    failed at step: ${step.name}`)
      }
    }
  }
  process.exit(1)
}
