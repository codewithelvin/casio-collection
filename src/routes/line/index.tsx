import { Fragment, useMemo } from 'react'
import { Breadcrumb, Button, Typography, theme as antdTheme } from 'antd'
import { Link, useParams } from 'react-router-dom'
import { lineBySlug, lineTree, modelsInSeries, useCatalog } from '../../catalog/client.ts'
import { applyViewState, NO_FILTERS } from '../../catalog/filters.ts'
import type { PublishedFamily, PublishedSeries } from '../../catalog/schema.ts'
import { WatchGrid, WINDOW } from '../../ui/WatchGrid'
import { sectionsWithin, useReveal } from '../../ui/useReveal'
import { SkeletonGrid } from '../../ui/SkeletonGrid'
import { ErrorState } from '../../ui/ErrorState'
import { EmptyState } from '../../ui/EmptyState'
import { FilterBar } from '../../ui/FilterBar'
import { useViewState } from '../../ui/useViewState'
import { LINE_ACCENTS } from '../../theme/palette.ts'
import { t } from '../../i18n/strings'

/**
 * FR-1.2 — a line without a series shows **every model in the line, grouped by
 * series with a sticky sub-heading**.
 *
 * The groups are ordered by size and then by name, rather than alphabetically
 * throughout. That is an editorial call and worth defending: forty-three of the
 * forty-four series seeded so far hold exactly one reference, so a plain
 * alphabetical order opens this page with twenty single-card sections before
 * reaching the one series that has eighteen. Largest-first shows the reader what
 * the line actually contains. Within a group the order is FR-1.4's default,
 * reference A→Z.
 *
 * **Families come before all of it, added 2026-08-22 at the client's request.**
 * Largest-first was the whole ordering while Vintage held forty-three series;
 * it now holds 127 and 1 070 models, and the client's words for what that reads
 * as were a thousand watches in one category. So the page opens on the groups
 * Casio itself names — Casio Vintage, Wave Ceptor, Sports Gear / PHYS — and
 * largest-first governs inside a family and across everything after them. §8.4's
 * rules are not restated here: `lineTree` holds all three, including the one
 * that keeps a family of one from becoming a heading, and this page renders
 * whatever it returns.
 */
