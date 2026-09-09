import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { App, Button, Grid, Popconfirm, Space, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Link } from 'react-router-dom'
import { useCatalog } from '../../catalog/client.ts'
import { dismissCatalogRequests, fetchCatalogRequests } from '../../collection/api.ts'
import { useIsAdmin } from '../../collection/admin.ts'
import {
  claudePrompt,
  countByVerdict,
  groupRequests,
  type QueuedRequest,
  type RequestVerdict,
} from '../../collection/requestQueue.ts'
import { useSessionStore } from '../../auth/session.ts'
import { EmptyState } from '../../ui/EmptyState'
import NotFoundRoute from '../notFound'
import { t } from '../../i18n/strings'

/**
 * `/admin/requests` — D22's queue, read by the one account 0006 grants it to.
 *
 * **This page exists because the queue had no reader.** The form has worked
 * since M8; `0003` gave the table no select policy and `0004` revoked select
 * from `authenticated` as well, leaving the service role as the only way in —
 * and there was no service-role key anywhere, so every report a visitor filed
 * sat in a table nobody had ever looked at. Nothing broke and nothing warned.
 *
 * **A stranger gets the 404, not a refusal**, and this is the reason it is not
 * wrapped in `guarded` like `/collection` and `/settings`. Those two announce
 * themselves — a guest sees the sign-in panel over a blurred page, which is
 * right for a page whose existence is not a secret. Here the existence *is* the
 * secret worth keeping: a sign-in prompt at this URL tells anyone who guesses it
 * that there is something behind it and that a session is the thing between
 * them and it. So the guard is inside, the answer is the ordinary 404, and a
 * guest, a signed-in stranger and a typo all get the identical page.
 *
 * The authority is the database and not this component (D73). `is_admin()` and
 * `catalog_request_queue()` both read `auth.uid()` server-side; a caller who
 * edits this file's logic in devtools gets an empty array from PostgREST, not
 * the queue. What is written here decides what is *drawn*, never what is
 * *allowed* — that distinction is the whole of why the read is a function.
 */
