/**
 * The SEO build step — **the one that turns a single-page app into 340-odd
 * pages a crawler can actually read.**
 *
 * D1 put the catalogue in a static file and D13 put the app on GitHub Pages,
 * which between them mean every URL on this site serves the same empty
 * `<div id="root">`. A crawler that runs JavaScript eventually sees a watch
 * page; one that does not sees nothing at all, and *neither* sees a title or a
 * description that is about the watch. For a catalogue — a site whose entire
 * value is being found when somebody searches a reference code — that is the
 * difference between existing and not.
 *
 * So after Vite builds, this walks the catalogue and writes a real HTML file
 * for every line, every series and every model: the built shell, with its head
 * rewritten and a `<noscript>` body carrying the same facts the React page
 * will. The SPA still boots and takes over; nothing about the client changes.
 *
 * **It also fixes something D13 has lived with since M0.** A deep link on Pages
 * returns HTTP 404 with the 404.html body (§14.3) — correct, and it works, and
 * every crawler treats it as a dead page. A real file at that path returns 200.
 * The 404.html fallback stays for everything not in the catalogue.
 *
 * Run by `npm run build` after `vite build`, via Node's type stripping (D37).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CATALOG, type Catalog, type PublishedModel } from '../src/catalog/schema.ts'
// The glossary is pure data with no imports of its own, so this script can read
// the same list the route renders. A second copy of the definitions would be a
// second thing to keep in step, and the one that would drift is the one nobody
// looks at — the crawler's.
import { ALL_SYMBOLS, SYMBOL_GROUPS, manualUrl } from '../src/routes/symbols/symbols.ts'
import { t } from '../src/i18n/strings.ts'
// `<lastmod>` is taken from the commit that last touched the file a page is
// generated from, or omitted. The header of that module is the argument for why
// those are the only two options.
import { fileDates, newest } from './lib/lastmod.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')

/** D39 — the production origin. Canonical URLs cannot be relative. */
const ORIGIN = 'https://casiovault.com'

/**
 * FR-10.4 — the non-affiliation sentence "travels with any link preview", so it
 * is appended to every description rather than living only on the home page.
 * It costs characters Google may truncate in a result snippet; the requirement
 * is about what the tag *carries*, not about what is displayed, and a legal
 * position that only appears on one page is not a position.
 */
const DISCLAIMER =
  'An independent, non-commercial project, not affiliated with or endorsed by Casio Computer Co., Ltd.'

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

interface Page {
  /** Path with no leading or trailing slash. Empty string is the home page. */
  path: string
  title: string
  description: string
  /** Rendered inside <noscript>, and the only content a JS-less crawler sees. */
  body: string
  jsonLd?: object[]
  /** An absolute URL. Absent means the page previews with the site card. */
  image?: string | undefined
  /** Describes `image` for a reader whose preview card is read aloud. */
  imageAlt?: string | undefined
  /** Excluded from the sitemap and marked noindex. */
  noindex?: boolean
  /** Served at more than one URL, so it may not claim any of them. See `notFoundPage`. */
  noCanonical?: boolean
  /** Sitemap hint. Lines change when the catalogue does; models rarely. */
  priority: string
  /**
   * The repository-relative files this page is generated from, newest of which
   * becomes its `<lastmod>`. A watch and its series have one; a line page has
   * every series file in the line, because adding a series to a line changes
   * the line page. Absent means the page is left out of the dating entirely.
   */
  sources?: string[]
}

/**
 * Where a series is written down. Line ids and line directory names are the
 * same string, and `catalog:build` is what enforces that — a line with no
 * directory publishes no series and never reaches this file.
 */
const seriesFile = (line: Catalog['lines'][number], seriesId: string) =>
  `catalog-src/${line.id}/${seriesId}.yaml`

const canonical = (path: string) => `${ORIGIN}/${path}${path === '' ? '' : '/'}`

/**
 * The link-preview card for every page that is not a watch.
 *
 * A page with no `og:image` previews as a grey rectangle with a URL in it, and
 * that is what the front door, all seven line pages, 566 series pages and the
 * glossary have looked like in every chat window and every social post since
 * the site went up — the ones most likely to be shared by somebody describing
 * the project rather than linking a single reference. It is a committed file
 * rather than a generated one for the same reason the PWA icons are (see
 * `scripts/gen-icons.mjs`): it changes roughly never, and a preview card that
 * silently disappears because a build step was reordered is a bad trade.
 *
 * A watch page overrides it with the photograph, which is a better card than any
 * generic one — see `page.image`.
 */
const SOCIAL_CARD = `${ORIGIN}/og.png`

/**
 * **What a crawler may do with a page it has decided to index.**
 *
 * `index, follow` is the default, so on its own this tag would say nothing.
 * The other three are the reason it is written at all, and two of them are
 * worth real traffic to a catalogue like this one:
 *
 *   * `max-image-preview:large` lets Google show the watch photograph at full
 *     size in a result and in Discover. The default is a thumbnail, and for a
 *     site whose subject is what a watch looks like, the thumbnail is the
 *     product being shown badly. This is opt-in — there is no way to get it
 *     other than by asking.
 *   * `max-snippet:-1` removes the length cap on the text snippet, so a
 *     specification line is allowed to appear in full rather than being cut at
 *     Google's default.
 *   * `max-video-preview:-1` is stated for completeness. There is no video on
 *     this site; the directive costs nine bytes and means the answer does not
 *     change on the day there is one.
 *
 * These are the same directives the EU Copyright Directive made necessary for
 * publishers in the EEA — without them a crawler is entitled to assume the
 * conservative default, which is exactly what it did.
 */
