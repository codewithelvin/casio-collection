import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import {
  fetchCollection,
  putCollectionItem,
  removeCollectionItem,
  type CollectionItem,
  type CollectionStatus,
} from './api.ts'
import { useSessionStore } from '../auth/session.ts'
import { writePendingIntent } from '../auth/pendingIntent.ts'
import type { PublishedModel } from '../catalog/schema.ts'

/**
 * §7.1 — the optimistic upsert and delete (FR-4.3), and the four pure functions
 * that decide what a press *means*.
 *
 * The pure half is first and is the half that matters. D31 puts this folder
 * behind a 90% floor because every one of its failure modes is quiet: a
 * transform that drops a note loses something the user typed, a transform that
 * appends instead of replacing shows a watch twice, and neither throws.
 */

/* ------------------------------------------------------------------------- *
 * Pure — the optimistic transforms.
 *
 * They take the rows and return new rows. Nothing here touches the network, a
 * cache, or a clock: `now` is a parameter so the caller owns the one clock and
 * a test can assert an exact timestamp.
 * ------------------------------------------------------------------------- */

export function itemFor(
  items: readonly CollectionItem[],
  modelId: string,
): CollectionItem | undefined {
  return items.find((item) => item.model_id === modelId)
}

export function statusOf(
  items: readonly CollectionItem[],
  modelId: string,
): CollectionStatus | null {
  return itemFor(items, modelId)?.status ?? null
}

/**
 * FR-4.1 and FR-4.5 in one function, because D8 made them one operation.
 *
 * A watch that is not held is added. A watch that is held has its status
 * changed and **keeps its note and its date added** — the move is a change of
 * status, not a new entry, and losing either would be a silent data loss the
 * moment M6 lets someone write a note against a wishlisted watch.
 *
 * A new row goes to the front because the query reads `created_at desc`. The
 * optimistic cache has to be in the order the server will send back, or the
 * card jumps position when the request settles.
 */
export function withStatus(
  items: readonly CollectionItem[],
  modelId: string,
  status: CollectionStatus,
  now: string,
): CollectionItem[] {
  if (!itemFor(items, modelId)) {
    return [{ model_id: modelId, status, note: null, created_at: now, updated_at: now }, ...items]
  }
  return items.map((item) =>
    item.model_id === modelId ? { ...item, status, updated_at: now } : item,
  )
}

export function withoutItem(
  items: readonly CollectionItem[],
  modelId: string,
): CollectionItem[] {
  return items.filter((item) => item.model_id !== modelId)
}

/**
 * FR-4.4 — removing an *owned* mark that carries a note asks first and says the
 * note will go; removing one without a note does not interrupt.
 *
 * It is a predicate rather than a branch inside the button because the rule has
 * two clauses and both are easy to get wrong in a direction nobody notices: an
 * interruption on every removal trains people to dismiss it, and no
 * interruption on the one removal that destroys typed text is the fault the
 * requirement exists to prevent.
 */
export function needsRemovalConfirmation(item: CollectionItem | undefined): boolean {
  return item?.status === 'owned' && (item.note ?? '').trim() !== ''
}

/* ------------------------------------------------------------------------- *
 * The React half.
 * ------------------------------------------------------------------------- */

/** §7.2 — keyed by user, so signing out and in as somebody else shares nothing. */
export function collectionKey(userId: string | null) {
  return ['collection', userId] as const
}

/**
 * §6.5's step 2 — every row the signed-in user holds, in one request.
 *
 * `staleTime` overrides the app default deliberately. App.tsx sets `Infinity`
 * because the catalogue artefacts are immutable per version (§6.2); these rows
 * are the opposite, and the same person marking a watch on their phone is the
 * ordinary case rather than the exotic one. Refetching when the tab is focused
 * again is what makes that arrive without a reload.
 */
export function useCollection(): UseQueryResult<CollectionItem[], Error> {
  const userId = useSessionStore((state) => state.user?.id ?? null)

  return useQuery({
    queryKey: collectionKey(userId),
    queryFn: () => fetchCollection(userId as string),
    enabled: userId !== null,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })
}

