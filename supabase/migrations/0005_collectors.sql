-- 0005 — collectors. M11, and D69 through D73.
--
-- Five decisions arrive in one file because they are one feature: a page where
-- you can find other people, the things a profile may say about its owner, the
-- picture beside a name, the count on a watch, and the read path that makes the
-- first of those enforceable rather than merely polite.
--
-- IT IS ONE FILE FOR A SECOND REASON. D72's counters cannot be created without
-- their backfill beside them: a counter that starts wrong is a counter no later
-- run can correct, because nothing afterwards can tell which rows were missed.
-- `recount_all()` is therefore defined here and called here.
--
-- Read 0004 before changing any grant below. Its finding governs this whole
-- file: **a `grant` only ever adds.** Supabase's default privileges hand `anon`
-- and `authenticated` every verb on a new table, and Postgres hands `PUBLIC`
-- execute on a new function, so the narrowing is always a `revoke` and never a
-- more precise `grant`.

-- profiles: the new columns ---------------------------------------------------
--
-- D69 — `is_listed` is a SECOND consent and not a re-reading of the first.
-- `is_public` keeps meaning *anyone with the link may read this*; `is_listed`
-- means *and you may put me where somebody finds me without one*. D45 already
-- drew that distinction about Google, and a directory on our own site is the
-- same question asked again.
--
-- D71 — `avatar` is a data: URI and is absent from the update grant at the
-- bottom of this file. That absence is the whole defence: were it writable by
-- `authenticated`, a client could PATCH any 12 KB image it liked into a column
-- this site renders on a public page, which is unmoderated image hosting
-- arrived at by accident. Only the `avatar` Edge Function writes it, with the
-- service-role key, from bytes it fetched off a named Google host itself.

alter table public.profiles
  add column is_listed  boolean not null default false,
  add column about      text,
  add column location   text,
  add column birth_year smallint,
  add column avatar     text,
  -- D72's denormalised pair. Maintained by the trigger below and by nothing
  -- else; not writable by the account they describe (S9).
  add column owned_count    integer not null default 0,
  add column wishlist_count integer not null default 0,
  -- The moderation lever D69 says to add now rather than later. A directory is
  -- the first surface here where one person's words reach another with nothing
  -- in between, and adding this column afterwards means editing every policy
  -- below rather than adding a column.
  add column is_hidden boolean not null default false,

  -- S5 — the bounds are the specification, and the form is a convenience.
  add constraint about_len    check (about    is null or char_length(about)    <= 500),
  add constraint location_len check (location is null or char_length(location) <=  60),

  -- D70 — shape only. "Not in the future" is the trigger below and deliberately
  -- not a check: a constraint containing now() is not immutable, and a database
  -- dumped today and restored in five years would refuse to reload.
  add constraint birth_year_shape check (birth_year is null or birth_year >= 1900),

  -- S4 — a column rendered into an <img src> is a stored-XSS sink, so the shape
  -- is a rule and not a convention: no data:text/html, no javascript:, no remote
  -- URL. This mirrors isPublishableDataUri() in src/auth/avatar.ts at half the
  -- length. 12 KB rather than the function's 24 KB because the directory renders
  -- twenty-four of these at once, and 24 KB each is 576 KB of base64 on one
  -- screen (D71).
  add constraint avatar_shape check (
    avatar is null or (
      avatar ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$'
      and char_length(avatar) <= 12288
    )
  ),

  -- Listing something nobody may read is not a state worth having, and the
  -- pair is enforced here rather than in the form for the same reason as above.
  add constraint listed_needs_public check (is_listed = false or is_public = true);

comment on column public.profiles.avatar is
  'D71 — a data: URI written ONLY by the avatar Edge Function with the service '
  'role. Never add this column to the update grant: doing so turns the site into '
  'unmoderated image hosting.';

-- D70 — the future-birth-year rule, as a trigger for the reason above.
create function public.profiles_validate() returns trigger
  language plpgsql
  security invoker
  set search_path = ''
as $$
begin
  if new.birth_year is not null and new.birth_year > extract(year from now())::int then
    raise exception 'birth_year % is in the future', new.birth_year
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger profiles_validate_before
  before insert or update on public.profiles
  for each row execute function public.profiles_validate();

-- profile_links ----------------------------------------------------------------
--
-- D70 — **a link is a platform and a handle, never a URL.** FR-5.3 already
-- refuses to parse links out of a note, because this site renders user-authored
-- text on a public page. One free URL field is `javascript:`, an open redirect,
-- a link farm and a phishing target in a single input. A platform enum plus a
-- handle shape is none of them: the site builds the address and the person
-- supplies only the last segment of it.
--
-- `website` is the single exception and takes a whole address, shaped exactly as
-- catalog_requests.link already is.

