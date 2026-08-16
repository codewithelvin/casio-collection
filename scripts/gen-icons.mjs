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
