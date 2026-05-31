-- ── Trigger: create portal_users row on invite ───────────────────
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into portal_users (id, email, client_id, role)
  values (
    new.id,
    new.email,
    (new.raw_user_meta_data->>'client_id')::uuid,
    coalesce(new.raw_user_meta_data->>'role', 'member')
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ── RPC: create_request (idempotent, atomic) ─────────────────────
create or replace function create_request(
  p_idempotency_key uuid,
  p_request_type    text,
  p_title           text,
  p_priority        text,
  p_due_date        date,
  p_payload         jsonb
) returns requests
language plpgsql security definer set search_path = public as $$
declare
  v_client uuid;
  v_prefix text;
  v_seq    integer;
  v_row    requests;
begin
  -- resolve caller's client from their auth identity
  select client_id into v_client from portal_users where id = auth.uid();
  if v_client is null then
    raise exception 'no_client_for_user' using hint = 'User has no associated client';
  end if;

  -- idempotency: if this key was used, return the original request
  select * into v_row from requests where idempotency_key = p_idempotency_key;
  if found then return v_row; end if;

  -- per-client reference sequence
  select ref_prefix into v_prefix from clients where id = v_client;
  update client_ref_counters
    set last_value = last_value + 1
    where client_id = v_client
    returning last_value into v_seq;
  if v_seq is null then
    insert into client_ref_counters(client_id, last_value) values (v_client, 1)
      returning last_value into v_seq;
  end if;

  insert into requests (
    reference, client_id, request_type, title, priority,
    idempotency_key, payload, due_date, created_by
  ) values (
    v_prefix || '-' || v_seq,
    v_client,
    p_request_type,
    p_title,
    coalesce(p_priority, 'High'),
    p_idempotency_key,
    coalesce(p_payload, '{}'::jsonb),
    p_due_date,
    auth.uid()
  )
  returning * into v_row;

  -- outbox event triggers Power Automate Flow A
  insert into outbox_events (event_type, request_id, payload)
  values (
    'REQUEST_CREATED',
    v_row.id,
    jsonb_build_object('reference', v_row.reference, 'request_type', p_request_type)
  );

  -- initial status history
  insert into status_history (request_id, to_status, source)
  values (v_row.id, 'SUBMITTED', 'PORTAL');

  return v_row;

exception when unique_violation then
  -- racing duplicate submit on same idempotency_key
  select * into v_row from requests where idempotency_key = p_idempotency_key;
  return v_row;
end $$;

grant execute on function create_request(uuid,text,text,text,date,jsonb) to authenticated;

-- ── RPC: add_comment (portal → ADO via outbox) ───────────────────
create or replace function add_comment(
  p_request_id uuid,
  p_body       text
) returns comments
language plpgsql security definer set search_path = public as $$
declare
  v_comment comments;
  v_author  text;
begin
  -- verify caller owns this request
  if not exists (
    select 1 from requests
    where id = p_request_id and client_id = auth_client_id()
  ) then
    raise exception 'access_denied';
  end if;

  select email into v_author from portal_users where id = auth.uid();

  insert into comments (request_id, source, author, body, visibility, origin_marker)
  values (
    p_request_id,
    'PORTAL',
    v_author,
    p_body,
    'public',
    'provana:portal:' || gen_random_uuid()
  )
  returning * into v_comment;

  -- outbox: Power Automate will post comment to ADO with origin_marker embedded
  insert into outbox_events (event_type, request_id, payload)
  values (
    'COMMENT_ADDED',
    p_request_id,
    jsonb_build_object('comment_id', v_comment.id, 'origin_marker', v_comment.origin_marker)
  );

  return v_comment;
end $$;

grant execute on function add_comment(uuid, text) to authenticated;

-- ── View: v_request_detail (joined for SPA detail page) ──────────
create or replace view v_request_detail
  with (security_invoker = on)
as
select
  r.*,
  wm.ado_work_item_id,
  wm.ado_url,
  wm.last_synced_at
from requests r
left join work_item_mappings wm on wm.request_id = r.id;

grant select on v_request_detail to authenticated;

-- ── Trigger: updated_at maintenance ──────────────────────────────
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger requests_updated_at
  before update on requests
  for each row execute function set_updated_at();

-- ── Immutable audit_log (revoke update/delete) ────────────────────
revoke update, delete, truncate on audit_log from authenticated;
