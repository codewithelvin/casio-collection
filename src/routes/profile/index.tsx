import { useEffect } from 'react'
import { Col, Row, Typography, theme as antdTheme } from 'antd'
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
 *
 * **A published collection is what somebody owns, and nothing else** — the
 * client's instruction, and it removed the tabs rather than one of them. Two
 * things follow that are worth naming:
 *
 *   * The wishlist is not hidden here, it is not fetched. `fetchPublicCollection`
 *     asks for `status = 'owned'`, on the same argument as the profile lookup
 *     above: a list filtered in the browser is a list that was still sent to the
 *     browser, and "what I am saving up for" is closer to a private note than to
 *     a shelf. The one place it is answered is the owner's own screen.
 *   * With one list there is nothing to switch between, so the heading is the
 *     whole chrome of this page and it is a step smaller than every other
 *     route's — level 3 rather than 2. A 30 px name over a grid, with no tab bar
 *     under it to balance the weight, was the client's other note.
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

  // Belt and braces over the query's own filter: `entriesWithStatus` is what
  // keeps a row the database sent for some other reason off this page, and it
  // costs one pass over a few hundred items.
  const shown = sortEntries(entriesWithStatus(entries, 'owned'), 'added')

  return (
    <div>
      <Typography.Title level={3} style={{ marginTop: 0, marginBottom: 4 }}>
        {owner.display_name ?? `/u/${owner.handle ?? handle}`}
      </Typography.Title>

      {/* The count was in a tab label until the tabs went, and it is the one
          thing that was worth keeping from them: it says what the grid is —
          somebody's owned watches — to a visitor who arrived from a link with no
          other context. Rendered only once the rows are in, because a number
          beside a skeleton is a number that is about to change. */}
      {collection.isPending ? null : (
        <Typography.Paragraph type="secondary" style={{ fontSize: token.fontSizeSM }}>
          {/* Built as one expression rather than as JSX text: the middle dot is
              punctuation between two values, not a sentence for D12 to hold. */}
          {`${t('profile.owned')} · ${shown.length}`}
        </Typography.Paragraph>
      )}

      {collection.isPending ? (
        <SkeletonGrid />
      ) : shown.length === 0 ? (
        <EmptyState title={t('profile.empty')} />
      ) : (
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
