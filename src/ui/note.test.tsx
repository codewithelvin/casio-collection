import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/renderWithProviders'
import { catalogFixture } from '../test/catalogFixture'
import { NoteEditor } from './NoteEditor'
import { resetSupabaseClient } from '../auth/supabase.ts'
import { resetSessionStore, useSessionStore } from '../auth/session.ts'
import { NOTE_DEBOUNCE_MS, NOTE_MAX } from '../collection/mutations.ts'
import { strings } from '../i18n/strings'

/**
 * FR-5.2 — "saves on blur and on an explicit *Save*, with a debounce; a *Saved*
 * indicator confirms it. **It is never lost by navigating away mid-edit.**"
 *
 * The last clause is what this file is mostly about, because it is the one that
 * fails invisibly. Blur and debounce are visible if they break — you type, you
 * leave, nothing says *Saved*. A route change unmounts the editor without ever
 * blurring it, so a pending debounce is simply cancelled and a sentence typed
 * thirty seconds ago disappears with no error and nothing to notice.
 */

const { db, createClient } = vi.hoisted(() => {
  const db = {
    rows: [] as unknown[],
    profile: { is_public: false },
    update: vi.fn(async (_payload: unknown) => ({ error: null as { message: string } | null })),
  }

  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {}
    for (const method of ['select', 'order']) chain[method] = vi.fn(() => chain)
    chain['eq'] = vi.fn(() => chain)
    chain['maybeSingle'] = vi.fn(() => Promise.resolve({ data: db.profile, error: null }))
    chain['update'] = vi.fn((payload: unknown) => {
      // `update` is terminal here because nothing chains past the filters, so
      // the promise it returns has to be the statement's result.
      const result = db.update(payload)
      const filtered: Record<string, unknown> = {}
      filtered['eq'] = vi.fn(() => filtered)
      filtered['then'] = (resolve: (value: unknown) => void, reject: (r: unknown) => void) =>
        result.then(resolve, reject)
      return filtered
    })
    chain['then'] = (resolve: (value: unknown) => void, reject: (reason: unknown) => void) =>
      Promise.resolve({ data: table === 'profiles' ? db.profile : db.rows, error: null }).then(
        resolve,
        reject,
      )
    return chain
  })

  const auth = { onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })) }
  return { db, createClient: vi.fn(() => ({ auth, from })) }
})

vi.mock('@supabase/supabase-js', () => ({ createClient }))

const MODEL = catalogFixture.models.find((model) => model.id === 'ga-2100-1a1')!
const OTHER = catalogFixture.models.find((model) => model.id === 'f-91w-1')!

const SESSION = {
  access_token: 'token',
  user: { id: 'user-1', email: 'collector@example.com', user_metadata: { full_name: 'Elvin' } },
}

const row = (modelId: string, note: string | null) => ({
  model_id: modelId,
  status: 'owned',
  note,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
})

function signedIn(rows: unknown[] = [row(MODEL.id, null)]) {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://ref.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon.key')
  db.rows = rows
  resetSessionStore()
  useSessionStore.getState().applySession(SESSION as never)
}

const field = () => screen.findByRole('textbox', { name: strings['note.heading'] })

beforeEach(() => {
  vi.clearAllMocks()
  db.rows = [row(MODEL.id, null)]
  db.profile = { is_public: false }
  db.update.mockResolvedValue({ error: null })
  resetSupabaseClient()
  resetSessionStore()
})

