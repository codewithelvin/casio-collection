// Renders the PWA install icons from icon-maskable.svg (§8.11).
//
// Run with `node scripts/gen-icons.mjs` when the mark changes. The PNGs are
// committed rather than built in CI: they change roughly never, and a home
// screen icon that silently disappears because a build step was reordered is a
// bad trade for saving two files in git.
import sharp from 'sharp'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = await readFile(join(root, 'public', 'icon-maskable.svg'))

for (const size of [192, 512]) {
  const out = join(root, 'public', `icon-${size}.png`)
  await sharp(source, { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toFile(out)
  console.log(`wrote public/icon-${size}.png`)
}

// A raster fallback for the handful of browsers that ignore an SVG favicon.
// Rendered from favicon.svg rather than mark-compact.svg, because that is the
// file that carries an explicit colour — the compact mark is currentColor and
// would rasterise to black.
const favicon = await readFile(join(root, 'public', 'favicon.svg'))
await sharp(favicon, { density: 512 })
  .resize(32, 32)
  .png({ compressionLevel: 9 })
  .toFile(join(root, 'public', 'favicon-32.png'))
console.log('wrote public/favicon-32.png')

// The apple-touch icon comes from the *maskable* source, not the favicon: iOS
// composites a transparent icon onto black, so the filled Casio-blue ground is
// the whole point (§8.11).
await sharp(source, { density: 512 })
  .resize(180, 180)
  .png({ compressionLevel: 9 })
  .toFile(join(root, 'public', 'apple-touch-icon.png'))
console.log('wrote public/apple-touch-icon.png')

/**
 * The link-preview card — `og.png`, 1200×630 — MOVED TO `gen-og.mjs`.
 *
 * It was drawn here as SVG paths, because an SVG `<text>` element rendered
 * through libvips resolves its font against whatever fontconfig knows about on
 * the machine that runs the script, and this file is committed, so the
 * difference would land silently in whichever machine happened to run it last.
 * Hand-drawn letterforms removed the font, which removed the problem.
 *
 * That reasoning still holds and is why the card is not typeset *here*.
 * `gen-og.mjs` answers it the other way — it renders in Chromium with IBM Plex
 * Mono embedded in the page as a base64 woff2, so there is exactly one face
 * available and no system lookup happens at all. Deterministic for the same
 * reason, and the card gets the site's real typeface and its actual watches.
 *
 * Kept apart from the icons because the inputs are different: the icons come
 * from two SVGs in this repo, the card reads the built catalogue and a dozen
 * photographs out of public/img/models.
 */
