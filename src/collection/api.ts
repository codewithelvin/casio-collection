import { getSupabase } from '../auth/supabase.ts'

/**
 * §7.1 — the Supabase reads and writes for `collection_items`, and nothing else.
 *
 * Every function here is one statement against one table. The decisions about
 * *what* a press means — does it add, move or remove, what does the button show
 * while the network is out — live in `mutations.ts` as pure functions, because
 * those are the ones that fail silently and D31 puts this whole folder behind a
 * 90% floor for exactly that reason.
 */

export const COLLECTION_STATUSES = ['owned', 'wishlist'] as const
export type CollectionStatus = (typeof COLLECTION_STATUSES)[number]

/**
 * A row as it comes back from PostgREST. Snake case deliberately: this is the
 * database's shape and renaming it in transit would mean two vocabularies for
 * one table and a mapping layer to keep them agreeing.
 *
 * `note` is M6's to edit. It is in the type from M5 because M5 already has to
 * *preserve* it — an upsert that moves a watch from the wishlist must not drop
 * the note attached to it — and because FR-4.4 asks whether one exists before
 * removing a mark.
 */
export interface CollectionItem {
  model_id: string
  status: CollectionStatus
  note: string | null
  created_at: string
  updated_at: string
}

const TABLE = 'collection_items'
const COLUMNS = 'model_id, status, note, created_at, updated_at'

/**
 * FR-6.1 — the whole collection in one request, joined against the catalogue in
 * memory afterwards (§6.5). There is no pagination and no lazy hydration: D24
 * caps a collection at one row per reference, the catalogue is a few hundred
 * references, and the file it is joined against is already downloaded.
 *
 * **`.eq('user_id', …)` is not redundant and removing it is a data leak.**
 * RLS gives `collection_items` two select policies, and the second one —
 * `public items readable` (FR-7.4) — matches every row belonging to a *public*
 * profile. An unfiltered select therefore returns this user's rows plus every
 * published collection on the site, and it does it without an error, without a
 * warning, and correctly according to the policies. The filter is what makes
 * the statement mean "mine".
 */
export async function fetchCollection(userId: string): Promise<CollectionItem[]> {
  const supabase = await getSupabase()
  const { data, error } = await supabase
    .from(TABLE)
    .select(COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`collection: ${error.message}`)
  return (data ?? []) as unknown as CollectionItem[]
}

/**
 * FR-4.1 / FR-4.5 — mark, or move. One statement covers both because D8 made
 * the pair (user, model) the primary key: there is no *owned row* and *wishlist
 * row* to reconcile, only a status to set.
 *
 * **`note` is deliberately absent from the payload.** PostgREST builds the
 * `on conflict do update set` list from the keys it is given, so a column that
 * is not sent is a column that is not touched — which is what keeps a note
 * written against a wishlisted watch when that watch becomes owned. Sending
 * `note: null` "for completeness" would erase it, and the erasure would look
 * like a bug in M6's editor rather than in this line.
 *
 * `created_at` is left out for the same reason and means the same thing: the
 * date added is when the watch entered the collection, not when its status last
 * changed. The trigger keeps `updated_at` for that.
 */
export async function putCollectionItem(
  userId: string,
  modelId: string,
  status: CollectionStatus,
): Promise<void> {
  const supabase = await getSupabase()
  const { error } = await supabase
    .from(TABLE)
    .upsert({ user_id: userId, model_id: modelId, status }, { onConflict: 'user_id,model_id' })

  if (error) throw new Error(`collection: ${error.message}`)
}

/**
 * FR-4.4 — pressing a set mark again removes it. The note goes with the row,
 * which is why FR-4.4 asks first when there is one to lose.
 *
 * The `user_id` filter is here for the same reason as in the read, and it is
 * belt and braces rather than the guard: the delete policy already restricts
 * this to the caller's own rows, so without the filter this would delete
 * *their* row for that model and nobody else's. Naming it keeps the statement
 * readable as what it is instead of as what RLS will make of it.
 */
/**
 * FR-5.1 — one note per marked watch, up to 2 000 characters (§6.3 checks the
 * bound; this only has to send it).
 *
 * An `update`, not an upsert, and that is the requirement rather than a
 * preference: a note belongs to a mark, so there is always a row to update. An
 * upsert here would let a note create a collection row with no status behind it
 * — a watch in the collection that is neither owned nor wished for, which the
 * schema permits and nothing in the product means.
 *
 * An empty note is stored as `null` rather than as `''`. FR-4.4 asks before
 * destroying a note, and it decides by asking whether one exists; two ways of
 * having no note means two answers to that question.
 */
export async function setCollectionNote(
  userId: string,
  modelId: string,
  note: string | null,
): Promise<void> {
  const supabase = await getSupabase()
  const { error } = await supabase
    .from(TABLE)
    .update({ note: note === null || note.trim() === '' ? null : note })
    .eq('user_id', userId)
    .eq('model_id', modelId)

  if (error) throw new Error(`collection: ${error.message}`)
}

/**
 * FR-5.4 — the note editor has to say, while somebody is typing, whether what
 * they type will be public. That is one boolean and it lives on `profiles`,
 * which M4 created and M8 makes editable.
 *
 * Returns `null` for a profile that is not there. The sign-up trigger creates
 * one for every account (§6.3), so absent means something went wrong rather than
 * something is new — and the safe reading of "I do not know if you are public"
 * is the one that warns.
 */
export interface Profile {
  id: string
  handle: string | null
  display_name: string | null
  is_public: boolean
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const supabase = await getSupabase()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, handle, display_name, is_public')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw new Error(`profile: ${error.message}`)
  return (data ?? null) as Profile | null
}

export async function removeCollectionItem(userId: string, modelId: string): Promise<void> {
  const supabase = await getSupabase()
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('user_id', userId)
    .eq('model_id', modelId)

  if (error) throw new Error(`collection: ${error.message}`)
}
