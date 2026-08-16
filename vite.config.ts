import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'

// D39 — the site serves from the root of its own domain, casiovault.com. This
// read `/casio-collection/` until that domain existed, and dropping to `/` is
// half the reason the rename was worth doing now: D13's rule still stands and
// every path is still built from import.meta.env.BASE_URL, but the failure it
// guards against — works in dev, 404s in production — no longer has anywhere
// to hide. It stays a named constant threaded into the manifest, because a
// second copy of this value is precisely the D13 failure it prevents.
const BASE = '/'

/**
 * FR-11.1 — the web app manifest, generated rather than committed.
 *
 * `start_url`, `scope` and every icon path have to carry the base path. A static
 * public/manifest.webmanifest would be a second place holding that value, and
 * the copy that nobody remembers to update is exactly the D13 failure — works
 * in dev, 404s in production. Generating it keeps `BASE` above as the only
 * definition, which matters no less now that the value is `/`: the day it is
 * ever anything else again, one line changes.
 */
function manifestPlugin(): Plugin {
  const manifest = {
    name: 'Casio Vault',
    short_name: 'Casio Vault',
    description: 'Browse the Casio watch catalogue and keep track of the ones you own.',
    start_url: BASE,
    scope: BASE,
    display: 'standalone',
    orientation: 'portrait-primary',
    theme_color: '#0033A0',
    // §8.11 — a filled ground, because a transparent icon looks broken on an
    // Android home screen.
    background_color: '#0033A0',
    icons: [
      { src: `${BASE}icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `${BASE}icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `${BASE}icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
  const body = JSON.stringify(manifest, null, 2)

  return {
    name: 'cc-manifest',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.endsWith('manifest.webmanifest')) return next()
        res.setHeader('Content-Type', 'application/manifest+json')
        res.end(body)
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: body })
    },
  }
}

// D13: the project base path. Every asset and every fetch must be built from
// import.meta.env.BASE_URL — a hard-coded '/catalog/catalog.json' works in dev
// and 404s in production. Closing O1 (the domain) changes this line, the OAuth
// redirect allow-list and the Supabase site URL together, never one alone.
export default defineConfig({
  base: BASE,
  plugins: [react(), manifestPlugin()],
  build: {
    /**
     * D40, closing O10 — **React is pinned to its own chunk and AntD is not.**
     *
     * Naming `antd` here looks like the same kind of caching win as naming
     * `react`, and it is the opposite. The shell imports AntD, so that chunk is
     * always in the first load — and once it exists, *every* AntD module goes
     * into it, including the ones only a lazy route imports. M3's Select,
     * Popover, Checkbox and AutoComplete are used on three routes and were
     * being downloaded by everyone before they reached any of them.
     *
     * Measured with M3 in, against D28's 380 KB:
     *
     *   react + antd pinned (what this was)        349.3 KB
     *   nothing pinned                             308.4 KB, as one chunk
     *   react pinned, AntD placed by use           308.7 KB + a 33.7 KB react
     *
     * The third is 40.6 KB off the first load and keeps the one dependency that
     * genuinely never changes in a chunk of its own. What it gives up is the
     * AntD vendor cache: an app-code change now re-hashes the AntD the shell
     * uses along with it. That is the right way round **while the site is
     * proving itself** (D30) — a first visit is every visit, and repeat-visit
     * caching is an optimisation for traffic that does not exist yet. It is
     * also the difference between M4 having 71 KB of headroom and having 30.
     */
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,

    // Vitest's 5 s default is a poor fit for this suite and it showed up as a
    // flake: one component test failed on a loaded machine and passed on an idle
    // one. A single AppShell render under jsdom costs about two seconds here —
    // AntD's CSS-in-JS builds a whole token set per mount — so a test that
    // renders, clicks and waits twice is inside the default by a margin that ten
    // parallel test files eat. Raising the ceiling is right where the work is
    // genuinely slow; what is not acceptable is a red gate that is not about the
    // code, because D31 makes CI the thing that blocks a deploy.
    testTimeout: 30_000,

    /**
     * M3 added two files of full-shell component tests and the suite started
     * failing three or four assertions per run — never the same ones, all of
     * them "unable to find" on a screen that renders correctly when the file is
     * run alone. Vitest defaults to one worker per core and every one of those
     * workers is mounting AntD, so on a 4-core CI runner the suite was competing
     * with itself for the machine.
     *
     * Halving the workers is the fix rather than raising the timeout again: the
     * tests were not slow, they were starved. The wall clock barely moves,
     * because the work was queued either way.
     */
    maxWorkers: '50%',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.fixtures.ts',
        'src/test/**',
        'src/main.tsx',
        'src/vite-env.d.ts',
      ],
      // D31: 90% on the pure-logic modules, enforced in CI and never lowered.
      // These globs are deliberately written before the modules exist (M1, M5)
      // so the floor is in place the day the first line of them is committed —
      // a threshold added after the code is a threshold negotiated against it.
      thresholds: {
        'src/catalog/**': { lines: 90, functions: 90, statements: 90 },
        'src/collection/**': { lines: 90, functions: 90, statements: 90 },
        'src/auth/pendingIntent.ts': { lines: 90, functions: 90, statements: 90 },
      },
    },
  },
})
