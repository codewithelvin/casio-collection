import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { lineTree, useCatalogIndex } from '../catalog/client.ts'
import { RailSkeleton } from './RailSkeleton'
import { ChevronIcon, CollectorsIcon, EditionsIcon, LineGlyph, SymbolsIcon } from './icons'
import { LINE_ACCENTS } from '../theme/palette.ts'
import { COLLECTORS, EDITIONS, SYMBOLS, linePath, seriesPath } from '../paths.ts'
import { expandLine, t } from '../i18n/strings'

/**
 * §8.4 / FR-1.1 — the line tree.
 *
 * Lines are top-level, each with its model count. Beneath a line come its
 * families as collapsible headings and then its unfamilied series, under the
 * three rules `lineTree` enforces: a family heading only where it holds two or
 * more series, an unfamilied series directly under its line *after* the
 * families, and every series reachable with every family collapsed. That last
 * one is what lets D32 keep the family out of the URL.
 *
 * A line with no models is rendered as a leaf with no expander rather than as an
 * empty submenu — an arrow that opens onto nothing is a worse answer than no
 * arrow, and two of the seven lines are in that state today.
 *
 * **The rail reads the index (§6.2's split), and it is the reason the split was
 * worth building.** It is in the shell, so it renders on every URL on the site —
 * which meant every URL on the site waited for 2 832 models to arrive and be
 * validated before it could draw seven rows and their counts. Nothing here names
 * a reference.
 *
 * **It was an AntD `Menu` and is now a nested list of links (§12).** rc-menu and
 * antd/menu are 106 KB unminified between them, and this component is in the
 * shell, so they were in the first load of all 3 000-odd URLs on the site. Three
 * things came out better rather than merely cheaper:
 *
 *   * **A line is an `<a>` now.** It was a Menu item with an `onClick` calling
 *     `navigate`, because a SubMenu title toggles rather than firing onClick —
 *     which meant the rail's primary navigation was unavailable to
 *     middle-click, to *open in new tab*, and to anything reading the page for
 *     links. The expander is a separate button beside it, which is what it
 *     always was conceptually.
 *   * **No `routeFor` string parsing.** The Menu handed back a key and the key
 *     had to encode the route so a click did not have to search the catalogue;
 *     with real links the route is in the href and there is nothing to decode.
 *   * `aria-current="page"` replaces `selectedKeys`, so *you are here* is in the
 *     markup rather than in a prop.
 */
