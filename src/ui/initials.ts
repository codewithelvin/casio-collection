/**
 * Two letters from a name, one from an email address.
 *
 * **In a module of its own, and that is not tidiness.** It lived in
 * `AccountDropdown` while the header was the only thing that needed it. D71 gave
 * a second caller — `CollectorAvatar`, which the directory, the owner strip on
 * every watch page and the public profile all render — and importing it from
 * there would have pulled `AccountDropdown` into each of those routes: AntD's
 * `Dropdown`, `Menu` and `Avatar`, plus the auth avatar cache, in three places
 * that never show an account menu. §12 makes that module lazy on purpose, and a
 * six-line helper is not a reason to undo it.
 *
 * The same shape as `gridSpans.ts`, for the same reason and after the same kind
 * of near-miss: one declaration, imported by both, cycle-free.
 */
export function initials(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) {
    // An email address: the local part's first character, never the '@'.
    return (words[0] ?? '').charAt(0).toUpperCase() || '?'
  }
  const first = (words[0] ?? '').charAt(0)
  const last = (words[words.length - 1] ?? '').charAt(0)
  return `${first}${last}`.toUpperCase()
}
