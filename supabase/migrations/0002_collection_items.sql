-- M5 — collection_items: the table the whole product is about.
--
-- §14.5 said this one is deliberately not in 0001. A table arrives with the
-- milestone that uses it, carrying its own policies, because D14 pairs the two
-- in one file and a table created early is a table briefly readable by the
-- whole internet.
--
-- D8 and D24 are what keep it this small. One row per (user, model), a status
-- and a note — no quantity, no price, no purchase date, no second copy of the
-- same reference. Everything a collector might want to record about *this
-- particular watch of mine* goes in the note, on purpose.

create type public.collection_status as enum ('owned', 'wishlist');

create table public.collection_items (
  user_id     uuid not null references auth.users(id) on delete cascade,
  model_id    text not null,
  status      public.collection_status not null,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- D8 — one row per (user, model), so *owned* and *wishlist* cannot both be
  -- true of the same watch. Marking a wishlisted watch owned moves it, and the
  -- primary key is what makes that a property of the schema rather than of the
  -- client remembering to delete the other row.
  primary key (user_id, model_id),

  -- D1 puts the catalogue in a file, so there is nothing here to reference and
  -- `model_id` is checked by **shape**. This constraint is the only thing
  -- between the table and arbitrary strings from a compromised client (§6.3),
  -- and it is the same pattern the browser's pending-intent slot validates
  -- against before a press ever survives a sign-in.
  constraint model_id_shape check (model_id ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  constraint note_len check (note is null or char_length(note) <= 2000)
);

-- FR-6.2 — each tab is one status ordered by date added, newest first. The
-- three columns are in the order the query filters and sorts them.
create index collection_items_user_status_idx
  on public.collection_items (user_id, status, created_at desc);

comment on table public.collection_items is
  'One row per (user, model). D8: status moves, it does not duplicate. D24: no quantity, price or dates.';

-- The shared trigger from 0001. `updated_at` is not a column a client may set,
-- and the way to guarantee that is to have the database write it.
create trigger collection_items_set_updated_at
  before update on public.collection_items
  for each row execute function public.set_updated_at();

-- Publicness ------------------------------------------------------------------
--
-- §6.4 — resolved through a SECURITY DEFINER function rather than an inline
-- subquery, for two reasons that both bite. A subquery inside a policy is
-- itself subject to the referenced table's RLS, so `select is_public from
-- profiles where id = user_id` would be filtered by the profiles policies and
-- return nothing for a reader who is not that user — which is every reader this
-- is for. And it is re-planned per row, where this is stable and indexed.
--
-- It arrives here rather than in 0001 because this is the policy that needs it.

create function public.is_profile_public(uid uuid) returns boolean
  language sql
  security definer
  stable
  set search_path = ''
as $$
  select coalesce((select is_public from public.profiles where id = uid), false);
$$;

comment on function public.is_profile_public(uuid) is
  'SECURITY DEFINER so a policy can read is_public past the profiles RLS (§6.4).';

-- Row Level Security ------------------------------------------------------------
--
-- D14 — RLS is the only access control this system has, and the anon key is
-- public by design. Five policies, each naming one verb, because a single
-- `for all` policy hides which of the four it is actually granting.
--
-- `auth.uid()` is wrapped in `(select …)` throughout so Postgres evaluates it
-- once per statement as an InitPlan rather than once per row. On a 400-row
-- collection that is one call instead of four hundred (§6.4).

alter table public.collection_items enable row level security;

create policy "own items readable" on public.collection_items
  for select using ((select auth.uid()) = user_id);

-- FR-7.4 — a published collection is readable by anyone, including signed-out
-- visitors. This is the policy that makes /u/<handle> work with no session, and
-- it is also why every client read filters by user_id explicitly: with this
-- policy in place an unfiltered select returns every *public* user's rows too.
create policy "public items readable" on public.collection_items
  for select using (public.is_profile_public(user_id));

create policy "own items insertable" on public.collection_items
  for insert with check ((select auth.uid()) = user_id);

-- Both halves are needed and they say different things. USING decides which
-- rows are visible to update; WITH CHECK decides what they may become. Without
-- the second, a user could update their own row and set user_id to somebody
-- else's — handing over a row rather than editing one.
create policy "own items updatable" on public.collection_items
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "own items deletable" on public.collection_items
  for delete using ((select auth.uid()) = user_id);

-- Privileges ---------------------------------------------------------------------
--
-- Written out for the same reason as 0001's: a grant that exists only as a
-- project setting is a grant that differs between the production project and
-- CI's, and the difference shows up as a test that passes in one and not the
-- other. Privileges and policies are two separate gates and both must allow a
-- statement — these are the wide gate, the policies above are the narrow one.
--
-- `anon` gets select and nothing else: a signed-out visitor reads published
-- collections (FR-7.4) and can write nothing anywhere.

grant select on public.collection_items to anon;
grant select, insert, update, delete on public.collection_items to authenticated;

grant execute on function public.is_profile_public(uuid) to anon, authenticated;
