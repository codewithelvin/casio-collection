import { Typography } from 'antd'
import { t, type StringKey } from '../i18n/strings'

/**
 * M0 ships the shell, not the screens. Every route below renders this so the
 * routing, the deep links and the 404 fallback can be proven end to end before
 * there is any catalogue to show — and so an early visitor is told plainly that
 * the screen is unbuilt rather than shown an empty grid that looks broken.
 *
 * Each milestone deletes one of these.
 */
export function Placeholder({
  titleKey,
  detail,
}: {
  titleKey: StringKey
  detail?: string | undefined
}) {
  return (
    <div style={{ maxWidth: 720 }}>
      <Typography.Title level={2} style={{ marginTop: 0 }}>
        {t(titleKey)}
      </Typography.Title>
      {detail ? <Typography.Paragraph>{detail}</Typography.Paragraph> : null}
      <Typography.Paragraph type="secondary">{t('placeholder.notBuilt')}</Typography.Paragraph>
    </div>
  )
}
