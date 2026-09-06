/**
 * List and deploy the Edge Functions, from the repository rather than from a
 * laptop that happens to have the CLI on it.
 *
 * **This exists because of what it found.** `supabase/functions/avatar/` was
 * written on 2026-08-25 with a header explaining exactly how to deploy it —
 * `supabase functions deploy avatar` — and on 2026-09-06 the project had one
 * function on it, `suggest-correction`. The avatar function had never been
 * deployed at all, so `functions.invoke('avatar')` had been answering 404 for
 * twelve days.
 *
 * Nothing broke visibly, which is the whole problem: `refreshAvatar` turns every
 * kind of no into `null` and shows initials, so a signed-in reader saw a plainer
 * header and nobody saw an error. D71's picture switch is what finally reported
 * it, because a switch that cannot do its one job has to say so.
 *
 * That is the same shape as the migrations that were believed applied for eight
 * days, and it has the same answer: **a command in the repository, and a check
 * that reads the answer back.**
 *
 *   node scripts/supabase/functions.ts --list
 *   node scripts/supabase/functions.ts --deploy avatar
 *
 * The token is `SUPABASE_ACCESS_TOKEN` in an untracked `.env.local`, exactly as
 * `migrate.ts` reads it, and it is never printed.
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const API = 'https://api.supabase.com'

async function readEnvFile(name: string): Promise<Record<string, string>> {
  try {
    const text = await readFile(join(root, name), 'utf8')
    const out: Record<string, string> = {}
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (trimmed === '' || trimmed.startsWith('#')) continue
      const index = trimmed.indexOf('=')
      if (index === -1) continue
      out[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim()
    }
    return out
  } catch {
    return {}
  }
}

interface DeployedFunction {
  slug: string
  status: string
  version: number
  verify_jwt: boolean
  updated_at: number
}

async function main() {
  const argv = process.argv.slice(2)
  const env = {
    ...(await readEnvFile('.env')),
    ...(await readEnvFile('.env.local')),
    ...process.env,
  } as Record<string, string>

  const token = env['SUPABASE_ACCESS_TOKEN']
  const ref = /^https:\/\/([a-z0-9]+)\.supabase\.(?:co|in)$/i.exec(
    (env['VITE_SUPABASE_URL'] ?? '').trim().replace(/\/$/, ''),
  )?.[1]

  if (!ref || !token) {
    console.error(
      'functions: needs VITE_SUPABASE_URL and SUPABASE_ACCESS_TOKEN.\n' +
        '  The token goes in .env.local, which .gitignore already covers (S2).',
    )
    process.exit(1)
  }

  const auth = { authorization: `Bearer ${token}` }

  const list = async (): Promise<DeployedFunction[]> => {
    const response = await fetch(`${API}/v1/projects/${ref}/functions`, { headers: auth })
    if (!response.ok) {
      console.error(`functions: list failed — HTTP ${response.status}\n${await response.text()}`)
      process.exit(1)
    }
    return (await response.json()) as DeployedFunction[]
  }

  const deployIndex = argv.indexOf('--deploy')
  if (deployIndex === -1) {
    const deployed = await list()
    if (deployed.length === 0) console.log('No Edge Functions are deployed.')
    for (const fn of deployed) {
      const when = new Date(fn.updated_at).toISOString().slice(0, 10)
      console.log(
        `${fn.slug.padEnd(20)} ${fn.status}  v${fn.version}  verify_jwt=${fn.verify_jwt}  ${when}`,
      )
    }
    return
  }

  const slug = argv[deployIndex + 1]
  if (!slug) {
    console.error('functions: --deploy needs a slug, e.g. --deploy avatar')
    process.exit(1)
  }

  const source = await readFile(join(root, 'supabase', 'functions', slug, 'index.ts'), 'utf8')
  const existing = (await list()).find((fn) => fn.slug === slug)

  /**
   * **`verify_jwt` is a property of the function and not of this script**, so it
   * is read from the same place the header of each function states it:
   * `suggest-correction` is deployed with it off because it answers a form from
   * a signed-out reader; `avatar` is deployed with it on because it reads the
   * caller's identity from the platform. Getting this wrong in either direction
   * is a security change made by a deploy flag, so it is stated per slug here
   * rather than defaulted.
   */
  const verifyJwt = slug !== 'suggest-correction'

  console.log(`project ${ref}`)
  console.log(`function ${slug} — ${source.length} bytes, verify_jwt=${verifyJwt}`)
  console.log(existing ? `updating v${existing.version}` : 'creating (not deployed before)')

  const response = await fetch(
    existing
      ? `${API}/v1/projects/${ref}/functions/${slug}`
      : `${API}/v1/projects/${ref}/functions`,
    {
      method: existing ? 'PATCH' : 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ slug, name: slug, verify_jwt: verifyJwt, body: source }),
    },
  )

  const text = await response.text()
  if (!response.ok) {
    console.error(`\nFAILED — HTTP ${response.status}\n${text}`)
    process.exit(1)
  }

  // Read it back rather than trust the write, which is the rule this whole file
  // was written after.
  const after = (await list()).find((fn) => fn.slug === slug)
  if (!after) {
    console.error('\nDeploy reported success and the function is not in the list.')
    process.exit(1)
  }
  console.log(`\nDeployed: ${after.slug} ${after.status} v${after.version}`)
}

main().catch((error: unknown) => {
  console.error(`functions: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