export default function AdminRequestsRoute() {
  const status = useSessionStore((state) => state.status)

  /**
   * Lives here rather than on the row that caused it, because the refetch a
   * failed dismissal triggers can empty the list — and a revoked flag produces
   * exactly that: nothing removed, and a queue that comes back empty. On the row
   * the message would have been replaced by "Nothing reported yet".
   */
  const [dismissFailed, setDismissFailed] = useState(false)

  // The same hook the header uses, so both are answered by one request per
  // session rather than one each — see `admin.ts` for why it is a hook and not
  // two `useQuery(['is-admin'])` call sites.
  const admin = useIsAdmin()
  const isAdmin = admin.data === true

  const queue = useQuery({
    queryKey: ['catalog-requests'] as const,
    queryFn: fetchCatalogRequests,
    enabled: isAdmin,
    staleTime: 60_000,
    retry: false,
  })

  // The catalogue is what turns a reference into a verdict. Held back until the
  // answer is yes, so a stranger's guess at this URL does not pull 117 KB of
  // watches down behind a page they are about to be shown a 404 for.
  const catalog = useCatalog({ enabled: isAdmin })

  /**
   * **Nothing is drawn while the answer is unknown**, and that covers more
   * ground than it looks. A returning visitor mid-restore is not yet a guest;
   * rendering the 404 during that half-second and replacing it with the queue
   * afterwards would flash "this page does not exist" at the one person it does
   * exist for, every single time they open it.
   */
  if (status === 'restoring') return null
  if (status === 'authenticated' && admin.isPending) return null

  if (!isAdmin) return <NotFoundRoute />

  if (queue.isPending || catalog.isPending) return null

  if (queue.isError) {
    return (
      <EmptyState
        title={t('admin.requests.failed.title')}
        body={t('admin.requests.failed.body')}
      />
    )
  }

  const grouped = groupRequests(queue.data ?? [], catalog.data?.models ?? [])
  const counts = countByVerdict(grouped)

  return (
    <div style={{ maxWidth: 760 }}>
      <Typography.Title level={2} style={{ marginTop: 0 }}>
        {t('admin.requests.title')}
      </Typography.Title>
      <Typography.Paragraph type="secondary">{t('admin.requests.lead')}</Typography.Paragraph>

      {/*
        Above the list rather than on the row, because the row may not survive
        the refetch that follows the failure — see `QueueRow.dismiss`.
      */}
      {dismissFailed ? (
        <Typography.Text type="danger" style={{ display: 'block', marginBottom: 16 }}>
          {t('admin.requests.dismiss.failed')}
        </Typography.Text>
      ) : null}

      {grouped.length === 0 ? (
        <EmptyState title={t('admin.requests.empty.title')} body={t('admin.requests.empty.body')} />
      ) : (
        <>
          {/*
            The shape of the queue before any of its rows. On a list where most
            entries are usually `withheld` — a watch that is catalogued and
            invisible under D63 — the summary is the finding, and reading down
            forty references to notice it is how a person concludes the opposite.
          */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
            {VERDICTS.filter((verdict) => counts[verdict] > 0).map((verdict) => (
              <Tag key={verdict} color={COLOUR[verdict]}>
                {counts[verdict]} {t(`admin.requests.count.${verdict}`)}
              </Tag>
            ))}
          </div>

          <Queue
            entries={grouped}
            onDismissed={(removed) => {
              setDismissFailed(removed === 0)
              void queue.refetch()
            }}
          />
        </>
      )}
    </div>
  )
}

/**
 * **A TABLE ON A DESKTOP AND A LIST ON A PHONE, and the split is the finding
 * rather than a preference.** The client asked for a table on 2026-09-08 and
 * then said it was cut off, which it was — three ways, each measured in a real
 * headless browser at a real 360 px rather than reasoned about:
 *
 *   1. `scroll={{ x: 'max-content' }}` sizes the verdict column to its widest
 *      possible line, so *"In the catalogue, no photograph (D63) — find one"*
 *      never wraps and the table runs past the 760 px column this page sits in.
 *      Cut off on a desktop that had room for it.
 *   2. `scroll={{ x: 640 }}` fixed the desktop and made the phone worse: the
 *      table scrolled inside its own box, so **the dismiss button sat entirely
 *      off-screen** while the full-width note rows underneath fitted perfectly.
 *      The cut read as the layout rather than as something scrollable — hiding
 *      the one destructive control on the page behind a scrollbar nobody can see.
 *   3. No `scroll.x` at all, hoping the cells would compress. **AntD only makes
 *      `.ant-table-content` a scroll container when `scroll.x` is set**, so
 *      without it there is no clipping and the *page* scrolls sideways instead,
 *      which is the one thing NFR-3's 360 px rule forbids outright.
 *
 * **AND THEN THE ACTUAL BUG TURNED OUT NOT TO BE THE TABLE AT ALL.** The
 * overflow measured **411 px** at 360 — and the *list* layout, untouched since
 * before any of this, overflowed to exactly the same 411 px. That is what named
 * the cause: a reporter's link is one unbreakable token, `Detail` set `pre-wrap`
 * with no `overflow-wrap`, and the widest URL anybody has ever filed was setting
 * the min-content width of whatever contained it. A table's min-content is its
 * widest cell's, and its widest cell was the expanded row holding that block, so
 * the table inherited a defect it did not cause. One line in `Detail` fixed both
 * layouts; see the note there.
 *
 * The split survives that fix on its own merits, measured after it: the table's
 * min-content is **458 px**, `md` (768 px) affords about 456, so switching at
 * `md` would show a table with a two-pixel scrollbar at exactly the breakpoint
 * that introduced it. `lg` affords roughly 680 and is the honest threshold.
 *
 * So the table is not squeezed into 328 px; below `lg` the page keeps the list
 * it had, which fits, stacks, and puts the dismiss button in the flow. Both
 * branches share `DismissButton` and `QueueDetail`, so the two layouts cannot
 * disagree about what a row *says* — only about how it is arranged.
 *
 * **`useBreakpoint()` reports nothing on the first paint and `{}` is falsy**, so
 * the list is what renders before the media query answers. That is the right way
 * round: it is the layout that works at every width, and a phone never sees a
 * table flash past on the way to it.
 */
function Queue(props: { entries: readonly QueuedRequest[]; onDismissed: (n: number) => void }) {
  const screens = Grid.useBreakpoint()
  return screens.lg ? <QueueTable {...props} /> : <QueueList {...props} />
}

function QueueList({
  entries,
  onDismissed,
}: {
  entries: readonly QueuedRequest[]
  onDismissed: (removed: number) => void
}) {
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {entries.map((entry) => (
        <li
          key={entry.ref}
          style={{ borderTop: '1px solid var(--cc-border-secondary)', padding: '16px 0' }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 12 }}>
            <Typography.Text strong style={{ fontSize: 16 }}>
              {entry.ref}
            </Typography.Text>
            <Tag color={COLOUR[entry.verdict]} style={{ marginInlineEnd: 0, whiteSpace: 'normal' }}>
              {t(`admin.requests.verdict.${entry.verdict}`)}
            </Tag>
            <Typography.Text type="secondary">
              {entry.askedBy === 1
                ? t('admin.requests.asked.one')
                : `${entry.askedBy} ${t('admin.requests.asked.many')}`}
            </Typography.Text>
            <span style={{ marginInlineStart: 'auto' }}>
              <Space size={8}>
                <CopyPromptButton entry={entry} />
                <DismissButton entry={entry} onDismissed={onDismissed} />
              </Space>
            </span>
          </div>

          {entry.modelId ? (
            <div style={{ marginTop: 4 }}>
              <Link to={`/watch/${entry.modelId}`}>{t('admin.requests.open')}</Link>
            </div>
          ) : null}

          <QueueDetail entry={entry} />
        </li>
      ))}
    </ul>
  )
}

