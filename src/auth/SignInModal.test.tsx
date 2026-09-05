import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfigProvider, App as AntdApp } from 'antd'
import { MemoryRouter } from 'react-router-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SignInModal } from './SignInModal.tsx'
import { resetSessionStore, useSessionStore } from './session.ts'
import { readPendingIntent, writePendingIntent } from './pendingIntent.ts'
import type { BrowseModel } from '../catalog/schema.ts'
import { strings } from '../i18n/strings'

/**
 * §8.9. The modal is where D6's cost is paid — it asks a stranger for an
 * account at the exact moment they first try to do the thing the site is for —
 * so what is tested here is the persuading, not the plumbing: the promise, the
 * watch they pressed, and the fact that pressing the button does not lose it.
 */

const MODEL = {
  id: 'f-91w-1',
  ref: 'F-91W-1',
  line: 'vintage',
  series: 'f-91w',
} as BrowseModel

function renderModal(methods?: readonly ('google' | 'email')[]) {
  return render(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <AntdApp>
        <MemoryRouter initialEntries={['/watch/f-91w-1']}>
          {methods ? <SignInModal methods={methods} /> : <SignInModal />}
        </MemoryRouter>
      </AntdApp>
    </ConfigProvider>,
  )
}

const signInWithGoogle = vi.fn(async () => {})
const signInWithEmail = vi.fn(async () => {})

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://ref.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon.key')
  resetSessionStore()
  signInWithGoogle.mockClear()
  signInWithEmail.mockClear()
  // The store's own actions are covered in session.test.ts; here they are
  // replaced so the test is about the dialogue rather than about Supabase.
  useSessionStore.setState({ signInWithGoogle, signInWithEmail })
})

function open(model: BrowseModel | null = MODEL) {
  useSessionStore.setState({ prompt: { open: true, model } })
}

describe('at launch (D20 — one Google button)', () => {
  it('states what is about to happen and offers one way in', async () => {
    open()
    renderModal()

    expect(await screen.findByText(strings['auth.modal.title'])).toBeInTheDocument()
    expect(screen.getByRole('button', { name: new RegExp(strings['auth.google']) })).toBeInTheDocument()
    expect(screen.queryByLabelText(strings['auth.email.label'])).not.toBeInTheDocument()
  })

  it('says why there is only one, rather than looking unfinished', async () => {
    open()
    renderModal()
    expect(await screen.findByText(strings['auth.googleOnly'])).toBeInTheDocument()
  })

  it('shows the watch that triggered it (§8.9)', async () => {
    open()
    renderModal()

    expect(await screen.findAllByText('F-91W-1')).not.toHaveLength(0)
    expect(screen.getByText(strings['auth.modal.thisOne'])).toBeInTheDocument()
  })

  it('opens without a watch when the header asked for it', async () => {
    open(null)
    renderModal()

    expect(await screen.findByText(strings['auth.modal.title'])).toBeInTheDocument()
    expect(screen.queryByText(strings['auth.modal.thisOne'])).not.toBeInTheDocument()
  })
})

describe('leaving for the provider (§9.4)', () => {
  it('remembers the page first', async () => {
    open()
    renderModal()

    await userEvent.click(await screen.findByRole('button', { name: new RegExp(strings['auth.google']) }))

    expect(signInWithGoogle).toHaveBeenCalled()
    expect(readPendingIntent()).toMatchObject({ kind: 'return', returnTo: '/watch/f-91w-1' })
  })

  /**
   * The ordering bug worth a test of its own: a guest's *Owned One* press is
   * already in the slot when this modal opens, and the modal must not overwrite
   * the very thing it exists to preserve.
   */
  it('does not overwrite a press that is already waiting', async () => {
    writePendingIntent({
      kind: 'collection',
      modelId: 'f-91w-1',
      status: 'owned',
      returnTo: '/watch/f-91w-1',
    })
    open()
    renderModal()

    await userEvent.click(await screen.findByRole('button', { name: new RegExp(strings['auth.google']) }))

    expect(readPendingIntent()).toMatchObject({ kind: 'collection', status: 'owned' })
  })

  it('says so when the provider cannot be reached', async () => {
    signInWithGoogle.mockRejectedValueOnce(new Error('offline'))
    open()
    renderModal()

    await userEvent.click(await screen.findByRole('button', { name: new RegExp(strings['auth.google']) }))

    expect(await screen.findByText(strings['auth.error.title'])).toBeInTheDocument()
  })
})

/**
 * §9.2 / D20 — built and tested now, unreachable until the constant lists it.
 * A flag that hides untested code is not a flag, it is a branch nobody has run.
 */
describe('magic link, with the flag up', () => {
  it('puts the email field under a divider, with Google still first', async () => {
    open()
    renderModal(['google', 'email'])

    const buttons = await screen.findAllByRole('button')
    const labels = buttons.map((button) => button.textContent)
    expect(labels.indexOf(strings['auth.google'])).toBeLessThan(
      labels.indexOf(strings['auth.email.send']),
    )
    expect(screen.getByLabelText(strings['auth.email.label'])).toBeInTheDocument()
  })

  it('refuses an address that is not one, without sending anything', async () => {
    open()
    renderModal(['google', 'email'])

    await userEvent.type(await screen.findByLabelText(strings['auth.email.label']), 'not-an-email')
    await userEvent.click(screen.getByRole('button', { name: strings['auth.email.send'] }))

    expect(await screen.findByText(strings['auth.email.invalid'])).toBeInTheDocument()
    expect(signInWithEmail).not.toHaveBeenCalled()
  })

  it('moves to the inbox state and names the address', async () => {
    open()
    renderModal(['google', 'email'])

    await userEvent.type(
      await screen.findByLabelText(strings['auth.email.label']),
      'collector@example.com',
    )
    await userEvent.click(screen.getByRole('button', { name: strings['auth.email.send'] }))

    expect(signInWithEmail).toHaveBeenCalledWith('collector@example.com')
    expect(await screen.findByText(strings['auth.inbox.title'])).toBeInTheDocument()
    expect(screen.getByText('collector@example.com')).toBeInTheDocument()
  })
})