const INDEXABLE = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'

/** Reachable and crawlable, and deliberately not listed. See `listed`. */
const WITHHELD = 'noindex, follow'

/**
 * The same test as `browsable` in `src/catalog/client.ts`, and it has to be the
 * same one — **this file is the crawler's copy of the grid.**
 *
 * A tombstone was already withheld here. A model with no photograph was not, and
 * that is what a crawl came back and called an orphan: 389 `/watch/…/` URLs
 * advertised in sitemap.xml that no rendered page on the site links to, because
 * the client's 2026-08-26 reversal of D29 withholds a watch nobody can show you
 * from every grid, every facet, every search result and every series count. The
 * sitemap was the only thing still pointing at them, which is the definition of
 * the finding.
 *
 * So the rule is applied on both sides of the same page instead of one:
 *
 *   * the page is still WRITTEN, so a direct link and a shared link keep
 *     working and `modelById` keeps resolving — withheld is not retired, and
 *     FR-3.6 is about reachability, not about being advertised;
 *   * it carries `noindex, follow`, and is therefore out of the sitemap;
 *   * no line, series or edition listing links to it, so the `<noscript>` body
 *     lists what the React page lists rather than a longer set;
 *   * the counts in those titles and descriptions are the counts the reader
 *     sees. "146 references" over a page showing 80 was the same divergence
 *     read out loud.
 *
 * The moment `image` is set the page rejoins the sitemap on the next build.
 * Nothing has to be un-done, which is the property `browsable` was written for.
 */
const listed = (model: PublishedModel): boolean => !model.tombstone && Boolean(model.image)

/* ------------------------------------------------------------------------- *
 * The pages.
 * ------------------------------------------------------------------------- */

/**
 * The front door — and the one place the glossary is linked from for a crawler
 * that runs no JavaScript.
 *
 * `/symbols` is in the footer of every route, so a rendering crawler finds it
 * everywhere and it needs no help. A `<noscript>` body carries no footer, which
 * left the one page here written for a search query rather than a reference code
 * reachable only from sitemap.xml — an orphan by the same test that started this,
 * and the only one left in the artefact once the withheld watches are out.
 */
