import { ID_PATTERN, type LineDef, type LinesFile, type Model, type SeriesFile } from './schema.ts'
import { EARLIEST_YEAR } from './vocabulary.ts'

/**
 * §10.2 — the integrity checks. **All of them are build failures** except the
 * two the specification deliberately makes warnings, and both of those are
 * marked as such below with the reason.
 *
 * Everything here is a pure function over already-parsed data. The filesystem
 * lives in `scripts/catalog/`, and the one thing these checks need from it —
 * which image files exist — arrives as a set of names. That is not tidiness for
 * its own sake: D31 puts a 90% floor on this folder because these are the
 * functions that fail quietly, and a check that needs a directory on disk to run
 * is a check nobody writes the awkward test for.
 *
 * Checks 6 and 7 are absent from this file **on purpose**. A value outside the
 * controlled vocabulary and a model with no source are rejected by the Zod
 * schema at parse time, so they cannot reach here at all — an earlier and
 * stricter place to fail than a check afterwards. They are tested as schema
 * rejections in `schema.test.ts`, one case each, under their §10.2 numbers.
 */

export interface SeriesSource {
  /** Repo-relative, for messages. A check nobody can locate is a check nobody fixes. */
  file: string
  /** The folder the file was found in, which must agree with `series.line`. */
  folder: string
  series: SeriesFile['series']
  models: Model[]
  /**
   * §10.2 check 3 — model ids whose reference-pattern mismatch carries a
   * one-line comment in the YAML acknowledging it. Collected by the loader,
   * because only the loader can see comments.
   */
  refExceptions: ReadonlySet<string>
}

export interface CatalogSource {
  lines: LinesFile
  series: SeriesSource[]
  /** D2 — the ids of the previous build, from `catalog-src/.published-ids.json`. */
  publishedIds: readonly string[]
  /** Basenames present under `public/img/models`, e.g. `ga-2100-1a1@2x.webp`. */
  images: ReadonlySet<string>
}

export interface Issue {
  /** The §10.2 number, so a failure can be read against the specification. */
  check: string
  where: string
  message: string
}

export interface IntegrityReport {
  failures: Issue[]
  warnings: Issue[]
}

function compareIssues(a: Issue, b: Issue): number {
  return (
    a.check.localeCompare(b.check) ||
    a.where.localeCompare(b.where) ||
    a.message.localeCompare(b.message)
  )
}

