import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import {
  fetchCollectors,
  fetchListedOwners,
  fetchModelOwnerCounts,
  type Collector,
  type CollectorQuery,
  type ListedOwner,
} from './api.ts'
import { isAuthConfigured } from '../auth/supabase.ts'

/**
 * D69 / D72 — the read side of the collectors work: the directory's page, and
 * the two things a watch page says about who owns it.
 *
 * Separate from `mutations.ts` because nothing here writes anything, and
 * separate from `api.ts` because these are React hooks rather than statements.
 */

/** FR-12.4 — 24 to a page, and the number is here so the route and the fetch agree. */
export const COLLECTORS_PAGE_SIZE = 24

export function useCollectors(query: CollectorQuery): UseQueryResult<Collector[], Error> {
  return useQuery({
    queryKey: [
      'collectors',
      query.sort ?? 'watches',
      query.search ?? '',
      query.owns ?? '',
      query.offset ?? 0,
    ] as const,
    queryFn: () => fetchCollectors(query),
    // Nothing to ask before the project exists, and FR-12.5's empty state is the
    // correct page for a build with no backend configured.
    enabled: isAuthConfigured(),
    staleTime: 60_000,
    retry: false,
  })
}

/**
 * FR-3.8 and FR-3.9 together, in one hook, because the two numbers a watch page
 * shows have the same failure mode and it is *silence*.
 *
 * **`retry: false` is the requirement rather than a preference.** A paused free
 * project (D23), an offline phone or a rate limit must produce no count, no error
 * and no retry storm — D1's promise is that browsing works when the database does
 * not, and a watch page that reports a failed fetch of a decoration breaks it.
 */
export interface WatchOwners {
  /** Listed collectors who own it. Never floored: they published this. */
  owners: ListedOwner[]
  /** Everybody, from five upward (D72). `null` below the floor and on failure. */
  ownedCount: number | null
  wishlistCount: number | null
}

export function useWatchOwners(modelId: string | null): UseQueryResult<WatchOwners, Error> {
  return useQuery({
    queryKey: ['owners', modelId] as const,
    queryFn: async (): Promise<WatchOwners> => {
      const id = modelId as string
      // Two requests, deliberately not one RPC. They answer different questions
      // with different privacy rules, and merging them would make the floor a
      // property of a join rather than of the function that owns it.
      const [owners, counts] = await Promise.all([
        fetchListedOwners(id),
        fetchModelOwnerCounts([id]),
      ])
      const row = counts.find((entry) => entry.model_id === id)
      return {
        owners,
        ownedCount: row?.owned_count ?? null,
        wishlistCount: row?.wishlist_count ?? null,
      }
    },
    enabled: modelId !== null && modelId !== '' && isAuthConfigured(),
    staleTime: 5 * 60_000,
    retry: false,
  })
}
