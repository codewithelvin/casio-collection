import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import {
  fetchCollection,
  fetchProfile,
  putCollectionItem,
  removeCollectionItem,
  setCollectionNote,
  type CollectionItem,
  type CollectionStatus,
  type Profile,
} from './api.ts'
import { useSessionStore } from '../auth/session.ts'
import { writePendingIntent } from '../auth/pendingIntent.ts'
import { recallCollection, rememberCollection, useOnline } from '../pwa/offline.ts'
import type { BrowseModel } from '../catalog/schema.ts'

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
    queryFn: async () => {
      const rows = await fetchCollection(userId as string)
      // FR-11.4 — the app's own last known copy, written after a fetch that
      // actually succeeded. The service worker never answers for Supabase
      // (FR-11.3); this is a different layer and the app knows when it is
      // reading it, which is what lets FR-11.5 refuse a write rather than
      // accept one against data it cannot trust.
      rememberCollection(userId as string, rows)
      return rows
    },
    enabled: userId !== null,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    // Offline, the fetch fails and this is what the screen renders instead.
    // `placeholderData` rather than `initialData` deliberately: initialData
    // would be treated as a successful fetch and suppress the refetch that
    // replaces it the moment the network returns.
    placeholderData: () =>
      userId === null ? undefined : recallCollection<CollectionItem[]>(userId),
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
   * FR-11.5 — **offline, the ownership controls are disabled with a visible
   * explanation.** They are never optimistically applied and never queued.
   *
   * D33's whole rule is one sentence: you can look offline, you cannot change
   * anything offline. A queued write replayed later is an offline collection by
   * another name, and an offline collection is the two-way merge D6 exists to
   * prevent — so this is refused at the control rather than absorbed by it.
   */
  offline: boolean
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
export function useOwnership(model: BrowseModel, handlers: OwnershipHandlers = {}): Ownership {
  const queryClient = useQueryClient()
  const location = useLocation()
  const sessionStatus = useSessionStore((state) => state.status)
  const userId = useSessionStore((state) => state.user?.id ?? null)
  const promptSignIn = useSessionStore((state) => state.promptSignIn)
  const online = useOnline()
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
    offline: !online,
    pending:
      mutation.isPending || sessionStatus === 'restoring' || (signedIn && itemsPending),
    set: (status) => {
      // FR-11.5 — refused here, not queued. The control is already disabled and
      // says why; this is the guard behind it, because a disabled button is a
      // presentation and a press can still arrive from a keyboard or a test.
      if (!online) return
      if (!signedIn) return rememberAndPrompt(status)
      mutation.mutate({ kind: 'set', status })
    },
    clear: () => {
      if (!online) return
      // A guest cannot hold a mark, so there is nothing here to clear. Doing
      // nothing is right: opening a sign-in modal to undo something that was
      // never done would be a dialogue about a state that does not exist.
      if (!signedIn) return
      mutation.mutate({ kind: 'clear' })
    },
  }
}

type Change = { kind: 'set'; status: CollectionStatus } | { kind: 'clear' }

/* ------------------------------------------------------------------------- *
 * FR-5 — the note.
 * ------------------------------------------------------------------------- */

/** §6.3's constraint, so the field can stop the text before the database does. */
export const NOTE_MAX = 2000

/**
 * Long enough that a sentence is one save rather than eight, short enough that
 * *Saved* appears while somebody is still looking at the field.
 */
export const NOTE_DEBOUNCE_MS = 1200

/** FR-5.4 — is what I am typing public? One boolean, and it has to be current. */
export function useProfile(): UseQueryResult<Profile | null, Error> {
  const userId = useSessionStore((state) => state.user?.id ?? null)

  return useQuery({
    queryKey: ['profile', userId] as const,
    queryFn: () => fetchProfile(userId as string),
    enabled: userId !== null,
    staleTime: 30_000,
  })
}

export type NoteStatus = 'idle' | 'saving' | 'saved' | 'failed'

export interface NoteEditor {
  value: string
  status: NoteStatus
  /** FR-5.4 — true when what is typed here is visible at `/u/<handle>`. */
  isPublic: boolean
  change: (next: string) => void
  /** FR-5.2's blur and its explicit *Save*, which are the same thing. */
  save: () => void
}