export function checkIntegrity(
  source: CatalogSource,
  options: { currentYear: number },
): IntegrityReport {
  const failures: Issue[] = []
  const warnings: Issue[] = []
  const fail = (check: string, where: string, message: string) =>
    failures.push({ check, where, message })
  const warn = (check: string, where: string, message: string) =>
    warnings.push({ check, where, message })

  const linesById = new Map<string, LineDef>()
  for (const line of source.lines.lines) {
    if (linesById.has(line.id)) {
      fail('4', 'lines.yaml', `line id "${line.id}" is declared twice`)
      continue
    }
    linesById.set(line.id, line)
  }

  const slugs = new Map<string, string>()
  for (const line of source.lines.lines) {
    const owner = slugs.get(line.slug)
    if (owner)
      fail('4', 'lines.yaml', `lines "${owner}" and "${line.id}" share the slug "${line.slug}"`)
    else slugs.set(line.slug, line.id)
  }

  for (const line of source.lines.lines) {
    const seen = new Set<string>()
    for (const family of line.families ?? []) {
      if (seen.has(family.id)) {
        fail('4', 'lines.yaml', `line "${line.id}" declares the family "${family.id}" twice`)
      }
      seen.add(family.id)
    }
    try {
      new RegExp(line.ref_pattern)
    } catch {
      fail(
        '3',
        'lines.yaml',
        `line "${line.id}" has a ref_pattern that is not a valid regular expression`,
      )
    }
  }

  /* ----- ids, refs, and the things that must be unique across every file ----- */

  const idOwner = new Map<string, string>()
  const refOwner = new Map<string, string>()
  const seriesOwner = new Map<string, string>()
  const familyUse = new Map<string, string[]>()

  for (const entry of source.series) {
    const { series, file } = entry

    const previousSeries = seriesOwner.get(series.id)
    if (previousSeries) {
      fail('4', file, `series id "${series.id}" is already declared in ${previousSeries}`)
    } else {
      seriesOwner.set(series.id, file)
    }

    const line = linesById.get(series.line)
    if (!line) {
      fail(
        '4',
        file,
        `series "${series.id}" names the line "${series.line}", which is not in lines.yaml`,
      )
    } else if (entry.folder !== line.id) {
      // The folder is the line, so a file in the wrong one publishes a whole
      // series under a line nobody meant. It is invisible in the YAML itself.
      fail('4', file, `sits in catalog-src/${entry.folder}/ but declares the line "${series.line}"`)
    }

    if (series.family) {
      const known = (line?.families ?? []).some((f) => f.id === series.family)
      if (!known) {
        fail(
          '4',
          file,
          `series "${series.id}" names the family "${series.family}", which is not in line "${series.line}"'s family vocabulary (D32)`,
        )
      } else {
        const key = `${series.line}/${series.family}`
        familyUse.set(key, [...(familyUse.get(key) ?? []), series.id])
      }
    }

    for (const model of entry.models) {
      const where = `${file}#${model.id}`

      /* --- check 1: every id globally unique, and shaped for a URL forever --- */
      if (!ID_PATTERN.test(model.id)) {
        fail('1', where, `id "${model.id}" does not match ${ID_PATTERN.source}`)
      }
      const previousId = idOwner.get(model.id)
      if (previousId) {
        fail(
          '1',
          where,
          `id "${model.id}" is already used in ${previousId}. Ids are permanent and unique (D2)`,
        )
      } else {
        idOwner.set(model.id, file)
      }

      /* --- check 3: every ref unique, and matching its own line's pattern --- */
      const refKey = model.ref.toUpperCase()
      const previousRef = refOwner.get(refKey)
      if (previousRef) {
        fail('3', where, `reference "${model.ref}" is already used in ${previousRef}`)
      } else {
        refOwner.set(refKey, file)
      }

      if (line) {
        let pattern: RegExp | null = null
        try {
          pattern = new RegExp(`^(?:${line.ref_pattern})$`)
        } catch {
          pattern = null // already reported above, once, against lines.yaml
        }
        if (pattern && !pattern.test(model.ref) && !entry.refExceptions.has(model.id)) {
          // Deliberately a warning, not a failure (§10.2 check 3): the exception
          // is usually real, and a rule that blocks real data gets deleted.
          // Acknowledging it in a comment is what turns it off.
          warn(
            '3',
            where,
            `reference "${model.ref}" does not match line "${line.id}"'s pattern. If that is right, ` +
              `add a "# ref-exception: <why>" comment on the entry`,
          )
        }
      }

      /* --- check 4a: the series id is the prefix its models actually share --- */
      if (!model.ref.toLowerCase().replace(/\s+/g, '').startsWith(series.id)) {
        fail(
          '4a',
          where,
          `reference "${model.ref}" does not begin with its series id "${series.id}". ` +
            `A series is the reference prefix (D32) — either the model is in the wrong file or the series is misnamed`,
        )
      }

      /* --- check 5: an image exists at both widths, or is explicitly absent --- */
      if (model.image) {
        for (const name of [`${model.image}.webp`, `${model.image}@2x.webp`]) {
          if (!source.images.has(name)) {
            fail(
              '5',
              where,
              `image "${name}" is missing from public/img/models. Run catalog:images, or set image: null`,
            )
          }
        }
      }

      /* --- check 5a: a photograph names whose it is (D41) --- */
      if (model.image && !model.image_credit) {
        // The one integrity check that is about a promise to somebody outside
        // this project rather than about the data being consistent. A CC BY-SA
        // photograph published without its credit is a licence breach, and it
        // looks exactly like a photograph published with one.
        fail(
          '5a',
          where,
          `image "${model.image}" has no image_credit. A photograph carries its author, ` +
            `its licence and the page it came from (D41), or it is not published`,
        )
      }
      if (model.image_credit && !model.image) {
        fail(
          '5a',
          where,
          `image_credit with no image — the credit describes a file that is not there`,
        )
      }

      /* --- check 6: a year read off another page cites it (D54) --- */
      if (model.year_source && model.year == null) {
        // The mirror of 5a, failing for the same reason. A citation with
        // nothing to cite is not a harmless spare field: it asserts that
        // somebody established a fact the entry does not actually state.
        fail('6', where, `year_source with no year — a citation for a fact that is not there (D54)`)
      }

      /* --- check 9: a plausible year, or none --- */
      if (model.year != null) {
        const latest = options.currentYear + 1
        if (model.year < EARLIEST_YEAR || model.year > latest) {
          fail('9', where, `year ${model.year} is outside ${EARLIEST_YEAR}–${latest}`)
        }
      }
    }
  }

  /* --- check 4, continued: a family holding one series is half-finished --- */
  for (const [key, used] of familyUse) {
    if (used.length === 1) {
      // A warning, not a failure. §8.4 hides a single-series family anyway, so
      // nothing renders wrong — it is just a grouping somebody started.
      warn(
        '4',
        'lines.yaml',
        `family "${key}" holds only ${used[0]}. A family of one does not render as a heading (D32)`,
      )
    }
  }

  /* --- check 2: no published id may vanish without a tombstone (D2) --- */
  const tombstoned = new Set<string>()
  for (const entry of source.series) {
    for (const model of entry.models) {
      if (model.tombstone) tombstoned.add(model.id)
    }
  }

  for (const id of source.publishedIds) {
    if (!idOwner.has(id)) {
      fail(
        '2',
        'catalog-src/.published-ids.json',
        `id "${id}" was published and is now gone. Nothing in the database can follow that (D2) — ` +
          `keep the entry and give it a tombstone, or restore it`,
      )
    }
  }

  /* --- check 2a: a tombstone whose successor does not exist is a dead end --- */
  for (const entry of source.series) {
    for (const model of entry.models) {
      const replacement = model.tombstone?.replaced_by
      if (replacement && !idOwner.has(replacement)) {
        fail(
          '2a',
          `${entry.file}#${model.id}`,
          `tombstone points at "${replacement}", which is not in the catalogue. FR-3.6 renders that as a link`,
        )
      }
      if (replacement === model.id) {
        fail('2a', `${entry.file}#${model.id}`, `tombstone points at itself`)
      }
    }
  }

  // Sorted so the same catalogue always reports in the same order — a diff of
  // two validation runs should show what changed, not what moved.
  failures.sort(compareIssues)
  warnings.sort(compareIssues)
  return { failures, warnings }
}
