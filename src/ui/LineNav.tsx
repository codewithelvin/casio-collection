import type { ComponentType } from 'react'
import { Menu } from 'antd'
import { useLocation, useNavigate } from 'react-router-dom'
import ThunderboltOutlined from '@ant-design/icons/ThunderboltOutlined'
import FieldTimeOutlined from '@ant-design/icons/FieldTimeOutlined'
import DashboardOutlined from '@ant-design/icons/DashboardOutlined'
import CompassOutlined from '@ant-design/icons/CompassOutlined'
import HeartOutlined from '@ant-design/icons/HeartOutlined'
import StarOutlined from '@ant-design/icons/StarOutlined'
import GlobalOutlined from '@ant-design/icons/GlobalOutlined'
import CalculatorOutlined from '@ant-design/icons/CalculatorOutlined'
// Named `lines`, not `lineNav`: a data module whose name differs from this
// component's only by case resolves to the wrong file on a case-insensitive
// filesystem, and the symptom is an undefined component at render time rather
// than an import error.
import { NAV_LINES } from './lines'
import { LINE_ACCENTS } from '../theme/tokens'

/**
 * One glyph per line, each saying what the line is *for* rather than decorating
 * it: the shock that names G-SHOCK, a compass for the outdoor line, a
 * calculator for the watch that is one. A rail of identical dots teaches
 * nothing and a rail of arbitrary shapes teaches something false.
 *
 * This lives here and not in `lines.ts` because it is presentation. M2 replaces
 * that file with `catalog.json`'s `lines` array, and an icon component is not
 * something a JSON catalogue can carry.
 *
 * Icons are imported one path at a time — the barrel import pulls the whole set
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
  databank: CalculatorOutlined,
}

/**
 * §8.4 — the line tree, AntD Menu in inline mode.
 *
 * At M0 this is one flat level. The families of D32 arrive with the catalogue
 * at M2 as collapsible headings between a line and its series, under the three
 * rules in §8.4: a family heading renders only where it holds two or more
 * series, an unfamilied series sits directly under its line, and collapsing
 * every family still leaves every series reachable.
 */
export function LineNav({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const selected = NAV_LINES.filter((line) => pathname.startsWith(`/line/${line.slug}`)).map(
    (line) => line.id,
  )

  return (
    <Menu
      mode="inline"
      selectedKeys={selected}
      style={{ borderInlineEnd: 'none' }}
      items={NAV_LINES.map((line) => {
        const Icon = LINE_ICONS[line.id]
        const isActive = selected.includes(line.id)
        return {
          key: line.id,
          label: line.name,
          // §8.3 — the per-line accent is *the active indicator*, and colouring
          // the active glyph is how it indicates. Colouring all eight would
          // make the rail a legend for a code nobody has to learn, and would
          // stop the colour meaning "you are here", which is its one job. Never
          // a fill behind the label, so contrast stays at AA in both themes.
          icon: Icon ? (
            <span
              className="cc-nav-icon"
              style={isActive ? { color: LINE_ACCENTS[line.id] ?? 'inherit' } : undefined}
            >
              <Icon />
            </span>
          ) : undefined,
        }
      })}
      onClick={({ key }) => {
        const line = NAV_LINES.find((candidate) => candidate.id === key)
        if (!line) return
        navigate(`/line/${line.slug}`)
        onNavigate?.()
      }}
    />
  )
}
