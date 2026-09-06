import { useEffect, useMemo, useState } from 'react'
import { Button, Col, Input, Row, Segmented, Typography, theme as antdTheme } from 'antd'
import { useSearchParams } from 'react-router-dom'
import { modelById, useCatalog } from '../../catalog/client.ts'
import { COLLECTORS_PAGE_SIZE, useCollectors } from '../../collection/collectors.ts'
import type { CollectorSort } from '../../collection/api.ts'
import { isAuthConfigured } from '../../auth/supabase.ts'
import { CollectorCard } from '../../ui/CollectorCard'
import { EmptyState } from '../../ui/EmptyState'
import { ErrorState } from '../../ui/ErrorState'
import { SkeletonGrid } from '../../ui/SkeletonGrid'
import { t } from '../../i18n/strings'

/**
 * D69 / FR-12 — `/collectors`, the directory.
 *
 * **Nobody is here who did not ask to be.** Publishing a collection and being
 * listed in this page are two different consents (FR-7.7), and the second one is
 * enforced in the database rather than in this query — `collectors()` returns
 * listed rows and there is no argument that widens it (D73). That matters more
 * than it looks: the same page written as a select with `.eq('is_listed', true)`
 * would have been a filter the caller could decline to apply.
 *
 * This is also the one screen on the site whose content needs the network. The
 * catalogue is a file (D1) and everything else reads it; this reads people. So it
 * is the only route with a real error state rather than a fallback, and the only
 * one that is honestly empty offline (FR-12.7).
 */
export default function CollectorsRoute() {
  const { token } = antdTheme.useToken()
  const [params, setParams] = useSearchParams()

  // FR-1.6's rule applied to a screen that is not a grid: the URL owns the sort,
  // the term, the filter and the page, so any view of this page can be shared.
  const sort: CollectorSort = params.get('sort') === 'new' ? 'new' : 'watches'
  const owns = params.get('owns') ?? undefined
  const page = Math.max(0, Number.parseInt(params.get('page') ?? '0', 10) || 0)
  const term = params.get('q') ?? ''

  // The input is local and the URL is debounced behind it. Writing a search
  // parameter per keystroke would put a history entry — and a query — behind
  // every letter.
  const [typed, setTyped] = useState(term)
  useEffect(() => setTyped(term), [term])
  useEffect(() => {
    if (typed === term) return
    const timer = setTimeout(() => {
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous)
          if (typed.trim() === '') next.delete('q')
          else next.set('q', typed.trim())
          next.delete('page')
          return next
        },
        { replace: true },
      )
    }, 300)
    return () => clearTimeout(timer)
  }, [typed, term, setParams])

  const query = useCollectors({
    search: term,
    sort,
    owns,
    limit: COLLECTORS_PAGE_SIZE,
    offset: page * COLLECTORS_PAGE_SIZE,
  })

  // FR-12.8 — when the page is filtered to one watch, say which watch. The
  // catalogue is already in memory, so this costs a lookup and no request.
  const catalog = useCatalog()
  // `modelById` rather than a scan of the browsable set, deliberately: D63
  // withholds a photograph-less watch from every grid and facet, and a link that
  // named one would otherwise land on a page saying nobody owns a watch it also
  // refuses to name.
  const ownsModel = useMemo(
    () => (owns && catalog.data ? modelById(catalog.data, owns) : undefined),
    [catalog.data, owns],
  )

  const update = (key: string, value: string | null) => {
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      if (value === null) next.delete(key)
      else next.set(key, value)
      if (key !== 'page') next.delete('page')
      return next
    })
  }

  const rows = query.data ?? []
  // One page at a time and no total: `collectors()` returns rows, not a count,
  // and asking for a count of a table nobody may select from is a second
  // function for a number that only decorates a pager.
  const hasMore = rows.length === COLLECTORS_PAGE_SIZE

  return (
    <div>
      <Typography.Title level={2} style={{ marginTop: 0, marginBottom: 4 }}>
        {t('route.collectors.title')}
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        {ownsModel
          ? `${t('collectors.owns')} ${ownsModel.ref}`
          : owns
            ? t('collectors.owns.unknown')
            : t('route.collectors.body')}
      </Typography.Paragraph>

      {owns ? (
        <Button size="small" onClick={() => update('owns', null)} style={{ marginBottom: 16 }}>
          {t('collectors.owns.clear')}
        </Button>
      ) : null}

      <div
        style={{
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <Input.Search
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder={t('collectors.search.placeholder')}
          aria-label={t('collectors.search.label')}
          allowClear
          style={{ maxWidth: 320 }}
        />
        {/*
          Two orders and no third. D69 draws the line between a directory and a
          social graph at exactly this control: the order is by watches owned
          because something has to be first, and there is no rank, no badge and
          nothing anybody can do to move up it except own more watches.
        */}
        <Segmented
          value={sort}
          onChange={(value) => update('sort', String(value))}
          options={[
            { label: t('collectors.sort.watches'), value: 'watches' },
            { label: t('collectors.sort.new'), value: 'new' },
          ]}
        />
      </div>

      {!isAuthConfigured() ? (
        <EmptyState title={t('collectors.empty.title')} body={t('collectors.empty.body')} />
      ) : query.isPending ? (
        <SkeletonGrid />
      ) : query.isError ? (
        // FR-12.7 — the honest state for the one page that cannot work offline.
        <ErrorState onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={page > 0 ? t('collectors.end.title') : t('collectors.empty.title')}
          body={page > 0 ? undefined : t('collectors.empty.body')}
        />
      ) : (
        <Row gutter={[16, 16]}>
          {rows.map((collector) => (
            <Col key={collector.handle} xs={24} sm={12} lg={8} xl={6}>
              <CollectorCard collector={collector} />
            </Col>
          ))}
        </Row>
      )}

      {(page > 0 || hasMore) && !query.isError ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
          <Button
            disabled={page === 0}
            onClick={() => update('page', String(page - 1))}
            style={{ fontSize: token.fontSize }}
          >
            {t('collectors.previous')}
          </Button>
          <Button disabled={!hasMore} onClick={() => update('page', String(page + 1))}>
            {t('collectors.next')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
