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

/** The run for this commit, or the newest run if `--last`. */
async function runFor(sha) {
  const res = await fetch(`${API}?per_page=20`, { headers })
  if (!res.ok) {
    throw new Error(
      `GitHub answered ${res.status}. ` +
        (res.status === 404 ? 'If the repository is private, set GITHUB_TOKEN.' : ''),
    )
  }
  const { workflow_runs: runs } = await res.json()
  return last ? runs[0] : runs.find((run) => run.head_sha === sha)
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
