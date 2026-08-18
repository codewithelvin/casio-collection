import type { ComponentType } from 'react'
import { Menu, Skeleton, Typography } from 'antd'
import type { MenuProps } from 'antd'
import { useLocation, useNavigate } from 'react-router-dom'
import ThunderboltOutlined from '@ant-design/icons/ThunderboltOutlined'
import FieldTimeOutlined from '@ant-design/icons/FieldTimeOutlined'
import DashboardOutlined from '@ant-design/icons/DashboardOutlined'
import CompassOutlined from '@ant-design/icons/CompassOutlined'
import HeartOutlined from '@ant-design/icons/HeartOutlined'
import StarOutlined from '@ant-design/icons/StarOutlined'
import GlobalOutlined from '@ant-design/icons/GlobalOutlined'
import { lineTree, useCatalog } from '../catalog/client.ts'
import { LINE_ACCENTS } from '../theme/tokens'
import { t } from '../i18n/strings'

/**
 * One glyph per line, each saying what the line is *for* rather than decorating
 * it: the shock that names G-SHOCK, a compass for the outdoor line, a stopwatch
 * face for the vintage one. A rail of identical dots teaches nothing and a rail
 * of arbitrary shapes teaches something false.
 *
 * The calculator went with Databank when D49 made it a family of Vintage rather
 * than a line. A family has no rail row, so it has no glyph.
 *
 * This is presentation and stays in code — an icon component is not something a
 * JSON catalogue can carry. Everything else the rail knows now comes from
 * `catalog.json`, which is why `ui/lines.ts` is gone as of M2.
 *
 * Icons are imported one path at a time; the barrel import pulls the whole set
 * and is most of the difference between meeting D28's budget and not (§12).
 */
const LINE_ICONS: Record<string, ComponentType> = {
  'g-shock': ThunderboltOutlined,
  vintage: FieldTimeOutlined,
  edifice: DashboardOutlined,
  'pro-trek': CompassOutlined,
  'baby-g': HeartOutlined,
  sheen: StarOutlined,
  oceanus: GlobalOutlined,
}

/**
 * A row in the rail: the label on the left, the count hard against the right,
 * exactly as §8.4's diagram draws it.
 *
 * Two details that were wrong the first time and both showed. The count has to
 * be pushed to the end with `justify-content: space-between` rather than left
 * to sit against the label with a margin — an AntD Menu label fills the row, so
 * a margin puts the number in the middle of nowhere. And the digits are
 * `tabular-nums`: a column of proportional numerals makes 4 and 18 and 61 look
 * ragged down the rail, which is the whole reason a count column is a column.
 *
 * The label itself truncates rather than wrapping, because "Vintage / Casio
 * Collection" with a count is wider than 264 px and a rail row that grows to two
 * lines drags every row below it out of alignment.
 */
function NavRow({
  label,
  count,
  hasArrow,
  onClick,
}: {
  label: string
  count?: number | undefined
  hasArrow?: boolean | undefined
  onClick?: (() => void) | undefined
}) {
  return (
    <span
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        // `width: 100%` is load-bearing rather than tidiness. A flex container
        // with no width shrinks to fit its content, so the label never
        // truncates, the row grows past the 264 px rail, and the count is drawn
        // beyond the right edge — which reads as the count colliding with the
        // expander. It is the row overflowing, and the width is what stops it.
        width: '100%',
        minWidth: 0,
        // A line with series is an AntD SubMenu, and a SubMenu's expander is
        // positioned absolutely against the right edge of the row: it is not in
        // this flex flow and reserves no space of its own.
        paddingInlineEnd: hasArrow ? 18 : 0,
      }}
    >
      <span
        style={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
      {count === undefined ? null : (
        <Typography.Text
          type="secondary"
          style={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}
        >
          {String(count)}
        </Typography.Text>
      )}
    </span>
  )
}

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
 */
