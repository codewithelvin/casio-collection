import { useEffect, useState } from 'react'
import { Button, Input, Modal, Typography } from 'antd'
import { useLocation } from 'react-router-dom'
import { submitCatalogRequest } from '../collection/api.ts'
import { useSessionStore } from '../auth/session.ts'
import { writePendingIntent } from '../auth/pendingIntent.ts'
import { useUiStore } from './uiStore'
import { t } from '../i18n/strings'

/**
 * §3.8 / D22 — **the missing-reference report, and the only writable thing on
 * this site that is not somebody's own collection row.**
 *
 * D22's decision is that nothing a visitor types enters the catalogue. This
 * form's whole job is to be honest about that: it says a person will look it
 * up, and FR-9.4 requires it to say so in plain terms rather than confirming
 * with a tick that implies a pipeline.
 *
 * FR-9.6 means there is no reading side at all — no queue, no status, no
 * history. The table has no select policy (§6.4), so this component could not
 * show one if it wanted to, which is the right way round: the design is in the
 * database rather than in a component remembering not to fetch.
 */
export function ReportMissing({ prefill = '' }: { prefill?: string }) {
  const [open, setOpen] = useState(false)

  const status = useSessionStore((state) => state.status)
  const promptSignIn = useSessionStore((state) => state.promptSignIn)
  const requestDraft = useUiStore((state) => state.requestDraft)
  const setRequestDraft = useUiStore((state) => state.setRequestDraft)
  const location = useLocation()

  /**
   * FR-9.3's return. The callback route puts the draft here after consuming
   * §9.4's slot; this picks it up, opens the form, and clears it so a second
   * grid on the same page does not open a second dialogue over the first.
   */
  useEffect(() => {
    if (!requestDraft) return
    setOpen(true)
    setRequestDraft(null)
  }, [requestDraft, setRequestDraft])

  // §14.2 — no project, nothing to write to. Same rule as everywhere else.
  if (status === 'unavailable') return null

  const onPress = () => {
    if (status !== 'authenticated') {
      /**
       * FR-9.3 — "the draft survives the round trip through the same
       * single-slot mechanism as §9.4". The reference the reader already typed
       * into the search box is the draft, and it is written before the modal
       * opens for the same reason the Owned press is.
       */
      writePendingIntent({
        kind: 'request',
        ref: prefill.trim().slice(0, 40) || '??',
        returnTo: `${location.pathname}${location.search}`,
      })
      promptSignIn()
      return
    }
    setOpen(true)
  }

  return (
    <>
      {/* FR-9.1 — at the foot of every grid and in the search empty state, the
          two places the gap is actually noticed. Quiet by design: it is an
          offer, not a call to action. */}
      <Button type="link" onClick={onPress}>
        {t('request.trigger')}
      </Button>

      {open ? <ReportDialog prefill={prefill} onClose={() => setOpen(false)} /> : null}
    </>
  )
}

function ReportDialog({ prefill, onClose }: { prefill: string; onClose: () => void }) {
  const userId = useSessionStore((state) => state.user?.id ?? null)

  const [ref, setRef] = useState(prefill.trim().slice(0, 40))
  const [link, setLink] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (ref.trim().length < 2) {
      setError(t('request.ref.required'))
      return
    }
    if (!userId) return

    setBusy(true)
    setError(null)
    try {
      await submitCatalogRequest(userId, { ref, link, note })
      setSent(true)
    } catch (caught) {
      /**
       * Two refusals come back from the database rather than from this form,
       * and both are ordinary rather than exceptional — FR-9.5's cap is a
       * policy check and the repeat is a unique index. Rendering either as
       * "something went wrong" would be this form blaming the reader for a
       * rule it never told them about.
       */
      const text = caught instanceof Error ? caught.message : ''
      if (/duplicate key|unique/i.test(text)) setError(t('request.duplicate'))
      else if (/row-level security|violates/i.test(text)) setError(t('request.capped'))
      else setError(t('request.failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onCancel={onClose}
      centered
      width={460}
      title={sent ? t('request.sent.title') : t('request.title')}
      styles={{ content: { padding: 20 } }}
      footer={
        sent ? (
          <Button type="primary" onClick={onClose}>
            {t('auth.close')}
          </Button>
        ) : (
          <>
            <Button onClick={onClose}>{t('request.cancel')}</Button>
            <Button type="primary" loading={busy} onClick={() => void submit()}>
              {t('request.submit')}
            </Button>
          </>
        )
      }
    >
      {sent ? (
        // FR-9.4 — plain terms, and it says out loud that it is not automatic.
        <Typography.Paragraph style={{ marginBottom: 0 }}>
          {t('request.sent.body')}
        </Typography.Paragraph>
      ) : (
        <>
          <Typography.Paragraph type="secondary">{t('request.lead')}</Typography.Paragraph>

          <Input
            aria-label={t('request.ref')}
            placeholder={t('request.ref.placeholder')}
            value={ref}
            maxLength={40}
            status={error ? 'error' : ''}
            onChange={(event) => setRef(event.target.value)}
            style={{ marginBottom: 8 }}
          />
          <Input
            aria-label={t('request.link')}
            placeholder="https://"
            value={link}
            maxLength={500}
            onChange={(event) => setLink(event.target.value)}
            style={{ marginBottom: 8 }}
          />
          <Input.TextArea
            aria-label={t('request.note')}
            value={note}
            maxLength={500}
            autoSize={{ minRows: 2, maxRows: 5 }}
            onChange={(event) => setNote(event.target.value)}
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
