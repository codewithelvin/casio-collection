import type { CatalogIndex, BrowseModel } from './schema.ts'

/**
 * **What search can see about a watch, and how it is spelled — in one place, on
 * purpose.**
 *
 * This was inside `search.ts` and had to come out of it for §6.2's third leg:
 * the slim search index computes this text at build time, in Node, and
 * `search.ts` imports `client.ts`, which reads `import.meta.env.BASE_URL` at
 * module scope. Importing it from the build would not be a style problem — it
 * would be a `TypeError` on a property that only exists under Vite.
 *
 * Splitting it out rather than copying the field list is the whole point.
 * FR-2.1's family and edition matching is the sort of thing that works, gets
 * duplicated, and then silently stops working in one of the two copies — and
 * the copy that breaks is the one nobody reads, which here would be the built
 * index every visitor actually searches.
 *
 * It takes a `CatalogIndex` rather than a `Catalog`, because none of it needs
 * the models: everything it joins comes from the shape.
 */

/**
 * FR-2.2 — punctuation does not count, on either side of the comparison.
 *
 * A collector types `ga2100`, `GA-2100`, `ga 2100` or `Ga2100` and means one
 * thing. Every one of those normalises to the same string, and so does the
 * reference in the catalogue, so the match is an ordinary substring test on a
 * form neither side had to get right.
 *
 * The alternative — a list of the punctuation Casio uses, or a fuzzy distance —
 * would be more code and would also match things it should not. `GA-2100` and
 * `GA2100` are the same watch; `GA-2100` and `GA-2110` are not, and no amount of
 * edit distance knows the difference.
 */
export function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

/**
 * Reference, name, module, series, series aliases, family, line, and the edition
 * with its partner and aliases — each normalised and joined by a space.
 *
 * **The separator is load-bearing.** Terms are normalised to letters and digits
 * only, so a space can never be matched by one: `F-91W` followed by `Watch`
 * cannot accidentally answer `wwatch`.
 *
 * Family matching is the entry that earns its place: it is what makes *square*
 * return DW-5600, GW-M5610 and GWX-5600 (D32), the word collectors use reaching
 * the codes they mean. A series' `aka` does the same job one level down —
 * *CasiOak*, *F91W*, *Marlin*.
 *
 * The edition is the same argument a third time and the strongest of the three
 * (D62). Nobody looking for the Pac-Man watch knows it is `A168WEPC-7A`;
 * *pacman* is the entire query. Its `aka` is what makes that work in practice:
 * `normalise` keeps only ASCII, so *Café Kitsuné* indexes as `cafkitsun`, and
 * the alias spelled *Cafe Kitsune* is the only reason typing the name the way a
 * keyboard produces it finds the watch.
 */
/**
 * A builder rather than a bare `(shape, model)` function, and the reason is
 * measured rather than stylistic: the lookups are by id, and doing them with
 * `Array.find` inside the loop is 3 827 models against 704 series and 30
 * editions — millions of comparisons on every build, for a string join.
 * The maps are built once and closed over.
 */
export function searchTextBuilder(shape: CatalogIndex): (model: BrowseModel) => string {
  const lineById = new Map(shape.lines.map((line) => [line.id, line.name]))
  const familyById = new Map(shape.families.map((family) => [family.id, family.name]))
  const seriesById = new Map(shape.series.map((series) => [series.id, series]))
  const editionById = new Map(shape.editions.map((edition) => [edition.id, edition]))

  return (model) => {
    const series = seriesById.get(model.series)
    const family = series?.family ? familyById.get(series.family) : undefined
    const edition = model.edition ? editionById.get(model.edition) : undefined

    return [
      model.ref,
      model.name,
      model.module,
      series?.name,
      ...(series?.aka ?? []),
      family,
      lineById.get(model.line),
      edition?.name,
      edition?.partner,
      ...(edition?.aka ?? []),
    ]
      .filter((part): part is string => Boolean(part))
      .map(normalise)
      .join(' ')
  }
}