describe('saving a note (FR-5.2)', () => {
  it('saves on its own after the debounce, with no blur at all', async () => {
    signedIn()
    renderWithProviders(<NoteEditor model={MODEL} />)

    await userEvent.type(await field(), 'Bought in Osaka.')

    await waitFor(() => expect(db.update).toHaveBeenCalledWith({ note: 'Bought in Osaka.' }), {
      timeout: NOTE_DEBOUNCE_MS + 4000,
    })
    expect(await screen.findByText(strings['note.saved'])).toBeInTheDocument()
  })

  /**
   * The clause the whole design is built around. Pressing a link is the ordinary
   * way to leave a page in this app and it produces no blur — so the flush lives
   * in the unmount cleanup, and it calls the API rather than the mutation,
   * because by then the component that owned the mutation is gone.
   */
  it('flushes what was typed when the editor is unmounted mid-edit', async () => {
    signedIn()
    const { unmount } = renderWithProviders(<NoteEditor model={MODEL} />)

    await userEvent.type(await field(), 'Half a sentence')
    // Unmount inside the debounce window: nothing has been written yet, and
    // without the flush nothing ever would be.
    expect(db.update).not.toHaveBeenCalled()

    unmount()

    await waitFor(() => expect(db.update).toHaveBeenCalledWith({ note: 'Half a sentence' }))
  })

  it('does not write when nothing was typed', async () => {
    signedIn()
    const { unmount } = renderWithProviders(<NoteEditor model={MODEL} />)

    await field()
    unmount()

    expect(db.update).not.toHaveBeenCalled()
  })

  it('stores an emptied note as null, so FR-4.4 has one answer to give', async () => {
    signedIn([row(MODEL.id, 'Bought in Osaka.')])
    renderWithProviders(<NoteEditor model={MODEL} />)

    // The rows arrive asynchronously, so the field is empty for a moment on
    // first paint. Clearing it before the stored note lands would clear nothing
    // and the test would pass on an implementation that never saves.
    await waitFor(async () => expect(await field()).toHaveValue('Bought in Osaka.'))

    await userEvent.clear(await field())
    await userEvent.tab()

    await waitFor(() => expect(db.update).toHaveBeenCalledWith({ note: null }))
  })

  it('says so when the save did not work', async () => {
    signedIn()
    db.update.mockRejectedValue(new Error('offline'))
    renderWithProviders(<NoteEditor model={MODEL} />)

    await userEvent.type(await field(), 'Bought in Osaka.')
    await userEvent.tab()

    expect(await screen.findByText(strings['note.failed'])).toBeInTheDocument()
  })
})

/**
 * The client reported this twice in one message: on a phone the count sat across
 * the "your profile is published" sentence, and on a desktop it collided with
 * *Saved*. Both were the same cause — AntD's `showCount` draws the number
 * **absolutely positioned 22 px below the field**, outside the box it belongs to
 * and on top of whatever the layout put there.
 *
 * jsdom applies no stylesheet, so it cannot see an overlap and these tests do not
 * pretend to. What they can prove is the thing the fix actually turns on: the
 * positioned element is **gone**, not nudged, and all three items are static
 * children of one flex row. A fix that deletes the absolutely positioned node
 * cannot be undone by a viewport width.
 */
describe('the row under the note field', () => {
  it('draws the count itself, with nothing absolutely positioned', async () => {
    signedIn()
    const { container } = renderWithProviders(<NoteEditor model={MODEL} />)
    await field()

    // AntD's own counter. Its presence is the bug: `.ant-input-data-count` is
    // `position: absolute; bottom: -22px`, which is what reached the row below.
    expect(container.querySelector('.ant-input-data-count')).toBeNull()

    // And the count is still shown, because §6.3's 2 000 cap has to be visible
    // before the database refuses a note somebody already typed.
    expect(screen.getByText(`0 / ${NOTE_MAX}`)).toBeInTheDocument()
  })

  it('keeps the sentence, the save state and the count in one row', async () => {
    signedIn()
    renderWithProviders(<NoteEditor model={MODEL} />)
    await field()

    const sentence = screen.getByText(strings['note.private'])
    const count = screen.getByText(`0 / ${NOTE_MAX}`)

    // One common flex parent, reached from both, is what makes the layout
    // responsible for the spacing between them — the alternative is one of them
    // being placed relative to something else and landing wherever that lands.
    const row = sentence.parentElement
    expect(row).not.toBeNull()
    expect(row?.contains(count)).toBe(true)
    expect(row?.style.display).toBe('flex')
    expect(row?.style.flexWrap).toBe('wrap')
  })

  it('still has room for the count once Saved appears beside it', async () => {
    signedIn()
    renderWithProviders(<NoteEditor model={MODEL} />)

    await userEvent.type(await field(), 'Osaka')
    await userEvent.tab()

    // The desktop half of the report. Both are on screen at once and neither is
    // positioned, so they sit side by side rather than on top of each other.
    const saved = await screen.findByText(strings['note.saved'])
    const count = screen.getByText(`5 / ${NOTE_MAX}`)
    expect(saved.closest('span')?.parentElement).toBe(count.parentElement)
  })
})

describe('which watch the note belongs to', () => {
  /**
   * The editor is one component reused across watches. Without a re-seed on the
   * id, opening a second watch would show the first one's note — and saving it
   * would copy the text onto the wrong reference.
   */
  it('re-seeds when the watch changes', async () => {
    signedIn([row(MODEL.id, 'The CasiOak note.'), row(OTHER.id, 'The F-91W note.')])

    const { rerender } = renderWithProviders(<NoteEditor model={MODEL} />)
    await waitFor(async () => expect(await field()).toHaveValue('The CasiOak note.'))

    rerender(<NoteEditor model={OTHER} />)

    await waitFor(async () => expect(await field()).toHaveValue('The F-91W note.'))
  })
})
