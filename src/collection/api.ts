import { getSupabase } from '../auth/supabase.ts'
import type { ProfileLink } from './profileFields.ts'

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
  /** D69 — the second consent. Meaningless without `is_public`; 0005 enforces the pair. */
  is_listed: boolean
  about: string | null
  location: string | null
  birth_year: number | null
  /** D71 — a data: URI, or null for initials. Written only by the Edge Function. */
  avatar: string | null
  owned_count: number
  wishlist_count: number
}

/**
 * The columns a client may *read* of its own row. `is_hidden` is deliberately
 * absent: it is the lever against the account, and a field that is present is a
 * field somebody renders later.
 */
const PROFILE_COLUMNS =
  'id, handle, display_name, is_public, is_listed, about, location, birth_year, avatar, owned_count, wishlist_count'

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const supabase = await getSupabase()
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', userId)
    .maybeSingle()

  if (error) throw new Error(`profile: ${error.message}`)
  return (data ?? null) as Profile | null
}

/**
 * FR-7.1 / FR-7.3 / FR-7.8 — the only fields a client may change on its own
 * profile, and **this list is the same list as 0005's column grant.**
 *
 * If the two ever disagree the database wins and the save fails, which is the
 * right way round: `avatar` is missing from both on purpose (D71), and adding it
 * here would produce a PATCH the database refuses rather than a picture.
 */
export interface ProfileUpdate {
  handle?: string | null
  display_name?: string | null
  is_public?: boolean
  is_listed?: boolean
  about?: string | null
  location?: string | null
  birth_year?: number | null
}

export async function updateProfile(userId: string, patch: ProfileUpdate): Promise<void> {
  const supabase = await getSupabase()
  const { error } = await supabase.from('profiles').update(patch).eq('id', userId)
  if (error) throw new Error(`profile: ${error.message}`)
}

/**
 * FR-7.2 — live availability, through a SECURITY DEFINER function rather than a
 * select.
 *
 * A signed-in user cannot read anybody else's profile row (§6.4), so there is
 * no query that answers this. The function answers exactly one bit and cannot
 * be used to enumerate handles: you have to already know the string to ask
 * about it.
 */
export async function isHandleAvailable(handle: string): Promise<boolean> {
  const supabase = await getSupabase()
  const { data, error } = await supabase.rpc('handle_available', { candidate: handle })
  if (error) throw new Error(`handle: ${error.message}`)
  return data === true
}

/**
 * FR-7.4 / FR-7.5 — a published profile by handle, for a visitor with no
 * session at all.
 *
 * **`null` covers both "no such handle" and "handle exists but is private",
 * and the caller cannot tell them apart.** That is the requirement, not an
 * accident of the return type: the `public profile readable` policy only
 * matches `is_public = true`, so a private profile is genuinely invisible
 * here rather than filtered out afterwards where a timing difference could
 * still leak it.
 */
/**
 * **This is an RPC and not a select, and D73 is why.**
 *
 * The `public profile readable` policy this used to lean on admitted every
 * published row to every caller — so one unfiltered PostgREST request returned
 * the whole directory, listed or not, with a key that is public by design (D14).
 * `is_listed` would then have been a filter the caller could decline to apply.
 * The policy is dropped; `profile_by_handle` is the only way in, and it decides
 * what leaves.
 *
 * `null` still covers both "no such handle" and "handle exists but is private",
 * and the caller still cannot tell them apart (FR-7.5) — the function returns
 * `null` for both rather than the component filtering afterwards, where a timing
 * difference could leak the distinction.
 */
export interface PublicProfile extends Profile {
  links: ProfileLink[]
  created_at: string
}

export async function fetchProfileByHandle(handle: string): Promise<PublicProfile | null> {
  const supabase = await getSupabase()
  const { data, error } = await supabase.rpc('profile_by_handle', { p_handle: handle })
  if (error) throw new Error(`profile: ${error.message}`)
  return (data ?? null) as PublicProfile | null
}

