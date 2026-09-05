import { describe, expect, it } from 'vitest'
import {
  SUGGESTION_FIELDS,
  buildSuggestion,
  changedFields,
  currentValue,
  draftFromModel,
  invalidFields,
  isSendable,
} from './suggestion.ts'
import { catalogFixture } from '../test/catalogFixture.ts'
import type { BrowseModel } from '../catalog/schema.ts'

const model = (id: string): BrowseModel =>
  catalogFixture.models.find((candidate) => candidate.id === id)!

/** The fixture's fullest entry: year, display, movement, module, case, WR, features. */
const full = model('dw-5600e-1v')
/** D27's floor — a reference, a source, and nothing else. */
const bare = model('dw-5600bb-1')

describe('the prefill (the client asked for the specs already in the inputs)', () => {
  it('fills every field the model carries', () => {
    const draft = draftFromModel(full)

    expect(draft.values['year']).toBe('1996')
    expect(draft.values['display']).toBe('digital')
    expect(draft.values['movement']).toBe('quartz')
    expect(draft.values['module']).toBe('3229')
    expect(draft.values['case.material']).toBe('resin')
    expect(draft.values['case.width_mm']).toBe('42.8')
    expect(draft.values['case.weight_g']).toBe('53')
    expect(draft.values['water_resistance_m']).toBe('200')
    expect(draft.features).toEqual(['stopwatch', 'alarm', 'el-backlight'])
  })

  it('leaves a field the model does not carry empty rather than guessing', () => {
    // D27 in the form: the gaps are what the form is asking for, so a missing
    // depth must arrive as an empty input and never as a plausible number.
    const draft = draftFromModel(full)
    expect(draft.values['case.depth_mm']).toBe('')
    expect(draft.values['colorway']).toBe('')
  })

  it('gives a model with nothing but its required fields an entirely empty form', () => {
    const draft = draftFromModel(bare)
    for (const field of SUGGESTION_FIELDS) {
      if (field.kind === 'multi') continue
      expect(draft.values[field.key]).toBe('')
    }
    expect(draft.features).toEqual([])
  })

  it('reads through the case block and past an absent one', () => {
    expect(currentValue(full, 'case.width_mm')).toBe('42.8')
    expect(currentValue(bare, 'case.width_mm')).toBe('')
    expect(currentValue(bare, 'features')).toBe('')
  })
})

describe('the diff that becomes the email', () => {
  it('reports nothing when the form still says what the catalogue says', () => {
    expect(changedFields(full, draftFromModel(full))).toEqual([])
  })

  it('ignores whitespace and trailing zeroes on a number', () => {
    // ` 42.80 ` and `42.8` are the same claim about the same case. Reporting it
    // would send somebody to re-read a page that already agrees with us.
    const draft = draftFromModel(full)
    draft.values['case.width_mm'] = ' 42.80 '
    expect(changedFields(full, draft)).toEqual([])
  })

  it('ignores the order features were ticked in', () => {
    const draft = draftFromModel(full)
    draft.features = ['alarm', 'el-backlight', 'stopwatch']
    expect(changedFields(full, draft)).toEqual([])
  })

  it('carries both sides, so the maintainer sees what it says today', () => {
    const draft = draftFromModel(full)
    draft.values['case.width_mm'] = '43.8'

    expect(changedFields(full, draft)).toEqual([
      { key: 'case.width_mm', label: 'spec.case.width_mm', from: '42.8', to: '43.8' },
    ])
  })

  it('reports a field being filled in for the first time, from nothing', () => {
    const draft = draftFromModel(bare)
    draft.values['module'] = '1545'

    expect(changedFields(bare, draft)).toEqual([
      { key: 'module', label: 'spec.module', from: '', to: '1545' },
    ])
  })

  it('reports a field being emptied, which is a claim too', () => {
    const draft = draftFromModel(full)
    draft.values['module'] = ''

    expect(changedFields(full, draft)).toEqual([
      { key: 'module', label: 'spec.module', from: '3229', to: '' },
    ])
  })

  it('reports a change to the feature list', () => {
    const draft = draftFromModel(full)
    draft.features = ['stopwatch']

    expect(changedFields(full, draft)).toEqual([
      {
        key: 'features',
        label: 'spec.features',
        from: 'stopwatch, alarm, el-backlight',
        to: 'stopwatch',
      },
    ])
  })
})

describe('what may be sent', () => {
  it('refuses an untouched form', () => {
    // An empty suggestion in somebody's inbox is D46's argument about an entry
    // that states nothing, applied to attention rather than to the catalogue.
    expect(isSendable(full, draftFromModel(full))).toBe(false)
  })

  it('allows a note on its own, with nothing changed', () => {
    const draft = draftFromModel(full)
    draft.note = 'The bezel print differs on the JDM version.'
    expect(isSendable(full, draft)).toBe(true)
  })

  it('names a numeric field that is not a number, and refuses to send', () => {
    const draft = draftFromModel(full)
    draft.values['case.width_mm'] = '42,8 mm'

    expect(invalidFields(draft)).toEqual(['case.width_mm'])
    expect(isSendable(full, draft)).toBe(false)
  })

  it('refuses a negative measurement', () => {
    const draft = draftFromModel(full)
    draft.values['water_resistance_m'] = '-200'
    expect(invalidFields(draft)).toEqual(['water_resistance_m'])
  })

  it('accepts an empty numeric field, which is D27 rather than an error', () => {
    const draft = draftFromModel(full)
    draft.values['case.depth_mm'] = ''
    expect(invalidFields(draft)).toEqual([])
  })
})

describe('the payload', () => {
  it('leads with the reference, so a suggestion can be matched to a watch', () => {
    const draft = draftFromModel(full)
    draft.values['colorway'] = 'Black'
    draft.note = '  spotted on the box  '
    draft.link = ' https://example.com/page '
    draft.email = ' reader@example.com '

    const payload = buildSuggestion(full, draft, 'https://casiovault.com/watch/dw-5600e-1v')

    expect(payload.ref).toBe('DW-5600E-1V')
    expect(payload.modelId).toBe('dw-5600e-1v')
    expect(payload.line).toBe('g-shock')
    expect(payload.series).toBe('dw-5600')
    expect(payload.url).toBe('https://casiovault.com/watch/dw-5600e-1v')
    // The label leaves as words. A maintainer reading this in a mail client is
    // not reading a component, and `spec.colorway` in an inbox is for ever.
    expect(payload.changes).toEqual([
      { key: 'colorway', label: 'Colourway', from: '', to: 'Black' },
    ])
    expect(payload.note).toBe('spotted on the box')
    expect(payload.link).toBe('https://example.com/page')
    expect(payload.email).toBe('reader@example.com')
  })
})
