import { t } from '../i18n/strings'

/**
 * D39 renames the repository to `casio-vault` and this line was written against
 * that name — but **the rename has not been done**, so the link 404s on the live
 * site. An audit found it; a visitor would have found it too.
 *
 * It points at the repository that exists. The day the rename happens, GitHub
 * redirects the old name indefinitely, so this keeps working either way — which
 * is exactly why D39 says the rename has to be a deliberate act rather than
 * something noticed when it breaks.
 */
const REPO_URL = 'https://github.com/codewithelvin/casio-collection'

/**
 * FR-10.3 — in this order: the D11 non-affiliation notice, the image
 * attribution, the source link, the catalogue version, and the closing line.
 *
 * **The whole footer is small print now, and that is a client instruction
 * overriding §8.11.** The sizes are in `.cc-footer`; the reason they are being
 * argued with here is that §8.11 asked for the opposite in writing, and the
 * argument is worth keeping so nobody "fixes" this back:
 *
 *   * §8.11 wanted the disclaimer as **legible body text and not small print**,
 *     because the name starts with theirs, the mark is their bezel (D34) and the
 *     colour is their corporate blue. Together those read as an official Casio
 *     property, which is precisely what D11 says this is not — so the sentence
 *     that says so was set at body size, paying for the design.
 *   * D39 removed one leg of that argument and not the sentence. The old name
 *     *was* a Casio product line (D21) and "Vault" is nobody's; but "Casio" is
 *     still the first word, on a domain that is now casiovault.com, which if
 *     anything reads more like a property than a project path did.
 *
 * So the notice is now 12 px rather than 16. It is still first, still in the
 * normal text colour rather than the quiet one, and still a full step larger
 * than the metadata beneath it — the *hierarchy* §8.11 was reaching for
 * survives, the absolute size does not. If a lawyer ever asks, the answer is
 * this paragraph and the client's call, not an oversight.
 *
 * Everything *else* is one wrapping line, which is the whole shape of this
 * component. Four stacked paragraphs took a screenful on a phone for content
 * that is legally required rather than useful, and principle 5 says the phone is
 * the real device. The attribution, the source link and the version are metadata
 * and read as metadata, and the closing line stays last because FR-10.3 says the
 * footer closes with it.
 */
export function Footer({ catalogVersion }: { catalogVersion?: string | null }) {
  // A separator glyph rather than a string: it is punctuation between items,
  // it is hidden from assistive technology, and there is nothing in it for a
  // second locale to translate. D12's rule is about user-facing *text*, which is
  // why this is written as an expression and not as JSX text.
  const separator = (
    <span aria-hidden="true" style={{ opacity: 0.5 }}>
      {'·'}
    </span>
  )

  return (
    <footer className="cc-footer">
      <div className="cc-footer-inner">
        {/* Sized by `.cc-footer` in `shell.css` — see the note above about the
            client's instruction, and the note there about how far down it went.
            No `maxWidth`, and that was measured: a 68ch measure reads better in
            the abstract and wrapped this sentence onto a second line at 1280 px,
            making the footer *taller* on desktop while saving nothing on the
            phone. The 960 container is the only limit it needs. */}
        <p className="cc-footer-notice">{t('footer.disclaimer')}</p>
        <p className="cc-quiet cc-footer-meta">
          <span>{t('footer.attribution')}</span>
          {separator}
          <a href={REPO_URL} rel="noreferrer noopener" target="_blank">
            {t('footer.source')}
          </a>
          {/* The catalogue version renders only once there is one. A zero or an
              em-dash here would be inventing a fact about data that does not
              exist yet (principle 4). */}
          {catalogVersion ? (
            <>
              {separator}
              <span>
                {t('footer.catalogVersion')} {catalogVersion}
              </span>
            </>
          ) : null}
          {separator}
          {/* Quieter still than the metadata beside it, which is the one place
              this footer has a voice rather than a duty. */}
          <span style={{ opacity: 0.75 }}>{t('footer.madeBy')}</span>
        </p>
      </div>
    </footer>
  )
}