export function LineNav({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { data, isPending } = useCatalog()

  const navigateToLine = (slug: string) => {
    navigate(`/line/${slug}`)
    onNavigate?.()
  }

  // Not memoised: seven lines and their series is a trivial map, and a memo here
  // would have to close over the navigate handler and list it as a dependency,
  // which recreates the array every render anyway.
  const items: MenuProps['items'] = !data
    ? []
    : data.lines.map((line) => {
        const tree = lineTree(data, line.id)
        const isActive = pathname.startsWith(`/line/${line.slug}`)
        const Icon = LINE_ICONS[line.id]

        const seriesItem = (seriesId: string, name: string, count: number) => ({
          key: `series:${line.slug}:${seriesId}`,
          label: <NavRow label={name} count={count} />,
        })

        const children = [
          ...tree.families.map((group) => ({
            key: `family:${line.id}:${group.family.id}`,
            label: group.family.name,
            children: group.series.map((series) =>
              seriesItem(series.id, series.name, series.count),
            ),
          })),
          ...tree.ungrouped.map((series) => seriesItem(series.id, series.name, series.count)),
        ]

        return {
          key: `line:${line.slug}`,
          // A line that has series becomes an AntD SubMenu, and a SubMenu title
          // toggles rather than firing onClick — so without this handler the line
          // page would expand the tree and never open, and FR-1.2's "a line
          // without a series shows every model in the line" would be unreachable
          // from the rail. Clicking the label navigates *and* expands, which is
          // both halves of FR-1.1.
          //
          // The count is always real, because a line holding none is not
          // published at all (D51). The branch that used to hide a zero went
          // with it: a guard against a state the artefact can no longer contain
          // reads as though that state were still possible.
          label: (
            <NavRow
              label={line.name}
              count={line.count}
              hasArrow={children.length > 0}
              onClick={() => navigateToLine(line.slug)}
            />
          ),
          // §8.3 — the per-line accent *is* the active indicator, so only the
          // active glyph carries it. Colouring all seven would make the rail a
          // legend for a code nobody has to learn and would stop the colour
          // meaning "you are here", which is its one job.
          icon: Icon ? (
            <span
              className="cc-nav-icon"
              style={isActive ? { color: LINE_ACCENTS[line.id] ?? 'inherit' } : undefined}
            >
              <Icon />
            </span>
          ) : undefined,
          ...(children.length > 0 ? { children } : {}),
        }
      })

  if (isPending) {
    return (
      <div style={{ padding: 16 }} aria-busy aria-label={t('state.loading')}>
        <Skeleton active title={false} paragraph={{ rows: 8 }} />
      </div>
    )
  }

  return (
    <Menu
      mode="inline"
      selectedKeys={selectedKeys(pathname)}
      defaultOpenKeys={openKeysFor(pathname)}
      style={{ borderInlineEnd: 'none' }}
      items={items}
      onClick={({ key }) => {
        const target = routeFor(key)
        if (!target) return
        navigate(target)
        onNavigate?.()
      }}
    />
  )
}

/**
 * The key encodes the route, so clicking never has to search the catalogue for
 * what was clicked. Families are not routes and produce nothing — which is D32
 * enforced by construction rather than by remembering.
 */
function routeFor(key: string): string | null {
  const [kind, ...rest] = key.split(':')
  if (kind === 'line') return `/line/${rest[0]}`
  if (kind === 'series') return `/line/${rest[0]}/${rest[1]}`
  return null
}

function selectedKeys(pathname: string): string[] {
  const match = /^\/line\/([^/]+)(?:\/([^/]+))?/.exec(pathname)
  if (!match) return []
  const [, line, series] = match
  return series ? [`series:${line}:${series}`] : [`line:${line}`]
}

/**
 * §8.4 — a deep link opens with the tree already showing where you are, so the
 * line containing the current series starts expanded.
 */
function openKeysFor(pathname: string): string[] {
  const match = /^\/line\/([^/]+)\/[^/]+/.exec(pathname)
  return match ? [`line:${match[1]}`] : []
}
