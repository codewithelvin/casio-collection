import type { Catalog } from '../catalog/schema.ts'

/**
 * A published `catalog.json` for the browsing tests.
 *
 * Deliberately **not** the real one. The real catalogue is sixty-one Vintage
 * models with no images and no families, so a UI test written against it could
 * not tell "renders a family heading" from "renders nothing" — both pass. This
 * fixture carries the cases the screens have to handle and the real file does
 * not have yet:
 *
 *   * a family holding two series, which §8.4 renders as a heading,
 *   * a family holding one, which §8.4 says is **not** a heading — its series
 *     falls through to the ungrouped list,
 *   * a series with no family at all, which is the normal case,
 *   * a model with no photograph — `dw-5600bb-1`, which is **withheld** from
 *     every grid and every count as of 2026-08-26. It is still reachable by its
 *     own URL and still joins a collection, so it is what exercises those two
 *     paths, and it is why G-SHOCK counts 3 against four models.
 *
 *     This replaces what this list used to claim: "a model with a photograph and
 *     models without, so §8.6's three image mixes are all reachable". **An
 *     in-grid mix is no longer reachable and that is deliberate** — the client
 *     withdrew the photograph-less card from browsing, which reverses D29 and
 *     retires §8.6's mixed-grid case. The typographic tile itself is not dead
 *     code: the watch page still renders it, and `WatchCard` is still exercised
 *     against it there.
 *   * a model carrying nothing but the five required fields (D27), which is what
 *     makes the empty specification table a real state rather than a hypothesis.
 *
 * It used to carry **a line with a zero count**, which Sheen and Oceanus both
 * were. D51 removed that state from the artefact rather than from the fixture: a
 * line with no models is not published, so a fixture containing one would be
 * testing the screens against a `catalog.json` the build cannot produce.
 *
 * D59's availability is on **two of the six models and no more, deliberately**.
 * All three of its states have to be reachable — still listed, no longer listed,
 * and never measured — and 2 of 6 is 33%, which is under D26's gate, so the
 * *Availability* control stays out of the filter bar here. That keeps this
 * fixture's filter-bar tests about the facets they were written for; the
 * availability facet is tested against its own dense cohort in `filters.test.ts`,
 * where the density can be set on purpose.
 */
