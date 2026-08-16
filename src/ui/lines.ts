/**
 * The eight watch lines of D15, in the editorial order they appear in the rail.
 *
 * This is **scaffolding**. From M2 the tree is built from `catalog.json`'s
 * `lines` array (§6.2), which carries the same fields plus the model counts and
 * the family groupings of D32 — none of which exist yet. The shape here matches
 * that array deliberately, so M2 replaces the import and deletes this file
 * rather than rewriting the component.
 *
 * There are **no model counts at M0** and none are invented: a count of 0 would
 * read as "this line is empty" rather than "the catalogue is not seeded", and
 * principle 4 says unknown renders as itself.
 */
export interface NavLine {
  id: string
  /** The URL segment. Permanent once shared — see D2's argument about ids. */
  slug: string
  name: string
}

export const NAV_LINES: readonly NavLine[] = [
  { id: 'g-shock', slug: 'g-shock', name: 'G-SHOCK' },
  // "Casio Collection" is Casio's European name for this line and "Vintage" is
  // the one collectors use, so the label carries both. It was also the name of
  // this site until D39, which is the collision D21 accepted and the rename
  // removed; the label itself never needed to change.
  { id: 'vintage', slug: 'vintage', name: 'Vintage / Casio Collection' },
  { id: 'edifice', slug: 'edifice', name: 'Edifice' },
  { id: 'pro-trek', slug: 'pro-trek', name: 'Pro Trek' },
  { id: 'baby-g', slug: 'baby-g', name: 'Baby-G' },
  { id: 'sheen', slug: 'sheen', name: 'Sheen' },
  { id: 'oceanus', slug: 'oceanus', name: 'Oceanus' },
  { id: 'databank', slug: 'databank', name: 'Databank' },
]
