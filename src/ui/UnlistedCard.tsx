import { Card, Tag, Typography, theme as antdTheme } from 'antd'
import type { CollectionItem } from '../collection/api.ts'
import { t } from '../i18n/strings'

/**
 * FR-6.5 — **a marked model whose id the catalogue no longer carries.**
 *
 * This card is the visible half of the failure mode D1 accepts. There is no SQL
 * join between a watch and a collection row, so nothing stops a row outliving
 * the entry it points at — and the requirement is unambiguous about what must
 * not happen: *it is never silently dropped*. A collection that quietly returns
 * eight watches when the user marked nine is the one bug in this product that
 * would destroy trust in all of it, and it would never be reported, because
 * nobody counts.
 *
 * So it renders as itself. The raw id is shown, because the id is genuinely all
 * that is left — the reference code lived in the catalogue entry that is gone —
 * and it is set in the mono face for the same reason every reference is.
 *
 * It is deliberately **not a link**. There is nothing to open.
 */
export function UnlistedCard({ item }: { item: CollectionItem }) {
  const { token } = antdTheme.useToken()

  return (
    <Card
      styles={{ body: { padding: 12 } }}
      style={{
        height: '100%',
        borderTop: `3px solid ${token.colorWarning}`,
        borderStyle: 'dashed',
      }}
    >
      <div
        style={{
          aspectRatio: '1 / 1',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: 12,
          textAlign: 'center',
          background: token.colorFillQuaternary,
          marginBottom: 12,
        }}
      >
        <span
          style={{
            fontFamily: token.fontFamilyCode,
            fontSize: 'clamp(14px, 3.6vw, 22px)',
            fontWeight: 600,
            lineHeight: 1.15,
            wordBreak: 'break-word',
            color: token.colorText,
          }}
        >
          {item.model_id}
        </span>
        <Tag color="warning" style={{ marginInlineEnd: 0 }}>
          {t('collection.unlisted.badge')}
        </Tag>
      </div>

      <Typography.Paragraph
        type="secondary"
        style={{ fontSize: token.fontSizeSM, marginBottom: 0 }}
      >
        {t('collection.unlisted.body')}
      </Typography.Paragraph>
    </Card>
  )
}