export interface OwnershipHandlers {
  /**
   * FR-4.3 — the write failed, the button has already been put back, and the
   * user is owed a way to try again. The retry is handed over rather than
   * described so the caller cannot reconstruct it wrongly.
   */
  onFailure?: (retry: () => void) => void
  /** FR-4.5 — this watch was on the wishlist and has moved. */
  onMoved?: () => void
}

export interface Ownership {
  status: CollectionStatus | null
  item: CollectionItem | undefined
  /**
   * FR-4.6 — disabled with a visible pending state, and **only this watch's
   * controls**. One mutation per model, so marking one watch cannot freeze
   * another; the two controls on a detail page share it because they are two
   * controls over one row.
   *
   * It also covers the states where the answer is not yet known — a session
   * still restoring, or the rows still loading — because §8.7 renders those the
   * same way: same shape, loading, disabled, no layout shift.
   */
  pending: boolean
  set: (status: CollectionStatus) => void
  clear: () => void
}

/**
 * Everything one watch's Owned and Wishlist controls need.
 *
 * The signed-out branch is FR-4.2 and §9.4 meeting: the press is written to the
 * single slot **before** the modal opens, so the modal's own `ensureReturnPath`
 * finds the slot occupied and leaves it alone. That ordering is the whole
 * reason the modal writes with `ensure` and this writes with `write` — a press
 * is a richer intent than a return path and must win.
 */
export function useOwnership(model: PublishedModel, handlers: OwnershipHandlers = {}): Ownership {
  const queryClient = useQueryClient()
  const location = useLocation()
  const sessionStatus = useSessionStore((state) => state.status)
  const userId = useSessionStore((state) => state.user?.id ?? null)
  const promptSignIn = useSessionStore((state) => state.promptSignIn)
  const { data: items, isPending: itemsPending } = useCollection()

  const key = collectionKey(userId)
  const rows = items ?? []

  const mutation = useMutation({
    mutationFn: async (change: Change) => {
      if (change.kind === 'clear') return removeCollectionItem(userId as string, model.id)
      return putCollectionItem(userId as string, model.id, change.status)
    },

    onMutate: async (change: Change) => {
      // In flight requests would otherwise land after the optimistic write and
      // overwrite it with the state the server had before the press.
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<CollectionItem[]>(key) ?? []

      queryClient.setQueryData<CollectionItem[]>(
        key,
        change.kind === 'clear'
          ? withoutItem(previous, model.id)
          : withStatus(previous, model.id, change.status, new Date().toISOString()),
      )

      return { previous, previousStatus: statusOf(previous, model.id) }
    },

    onSuccess: (_result, change, context) => {
      if (change.kind === 'set' && change.status === 'owned' && context.previousStatus === 'wishlist') {
        handlers.onMoved?.()
      }
    },

    onError: (_error, change, context) => {
      // FR-4.3 — the button goes back to what it said before the press. The
      // whole previous list is restored rather than the one row recomputed,
      // because reversing a transform is a second implementation of it.
      if (context) queryClient.setQueryData(key, context.previous)
      handlers.onFailure?.(() => mutation.mutate(change))
    },

    // Whatever happened, the server is the authority on what the row is now.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key })
    },
  })

  const signedIn = sessionStatus === 'authenticated' && userId !== null

  /**
   * §9.4 — the guest branch. The press is remembered and the modal is opened
   * with the watch that triggered it, which is what §8.9 shows back to them.
   */
  const rememberAndPrompt = (status: CollectionStatus) => {
    writePendingIntent({
      kind: 'collection',
      modelId: model.id,
      status,
      returnTo: `${location.pathname}${location.search}`,
    })
    promptSignIn(model)
  }

  return {
    status: signedIn ? statusOf(rows, model.id) : null,
    item: signedIn ? itemFor(rows, model.id) : undefined,
    pending:
      mutation.isPending || sessionStatus === 'restoring' || (signedIn && itemsPending),
    set: (status) => {
      if (!signedIn) return rememberAndPrompt(status)
      mutation.mutate({ kind: 'set', status })
    },
    clear: () => {
      // A guest cannot hold a mark, so there is nothing here to clear. Doing
      // nothing is right: opening a sign-in modal to undo something that was
      // never done would be a dialogue about a state that does not exist.
      if (!signedIn) return
      mutation.mutate({ kind: 'clear' })
    },
  }
}

type Change = { kind: 'set'; status: CollectionStatus } | { kind: 'clear' }