/**
 * FR-5.2 — "saves on blur and on an explicit *Save*, with a debounce; a *Saved*
 * indicator confirms it. **It is never lost by navigating away mid-edit.**"
 *
 * That last clause is the whole design. A debounce plus save-on-blur handles
 * every way of leaving a field except the one that matters most in a
 * single-page app: pressing a link. A route change unmounts the editor without
 * ever blurring it, so a pending debounce is simply cancelled and a sentence
 * somebody typed thirty seconds ago is gone — with no error, no warning, and
 * nothing to suggest it did not save.
 *
 * So the flush happens in the unmount cleanup, and it calls the API directly
 * rather than through the mutation: by then this component is gone and its
 * mutation with it, while the write and the cache it invalidates are not this
 * component's to abandon.
 *
 * The draft is seeded from the stored note **once per watch**, not whenever the
 * stored value changes. Re-seeding on every change would let a background
 * refetch — the query refetches when the tab regains focus — overwrite a
 * half-typed sentence with what the server still had.
 */
export function useNote(model: BrowseModel): NoteEditor {
  const queryClient = useQueryClient()
  const userId = useSessionStore((state) => state.user?.id ?? null)
  const { data: items } = useCollection()
  const { data: profile } = useProfile()

  const stored = itemFor(items ?? [], model.id)?.note ?? ''
  const [value, setValue] = useState(stored)
  const [status, setStatus] = useState<NoteStatus>('idle')

  /**
   * **Memoised, and the memo is load-bearing.** `collectionKey` builds a new
   * array every call, so an unmemoised key changes identity on every render —
   * which puts it in the flush effect's dependencies as a value that is never
   * equal to itself. The cleanup then ran between every keystroke, saw a draft
   * that differed from the last saved value, and fired the unmount flush: one
   * network write per character typed, and a `save()` on blur that found
   * nothing left to do and never showed *Saved*.
   */
  const key = useMemo(() => collectionKey(userId), [userId])

  // Everything the unmount flush needs, in refs, because the cleanup closes over
  // the render it was created in and a stale draft is exactly what it must not
  // write back.
  const draft = useRef(stored)
  const savedValue = useRef(stored)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seeded = useRef(model.id)

  if (seeded.current !== model.id) {
    seeded.current = model.id
    draft.current = stored
    savedValue.current = stored
    if (value !== stored) setValue(stored)
    if (status !== 'idle') setStatus('idle')
  }

  // The first render of a watch whose rows had not arrived yet: seed once the
  // stored note appears, but only while the field is still untouched.
  if (draft.current === '' && value === '' && stored !== '' && savedValue.current === '') {
    draft.current = stored
    savedValue.current = stored
    setValue(stored)
  }

  const persist = useCallback(
    async (next: string) => {
      if (userId === null) return
      savedValue.current = next
      setStatus('saving')
      try {
        await setCollectionNote(userId, model.id, next)
        // The cache is corrected rather than refetched: the row is otherwise
        // unchanged, and a refetch here would race the next keystroke.
        queryClient.setQueryData<CollectionItem[]>(key, (rows) =>
          (rows ?? []).map((row) =>
            row.model_id === model.id ? { ...row, note: next.trim() === '' ? null : next } : row,
          ),
        )
        setStatus('saved')
      } catch {
        setStatus('failed')
      }
    },
    [userId, model.id, queryClient, key],
  )

  const save = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (draft.current === savedValue.current) return
    void persist(draft.current)
  }, [persist])

  const change = useCallback(
    (next: string) => {
      const clipped = next.slice(0, NOTE_MAX)
      draft.current = clipped
      setValue(clipped)
      setStatus('idle')
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        timer.current = null
        if (draft.current !== savedValue.current) void persist(draft.current)
      }, NOTE_DEBOUNCE_MS)
    },
    [persist],
  )

  useEffect(() => {
    // FR-5.2's last clause. Not `save()` — that closes over this render, and by
    // the time this runs the refs are the only thing still telling the truth.
    return () => {
      if (timer.current) clearTimeout(timer.current)
      if (draft.current === savedValue.current || userId === null) return
      const flushed = draft.current
      savedValue.current = flushed
      void setCollectionNote(userId, model.id, flushed)
        .then(() => queryClient.invalidateQueries({ queryKey: key }))
        .catch(() => {
          // Nothing left to tell: the editor is unmounted and the page it was
          // on is gone. The next visit re-reads the row, which is the truth.
        })
    }
  }, [userId, model.id, queryClient, key])

  return {
    value,
    status,
    isPublic: profile?.is_public ?? false,
    change,
    save,
  }
}
