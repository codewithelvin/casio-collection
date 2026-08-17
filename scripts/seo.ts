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
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CATALOG, type Catalog, type PublishedModel } from '../src/catalog/schema.ts'

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
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

interface Page {
  /** Path with no leading or trailing slash. Empty string is the home page. */
  path: string
  title: string
  description: string
  /** Rendered inside <noscript>, and the only content a JS-less crawler sees. */
  body: string
  jsonLd?: object[]
  image?: string | undefined
  /** Excluded from the sitemap and marked noindex. */
  noindex?: boolean
  /** Sitemap hint. Lines change when the catalogue does; models rarely. */
  priority: string
}

const canonical = (path: string) => `${ORIGIN}/${path}${path === '' ? '' : '/'}`

/* ------------------------------------------------------------------------- *
 * The pages.
 * ------------------------------------------------------------------------- */

function homePage(catalog: Catalog): Page {
  const lines = catalog.lines.filter((line) => line.count > 0)
  return {
    path: '',
    title: 'Casio Vault — the Casio watch catalogue, and the ones you own',
    description: `Browse ${catalog.models.length} Casio references across ${catalog.series.length} series. Search by reference, filter by year and feature, and mark what you own. ${DISCLAIMER}`,
    priority: '1.0',
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
  const models = catalog.models.filter((model) => model.line === line.id && !model.tombstone)

  return {
    path: `line/${line.slug}`,
    title: `${line.name} — every reference in the catalogue · Casio Vault`,
    description: `${models.length} Casio ${line.name} references in ${series.length} series, with the specification each one is actually sourced for. ${DISCLAIMER}`,
    priority: '0.8',
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
    jsonLd: [breadcrumb([{ name: 'Casio Vault', path: '' }, { name: line.name, path: `line/${line.slug}` }])],
  }
}

function seriesPage(
  catalog: Catalog,
  line: Catalog['lines'][number],
  series: Catalog['series'][number],
): Page {
  const models = catalog.models.filter((model) => model.series === series.id && !model.tombstone)

  return {
    path: `line/${line.slug}/${series.id}`,
    title: `${series.name} — ${models.length} references · Casio Vault`,
    description: `Every catalogued ${series.name} reference: ${models
      .slice(0, 6)
      .map((model) => model.ref)
      .join(', ')}${models.length > 6 ? ' and more' : ''}. ${DISCLAIMER}`,
    priority: '0.7',
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

  const summary = stated
    .filter(([label]) => label !== 'Line' && label !== 'Series')
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
    body: `
      <h1>${escapeHtml(model.ref)}</h1>
      ${model.name ? `<p>${escapeHtml(model.name)}</p>` : ''}
      ${
        image
          ? `<img src="/img/models/${model.image}.webp" width="400" height="400" alt="${escapeHtml(model.ref)}" />`
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
   * index.html ships a generic set so that any page this step does not write —
   * 404.html, and /search — still previews as something. Left in place they
   * would be *duplicates*, and a crawler reading duplicated Open Graph tags
   * takes the first: every watch on the site would have shared as "Casio
   * Vault". That is the whole feature failing while every page looks correct in
   * a browser, which is why it is stripped here rather than removed from the
   * shell.
   */
  html = html.replace(
    /\s*<meta\s+(?:property="og:(?:title|description|type)"|name="twitter:card")[\s\S]*?\/>/g,
    '',
  )

  const head: string[] = [
    ...hints,
    `<link rel="canonical" href="${canonical(page.path)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta name="twitter:card" content="${page.image ? 'summary_large_image' : 'summary'}" />`,
    `<meta property="og:url" content="${canonical(page.path)}" />`,
    `<meta property="og:title" content="${escapeHtml(page.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(page.description)}" />`,
    `<meta property="og:site_name" content="Casio Vault" />`,
    `<meta name="twitter:title" content="${escapeHtml(page.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(page.description)}" />`,
  ]

  if (page.image) {
    // A photograph is worth a large card; §8.6's typographic tile is not, and a
    // model with no image gets `summary` above — a large card would be a wide
    // empty rectangle with a reference code in the corner.
    head.push(`<meta property="og:image" content="${page.image}" />`)
    head.push(`<meta name="twitter:image" content="${page.image}" />`)
  }

  if (page.noindex) head.push('<meta name="robots" content="noindex, follow" />')

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
 * Only the two weights the first screen actually uses: 400 for body text and
 * mono 400 for a reference code, which is what every card is made of.
 * Preloading all five would compete with the bundle for the same connection.
 */
async function resourceHints(): Promise<string[]> {
  const assets = await readdir(join(dist, 'assets'))
  const critical = assets.filter(
    (name) =>
      name.endsWith('.woff2') && (/plex-sans-latin-400/.test(name) || /plex-mono-latin-400/.test(name)),
  )

  return [
    ...critical.map(
      (name) =>
        // `crossorigin` is not optional on a font preload even same-origin: a
        // font is always fetched in CORS mode, so a hint without it downloads
        // the file a second time instead of matching the request it was for.
        `<link rel="preload" as="font" type="font/woff2" crossorigin href="/assets/${name}" />`,
    ),
    `<link rel="preload" as="fetch" crossorigin="anonymous" href="/catalog/catalog.json" />`,
  ]
}

async function main() {
  const shell = await readFile(join(dist, 'index.html'), 'utf8')
  const hints = await resourceHints()
  const catalog = CATALOG.parse(JSON.parse(await readFile(join(dist, 'catalog/catalog.json'), 'utf8')))

  const pages: Page[] = [homePage(catalog)]

  for (const line of catalog.lines) {
    pages.push(linePage(catalog, line))
    for (const series of catalog.series.filter((entry) => entry.line === line.id)) {
      pages.push(seriesPage(catalog, line, series))
    }
  }

  // A tombstoned model stays reachable forever (FR-3.6) and is not advertised:
  // it is in the sitemap's absence and marked noindex, so a shared old link
  // still works and a search engine stops offering a retired entry.
  for (const model of catalog.models) {
    pages.push({ ...watchPage(catalog, model), noindex: model.tombstone !== undefined })
  }

  for (const page of pages) {
    const dir = page.path === '' ? dist : join(dist, page.path)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'index.html'), render(shell, page, hints), 'utf8')
  }

  const indexed = pages.filter((page) => !page.noindex)
  const urls = indexed
    .map(
      (page) =>
        `  <url><loc>${canonical(page.path)}</loc><changefreq>monthly</changefreq><priority>${page.priority}</priority></url>`,
    )
    .join('\n')

  await writeFile(
    join(dist, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    'utf8',
  )

  /**
   * `/u/` is disallowed on purpose, and it is a privacy decision rather than a
   * crawl-budget one. FR-7.3 tells somebody that publishing means "anyone with
   * the link can read it". Being listed in Google is a materially different
   * thing from that sentence, and the person agreeing to it did not agree to
   * the second. The pages stay public and shareable; they are simply not
   * advertised. `/collection` and `/settings` need a session and would only
   * ever render the sign-in panel to a crawler.
   */
  await writeFile(
    join(dist, 'robots.txt'),
    [
      'User-agent: *',
      'Allow: /',
      'Disallow: /auth/',
      'Disallow: /collection',
      'Disallow: /settings',
      'Disallow: /u/',
      '',
      `Sitemap: ${ORIGIN}/sitemap.xml`,
      '',
    ].join('\n'),
    'utf8',
  )

  console.log(
    `seo: ${pages.length} pages written (${indexed.length} in the sitemap), robots.txt, sitemap.xml`,
  )
}

await main()