function homePage(catalog: Catalog): Page {
  // This filtered out the unseeded lines so the JSON-LD would not offer a reader
  // a category with nothing in it. D51 moved that decision into the build, where
  // it holds for the rail and the front door too, so the filter here would now
  // only be hiding a state the artefact cannot contain.
  const lines = catalog.lines
  // The count the site shows, not the count the file holds: `line.count` beneath
  // is already the browsable one, and a front door claiming 3 335 references over
  // a rail adding up to 2 943 is the same divergence the withheld pages were.
  const models = catalog.models.filter(listed)
  return {
    path: '',
    title: 'Casio Vault — the Casio watch catalogue, and the ones you own',
    description: `Browse ${models.length} Casio references across ${catalog.series.length} series. Search by reference, filter by year and feature, and mark what you own. ${DISCLAIMER}`,
    priority: '1.0',
    // The front door carries the counts and the line list, so anything that
    // changes the catalogue changes this page.
    sources: [
      'catalog-src/lines.yaml',
      'catalog-src/editions.yaml',
      ...catalog.series.map((entry) => {
        const line = catalog.lines.find((candidate) => candidate.id === entry.line)
        return line ? seriesFile(line, entry.id) : ''
      }),
    ].filter(Boolean),
    body: `
      <h1>Casio Vault</h1>
      <p>Browse the Casio watch catalogue by line and series, and keep track of the ones you own.</p>
      <h2>Lines</h2>
      <ul>
        ${catalog.lines
          .map(
            (line) =>
              `<li><a href="/line/${line.slug}/">${escapeHtml(line.name)}</a> — ${line.count} references</li>`,
          )
          .join('\n        ')}
      </ul>
      ${catalog.editions.length > 0 ? `<p><a href="/editions/">Collaborations and limited editions</a> — ${catalog.editions.length} of them.</p>` : ''}
      <p><a href="/symbols/">What the symbols on a Casio display mean</a> — every indicator, with the manual that defines it.</p>
      <p>${DISCLAIMER}</p>`,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'Casio Vault',
        url: `${ORIGIN}/`,
        description: DISCLAIMER,
        // Sitelinks searchbox. The search route already takes ?q= (FR-1.6), so
        // this describes what exists rather than adding an endpoint for Google.
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${ORIGIN}/search?q={search_term_string}`,
          },
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'Casio watch lines',
        hasPart: lines.map((line) => ({
          '@type': 'CollectionPage',
          name: line.name,
          url: `${ORIGIN}/line/${line.slug}/`,
        })),
      },
    ],
  }
}

function linePage(catalog: Catalog, line: Catalog['lines'][number]): Page {
  const series = catalog.series.filter((entry) => entry.line === line.id)
  const models = catalog.models.filter((model) => model.line === line.id && listed(model))

  return {
    path: `line/${line.slug}`,
    title: `${line.name} — every reference in the catalogue · Casio Vault`,
    description: `${models.length} Casio ${line.name} references in ${series.length} series, with the specification each one is actually sourced for. ${DISCLAIMER}`,
    priority: '0.8',
    // Every series in the line, because the page is the list of them.
    sources: ['catalog-src/lines.yaml', ...series.map((entry) => seriesFile(line, entry.id))],
    body: `
      <h1>${escapeHtml(line.name)}</h1>
      <p>${models.length} references in ${series.length} series.</p>
      <h2>Series</h2>
      <ul>
        ${series
          .map(
            (entry) =>
              `<li><a href="/line/${line.slug}/${entry.id}/">${escapeHtml(entry.name)}</a> — ${entry.count} references</li>`,
          )
          .join('\n        ')}
      </ul>
      <p>${DISCLAIMER}</p>`,
    jsonLd: [
      breadcrumb([
        { name: 'Casio Vault', path: '' },
        { name: line.name, path: `line/${line.slug}` },
      ]),
    ],
  }
}

function seriesPage(
  catalog: Catalog,
  line: Catalog['lines'][number],
  series: Catalog['series'][number],
): Page {
  const models = catalog.models.filter((model) => model.series === series.id && listed(model))

  return {
    path: `line/${line.slug}/${series.id}`,
    title: `${series.name} — ${models.length} references · Casio Vault`,
    description: `Every catalogued ${series.name} reference: ${models
      .slice(0, 6)
      .map((model) => model.ref)
      .join(', ')}${models.length > 6 ? ' and more' : ''}. ${DISCLAIMER}`,
    priority: '0.7',
    sources: [seriesFile(line, series.id)],
    body: `
      <h1>${escapeHtml(series.name)}</h1>
      <p>Part of <a href="/line/${line.slug}/">${escapeHtml(line.name)}</a>.</p>
      <ul>
        ${models
          .map(
            (model) =>
              `<li><a href="/watch/${model.id}/">${escapeHtml(model.ref)}</a>${
                model.name ? ` — ${escapeHtml(model.name)}` : ''
              }${model.year ? ` (${model.year})` : ''}</li>`,
          )
          .join('\n        ')}
      </ul>
      <p>${DISCLAIMER}</p>`,
    jsonLd: [
      breadcrumb([
        { name: 'Casio Vault', path: '' },
        { name: line.name, path: `line/${line.slug}` },
        { name: series.name, path: `line/${line.slug}/${series.id}` },
      ]),
    ],
  }
}

/**
 * D62 — the editions index, and one page per edition.
 *
 * These are the pages this step exists for more than any others on the site.
 * "casio pac man watch" is a query somebody types; `A168WEPC-7A` is not, and
 * until there was an edition there was no page on this site whose title
 * contained the words a person searching for that watch actually uses. Four
 * references in four different series had no URL that showed them together
 * either, so there was nothing for a crawler to rank even if it had run the
 * JavaScript.
 */
function editionsPage(catalog: Catalog): Page {
  return {
    path: 'editions',
    title: 'Casio limited editions and collaborations · Casio Vault',
    description: `The ${catalog.editions.length} named Casio releases in this catalogue — collaborations, dedications and limited runs, among them ${catalog.editions
      .slice(0, 5)
      .map((edition) => edition.name)
      .join(', ')}${catalog.editions.length > 5 ? ' and more' : ''}. ${DISCLAIMER}`,
    priority: '0.8',
    sources: ['catalog-src/editions.yaml'],
    body: `
      <h1>Editions</h1>
      <p>Watches Casio gave a name to and released under it — collaborations, dedications, anniversaries and seasonal collections.</p>
      <ul>
        ${catalog.editions
          .map(
            (edition) =>
              `<li><a href="/editions/${edition.slug}/">${escapeHtml(edition.name)}</a>${
                edition.partner ? ` — with ${escapeHtml(edition.partner)}` : ''
              } — ${edition.count} references</li>`,
          )
          .join('\n        ')}
      </ul>
      <p>${DISCLAIMER}</p>`,
    jsonLd: [
      breadcrumb([
        { name: 'Casio Vault', path: '' },
        { name: 'Editions', path: 'editions' },
      ]),
    ],
  }
}

/**
 * The display-symbol glossary — and like the editions index, this is a page the
 * prerender step exists for rather than one it merely covers.
 *
 * *"What does SIG mean on a Casio"* is a question people type into a search box
 * every day. `GW-M5610-1` is not. Until this page there was nothing on this site
 * whose title contained the words somebody with a watch on their wrist and a
 * question about it would actually use — and the answer, unlike everything else
 * here, does not depend on the catalogue at all.
 *
 * **`DefinedTermSet` rather than `FAQPage`.** A glossary is what it is, and
 * schema.org has the type for it; dressing a glossary up as questions to
 * chase a rich result would be describing the page as something it is not. The
 * `body` is the whole glossary in plain HTML, so a crawler that runs no
 * JavaScript still gets every definition rather than a heading and a promise.
 */
function symbolsPage(): Page {
  const groups = SYMBOL_GROUPS.map((group) => {
    const rows = group.symbols
      .map((symbol) => {
        const label = symbol.token ? `<strong>${escapeHtml(symbol.token)}</strong> — ` : ''
        return `<dt>${label}${escapeHtml(symbol.name)}</dt>\n          <dd>${escapeHtml(symbol.meaning)}</dd>`
      })
      .join('\n          ')
    return `<h2>${escapeHtml(t(`symbols.group.${group.id}`))}</h2>\n        <dl>\n          ${rows}\n        </dl>`
  }).join('\n        ')

  return {
    path: 'symbols',
    title: 'Casio digital watch symbols explained — what every indicator means · Casio Vault',
    description: `What the indicators on a Casio digital display mean — ${ALL_SYMBOLS.slice(0, 8)
      .map((symbol) => symbol.token ?? symbol.name)
      .join(', ')} and ${ALL_SYMBOLS.length - 8} more, each with the Casio manual that defines it. ${DISCLAIMER}`,
    priority: '0.8',
    // The one page here whose source is code rather than catalogue.
    sources: ['src/routes/symbols/symbols.ts'],
    body: `
      <h1>${escapeHtml(t('symbols.heading'))}</h1>
      <p>${escapeHtml(t('symbols.lead'))}</p>
        ${groups}
      <p>${escapeHtml(t('symbols.note.scope'))}</p>
      <p>${DISCLAIMER}</p>`,
    jsonLd: [
      breadcrumb([
        { name: 'Casio Vault', path: '' },
        { name: 'Display symbols', path: 'symbols' },
      ]),
      {
        '@context': 'https://schema.org',
        '@type': 'DefinedTermSet',
        name: 'Casio digital watch display symbols',
        url: canonical('symbols'),
        hasDefinedTerm: ALL_SYMBOLS.map((symbol) => ({
          '@type': 'DefinedTerm',
          name: symbol.token ?? symbol.name,
          description: symbol.meaning,
          inDefinedTermSet: canonical('symbols'),
          // The manual is the citation the page shows the reader; giving it to a
          // crawler as well is the same promise made twice rather than a new one.
          sameAs: manualUrl(symbol.modules[0]),
        })),
      },
    ],
  }
}

function editionPage(catalog: Catalog, edition: Catalog['editions'][number]): Page {
  const models = catalog.models.filter((model) => model.edition === edition.id && listed(model))

  return {
    path: `editions/${edition.slug}`,
    title: `${edition.name} — ${edition.count} Casio references · Casio Vault`,
    description: `Every catalogued reference in the ${edition.name}${
      edition.partner ? `, Casio with ${edition.partner}` : ''
    }: ${models.map((model) => model.ref).join(', ')}. ${DISCLAIMER}`,
    priority: '0.7',
    // The edition is defined in one file; the references it names live in their
    // own series files, and a specification changing there does not change what
    // this page says.
    sources: ['catalog-src/editions.yaml'],
    body: `
      <h1>${escapeHtml(edition.name)}</h1>
      ${edition.partner ? `<p>Casio with ${escapeHtml(edition.partner)}${edition.year ? `, ${edition.year}` : ''}.</p>` : ''}
      <ul>
        ${models
          .map(
            (model) =>
              `<li><a href="/watch/${model.id}/">${escapeHtml(model.ref)}</a>${
                model.name ? ` — ${escapeHtml(model.name)}` : ''
              }</li>`,
          )
          .join('\n        ')}
      </ul>
      <p>Source: <a href="${escapeHtml(edition.source.url)}" rel="nofollow noopener">${escapeHtml(edition.source.kind)}</a></p>
      <p>${DISCLAIMER}</p>`,
    jsonLd: [
      breadcrumb([
        { name: 'Casio Vault', path: '' },
        { name: 'Editions', path: 'editions' },
        { name: edition.name, path: `editions/${edition.slug}` },
      ]),
    ],
  }
}

function watchPage(catalog: Catalog, model: PublishedModel): Page {
  const line = catalog.lines.find((entry) => entry.id === model.line)
  const series = catalog.series.find((entry) => entry.id === model.series)

  const facts: [string, string | number | undefined][] = [
    ['Line', line?.name],
    ['Series', series?.name],
    ['Year', model.year],
    ['Display', model.display],
    ['Movement', model.movement],
    ['Module', model.module],
    ['Case material', model.case?.material],
    ['Water resistance', model.water_resistance_m ? `${model.water_resistance_m} m` : undefined],
    ['Colourway', model.colorway],
    // D59 — the same sentence the pill shows, for the reader who has no
    // JavaScript and the crawler that never runs any. Deliberately NOT expressed
    // as schema.org `offers.availability`: this site sells nothing, and an
    // `ItemAvailability` on a page with no price is a commercial claim FR-10.4
    // does not let the catalogue make.
    [
      'Availability',
      model.discontinued === undefined
        ? undefined
        : model.discontinued
          ? 'no longer listed by Casio'
          : 'currently listed by Casio',
    ],
  ]
  const stated = facts.filter((pair): pair is [string, string | number] => pair[1] !== undefined)

  const name = [model.ref, model.name].filter(Boolean).join(' — ')
  const image = model.image ? `${ORIGIN}/img/models/${model.image}.webp` : undefined

  /**
   * The description is written from what the model actually carries rather than
   * from a template with blanks in it. D27 makes an empty specification normal,
   * and "GA-2100-1A1: undefined, undefined" is exactly the sort of string that
   * ends up in a search result.
   */
  const phrase = (label: string, value: string | number): string => {
    // Written as a person would say it. "display ana-digi" is a field name and
    // a value glued together, and it is what ends up in a search result.
    if (label === 'Display') return `${value} display`
    if (label === 'Movement') return `${value} movement`
    if (label === 'Module') return `module ${value}`
    if (label === 'Year') return `released ${value}`
    if (label === 'Case material') return `${value} case`
    if (label === 'Water resistance') return `${value} water resistant`
    return `${String(label).toLowerCase()} ${value}`
  }

  // Availability is excluded for a different reason than Line and Series, which
  // are already in the sentence around it: it has **two values across 1 500
  // pages**, so in a meta description it is the opposite of distinguishing. It
  // stays in the <dl>, where a crawler reading the page finds it.
  const summary = stated
    .filter(([label]) => label !== 'Line' && label !== 'Series' && label !== 'Availability')
    .slice(0, 4)
    .map(([label, value]) => phrase(label, value))
    .join(', ')

  return {
    path: `watch/${model.id}`,
    title: `${name} — specification · Casio Vault`,
    description: `Casio ${model.ref}${line ? ` (${line.name})` : ''}${
      summary ? `: ${summary}` : ''
    }. Sourced from a real page and credited. ${DISCLAIMER}`,
    priority: '0.6',
    image,
    // What the photograph shows, in the words a person would use. It is the
    // alt text of the card, and on a watch page it is the one string that
    // describes the picture rather than the record.
    imageAlt: image ? `Casio ${[model.ref, model.name].filter(Boolean).join(', ')}` : undefined,
    sources: line ? [seriesFile(line, model.series)] : undefined,
    body: `
      <h1>${escapeHtml(model.ref)}</h1>
      ${model.name ? `<p>${escapeHtml(model.name)}</p>` : ''}
      ${
        // `width` without `height`, and the pair was wrong. The normalised
        // photographs are not all square — `31cs-10.webp` is 400×500 — so a
        // fixed `height="400"` squashed every portrait watch on the site for
        // the one reader who sees this markup. Declaring only the width lets
        // the browser use the file's own aspect ratio, which is the fact that
        // was being asserted incorrectly rather than one worth asserting.
        image
          ? `<img src="/img/models/${model.image}.webp" width="400" alt="${escapeHtml(`Casio ${model.ref}`)}" />`
          : ''
      }
      <dl>
        ${stated
          .map(([label, value]) => `<dt>${label}</dt><dd>${escapeHtml(String(value))}</dd>`)
          .join('\n        ')}
      </dl>
      ${model.features?.length ? `<p>Features: ${model.features.map((f) => escapeHtml(f.replace(/-/g, ' '))).join(', ')}</p>` : ''}
      <p>Source: <a href="${escapeHtml(model.source.url)}" rel="nofollow noopener">${escapeHtml(model.source.kind)}</a></p>
      ${series && line ? `<p>More in <a href="/line/${line.slug}/${series.id}/">${escapeHtml(series.name)}</a>.</p>` : ''}
      <p>${DISCLAIMER}</p>`,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name,
        sku: model.ref,
        mpn: model.ref,
        // A factual attribute of the watch. It is not a claim about this site,
        // and FR-10.4's rule — no page speaks on Casio's behalf — is about the
        // prose, which says the opposite in the same document.
        brand: { '@type': 'Brand', name: 'Casio' },
        ...(line ? { category: line.name } : {}),
        ...(image ? { image } : {}),
        url: canonical(`watch/${model.id}`),
        ...(model.year ? { releaseDate: String(model.year) } : {}),
        description: `Casio ${model.ref}${summary ? `: ${summary}` : ''}`,
      },
      breadcrumb([
        { name: 'Casio Vault', path: '' },
        ...(line ? [{ name: line.name, path: `line/${line.slug}` }] : []),
        ...(line && series ? [{ name: series.name, path: `line/${line.slug}/${series.id}` }] : []),
        { name: model.ref, path: `watch/${model.id}` },
      ]),
    ],
  }
}

function breadcrumb(trail: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((step, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: step.name,
      item: canonical(step.path),
    })),
  }
}

/* ------------------------------------------------------------------------- *
 * Writing them.
 * ------------------------------------------------------------------------- */

function render(shell: string, page: Page, hints: string[]): string {
  let html = shell

  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(page.title)}</title>`)
  html = html.replace(
    /<meta\s+name="description"[\s\S]*?\/>/,
    `<meta name="description" content="${escapeHtml(page.description)}" />`,
  )

  /**
   * **The shell's own og:/twitter: tags have to come out before ours go in.**
   *
   * index.html ships a generic set so that a page this step does not write
   * still previews as something. Since 404.html is written here too, the only
   * URL left in that category is `/search`, which has no file and is served by
   * the fallback — but the tags stay in the shell regardless, because they are
   * also what the dev server serves. Left in place *here* they would be
   * duplicates, and a crawler reading duplicated Open Graph tags
   * takes the first: every watch on the site would have shared as "Casio
   * Vault". That is the whole feature failing while every page looks correct in
   * a browser, which is why it is stripped here rather than removed from the
   * shell.
   */
  html = html.replace(
    /\s*<meta\s+(?:property="og:(?:title|description|type)"|name="twitter:card")[\s\S]*?\/>/g,
    '',
  )

  // A photograph is a better card than any generic one, so a watch page uses
  // its own and everything else falls back to the site card. Nothing is left
  // without one: a preview with no image is the version of this page a reader
  // is least likely to click.
  const image = page.image ?? SOCIAL_CARD

  const head: string[] = [
    ...hints,
    ...(page.noCanonical
      ? []
      : [
          `<link rel="canonical" href="${canonical(page.path)}" />`,
          `<meta property="og:url" content="${canonical(page.path)}" />`,
        ]),
    `<meta name="robots" content="${page.noindex ? WITHHELD : INDEXABLE}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta property="og:title" content="${escapeHtml(page.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(page.description)}" />`,
    `<meta property="og:site_name" content="Casio Vault" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:image:alt" content="${escapeHtml(page.imageAlt ?? 'Casio Vault')}" />`,
    `<meta name="twitter:title" content="${escapeHtml(page.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(page.description)}" />`,
    `<meta name="twitter:image" content="${image}" />`,
  ]

  if (page.jsonLd) {
    for (const block of page.jsonLd) {
      // `</script>` inside a JSON string would close this block early. It cannot
      // happen with the data here, and relying on that is how it happens later.
      head.push(
        `<script type="application/ld+json">${JSON.stringify(block).replace(/</g, '\\u003c')}</script>`,
      )
    }
  }

  html = html.replace('</head>', `    ${head.join('\n    ')}\n  </head>`)

  /**
   * The `<noscript>` sits INSIDE `#root`, so React replaces it on hydration and
   * a reader with JavaScript never sees it. A crawler without JavaScript reads
   * it as the page — which is the whole point of this file.
   */
  html = html.replace(
    '<div id="root"></div>',
    `<div id="root"><noscript>${page.body}</noscript></div>`,
  )

  return html
}