-- Eight, and the absence is deliberate: a forum like watchuseek names members
-- with a numeric id (`/members/name.12345/`) that a handle cannot produce, so
-- the site could not build the address — which is the one thing every entry here
-- must let it do. A forum profile goes in `website`.
create type public.link_platform as enum (
  'instagram', 'x', 'reddit', 'youtube', 'tiktok', 'facebook', 'github', 'website'
);

create table public.profile_links (
  user_id  uuid not null references public.profiles(id) on delete cascade,
  platform public.link_platform not null,
  handle   text not null,
  -- One per platform, which is also the cap: nine rows maximum per person, with
  -- no counter and no policy subquery to enforce it. FR-9.5 needed a SECURITY
  -- DEFINER count because a request has no natural key; this has one.
  primary key (user_id, platform),
  constraint handle_shape check (
    case when platform = 'website'
      then handle ~ '^https://[a-z0-9.-]+\.[a-z]{2,}(/[^\s]*)?$'
           and char_length(handle) <= 200
      else handle ~ '^[A-Za-z0-9._-]{1,40}$'
    end
  )
);

comment on table public.profile_links is
  'D70 — platform + handle. The site builds the href; nothing here is ever '
  'rendered as a URL the person typed.';

-- model_counts -----------------------------------------------------------------
--
-- D72, and §18.1's design as it was written three weeks before it was asked for.
-- Nothing reads this table directly — not anon, not authenticated, not the
-- browser. The floor of five lives in model_owner_counts() below, so there is
-- exactly one thing to get right.

create table public.model_counts (
  model_id       text primary key,
  owned_count    integer not null default 0,
  wishlist_count integer not null default 0,
  updated_at     timestamptz not null default now(),
  constraint model_id_shape check (model_id ~ '^[a-z0-9][a-z0-9-]{1,63}$')
);

-- The counters, and the two things that keep them honest -----------------------
--
-- Clamped at zero rather than constrained above it. A check constraint here
-- would fire during an account deletion cascade and block it — turning a
-- bookkeeping disagreement into an account somebody cannot delete, which is a
-- far worse failure than a count that is one too low until recount_all() runs.

create function public.adjust_counts(
  p_user   uuid,
  p_model  text,
  p_status public.collection_status,
  p_delta  integer
) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  -- The DO UPDATE reads p_delta directly rather than `excluded`, and that is
  -- the difference between this being right and being right only for inserts:
  -- the VALUES row has to be clamped at zero so a decrement against a missing
  -- row cannot write -1, which means `excluded` carries 0 for every decrement.
  -- A plpgsql parameter is in scope for the whole statement; use it.
  insert into public.model_counts (model_id, owned_count, wishlist_count)
  values (
    p_model,
    greatest(0, case when p_status = 'owned'    then p_delta else 0 end),
    greatest(0, case when p_status = 'wishlist' then p_delta else 0 end)
  )
  on conflict (model_id) do update set
    owned_count = greatest(
      0, model_counts.owned_count + case when p_status = 'owned' then p_delta else 0 end),
    wishlist_count = greatest(
      0, model_counts.wishlist_count + case when p_status = 'wishlist' then p_delta else 0 end),
    updated_at = now();

  update public.profiles set
    owned_count    = greatest(0, owned_count    + case when p_status = 'owned'    then p_delta else 0 end),
    wishlist_count = greatest(0, wishlist_count + case when p_status = 'wishlist' then p_delta else 0 end)
   where id = p_user;
end;
$$;

create function public.bump_counts() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.adjust_counts(new.user_id, new.model_id, new.status, 1);
  elsif tg_op = 'DELETE' then
    perform public.adjust_counts(old.user_id, old.model_id, old.status, -1);
  else
    -- **The guard matters.** FR-5.2's note editor updates this row on a debounce
    -- while somebody types, and without this every keystroke that reaches the
    -- network would be two upserts into model_counts for no change at all.
    if old.status is distinct from new.status or old.model_id is distinct from new.model_id then
      perform public.adjust_counts(old.user_id, old.model_id, old.status, -1);
      perform public.adjust_counts(new.user_id, new.model_id, new.status, 1);
    end if;
  end if;
  return null;
end;
$$;

create trigger collection_items_bump_counts
  after insert or update or delete on public.collection_items
  for each row execute function public.bump_counts();

-- The backfill, and the reconciliation, which are the same function.
create function public.recount_all() returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  delete from public.model_counts;

  insert into public.model_counts (model_id, owned_count, wishlist_count)
  select i.model_id,
         count(*) filter (where i.status = 'owned')::int,
         count(*) filter (where i.status = 'wishlist')::int
    from public.collection_items i
   group by i.model_id;

  update public.profiles p set owned_count = 0, wishlist_count = 0;

  update public.profiles p set
    owned_count    = c.owned,
    wishlist_count = c.wish
    from (
      select i.user_id,
             count(*) filter (where i.status = 'owned')::int    as owned,
             count(*) filter (where i.status = 'wishlist')::int as wish
        from public.collection_items i
       group by i.user_id
    ) c
   where c.user_id = p.id;
