import { Button, Typography } from 'antd'
import { Link } from 'react-router-dom'
import { t } from '../../i18n/strings'

/**
 * FR-10.2 — an unknown route offers search and the line list rather than a bare
 * message. This page is also what GitHub Pages serves for *every* deep link
 * (D13): `404.html` is a copy of `index.html`, so the router boots here and
 * then resolves the real route. A visitor only ever sees this page when the
 * route genuinely does not exist.
 */
export default function NotFoundRoute() {
  return (
    <div style={{ maxWidth: 560 }}>
      <Typography.Title level={2} style={{ marginTop: 0 }}>
        {t('notFound.title')}
      </Typography.Title>
      <Typography.Paragraph>{t('notFound.body')}</Typography.Paragraph>
      <Link to="/">
        <Button type="primary">{t('notFound.home')}</Button>
      </Link>
    </div>
  )
}
