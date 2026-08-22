import { WarningIcon } from './icons'
import { t } from '../i18n/strings'

/**
 * FR-10.1 — the catalogue failed to load or failed to parse.
 *
 * Both failures land here on purpose. A 404 from the CDN and a Zod error from a
 * stale cached artefact are the same event to a reader — the catalogue is not
 * usable — and the only useful thing either can offer is *try again*, because
 * both are very often transient. The underlying message is not rendered: it
 * names a file path and a schema, which tells a visitor nothing and tells a
 * scraper something.
 *
 * **This was AntD's `Result` and is now the three boxes `Result` would have
 * drawn**, at the same sizes, because of what `Result` cost to have available:
 * 42 KB unminified, most of it the three full-page SVG illustrations for 403,
 * 404 and 500 that `status="warning"` does not use. The front door imports this
 * one — it is where the catalogue index arriving badly is caught — so it was in
 * the first load of the site's most-visited URL, and had not failed there yet.
 *
 * D28's rule is that a budget failure is answered with a named mitigation and
 * "narrower AntD imports" is the first one it names. The geometry is `Result`'s
 * own — 48/32 px padding, a 72 px glyph, 24 px under it, a 24 px heading, 24 px
 * above the action — so this renders as what it replaced rather than as a
 * smaller version of it.
 */
export function ErrorState({ onRetry }: { onRetry?: (() => void) | undefined }) {
  return (
    <div className="cc-state" role="alert">
      <div className="cc-state-icon" style={{ color: 'var(--cc-warning)' }}>
        <WarningIcon />
      </div>
      {/*
        A heading, where Result renders a plain div. This component is what a
        whole page becomes when it fails, so without one the region a screen
        reader lands in has no heading at all. 24 px is Result's own size for it,
        which is between this project's h3 and h4 and so is set directly.
      */}
      <h2 className="cc-h3" style={{ margin: 0, fontSize: 24 }}>
        {t('state.error.title')}
      </h2>
      {onRetry ? (
        <div style={{ marginTop: 24 }}>
          <button type="button" className="cc-button cc-button-primary" onClick={onRetry}>
            {t('state.error.retry')}
          </button>
        </div>
      ) : null}
    </div>
  )
}
