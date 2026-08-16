import { Typography } from 'antd'
import { Lockup } from '../../ui/Mark'
import { t } from '../../i18n/strings'

/** M2 fills this with the line list, featured series and search (§7.3). */
export default function HomeRoute() {
  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: 16 }}>
        <Lockup markSize={56} showWordmark={false} />
      </div>
      <Typography.Title level={1} style={{ marginTop: 0 }}>
        {t('route.home.title')}
      </Typography.Title>
      <Typography.Paragraph>{t('app.tagline')}</Typography.Paragraph>
      <Typography.Paragraph type="secondary">{t('placeholder.notBuilt')}</Typography.Paragraph>
    </div>
  )
}
