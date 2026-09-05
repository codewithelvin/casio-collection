// Renders the link-preview card — `public/og.png`, 1200×630.
//
// Run with `node scripts/gen-og.mjs` when the card should change. Like the PWA
// icons it is COMMITTED rather than built in CI: it changes roughly never, and a
// preview card that silently disappears because a build step was reordered is a
// bad trade for one file in git.
//
// WHY THIS RENDERS IN A BROWSER AND `gen-icons.mjs` DOES NOT.
//
// The card this replaces was drawn as SVG paths, and the comment explaining why
// was right about the problem: an SVG `<text>` element rendered through libvips
// resolves its font against whatever fontconfig knows about on the machine that
// runs the script, so the same command produces different letterforms on a
// laptop and in CI. For a committed file that difference lands silently.
//
// Drawing the letters as paths solved it by removing the font. This solves it by
// removing the *lookup*: the page below carries IBM Plex Mono inline as a
// base64 woff2, so Chromium has exactly one face available and never consults
// the system at all. The output is byte-stable for anyone with the same
// Playwright Chromium, and the wordmark is now the site's actual typeface rather
// than a hand-drawn imitation of it.
//
// The trade is a heavier dependency — Playwright, already a devDependency, and
// its Chromium. That is acceptable for a script run by hand a few times a year;
// it would not be for anything in the build.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const OG = { width: 1200, height: 630 }

/**
 * The twelve watches on the card, named explicitly rather than chosen at run
 * time.
 *
 * A selection computed from the catalogue — brightest, or most saturated, or
 * newest — would change the committed card every time somebody seeded a series,
 * which is a diff nobody asked for and a design nobody reviewed. These twelve
 * were picked for line spread and for reading at the size a Slack unfurl draws
 * (about 500 px wide, so each tile lands near 70 px).
 *
 * **All twelve are Casio's own product photography.** The catalogue also holds
 * 153 photographs from The Digital Watch Library and 138 from Casiold, and
 * those carry the source site's watermark — `DIGITAL WATCH` across a corner,
 * and on one dial the words `BUY ME`. A social card is the wrong place for
 * another site's branding, so the pool is restricted to `image_credit.author`
 * of `Casio Computer Co., Ltd.` If one of these is ever un-published, this
 * script fails loudly on the missing file rather than drawing a hole.
 */
const TILES = [
  'a168wecm-5', // Vintage, rose gold — the A168 everyone recognises
  'dw-5600ws-4', // G-SHOCK, orange square
  'efr-s108d-7av', // Edifice, steel and white
  'ba-110bc-9a', // Baby-G, yellow
  'she-4538pg-4a', // Sheen, rose gold rectangle
  'prg-30-2', // Pro Trek, navy resin
  'ocw-s5000b-1a', // Oceanus, blue chronograph
  'ltp-v002d-7b', // Vintage, small steel three-hander
  'gw-b5600mg-1', // G-SHOCK, black square
  'ecb-10at-1a', // Edifice, blue and steel
  'ga-2100bm-7a5', // G-SHOCK, the octagon
  'she-4535ypg-2a', // Sheen, rose gold on navy
]

/** The count the card claims. Read from the built catalogue so it cannot drift. */
function referenceCount() {
  const catalog = JSON.parse(readFileSync(join(root, 'public', 'catalog', 'catalog.json'), 'utf8'))
  return catalog.models.filter((model) => !model.tombstone).length
}

const font = (weight) =>
  readFileSync(join(root, 'src', 'assets', 'fonts', `ibm-plex-mono-latin-${weight}-normal.woff2`)).toString('base64')

/** The mark, with its authoring comment stripped so it can be inlined. */
const mark = readFileSync(join(root, 'public', 'mark.svg'), 'utf8').replace(/<!--[\s\S]*?-->/g, '')

const tile = (id) => {
  const file = join(root, 'public', 'img', 'models', `${id}@2x.webp`)
  const data = readFileSync(file).toString('base64')
  return `<div class=t><img src="data:image/webp;base64,${data}" alt=""><b>${id.toUpperCase()}</b></div>`
}

const count = referenceCount().toLocaleString('en-GB')
const page = `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:Plex;src:url(data:font/woff2;base64,${font(400)}) format('woff2');font-weight:400}
@font-face{font-family:Plex;src:url(data:font/woff2;base64,${font(500)}) format('woff2');font-weight:500}
*{margin:0;padding:0;box-sizing:border-box}
body{width:${OG.width}px;height:${OG.height}px;overflow:hidden;font-family:Plex,monospace;background:#001233}
.wrap{position:relative;width:${OG.width}px;height:${OG.height}px;display:flex}
/* The panel is a hard column rather than a gradient over the photographs: at the
   size a card is actually seen, type over a busy mosaic is the first thing to
   go, and a solid ground keeps the wordmark legible at every scale. */
.panel{width:524px;flex:none;background:linear-gradient(160deg,#002a86 0%,#001b57 52%,#00113a 100%);
  position:relative;z-index:2;padding-left:74px;display:flex;flex-direction:column;justify-content:center;
  box-shadow:16px 0 38px rgba(0,6,26,.45)}
.panel::after{content:'';position:absolute;right:0;top:0;bottom:0;width:6px;background:#F25C05}
.mark{width:74px;height:74px;color:#fff;margin-bottom:28px}
.mark svg{width:100%;height:100%;display:block}
h1{font-weight:500;font-size:78px;line-height:.96;letter-spacing:-.028em;color:#fff}
.rule{width:120px;height:3px;background:rgba(255,255,255,.34);margin:24px 0 20px}
p{font-weight:400;font-size:21px;line-height:1.5;color:rgba(255,255,255,.82);letter-spacing:-.004em}
p b{font-weight:500;color:#fff}
.grid{flex:1;display:grid;grid-template-columns:repeat(4,1fr);grid-template-rows:repeat(3,1fr);background:#0b1730;gap:1px}
.t{position:relative;background:#fff;overflow:hidden;display:flex;align-items:center;justify-content:center}
.t img{width:88%;height:88%;object-fit:contain;margin-bottom:6px}
/* The reference under each watch is the point of the site, so it is on the card.
   It also stops the grid reading as stock photography. */
.t b{position:absolute;left:0;right:0;bottom:7px;text-align:center;font-weight:400;font-size:10.5px;
  letter-spacing:.055em;color:#7c8698}
</style>
<div class=wrap>
  <div class=panel>
    <div class=mark>${mark}</div>
    <h1>CASIO<br>VAULT</h1>
    <div class=rule></div>
    <p><b>${count} references.</b><br>Every field read from a<br>source, and cited.</p>
  </div>
  <div class=grid>${TILES.map(tile).join('')}</div>
</div>`

const browser = await chromium.launch()
try {
  // Rendered at 2× and resized down, which is what makes 10.5 px reference codes
  // and the mark's bezel screws survive; at 1× both turn to mush.
  const view = await browser.newPage({ viewport: OG, deviceScaleFactor: 2 })
  await view.setContent(page, { waitUntil: 'load' })
  await view.evaluate(() => document.fonts.ready)
  const shot = await view.screenshot({ type: 'png' })
  await sharp(shot)
    .resize(OG.width, OG.height)
    .png({ compressionLevel: 9, quality: 90, effort: 10 })
    .toFile(join(root, 'public', 'og.png'))
} finally {
  await browser.close()
}
console.log(`wrote public/og.png — ${OG.width}×${OG.height}, ${count} references, ${TILES.length} watches`)