export const catalogFixture: Catalog = {
  version: 'testfixture01',
  generatedAt: '2026-08-16',
  lines: [
    // 4 of the 5 G-SHOCK models here: `dw-5600bb-1` has no photograph and is
    // withheld from every grid and every count (`browsable` in `client.ts`).
    { id: 'g-shock', name: 'G-SHOCK', slug: 'g-shock', accent: '#F25C05', order: 0, count: 4 },
    {
      id: 'vintage',
      name: 'Vintage / Casio Collection',
      slug: 'vintage',
      accent: '#B08D57',
      order: 1,
      count: 2,
    },
  ],
  families: [
    { id: 'square', name: 'The square', line: 'g-shock', order: 0 },
    // Holds exactly one series, so §8.4 must not render it as a heading.
    { id: 'octagonal', name: 'Octagonal', line: 'g-shock', order: 1 },
  ],
  /**
   * D62 — **two of them, holding two models and one**, and both numbers matter.
   * The PAC-MAN edition's two references sit in *different series*, which is the
   * whole claim the edition page makes and the one thing a single-series edition
   * could not prove; the second edition holds one model, so "an edition of one"
   * is a state the screens are exercised against rather than assumed away.
   *
   * Unlike a family of one — which §8.4 refuses to render as a heading — an
   * edition of one is perfectly normal and is published. A collaboration is
   * often exactly one watch.
   */
  editions: [
    {
      id: 'pac-man',
      name: 'PAC-MAN Collaboration',
      slug: 'pac-man',
      partner: 'Bandai Namco Entertainment Inc.',
      year: 2025,
      aka: ['PACMAN'],
      source: { url: 'https://www.casio.com/pac-man_collaboration/', kind: 'official' },
      order: 0,
      count: 2,
    },
    {
      id: 'uno',
      name: 'UNO Collaboration',
      slug: 'uno',
      partner: 'Mattel',
      source: { url: 'https://www.casio.com/a168weuc/', kind: 'official' },
      order: 1,
      count: 1,
    },
  ],
  series: [
    {
      id: 'dw-5600',
      name: 'DW-5600',
      slug: 'dw-5600',
      line: 'g-shock',
      family: 'square',
      // 2 of 3: `dw-5600bb-1` has no photograph and is withheld.
      count: 2,
    },
    {
      id: 'gw-m5610',
      name: 'GW-M5610',
      slug: 'gw-m5610',
      line: 'g-shock',
      family: 'square',
      count: 1,
    },
    {
      id: 'ga-2100',
      name: 'GA-2100',
      slug: 'ga-2100',
      line: 'g-shock',
      family: 'octagonal',
      count: 1,
    },
    {
      id: 'f-91w',
      name: 'F-91W',
      slug: 'f-91w',
      line: 'vintage',
      aka: ['F91W'],
      count: 2,
    },
  ],
  models: [
    {
      id: 'dw-5600e-1v',
      ref: 'DW-5600E-1V',
      line: 'g-shock',
      series: 'dw-5600',
      source: { url: 'https://www.casio.com/dw-5600e-1v', kind: 'official' },
      name: 'The square',
      year: 1996,
      display: 'digital',
      movement: 'quartz',
      module: '3229',
      case: { material: 'resin', width_mm: 42.8, weight_g: 53 },
      water_resistance_m: 200,
      features: ['stopwatch', 'alarm', 'el-backlight'],
      image: 'dw-5600e-1v',
      // D41 — an image never travels without its credit, so the fixture does not
      // model a state check 5a exists to make impossible.
      image_credit: {
        author: 'Multicherry',
        licence: 'cc-by-sa-4.0',
        url: 'https://commons.wikimedia.org/wiki/File:Casio_DW-5600E.jpg',
      },
      official_url: 'https://www.casio.com/dw-5600e-1v',
      discontinued: false,
    },
    {
      // Only the five required fields of D27 — the empty specification table, and
      // the model whose availability nobody measured. Leave it that way: without
      // it there is no way to tell "renders no pill" from "renders the wrong one".
      id: 'dw-5600bb-1',
      ref: 'DW-5600BB-1',
      line: 'g-shock',
      series: 'dw-5600',
      source: { url: 'https://example.com/dw-5600bb-1', kind: 'retailer' },
    },
    {
      // **The undated watch, and photographed so it is reachable.**
      //
      // `dw-5600bb-1` above used to be both this case and the withheld one. It
      // cannot be both any more: withholding took it out of every grid, and with
      // it went the only route to *Unknown year* (D5, D25), the only second
      // DW-5600 reference an ordering test could sort against, and the density
      // that makes Year a dense facet and Display a sparse one (FR-1.3a, D26).
      //
      // So it is split in two. This one carries a photograph and no year; that
      // one carries neither and is the withheld case. Keeping G-SHOCK at four
      // models is deliberate — the rail and the front door count it.
      id: 'dw-5600c-1',
      ref: 'DW-5600C-1',
      line: 'g-shock',
      series: 'dw-5600',
      source: { url: 'https://example.com/dw-5600c-1', kind: 'retailer' },
      image: 'dw-5600c-1',
      image_credit: {
        author: 'Multicherry',
        licence: 'cc-by-sa-4.0',
        url: 'https://commons.wikimedia.org/wiki/File:Casio_DW-5600C.jpg',
      },
    },
    {
      id: 'gw-m5610u-1',
      ref: 'GW-M5610U-1',
      line: 'g-shock',
      series: 'gw-m5610',
      source: { url: 'https://example.com/gw-m5610u-1', kind: 'community' },
      year: 2019,
      movement: 'solar-radio',
      // D62 — an edition of one, which is the common case for a collaboration.
      edition: 'uno',
      image: 'gw-m5610u-1',
      image_credit: {
        author: 'Multicherry',
        licence: 'cc-by-sa-4.0',
        url: 'https://commons.wikimedia.org/wiki/File:Casio_GW-M5610.jpg',
      },
    },
    {
      id: 'ga-2100-1a1',
      ref: 'GA-2100-1A1',
      line: 'g-shock',
      series: 'ga-2100',
      source: { url: 'https://www.casio.com/ga-2100-1a1', kind: 'official' },
      name: 'CasiOak',
      year: 2019,
      // D62 — the other half of the PAC-MAN edition is `f-91w-1`, in a different
      // series *and* a different line. Deliberate: the edition grid is the only
      // one on the site whose models do not share a line, and a fixture where
      // they did would let that pass by accident.
      edition: 'pac-man',
      image: 'ga-2100-1a1',
      image_credit: {
        author: 'Casio Computer Co., Ltd.',
        licence: 'rights-reserved',
        url: 'https://www.casio.com/ga-2100-1a1',
      },
    },
    {
      id: 'f-91w-1',
      ref: 'F-91W-1',
      line: 'vintage',
      series: 'f-91w',
      source: { url: 'https://casiorestore.com/casio-f-91w', kind: 'community' },
      year: 1989,
      display: 'digital',
      module: '593',
      colorway: 'Black with blue accent ring',
      edition: 'pac-man',
      // D62 — the one model here whose edition was established somewhere other
      // than its own source or the edition's, so the watch page's citation link
      // is a state a test can reach.
      edition_source: 'https://www.casio.com/jp/f-91w-1/',
      image: 'f-91w-1',
      image_credit: {
        author: 'Multicherry',
        licence: 'cc-by-sa-4.0',
        url: 'https://commons.wikimedia.org/wiki/File:Casio_F-91W.jpg',
      },
    },
    {
      id: 'f-91w-3',
      ref: 'F-91W-3',
      line: 'vintage',
      series: 'f-91w',
      source: { url: 'https://casiorestore.com/casio-f-91w', kind: 'community' },
      year: 2003,
      colorway: 'Black with dark green accents',
      discontinued: true,
      image: 'f-91w-3',
      image_credit: {
        author: 'Multicherry',
        licence: 'cc-by-sa-4.0',
        url: 'https://commons.wikimedia.org/wiki/File:Casio_F-91W-3.jpg',
      },
    },
  ],
  facets: {},
}

