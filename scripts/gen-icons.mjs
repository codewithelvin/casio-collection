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
 * The link-preview card — `og.png`, 1200×630.
 *
 * Every page that is not a watch had no `og:image` at all, which is what makes
 * a shared link render as a grey rectangle with a domain in it. That is the
 * front door, the seven lines, 566 series pages and the glossary: precisely the
 * URLs somebody shares when they are describing the project rather than linking
 * one reference. A watch page overrides this with its own photograph, which is
 * always the better card.
 *
 * 1200×630 is the size Open Graph, Twitter's `summary_large_image` and every
 * chat client that unfurls a link agree on — 1.91:1, and above the 300×157
 * floor below which several of them fall back to the small card.
 *
 * **The text is drawn, not typeset.** An SVG `<text>` element rendered through
 * libvips resolves its font against whatever fontconfig knows about on the
 * machine that runs this script, so the same command produces different
 * letterforms on a laptop and in CI — and this file is committed, so the
 * difference would land silently in whichever one happened to run it last. The
 * wordmark is therefore a path, taken from the same octagon geometry as the
 * mark: no font to resolve, no machine to depend on, and the card is identical
 * for everyone who regenerates it.
 */
const OG = { width: 1200, height: 630 }
const card = `<svg xmlns="http://www.w3.org/2000/svg" width="${OG.width}" height="${OG.height}" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#0033A0"/>

  <!-- The mark, at the size the bezel screws are meant to be read at. -->
  <g transform="translate(140 155) scale(5.0)" fill="none" stroke="#FFFFFF">
    <path d="M23 9 H41 L55 23 V41 L41 55 H23 L9 41 V23 Z" stroke-width="5" stroke-linejoin="round"/>
    <g fill="#FFFFFF" stroke="none">
      <circle cx="18.5" cy="18.5" r="2.2"/>
      <circle cx="45.5" cy="18.5" r="2.2"/>
      <circle cx="45.5" cy="45.5" r="2.2"/>
      <circle cx="18.5" cy="45.5" r="2.2"/>
    </g>
    <path d="M23 33 L29.5 39.5 L42.5 26.5" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  </g>

  <!-- CASIO VAULT, as paths. Drawn on a 100-unit cap height and scaled, so the
       two words sit on one baseline with the mark's optical centre. -->
  <g transform="translate(510 210) scale(0.78)" fill="#FFFFFF">
    <path d="M58 4 L22 4 A18 18 0 0 0 4 22 L4 66 A18 18 0 0 0 22 84 L58 84 L58 62 L26 62 L26 26 L58 26 Z"/>
    <path d="M78 84 L100 0 L128 0 L150 84 L128 84 L124 66 L104 66 L100 84 Z M108 48 L120 48 L114 24 Z"/>
    <path d="M170 14 A14 14 0 0 1 192 4 L228 4 L228 26 L192 26 L192 34 L214 34 A14 14 0 0 1 228 48 L228 70 A14 14 0 0 1 214 84 L178 84 L178 62 L206 62 L206 54 L184 54 A14 14 0 0 1 170 40 Z"/>
    <rect x="248" y="4" width="22" height="80"/>
    <path d="M290 18 A14 14 0 0 1 312 4 L334 4 A14 14 0 0 1 348 18 L348 70 A14 14 0 0 1 334 84 L312 84 A14 14 0 0 1 290 70 Z M312 26 L312 62 L326 62 L326 26 Z"/>

    <path d="M400 4 L422 4 L436 56 L450 4 L472 4 L448 84 L424 84 Z"/>
    <path d="M488 84 L510 4 L538 4 L560 84 L538 84 L534 66 L514 66 L510 84 Z M518 48 L530 48 L524 24 Z"/>
    <path d="M580 4 L602 4 L602 62 L624 62 L624 4 L646 4 L646 70 A14 14 0 0 1 632 84 L594 84 A14 14 0 0 1 580 70 Z"/>
    <path d="M666 4 L688 4 L688 62 L724 62 L724 84 L666 84 Z"/>
    <path d="M736 4 L806 4 L806 26 L782 26 L782 84 L760 84 L760 26 L736 26 Z"/>
  </g>

  <!-- One rule under the wordmark, and no second or third one.
       Three stacked rules of decreasing length were drawn here first, as a
       stand-in for the tagline that cannot be typeset — and they read exactly
       like a skeleton loader that never resolved. A card whose first impression
       is "this page failed to load" is worse than a card with less on it. The
       words the preview needs are in og:description, which every client that
       renders this image renders underneath it. -->
  <rect x="510" y="340" width="560" height="5" fill="#FFFFFF" opacity="0.4"/>
</svg>`

await sharp(Buffer.from(card), { density: 144 })
  .resize(OG.width, OG.height)
  .png({ compressionLevel: 9 })
  .toFile(join(root, 'public', 'og.png'))
console.log('wrote public/og.png')
