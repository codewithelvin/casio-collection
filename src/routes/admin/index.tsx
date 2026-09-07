import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Tag, Typography } from 'antd'
import { Link } from 'react-router-dom'
import { useCatalog } from '../../catalog/client.ts'
import { fetchCatalogRequests, fetchIsAdmin } from '../../collection/api.ts'
import {
  countByVerdict,
  groupRequests,
  type QueuedRequest,
  type RequestVerdict,
} from '../../collection/requestQueue.ts'
import { isAuthConfigured } from '../../auth/supabase.ts'
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

  const admin = useQuery({
    queryKey: ['is-admin'] as const,
    queryFn: fetchIsAdmin,
    // Only worth asking once there is a session to ask about. A guest is not the
    // admin and the answer needs no round trip to say so.
    enabled: isAuthConfigured() && status === 'authenticated',
    staleTime: 5 * 60_000,
    retry: false,
  })

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

          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {grouped.map((entry) => (
              <QueueRow key={entry.ref} entry={entry} />
            ))}
          </ul>
        </>
      )}
    </div>
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

function QueueRow({ entry }: { entry: QueuedRequest }) {
  return (
    <li style={{ borderTop: '1px solid var(--cc-border-secondary)', padding: '16px 0' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 12 }}>
        <Typography.Text strong style={{ fontSize: 16 }}>
          {entry.ref}
        </Typography.Text>
        <Tag color={COLOUR[entry.verdict]} style={{ marginInlineEnd: 0 }}>
          {t(`admin.requests.verdict.${entry.verdict}`)}
        </Tag>
        {/*
          Singular and plural as two strings rather than one with an `s` appended.
          D12 keeps every user-facing string in the dictionary precisely so that
          adding a locale is a second dictionary rather than a hunt for the places
          English grammar was assumed.
        */}
        <Typography.Text type="secondary">
          {entry.askedBy === 1
            ? t('admin.requests.asked.one')
            : `${entry.askedBy} ${t('admin.requests.asked.many')}`}
        </Typography.Text>
      </div>

      {entry.modelId ? (
        <div style={{ marginTop: 4 }}>
          <Link to={`/watch/${entry.modelId}`}>{t('admin.requests.open')}</Link>
        </div>
      ) : null}

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
    </li>
  )
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginTop: 8 }}>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {label}
      </Typography.Text>
      <div style={{ whiteSpace: 'pre-wrap' }}>{children}</div>
    </div>
  )
}
