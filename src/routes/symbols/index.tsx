import { useEffect } from 'react'
import { SymbolGlyph } from './SymbolGlyph'
import { SYMBOL_GROUPS, manualUrl, type WatchSymbol } from './symbols.ts'
import { t } from '../../i18n/strings'
import './symbols.css'

/**
 * The display-symbol glossary: what the little words on a digital Casio mean.
 *
 * **It renders no Ant Design, and it needs none (§12).** This is a heading, a
 * jump list and three dozen rows of text — there is no grid of watches, no
 * filter bar and no control on the page beyond an anchor. Wrapping it would
 * pull the theme runtime onto a page whose entire job is to be readable, so it
 * is registered in the route table beside the front door rather than with
 * `themed()`, and it is styled by `symbols.css` over the same custom properties
 * the shell uses.
 *
 * **It reads no catalogue, not even the index.** Every other content screen on
 * this site waits on an artefact before it can draw; this one is a document. A
 * reader who arrives here from a search engine with a watch in their hand gets
 * the answer in the first paint, and the page works offline for the same reason.
 * That is also why it has no loading, error or empty state — there is nothing
 * for it to be empty of.
 */
export default function SymbolsRoute() {
  // The title, as the other screens do it. Restored on unmount so a navigation
  // away does not leave this page's title over somebody else's.
  useEffect(() => {
    const previous = document.title
    document.title = `${t('route.symbols.title')} · ${t('app.name')}`
    return () => {
      document.title = previous
    }
  }, [])

  return (
    <div>
      <h2 className="cc-h2" style={{ marginTop: 0 }}>
        {t('symbols.heading')}
      </h2>
      <p className="cc-lead cc-sym-lead">{t('symbols.lead')}</p>

      {/* A nav landmark, so it can be skipped in one press rather than tabbed
          through nine links at a time. */}
      <nav aria-label={t('symbols.jump')}>
        <ul className="cc-sym-jump">
          {SYMBOL_GROUPS.map((group) => (
            <li key={group.id}>
              <a href={`#${group.id}`}>{t(`symbols.group.${group.id}`)}</a>
            </li>
          ))}
        </ul>
      </nav>

      {SYMBOL_GROUPS.map((group) => (
        <section key={group.id} className="cc-sym-group" aria-labelledby={`${group.id}-heading`}>
          {/* h3 under the page's h2, and the jump links land on it. Skipping to
              h4 would leave a hole in the outline a screen reader navigates by —
              the same `heading-order` rule the front door's comment cites. */}
          <h3 className="cc-h3" id={`${group.id}-heading`}>
            <span id={group.id}>{t(`symbols.group.${group.id}`)}</span>
          </h3>
          <ul className="cc-sym-list">
            {group.symbols.map((symbol) => (
              <SymbolRow key={symbol.id} symbol={symbol} />
            ))}
          </ul>
        </section>
      ))}

      {/* D25's sentence, made visible. The page has just made every claim on it; this
          is what they rest on and what they do not cover. */}
      <aside className="cc-sym-note">
        <p>{t('symbols.note.scope')}</p>
        <p>{t('symbols.note.variance')}</p>
        <p>{t('symbols.note.affiliation')}</p>
      </aside>
    </div>
  )
}

/**
 * One indicator: what it looks like, what it means, and where that was read.
 *
 * The chip is a `token` **or** a drawing, never both — two answers to "what does
 * it look like" in one cell is a row that reads as two rows. Which one a symbol
 * gets is decided in the data, where the manual's own treatment of it is known.
 */
function SymbolRow({ symbol }: { symbol: WatchSymbol }) {
  return (
    <li className="cc-sym-row">
      <div>
        <span className="cc-sym-chip">
          {symbol.token ? symbol.token : symbol.icon ? <SymbolGlyph icon={symbol.icon} /> : null}
        </span>
      </div>
      <div>
        <p className="cc-sym-name">{symbol.name}</p>
        <p className="cc-sym-meaning">{symbol.meaning}</p>
        {/* D27 — the row disappears rather than rendering a label with nothing
            after it. Most symbols have no caveat worth a second paragraph. */}
        {symbol.detail ? <p className="cc-sym-detail">{symbol.detail}</p> : null}
        <p className="cc-sym-source">
          <span>{t('symbols.definedIn')}</span>{' '}
          {symbol.modules.map((module, index) => (
            <span key={module}>
              {index > 0 ? <span aria-hidden="true">{', '}</span> : null}
              <a href={manualUrl(module)} rel="noreferrer noopener" target="_blank">
                {module}
              </a>
            </span>
          ))}
        </p>
      </div>
    </li>
  )
}
