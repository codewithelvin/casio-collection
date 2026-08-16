import { Menu } from 'antd'
import { useLocation, useNavigate } from 'react-router-dom'
// Named `lines`, not `lineNav`: a data module whose name differs from this
// component's only by case resolves to the wrong file on a case-insensitive
// filesystem, and the symptom is an undefined component at render time rather
// than an import error.
import { NAV_LINES } from './lines'
import { LINE_ACCENTS } from '../theme/tokens'

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
      items={NAV_LINES.map((line) => ({
        key: line.id,
        label: line.name,
        // §8.3 — the per-line accent is a thin indicator only, never a fill
        // behind text, so contrast stays fixed at AA in both themes.
        icon: (
          <span
            aria-hidden="true"
            style={{
              display: 'inline-block',
              width: 3,
              height: 16,
              borderRadius: 2,
              background: LINE_ACCENTS[line.id] ?? 'transparent',
            }}
          />
        ),
      }))}
      onClick={({ key }) => {
        const line = NAV_LINES.find((candidate) => candidate.id === key)
        if (!line) return
        navigate(`/line/${line.slug}`)
        onNavigate?.()
      }}
    />
  )
}