export default function LineRoute() {
  const { line: slug } = useParams<{ line: string }>()
  const { token } = antdTheme.useToken()
  const [view, setView] = useViewState()
  const { data, isPending, isError, refetch } = useCatalog()

  const line = data ? lineBySlug(data, slug) : undefined

  const groups = useMemo(() => {
    if (!data || !line) return []
    const build = (series: PublishedSeries, family?: PublishedFamily) => ({
      series,
      models: modelsInSeries(data, series.id),
      family,
    })
    const bySize = (a: { series: PublishedSeries; models: unknown[] }, b: typeof a) =>
      b.models.length - a.models.length || a.series.name.localeCompare(b.series.name)
    const inhabited = (group: { models: unknown[] }) => group.models.length > 0

    const tree = lineTree(data, line.id)

    // The family is carried on **every** group and not only on the first of
    // each, because the heading is emitted at render time by comparing a group
    // against the one before it. A filter that empties a family's biggest
    // series must not take the family's name off the page with it, which is
    // exactly what marking the first group here would do.
    const families = tree.families
      .map((group) => group.series.map((series) => build(series, group.family)).filter(inhabited))
      .filter((members) => members.length > 0)
      .map((members) => members.sort(bySize))
      .sort(
        (a, b) =>
          b.reduce((n, g) => n + g.models.length, 0) - a.reduce((n, g) => n + g.models.length, 0) ||
          a[0]!.family!.name.localeCompare(b[0]!.family!.name),
      )

    return [
      ...families.flat(),
      ...tree.ungrouped
        .map((series) => build(series))
        .filter(inhabited)
        .sort(bySize),
    ]
  }, [data, line])

  /**
   * The filter bar reads the whole line — D26 measures density over the view,
   * and the view here is the line, not each series in turn. A movement facet
   * that appeared over one section and vanished over the next would be four
   * bars pretending to be one.
   */
  const models = useMemo(() => groups.flatMap((group) => group.models), [groups])

  // The groups keep their §8.5 sticky headings; a group with nothing left after
  // the filter disappears entirely rather than becoming a heading over a gap.
  const shownGroups = useMemo(
    () =>
      groups
        .map((group) => ({ ...group, models: applyViewState(group.models, view) }))
        .filter((group) => group.models.length > 0),
    [groups, view],
  )
  const shownCount = shownGroups.reduce((total, group) => total + group.models.length, 0)

  /**
   * D58 one level up — **the page reveals whole series, and stops at the same
   * card count one grid stops at.**
   *
   * D58 bounded each grid to 48 cards and left the *number* of grids unbounded,
   * which was invisible while a line held forty-odd references. Vintage went from
   * 43 series to 68 in one session, `/line/vintage/` went from 82 cards to 228,
   * and pressing **back** from a watch took **1 082 ms at a 4× CPU throttle with
   * no network at all** — nothing downloading, the whole page rebuilding from
   * scratch. That is §8.5's stutter condition again, and D58's own text says
   * measuring it is what reopens the question.
   *
   * The unit is **cards, not sections**, because cards are what cost the time:
   * G-SHOCK's largest series holds 162 and would blow the budget alone, while
   * Vintage's first three come to about 48 between them. So sections are taken
   * until the budget runs out, and **always at least one** — a page revealing
   * nothing would have no sentinel for the reader to scroll towards, and would
   * never reveal anything.
   */
  const revealed = useReveal(shownCount, `${slug ?? ''}:${shownCount}:${shownGroups.length}`, {
    first: WINDOW,
    more: WINDOW,
  })
  const visibleGroups = useMemo(
    () => sectionsWithin(shownGroups, (group) => group.models.length, revealed.shown),
    [shownGroups, revealed.shown],
  )

  if (isPending) return <SkeletonGrid />
  if (isError || !data) return <ErrorState onRetry={() => void refetch()} />

  if (!line) {
    return <EmptyState title={t('line.notFound.title')} body={t('line.notFound.body')} />
  }

  const accent = LINE_ACCENTS[line.id] ?? token.colorPrimary

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 8 }}
        items={[{ title: <Link to="/">{t('home.linesHeading')}</Link> }, { title: line.name }]}
      />
      <Typography.Title level={2} style={{ marginTop: 0 }}>
        {line.name}
      </Typography.Title>

      {groups.length === 0 ? (
        <EmptyState title={t('line.empty.title')} body={t('line.empty.body')} />
      ) : (
        <>
          <Typography.Paragraph type="secondary">
            {`${shownCount} ${t('home.models')}`}
          </Typography.Paragraph>

          <FilterBar models={models} state={view} onChange={setView} />

          {shownGroups.length === 0 ? (
            <EmptyState
              title={t('filter.none.title')}
              body={t('filter.none.body')}
              action={
                <Button onClick={() => setView({ ...view, filters: NO_FILTERS })}>
                  {t('filter.clearAllFilters')}
                </Button>
              }
            />
          ) : null}

          {visibleGroups.map(({ series, models, family }, index) => (
            <Fragment key={series.id}>
              {/* The family heading, emitted where the family changes rather
                  than from a nested list — the reveal budget of D58 counts a
                  flat run of series sections, and nesting them would put a
                  family's whole card count inside one unit of it.
                  `visibleGroups` is always a prefix of `shownGroups`, so
                  comparing against the previous element cannot re-emit a
                  heading when the window grows.

                  Not sticky, deliberately. The series heading below already is,
                  and two sticky rows would park one under the other and leave
                  the reader looking at a heading for a group scrolled past. */}
              {family && family.id !== visibleGroups[index - 1]?.family?.id ? (
                <Typography.Title
                  level={4}
                  style={{ marginTop: index === 0 ? 0 : 40, marginBottom: 12 }}
                >
                  {family.name}
                </Typography.Title>
              ) : null}
              <section style={{ marginBottom: 32 }}>
                {/* §8.5's sticky sub-heading. `top` clears the 64 px header,
                    which is itself sticky — without the offset the heading parks
                    itself underneath the header and is never seen. */}
                <div
                  style={{
                    position: 'sticky',
                    top: 64,
                    zIndex: 5,
                    padding: '8px 0',
                    marginBottom: 8,
                    background: token.colorBgLayout,
                    borderBottom: `1px solid ${token.colorBorderSecondary}`,
                  }}
                >
                  <Link to={`/line/${line.slug}/${series.id}`} style={{ color: 'inherit' }}>
                    <Typography.Text strong>{series.name}</Typography.Text>
                  </Link>
                  <Typography.Text
                    type="secondary"
                    style={{ marginInlineStart: 8, fontSize: token.fontSizeSM }}
                  >
                    {String(models.length)}
                  </Typography.Text>
                </div>

                <WatchGrid models={models} accent={accent} />
              </section>
            </Fragment>
          ))}

          {/* The page's own sentinel, below the last revealed section. Present
              only while sections remain, so it cannot sit at the end of a
              finished page observing nothing. */}
          {revealed.done ? null : <div ref={revealed.sentinel} aria-hidden="true" />}
        </>
      )}
    </div>
  )
}
