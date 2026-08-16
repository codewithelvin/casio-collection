import type { ReactNode } from 'react'
import { Typography, theme as antdTheme } from 'antd'

/**
 * FR-1.5 / FR-10.1 — never a blank area.
 *
 * Every empty state on this site has to say *which* emptiness it is. "No results"
 * covers a filter that matched nothing, a line nobody has seeded and a series
 * that is genuinely one watch, and those are three different messages to three
 * different readers. The caller supplies the sentence; this only makes it look
 * deliberate rather than left over.
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
  const { token } = antdTheme.useToken()

  return (
    <div
      style={{
        padding: '48px 24px',
        textAlign: 'center',
        border: `1px dashed ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadiusLG,
        background: token.colorBgContainer,
      }}
    >
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        {title}
      </Typography.Title>
      {body ? (
        <Typography.Paragraph type="secondary" style={{ maxWidth: 520, margin: '0 auto' }}>
          {body}
        </Typography.Paragraph>
      ) : null}
      {action ? <div style={{ marginTop: 16 }}>{action}</div> : null}
    </div>
  )
}