/** A JSON round-trip, so a test gets what `fetch` would actually hand back. */
export const catalogFixtureJson = () => JSON.parse(JSON.stringify(catalogFixture)) as unknown

/**
 * The same fixture as `catalog-index.json` would serve it (§6.2's split).
 *
 * **Derived from the catalogue rather than written beside it**, for the reason
 * the build derives the real one the same way: two hand-maintained copies of the
 * seven lines would let a test pass with a rail and a front door that disagree,
 * which is the one failure mode the split introduces and the only one worth
 * spending a line of test infrastructure on.
 */
export const catalogIndexFixtureJson = (catalog: Catalog = catalogFixture) => {
  const { models: _models, ...index } = catalog
  return JSON.parse(JSON.stringify(index)) as unknown
}

/**
 * Both legs of the split, served from one catalogue — **and the reason this is a
 * function rather than an example each test copies.**
 *
 * The two artefacts differ by one filename, and `catalog.json` is not a
 * substring of `catalog-index.json`, so a hand-written matcher for one silently
 * misses the other. What that looks like is not a failed assertion: the rail
 * renders its loading skeleton forever, or the front door shows an error state,
 * on a test that was about something else entirely. There is one matcher, here.
 *
 * Returns `null` for anything that is not a catalogue artefact, so a test with
 * its own endpoints layers them on top rather than reimplementing this.
 */
