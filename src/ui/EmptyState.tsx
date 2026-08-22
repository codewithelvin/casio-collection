import type { ReactNode } from 'react'

/**
 * FR-1.5 / FR-10.1 — never a blank area.
 *
 * Every empty state on this site has to say *which* emptiness it is. "No results"
 * covers a filter that matched nothing, a line nobody has seeded and a series
 * that is genuinely one watch, and those are three different messages to three
 * different readers. The caller supplies the sentence; this only makes it look
 * deliberate rather than left over.
 *
 * §12 — plain elements, because `RequireSession` renders this and
 * `RequireSession` is in the router, which is in the first load. Two AntD
 * imports for a dashed box and two lines of text was 42 KB of the entry chunk.
 */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body?: string | undefined
  action?: ReactNode
}) {
  return (
    <div
      style={{
        padding: '48px 24px',
        textAlign: 'center',
        // Dashed rather than solid: this box is a statement about absence, and a
        // solid border would make it look like a card that failed to fill.
        border: '1px dashed var(--cc-border-secondary)',
        borderRadius: 10,
        background: 'var(--cc-bg-container)',
      }}
    >
      <h4 className="cc-h4" style={{ marginTop: 0 }}>
        {title}
      </h4>
      {body ? (
        <p className="cc-quiet" style={{ maxWidth: 520, margin: '0 auto' }}>
          {body}
        </p>
      ) : null}
      {action ? <div style={{ marginTop: 16 }}>{action}</div> : null}
    </div>
  )
}
