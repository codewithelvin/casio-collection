-- M4 — the first migration: identity, and nothing else.
--
-- §14.5: schema changes are files applied in order and **no schema change is
-- ever made by hand in the dashboard**. The migration is the record; a table
-- someone typed into the SQL editor exists in exactly one project and nobody
-- can tell you why.
--
-- D14 makes the pairing here non-negotiable: RLS is enabled and the policies
-- are created **in the same migration as the table**, before any data exists.
-- The anon key is public and always was, so a table that is briefly readable is
-- a table that was briefly public to the whole internet.
--
-- `collection_items` and `catalog_requests` are specified in §6.3 and are
-- deliberately not here. They arrive with the milestones that use them (M5, M8),
-- each with its own policies, for the same reason.

-- profiles --------------------------------------------------------------------
--
-- One row per account, created by the trigger below and never by a client.
-- `handle` and `is_public` are M8's; they are in the table from the start
-- because adding a uniquely-indexed column to a live table later is a migration
-- with a lock in it, and because the check constraints are the specification.

create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  handle        text unique,
  display_name  text,
  is_public     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- S5 — the bounds are enforced here and not only in the form. The form is a
  -- convenience; this is the rule, and it is what a compromised client meets.
  constraint handle_shape check (
    handle is null or handle ~ '^[a-z0-9][a-z0-9_-]{2,29}$'
  ),
  constraint display_name_len check (
    display_name is null or char_length(display_name) <= 60
  ),
  -- Publishing without a handle would produce a public profile at no address.
  constraint public_needs_handle check (is_public = false or handle is not null)
);

-- `handle` is already unique; this makes it unique **case-insensitively**, so
-- `Elvin` and `elvin` cannot both be claimed. A profile URL that differs only
-- by case is a phishing surface, not a convenience.
create unique index profiles_handle_lower_idx on public.profiles (lower(handle));

comment on table public.profiles is
  'One row per account. Created by on_auth_user_created; never inserted by a client (D14, §6.4).';

-- updated_at -------------------------------------------------------------------
--
-- A column the client can set is a column the client will set wrongly. This is
-- shared: collection_items gets the same trigger at M5.

create function public.set_updated_at() returns trigger
  language plpgsql
  security invoker
  set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- The sign-up trigger -----------------------------------------------------------
--
-- §6.3. This is the *only* way a profile row is created, which is what makes it
-- safe for §6.4 to have no insert policy at all: `id` can never be chosen by a
-- client, so nobody can create a profile for somebody else's user.
--
-- SECURITY DEFINER because it writes to a table the signing-up user has no
-- insert privilege on, and `set search_path = ''` because a definer function
-- that resolves names through the caller's search_path is the classic Postgres
-- privilege-escalation shape. Every name below is schema-qualified for the
-- same reason.
--
-- `full_name` is what Google's OIDC profile claim lands in. It is absent for a
-- magic-link sign-up (§9.2) and that is fine: display_name is nullable and
-- unknown renders as itself.

create function public.handle_new_user() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data->>'full_name')
  -- Belt and braces. A repeated insert should never happen, and if it ever does
  -- it must not fail the sign-up itself — an account that cannot be created
  -- because its profile row already exists is unrecoverable from the browser.
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row Level Security ------------------------------------------------------------
--
-- D14 — RLS is the only access control this system has. The anon key is public
-- by design, so every table denies by default and says so explicitly.
--
-- `auth.uid()` is wrapped in `(select …)` in every policy so Postgres evaluates
-- it once per statement as an InitPlan rather than once per row. On a 400-row
-- collection that is one call instead of four hundred (§6.4).

alter table public.profiles enable row level security;

create policy "own profile readable" on public.profiles
  for select using ((select auth.uid()) = id);

-- FR-7.4 — a published profile is readable by anyone, including signed-out
-- visitors. That is the whole of what `is_public` means.
create policy "public profile readable" on public.profiles
  for select using (is_public = true);

create policy "own profile writable" on public.profiles
  for update using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- There is deliberately **no insert policy and no delete policy**. Rows arrive
-- through the trigger above and leave when auth.users cascades. With RLS on,
-- the absence of a policy is the denial — nothing further needs saying, and
-- writing a permissive one "for later" is how it stops being true.

-- Privileges ---------------------------------------------------------------------
--
-- Supabase's default privileges already grant these; they are written out
-- because a grant that exists only as a project setting is a grant that differs
-- between the production project and CI's (§14.5), and the difference would show
-- up as a test that passes in one and not the other.
--
-- Privileges and policies are two separate gates and both have to allow a
-- statement. These are the wide one; the policies above are the narrow one.

grant select on public.profiles to anon;
grant select, update on public.profiles to authenticated;
