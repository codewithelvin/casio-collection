import { Input, Typography, theme as antdTheme } from 'antd'
import type { BrowseModel } from '../catalog/schema.ts'
import { NOTE_MAX, useNote } from '../collection/mutations.ts'
import { t } from '../i18n/strings'

/**
 * FR-5 — one note per marked watch.
 *
 * It renders **only where the watch is marked**, because FR-5.1 says a note
 * belongs to a mark. An empty note field on an unmarked watch would be a place
 * to type something that has nowhere to be stored.
 *
 * FR-5.3 is mostly a list of things this does not do: no Markdown, no HTML, no
 * links parsed. A `TextArea` holds and returns exactly what was typed and React
 * escapes it on the way back out, so "escaped on render" costs nothing here as
 * long as nobody reaches for `dangerouslySetInnerHTML` — which S4 forbids and
 * the lint rule enforces.
 */
export function NoteEditor({ model }: { model: BrowseModel }) {
  const { token } = antdTheme.useToken()
  const note = useNote(model)

  return (
    <div style={{ marginTop: 16 }}>
      <Typography.Text strong style={{ display: 'block', marginBottom: 6 }}>
        {t('note.heading')}
      </Typography.Text>

      <Input.TextArea
        value={note.value}
        onChange={(event) => note.change(event.target.value)}
        // FR-5.2 — blur and the explicit Save are the same action, so there is
        // one of them. A separate button would be a second way to do the thing
        // that already happened, which is how a *Saved* indicator stops being
        // believed.
        onBlur={note.save}
        placeholder={t('note.placeholder')}
        aria-label={t('note.heading')}
        maxLength={NOTE_MAX}
        autoSize={{ minRows: 3, maxRows: 10 }}
        // **`showCount` is deliberately off, and the count is drawn below
        // instead.** AntD renders it absolutely positioned 22 px *under* the
        // field — outside the box it belongs to — so it landed on top of the row
        // beneath: on a phone it sat across the "your profile is published"
        // sentence, and on a desktop it collided with *Saved*, both reported by
        // the client. There is no AntD prop that moves it, and padding the row
        // down to clear it would leave a floating number in a gap.
        //
        // What the count is *for* survives intact, and it is not decoration:
        // §6.3 caps the column at 2 000, and a note refused by the database
        // after being typed is the worst possible moment to mention a limit.
        // `maxLength` is what enforces it either way.
      />

      {/*
        One flex row that owns all three items, which is the whole fix: nothing
        here is positioned, so nothing can overlap anything.

        It wraps rather than shrinks. The privacy sentence is a sentence and the
        two on the right are short, so at 360 px the sentence takes the first
        line and the pair drops below it; there is no width at which the sentence
        is squeezed into a column one word wide.
      */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          columnGap: 12,
          rowGap: 2,
          marginTop: 6,
          fontSize: token.fontSizeSM,
          color: token.colorTextTertiary,
        }}
      >
        {/* FR-5.4 — said here, while they are typing, and not on a settings
            page they visited last week. Which sentence appears is the whole
            point: publishing a profile publishes the notes with it (D9).

            `minWidth: 0` so a long sentence wraps inside its track instead of
            widening the row and pushing the count off the edge. */}
        <span style={{ flex: '1 1 auto', minWidth: 0 }}>
          {note.isPublic ? t('note.public') : t('note.private')}
        </span>

        {/* The save state and the count travel together and never wrap between
            themselves, so the count keeps one position on the right whether or
            not *Saved* is currently showing. */}
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'baseline',
            gap: 8,
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          <SaveState status={note.status} />
          <span>{`${note.value.length} / ${NOTE_MAX}`}</span>
        </span>
      </div>
    </div>
  )
}

/**
 * FR-5.2's indicator. It is deliberately three words and no icon: what it has to
 * answer is "is my typing safe", and anything more decorative than that reads as
 * a control and gets pressed.
 */
function SaveState({ status }: { status: ReturnType<typeof useNote>['status'] }) {
  if (status === 'idle') return null
  if (status === 'failed') {
    return <Typography.Text type="danger">{t('note.failed')}</Typography.Text>
  }
  return (
    <Typography.Text type="secondary" style={{ whiteSpace: 'nowrap' }}>
      {status === 'saving' ? t('note.saving') : t('note.saved')}
    </Typography.Text>
  )
}
