import type { CSSProperties } from 'react'
import { Button, Drawer, Grid, Layout, theme as antdTheme } from 'antd'
import MenuOutlined from '@ant-design/icons/MenuOutlined'
import BulbOutlined from '@ant-design/icons/BulbOutlined'
import BulbFilled from '@ant-design/icons/BulbFilled'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { Lockup } from './Mark'
import { LineNav } from './LineNav'
import { Footer } from './Footer'
import { SearchBox } from './SearchBox'
import { useUiStore } from './uiStore'
import { t } from '../i18n/strings'

const HEADER_HEIGHT = 64
const SIDER_WIDTH = 264
/** §8.2 — every interactive element is at least this tall below 768 px. */
const TOUCH_TARGET = 44

/**
 * §8.1 / §8.2 — the shell. A fixed 64 px header, a 264 px rail that becomes an
 * off-canvas drawer below 768 px, and a content region.
 *
 * The breakpoint is read from AntD's own grid rather than a media query in CSS,
 * because the rail and the drawer are different components and something has to
 * decide which one exists. `md` is 768 px, which is the number in §8.2.
 */
export function AppShell() {
  const { token } = antdTheme.useToken()
  const screens = Grid.useBreakpoint()
  const { pathname } = useLocation()
  const { mode, toggleTheme, drawerOpen, setDrawerOpen } = useUiStore()

  const isMobile = !screens.md

  const rootStyle = { ['--cc-accent' as string]: token.colorPrimary } as CSSProperties

  return (
    <Layout style={{ ...rootStyle, minHeight: '100vh' }}>
      <Layout.Header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          height: HEADER_HEIGHT,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '0 16px',
          background: token.colorBgContainer,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        {isMobile ? (
          <Button
            type="text"
            aria-label={t('nav.open')}
            icon={<MenuOutlined />}
            onClick={() => setDrawerOpen(true)}
            style={{ width: TOUCH_TARGET, height: TOUCH_TARGET }}
          />
        ) : null}

        <Link to="/" aria-label={t('app.name')} style={{ display: 'inline-flex', flexShrink: 0 }}>
          {/* Below 120 px the wordmark loses its letterspacing, so on a phone
              the mark stands alone (§8.11). */}
          <Lockup markSize={32} showWordmark={!isMobile} />
        </Link>

        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', minWidth: 0 }}>
          <SearchBox collapsedToIcon={isMobile} />
        </div>

        <Button
          type="text"
          className="cc-theme-toggle"
          aria-label={mode === 'dark' ? t('theme.toLight') : t('theme.toDark')}
          icon={mode === 'dark' ? <BulbFilled /> : <BulbOutlined />}
          onClick={toggleTheme}
          style={{ width: TOUCH_TARGET, height: TOUCH_TARGET, flexShrink: 0 }}
        />

        {/* §8.1 lists an account menu here. It is deliberately absent until M4
            builds authentication: a Sign in button that opens nothing is worse
            than no button, and D6 requires the modal it would open. */}
      </Layout.Header>

      <Layout>
        {isMobile ? (
          <Drawer
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            placement="left"
            width={SIDER_WIDTH}
            title={t('nav.lines')}
            closable
            styles={{ body: { padding: 0 } }}
          >
            <LineNav onNavigate={() => setDrawerOpen(false)} />
          </Drawer>
        ) : (
          <Layout.Sider
            width={SIDER_WIDTH}
            collapsible
            // §8.2's two desktop rows, straight from AntD: expanded from 1200
            // (xl), collapsed to icons between 768 and 1199, and the user can
            // toggle it in either. Left uncontrolled so the breakpoint and the
            // toggle are not two sources of truth for one piece of state.
            breakpoint="xl"
            theme="light"
            style={{
              background: token.colorBgContainer,
              borderInlineEnd: `1px solid ${token.colorBorderSecondary}`,
              // The header is sticky and the rail scrolls independently (§8.1).
              position: 'sticky',
              top: HEADER_HEIGHT,
              height: `calc(100vh - ${HEADER_HEIGHT}px)`,
              overflowY: 'auto',
            }}
          >
            <LineNav />
          </Layout.Sider>
        )}

        <Layout style={{ background: token.colorBgLayout }}>
          <Layout.Content style={{ padding: isMobile ? 16 : 24 }}>
            {/* Keyed on the path so the entrance replays per navigation. The
                key is deliberately the pathname and not the full location:
                changing a filter in the query string (FR-1.6) must not
                re-animate the grid someone is reading. */}
            <div key={pathname} className="cc-route">
              <Outlet />
            </div>
          </Layout.Content>
          <Footer />
        </Layout>
      </Layout>
    </Layout>
  )
}

/* §8.2's collapsing search field moved to SearchBox at M3, where it grew a
   dropdown, a matcher and a keyboard shortcut. The shell only decides whether
   it is an icon or a field. */