/**
 * Resource hints, injected here because the values only exist after the build.
 *
 * **The two fonts and the catalogue are the three things every route needs and
 * none of them is discoverable from the HTML.** The fonts are referenced from
 * inside a stylesheet, so the browser cannot ask for them until it has parsed
 * the CSS; the catalogue is fetched by JavaScript, so it waits for the bundle
 * to execute. Both are on the critical path for the first paint that shows
 * anything — the rail carries model counts (FR-1.1) — and a preload moves them
 * to the front of the queue rather than the back of a chain.
 *
 * **Three weights, not two, and the third was found by measuring rather than by
 * reading this comment.** Sans 400 for body text and mono 400 for a reference
 * code are what every card is made of. Sans 600 was left out on the argument
 * that the first screen does not use it — and the first screen is a header
 * wordmark and a page title, both of which are set in 600. Lighthouse put it at
 * the end of the longest network chain on the live site, discovered from AntD's
 * injected CSS at 1 634 ms and costing 767 ms.
 *
 * The remaining two weights stay unhinted: preloading all five would compete
 * with the bundle for the same connection, which is the reason this list is a
 * filter and not `assets/*.woff2`.
 */
/* ------------------------------------------------------------------------- *
 * robots.txt
 * ------------------------------------------------------------------------- */

