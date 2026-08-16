import { Button, Result } from 'antd'
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
 */
export function ErrorState({ onRetry }: { onRetry?: (() => void) | undefined }) {
  return (
    <Result
      status="warning"
      title={t('state.error.title')}
      extra={
        onRetry ? (
          <Button type="primary" onClick={onRetry}>
            {t('state.error.retry')}
          </Button>
        ) : undefined
      }
    />
  )
}
