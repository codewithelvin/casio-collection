import { useState } from 'react'
import { Button, Input, Modal, Select, Typography, theme as antdTheme } from 'antd'
import type { BrowseModel } from '../catalog/schema.ts'
import {
  SUGGESTION_FIELDS,
  buildSuggestion,
  draftFromModel,
  invalidFields,
  isSendable,
  type SuggestionDraft,
} from '../suggest/suggestion.ts'
import { isSuggestionConfigured, sendSuggestion } from '../suggest/send.ts'
import { displayLabel, featureLabel, movementLabel, t } from '../i18n/strings'

/**
 * **Improve this entry** — the client's ask of 2026-08-22, and the second
 * writable thing on this site after D22's missing-reference report.
 *
 * The two are deliberately alike and differ in exactly two ways. This one needs
 * no account, because the person who knows a case width is usually the person
 * holding the watch and they have no reason to sign in to tell us. And it goes
 * to the maintainer as **email** rather than into a table, because the client
 * asked for it that way — which is why the credentials live in an Edge Function
 * and not here. A mail API key in a static bundle is a key anyone can read, and
 * one that sends as our own domain (D14 makes that point about a key that is
 * *safe* to ship; this is the other side of it).
 *
 * What has not changed is the rule underneath: nothing a visitor types enters
 * the catalogue. §10.8 and rule 3 both say a fact needs a page it was read off,
 * and a form cannot supply one — so this collects a lead, addressed to a person.
 */
export function ImproveEntry({ model }: { model: BrowseModel }) {
  const [open, setOpen] = useState(false)

  // §14.2 — the endpoint is a Supabase function, so with no project configured
  // there is nowhere to send. Same rule as the report form: an offer that opens
  // onto nothing is worse than no offer.
  if (!isSuggestionConfigured()) return null

  return (
    <>
      {/* Quiet, like the report trigger it sits beside in spirit: an offer at
          the foot of the page rather than a call to action over the watch. */}
      <Button type="link" style={{ paddingInline: 0 }} onClick={() => setOpen(true)}>
        {t('improve.trigger')}
      </Button>

      {/* Mounted only while open, so a catalogue page carries none of this
          form's state — and so the draft is rebuilt from the model each time
          rather than remembering what somebody half-typed about another watch. */}
      {open ? <ImproveDialog model={model} onClose={() => setOpen(false)} /> : null}
    </>
  )
}

