import { Typography } from 'antd'
import { useCatalog } from '../../catalog/client.ts'
import { ErrorState } from '../../ui/ErrorState'
import { LineGrid, LineGridSkeleton } from '../../ui/LineGrid'
import { t } from '../../i18n/strings'

/**
 * The catalogue front door: the seven lines of D15, in editorial order.
 *
 * The grid and the skeleton it loads through are both in `LineGrid`, which owns
 * the one copy of their shared geometry. Two copies of a column span are two
 * things to keep in step, and the symptom of them drifting is a layout jump at
 * exactly the moment the page is supposed to feel settled.
 */
export default function HomeRoute() {
  const { data, isPending, isError, refetch } = useCatalog()

  return (
    <div>
      <Typography.Title level={2} style={{ marginTop: 0 }}>
        {t('app.name')}
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ maxWidth: 620 }}>
        {t('home.lead')}
      </Typography.Paragraph>

      {/* level 3, not 4. The page title above is an h2, and a jump to h4 leaves
          a hole in the outline a screen reader navigates by — axe fails it as
          `heading-order`. The heading reads one step larger as a result, which
          is the honest consequence: it is the second level on the page. */}
      <Typography.Title level={3}>{t('home.linesHeading')}</Typography.Title>
      {isPending ? (
        <LineGridSkeleton count={7} />
      ) : isError || !data ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : (
        <LineGrid lines={data.lines} />
      )}
    </div>
  )
}