export function LineNav({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation()
  const { data, isPending } = useCatalogIndex()

  /**
   * Which lines are showing their series. §8.4 — a deep link opens with the tree
   * already showing where you are, so the line containing the current series
   * starts expanded; everything else starts closed.
   *
   * Seeded once from the path rather than derived from it on every render, so
   * that opening a line and then navigating within it does not collapse what the
   * reader opened.
   */
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const match = /^\/line\/([^/]+)\/[^/]+/.exec(pathname)
    return match?.[1] ? { [match[1]]: true } : {}
  })

  if (isPending) return <RailSkeleton />
  if (!data) return null

  const current = /^\/line\/([^/]+)(?:\/([^/]+))?/.exec(pathname)
  const currentLine = current?.[1]
  const currentSeries = current?.[2]

  /**
   * D62 — the rail's one row that is not a line, and the reason it is a plain
   * link with no expander is the same reason it is below the seven rather than
   * among them: an edition cuts across the lines, so it has no place *inside*
   * the tree and no series of its own to unfold. It is a different question
   * about the same catalogue.
   *
   * Rendered only when the artefact carries an edition, because an edition
   * nothing is in is not published — so an empty list here would mean the rail
   * was offering a page that says "no editions yet", which is a category with
   * nothing in it (D51's rule, one dimension over).
   */
  const showEditions = data.editions.length > 0
  const editionsActive = pathname === '/editions' || pathname.startsWith('/editions/')

  return (
    <nav className="cc-nav" aria-label={t('nav.lines')}>
      {/*
        **The rail has headings now, and this replaces a rule rather than adding
        to one.** It used to separate the lines from everything else with a
        border and a comment saying a heading was wrong here because it "divides
        two kinds of link, not two sections of one kind".

        The client's answer, 2026-09-06: a border is not a separation anybody
        reads. Three destinations now sit below the lines rather than one, and an
        unlabelled run of three under a hairline is a list that looks like it
        overflowed rather than one that was grouped.

        **Two groups and not four**, which is D32's rule about family headings
        applied one level up: a heading over a single entry is noise. Editions,
        the directory and the glossary are three different kinds of thing, and
        the honest label for the set is that they are the ways in that are not a
        line — so they get one heading between them rather than one each.
      */}
      <h2 className="cc-nav-group" id="cc-nav-group-lines">
        {t('nav.lines')}
      </h2>
      <ul className="cc-nav-list" aria-labelledby="cc-nav-group-lines">
        {data.lines.map((line) => {
          const tree = lineTree(data, line.id)
          const isActive = currentLine === line.slug
          const hasChildren = tree.families.length > 0 || tree.ungrouped.length > 0
          const isOpen = open[line.slug] === true

          return (
            <li key={line.id}>
              {/* The link and its expander share a row, and the row is a class
                  now rather than two inline properties: the expander is a 44 px
                  touch target (§8.2) and the link has to give up the end padding
                  it would otherwise sit on top of. Both of those are `shell.css`
                  decisions and neither is expressible here. */}
              <div className="cc-nav-line">
                <Link
                  to={linePath(line.slug)}
                  className="cc-nav-row"
                  // The series pages set this on their own row, so a line whose
                  // series is open is not also "the page".
                  {...(isActive && !currentSeries ? { 'aria-current': 'page' as const } : {})}
                  onClick={onNavigate}
                >
                  {/* §8.3 — the per-line accent *is* the active indicator, so
                      only the active glyph carries it. Colouring all seven would
                      make the rail a legend for a code nobody has to learn and
                      would stop the colour meaning "you are here", which is its
                      one job. */}
                  <span
                    className="cc-nav-icon"
                    style={isActive ? { color: LINE_ACCENTS[line.id] } : undefined}
                  >
                    <LineGlyph line={line.id} />
                  </span>
                  <span className="cc-nav-label">{line.name}</span>
                  {/* The count is always real, because a line holding none is
                      not published at all (D51). */}
                  <span className="cc-nav-count">{line.count}</span>
                </Link>
                {hasChildren ? (
                  <button
                    type="button"
                    className="cc-icon-button cc-nav-expander"
                    data-open={isOpen}
                    aria-expanded={isOpen}
                    aria-label={expandLine(line.name, isOpen)}
                    onClick={() => setOpen((state) => ({ ...state, [line.slug]: !isOpen }))}
                  >
                    <ChevronIcon />
                  </button>
                ) : null}
              </div>

              {hasChildren && isOpen ? (
                <ul className="cc-nav-list cc-nav-sub">
                  {tree.families.map((group) => (
                    <li key={group.family.id}>
                      {/* A family is a heading and never a link — D32 keeps it
                          out of the URL, and by construction rather than by
                          remembering: there is no href to give it. */}
                      <div className="cc-nav-family">{group.family.name}</div>
                      <ul className="cc-nav-list">
                        {group.series.map((series) => (
                          <SeriesRow
                            key={series.id}
                            lineSlug={line.slug}
                            id={series.id}
                            name={series.name}
                            count={series.count}
                            active={currentSeries === series.id}
                            onNavigate={onNavigate}
                          />
                        ))}
                      </ul>
                    </li>
                  ))}
                  {tree.ungrouped.map((series) => (
                    <SeriesRow
                      key={series.id}
                      lineSlug={line.slug}
                      id={series.id}
                      name={series.name}
                      count={series.count}
                      active={currentSeries === series.id}
                      onNavigate={onNavigate}
                    />
                  ))}
                </ul>
              ) : null}
            </li>
          )
        })}

      </ul>

      {/* Still one landmark and still one `cc-nav` region — a second `<ul>` is
          not a second `<nav>`, and that is the constraint `AppShell` actually
          asserts. What changes is that each list now says what it is. */}
      <h2 className="cc-nav-group" id="cc-nav-group-more">
        {t('nav.more')}
      </h2>
      <ul className="cc-nav-list" aria-labelledby="cc-nav-group-more">
        {showEditions ? (
          <li>
            <Link
              to={EDITIONS}
              className="cc-nav-row"
              {...(editionsActive ? { 'aria-current': 'page' as const } : {})}
              onClick={onNavigate}
            >
              {/* A glyph, like every other row in the rail. It had none, and a
                  single iconless row in a column of eight reads as unfinished
                  rather than as different — the border above it is already what
                  says this is not a line, and it says it without leaving a hole
                  in the column the labels line up against.

                  No accent colour on it, unlike a line's: §8.3 gives the accent
                  the one job of meaning "you are here", and an edition has no
                  line accent to be. Active state is the row's own background and
                  `--cc-primary`, which `.cc-nav-row[aria-current]` already
                  paints and `currentColor` on the glyph follows for free. */}
              <span className="cc-nav-icon">
                <EditionsIcon />
              </span>
              <span className="cc-nav-label">{t('nav.editions')}</span>
              <span className="cc-nav-count">{data.editions.length}</span>
            </Link>
          </li>
        ) : null}

        {/*
          D69 — the collector directory, moved here from the footer disclosure
          on 2026-09-06 because the client could not find it there, which is a
          fair report: it was two presses deep behind an "i" that reads as
          *about this site* rather than as *places to go*.

          **No count**, unlike every other row in this rail. The other counts are
          facts about a file that is already in memory (D1); this one is a
          Supabase read, and putting it here would mean the rail could not draw
          itself until the network answered — on every page, for every visitor,
          including the ones who are never going to press it.
        */}
        <li>
          <Link
            to={COLLECTORS}
            className="cc-nav-row"
            {...(pathname.startsWith('/collectors') ? { 'aria-current': 'page' as const } : {})}
            onClick={onNavigate}
          >
            <span className="cc-nav-icon">
              <CollectorsIcon />
            </span>
            <span className="cc-nav-label">{t('route.collectors.title')}</span>
          </Link>
        </li>

        {/* D65 — the glossary. It was the *only* way in for this page and it was
            in the footer panel, which is what made §10's own note about it true:
            a page written for a question nobody can find is a page written for
            nobody. */}
        <li>
          <Link
            to={SYMBOLS}
            className="cc-nav-row"
            {...(pathname.startsWith('/symbols') ? { 'aria-current': 'page' as const } : {})}
            onClick={onNavigate}
          >
            <span className="cc-nav-icon">
              <SymbolsIcon />
            </span>
            <span className="cc-nav-label">{t('nav.symbols')}</span>
          </Link>
        </li>
      </ul>
    </nav>
  )
}

function SeriesRow({
  lineSlug,
  id,
  name,
  count,
  active,
  onNavigate,
}: {
  lineSlug: string
  id: string
  name: string
  count: number
  active: boolean
  onNavigate?: (() => void) | undefined
}) {
  return (
    <li>
      <Link
        to={seriesPath(lineSlug, id)}
        className="cc-nav-row"
        {...(active ? { 'aria-current': 'page' as const } : {})}
        onClick={onNavigate}
      >
        <span className="cc-nav-label">{name}</span>
        <span className="cc-nav-count">{count}</span>
      </Link>
    </li>
  )
}

/**
 * A default export beside the named one, so a caller can `lazy()` this module.
 * The named export stays because that is what the tests and the drawer import,
 * and because a component that can only be reached through a lazy boundary is a
 * component that cannot be rendered in a unit test.
 */
export default LineNav
