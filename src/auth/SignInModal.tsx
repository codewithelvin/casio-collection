import { useEffect, useState } from 'react'
import { Alert, Button, Divider, Input, Modal, Typography, theme as antdTheme } from 'antd'
import GoogleOutlined from '@ant-design/icons/GoogleOutlined'
import MailOutlined from '@ant-design/icons/MailOutlined'
import { useLocation } from 'react-router-dom'
import { AUTH_METHODS, type AuthMethod } from './config.ts'
import { useSessionStore } from './session.ts'
import { ensureReturnPath } from './pendingIntent.ts'
import { imageSources } from '../catalog/client.ts'
import type { PublishedModel } from '../catalog/schema.ts'
import { LINE_ACCENTS } from '../theme/palette.ts'
import AntdRoot from '../ui/AntdRoot'
import { t } from '../i18n/strings'

/**
 * §8.9 — the sign-in modal, and the reason it is a designed screen rather than
 * a dialogue with two buttons.
 *
 * D6 decided that every write needs a session, which means this modal appears
 * at the exact moment someone first tries to do the one thing the site is for.
 * It is asking for an email address from a stranger who has been here ninety
 * seconds. The architecture makes no concession to that (deliberately — a local
 * collection would recreate the merge problem D6 exists to prevent), so the copy
 * has to: one line saying what happens, the watch they pressed shown back to
 * them, the button. No tabs, no password field, no terms wall.
 *
 * At launch that is **one Google button** (D20), which makes this about as short
 * as a modal can be. Everything under `email` below is built and tested now and
 * unreachable until `AUTH_METHODS` lists it — that is what D20 means by
 * configuration rather than branching code, and it is why `methods` is a prop
 * with a default instead of a module read: the flagged-on path is testable
 * without mutating a constant.
 */
export function SignInModal({ methods = AUTH_METHODS }: { methods?: readonly AuthMethod[] }) {
  const open = useSessionStore((state) => state.prompt.open)
  const model = useSessionStore((state) => state.prompt.model)
  const dismissSignIn = useSessionStore((state) => state.dismissSignIn)
  const signInWithGoogle = useSessionStore((state) => state.signInWithGoogle)
  const signInWithEmail = useSessionStore((state) => state.signInWithEmail)
  const location = useLocation()

  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [email, setEmail] = useState('')
  const [emailInvalid, setEmailInvalid] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)

  // Reopening after a failure must not reopen onto the failure. Everything
  // local resets with the dialogue rather than persisting behind it.
  useEffect(() => {
    if (open) return
    setBusy(false)
    setFailed(false)
    setEmail('')
    setEmailInvalid(false)
    setSentTo(null)
  }, [open])

  /**
   * §9.4 — where to come back to is written **before** leaving the page, and
   * only if the slot is empty. A guest who pressed *Owned One* already wrote a
   * richer intent; this must not overwrite it with a bare return path.
   */
  const rememberWhereWeAre = () => {
    ensureReturnPath(`${location.pathname}${location.search}`)
  }

  const onGoogle = async () => {
    setFailed(false)
    setBusy(true)
    rememberWhereWeAre()
    try {
      await signInWithGoogle()
      // On success the browser is already navigating to Google. `busy` stays on
      // deliberately — a button that re-enables itself under a departing page
      // invites a second press and a second OAuth transaction.
    } catch {
      setFailed(true)
      setBusy(false)
    }
  }

  const onEmail = async () => {
    const address = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setEmailInvalid(true)
      return
    }
    setEmailInvalid(false)
    setFailed(false)
    setBusy(true)
    rememberWhereWeAre()
    try {
      await signInWithEmail(address)
      setSentTo(address)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onCancel={dismissSignIn}
      footer={null}
      centered
      width={420}
      title={sentTo ? t('auth.inbox.title') : t('auth.modal.title')}
      // §8.2 — the phone is the real device, and a 420 px modal on a 360 px
      // screen needs the margin AntD only applies when it is told to.
      styles={{ content: { padding: 20 } }}
    >
      {sentTo ? <InboxState address={sentTo} /> : null}

      {sentTo ? null : (
        <>
          {model ? <TriggeringWatch model={model} /> : null}

          <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
            {t('auth.modal.lead')}
          </Typography.Paragraph>

          {failed ? (
            <Alert
              type="error"
              showIcon
              message={t('auth.error.title')}
              description={t('auth.error.body')}
              style={{ marginBottom: 16 }}
            />
          ) : null}

          {methods.includes('google') ? (
            <Button
              type="primary"
              block
              size="large"
              icon={<GoogleOutlined />}
              loading={busy && !emailInvalid}
              onClick={() => void onGoogle()}
            >
              {t('auth.google')}
            </Button>
          ) : null}

          {/* D20 — Google stays first and the email field appears beneath a
              divider when the flag comes up. Not the other way round. */}
          {methods.includes('email') ? (
            <>
              <Divider plain>{t('auth.or')}</Divider>
              <Input
                type="email"
                size="large"
                aria-label={t('auth.email.label')}
                placeholder={t('auth.email.placeholder')}
                prefix={<MailOutlined />}
                value={email}
                status={emailInvalid ? 'error' : ''}
                onChange={(event) => setEmail(event.target.value)}
                onPressEnter={() => void onEmail()}
              />
              {emailInvalid ? (
                <Typography.Text type="danger" style={{ display: 'block', marginTop: 6 }}>
                  {t('auth.email.invalid')}
                </Typography.Text>
              ) : null}
              <Button block size="large" style={{ marginTop: 12 }} loading={busy} onClick={() => void onEmail()}>
                {t('auth.email.send')}
              </Button>
            </>
          ) : (
            /* The honest version of "one button". Someone without a Google
               account is a real slice of visitors (D20's recorded cost), and
               being told why beats a modal that looks unfinished. */
            <Typography.Paragraph
              type="secondary"
              style={{ fontSize: 12, marginTop: 16, marginBottom: 0 }}
            >
              {t('auth.googleOnly')}
            </Typography.Paragraph>
          )}
        </>
      )}
    </Modal>
  )
}

