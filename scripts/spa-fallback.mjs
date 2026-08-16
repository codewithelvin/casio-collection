// D13 — GitHub Pages serves static files and has no rewrite rules, so a refresh
// on /watch/ga-2100-1a1 asks the server for a file that does not exist. Copying
// index.html to 404.html is the supported way to make client-side routing
// survive that: Pages serves 404.html, the router boots, and resolves the URL.
//
// This runs in `npm run build` rather than only in CI, so a local `vite preview`
// behaves the way production does. The failure this guards against is invisible
// in dev, where Vite's server rewrites for free.
import { copyFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
await copyFile(join(dist, 'index.html'), join(dist, '404.html'))
console.log('spa-fallback: dist/index.html -> dist/404.html')
