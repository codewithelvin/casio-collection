// `npm run catalog:audit` — §10.5. **Changes nothing, and fails nothing.**
//
// This is what `/casio-catalog audit` runs. It reads catalog-src, reports the
// state of the catalogue against the five things §10.5 names, and exits 0
// whatever it finds — including on a catalogue that is currently failing
// §10.2. That is deliberate on both counts:
//
//   - The gate is `catalog:validate`, and there is exactly one gate (§10.6
//     guardrail 6). A second command that can fail a build is a second thing to
//     argue with when the two disagree.
//   - An audit that refuses to speak until the build is green is silent exactly
//     when it is wanted. So the build state is printed as the first thing the
//     report says, rather than as a reason to stop.
//
// Everything that decides *what* is worth reporting is a pure function in
// src/catalog/audit.ts. This file reads files and prints (D37).
import { pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'
import { auditCatalogue, renderAudit } from '../../src/catalog/audit.ts'
import { buildCatalog, serialiseCatalog, stamp } from '../../src/catalog/build.ts'
import { checkIntegrity } from '../../src/catalog/integrity.ts'
import { renderIssues, type SizeReport } from '../../src/catalog/report.ts'
import type { CatalogPayload } from '../../src/catalog/schema.ts'
import { loadCatalogSource } from './load.ts'

function rule(title: string): string {
  return `\n${title}\n${'─'.repeat(title.length)}`
}

async function runAudit(): Promise<void> {
  const { source, failures } = await loadCatalogSource()

  console.log(rule('catalog:audit — §10.5. Nothing here is written and nothing here fails.'))

  if (!source) {
    console.log(
      `\n${renderIssues('The catalogue source will not parse, so there is nothing to audit', failures)}`,
    )
    console.log('\nFix the parse first: npm run catalog:validate')
    return
  }

  /* --- build state, first, because everything else assumes it is known --- */

  const report = checkIntegrity(source, { currentYear: new Date().getFullYear() })
  const blocking = [...failures, ...report.failures]

  if (blocking.length === 0 && report.warnings.length === 0) {
    console.log('\nBuild state: green. catalog:validate passes.')
  } else {
    console.log(
      `\nBuild state: ${blocking.length} failure${blocking.length === 1 ? '' : 's'}, ` +
        `${report.warnings.length} warning${report.warnings.length === 1 ? '' : 's'}.`,
    )
    if (blocking.length > 0)
      console.log(`\n${renderIssues('Failures — these stop a deploy (§10.2)', blocking)}`)
    if (report.warnings.length > 0) console.log(`\n${renderIssues('Warnings', report.warnings)}`)
  }

  /* --- the payload, built even when the catalogue is failing --- */

  let payload: CatalogPayload | null = null
  let size: SizeReport | null = null
  try {
    payload = buildCatalog(source)
    const text = serialiseCatalog(stamp(payload, 'audit', '1970-01-01'))
    size = {
      bytes: Buffer.byteLength(text, 'utf8'),
      gzipBytes: gzipSync(text).length,
      models: payload.models.length,
    }
  } catch (error) {
    // Not fatal here. The catalogue is broken in a way that stops it being
    // assembled at all, which the failures above have already said out loud —
    // the four sections that do not need a payload still have something to say.
    console.log(
      `\nThe catalogue could not be assembled: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  console.log(rule('The catalogue as it stands'))
  console.log(
    `\n${renderAudit(
      auditCatalogue({
        payload,
        images: source.images,
        publishedIds: source.publishedIds,
        parseFailures: failures,
        size,
      }),
    )}`,
  )

  console.log('\nAudit only. Nothing was written.')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await runAudit()
}