/**
 * §8.9 — "shows the watch that triggered it as a thumbnail". The point is
 * continuity: the modal has to look like a step in what they were already doing
 * rather than a gate that appeared over it.
 *
 * A photograph is shown when one exists and the typographic tile when it does
 * not, exactly as §8.6 does at full size — 84% of the catalogue is photographed
 * (D41) and the rest never will be, so both are normal here too.
 */
function TriggeringWatch({ model }: { model: PublishedModel }) {
  const { token } = antdTheme.useToken()
  const sources = imageSources(model.image)
  const accent = LINE_ACCENTS[model.line] ?? token.colorPrimary

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
      <div
        style={{
          width: 56,
          height: 56,
          flexShrink: 0,
          borderRadius: token.borderRadius,
          border: `1px solid ${token.colorBorderSecondary}`,
          background: sources ? token.colorBgContainer : `${accent}14`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {sources ? (
          <img
            src={sources.src}
            srcSet={sources.srcSet}
            alt={model.ref}
            width={56}
            height={56}
            style={{ width: '100%', height: 'auto', objectFit: 'contain', padding: 4 }}
          />
        ) : (
          <span
            style={{
              fontFamily: token.fontFamilyCode,
              fontSize: 10,
              fontWeight: 600,
              textAlign: 'center',
              lineHeight: 1.15,
              padding: 2,
              wordBreak: 'break-word',
            }}
          >
            {model.ref}
          </span>
        )}
      </div>
      <div style={{ minWidth: 0 }}>
        <Typography.Text strong style={{ fontFamily: token.fontFamilyCode, display: 'block' }}>
          {model.ref}
        </Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
          {t('auth.modal.thisOne')}
        </Typography.Text>
      </div>
    </div>
  )
}

/** §8.9 / §9.2 — the state after a magic link is sent. Built, and unreachable. */
function InboxState({ address }: { address: string }) {
  return (
    <>
      <Typography.Paragraph style={{ marginBottom: 4 }}>
        {t('auth.inbox.body')}
      </Typography.Paragraph>
      <Typography.Paragraph strong copyable={{ text: address }}>
        {address}
      </Typography.Paragraph>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
        {t('auth.inbox.hint')}
      </Typography.Paragraph>
    </>
  )
}

/**
 * §12 — **the default export brings Ant Design's providers with it, the named one
 * does not.**
 *
 * `AntdRoot` left `App.tsx` so the entry chunk would stop carrying AntD's theme
 * runtime, which means every AntD island now supplies its own provider. This one
 * is opened from the shell — `AuthHost` mounts it above every route — so there is
 * no route wrapper above it to inherit from. Without this the modal would render
 * in AntD's default theme: AntD's blue instead of Casio's, a 14 px base instead
 * of §8's 16, and a radius that is not the one the rest of the site uses.
 *
 * The named export stays unwrapped because that is what the tests mount, and a
 * component that can only be rendered inside a provider it supplies itself is a
 * component whose theming cannot be varied by a test.
 */
export default function ThemedSignInModal(props: { methods?: readonly AuthMethod[] }) {
  return (
    <AntdRoot>
      <SignInModal {...props} />
    </AntdRoot>
  )
}