/**
 * The paths no crawler should list, and why each one.
 *
 * `/u/` is the important one, and it is a **privacy** decision rather than a
 * crawl-budget one (D45). FR-7.3 tells somebody that publishing means "anyone
 * with the link can read it". Being listed in Google is a materially different
 * sentence, and the person who agreed to the first did not agree to the second.
 * The pages stay public and shareable; they are simply not advertised.
 *
 * `/collection` and `/settings` need a session and would only ever render the
 * sign-in panel to a crawler. `/auth/` is a redirect target and never a page.
 * Neither is linked from anywhere a signed-out reader can see, so no crawler
 * reaches them by following links; these three rules are what closes the door
 * on a URL that arrives from somewhere else entirely — a referrer log, a pasted
 * link, somebody's browser history sync.
 *
 * **`/assets/` came off this list, and removing it is the single most important
 * line in the file.** The build output was closed here on the reasoning that it
 * holds no page, with `/assets/*.css$`, `/assets/*.js$` and `/assets/*.woff2$`
 * allowed back out over the top so that a rendering crawler could still fetch
 * what a page needs to render. That construction is correct — and it is correct
 * *only* for a parser that implements RFC 9309's wildcards and end-of-match
 * anchor. A parser that does not implement them reads the three `Allow` rules
 * as paths that literally begin `/assets/*`, matches none of them, falls
 * through to `Disallow: /assets/`, and declines to fetch the bundle. Every word
 * of every watch page on this site is in that bundle: the `<noscript>` body
 * below is hidden from anything that runs JavaScript, so what such a crawler
 * indexes is an empty `<div id="root">`.
 *
 * Weigh the two sides. The upside of closing the directory was crawl budget on
 * sixty hashed files that no page links to as a destination and that no crawler
 * walks looking for content — which is to say, nothing measurable. The downside
 * is a whole site indexed blank by any fetcher whose robots parser is simpler
 * than Google's. There are no source maps in the artefact (`build.sourcemap` is
 * off) and nothing else in there is private, so there is not even a secondary
 * reason to keep it. When a rule's best case is zero and its worst case is the
 * site, the rule goes.
 */
