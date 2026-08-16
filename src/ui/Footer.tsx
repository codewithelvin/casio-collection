import { Layout, theme as antdTheme } from 'antd'
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
 * §8.11 is explicit that the disclaimer is **legible body text and not small
 * print**, and the reason is worth keeping next to the code: the name starts
 * with theirs, the mark is their bezel (D34) and the colour is their corporate
 * blue. Together those read as an official Casio property, which is precisely
 * what D11 says this is not. This sentence is what pays for the design — so it
 * is set at body size in the normal text colour.
 *
 * D39 removed one leg of that argument and not the sentence. The old name *was*
 * a Casio product line (D21), and "Vault" is nobody's; but "Casio" is still the
 * first word, on a domain that is now casiovault.com, which if anything reads
 * more like a property than a project path did.
 *
 * Everything *else* is one wrapping line of small print, which is the whole
 * shape of this component. Four stacked paragraphs took a screenful on a phone
 * for content that is legally required rather than useful, and principle 5 says
 * the phone is the real device. The requirement is that the **notice** carries
 * weight, not that the footer does: the attribution, the source link and the
 * version are metadata and read as metadata, and the closing line stays last
 * because FR-10.3 says the footer closes with it.
 */
export function Footer({ catalogVersion }: { catalogVersion?: string | null }) {
  const { token } = antdTheme.useToken()

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
    <Layout.Footer
      style={{
        borderTop: `1px solid ${token.colorBorderSecondary}`,
        padding: '12px 16px',
        background: token.colorBgContainer,
      }}
    >
      <div style={{ maxWidth: 960, margin: '0 auto', display: 'grid', gap: 4 }}>
        <p
          style={{
            margin: 0,
            fontSize: token.fontSize,
            lineHeight: token.lineHeight,
            color: token.colorText,
          }}
        >
          {t('footer.disclaimer')}
        </p>
        <p
          style={{
            margin: 0,
            display: 'flex',
            flexWrap: 'wrap',
            columnGap: 6,
            rowGap: 2,
            fontSize: token.fontSizeSM,
            lineHeight: token.lineHeightSM,
            color: token.colorTextSecondary,
          }}
        >
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
          <span style={{ color: token.colorTextTertiary }}>{t('footer.madeBy')}</span>
        </p>
      </div>
    </Layout.Footer>
  )
}