end;
$$;

select public.recount_all();

-- Indexes ------------------------------------------------------------------------
--
-- collection_items is keyed (user_id, model_id), so *every* query added by this
-- migration reads it the wrong way round — by model, not by user. Without the
-- first index, listed_owners() on a popular watch is a sequential scan.

create index collection_items_model_owned_idx
  on public.collection_items (model_id) where status = 'owned';

-- The directory's default order, as a partial index over its only predicate.
-- The column list is the ORDER BY of `collectors()` verbatim — an index that is
-- *nearly* the sort order is an index the planner ignores, and the second key
-- being `created_at` rather than `handle` is exactly the kind of near miss that
-- looks right in a migration and never gets used.
create index profiles_directory_idx
  on public.profiles (owned_count desc, created_at desc, handle)
  where is_public and is_listed and not is_hidden;

-- D73 — the read path ------------------------------------------------------------
--
-- **`is_listed` is not a setting unless the database is the thing enforcing it.**
--
-- With `public profile readable` in place and select granted to anon, one
-- PostgREST request returns every published profile in the project. A directory
-- that filters on is_listed in its query is therefore filtering a list the
-- caller can simply ask for unfiltered, with a key that is public by design
-- (D14). That is a rule that holds for our client and for nobody else.
--
-- It cannot be answered inside the policy either: RLS is asked "may this caller
-- see this row", and it cannot tell *one profile by handle* from *all of them*.
-- So the read moves to two functions that can see the difference.

drop policy "public profile readable" on public.profiles;

-- is_profile_public is what `collection_items`' public policy resolves through,
-- and it has to learn about is_hidden or hiding an account would leave its
-- collection readable while its profile 404s.
create or replace function public.is_profile_public(uid uuid) returns boolean
  language sql
  security definer
  stable
  set search_path = ''
as $$
  select coalesce(
    (select p.is_public and not p.is_hidden from public.profiles p where p.id = uid),
    false);
$$;

-- FR-7.4 / FR-7.5 — a published profile by handle, listed or not.
--
-- Returns null for "no such handle" AND for "exists but is private", and the
-- caller cannot tell them apart. That is the requirement rather than an accident
-- of the return type: distinguishing them tells a stranger that a person exists
-- and has chosen not to be public, which is the fact the setting was turned off
-- to keep.
--
-- `id` is included because the public collection is still read from
-- collection_items by user_id, under a policy this does not replace.
create function public.profile_by_handle(p_handle text) returns jsonb
  language sql
  security definer
  stable
  set search_path = ''
as $$
  select to_jsonb(x) from (
    select p.id, p.handle, p.display_name, p.is_public, p.is_listed,
           p.about, p.location, p.birth_year, p.avatar,
           p.owned_count, p.wishlist_count, p.created_at,
           coalesce(
             (select jsonb_agg(
                       jsonb_build_object('platform', l.platform, 'handle', l.handle)
                       order by l.platform)
                from public.profile_links l
               where l.user_id = p.id),
             '[]'::jsonb) as links
      from public.profiles p
     where lower(p.handle) = lower(p_handle)
       and p.is_public
       and not p.is_hidden
  ) x;
$$;

-- FR-12.1 — the directory. Only listed, unhidden, published rows leave here.
create function public.collectors(
  p_search text    default null,
  p_sort   text    default 'watches',
  p_owns   text    default null,
  p_limit  integer default 24,
  p_offset integer default 0
) returns table (
  handle       text,
  display_name text,
  avatar       text,
  owned_count  integer,
  created_at   timestamptz
)
  language sql
  security definer
  stable
  set search_path = ''
as $$
  select p.handle, p.display_name, p.avatar, p.owned_count, p.created_at
    from public.profiles p
   where p.is_public and p.is_listed and not p.is_hidden
     and (
       p_search is null or p_search = '' or
       p.handle ilike '%' || p_search || '%' or
       p.display_name ilike '%' || p_search || '%'
     )
     and (
       p_owns is null or exists (
         select 1 from public.collection_items i
          where i.user_id = p.id and i.model_id = p_owns and i.status = 'owned'
       )
     )
   order by
     case when p_sort = 'new' then null else p.owned_count end desc nulls last,
     p.created_at desc,
     p.handle
   -- S11 — every parameter an anonymous caller supplies is clamped HERE, not in
   -- the client. 0004 found handle_available answering unauthenticated callers
   -- one bit at a time with no rate limit; an unbounded page size is the same
   -- shape with more rows per request.
   offset least(greatest(coalesce(p_offset, 0), 0), 5000)
   limit  least(greatest(coalesce(p_limit, 24), 1), 48);