/**
 * The queue as a table (client, 2026-09-08 — it read as a list before).
 *
 * **NOTES AND LINKS ARE EXPANDED BY DEFAULT AND THAT IS THE WHOLE DESIGN
 * DECISION.** A table wants short, comparable cells, and a reporter's note is
 * neither; the obvious move is to put both behind a disclosure. It is the wrong
 * one here. The queue's distinguishing value is that a stranger sometimes
 * arrives carrying **a source page nobody here would have found** — two of the
 * first nine reports did — and a link that takes a click to see is a link that
 * does not get looked at. So `defaultExpandedRowKeys` opens every row that has
 * anything to show, and the toggle only exists to get it out of the way again.
 * A row with no note and no link is not expandable at all, so the column stays
 * empty rather than offering a control that reveals nothing.
 *
 * **This only ever renders at `lg` (992 px) and above** — see `Queue` for the three
 * measured reasons a table cannot be the 360 px layout. So it needs no
 * `scroll.x`: at 760 px the table measures 728 and nothing is clipped.
 *
 * No `ellipsis` on any column: that prop reads two rects per element inside
 * React's commit, and truncating the one string worth reading in full would be
 * a poor trade even if it were free. Wrapping is what the verdict `Tag` needs
 * `whiteSpace: 'normal'` for — its default is `nowrap`, which is the other half
 * of how a cell gets cut.
 */
