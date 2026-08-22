import { useEffect, useMemo, useRef, useState } from 'react'
import { AutoComplete, Input, Typography, theme as antdTheme } from 'antd'
import type { InputRef } from 'antd'
import SearchOutlined from '@ant-design/icons/SearchOutlined'
import { useNavigate } from 'react-router-dom'
import { imageSources, useCatalog } from '../catalog/client.ts'
import { buildSearchIndex, searchCatalog } from '../catalog/search.ts'
import type { PublishedModel } from '../catalog/schema.ts'
import { LINE_ACCENTS } from '../theme/palette.ts'
import AntdRoot from './AntdRoot'
import { seeAllResults, t } from '../i18n/strings'

/**
 * FR-2 — the search field itself: the combo box, its dropdown, and the matcher
 * behind them.
 *
 * **It is a separate module from `SearchBox` because of what it imports.** The
 * combo box is AntD's AutoComplete over an Input, and between them they pull
 * rc-select, rc-virtual-list, rc-field-form and its validator — 367 KB of the
 * shell's 2.2 MB entry chunk, measured, for a control that on a phone is not
 * rendered at all until somebody taps a magnifying glass (§8.2). D40's rule was
 * to place AntD with the code that uses it rather than in a shared eager chunk;
 * this is that rule applied to the last part of the shell still ignoring it.
 *
 * Everything here runs against the catalogue already in memory (D3): no index to
 * fetch, no request per keystroke, no ranking service to disagree with. The
 * debounce is therefore not about the network — it is about not rebuilding a
 * result list on every one of eight keystrokes in `ga-2100`.
 */

/** FR-2.3 — eight, then a way to see the rest. */
const DROPDOWN_LIMIT = 8
/** FR-2.4 — no network round trip per keystroke, and no render per one either. */
const DEBOUNCE_MS = 150
/** The value the last row carries; no model id can collide with it (D2). */
const SEE_ALL = ' see-all'

export interface SearchFieldProps {
  /** Focus the input as soon as this mounts, because a tap is what mounted it. */
  autoFocus: boolean
  /** Bumped by `/` (FR-2.5) to focus a field that is already on screen. */
  focusNonce: number
  /** The field was blurred. The phone layout queues a collapse on this. */
  onBlur: () => void
  /** Cancels a queued collapse — the reader is still using this. */
  onStay: () => void
  /**
   * The field is finished with: a result was taken or a term submitted, and the
   * reader is on their way to another page. Separate from `onBlur` because that
   * one is *queued* — a blur might be a click travelling towards the dropdown —
   * and this one is not. Collapsing 200 ms after navigating away would leave the
   * field across a phone's header on the page it opened.
   */
  onClose: () => void
}

/**
 * §12 — **the field brings Ant Design with it, because it is the last piece of
 * the shell that wants it.**
 *
 * `AntdRoot` moved out of `App.tsx` so the entry chunk would stop carrying
 * AntD's theme runtime, which means anything rendering an AntD component now has
 * to supply the provider itself. Every other case is a route, and a route wraps
 * its own screen; this one is in the header, above every route, so it wraps
 * itself. Without it the AutoComplete would render in AntD's default theme —
 * AntD's blue instead of Casio's, and a 14 px base instead of §8's 16.
 */
export default function SearchField(props: SearchFieldProps) {
  return (
    <AntdRoot>
      <Field {...props} />
    </AntdRoot>
  )
}

