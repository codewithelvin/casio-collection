import { Link } from 'react-router-dom'
import { useCatalogIndex } from '../../catalog/client.ts'
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
 *
 * **It reads the index, not the catalogue.** Seven cards and their counts are
 * `lines`, and this page named no model even when it was waiting for 2 832 of
 * them — see `CATALOG_INDEX_PATH` for what that was costing the first paint of
 * the site's most-visited URL.
 *
 * **And it renders no Ant Design (§12), which is why it has no `AntdRoot`.**
 * Every other screen wraps itself in one; this one is a heading, a paragraph and
 * seven cards, and it is the page Lighthouse and most first-time visitors
 * actually load. Keeping AntD off it is the difference between the first load
 * being 262 KB gzipped and being a third of that.
 */
export default function HomeRoute() {
  const { data, isPending, isError, refetch } = useCatalogIndex()

  return (
    <div>
      {/* An h2, matching every other page title on the site — `level={2}` is
          what the line, series, watch and search screens render, and a front
          door that promoted itself to h1 would be the only page with a
          different outline. Kept as it was when this was AntD's Typography;
          §12 changed what draws the heading, not which heading it is. */}
      <h2 className="cc-h2" style={{ marginTop: 0 }}>
        {t('app.name')}
      </h2>
      <p className="cc-lead">{t('home.lead')}</p>

      {/* level 3, not 4. The page title above is an h2, and a jump to h4 leaves
          a hole in the outline a screen reader navigates by — axe fails it as
          `heading-order`. The heading reads one step larger as a result, which
          is the honest consequence: it is the second level on the page. */}
      <h3 className="cc-h3">{t('home.linesHeading')}</h3>
      {isPending ? (
        <LineGridSkeleton count={7} />
      ) : isError || !data ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : (
        <>
          <LineGrid lines={data.lines} />
          {/* D62 — one link, and no second grid. The front door's job is the
              seven lines; editions are a smaller, cross-cutting way in, and a
              second row of cards under the first would give them equal weight
              they have not earned at thirteen references. It is a plain `Link`
              for the reason nothing on this page imports Ant Design (§12) —
              this is the URL Lighthouse loads.

              Rendered only where the artefact carries an edition, so the front
              door can never offer a page that says "no editions yet" (D51). */}
          {data.editions.length > 0 ? (
            <p className="cc-lead" style={{ marginBlockStart: 24 }}>
              <Link to="/editions">{t('editions.all')}</Link>
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}