function QueueTable({
  entries,
  onDismissed,
}: {
  entries: readonly QueuedRequest[]
  onDismissed: (removed: number) => void
}) {
  const hasDetail = (entry: QueuedRequest) => entry.notes.length > 0 || entry.links.length > 0

  const columns: ColumnsType<QueuedRequest> = [
    {
      title: t('admin.requests.column.ref'),
      dataIndex: 'ref',
      key: 'ref',
      /*
        `nowrap` on both, which raises this column's min-content by about 30 px
        and is affordable: the table needs 458 and `lg` gives it roughly 680. A
        reference broken across two lines — "DW-" then "5600TB-1" — is the one
        string on the page a reader scans for, and hyphens make it look like two
        references rather than one wrapped.
      */
      render: (_value, entry) => (
        <>
          <Typography.Text strong style={{ fontSize: 16, whiteSpace: 'nowrap' }}>
            {entry.ref}
          </Typography.Text>
          {entry.modelId ? (
            <div style={{ marginTop: 4, whiteSpace: 'nowrap' }}>
              <Link to={`/watch/${entry.modelId}`}>{t('admin.requests.open')}</Link>
            </div>
          ) : null}
        </>
      ),
    },
    {
      title: t('admin.requests.column.verdict'),
      dataIndex: 'verdict',
      key: 'verdict',
      render: (_value, entry) => (
        <Tag color={COLOUR[entry.verdict]} style={{ marginInlineEnd: 0, whiteSpace: 'normal' }}>
          {t(`admin.requests.verdict.${entry.verdict}`)}
        </Tag>
      ),
    },
    {
      title: t('admin.requests.column.asked'),
      dataIndex: 'askedBy',
      key: 'askedBy',
      /*
        Singular and plural as two strings rather than one with an `s` appended.
        D12 keeps every user-facing string in the dictionary precisely so that
        adding a locale is a second dictionary rather than a hunt for the places
        English grammar was assumed.
      */
      render: (_value, entry) => (
        <Typography.Text type="secondary">
          {entry.askedBy === 1
            ? t('admin.requests.asked.one')
            : `${entry.askedBy} ${t('admin.requests.asked.many')}`}
        </Typography.Text>
      ),
    },
    {
      title: t('admin.requests.column.action'),
      key: 'action',
      align: 'end',
      render: (_value, entry) => (
        <Space size={8}>
          <CopyPromptButton entry={entry} />
          <DismissButton entry={entry} onDismissed={onDismissed} />
        </Space>
      ),
    },
  ]

  return (
    <Table<QueuedRequest>
      columns={columns}
      dataSource={entries as QueuedRequest[]}
      rowKey="ref"
      pagination={false}
      size="small"
      expandable={{
        rowExpandable: hasDetail,
        defaultExpandedRowKeys: entries.filter(hasDetail).map((entry) => entry.ref),
        expandedRowRender: (entry) => <QueueDetail entry={entry} />,
      }}
    />
  )
}

function QueueDetail({ entry }: { entry: QueuedRequest }) {
  return (
    <>
      {entry.notes.length > 0 ? (
        <Detail label={t('admin.requests.notes')}>
          {entry.notes.map((note, index) => (
            <div key={index}>{note}</div>
          ))}
        </Detail>
      ) : null}

      {entry.links.length > 0 ? (
        <Detail label={t('admin.requests.links')}>
          {entry.links.map((link) => (
            /*
              `noreferrer` as well as `noopener`. These are addresses a stranger
              typed, so the destination is chosen by somebody who is not us, and
              it does not get to be told which page sent the visit.
            */
            <div key={link}>
              <a href={link} target="_blank" rel="noopener noreferrer">
                {link}
              </a>
            </div>
          ))}
        </Detail>
      ) : null}
    </>
  )
}

/** Ordered by how much work the verdict implies, so the summary reads as a plan. */
const VERDICTS: readonly RequestVerdict[] = ['missing', 'withheld', 'catalogued', 'withdrawn']

const COLOUR: Record<RequestVerdict, string> = {
  missing: 'volcano',
  withheld: 'gold',
  catalogued: 'blue',
  withdrawn: 'default',
}

/**
 * **The reading side of D22 was a queue nobody could act on directly** — a
 * reference, a note, a link, and then a person retyping all three into
 * Claude Code by hand. This turns the row itself into that first message:
 * `claudePrompt` renders the skill's own command syntax plus whatever a
 * reporter left, so the whole action is copy here, paste there.
 *
 * **Absent rather than disabled where there is nothing to send** —
 * `catalogued` and `withdrawn` get no button at all, because a button that is
 * there but does nothing invites a click to find out why.
 */