const DISALLOWED = ['/auth/', '/collection', '/settings', '/u/']

/**
 * Stated rather than left implied — both of these are already covered by
 * `Allow: /`.
 *
 * `/img/` is here because the photograph is half of what a reference page is
 * for: an image crawler that indexes nothing else here should still index those,
 * and the next person to reach for a directory-wide `Disallow` should have to
 * read a sentence about it first. `/assets/` is here for the same reason one
 * step further on — it is where the argument above lives, and a bare absence
 * would read as an oversight to be tidied up rather than as the decision it is.
 */
const ALLOWED = ['/img/', '/assets/']

/**
 * **There is one group, and it is `*`.**
 *
 * This file used to name 48 crawlers individually — the search engines, the
 * assistant and training-corpus bots, the link-preview fetchers — and give every
 * one of them a group byte-identical to `*`. The stated reason was that a
 * crawler reading only its own group would still see `/u/` closed. That reason
 * does not hold. RFC 9309 §2.2.1 has a crawler select the *single* most specific
 * group matching its token and fall back to `*` when nothing matches, so a named
 * bot read its own copy of the rules and an unnamed one read `*`, and both got
 * the same answer. The rationale described a parser that hunts for its own name
 * and ignores `*` altogether — and a parser broken in that particular way is not
 * honouring `Disallow: /u/` from any group.
 *
 * So the list bought nothing, and it cost: 48 names to keep current in a field
 * that ships a new crawler every few months, a ruleset emitted twice so the two
 * copies could drift apart, and the false authority of a roster that is stale
 * the moment it is written. `*` covers a crawler nobody has heard of yet, which
 * is the only kind this file will actually meet.
 *
 * **`Google-Extended` and `Applebot-Extended` went with them, and they were the
 * interesting case.** Neither is a crawler token — they control whether the
 * content may be used for AI *training*, not whether it may be fetched, and they
 * are opt-out-only: absence means allowed. Writing `Allow: /` for them stated a
 * real policy rather than a redundant one. It is still the policy; D45 makes
 * being read the point, and this catalogue is public Casio reference data. It is
 * now expressed the way the standard expresses it, by not objecting.
 *
 * **Rule order: specific allows, then the disallows, then the blanket allow.**
 * It is irrelevant to a crawler that implements longest-match — RFC 9309 does,
 * and so does every parser derived from Google's — and it is the entire answer
 * for a simple one that obeys the first rule that matches. That is why
 * `Allow: /` sits at the bottom rather than the top, where it used to: read
 * first-match, a leading `Allow: /` answers every question before
 * `Disallow: /u/` is ever reached, and `/u/` is the one rule in this file that
 * protects a person rather than a crawl budget.
 */