/**
 * FR-12.1 — the directory (D69).
 *
 * Every argument is clamped inside the function rather than here (S11): a limit
 * sent from a browser is a suggestion, and 0004's lesson was that an
 * unauthenticated function with an unbounded parameter is an enumeration tool.
 * What this end passes is what the UI wants; what it gets is what the database
 * allows.
 */
export interface Collector {
  handle: string
  display_name: string | null
  avatar: string | null
  owned_count: number
  created_at: string
}

export type CollectorSort = 'watches' | 'new'

export interface CollectorQuery {
  search?: string | undefined
  sort?: CollectorSort | undefined
  owns?: string | undefined
  limit?: number | undefined
  offset?: number | undefined
}

export async function fetchCollectors(query: CollectorQuery = {}): Promise<Collector[]> {
  const supabase = await getSupabase()
  const { data, error } = await supabase.rpc('collectors', {
    p_search: query.search?.trim() || null,
    p_sort: query.sort ?? 'watches',
    p_owns: query.owns ?? null,
    p_limit: query.limit ?? 24,
    p_offset: query.offset ?? 0,
  })
  if (error) throw new Error(`collectors: ${error.message}`)
  return (data ?? []) as Collector[]
}

/**
 * FR-3.8 — the collectors who own one watch and asked to be findable.
 *
 * No floor: each of them turned on two switches to be here and the fact is one
 * they published (D72). The floor belongs to the aggregate below, which counts
 * people who published nothing.
 */
export interface ListedOwner {
  handle: string
  display_name: string | null
  avatar: string | null
}

export async function fetchListedOwners(modelId: string, limit = 8): Promise<ListedOwner[]> {
  const supabase = await getSupabase()
  const { data, error } = await supabase.rpc('listed_owners', {
    p_model_id: modelId,
    p_limit: limit,
  })
  if (error) throw new Error(`owners: ${error.message}`)
  return (data ?? []) as ListedOwner[]
}

/**
 * FR-3.8 / D72 — how many, across every collection, from five upward.
 *
 * **Both counts come back `null` below the floor and the row is absent entirely
 * when neither passes it.** That is the shape to preserve: an absent count is
 * rendered as nothing at all, and a zero would be rendered as a fact.
 */
export interface ModelOwnerCount {
  model_id: string
  owned_count: number | null
  wishlist_count: number | null
}

export async function fetchModelOwnerCounts(modelIds: string[]): Promise<ModelOwnerCount[]> {
  const supabase = await getSupabase()
  const { data, error } = await supabase.rpc('model_owner_counts', { p_model_ids: modelIds })
  if (error) throw new Error(`counts: ${error.message}`)
  return (data ?? []) as ModelOwnerCount[]
}

/**
 * D70 — the links, read and written as a set rather than row by row.
 *
 * A person edits all of them on one screen and presses save once, so the write
 * is "these are my links now": delete what is gone, upsert what is there. Two
 * statements rather than a diff, because a diff computed in the browser against
 * a stale read is how a link nobody touched disappears.
 */
export async function fetchOwnLinks(userId: string): Promise<ProfileLink[]> {
  const supabase = await getSupabase()
  const { data, error } = await supabase
    .from('profile_links')
    .select('platform, handle')
    .eq('user_id', userId)
  if (error) throw new Error(`links: ${error.message}`)
  return (data ?? []) as ProfileLink[]
}

export async function replaceOwnLinks(userId: string, links: ProfileLink[]): Promise<void> {
  const supabase = await getSupabase()
  const keep = links.map((link) => link.platform)

  // Delete first. The reverse order would leave a removed platform in place for
  // as long as the upsert takes, and a failure between the two would leave it
  // there for good — whereas a failure after the delete loses a link the person
  // can retype, which is the cheaper of the two wrong states.
  const remove = supabase.from('profile_links').delete().eq('user_id', userId)
  const { error: deleteError } = await (keep.length > 0
    ? remove.not('platform', 'in', `(${keep.join(',')})`)
    : remove)
  if (deleteError) throw new Error(`links: ${deleteError.message}`)

  if (links.length === 0) return
  const { error } = await supabase
    .from('profile_links')
    .upsert(
      links.map((link) => ({ user_id: userId, platform: link.platform, handle: link.handle })),
      { onConflict: 'user_id,platform' },
    )
  if (error) throw new Error(`links: ${error.message}`)
}

