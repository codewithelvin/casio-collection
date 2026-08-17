import { defineConfig, type Plugin } from 'vitest/config'
// `vitest/config` re-exports defineConfig but not loadEnv, so this one comes
// from vite itself. Same function, same resolution rules.
import { loadEnv } from 'vite'
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

/**
 * S7 — the Content-Security-Policy, which M4 has to widen and must not widen by
 * hand.
 *
 * GitHub Pages serves no headers, so the policy is a `<meta>` tag in a static
 * file — and from M4 it has to name the Supabase project origin under
 * `connect-src`, or every auth call is blocked by the browser. That origin is a
 * build variable (§14.2) and differs between the production project and CI's,
 * so the value cannot be written into index.html.
 *
 * Vite's own `%VITE_X%` substitution would do the replacement, and it fails in
 * the wrong direction: with the variable unset it leaves the literal text
 * `%VITE_SUPABASE_URL%` inside the policy, where a browser silently ignores the
 * unparseable source and keeps the rest. A CSP that is quietly wrong is exactly
 * the kind of failure S7 exists to catch, so this does it explicitly instead —
 * it validates the value and **fails the build** on a malformed one.
 *
 * An absent variable is not an error. It is the state the site is in until the
 * Supabase project exists, and it produces the policy M3 shipped.
 */
function cspPlugin(supabaseUrl: string): Plugin {
  let origin = ''
  if (supabaseUrl.trim() !== '') {
    let parsed: URL
    try {
      parsed = new URL(supabaseUrl)
    } catch {
      throw new Error(`csp: VITE_SUPABASE_URL is not a URL: ${supabaseUrl}`)
    }
    if (parsed.protocol !== 'https:') {
      throw new Error(`csp: VITE_SUPABASE_URL must be https, got ${parsed.protocol}`)
    }
    origin = parsed.origin
  }

  return {
    name: 'cc-csp',
    transformIndexHtml(html) {
      if (origin === '') return html
      // Supabase speaks HTTP for auth and PostgREST and WebSocket for realtime.
      // Realtime is unused (D1 puts the catalogue in a file and §17 rules out
      // anything social), so only the HTTP origin is granted. If realtime is
      // ever wanted, that is a deliberate second entry here.
      const widened = html.replace("connect-src 'self'", `connect-src 'self' ${origin}`)
      if (widened === html) {
        throw new Error("csp: could not find \"connect-src 'self'\" in index.html")
      }
      return widened
    },
  }
}

// D13: the project base path. Every asset and every fetch must be built from
// import.meta.env.BASE_URL — a hard-coded '/catalog/catalog.json' works in dev
// and 404s in production. Closing O1 (the domain) changes this line, the OAuth
// redirect allow-list and the Supabase site URL together, never one alone.
export default defineConfig(({ mode }) => {
  // The third argument is '' rather than 'VITE_' so a missing prefix is visible
  // as a missing value here instead of as a mystery at runtime. In CI these
  // arrive as real environment variables; locally they come from .env.local.
  const env = loadEnv(mode, process.cwd(), '')

  return {
  base: BASE,
  plugins: [react(), manifestPlugin(), cspPlugin(env['VITE_SUPABASE_URL'] ?? '')],
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
    //
    // **Raised from 30 s to 60 s at M4**, for the third instance of the same
    // measurement rather than for a new reason. Under v8 coverage instrumentation
    // a full-shell test file runs roughly ten times slower than it does alone:
    // the filtering file's slowest test is 2.3 s standalone and 22.5 s in a
    // coverage run, and M4's two new component files pushed the one beside it
    // over the old ceiling. M3's note stands — the tests are starved, not slow —
    // and the workers are already halved; what is left is a ceiling that clears
    // the slowest honest test on the slowest machine. Nothing in this suite
    // waits on an absence, so a higher ceiling makes a genuine failure slower to
    // report and never makes one pass.
    testTimeout: 60_000,

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
        // M4 adds two more that fail silently. `session.ts` decides whether a
        // page thinks you are signed in and `config.ts` decides whether the
        // sign-in machinery exists at all; neither throws when it is wrong, it
        // just shows the wrong header to the wrong person.
        'src/auth/session.ts': { lines: 90, functions: 90, statements: 90 },
        'src/auth/config.ts': { lines: 90, functions: 90, statements: 90 },
      },
    },
  },
  }
})
