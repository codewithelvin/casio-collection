import { describe, expect, it } from 'vitest'
import { stripHtmlComments } from './html.ts'

describe('stripHtmlComments', () => {
  it('removes a comment', () => {
    expect(stripHtmlComments('<p>a</p><!-- why --><p>b</p>')).toBe('<p>a</p><p>b</p>')
  })

  it('removes a comment spanning many lines, which is the shape index.html has', () => {
    const html = `<head>
    <!--
      S7 — a CSP served as a meta tag, since GitHub Pages serves no headers.
      style-src needs 'unsafe-inline' because AntD 5 is CSS-in-JS.
    -->
    <title>Casio Vault</title>
  </head>`
    const out = stripHtmlComments(html)
    expect(out).not.toContain('S7')
    expect(out).not.toContain('CSS-in-JS')
    expect(out).toContain('<title>Casio Vault</title>')
  })

  it('removes an IE conditional, which is a comment like any other now', () => {
    expect(stripHtmlComments('<!--[if lt IE 9]><script src="x.js"></script><![endif]-->')).toBe('')
  })

  it('leaves the doctype alone', () => {
    expect(stripHtmlComments('<!doctype html>\n<html></html>')).toBe('<!doctype html>\n<html></html>')
  })

  /**
   * The reason the scan is not one `String.replace`. `scripts/seo.ts` injects
   * JSON-LD into every page on this site, and a description that happened to
   * contain `<!--` would otherwise let a regex eat from the middle of one block
   * to the end of the next — taking the closing `</script>` with it and leaving
   * the page's markup open.
   */
  it('does not touch text inside a script, even when it looks like a comment', () => {
    const html = '<script type="application/ld+json">{"name":"a <!-- b"}</script><!-- gone -->'
    expect(stripHtmlComments(html)).toBe('<script type="application/ld+json">{"name":"a <!-- b"}</script>')
  })

  it('does not touch a style block', () => {
    const html = "<style>:root { --x: '<!--' }</style><!-- gone -->"
    expect(stripHtmlComments(html)).toBe("<style>:root { --x: '<!--' }</style>")
  })

  it('ends a script block at its own closing tag, not at the next element’s', () => {
    const html = '<script>const a = "</style>"</script><!-- gone --><p>after</p>'
    expect(stripHtmlComments(html)).toContain('const a = "</style>"')
    expect(stripHtmlComments(html)).not.toContain('gone')
    expect(stripHtmlComments(html)).toContain('<p>after</p>')
  })

  it('keeps whitespace inside a pre block, where it is content', () => {
    const html = '<pre>  two   spaces  \n\n\n  and blank lines</pre>'
    expect(stripHtmlComments(html)).toBe(html)
  })

  it('collapses the blank lines a removed comment leaves behind', () => {
    const html = '<head>\n\n    <!-- a -->\n\n    <!-- b -->\n\n    <title>t</title>\n</head>'
    expect(stripHtmlComments(html)).toBe('<head>\n\n    <title>t</title>\n</head>')
  })

  it('handles several comments and several protected blocks in one document', () => {
    const html = [
      '<!doctype html>',
      '<!-- one -->',
      '<style>a{}</style>',
      '<!-- two -->',
      '<script>1</script>',
      '<!-- three -->',
      '<p>end</p>',
    ].join('\n')
    const out = stripHtmlComments(html)
    expect(out).not.toMatch(/one|two|three/)
    expect(out).toContain('<style>a{}</style>')
    expect(out).toContain('<script>1</script>')
    expect(out).toContain('<p>end</p>')
  })

  it('is idempotent', () => {
    const html = '<p>a</p><!-- x -->\n\n\n<p>b</p>'
    const once = stripHtmlComments(html)
    expect(stripHtmlComments(once)).toBe(once)
  })

  it('returns a document with no comments in it at all', () => {
    const html = '<!-- a --><div><!-- b --><span><!-- c --></span></div>'
    expect(stripHtmlComments(html)).not.toContain('<!--')
  })
})
