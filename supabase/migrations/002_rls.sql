-- ── Helper: caller's client_id (stable, security definer) ────────
create or replace function auth_client_id() returns uuid
language sql stable security definer set search_path = public as $$
  select client_id from portal_users where id = auth.uid()
$$;

-- ── Enable RLS ────────────────────────────────────────────────────
alter table requests       enable row level security;
alter table status_history enable row level security;
alter table comments       enable row level security;
alter table attachments    enable row level security;

-- ── requests ──────────────────────────────────────────────────────
-- Members read only their client's requests
create policy req_select on requests for select
  using (client_id = auth_client_id());

-- Inserts go only through create_request() (security definer); block direct inserts
create policy req_no_direct_insert on requests for insert
  with check (false);

-- No direct updates from browser (Power Automate uses service role)
create policy req_no_direct_update on requests for update
  using (false);

-- ── status_history ────────────────────────────────────────────────
create policy hist_select on status_history for select
  using (
    exists (
      select 1 from requests r
      where r.id = status_history.request_id
        and r.client_id = auth_client_id()
    )
  );

-- ── comments ──────────────────────────────────────────────────────
-- Only public comments visible to clients; internal comments never exposed
create policy comment_select on comments for select
  using (
    visibility = 'public'
    and exists (
      select 1 from requests r
      where r.id = comments.request_id
        and r.client_id = auth_client_id()
    )
  );

-- ── attachments ───────────────────────────────────────────────────
create policy attach_select on attachments for select
  using (
    exists (
      select 1 from requests r
      where r.id = attachments.request_id
        and r.client_id = auth_client_id()
    )
  );

-- ── Grant anon/authenticated roles on public schema ───────────────
grant usage on schema public to anon, authenticated;
grant select on requests, status_history, comments, attachments to authenticated;
grant execute on function auth_client_id() to authenticated;
