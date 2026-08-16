import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'

const BASE = '/casio-collection/'

/**
 * FR-11.1 — the web app manifest, generated rather than committed.
 *
 * `start_url`, `scope` and every icon path have to carry the base path, and the
 * base path is the one thing O1 will change when a domain is chosen. A static
 * public/manifest.webmanifest would be a second place holding that value, and
 * the copy that nobody remembers to update is exactly the D13 failure — works
 * in dev, 404s in production. Generating it keeps `BASE` above as the only
 * definition.
 */
function manifestPlugin(): Plugin {
  const manifest = {
    name: 'Casio Collection',
    short_name: 'Casio Collection',
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
    // Route-level splitting is what keeps us under D28's 380 KB. The vendor
    // split keeps React and AntD out of every route chunk's diff.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          antd: ['antd', '@ant-design/icons'],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
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
