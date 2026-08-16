import { t } from '../i18n/strings'

/**
 * §8.11 / D34 — the mark: an octagonal bezel with four screws, holding a check.
 *
 * Inlined rather than loaded as <img> because both variants are drawn in
 * `currentColor`: one definition then serves the light theme, the dark theme,
 * the accent colour and a print stylesheet with no second export. An <img> tag
 * would need a file per colour.
 *
 * The same two files also exist in public/ for the favicon and the manifest,
 * where a document-level reference is the only thing that works.
 */

interface MarkProps {
  /** Rendered size in px. Below 32 the compact variant is used — see below. */
  size?: number
  className?: string | undefined
}

type MarkVariantProps = { size: number; className?: string | undefined }

/**
 * D34's technical consequence: the screws and strap stubs become grey mush
 * below 32 px and take the octagon's shape with them. This is a permanent
 * second drawing, not a workaround — so the switch is made here, once, rather
 * than at every call site where someone would eventually forget.
 */
export function Mark({ size = 32, className }: MarkProps) {
  return size < 32 ? <MarkCompact size={size} className={className} /> : <MarkFull size={size} className={className} />
}

function MarkFull({ size, className }: MarkVariantProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      role="img"
      aria-label={t('app.name')}
      className={className}
    >
      <rect x="23" y="1" width="18" height="11" rx="3" fill="currentColor" opacity="0.3" />
      <rect x="23" y="52" width="18" height="11" rx="3" fill="currentColor" opacity="0.3" />
      <path
        d="M23 9 H41 L55 23 V41 L41 55 H23 L9 41 V23 Z"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <g fill="currentColor">
        <circle cx="18.5" cy="18.5" r="2.2" />
        <circle cx="45.5" cy="18.5" r="2.2" />
        <circle cx="45.5" cy="45.5" r="2.2" />
        <circle cx="18.5" cy="45.5" r="2.2" />
      </g>
      <path
        className="cc-mark-check"
        d="M23 33 L29.5 39.5 L42.5 26.5"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function MarkCompact({ size, className }: MarkVariantProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      role="img"
      aria-label={t('app.name')}
      className={className}
    >
      <path
        d="M22 6 H42 L58 22 V42 L42 58 H22 L6 42 V22 Z"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinejoin="round"
      />
      <path
        className="cc-mark-check"
        d="M20 33 L28.5 41.5 L44 25"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * §8.11 — the wordmark: the app's own UI typeface, all caps, CASIO at 600 and
 * VAULT at 400 with 0.08em letterspacing. Never set in, or styled to resemble,
 * Casio's logotype — D11 says this site claims no affiliation and the header is
 * the most visible place in the product to contradict that.
 *
 * D39 shortened the second word from COLLECTION to VAULT, which the lockup takes
 * without a change: the two weights are what carry the reading, not the length.
 *
 * Below 120 px wide the letterspacing stops reading, so the mark stands alone.
 */
export function Lockup({ markSize = 32, showWordmark = true }: { markSize?: number; showWordmark?: boolean }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        // Clear space around the lockup is the height of the C (§8.11).
        gap: 10,
        color: 'var(--cc-accent)',
        lineHeight: 1,
      }}
    >
      <Mark size={markSize} />
      {showWordmark ? (
        <span style={{ display: 'inline-flex', gap: '0.35em', fontSize: 15, whiteSpace: 'nowrap' }}>
          <span style={{ fontWeight: 600, letterSpacing: '0.08em' }}>{t('app.name.casio')}</span>
          <span style={{ fontWeight: 400, letterSpacing: '0.08em' }}>{t('app.name.vault')}</span>
        </span>
      ) : null}
    </span>
  )
}
