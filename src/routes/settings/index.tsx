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
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCatalog } from '../../catalog/client.ts'
import { useCollection, useProfile } from '../../collection/mutations.ts'
import {
  deleteOwnAccount,
  fetchOwnLinks,
  isHandleAvailable,
  replaceOwnLinks,
  setAvatarPublished,
  updateProfile,
  type ProfileUpdate,
} from '../../collection/api.ts'
import {
  ABOUT_MAX,
  LINK_PLATFORMS,
  LOCATION_MAX,
  buildLinkUrl,
  emptyToNull,
  isValidAbout,
  isValidBirthYear,
  isValidLink,
  normaliseLinkHandle,
  type LinkPlatform,
} from '../../collection/profileFields.ts'
import { CollectorAvatar } from '../../ui/CollectorAvatar'
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

  const save = async (patch?: ProfileUpdate) => {
    if (!user) return
    setSaving(true)
    try {
      await updateProfile(user.id, {
        display_name: displayName.trim() === '' ? null : displayName.trim(),
        handle: handle.trim() === '' ? null : normaliseHandle(handle),
        ...(patch ?? {}),
        // **FR-7.7's second half, and it has to be here rather than in the
        // handler.** 0005's `listed_needs_public` check refuses a listed row
        // that is not public, so turning sharing off while listing is on is not
        // a state that quietly resolves itself — it is a save the database
        // rejects, reported to somebody who just tried to become less visible.
        // Withdrawing the wider consent withdraws the narrower one with it.
        ...(patch?.is_public === false ? { is_listed: false } : {}),
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

            {/*
              FR-7.7 / D69 — **the second consent, and it only exists once the
              first one does.**

              Sharing means *anyone with the link*. Listing means *and you may
              put me where somebody finds me without one*. D45 already decided
              those are different sentences — it is why `/u/` is kept out of
              Google — so a directory on our own site has to ask separately or
              that decision was arbitrary.

              Nested inside the `isPublic` branch rather than merely disabled
              beside it: a switch you can see and cannot use invites the question
              "why not", and the answer is a state this page can simply not be in.
            */}
            {isPublic ? (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Switch
                    checked={profile?.is_listed ?? false}
                    disabled={saving}
                    onChange={(next) => void save({ is_listed: next })}
                    aria-label={t('settings.listing.toggle')}
                  />
                  <Typography.Text>{t('settings.listing.toggle')}</Typography.Text>
                </div>
                <Typography.Paragraph
                  type="secondary"
                  style={{ fontSize: token.fontSizeSM, marginTop: 4, marginBottom: 0 }}
                >
                  {t('settings.listing.explains')}
                </Typography.Paragraph>
              </div>
            ) : null}
          </>
        )}
      </Card>

      <AboutYou />
      <PictureCard />

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
 * FR-7.8 / D70 — the optional things a profile may say about its owner.
 *
 * **Nothing here is required and nothing here is prompted.** There is no
 * completeness meter and no wizard after sign-up — FR-4.2 is using the screen
 * after a sign-in to apply the watch somebody pressed, and a profile form
 * landing on top of that is an interruption of the one interaction this whole
 * product is about.
 *
 * The links are the part with a rule behind them: **a link is a platform and a
 * handle, never a URL** (S10). The field takes the last segment of an address
 * and `profileFields.ts` composes the rest, so `javascript:`, an open redirect
 * and a link farm are not things this form can express. `website` is the single
 * exception and is shaped at the database as well as here.
 */
function AboutYou() {
  const { message } = App.useApp()
  const { token } = antdTheme.useToken()
  const queryClient = useQueryClient()
  const user = useSessionStore((state) => state.user)
  const { data: profile } = useProfile()

  const links = useQuery({
    queryKey: ['own-links', user?.id] as const,
    queryFn: () => fetchOwnLinks(user?.id as string),
    enabled: user?.id !== undefined,
    staleTime: 30_000,
  })

  const [about, setAbout] = useState('')
  const [location, setLocation] = useState('')
  const [birthYear, setBirthYear] = useState('')
  const [handles, setHandles] = useState<Partial<Record<LinkPlatform, string>>>({})
  const [seeded, setSeeded] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (seeded || !profile || links.data === undefined) return
    setAbout(profile.about ?? '')
    setLocation(profile.location ?? '')
    setBirthYear(profile.birth_year === null ? '' : String(profile.birth_year))
    setHandles(
      Object.fromEntries(links.data.map((link) => [link.platform, link.handle])) as Partial<
        Record<LinkPlatform, string>
      >,
    )
    setSeeded(true)
  }, [profile, links.data, seeded])

  const year = birthYear.trim() === '' ? null : Number.parseInt(birthYear.trim(), 10)
  const yearOk = isValidBirthYear(Number.isNaN(year as number) ? -1 : year, new Date())
  const badLinks = LINK_PLATFORMS.filter(
    (platform) => (handles[platform] ?? '') !== '' && !isValidLink(platform, handles[platform] ?? ''),
  )
  const canSave = seeded && yearOk && badLinks.length === 0 && isValidAbout(about)

  const save = async () => {
    if (!user || !canSave) return
    setSaving(true)
    try {
      await updateProfile(user.id, {
        about: emptyToNull(about),
        location: emptyToNull(location),
        birth_year: year,
      })
      await replaceOwnLinks(
        user.id,
        LINK_PLATFORMS.filter((platform) => (handles[platform] ?? '').trim() !== '').map(
          (platform) => ({
            platform,
            handle: normaliseLinkHandle(platform, handles[platform] ?? ''),
          }),
        ),
      )
      await queryClient.invalidateQueries({ queryKey: ['profile', user.id] })
      await queryClient.invalidateQueries({ queryKey: ['own-links', user.id] })
      void message.success(t('settings.saved'))
    } catch {
      void message.error(t('state.error.title'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card size="small" title={t('settings.about')} style={{ marginBottom: 16 }}>
      {/* FR-7.11 — said beside the fields rather than once at the top, because a
          consequence explained somewhere else is a consequence nobody read. */}
      <Typography.Paragraph type="secondary" style={{ fontSize: token.fontSizeSM }}>
        {t('settings.about.public')}
      </Typography.Paragraph>

      <label htmlFor="about">
        <Typography.Text strong>{t('settings.about.label')}</Typography.Text>
      </label>
      <Input.TextArea
        id="about"
        value={about}
        maxLength={ABOUT_MAX}
        showCount
        autoSize={{ minRows: 3, maxRows: 8 }}
        onChange={(event) => setAbout(event.target.value)}
        style={{ marginTop: 4 }}
      />

      <label htmlFor="location" style={{ display: 'block', marginTop: 12 }}>
        <Typography.Text strong>{t('settings.location.label')}</Typography.Text>
      </label>
      <Input
        id="location"
        value={location}
        maxLength={LOCATION_MAX}
        onChange={(event) => setLocation(event.target.value)}
        style={{ marginTop: 4 }}
      />

      <label htmlFor="birth-year" style={{ display: 'block', marginTop: 12 }}>
        <Typography.Text strong>{t('settings.birthYear.label')}</Typography.Text>
      </label>
      <Input
        id="birth-year"
        value={birthYear}
        inputMode="numeric"
        maxLength={4}
        status={yearOk ? '' : 'error'}
        onChange={(event) => setBirthYear(event.target.value.replace(/\D/g, ''))}
        style={{ marginTop: 4, maxWidth: 160 }}
      />
      <Typography.Paragraph
        type={yearOk ? 'secondary' : 'danger'}
        style={{ fontSize: token.fontSizeSM, marginTop: 4 }}
      >
        {/* D70 — the year is stored and the age is derived, so the hint says
            what the page will show rather than what the field holds. */}
        {yearOk ? t('settings.birthYear.hint') : t('settings.birthYear.invalid')}
      </Typography.Paragraph>

      <Divider style={{ marginTop: 4 }} />

      <Typography.Text strong>{t('settings.links.label')}</Typography.Text>
      <Typography.Paragraph type="secondary" style={{ fontSize: token.fontSizeSM, marginTop: 4 }}>
        {t('settings.links.hint')}
      </Typography.Paragraph>
      {LINK_PLATFORMS.map((platform) => {
        const value = handles[platform] ?? ''
        const invalid = value !== '' && !isValidLink(platform, value)
        return (
          <div key={platform} style={{ marginBottom: 8 }}>
            <Input
              value={value}
              aria-label={t(`platform.${platform}`)}
              addonBefore={t(`platform.${platform}`)}
              status={invalid ? 'error' : ''}
              placeholder={
                platform === 'website' ? t('settings.links.websitePlaceholder') : undefined
              }
              onChange={(event) =>
                setHandles((previous) => ({ ...previous, [platform]: event.target.value }))
              }
            />
            {/* The address the site will build, shown as it is typed. It is the
                only honest way to say "we construct this" — a rule stated in
                prose beside a text box reads as a restriction, and the same rule
                shown as a working address reads as what it is. */}
            {value !== '' && !invalid && platform !== 'website' ? (
              <Typography.Text
                type="secondary"
                style={{ fontSize: token.fontSizeSM, display: 'block', marginTop: 2 }}
              >
                {buildLinkUrl(platform, value)}
              </Typography.Text>
            ) : null}
          </div>
        )
      })}

      <Button
        type="primary"
        loading={saving}
        disabled={!canSave}
        onClick={() => void save()}
        style={{ marginTop: 8 }}
      >
        {t('settings.save')}
      </Button>
    </Card>
  )
}

/**
 * FR-7.9 / D71 — the profile picture, which is the person's Google photograph
 * and is published only when they ask.
 *
 * **The browser never sends an image and there is no upload control**, which is
 * not a simplification: `profiles.avatar` is absent from 0005's update grant, so
 * the only bytes that can reach it are bytes the Edge Function fetched from
 * Google itself. That is what keeps a site with no moderation machinery (D17)
 * out of the business of hosting arbitrary images.
 */
function PictureCard() {
  const { message } = App.useApp()
  const { token } = antdTheme.useToken()
  const queryClient = useQueryClient()
  const user = useSessionStore((state) => state.user)
  const { data: profile } = useProfile()
  const [busy, setBusy] = useState(false)

  const published = (profile?.avatar ?? null) !== null

  const toggle = async (next: boolean) => {
    if (!user) return
    setBusy(true)
    try {
      const uri = await setAvatarPublished(next)
      await queryClient.invalidateQueries({ queryKey: ['profile', user.id] })
      // Publishing found no picture at Google: the switch stays off because the
      // profile row is still null, and saying so is better than a switch that
      // silently springs back.
      if (next && uri === null) void message.info(t('settings.picture.none'))
      else void message.success(t('settings.saved'))
    } catch {
      void message.error(t('state.error.title'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card size="small" title={t('settings.picture')} style={{ marginBottom: 16 }}>
      <Typography.Paragraph>{t('settings.picture.explains')}</Typography.Paragraph>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <CollectorAvatar
          handle={profile?.handle ?? ''}
          displayName={profile?.display_name ?? user?.email ?? ''}
          avatar={profile?.avatar}
          size={48}
        />
        <Switch
          checked={published}
          disabled={busy}
          onChange={(next) => void toggle(next)}
          aria-label={t('settings.picture.toggle')}
        />
        <Typography.Text>{t('settings.picture.toggle')}</Typography.Text>
      </div>
      <Typography.Paragraph
        type="secondary"
        style={{ fontSize: token.fontSizeSM, marginTop: 8, marginBottom: 0 }}
      >
        {t('settings.picture.hint')}
      </Typography.Paragraph>
    </Card>
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