function ImproveDialog({ model, onClose }: { model: BrowseModel; onClose: () => void }) {
  const { token } = antdTheme.useToken()
  const [draft, setDraft] = useState<SuggestionDraft>(() => draftFromModel(model))
  /**
   * The honeypot. A field no person can see, hidden from assistive technology
   * and skipped by the tab order, so anything in it was typed by a script — and
   * the send is dropped **client-side and silently**, because telling a bot why
   * it failed is how it learns to pass.
   */
  const [trap, setTrap] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const bad = invalidFields(draft)
  const sendable = isSendable(model, draft)

  const set = (key: string, value: string) =>
    setDraft((current) => ({ ...current, values: { ...current.values, [key]: value } }))

  const submit = async () => {
    if (!sendable) {
      setError(bad.length > 0 ? t('improve.invalid') : t('improve.nothing'))
      return
    }
    if (trap !== '') {
      // Looks sent, sends nothing.
      setSent(true)
      return
    }

    setBusy(true)
    setError(null)
    try {
      await sendSuggestion(buildSuggestion(model, draft, window.location.href))
      setSent(true)
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : ''
      setError(/HTTP 429/.test(text) ? t('improve.capped') : t('improve.failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onCancel={onClose}
      centered
      width={620}
      title={sent ? t('improve.sent.title') : `${t('improve.title')} — ${model.ref}`}
      styles={{ content: { padding: 20 }, body: { maxHeight: '62vh', overflowY: 'auto' } }}
      footer={
        sent ? (
          <Button type="primary" onClick={onClose}>
            {t('auth.close')}
          </Button>
        ) : (
          <>
            <Button onClick={onClose}>{t('improve.cancel')}</Button>
            <Button
              type="primary"
              loading={busy}
              disabled={!sendable}
              onClick={() => void submit()}
            >
              {t('improve.send')}
            </Button>
          </>
        )
      }
    >
      {sent ? (
        <Typography.Paragraph style={{ marginBottom: 0 }}>
          {t('improve.sent.body')}
        </Typography.Paragraph>
      ) : (
        <>
          <Typography.Paragraph type="secondary">{t('improve.lead')}</Typography.Paragraph>

          {/* Two columns on anything wider than a phone, one below it, from the
              same wrap the watch page uses rather than a breakpoint. */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 12,
              marginBottom: 16,
            }}
          >
            {SUGGESTION_FIELDS.map((field) => {
              const label = t(field.label)
              return (
                <label key={field.key} style={{ display: 'block' }}>
                  <Typography.Text
                    type="secondary"
                    style={{ display: 'block', fontSize: token.fontSizeSM, marginBottom: 4 }}
                  >
                    {field.unit ? `${label} (${field.unit})` : label}
                  </Typography.Text>

                  {field.kind === 'multi' ? (
                    <Select
                      mode="multiple"
                      aria-label={label}
                      value={draft.features}
                      options={(field.options ?? []).map((value) => ({
                        value,
                        label: featureLabel(value),
                      }))}
                      onChange={(features: string[]) =>
                        setDraft((current) => ({ ...current, features }))
                      }
                      style={{ width: '100%' }}
                      // A watch can carry a dozen of these and the modal is not
                      // the place to show all thirty-eight at once.
                      maxTagCount="responsive"
                    />
                  ) : field.kind === 'enum' ? (
                    <Select
                      allowClear
                      aria-label={label}
                      // `undefined` and not `''`: AntD shows the placeholder for
                      // the first and an empty selected item for the second.
                      value={draft.values[field.key] || undefined}
                      options={(field.options ?? []).map((value) => ({
                        value,
                        label: field.key === 'display' ? displayLabel(value) : movementLabel(value),
                      }))}
                      onChange={(value: string | undefined) => set(field.key, value ?? '')}
                      style={{ width: '100%' }}
                    />
                  ) : (
                    <Input
                      aria-label={label}
                      value={draft.values[field.key] ?? ''}
                      maxLength={80}
                      status={bad.includes(field.key) ? 'error' : ''}
                      // `text` rather than `number`, even for the numbers: a
                      // number input silently drops what it cannot parse, and a
                      // reader who types "42,8" deserves to be told rather than
                      // to watch their comma disappear. `invalidFields` says so.
                      inputMode={field.kind === 'number' ? 'decimal' : 'text'}
                      onChange={(event) => set(field.key, event.target.value)}
                    />
                  )}
                </label>
              )
            })}
          </div>

          <Typography.Text
            type="secondary"
            style={{ display: 'block', fontSize: token.fontSizeSM, marginBottom: 4 }}
          >
            {t('improve.link')}
          </Typography.Text>
          <Input
            aria-label={t('improve.link')}
            placeholder="https://"
            value={draft.link}
            maxLength={500}
            onChange={(event) => setDraft((current) => ({ ...current, link: event.target.value }))}
          />
          <Typography.Paragraph
            type="secondary"
            style={{ fontSize: token.fontSizeSM, marginTop: 4, marginBottom: 12 }}
          >
            {t('improve.link.hint')}
          </Typography.Paragraph>

          <Input.TextArea
            aria-label={t('improve.note')}
            placeholder={t('improve.note')}
            value={draft.note}
            maxLength={1000}
            autoSize={{ minRows: 2, maxRows: 6 }}
            onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
            style={{ marginBottom: 12 }}
          />

          <Input
            aria-label={t('improve.email')}
            placeholder={t('improve.email')}
            type="email"
            value={draft.email}
            maxLength={200}
            onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))}
          />

          {/* The honeypot, and the reason it is not `display: none`: some bots
              skip hidden inputs. It is off-screen, unreachable by tab, and
              hidden from screen readers, so no person can fill it in. */}
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            value={trap}
            onChange={(event) => setTrap(event.target.value)}
            style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
          />

          {error ? (
            <Typography.Text type="danger" style={{ display: 'block', marginTop: 8 }}>
              {error}
            </Typography.Text>
          ) : null}
        </>
      )}
    </Modal>
  )
}
