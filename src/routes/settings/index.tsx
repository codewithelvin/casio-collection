import { useEffect, useMemo, useState } from 'react'
import {
  App,
  Alert,
  Button,
  Card,
  Divider,
  Input,
  Switch,
  Typography,
  theme as antdTheme,
} from 'antd'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useCatalog } from '../../catalog/client.ts'
import { useCollection, useProfile } from '../../collection/mutations.ts'
import {
  deleteOwnAccount,
  isHandleAvailable,
  updateProfile,
} from '../../collection/api.ts'
import { joinCollection } from '../../collection/join.ts'
import { downloadFile, toCsv, toJson } from '../../collection/export.ts'
import { normaliseHandle, profileUrl, validateHandle } from '../../collection/handle.ts'
import { useSessionStore } from '../../auth/session.ts'
import { useUiStore } from '../../ui/uiStore'
import { ThemeToggleRow } from '../../ui/ThemeToggleRow'
import { t } from '../../i18n/strings'

/**
 * FR-7.1 — "display name, handle, sharing toggle, theme, export and account
 * deletion". Six things, in that order, on one page.
 *
 * The order is the order of consequence: what you are called, then where you
 * live, then who can see it, then how it looks, then how to leave with your
 * data, then how to leave without it. Deletion is last and separated, because a
 * destructive control beside a preference is a destructive control somebody
 * reaches for by accident.
 */
