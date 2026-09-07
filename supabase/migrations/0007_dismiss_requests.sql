-- 0007 — the admin may clear a reference off D22's queue once it is dealt with.
--
-- D79 gave the queue a reader and stopped there, so the only way to work it was
-- to remember what had already been done. A queue you cannot cross things off is
-- a queue that grows until it is ignored, which is the same ending as one nobody
-- can read — slower, and with a person's attention as the thing that fails.
--
-- **This does not contradict D22.** That decision says the table is "insert-only
-- for its author and unreadable by any client", and both halves survive: the
-- author still has insert and nothing else, and the client that can call this is
-- the same single account D79 named. What is new is that the maintainer's side
-- gained a verb.
--
-- WHY A HARD DELETE AND NOT A `done` COLUMN
--
-- A status column is the obvious alternative and it is worse here. It would put
-- state on a row that FR-9.6 promises the reporter can never see, so the queue
-- would start carrying a workflow nobody has agreed to run; the reader would
-- then need a filter, the filter would need a default, and a request "closed" by
-- mistake would be invisible in exactly the way an unread queue already was.
-- Deleting is honest: the row is gone, the count drops, and the page shows what
-- is actually outstanding.
--
-- **The side effect is deliberate.** `catalog_requests_user_ref_idx` is unique on
-- (user_id, upper(ref)), so deleting a person's row lets that person report the
-- same reference again. That is correct rather than tolerated: if a watch is
-- still missing six months after somebody was told a person would look at it,
-- their saying so a second time is new information and not a duplicate.

-- Takes explicit ids rather than a reference, and that is the whole interface
-- decision. The page groups rows by a *normalised* reference — uppercased with
-- separators stripped, so `GA-2100-1A1` and `ga2100 1a1` are one line — and that
-- normalisation lives in `requestQueue.ts` where it is tested. Reimplementing it
-- in SQL would give two definitions of "the same reference" that agree until the
-- day they do not, and the day they do not, this deletes the wrong rows.
--
-- So the caller names exactly the rows it is showing. Nothing is inferred here.
create function public.dismiss_catalog_requests(p_ids bigint[])
  returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  removed integer;
begin
  -- The guard is inside the function rather than in a policy for D79's reason:
  -- RLS answers "may this caller see this row", and every row here has the same
  -- answer for the same person. `is_admin()` reads auth.uid() server-side, so a
  -- caller who edits the client cannot reach this.
  if not public.is_admin() then
    return 0;
  end if;

  delete from public.catalog_requests where id = any(p_ids);
  get diagnostics removed = row_count;
  return removed;
end;
$$;

-- **Returns a count, and the count is load-bearing.** A refused caller and a
-- caller naming ids that are already gone both get 0, and the screen treats them
-- the same way — refetch and show what is actually there. What it must never do
-- is assume: a delete that reports success and removed nothing is how a queue
-- starts lying about its own length, which is the failure D79 was written to end
-- and would be a poor thing to reintroduce two migrations later.

revoke execute on function public.dismiss_catalog_requests(bigint[])
  from public, anon;
grant  execute on function public.dismiss_catalog_requests(bigint[])
  to authenticated;

-- Not granted on the table. 0004 revoked delete from anon and authenticated and
-- that stays true — this function is the only delete path, and it carries the
-- identity check that a table grant could not.