export function robotsTxt(): string {
  const rules = [
    ...ALLOWED.map((path) => `Allow: ${path}`),
    ...DISALLOWED.map((path) => `Disallow: ${path}`),
    'Allow: /',
  ]
  return [
    '# casiovault.com — an independent, non-commercial Casio catalogue.',
    '# Not affiliated with or endorsed by Casio Computer Co., Ltd.',
    '',
    '# Every crawler is welcome on every page, on the watch photographs under',
    '# /img/, and on the JavaScript and CSS under /assets/ that a page needs in',
    '# order to render. Blocking the last of those is how a rendering crawler',
    '# ends up indexing an empty document, so nothing here blocks it.',
    '',
    '# What is closed needs a session or belongs to a person: the four paths',
    '# below are a sign-in wall, a redirect target, and somebody’s collection.',
    '',
    '# One group, deliberately. Search, assistants, training corpora and link',
    '# previews are all welcome on the same terms, and a crawler that does not',
    '# exist yet inherits them without this file being edited.',
    '',
    '# No Crawl-delay: it is not in RFC 9309, Google ignores it, and the site is',
    '# 3 500 static files on a CDN — there is nothing here to be gentle with.',
    '',
    'User-agent: *',
    ...rules,
    '',
    `Sitemap: ${ORIGIN}/sitemap.xml`,
    '',
  ].join('\n')
}

/**
 * The hints that go in every page's head — and the argument for each one being
 * short is the whole of why the list is short.
 *
 * **The three font preloads are gone, and that is a measurement rather than a
 * tidy-up.** Lighthouse's mobile profile simulates 1.6 Mbps, which is about
 * 200 KB/s: the fonts are 62 KB, so preloading them spent roughly 300 ms of the
 * critical window — taken directly from the entry script, which is the one file
 * that *does* gate the first paint. And they were never buying a faster paint to
 * begin with. `index.css` sets `font-display: swap` on all five faces (NFR-1),
 * so text renders in the fallback the moment there is text to render and swaps
 * when Plex lands. What the preloads shortened was the swap, at the cost of
 * everything arriving later.
 *
 * The `@font-face` rules are untouched, so the faces still load — discovered
 * from a 1 KB stylesheet that is itself in the head, which is early. What
 * changed is that they no longer outrank the script the page cannot paint
 * without.
 */
function resourceHints(): string[] {
  return [
    // §6.2's index, not the catalogue. The hint is only ever right about the
    // file the *shell* waits for, and since the split that is this one — the
    // rail reads it on every URL. Preloading 105 KB of specifications that the
    // front door never names was spending the whole critical window on a file
    // most visits never open.
    `<link rel="preload" as="fetch" crossorigin="anonymous" href="/catalog/catalog-index.json" />`,
  ]
}

/**
 * **D13's fallback, written rather than copied — and the reason is one tag.**
 *
 * `spa-fallback.mjs` copies the built shell to 404.html so a deep link survives
 * a refresh, and GitHub Pages serves that file, with an HTTP 404, for every URL
 * this step does not write: `/search`, `/collection`, `/settings`, `/u/alice`,
 * and every mistyped path anyone ever follows. The copy carried the home page's
 * generic title and description and no directive at all, which left the whole
 * of that set looking to a crawler like an ordinary page that happens to be
 * about "Casio Vault".
 *
 * `noindex, follow` is the honest description of all of them at once. The 404
 * status already keeps a well-behaved crawler from indexing the URL; the tag is
 * what covers the ones that read the body anyway, and — this is the part the
 * status code cannot do — it covers `/u/`, where the page is real, the status
 * is a GitHub Pages artefact, and D45's promise is that a published collection
 * is shareable without being *listed*.
 *
 * **No canonical, deliberately.** Every other page here points at itself, which
 * is only meaningful because every other page is served at exactly one URL.
 * This file is served at thousands. A self-referencing canonical would tell a
 * crawler that `/u/alice` is really `/404/` — a wrong statement about somebody
 * else's page, made by a file that has no address of its own.
 */
function notFoundPage(catalog: Catalog): Page {
  return {
    path: '404',
    noCanonical: true,
    noindex: true,
    priority: '0.0',
    title: 'Page not found · Casio Vault',
    description: `This page does not exist. Browse the Casio catalogue by line and series instead. ${DISCLAIMER}`,
    body: `
      <h1>Page not found</h1>
      <p>There is no page at this address. The catalogue is here:</p>
      <ul>
        ${catalog.lines
          .map(
            (line) =>
              `<li><a href="/line/${line.slug}/">${escapeHtml(line.name)}</a> — ${line.count} references</li>`,
          )
          .join('\n        ')}
      </ul>
      <p><a href="/">Casio Vault</a> — ${DISCLAIMER}</p>`,
  }
}

