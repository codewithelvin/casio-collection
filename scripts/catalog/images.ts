// `npm run catalog:images` — §10.3.
//
// Source images are dropped into catalog-src/images/raw/ at whatever size they
// come in, named after the model id they belong to. This normalises each one to
// 400 px and 800 px WebP in public/img/models/, which is what the card and the
// detail page load (D10). The raw sources are **not** committed; the normalised
// output is.
import { mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'
import { ID_PATTERN } from '../../src/catalog/schema.ts'
import { IMAGE_DIR, RAW_IMAGE_DIR } from './load.ts'

/** §10.3 — over either of these fails the build (D10). */
const BUDGETS = { '': 40 * 1024, '@2x': 110 * 1024 } as const
const WIDTHS = { '': 400, '@2x': 800 } as const
const QUALITY = 82

const ACCEPTED = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.tif', '.tiff'])

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`

async function modifiedAt(path: string): Promise<number> {
  return await stat(path).then(
    (info) => info.mtimeMs,
    () => 0,
  )
}

async function runImages(): Promise<boolean> {
  const raw = await readdir(RAW_IMAGE_DIR).catch(() => null)
  if (raw === null || raw.length === 0) {
    console.log(
      `Nothing to do: catalog-src/images/raw/ is empty.\n` +
        `Drop source images there named after the model id — ga-2100-1a1.png — and run this again.`,
    )
    return true
  }

  await mkdir(IMAGE_DIR, { recursive: true })

  let written = 0
  let skipped = 0
  const failures: string[] = []

  for (const name of raw.sort()) {
    const extension = extname(name).toLowerCase()
    if (!ACCEPTED.has(extension)) continue

    const id = basename(name, extname(name))
    if (!ID_PATTERN.test(id)) {
      // The filename *is* the model id (D2), so a filename that could never be
      // an id is a mistake worth stopping for rather than a file to skip.
      failures.push(`${name}: "${id}" is not a valid model id — the filename is the id`)
      continue
    }

    const sourcePath = join(RAW_IMAGE_DIR, name)
    const sourceModified = await modifiedAt(sourcePath)
    const outputs = (Object.keys(WIDTHS) as (keyof typeof WIDTHS)[]).map((suffix) => ({
      suffix,
      width: WIDTHS[suffix],
      budget: BUDGETS[suffix],
      file: `${id}${suffix}.webp`,
      path: join(IMAGE_DIR, `${id}${suffix}.webp`),
    }))

    const upToDate = await Promise.all(
      outputs.map(async (out) => (await modifiedAt(out.path)) > sourceModified),
    )
    if (upToDate.every(Boolean)) {
      // Guardrail 7 — running the same command twice produces no diff.
      skipped += 1
      continue
    }

    const image = sharp(sourcePath)
    const metadata = await image.metadata()
    if ((metadata.width ?? 0) < WIDTHS['@2x']) {
      console.log(
        `  ${name} is only ${metadata.width ?? 0} px wide, so the 2× file is not really 2×. ` +
          `A better source is worth finding when one exists.`,
      )
    }

    /**
     * **Encode both, then publish both or neither.**
     *
     * Check 5 needs the pair, so a model whose 1× busts the budget cannot be
     * published whatever its 2× weighs — and writing the 2× anyway leaves a file
     * no entry references. `catalog:audit` found 26 of those after the
     * photograph backfill: dead weight in the repo forever, because a half-pair
     * looks like a success to everything downstream.
     *
     * Deleting inside the loop did not fix it and is worth recording: the 1×
     * failed, removed both files, and then the 2× encoded fine on the next turn
     * of the same loop and wrote itself straight back. The decision has to be
     * taken after both are known, not during.
     */
    const encoded = await Promise.all(
      outputs.map(async (out) => ({
        out,
        // Alpha is preserved rather than flattened: a cut-out watch on a
        // transparent ground sits correctly on both themes (§8.3), and
        // flattening to white would put a card-coloured box behind it in dark
        // mode.
        buffer: await sharp(sourcePath)
          .resize({ width: out.width, withoutEnlargement: true })
          .webp({ quality: QUALITY })
          .toBuffer(),
      })),
    )

    const tooBig = encoded.filter(({ out, buffer }) => buffer.length > out.budget)
    if (tooBig.length > 0) {
      for (const { out, buffer } of tooBig) {
        failures.push(
          `${out.file}: ${kb(buffer.length)} is over the ${kb(out.budget)} budget (§10.3). ` +
            `Crop the source, or start from a cleaner original.`,
        )
      }
      await Promise.all(outputs.map((out) => unlink(out.path).catch(() => {})))
      continue
    }

    for (const { out, buffer } of encoded) {
      await writeFile(out.path, buffer)
      written += 1
    }
  }

  console.log(
    `\n${written} file${written === 1 ? '' : 's'} written, ${skipped} model${skipped === 1 ? '' : 's'} already current`,
  )

  if (failures.length > 0) {
    console.error(`\nRefused ${failures.length}:`)
    for (const failure of failures) console.error(`  ${failure}`)
    return false
  }
  return true
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (!(await runImages())) process.exit(1)
}
