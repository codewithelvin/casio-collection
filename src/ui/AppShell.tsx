import { Link, Outlet, ScrollRestoration, useLocation } from 'react-router-dom'
import { Lockup } from './Mark'
import { LineNav } from './LineNav'
// Imported eagerly, and that is a reversal worth naming: it was behind `lazy()`
// an hour ago because it was an AntD Drawer. Now that it is a fixed panel and a
// mask, the whole module is smaller than the network round trip that fetching it
// would cost, and a drawer that opens on the second tap is worse than a drawer
// that costs 2 KB.
import NavDrawer from './NavDrawer'
import { Footer } from './Footer'
import { SearchBox } from './SearchBox'
import { AccountMenu } from './AccountMenu'
import { OfflineBar } from './OfflineBar'
import { AuthHost } from '../auth/AuthHost'
import { BulbFilledIcon, BulbOutlineIcon, MenuIcon } from './icons'
import { useUiStore } from './uiStore'
import { t } from '../i18n/strings'
// One page view per route (D68). Here rather than in each screen, for the same
// reason `guarded` is in the route table: a rule every new screen must remember
// is a rule a screen will forget, and this one fails silently.
import { usePageViews } from '../analytics/usePageViews'
import { ConsentBanner } from './ConsentBanner'

/**
 * §8.1 / §8.2 — the shell. A sticky 64 px header, a 264 px rail that becomes an
 * off-canvas drawer below 768 px, and a content region.
 *
 * **The breakpoint is a media query now, and that is the single most important
 * change in this file (§12).** It used to be `Grid.useBreakpoint()` — AntD
 * reading matchMedia and re-rendering — with the comment that "the rail and the
 * drawer are different components and something has to decide which one exists".
 * That was true and it was expensive in a way the comment could not see: a layout
 * that needs JavaScript to choose itself cannot be drawn until the JavaScript
 * arrives, and on Lighthouse's mobile profile the JavaScript was 1 469 ms of
 * evaluation. Both the rail and the drawer trigger are in the markup now and
 * `shell.css` shows one of them, so the shell has a shape before React has an
 * opinion.
 *
 * What is left of Ant Design in the first load is nothing. Every screen that
 * shows watches still uses it, wrapped in the `AntdRoot` its own route chunk
 * pulls in.
 */
export function AppShell() {
  const { pathname } = useLocation()
  const { mode, toggleTheme, drawerOpen, setDrawerOpen } = useUiStore()
  usePageViews()

  return (
    <div className="cc-shell">
      {/*
        A browser resets the scroll on every page it loads; a single-page app has
        to do it itself, and until M3 this one did not. Opening a watch from the
        eighteenth card of a series left you two thousand pixels down a page that
        is four hundred tall, looking at a footer.

        **The key is the pathname, not the location key.** React Router's default
        gives every navigation entry its own key, which is exactly right for
        pages and exactly wrong here: FR-1.6 puts the filters and the sort in the
        query string, so ticking a year is a navigation, and with the default key
        every filter press would throw the reader back to the top of the grid
        they were reading. Keying on the pathname makes a filter change the same
        page — it holds its position — while a different page is a different page
        and starts at the top. Going back restores where you were.
      */}
      <ScrollRestoration getKey={(location) => location.pathname} />

      {/* §9.5 — restores a session if there is one to restore, and hosts the
          sign-in modal (§8.9). Mounted once at the shell because the modal is
          opened from four places: the header, a guarded route, the Owned button
          from M5, and the missing-reference form from M8. */}
      <AuthHost />

      {/*
        **Three groups, one per column of `.cc-header`'s grid.**

        The header used to be five children in a row with the search wrapper on
        `flex: 1`, which centres the field in *the space left over* rather than in
        the header — and the space left over is not symmetrical. The mark and the
        wordmark are about 130 px; the right-hand pair is a 44 px toggle plus an
        account control that is a 90 px button, a 32 px avatar, or — until the
        client finishes M4's console steps (§14.2) — **nothing at all**. In that
        last state the field sat some 43 px right of centre, which is exactly far
        enough to read as a mistake and not far enough to look deliberate.

        Grouping is what makes a centred middle expressible at all; `shell.css`
        holds the sizing, and its comment holds the post-mortem of the flex
        version of this that shipped broken on every phone. All three divs render
        unconditionally even when one is empty, because a missing column would
        move the other two.
      */}
      <header className="cc-header">
        <div className="cc-header-side">
          {/* Below 768 px only — hidden by `shell.css` above it, where the rail
              itself is on screen and there is nothing to open. */}
          <button
            type="button"
            className="cc-icon-button cc-drawer-trigger"
            aria-label={t('nav.open')}
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
          >
            <MenuIcon />
          </button>

          <Link to="/" aria-label={t('app.name')} style={{ display: 'inline-flex', flexShrink: 0 }}>
            {/* Below 120 px the wordmark loses its letterspacing, so on a phone
                the mark stands alone (§8.11). Which is now a CSS decision — see
                `.cc-wordmark` — rather than a prop, because the shell no longer
                knows in JavaScript how wide it is. */}
            <Lockup markSize={32} />
          </Link>
        </div>

        <div className="cc-header-centre">
          <SearchBox />
        </div>

        <div className="cc-header-side cc-header-side-end">
          <button
            type="button"
            className="cc-icon-button cc-theme-toggle"
            aria-label={mode === 'dark' ? t('theme.toLight') : t('theme.toDark')}
            onClick={toggleTheme}
          >
            {mode === 'dark' ? <BulbFilledIcon /> : <BulbOutlineIcon />}
          </button>

          {/* §8.1's account menu, which from M0 until M4 was this comment saying
              a Sign in button that opens nothing is worse than no button. It
              renders nothing at all until a Supabase project is configured, which
              is the same rule holding rather than a new one — and which is the
              worst case the centring above is measured against. */}
          <AccountMenu />
        </div>
      </header>

      {/* Keyboard users reach the content without tabbing the whole rail on
          every navigation. Visible only when focused — a skip link that is
          always visible is a design decision nobody asked for, and one that is
          never visible is one nobody can use. */}
      <a className="cc-skip" href="#main">
        {t('nav.skip')}
      </a>

      {/* FR-11.7 / FR-11.2 — said once, under the header, and nowhere else. */}
      <OfflineBar />

      <div className="cc-body">
        {/* Above 768 px this is the rail; below it, `shell.css` hides it and the
            hamburger opens the drawer instead. Both are always in the markup. */}
        <aside className="cc-rail">
          <LineNav />
        </aside>

        {/* Nothing at all until the hamburger has been pressed: a closed drawer
            renders no panel, and an unopened one costs a phone nothing. */}
        {drawerOpen ? <NavDrawer onClose={() => setDrawerOpen(false)} /> : null}

        <div className="cc-main-column">
          {/* Keyed on the path so the entrance replays per navigation. The
              key is deliberately the pathname and not the full location:
              changing a filter in the query string (FR-1.6) must not
              re-animate the grid someone is reading. */}
          {/* The one landmark a screen-reader user navigates by, and the
              target of the skip link. */}
          <main id="main" key={pathname} className="cc-content cc-route">
            <Outlet />
          </main>
          <Footer />
        </div>
      </div>
      {/* D68 — outside the scrolling column and fixed to the viewport, so it
          never moves the footer and never rides up the page. It renders nothing
          at all once the question has been answered. */}
      <ConsentBanner />
    </div>
  )
}
