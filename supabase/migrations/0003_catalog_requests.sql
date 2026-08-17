-- M8 — catalog_requests: D22's work queue, and the last table this system has.
--
-- It is not catalogue data and it must never become catalogue data. A visitor
-- types a reference they could not find; a human reads the queue through the
-- service role, from outside the browser, and decides. Nothing a visitor types
-- reaches `catalog.json` without somebody looking at it (§10.8).
--
-- The interesting thing about this table is what it does NOT have: **a select
-- policy.** With RLS on, that absence IS the denial, and it is the whole of
-- FR-9.6 — "the user never sees a queue, a status, or anyone else's requests.
-- There is no reading side to this feature in the browser at all."
--
-- Writing a permissive select policy "so the user can see their own reports"
-- would be a reasonable-sounding change that breaks the design: a report is
-- fire-and-forget by decision, because a status column implies a process
-- nobody has promised to run.

create table public.catalog_requests (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  ref         text not null,
  link        text,
  note        text,
  created_at  timestamptz not null default now(),

  -- S5 — the bounds are the rule, not the form. The form is a convenience;
  -- this is what a compromised client meets.
  constraint ref_len  check (char_length(ref) between 2 and 40),
  constraint note_len check (note is null or char_length(note) <= 500),
  constraint link_shape check (
    link is null or link ~ '^https?://' and char_length(link) <= 500
  )
);

-- The same person reporting the same reference twice is a mistake, not a
-- report. `upper(ref)` because "ga-2100" and "GA-2100" are the same claim.
create unique index catalog_requests_user_ref_idx
  on public.catalog_requests (user_id, upper(ref));

-- The order a human works the queue in.
create index catalog_requests_open_idx on public.catalog_requests (created_at desc);

comment on table public.catalog_requests is
  'D22 work queue. Insert-only from the browser; read only through the service role. No select policy, deliberately (FR-9.6).';

-- Row Level Security ------------------------------------------------------------

alter table public.catalog_requests enable row level security;

-- FR-9.5's cap has to be counted, and a policy's own subquery cannot see rows
-- its table has no select policy for — so the count runs SECURITY DEFINER too.
-- This is the same shape as is_profile_public and for the same reason: a
-- policy that needs to read a table it is protecting has to step outside RLS
-- to do it, deliberately and in one named place.
create function public.open_request_count(uid uuid) returns integer
  language sql
  security definer
  stable
  set search_path = ''
as $$
  select count(*)::int from public.catalog_requests where user_id = uid;
$$;

comment on function public.open_request_count(uuid) is
  'SECURITY DEFINER so FR-9.5 can be counted by a policy on a table with no select policy.';

create policy "own requests insertable" on public.catalog_requests
  for insert with check (
    (select auth.uid()) = user_id
    and public.open_request_count((select auth.uid())) < 20
  );

-- No select, update or delete policy exists, and that is the feature.

-- Privileges ---------------------------------------------------------------------
--
-- `insert` and nothing else, to `authenticated` and nothing else. D22 requires
-- a session to report (FR-9.3), so `anon` gets nothing at all here — not even
-- the insert its policy would refuse anyway. Two gates, both shut.

grant insert on public.catalog_requests to authenticated;
grant execute on function public.open_request_count(uuid) to authenticated;

-- Handles -----------------------------------------------------------------------
--
-- FR-7.2 — availability has to be checkable before a handle is claimed, and a
-- signed-in user cannot read other people's profile rows to find out (§6.4).
-- So the check is a function rather than a query, and it answers exactly one
-- bit: taken, or not. It cannot be used to enumerate handles, because you have
-- to already know the string to ask about it.
--
-- Case-insensitive, matching profiles_handle_lower_idx from 0001. A profile
-- URL that differs only by case is a phishing surface, not a convenience.

create function public.handle_available(candidate text) returns boolean
  language sql
  security definer
  stable
  set search_path = ''
as $$
  select not exists (
    select 1 from public.profiles where lower(handle) = lower(candidate)
  );
$$;

comment on function public.handle_available(text) is
  'FR-7.2 live availability. One bit, and you must know the handle to ask (§6.4).';

grant execute on function public.handle_available(text) to authenticated;

-- Account deletion ----------------------------------------------------------------
--
-- FR-7.6 — irreversible, and it must actually remove the auth user so every
-- table cascades. A browser holding only the anon key cannot delete from
-- auth.users, and handing it a key that could would defeat every policy above.
--
-- SECURITY DEFINER, and it takes NO ARGUMENT: the row deleted is auth.uid()'s
-- and there is no parameter to point at somebody else. That is the difference
-- between a delete-my-account function and a delete-any-account function, and
-- it is one line.

create function public.delete_own_account() returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;
  delete from auth.users where id = (select auth.uid());
end;
$$;

comment on function public.delete_own_account() is
  'FR-7.6. Takes no argument on purpose: there is nobody else it could delete.';

revoke execute on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;