$$;

-- FR-3.8 / D72 — the count, floored at five.
--
-- The floor counts every collection, public and private, because otherwise it is
-- not an answer to *how many people own this*. Five is not a matter of taste: a
-- small aggregate beside a directory that lists everybody visible is arithmetic
-- — if the page says four and three of them are named above it, the fourth is a
-- private collection a stranger has just learned something about.
create function public.model_owner_counts(p_model_ids text[])
  returns table (model_id text, owned_count integer, wishlist_count integer)
  language sql
  security definer
  stable
  set search_path = ''
as $$
  select c.model_id,
         case when c.owned_count    >= 5 then c.owned_count    end,
         case when c.wishlist_count >= 5 then c.wishlist_count end
    from public.model_counts c
   -- Bounded for the same reason collectors() is bounded: an array parameter on
   -- an unauthenticated function is an enumeration tool unless it has a ceiling.
   where c.model_id = any(p_model_ids[1:100])
     and (c.owned_count >= 5 or c.wishlist_count >= 5);
$$;

-- FR-3.8 — the named owners, who need no floor at all: each of them turned on
-- two switches to be there, and the fact is one they published. What changes for
-- them is only the direction it is reached from.
--
-- A definer function rather than a select through RLS, for the reason §6.4
-- already gives about is_profile_public(): a policy subquery is re-planned per
-- row, so a watch with ten thousand owners would evaluate it ten thousand times
-- in order to return eight names.
create function public.listed_owners(p_model_id text, p_limit integer default 8)
  returns table (handle text, display_name text, avatar text)
  language sql
  security definer
  stable
  set search_path = ''
as $$
  select p.handle, p.display_name, p.avatar
    from public.collection_items i
    join public.profiles p on p.id = i.user_id
   where i.model_id = p_model_id
     and i.status = 'owned'
     and p.is_public and p.is_listed and not p.is_hidden
   order by p.owned_count desc, p.handle
   limit least(greatest(coalesce(p_limit, 8), 1), 24);
$$;

-- Row Level Security ---------------------------------------------------------------

alter table public.profile_links enable row level security;

create policy "own links readable" on public.profile_links
  for select using ((select auth.uid()) = user_id);
create policy "own links writable" on public.profile_links
  for all using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
-- **No public select policy**, deliberately. A published profile's links travel
-- inside profile_by_handle()'s answer, so there is no row here for anybody to
-- enumerate and no second place for is_hidden to be forgotten.

alter table public.model_counts enable row level security;
-- And no policy at all. With RLS on, the absence of one is the denial — the same
-- sentence 0003 wrote about catalog_requests, and the reason the floor cannot be
-- read around.

-- Privileges -----------------------------------------------------------------------
--
-- 0004's lesson, applied up front this time instead of two months late.

revoke select, insert, update, delete on public.profile_links from anon;
grant  select, insert, update, delete on public.profile_links to authenticated;

revoke select, insert, update, delete on public.model_counts from anon, authenticated;

-- The counter machinery is called by the trigger, which runs as its owner. No
-- client ever calls these, and adjust_counts in particular would let a caller
-- write any number it liked into any profile.
revoke execute on function
  public.adjust_counts(uuid, text, public.collection_status, integer),
  public.bump_counts(),
  public.recount_all(),
  public.profiles_validate()
  from public, anon, authenticated;

-- The four readers. Granted to anon on purpose: a directory behind a sign-in is
-- not a directory, and a count with a sign-in in front of it is not a count.
revoke execute on function
  public.profile_by_handle(text),
  public.collectors(text, text, text, integer, integer),
  public.model_owner_counts(text[]),
  public.listed_owners(text, integer)
  from public, anon;

grant execute on function
  public.profile_by_handle(text),
  public.collectors(text, text, text, integer, integer),
  public.model_owner_counts(text[]),
  public.listed_owners(text, integer)
  to anon, authenticated;

-- S9 — the writable surface of profiles is a list of columns, not the table.
--
-- `revoke` first, because a grant only ever adds (0004). Absent on purpose:
-- owned_count and wishlist_count, because a counter its own owner can edit is a
-- number nobody should read and this directory sorts by one of them; is_hidden,
-- because it is the lever against the person it describes; created_at and
-- updated_at, which are the database's; and **avatar**, for the larger reason in
-- its column comment above.
revoke update on public.profiles from authenticated;
grant  update (handle, display_name, is_public, is_listed, about, location, birth_year)
  on public.profiles to authenticated;
