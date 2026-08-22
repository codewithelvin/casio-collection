import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from '../test/renderApp'
import { catalogArtefactResponse } from '../test/catalogFixture'
import { t } from '../i18n/strings'

/**
 * The client's ask of 2026-08-22: a button on the watch page that opens a form
 * with the watch's own specifications already in it.
 *
 * These drive the real route, because the two things worth pinning are both
 * about the seam — that the form is prefilled from the model the page is
 * showing, and that what leaves the browser carries the reference.
 */

/** The catalogue, plus a function endpoint that accepts everything. */
function stubEndpoint(accept: { ok: boolean; status?: number } = { ok: true }) {
  // `init` is named because the assertions read it back — the suggestion's body
  // is the thing under test, and a one-parameter mock has no index 1 to read.
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    void init
    // Both legs of §6.2's split before the endpoint, because the shell's rail
    // reads the index on this route as it does on every other.
    const artefact = catalogArtefactResponse(String(input))
    if (artefact) return artefact
    return { ok: accept.ok, status: accept.status ?? 200, text: async () => '' }
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('improving an entry', () => {
  beforeEach(() => {
    // §14.2 — the endpoint is a Supabase function, so the offer only exists
    // once a project does. The suite's default is no project (see setup.ts).
    vi.stubEnv('VITE_SUPABASE_URL', 'https://ref.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
  })

  it('opens a form with the watch s own specification already in it', async () => {
    stubEndpoint()
    const user = userEvent.setup()
    renderApp('/watch/dw-5600e-1v')

    await user.click(await screen.findByRole('button', { name: t('improve.trigger') }))

    const dialog = await screen.findByRole('dialog')
    // The client's words: if there is already a spec, fill it into the input.
    expect(within(dialog).getByLabelText(t('spec.module'))).toHaveValue('3229')
    expect(within(dialog).getByLabelText(t('spec.year'))).toHaveValue('1996')
    expect(within(dialog).getByLabelText(t('spec.case.material'))).toHaveValue('resin')

    // And a field nobody has sourced is empty, not a plausible number (D27).
    expect(within(dialog).getByLabelText(t('spec.case.depth_mm'))).toHaveValue('')
  })

  it('will not send a form nobody has touched', async () => {
    stubEndpoint()
    const user = userEvent.setup()
    renderApp('/watch/dw-5600e-1v')

    await user.click(await screen.findByRole('button', { name: t('improve.trigger') }))
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).getByRole('button', { name: t('improve.send') })).toBeDisabled()
  })

  it('sends the reference with the change, and says a person reads it', async () => {
    const fetchMock = stubEndpoint()
    const user = userEvent.setup()
    renderApp('/watch/dw-5600bb-1')

    await user.click(await screen.findByRole('button', { name: t('improve.trigger') }))
    const dialog = await screen.findByRole('dialog')

    await user.type(within(dialog).getByLabelText(t('spec.module')), '1545')
    await user.click(within(dialog).getByRole('button', { name: t('improve.send') }))

    // FR-9.4's rule borrowed: it confirms in plain terms and says out loud that
    // nothing has entered the catalogue.
    expect(await screen.findByText(t('improve.sent.body'))).toBeInTheDocument()

    const posted = fetchMock.mock.calls.find(([input]) =>
      String(input).includes('suggest-correction'),
    )
    expect(posted).toBeDefined()
    const body = JSON.parse(String(posted![1]?.body))
    // The client asked for the reference so the watch can be found quickly.
    expect(body.ref).toBe('DW-5600BB-1')
    expect(body.changes).toEqual([{ key: 'module', label: t('spec.module'), from: '', to: '1545' }])
  })

  it('turns the function s rate limit into a rule rather than an error', async () => {
    stubEndpoint({ ok: false, status: 429 })
    const user = userEvent.setup()
    renderApp('/watch/dw-5600bb-1')

    await user.click(await screen.findByRole('button', { name: t('improve.trigger') }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(t('spec.module')), '1545')
    await user.click(within(dialog).getByRole('button', { name: t('improve.send') }))

    expect(await screen.findByText(t('improve.capped'))).toBeInTheDocument()
  })

  it('offers nothing at all until a Supabase project exists (§14.2)', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    renderApp('/watch/dw-5600e-1v')

    await screen.findByRole('heading', { name: 'DW-5600E-1V', level: 2 })
    expect(screen.queryByRole('button', { name: t('improve.trigger') })).not.toBeInTheDocument()
  })
})
