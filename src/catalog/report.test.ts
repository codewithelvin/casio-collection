import { describe, expect, it } from 'vitest'
import { MODEL } from './schema.ts'
import { CATALOG_BUDGET_GZIP, issuesFromSchema, renderIssues, renderSize } from './report.ts'

describe('a schema rejection, rendered as a §10.2 failure', () => {
  const reject = (input: unknown, file = 'f.yaml') =>
    issuesFromSchema(file, MODEL.safeParse(input).error?.issues ?? [], input)

  it('files an unknown feature under check 6, quoting what was written', () => {
    const issues = reject(
      {
        id: 'aa',
        ref: 'A',
        source: { url: 'https://x.test/a', kind: 'official' },
        features: ['sollar'],
      },
      'catalog-src/g-shock/dw-5600.yaml',
    )
    expect(issues[0]?.check).toBe('6')
    // Zod's own message lists all thirty-odd allowed values. The one word worth
    // reading is the one that was typed.
    expect(issues[0]?.message).toContain('"sollar"')
    expect(issues[0]?.message).toContain('vocabulary.ts')
    expect(issues[0]?.message).not.toContain('world-time')
    expect(issues[0]?.where).toContain('features.0')
  })

  it('files a missing source under check 7', () => {
    expect(reject({ id: 'aa', ref: 'A' })[0]?.check).toBe('7')
  })

  it('names the misspelt key rather than only saying the object is wrong', () => {
    const issues = reject({
      id: 'aa',
      ref: 'A',
      source: { url: 'https://x.test/a', kind: 'official' },
      wather_resistance_m: 200,
    })
    expect(issues[0]?.message).toContain('wather_resistance_m')
    expect(issues[0]?.check).toBe('schema')
  })

  it('still reads when the document it came from is not to hand', () => {
    const issues = issuesFromSchema(
      'f.yaml',
      MODEL.safeParse({ id: 'aa', ref: 'A', display: 'x' }).error?.issues ?? [],
    )
    expect(
      issues.some((issue) => issue.check === '6' && issue.message.includes('that value')),
    ).toBe(true)
  })
})

describe('the rendered report', () => {
  it('is empty when there is nothing to say', () => {
    expect(renderIssues('Failures', [])).toBe('')
  })

  it('carries the §10.2 number, the place and the message on every line', () => {
    const text = renderIssues('Failures', [{ check: '2', where: 'f.yaml#a', message: 'gone' }])
    expect(text).toContain('§10.2 #2')
    expect(text).toContain('f.yaml#a')
    expect(text).toContain('gone')
  })

  it('drops the §10.2 prefix where the parse failed before any numbered check ran', () => {
    const text = renderIssues('Failures', [
      { check: 'yaml', where: 'f.yaml: line 3', message: 'bad indent' },
    ])
    expect(text).not.toContain('§10.2')
    expect(text).toContain('yaml')
  })
})

describe('the size report (§10.2 check 8)', () => {
  it('passes under the budget and prints both split triggers', () => {
    const { ok, text } = renderSize({ bytes: 300_000, gzipBytes: 40_000, models: 420 })
    expect(ok).toBe(true)
    expect(text).toContain('420 models')
    expect(text).toContain('NFR-4')
    expect(text).toContain('§6.2')
  })

  it('fails over the budget and points at the split rather than at a bigger number', () => {
    const { ok, text } = renderSize({
      bytes: 2_000_000,
      gzipBytes: CATALOG_BUDGET_GZIP + 1,
      models: 3000,
    })
    expect(ok).toBe(false)
    expect(text).toContain('split')
    expect(text).toContain('not one of the options')
  })
})