function Field({ autoFocus, focusNonce, onBlur, onStay, onClose }: SearchFieldProps) {
  const navigate = useNavigate()
  const inputRef = useRef<InputRef>(null)

  const [term, setTerm] = useState('')
  const [debounced, setDebounced] = useState('')

  /**
   * §6.2's split put the 102 KB catalogue behind this flag, and the flag is what
   * keeps the header honest about what it costs.
   *
   * The shell renders on every URL, so a field that asked for the catalogue on
   * mount asked for it on every URL — including the 328 line and series pages
   * that already hold what they need, and the front door, which names no model at
   * all. Nobody can search without touching the field first, so the fetch waits
   * for that touch. `SearchBox` sets it from the same three intents `prefetch.ts`
   * uses for the watch route — a pointer arriving, a finger landing, a tab
   * stop — so in practice the file is in flight before the first keystroke.
   */
  const [engaged, setEngaged] = useState(autoFocus)
  const { data } = useCatalog({ enabled: engaged })

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [term])

  // Built once per catalogue rather than per keystroke. `staleTime: Infinity`
  // means `data` is the same object for the life of the session, so this memo
  // genuinely holds.
  const index = useMemo(() => (data ? buildSearchIndex(data) : null), [data])
  const hits = useMemo(() => (index ? searchCatalog(index, debounced) : []), [index, debounced])

  /**
   * Below 768 px the field does not exist until it is expanded, so focusing it
   * has to happen after the render that mounts it — and `autoFocus` on the Input
   * is not a substitute, because AntD clones it into rc-select and the prop does
   * not survive the trip. `focusNonce` covers the other case: FR-2.5's `/` on a
   * layout where the field is already on screen and merely unfocused.
   */
  useEffect(() => {
    if (autoFocus || focusNonce > 0) inputRef.current?.focus()
  }, [autoFocus, focusNonce])

  const submit = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return
    // The results page carries the term from here on, so the header hands it
    // over rather than keeping a copy across the top of a phone screen.
    onClose()
    inputRef.current?.blur()
    navigate(`/search?q=${encodeURIComponent(trimmed)}`)
  }

  const options = [
    ...hits.slice(0, DROPDOWN_LIMIT).map((model) => ({
      value: model.id,
      label: <ResultRow model={model} />,
    })),
    ...(hits.length > DROPDOWN_LIMIT
      ? [{ value: SEE_ALL, label: <SeeAllRow count={hits.length} /> }]
      : []),
  ]

  return (
    <AutoComplete
      value={term}
      options={options}
      onChange={(value: string) => {
        // Typing is engagement even where no pointer or tab stop preceded it —
        // a paste into the field, or a keyboard that reached it another way.
        setEngaged(true)
        setTerm(value)
      }}
      onFocus={() => {
        setEngaged(true)
        onStay()
      }}
      onBlur={onBlur}
      onSelect={(value: string) => {
        onStay()
        if (value === SEE_ALL) {
          submit(term)
          return
        }
        // The field empties on the way to the watch: leaving the query in the
        // header would say the site is still showing results for it.
        setTerm('')
        setDebounced('')
        onClose()
        navigate(`/watch/${value}`)
      }}
      // The dropdown is not a filter over a fixed list, so AntD's own filtering
      // would be a second, worse matcher running after FR-2.2's.
      filterOption={false}
      /*
        FR-10.1 — a designed empty state rather than AntD's "No data" box, and
        **only once something has been typed**: an empty field that opens onto
        "nothing matches that" is answering a question nobody asked. This is
        also where M8 hangs FR-9.1's *Can't find your watch?*, which is the
        other half of what a reader wants at this exact moment.

        The loading branch is new with §6.2's split and it is not decoration. The
        catalogue now arrives *after* the field does, so for a few hundred
        milliseconds a real reference genuinely has no match yet — and saying
        "nothing matches that" about a watch this catalogue holds is the one
        answer worse than saying nothing.
      */
      notFoundContent={
        debounced.trim() ? (
          <Typography.Text type="secondary">
            {index ? t('search.empty.title') : t('state.loading')}
          </Typography.Text>
        ) : null
      }
      style={{ width: '100%', maxWidth: 520 }}
    >
      <Input
        ref={inputRef}
        allowClear
        onPressEnter={() => submit(term)}
        onKeyDown={(event) => {
          // FR-2.5 — Esc closes. AntD closes the dropdown on the first press;
          // a second one gives the field back to whatever was being read.
          if (event.key === 'Escape') inputRef.current?.blur()
        }}
        prefix={<SearchOutlined />}
        placeholder={t('search.placeholder')}
        aria-label={t('search.placeholder')}
        // §8.2's 44 px touch target below 768 px and AntD's own 32 px above it.
        // A class rather than a prop, because which layout this is in is now a
        // media query — see `.cc-search-input` in shell.css.
        className="cc-search-input"
      />
    </AutoComplete>
  )
}

/**
 * FR-2.3 — a row with a thumbnail. Two of the sixty-one references carry a
 * photograph (D41) and fifty-nine do not, so the typographic tile is what this
 * list is mostly made of; §8.6 makes that a designed state rather than a hole,
 * and it has to stay designed at 32 px as well as at 400.
 */
function ResultRow({ model }: { model: PublishedModel }) {
  const { token } = antdTheme.useToken()
  const accent = LINE_ACCENTS[model.line] ?? token.colorPrimary
  const meta = [model.name, model.year].filter(Boolean).join(' · ')
  const sources = imageSources(model.image)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {sources ? (
        <img
          src={sources.src}
          srcSet={sources.srcSet}
          alt={model.ref}
          loading="lazy"
          decoding="async"
          width={32}
          height={32}
          style={{ flexShrink: 0, objectFit: 'contain' }}
        />
      ) : (
        <span
          aria-hidden
          style={{
            width: 32,
            height: 32,
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 6,
            background: `${accent}1F`,
            fontFamily: token.fontFamilyCode,
            fontSize: 9,
            fontWeight: 600,
            lineHeight: 1,
            overflow: 'hidden',
          }}
        >
          {model.ref.slice(0, 5)}
        </span>
      )}
      <span style={{ minWidth: 0 }}>
        <Typography.Text strong style={{ fontFamily: token.fontFamilyCode, display: 'block' }}>
          {model.ref}
        </Typography.Text>
        {meta ? (
          <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
            {meta}
          </Typography.Text>
        ) : null}
      </span>
    </div>
  )
}

function SeeAllRow({ count }: { count: number }) {
  return <Typography.Text type="secondary">{seeAllResults(count)}</Typography.Text>
}
