import { describe, expect, it } from 'vitest'
import { changedOn, parseSitemap, selectUrls } from './indexnow.ts'

/**
 * The three pure parts of the IndexNow submission, tested because each of them
 * fails **silently and in the safe-looking direction**: they submit nothing.
 * A deploy that hints at nothing looks exactly like a deploy where nothing
 * changed, and there is no response to read afterwards that would tell them
 * apart — which is the whole reason this file exists.
 */
const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://casiovault.com/</loc><lastmod>2026-09-05T09:51:44+04:00</lastmod><priority>1.0</priority></url>
  <url><loc>https://casiovault.com/line/vintage/</loc><lastmod>2026-09-05T01:30:00+04:00</lastmod><priority>0.8</priority></url>
  <url><loc>https://casiovault.com/line/vintage/f-91w/</loc><lastmod>2026-08-19T18:19:40+04:00</lastmod><priority>0.7</priority></url>
  <url><loc>https://casiovault.com/symbols/</loc><priority>0.8</priority></url>
</urlset>`

describe('reading the sitemap', () => {
  it('takes every URL and its date', () => {
    const entries = parseSitemap(SITEMAP)
    expect(entries).toHaveLength(4)
    expect(entries[0]).toEqual({
      loc: 'https://casiovault.com/',
      lastmod: '2026-09-05T09:51:44+04:00',
    })
  })

  it('keeps a URL that has no lastmod, as undated rather than as absent', () => {
    // `lastmod.ts` omits the date rather than guessing one, so an undated URL is
    // a normal thing to meet here. Dropping it in the parser would hide it from
    // `--all`, which is the one mode that wants every URL.
    expect(parseSitemap(SITEMAP).at(-1)).toEqual({
      loc: 'https://casiovault.com/symbols/',
      lastmod: null,
    })
  })
})

describe('deciding what changed', () => {
  /**
   * The bug this is really about. `lastmod` carries a `+04:00` offset, so the
   * first ten characters of the string are the LOCAL date — and comparing those
   * against a UTC day is wrong for four hours out of every twenty-four, in one
   * direction only. It would present as a deploy that submitted nothing, on some
   * days, for no visible reason.
   */
  it('compares instants rather than the first ten characters', () => {
    // 01:30 at +04:00 is 21:30 the previous day in UTC.
    expect(changedOn('2026-09-05T01:30:00+04:00', '2026-09-04')).toBe(true)
    expect(changedOn('2026-09-05T01:30:00+04:00', '2026-09-05')).toBe(false)
  })

  it('treats a missing or unreadable date as not changed', () => {
    expect(changedOn(null, '2026-09-05')).toBe(false)
    expect(changedOn('not a date', '2026-09-05')).toBe(false)
  })
})

describe('choosing what to submit', () => {
  const entries = parseSitemap(SITEMAP)

  it('submits only the day’s URLs, and adds the front door with them', () => {
    // 2026-09-05T09:51:44+04:00 is 05:51 UTC on the 5th.
    const urls = selectUrls(entries, '2026-09-05', false)
    expect(urls).toEqual(['https://casiovault.com/'])
  })

  it('adds the front door exactly once when it is already in the list', () => {
    const urls = selectUrls(entries, '2026-09-04', false)
    expect(urls).toEqual(['https://casiovault.com/', 'https://casiovault.com/line/vintage/'])
    expect(urls.filter((url) => url === 'https://casiovault.com/')).toHaveLength(1)
  })

  it('submits nothing on a day nothing changed, rather than the whole site', () => {
    // The failure mode IndexNow actually punishes is a host that submits its
    // entire sitemap on every deploy. An empty list is the correct answer here.
    expect(selectUrls(entries, '2026-01-01', false)).toEqual([])
  })

  it('submits everything only when asked, and adds no front door of its own', () => {
    const urls = selectUrls(entries, '2026-01-01', true)
    expect(urls).toHaveLength(4)
    expect(urls).toContain('https://casiovault.com/symbols/')
  })
})