export default function SettingsRoute() {
  const { message } = App.useApp()
  const { token } = antdTheme.useToken()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const user = useSessionStore((state) => state.user)
  const signOut = useSessionStore((state) => state.signOut)
  const { data: profile } = useProfile()
  const { data: items } = useCollection()
  const { data: catalog } = useCatalog()

  const lineSlugs = useMemo(() => (catalog?.lines ?? []).map((line) => line.slug), [catalog])

  const [displayName, setDisplayName] = useState('')
  const [handle, setHandle] = useState('')
  const [availability, setAvailability] = useState<'idle' | 'checking' | 'free' | 'taken'>('idle')
  const [saving, setSaving] = useState(false)

  // Seeded once the profile arrives, and only while the fields are untouched —
  // the same rule the note editor follows, for the same reason.
  const [seeded, setSeeded] = useState(false)
  useEffect(() => {
    if (seeded || !profile) return
    setDisplayName(profile.display_name ?? '')
    setHandle(profile.handle ?? '')
    setSeeded(true)
  }, [profile, seeded])

  const verdict = handle === '' ? null : validateHandle(handle, lineSlugs)
  const handleChanged = normaliseHandle(handle) !== (profile?.handle ?? '')

  /**
   * FR-7.2's live check, debounced, and **only when the shape is already
   * valid**. Asking the server whether `ab` is free is a request whose answer
   * cannot help: the rule refuses it before the database is consulted.
   */
  useEffect(() => {
    if (!handleChanged || verdict?.ok !== true) {
      setAvailability('idle')
      return
    }
    setAvailability('checking')
    const timer = setTimeout(() => {
      void isHandleAvailable(normaliseHandle(handle))
        .then((free) => setAvailability(free ? 'free' : 'taken'))
        .catch(() => setAvailability('idle'))
    }, 400)
    return () => clearTimeout(timer)
  }, [handle, handleChanged, verdict?.ok])

  const canSave =
    seeded && (handle === '' || verdict?.ok === true) && (!handleChanged || availability !== 'taken')

  const save = async (patch?: { is_public: boolean }) => {
    if (!user) return
    setSaving(true)
    try {
      await updateProfile(user.id, {
        display_name: displayName.trim() === '' ? null : displayName.trim(),
        handle: handle.trim() === '' ? null : normaliseHandle(handle),
        ...(patch ?? {}),
      })
      await queryClient.invalidateQueries({ queryKey: ['profile', user.id] })
      void message.success(t('settings.saved'))
    } catch {
      void message.error(t('state.error.title'))
    } finally {
      setSaving(false)
    }
  }

  const entries = catalog && items ? joinCollection(catalog, items) : []
  const isPublic = profile?.is_public ?? false
  const publicUrl = profile?.handle ? profileUrl(window.location.origin, profile.handle) : null

  return (
    <div style={{ maxWidth: 640 }}>
      <Typography.Title level={2} style={{ marginTop: 0 }}>
        {t('route.settings.title')}
      </Typography.Title>

      <Card size="small" title={t('settings.identity')} style={{ marginBottom: 16 }}>
        <label htmlFor="display-name">
          <Typography.Text strong>{t('settings.displayName')}</Typography.Text>
        </label>
        <Input
          id="display-name"
          value={displayName}
          maxLength={60}
          onChange={(event) => setDisplayName(event.target.value)}
          style={{ marginTop: 4 }}
        />
        <Typography.Paragraph type="secondary" style={{ fontSize: token.fontSizeSM, marginTop: 4 }}>
          {t('settings.displayName.hint')}
        </Typography.Paragraph>

        <label htmlFor="handle">
          <Typography.Text strong>{t('settings.handle')}</Typography.Text>
        </label>
        <Input
          id="handle"
          value={handle}
          maxLength={30}
          // `/u/` shown as the prefix, so the handle is visibly an address
          // rather than a username. It is the thing that makes FR-7.2's
          // reserved list obviously necessary rather than arbitrary.
          addonBefore="/u/"
          status={verdict && !verdict.ok ? 'error' : availability === 'taken' ? 'error' : ''}
          onChange={(event) => setHandle(event.target.value)}
          style={{ marginTop: 4 }}
        />
        {/*
          **The colour is the answer, not decoration.** This line said all four
          of its things in the same grey until the client asked for the free case
          to be green, and the request exposed a worse bug beside it: a handle
          somebody else owns put the input into `error` status — a red box — over
          a grey sentence explaining why. The control and its message disagreed.

          So all three states are stated together: invalid or taken is `danger`,
          which is what the input already shows; free is `success`; and the
          resting hint stays `secondary`, because "here is what a handle may
          contain" is not good news, it is instructions. `checking` deliberately
          stays quiet too — a colour that changes for half a second while a
          request is in flight is a flicker, not information.
        */}
        <Typography.Paragraph
          type={
            (verdict && !verdict.ok) || availability === 'taken'
              ? 'danger'
              : availability === 'free'
                ? 'success'
                : 'secondary'
          }
          style={{ fontSize: token.fontSizeSM, marginTop: 4, marginBottom: 0 }}
        >
          {verdict && !verdict.ok
            ? t(`settings.handle.${verdict.reason === 'too-short' ? 'tooShort' : verdict.reason === 'too-long' ? 'tooLong' : verdict.reason}`)
            : availability === 'checking'
              ? t('settings.handle.checking')
              : availability === 'free'
                ? t('settings.handle.free')
                : availability === 'taken'
                  ? t('settings.handle.taken')
                  : t('settings.handle.hint')}
        </Typography.Paragraph>

        <Button
          type="primary"
          loading={saving}
          disabled={!canSave}
          onClick={() => void save()}
          style={{ marginTop: 12 }}
        >
          {t('settings.save')}
        </Button>
      </Card>

      <Card size="small" title={t('settings.sharing')} style={{ marginBottom: 16 }}>
        {/* FR-7.3 — what becomes visible, said BEFORE the switch. A consequence
            explained underneath a control somebody has already flipped is not
            an explanation, it is a receipt. */}
        <Typography.Paragraph>{t('settings.sharing.explains')}</Typography.Paragraph>

        {!profile?.handle ? (
          <Alert type="info" showIcon message={t('settings.sharing.needsHandle')} />
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Switch
                checked={isPublic}
                disabled={saving}
                onChange={(next) => void save({ is_public: next })}
                aria-label={t('settings.sharing.toggle')}
              />
              <Typography.Text>{t('settings.sharing.toggle')}</Typography.Text>
            </div>

            {isPublic && publicUrl ? (
              <div style={{ marginTop: 12 }}>
                <Typography.Text strong style={{ display: 'block' }}>
                  {t('settings.sharing.url')}
                </Typography.Text>
                <Typography.Paragraph copyable={{ text: publicUrl }} style={{ marginBottom: 0 }}>
                  {publicUrl}
                </Typography.Paragraph>
              </div>
            ) : null}
          </>
        )}
      </Card>

      <Card size="small" title={t('settings.appearance')} style={{ marginBottom: 16 }}>
        <ThemeToggleRow />
      </Card>

      {/* FR-6.6 — M10's export, on the page FR-7.1 puts it. */}
      <Card size="small" title={t('settings.export')} style={{ marginBottom: 16 }}>
        <Typography.Paragraph>{t('settings.export.body')}</Typography.Paragraph>
        <Button
          onClick={() => downloadFile('casio-vault.json', toJson(entries), 'application/json')}
          disabled={entries.length === 0}
          style={{ marginInlineEnd: 8 }}
        >
          {t('settings.export.json')}
        </Button>
        <Button
          onClick={() => downloadFile('casio-vault.csv', toCsv(entries), 'text/csv')}
          disabled={entries.length === 0}
        >
          {t('settings.export.csv')}
        </Button>
      </Card>

      <Divider />

      <DangerZone
        email={user?.email ?? ''}
        onDeleted={async () => {
          await signOut()
          queryClient.clear()
          void navigate('/', { replace: true })
        }}
      />
    </div>
  )
}

