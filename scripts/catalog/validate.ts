// `npm run catalog:validate` — §10.1.
//
// Parses every file under catalog-src against the Zod schema and runs the §10.2
// integrity checks. Nothing is written. This is what the /casio-catalog skill
// runs at the end of every command (§10.5) and what guardrail 6 means by "never
// leave the repo failing catalog:validate".
import { pathToFileURL } from 'node:url'
import { buildCatalog } from '../../src/catalog/build.ts'
import { coverageTable, renderCoverageTable } from '../../src/catalog/coverage.ts'
import { checkIntegrity } from '../../src/catalog/integrity.ts'
import { renderIssues } from '../../src/catalog/report.ts'
import type { CatalogPayload } from '../../src/catalog/schema.ts'
import { loadCatalogSource } from './load.ts'

export interface ValidationResult {
  ok: boolean
  payload: CatalogPayload | null
}

export async function runValidation(): Promise<ValidationResult> {
  const { source, failures } = await loadCatalogSource()

  if (failures.length > 0 || !source) {
    console.error(renderIssues('The catalogue source will not parse', failures))
    return { ok: false, payload: null }
  }

  const counts = {
    lines: source.lines.lines.length,
    series: source.series.length,
    editions: source.editions.length,
    models: source.series.reduce((total, entry) => total + entry.models.length, 0),
  }
  console.log(
    `catalog-src: ${counts.lines} lines, ${counts.series} series, ` +
      `${counts.editions} editions, ${counts.models} models`,
  )

  const report = checkIntegrity(source, { currentYear: new Date().getFullYear() })

  if (report.warnings.length > 0) {
    console.log(`\n${renderIssues('Warnings', report.warnings)}`)
  }

  if (report.failures.length > 0) {
    console.error(`\n${renderIssues('Failures', report.failures)}`)
    console.error('\nEvery §10.2 check is a build failure. Nothing was written.')
    return { ok: false, payload: null }
  }

  const payload = buildCatalog(source)
  console.log(
    `\n${renderCoverageTable(
      coverageTable(
        payload.models.filter((model) => !model.tombstone),
        payload.lines,
      ),
    )}`,
  )

  return { ok: true, payload }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { ok } = await runValidation()
  console.log(ok ? '\ncatalog-src is valid.' : '')
  if (!ok) process.exit(1)
}
