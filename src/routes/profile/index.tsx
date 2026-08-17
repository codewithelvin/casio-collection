import { useEffect } from 'react'
import { Col, Row, Tabs, Typography, theme as antdTheme } from 'antd'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useCatalog } from '../../catalog/client.ts'
import type { PublishedSeries } from '../../catalog/schema.ts'
import { fetchProfileByHandle, fetchPublicCollection } from '../../collection/api.ts'
import { entriesWithStatus, joinCollection, sortEntries } from '../../collection/join.ts'
import { isAuthConfigured } from '../../auth/supabase.ts'
import { WatchCard } from '../../ui/WatchCard'
import { UnlistedCard } from '../../ui/UnlistedCard'
import { GRID_GUTTER, GRID_SPANS } from '../../ui/WatchGrid'
import { EmptyState } from '../../ui/EmptyState'
import { SkeletonGrid } from '../../ui/SkeletonGrid'
import { t } from '../../i18n/strings'

/**
 * FR-7.4 / §8.10 — `/u/<handle>`, **read-only and requiring no session at all.**
 *
 * §8.10 is specific that the mutation controls are removed "at the component
 * level — not hidden with CSS", and that is why this screen composes `WatchCard`
 * without `OwnershipControls` rather than reusing the collection screen with a
 * flag. A flag is a thing that can be false in one branch; a component that was
 * never rendered cannot be pressed by anyone, whatever the CSS says.
 *
 * FR-7.5 is the other half and is the part that is easy to get subtly wrong:
 * **an unknown handle and a private one must render the same page.** That is not
 * a copy decision. Distinguishing them tells a stranger that a person exists and
 * has chosen not to be public, which is precisely the fact the setting was
 * turned off to keep.
 *
 * The database does the work rather than this component: `fetchProfileByHandle`
 * asks for `is_public = true` and the `public profile readable` policy admits
 * nothing else, so a private profile is genuinely invisible here rather than
 * fetched and then filtered — which would leak the difference through timing.
 */
export default function ProfileRoute() {
  const { handle = '' } = useParams<{ handle: string }>()
  const { token } = antdTheme.useToken()
  const catalog = useCatalog()

  const profile = useQuery({
    queryKey: ['public-profile', handle] as const,
    queryFn: () => fetchProfileByHandle(handle),
    // Nothing to ask before the project exists; the not-found page is correct.
    enabled: handle !== '' && isAuthConfigured(),
    staleTime: 60_000,
    retry: false,
  })

  const owner = profile.data
  const collection = useQuery({
    queryKey: ['public-collection', owner?.id] as const,
    queryFn: () => fetchPublicCollection(owner?.id as string),
    enabled: owner?.id !== undefined,
    staleTime: 60_000,
    retry: false,
  })

  // FR-3.7's argument applied to a profile: a pasted link should preview as the
  // person's collection, not as the site name.
  useEffect(() => {
    const previous = document.title
    if (owner) {
      document.title = `${owner.display_name ?? owner.handle ?? handle} · ${t('app.name')}`
    }
    return () => {
      document.title = previous
    }
  }, [owner, handle])

  if (!isAuthConfigured()) {
    return <EmptyState title={t('profile.notFound.title')} body={t('profile.notFound.body')} />
  }

  if (profile.isPending || catalog.isPending) return <SkeletonGrid />

  // Unknown, private, or a failed lookup — one page for all three (FR-7.5).
  if (profile.isError || !owner || !catalog.data) {
    return <EmptyState title={t('profile.notFound.title')} body={t('profile.notFound.body')} />
  }

  const entries = joinCollection(catalog.data, collection.data ?? [])
  const seriesById = new Map<string, PublishedSeries>(
    catalog.data.series.map((series) => [series.id, series]),
  )

  const tab = (status: 'owned' | 'wishlist') => {
    const shown = sortEntries(entriesWithStatus(entries, status), 'added')
    if (shown.length === 0) return <EmptyState title={t('profile.empty')} />
    return (
      <Row gutter={GRID_GUTTER}>
        {shown.map((entry) => (
          <Col key={entry.item.model_id} {...GRID_SPANS}>
            {entry.model ? (
              <WatchCard
                model={entry.model}
                seriesName={seriesById.get(entry.model.series)?.name}
                // §8.10 — no ownership controls on somebody else's collection.
                readOnly
              />
            ) : (
              <UnlistedCard item={entry.item} />
            )}
          </Col>
        ))}
      </Row>
    )
  }

  const owned = entriesWithStatus(entries, 'owned').length
  const wishlist = entriesWithStatus(entries, 'wishlist').length

  return (
    <div>
      <Typography.Title level={2} style={{ marginTop: 0, marginBottom: 4 }}>
        {owner.display_name ?? `/u/${owner.handle ?? handle}`}
      </Typography.Title>

      {collection.isPending ? (
        <SkeletonGrid />
      ) : (
        <Tabs
          items={[
            {
              key: 'owned',
              label: `${t('profile.owned')} (${owned})`,
              children: tab('owned'),
            },
            {
              key: 'wishlist',
              label: `${t('profile.wishlist')} (${wishlist})`,
              children: tab('wishlist'),
            },
          ]}
        />
      )}

      {/* §8.10 — "a footer line identifying the site". Somebody arriving here
          from a shared link has no other context for what they are looking at. */}
      <Typography.Paragraph
        type="secondary"
        style={{ marginTop: 24, fontSize: token.fontSizeSM }}
      >
        {t('profile.footer')}
      </Typography.Paragraph>
    </div>
  )
}