/**
 * FR-7.6 — "asks the user to type their handle or email to confirm, then
 * removes the auth user and cascades every row. It is irreversible and says so."
 *
 * Typing the address rather than pressing a second button is the point: a
 * confirmation dialogue is dismissed by the same reflex that opened it, and
 * this is the one action on the site with nothing behind it.
 */
function DangerZone({ email, onDeleted }: { email: string; onDeleted: () => Promise<void> }) {
  const { token } = antdTheme.useToken()
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const matches = typed.trim().toLowerCase() === email.trim().toLowerCase() && email !== ''

  return (
    <Card
      size="small"
      title={t('settings.danger')}
      styles={{ header: { color: token.colorError } }}
      style={{ borderColor: token.colorErrorBorder }}
    >
      <Typography.Paragraph>{t('settings.danger.body')}</Typography.Paragraph>

      <label htmlFor="confirm-email">
        <Typography.Text>{t('settings.danger.confirmLabel')}</Typography.Text>
      </label>
      <Input
        id="confirm-email"
        value={typed}
        onChange={(event) => {
          setTyped(event.target.value)
          setFailed(false)
        }}
        style={{ marginTop: 4 }}
      />
      {typed !== '' && !matches ? (
        <Typography.Text type="danger" style={{ display: 'block', marginTop: 4 }}>
          {t('settings.danger.mismatch')}
        </Typography.Text>
      ) : null}
      {failed ? (
        <Alert
          type="error"
          showIcon
          style={{ marginTop: 8 }}
          message={t('settings.danger.failed')}
        />
      ) : null}

      <Button
        danger
        type="primary"
        disabled={!matches || busy}
        loading={busy}
        style={{ marginTop: 12 }}
        onClick={() => {
          setBusy(true)
          void deleteOwnAccount()
            .then(onDeleted)
            .catch(() => {
              setFailed(true)
              setBusy(false)
            })
        }}
      >
        {t('settings.danger.action')}
      </Button>
    </Card>
  )
}

/** §8.3's theme switch, on the page FR-7.1 says holds it. */
export function useThemeMode() {
  return useUiStore((state) => state.mode)
}