/**
 * FR-7.9 / D71 — publish or withdraw the profile picture.
 *
 * The browser never sends an image. It asks the Edge Function to do it, and the
 * function is the only writer of that column — `authenticated` has no update
 * privilege on it, which is what stops this being an upload endpoint (S10).
 * Returns the data URI when there is one, so the caller can update the header
 * cache in the same round trip.
 */
export interface AvatarResult {
  /** The data URI, or null when the account has no picture to publish. */
  avatar: string | null
  /** Whether it reached `profiles.avatar`. `false` is an answer, not a failure. */
  stored: boolean
  /** Why it did not, where the function can say. */
  reason: string | null
}

export async function setAvatarPublished(published: boolean): Promise<AvatarResult> {
  const supabase = await getSupabase()
  const { data, error } = await supabase.functions.invoke<{
    avatar?: unknown
    stored?: unknown
    reason?: unknown
  }>('avatar', { method: 'POST', body: { store: published } })

  if (error) throw new Error(`avatar: ${error.message}`)

  /**
   * **Three outcomes, not two, and collapsing them cost a diagnostic round trip
   * on 2026-09-06.** The switch reported *something went wrong* when the
   * `avatar` function had simply never been deployed — a 404 arriving here like
   * any other error. Neither the reader nor the person who wrote the message
   * could act on it. So what comes back now is *what happened*: a picture that
   * was stored, no picture on the account at all, or a stated reason.
   */
  const value = data?.avatar
  return {
    avatar: typeof value === 'string' ? value : null,
    stored: data?.stored === true,
    reason: typeof data?.reason === 'string' ? data.reason : null,
  }
}

/**
 * FR-7.4 — somebody else's published rows. Same shape, different policy.
 *
 * **Owned only, and the filter is in the query for the same reason
 * `is_public = true` is.** The client's decision is that a published profile
 * shows a shelf and not a shopping list; asking for every row and hiding half of
 * them in the component would still put "what this person is saving up for" into
 * a stranger's browser, where it is one devtools tab away. The wishlist is
 * answered on the owner's own screen, by `fetchCollection`, and nowhere else.
 */
export async function fetchPublicCollection(userId: string): Promise<CollectionItem[]> {
  const supabase = await getSupabase()
  const { data, error } = await supabase
    .from(TABLE)
    .select(COLUMNS)
    .eq('user_id', userId)
    .eq('status', 'owned')
    .order('created_at', { ascending: false })

  if (error) throw new Error(`collection: ${error.message}`)
  return (data ?? []) as unknown as CollectionItem[]
}

/**
 * FR-9 / D22 — report a missing reference into the queue.
 *
 * There is no reading side to this and there never will be (FR-9.6): the table
 * has no select policy, so this function has no counterpart. FR-9.5's cap of
 * twenty is enforced by the insert policy, which means the refusal arrives as a
 * PostgREST error and the form has to turn it into a friendly sentence rather
 * than an error toast.
 */
export interface CatalogRequest {
  ref: string
  link?: string | undefined
  note?: string | undefined
}

export async function submitCatalogRequest(
  userId: string,
  request: CatalogRequest,
): Promise<void> {
  const supabase = await getSupabase()
  const { error } = await supabase.from('catalog_requests').insert({
    user_id: userId,
    ref: request.ref.trim(),
    link: request.link?.trim() || null,
    note: request.note?.trim() || null,
  })
  if (error) throw new Error(`request: ${error.message}`)
}

/**
 * FR-7.6 — irreversible, and it takes no argument.
 *
 * The row removed is `auth.uid()`'s because the function has no parameter to
 * point anywhere else. Everything cascades from `auth.users`, which is why this
 * is one call rather than a sequence the browser could half-finish.
 */
export async function deleteOwnAccount(): Promise<void> {
  const supabase = await getSupabase()
  const { error } = await supabase.rpc('delete_own_account')
  if (error) throw new Error(`account: ${error.message}`)
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
