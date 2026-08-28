import type { SymbolIcon } from './symbols.ts'

/**
 * The indicators that are pictures, drawn as schematics.
 *
 * **These are deliberately not in `ui/icons.tsx`.** That file is Ant Design's
 * own paths copied verbatim, and its comment says so in as many words: the
 * glyphs in the shell have to be the same glyphs as the ones inside the
 * AntD-rendered content, or the site has two icon sets. None of these is an
 * Ant Design glyph — there is no AntD icon for *sustained fall in pressure,
 * changing to a rise* — so they are drawn here, on their own grid, and they stay
 * out of the shell's set rather than diluting it.
 *
 * **A schematic and not a facsimile, on purpose.** Casio's LCD segments are
 * Casio's artwork, and D11's position on this site is that it borrows what it
 * must and credits it. What a reader actually needs from this column is to
 * recognise the *kind* of thing the manual is describing — a bell, an aerial, an
 * arrow that turns over — beside the sentence that says what it means. The
 * sentence is what carries the fact; the drawing is a handle for it.
 *
 * `currentColor` throughout, so a glyph is the colour of the text it sits with
 * and follows the theme without either theme being named here. `aria-hidden`
 * throughout, because every one of these sits beside its own name in the markup
 * — a label here would make each row read as two things.
 */
function Draw({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

const GLYPHS: Record<SymbolIcon, React.ReactNode> = {
  // An alarm bell.
  bell: (
    <>
      <path d="M6 16V10.5a6 6 0 0 1 12 0V16l1.5 2.5h-15L6 16Z" />
      <path d="M10 21h4" />
    </>
  ),
  // The countdown timer starting itself again: a loop closing on an arrowhead.
  repeat: (
    <>
      <path d="M4 12a8 8 0 0 1 13.7-5.6" />
      <path d="M20 12a8 8 0 0 1-13.7 5.6" />
      <path d="M18 3v3.6h-3.5M6 21v-3.6h3.5" />
    </>
  ),
  // An aerial with the signal-strength bars beside it.
  aerial: (
    <>
      <path d="M7 20V8" />
      <path d="M4 8h6" />
      <path d="M13 17v3M16.5 13v7M20 9v11" />
    </>
  ),
  // The same aerial mid-reception: the bars become emanating arcs.
  'aerial-receiving': (
    <>
      <path d="M7 20V8" />
      <path d="M4 8h6" />
      <path d="M13.5 9.5a5.5 5.5 0 0 1 0 7" />
      <path d="M17 6.5a10 10 0 0 1 0 13" />
    </>
  ),
  // A lamp, lit.
  lamp: (
    <>
      <path d="M12 4.5V2M5.6 6.4 4 4.8M18.4 6.4 20 4.8M4.5 13H2M22 13h-2.5" />
      <path d="M9 19v-1.8a5 5 0 1 1 6 0V19Z" />
      <path d="M9.5 22h5" />
    </>
  ),
  // The same lamp with the wrist that triggers it: auto light is a movement,
  // not a press.
  'lamp-auto': (
    <>
      <path d="M9 19v-1.8a5 5 0 1 1 6 0V19Z" />
      <path d="M9.5 22h5" />
      <path d="M3 9.5a9 9 0 0 1 4.5-5" />
      <path d="M3 5v4.5h4.5" />
    </>
  ),
  // The four barometric pressure change indicators. Straight arrows for the
  // sudden moves; hooked ones for a trend that has turned over.
  'arrow-up': (
    <>
      <path d="M12 20V5" />
      <path d="M6.5 10.5 12 5l5.5 5.5" />
    </>
  ),
  'arrow-down': (
    <>
      <path d="M12 4v15" />
      <path d="M6.5 13.5 12 19l5.5-5.5" />
    </>
  ),
  // A peak, and the arrowhead is on the way DOWN from it — the indicator means
  // "was rising, now falling", so a glyph whose head points up says the opposite
  // of its own label. (It did, until it was looked at in a browser.)
  'arrow-up-turn': (
    <>
      <path d="M3 18.5 10 6.5l8 12" />
      <path d="M13.5 18.5H18V14" />
    </>
  ),
  // The same shape inverted: a trough, with the head on the way back up.
  'arrow-down-turn': (
    <>
      <path d="M3 5.5 10 17.5l8-12" />
      <path d="M13.5 5.5H18V10" />
    </>
  ),
  // The moon as the manual describes it: the part you can see against the part
  // you cannot.
  moon: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" fill="currentColor" stroke="none" />
    </>
  ),
  // A tide curve over the baseline it is measured from.
  tide: (
    <>
      <path d="M2.5 15c2.5 0 2.5-7 5-7s2.5 7 5 7 2.5-7 5-7 2.5 7 4 7" />
      <path d="M3 20h18" />
    </>
  ),
  // Hands parked out of the way of the digits — the state the indicator names.
  hands: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 12 8.5 8.5M12 12l-4 1.5" />
      <path d="M14 14.5h5" />
    </>
  ),
}

export function SymbolGlyph({ icon }: { icon: SymbolIcon }) {
  return (
    <span className="cc-sym-glyph">
      <Draw>{GLYPHS[icon]}</Draw>
    </span>
  )
}

/** Exported for the test that proves every declared icon has a drawing. */
export const DRAWN_ICONS = Object.keys(GLYPHS) as SymbolIcon[]
