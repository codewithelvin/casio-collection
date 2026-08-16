import { Layout, theme as antdTheme } from 'antd'
import { t } from '../i18n/strings'

const REPO_URL = 'https://github.com/codewithelvin/casio-collection'

/**
 * FR-10.3 — in this order: the D11 non-affiliation notice, the image
 * attribution, the source link, the catalogue version, and the closing line.
 *
 * §8.11 is explicit that the disclaimer is **legible body text and not small
 * print**, and the reason is worth keeping next to the code: the name is
 * Casio's product line (D21), the mark is their bezel (D34) and the colour is
 * their corporate blue. Together those read as an official Casio property,
 * which is precisely what D11 says this is not. This sentence is what pays for
 * the design — so it is set at body size in the normal text colour, and the
 * jokey line below it is the one that gets muted.
 */
export function Footer({ catalogVersion }: { catalogVersion?: string | null }) {
  const { token } = antdTheme.useToken()

  return (
    <Layout.Footer
      style={{
        borderTop: `1px solid ${token.colorBorderSecondary}`,
        padding: '24px 16px',
        background: token.colorBgContainer,
      }}
    >
      <div style={{ maxWidth: 960, margin: '0 auto', display: 'grid', gap: 8 }}>
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
            fontSize: token.fontSize,
            lineHeight: token.lineHeight,
            color: token.colorTextSecondary,
          }}
        >
          {t('footer.attribution')}
        </p>
        <p style={{ margin: 0, fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>
          <a href={REPO_URL} rel="noreferrer noopener" target="_blank">
            {t('footer.source')}
          </a>
          {/* The catalogue version renders only once there is one. A zero or an
              em-dash here would be inventing a fact about data that does not
              exist yet (principle 4). */}
          {catalogVersion ? (
            <>
              {' · '}
              {t('footer.catalogVersion')} {catalogVersion}
            </>
          ) : null}
        </p>
        <p
          style={{
            margin: '4px 0 0',
            fontSize: token.fontSizeSM,
            color: token.colorTextTertiary,
          }}
        >
          {t('footer.madeBy')}
        </p>
      </div>
    </Layout.Footer>
  )
}