function CopyPromptButton({ entry }: { entry: QueuedRequest }) {
  const { message } = App.useApp()
  const prompt = claudePrompt(entry)
  if (!prompt) return null

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt)
      void message.success(t('admin.requests.copyPrompt.done'))
    } catch {
      void message.error(t('admin.requests.copyPrompt.failed'))
    }
  }

  return (
    <Button size="small" onClick={() => void copy()}>
      {t('admin.requests.copyPrompt')}
    </Button>
  )
}

function DismissButton({
  entry,
  onDismissed,
}: {
  entry: QueuedRequest
  onDismissed: (removed: number) => void
}) {
  const [busy, setBusy] = useState(false)

  /**
   * **Refetch rather than remove the row here**, and that is the requirement
   * rather than a preference. `dismiss_catalog_requests` returns how many rows
   * it actually deleted, and a caller it refuses gets 0 — identical to naming
   * rows that were already gone. Splicing the entry out of local state would
   * make both of those look like success, which is a list quietly reporting
   * itself as shorter than it is: the exact failure D79 exists to end, and a
   * poor thing to reintroduce one migration later.
   *
   * So the answer to every outcome is the same — go and ask what is really
   * there. It costs one request on an action taken a few times a week.
   *
   * **The outcome is reported upwards and not rendered here**, which is not
   * tidiness: the refetch this triggers can empty the list, and a message
   * belonging to a row goes with the row. That is exactly the case that matters
   * — a revoked flag makes the dismissal return 0 *and* the queue come back
   * empty, so the page would have replaced the failure with "Nothing reported
   * yet". The one state that most needs explaining was the one that erased its
   * own explanation. Caught by the test that provokes it.
   */
  const dismiss = async () => {
    setBusy(true)
    let removed = 0
    try {
      removed = await dismissCatalogRequests(entry.ids)
    } catch {
      removed = 0
    } finally {
      setBusy(false)
      onDismissed(removed)
    }
  }

  /*
    The last column rather than the first, and `align: 'end'` on it: this is the
    one destructive control on the page, and it should not be the first thing a
    thumb meets on the way down the table at 360 px.
  */
  return (
    <Popconfirm
      title={t('admin.requests.dismiss.confirm')}
      okText={t('admin.requests.dismiss.yes')}
      cancelText={t('admin.requests.dismiss.no')}
      okButtonProps={{ danger: true }}
      onConfirm={() => void dismiss()}
    >
      <Button size="small" danger loading={busy}>
        {t('admin.requests.dismiss')}
      </Button>
    </Popconfirm>
  )
}

/**
 * **`overflowWrap: 'anywhere'` is the fix for the bug the client reported, and
 * it was never about the table.** A reporter's link is one unbreakable token —
 * `https://www.casio.com/in/watches/gshock/support.DW-5600TB-1/` is 59
 * characters with nowhere to break — so with `pre-wrap` alone this block's
 * min-content width is the length of the longest URL anybody has ever filed.
 * Measured in a headless browser at a real 360 px: **411 px**, against 328 px of
 * usable width, and the page scrolled sideways.
 *
 * It scrolled sideways in the **list** layout too, at exactly the same 411 px,
 * which is what identified the cause: this was a pre-existing defect that the
 * table only inherited. Chasing it as a table-sizing problem produced three
 * wrong fixes — see `Queue` — because the table's own min-content is set by its
 * widest cell, and its widest cell was the expanded row holding this block.
 *
 * `anywhere` rather than `break-word`: `break-word` will not break a long token
 * when computing **min-content**, so it leaves the overflow in place and only
 * looks like it works once the container is already wide enough.
 */
function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginTop: 8 }}>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {label}
      </Typography.Text>
      <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{children}</div>
    </div>
  )
}
