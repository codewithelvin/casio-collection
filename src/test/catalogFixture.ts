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
 *   * a model with a photograph and models without, so §8.6's three image mixes
 *     are all reachable,
 *   * a line with a zero count, which Sheen and Oceanus both are today,
 *   * a model carrying nothing but the five required fields (D27), which is what
 *     makes the empty specification table a real state rather than a hypothesis.
 */
export const catalogFixture: Catalog = {
  version: 'testfixture01',
  generatedAt: '2026-08-16',
  lines: [
    { id: 'g-shock', name: 'G-SHOCK', slug: 'g-shock', accent: '#F25C05', order: 0, count: 4 },
    {
      id: 'vintage',
      name: 'Vintage / Casio Collection',
      slug: 'vintage',
      accent: '#B08D57',
      order: 1,
      count: 2,
    },
    { id: 'edifice', name: 'Edifice', slug: 'edifice', accent: '#1F4E79', order: 2, count: 0 },
    { id: 'pro-trek', name: 'Pro Trek', slug: 'pro-trek', accent: '#2E7D32', order: 3, count: 0 },
    { id: 'baby-g', name: 'Baby-G', slug: 'baby-g', accent: '#E5559E', order: 4, count: 0 },
    { id: 'sheen', name: 'Sheen', slug: 'sheen', accent: '#8E7CC3', order: 5, count: 0 },
    { id: 'oceanus', name: 'Oceanus', slug: 'oceanus', accent: '#0091C8', order: 6, count: 0 },
  ],
  families: [
    { id: 'square', name: 'The square', line: 'g-shock', order: 0 },
    // Holds exactly one series, so §8.4 must not render it as a heading.
    { id: 'octagonal', name: 'Octagonal', line: 'g-shock', order: 1 },
  ],
  series: [
    {
      id: 'dw-5600',
      name: 'DW-5600',
      slug: 'dw-5600',
      line: 'g-shock',
      family: 'square',
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
    },
    {
      // Only the five required fields of D27 — the empty specification table.
      id: 'dw-5600bb-1',
      ref: 'DW-5600BB-1',
      line: 'g-shock',
      series: 'dw-5600',
      source: { url: 'https://example.com/dw-5600bb-1', kind: 'retailer' },
    },
    {
      id: 'gw-m5610u-1',
      ref: 'GW-M5610U-1',
      line: 'g-shock',
      series: 'gw-m5610',
      source: { url: 'https://example.com/gw-m5610u-1', kind: 'community' },
      year: 2019,
      movement: 'solar-radio',
    },
    {
      id: 'ga-2100-1a1',
      ref: 'GA-2100-1A1',
      line: 'g-shock',
      series: 'ga-2100',
      source: { url: 'https://www.casio.com/ga-2100-1a1', kind: 'official' },
      name: 'CasiOak',
      year: 2019,
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
    },
    {
      id: 'f-91w-3',
      ref: 'F-91W-3',
      line: 'vintage',
      series: 'f-91w',
      source: { url: 'https://casiorestore.com/casio-f-91w', kind: 'community' },
      year: 2003,
      colorway: 'Black with dark green accents',
    },
  ],
  facets: {},
}

/** A JSON round-trip, so a test gets what `fetch` would actually hand back. */
export const catalogFixtureJson = () => JSON.parse(JSON.stringify(catalogFixture)) as unknown
