import { Breadcrumb, Button, Tag, Typography } from 'antd'
import ExportOutlined from '@ant-design/icons/ExportOutlined'
import { Link, useParams } from 'react-router-dom'
import { editionById, modelsInEdition, useCatalog } from '../../catalog/client.ts'
import { applyViewState, NO_FILTERS } from '../../catalog/filters.ts'
import { WatchGrid } from '../../ui/WatchGrid'
import { SkeletonGrid } from '../../ui/SkeletonGrid'
import { ErrorState } from '../../ui/ErrorState'
import { EmptyState } from '../../ui/EmptyState'
import { FilterBar } from '../../ui/FilterBar'
import { useViewState } from '../../ui/useViewState'
import { editionCount, sourceLabel, t } from '../../i18n/strings'

/**
 * D62 — one edition, and every reference in it.
 *
 * **This is the only grid on the site whose models do not share a line**, and
 * that is the reason the page exists rather than an oddity of it: the PAC-MAN
 * collaboration is five references sitting in five different series, and before
 * this there was no URL that showed them together. Two things follow from it,
 * and both are visible on screen:
 *
 *   * **Every card names its own series** (`seriesById`), which the series page
 *     deliberately does not — there, the series is the page. Here, *which*
 *     A168 or F-91W this is, is the thing a reader cannot infer.
 *   * **No accent colour is passed.** §8.3's accent means "you are in this
 *     line", and a grid holding a Vintage watch beside a G-SHOCK has no such
 *     answer. Colouring it after the first card's line would be the page
 *     asserting something untrue about the rest.
 */
export default function EditionRoute() {
  const { edition: editionId } = useParams<{ edition: string }>()
  const [view, setView] = useViewState()
  const { data, isPending, isError, refetch } = useCatalog()

  if (isPending) return <SkeletonGrid />
  if (isError || !data) return <ErrorState onRetry={() => void refetch()} />

  const edition = editionById(data, editionId)
  if (!edition) {
    return <EmptyState title={t('edition.notFound.title')} body={t('edition.notFound.body')} />
  }

  const models = modelsInEdition(data, edition.id)
  const shown = applyViewState(models, view)
  const seriesById = new Map(data.series.map((series) => [series.id, series]))

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 8 }}
        items={[
          { title: <Link to="/">{t('home.linesHeading')}</Link> },
          { title: <Link to="/editions">{t('editions.heading')}</Link> },
          { title: edition.name },
        ]}
      />

      <Typography.Title level={2} style={{ marginTop: 0, marginBottom: 4 }}>
        {edition.name}
      </Typography.Title>

      {edition.partner ? (
        <Typography.Paragraph type="secondary" style={{ marginBottom: 4 }}>
          {`${t('edition.withPartner')} ${edition.partner}`}
          {edition.year ? <Tag style={{ marginInlineStart: 8 }}>{edition.year}</Tag> : null}
        </Typography.Paragraph>
      ) : null}

      <div style={{ marginBottom: 16 }}>
        {/* The count follows the filters, matching the series page — a heading
            that keeps saying five while two cards are on screen is the page
            arguing with itself. */}
        <Typography.Text type="secondary">{editionCount(shown.length)}</Typography.Text>
        {/* FR-2.1 — the words this edition answers to. They are load-bearing
            here rather than decorative: "Café Kitsuné" cannot be typed on most
            keyboards, and these are what a reader actually searched. */}
        {edition.aka?.map((alias) => (
          <Tag key={alias} style={{ marginInlineStart: 8 }}>
            {alias}
          </Tag>
        ))}
      </div>

      {models.length === 0 ? (
        <EmptyState title={t('grid.empty')} />
      ) : (
        <>
          <FilterBar models={models} state={view} onChange={setView} />
          {shown.length === 0 ? (
            <EmptyState
              title={t('filter.none.title')}
              body={t('filter.none.body')}
              action={
                <Button onClick={() => setView({ ...view, filters: NO_FILTERS })}>
                  {t('filter.clearAllFilters')}
                </Button>
              }
            />
          ) : (
            <WatchGrid models={shown} seriesById={seriesById} />
          )}
        </>
      )}

      {/* FR-3.2a, one level up. An edition claims two companies made something
          together, and the reader is told which page said so and what kind of
          page it was — exactly the promise the watch page makes about a
          specification. It sits at the foot because it is provenance, not
          navigation: whoever wants to check the claim reads to the end. */}
      <Typography.Title level={4} style={{ marginTop: 24 }}>
        {t('edition.sourceHeading')}
      </Typography.Title>
      <Typography.Paragraph style={{ marginBottom: 0 }}>
        <a href={edition.source.url} target="_blank" rel="noreferrer noopener">
          {sourceLabel(edition.source.kind)} <ExportOutlined />
        </a>
      </Typography.Paragraph>
    </div>
  )
}