export function catalogArtefactResponse(
  url: string,
  catalog: Catalog = catalogFixture,
): { ok: boolean; status: number; json: () => Promise<unknown> } | null {
  // The index is matched first: see above.
  if (url.includes('catalog-index.json')) {
    return { ok: true, status: 200, json: async () => catalogIndexFixtureJson(catalog) }
  }
  if (url.includes('search-index.json')) {
    return {
      ok: true,
      status: 200,
      json: async () => roundTrip((await import('../catalog/build.ts')).searchIndexOf(catalog)),
    }
  }

  /**
   * §6.2's split, legs two and three — **served from the real build functions,
   * not from hand-written examples, and imported only when one is asked for.**
   *
   * Deriving the body from the build is the same argument `catalogIndexFixtureJson`
   * makes one level up and it matters more here: there are four artefacts and a
   * screen reads whichever it needs, so a hand-rolled `{ models: [...] }` would
   * let a test pass against a shape the build does not emit — and that failure
   * lands on the live site, where Zod rejects the real file and the screen shows
   * an error state no test ever saw.
   *
   * **The import is inside `json()` and that is not a style choice.** `setup.ts`
   * imports this module, so every one of the 57 test files loads it before it
   * runs; a top-level `import … from '../catalog/build.ts'` therefore pulls Zod
   * and the whole schema into the startup of every file, whether or not it ever
   * fetches a split artefact. It was written that way first, and the suite's
   * setup went to 130 s and its collection to 617 s — enough for a worker to
   * miss an RPC deadline and take the run down with an unhandled error while
   * every test passed. Here the cost is paid by the tests that actually ask.
   *
   * **A miss is a 404 and not a null**, which is what makes the not-found paths
   * testable: `/watch/does-not-exist` has to reach FR-10.2's designed screen,
   * and the client turns exactly a 404 into that. Returning null here would fall
   * through to the caller's own fallback and test the wrong branch. Whether the
   * document exists is decided from the fixture directly, so the 404 costs no
   * import either.
   */
  const split = /\/catalog\/(model|series|line|edition)\/([^/?]+)\.json/.exec(url)
  if (split) {
    const kind = split[1] as 'model' | 'series' | 'line' | 'edition'
    const id = decodeURIComponent(split[2] ?? '')
    if (!splitExists(catalog, kind, id)) {
      return { ok: false, status: 404, json: async () => ({}) }
    }
    return {
      ok: true,
      status: 200,
      json: async () => {
        const build = await import('../catalog/build.ts')
        const documents =
          kind === 'model'
            ? build.modelDocumentsOf(catalog)
            : kind === 'series'
              ? build.seriesModelsOf(catalog)
              : kind === 'line'
                ? build.lineModelsOf(catalog)
                : build.editionModelsOf(catalog)
        return roundTrip(documents.get(id))
      },
    }
  }

  if (url.includes('catalog.json')) {
    return {
      ok: true,
      status: 200,
      json: async () => JSON.parse(JSON.stringify(catalog)) as unknown,
    }
  }
  return null
}

/** What `fetch` would hand back: a value that has been through JSON. */
const roundTrip = (value: unknown) => JSON.parse(JSON.stringify(value)) as unknown

/**
 * Whether the build would emit this file, decided from the fixture alone.
 *
 * It deliberately mirrors the emptiness rule in `build.ts` rather than calling
 * it: a series or line gets a file if it is published **or** if any model names
 * it, which is how a series D51 withheld — every model unphotographed — still
 * has somewhere for the watch page to look.
 */
function splitExists(
  catalog: Catalog,
  kind: 'model' | 'series' | 'line' | 'edition',
  id: string,
): boolean {
  if (kind === 'model') return catalog.models.some((model) => model.id === id)
  if (kind === 'edition') return catalog.editions.some((edition) => edition.id === id)
  if (kind === 'series') {
    return (
      catalog.series.some((series) => series.id === id) ||
      catalog.models.some((model) => model.series === id)
    )
  }
  return catalog.lines.some((line) => line.id === id) || catalog.models.some((m) => m.line === id)
}
