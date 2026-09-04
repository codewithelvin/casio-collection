/**
 * **Comments are for the repository, not for the wire.**
 *
 * index.html carries about 1.6 KB of them — the reasoning behind the CSP meta
 * tag, D13's note on `%BASE_URL%`, why there are three favicons. Every word of
 * that is worth keeping in the source and none of it is worth shipping: the
 * prerender step (`scripts/seo.ts`) copies the shell into 3 500-odd files, so a
 * paragraph in the head is a paragraph multiplied by every page on the site,
 * paid for on every first visit before the parser reaches the script tag.
 *
 * It is also the only part of this codebase that is *published*. A comment
 * naming an internal decision number, a build variable and the shape of the
 * auth flow is documentation of the site's own internals, served to anyone who
 * presses Ctrl+U. Stripping it at build time is the one change that keeps both
 * halves of that: the argument stays where the next maintainer reads it, and
 * the artefact carries only what a browser or a crawler needs.
 *
 * The build is the right place rather than the source for exactly the reason
 * D13 gives about `%BASE_URL%` — a rule enforced by remembering is a rule that
 * gets forgotten. Delete a comment by hand and it is gone from git too.
 */

/**
 * A comment, or a block whose text is data rather than markup — **as one
 * alternation, because the order the two open in is the whole of the rule.**
 *
 * `<!--` inside a script or a stylesheet is not a comment, it is characters in
 * a string, and a regex that does not know the difference will happily eat from
 * the middle of a JSON-LD block to the end of the next one — taking the closing
 * `</script>` with it and leaving the document open. Nothing in this project's
 * HTML contains that sequence today, which is precisely the sort of fact that
 * stops being true without anybody noticing.
 *
 * The mirror image is just as real and is what a first attempt at this got
 * wrong: `<!--[if lt IE 9]><script src="x.js"></script><![endif]-->` is a
 * comment that *contains* a script, and scanning for protected blocks first
 * finds that script, protects it, and leaves the two halves of the comment
 * stranded around it. Neither element is inside the other in general; whichever
 * one **opens first** wins, and a single alternation is exactly that rule — the
 * engine takes the earliest position, and at that position tries the comment
 * alternative before the block one.
 *
 * `<pre>` and `<textarea>` are in the list for a different reason than script
 * and style: their content is whitespace-significant and visible, so neither
 * the removal nor the blank-line collapse below may touch it.
 *
 * The backreference ends a block at the closing tag of the element that opened
 * it, so a `<script>` containing the text `</style>` does not end there.
 */
const TOKEN = /<!--[\s\S]*?-->|<(script|style|pre|textarea)\b[^>]*>[\s\S]*?<\/\1\s*>/gi

/**
 * Blank lines left where a comment used to be.
 *
 * Removing a comment leaves its surrounding newlines behind, so a head that was
 * eight readable blocks becomes eight blocks separated by voids. Runs of three
 * or more newlines collapse to one blank line; two stay as they are, so the
 * shape of the document is preserved rather than minified away. This is not a
 * size optimisation — it is what stops the output looking like something went
 * wrong.
 */
const BLANK_RUN = /\n(?:[ \t]*\n){2,}/g

/**
 * A protected block, parked while the whitespace pass runs.
 *
 * That pass has to see across the gap a removed comment leaves — two comments
 * on their own lines leave *one* run of newlines between them, not two — so it
 * runs over the whole document rather than chunk by chunk. Standing the
 * protected blocks aside as placeholders is what lets it do that without ever
 * reaching inside a `<pre>`. NUL is not valid in an HTML document, so the
 * placeholder cannot collide with anything the input legitimately contains.
 */
const PARK = '\u0000'
const PARKED = /\u0000(\d+)\u0000/g

/**
 * Remove every HTML comment that is not inside a script, style, pre or textarea.
 *
 * Deliberately *not* a general HTML minifier. Collapsing attribute whitespace
 * or dropping optional closing tags would save a few hundred bytes and put a
 * parser between the build and the page for the rest of the project's life;
 * comments are the whole of what is being removed here, and the transform is
 * simple enough to hold in your head.
 */
export function stripHtmlComments(html: string): string {
  const parked: string[] = []

  const withoutComments = html.replace(TOKEN, (match, tag: string | undefined) =>
    tag === undefined ? '' : `${PARK}${parked.push(match) - 1}${PARK}`,
  )

  const tidied = withoutComments.replace(BLANK_RUN, '\n\n').replace(/[ \t]+$/gm, '')

  return tidied.replace(PARKED, (_, index: string) => parked[Number(index)] ?? '')
}