async function main() {
  const shell = await readFile(join(dist, 'index.html'), 'utf8')

  /**
   * **This step writes its own input, so running it twice compounds.**
   *
   * The home page's path is `''`, which means it is written to
   * `dist/index.html` — the very file read as the shell three lines up. Within
   * one run that is harmless, because the shell is read once and held. Across
   * two runs it is not: the second run takes the *rendered* home page as its
   * shell and injects a second canonical, a second Open Graph set and a second
   * copy of every JSON-LD block into all 3 500 pages. The artefact in this
   * working tree had four of each when this was found, from re-running the step
   * against a build that was a few days old.
   *
   * Nothing in CI does that — `npm run build` rebuilds the shell first — which
   * is exactly why it is worth failing loudly here. A malformed artefact that
   * only ever appears on somebody's laptop is one that gets debugged as a
   * mystery rather than read as a message.
   */
  if (shell.includes('rel="canonical"')) {
    throw new Error(
      'seo: dist/index.html has already been rendered by this step. It reads the shell it ' +
        'overwrites, so a second run injects a duplicate head into every page. Run ' +
        '`npm run build`, which rebuilds the shell from index.html first.',
    )
  }

  const hints = resourceHints()
  const catalog = CATALOG.parse(
    JSON.parse(await readFile(join(dist, 'catalog/catalog.json'), 'utf8')),
  )

  // The glossary depends on no catalogue data, so it is pushed unconditionally
  // and early — it is the one page here that would still be worth serving if
  // `catalog.json` were empty.
  const pages: Page[] = [homePage(catalog), symbolsPage()]

  for (const line of catalog.lines) {
    pages.push(linePage(catalog, line))
    for (const series of catalog.series.filter((entry) => entry.line === line.id)) {
      pages.push(seriesPage(catalog, line, series))
    }
  }

  // D62 — the index only where the catalogue actually holds an edition. The
  // build already declines to publish an empty one, so this is the same rule
  // read one level up: a page listing nothing is not a page.
  if (catalog.editions.length > 0) {
    pages.push(editionsPage(catalog))
    for (const edition of catalog.editions) pages.push(editionPage(catalog, edition))
  }

  // A model the site itself will not show stays reachable forever (FR-3.6) and
  // is not advertised: written to disk, marked noindex, absent from the sitemap.
  // A shared old link still works, and a search engine stops being offered a
  // page no page here links to. `listed` carries both halves of that rule and
  // says which watches fall under it, and why each one does.
  for (const model of catalog.models) {
    pages.push({ ...watchPage(catalog, model), noindex: !listed(model) })
  }

  for (const page of pages) {
    const dir = page.path === '' ? dist : join(dist, page.path)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'index.html'), render(shell, page, hints), 'utf8')
  }

  // The SPA fallback, over the top of the plain copy `spa-fallback.mjs` made.
  // That copy runs first and stays: it is what guarantees a fallback exists
  // even if this step fails, and §14.3's deploy gate checks for the file.
  await writeFile(join(dist, '404.html'), render(shell, notFoundPage(catalog), hints), 'utf8')

  /**
   * `<lastmod>`, or nothing at all.
   *
   * `fileDates` returns null when the history is shallow or absent, and null
   * means every URL below goes out without a date rather than with a guessed
   * one — see that file for why a wrong `lastmod` is worse than no `lastmod`.
   * The count is logged either way, because "the sitemap has no dates" is not
   * something anybody would notice from a green build.
   */
  const dates = await fileDates(root, ['catalog-src', 'src/routes/symbols/symbols.ts'])
  const lastmod = (page: Page): string | undefined =>
    dates && page.sources ? newest(page.sources.map((file) => dates.get(file))) : undefined

  const indexed = pages.filter((page) => !page.noindex)
  let dated = 0
  let illustrated = 0

  const urls = indexed
    .map((page) => {
      const modified = lastmod(page)
      if (modified) dated += 1
      if (page.image) illustrated += 1

      return (
        `  <url><loc>${canonical(page.path)}</loc>` +
        // `<changefreq>monthly</changefreq>` used to sit here and was removed
        // with the dates going in. It is a claim about the future that nothing
        // in this build verifies, Google has said for years that it ignores it,
        // and it was 116 KB of this file. `<priority>` stays: it is a statement
        // about this site's own shape rather than about time, and it is the
        // only way the sitemap says a line page matters more than one of the
        // 2 900 references under it.
        (modified ? `<lastmod>${modified}</lastmod>` : '') +
        `<priority>${page.priority}</priority>` +
        // The watch photographs, offered to Google Images as photographs rather
        // than left to be discovered as an `<img>` inside a rendered page. For
        // a catalogue whose subject is what a watch looks like, image search is
        // not a secondary channel — and `<image:loc>` is the only way to say
        // that a URL has a picture on it without the crawler running the app.
        (page.image ? `<image:image><image:loc>${page.image}</image:loc></image:image>` : '') +
        `</url>`
      )
    })
    .join('\n')

  await writeFile(
    join(dist, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n` +
      `        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n` +
      `${urls}\n</urlset>\n`,
    'utf8',
  )

  await writeFile(join(dist, 'robots.txt'), robotsTxt(), 'utf8')

  console.log(
    `seo: ${pages.length} pages written + 404.html (${indexed.length} in the sitemap, ` +
      `${pages.length - indexed.length} noindex), robots.txt, sitemap.xml`,
  )
  console.log(
    dates
      ? `seo: ${dated} of ${indexed.length} URLs dated from git, ${illustrated} with a photograph`
      : `seo: NO <lastmod> — git history is shallow or unavailable, so no date could be trusted`,
  )
}

await main()
