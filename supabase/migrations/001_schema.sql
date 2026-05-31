-- ── Reference data ────────────────────────────────────────────────
create table clients (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  ref_prefix  text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table portal_users (
  id         uuid primary key references auth.users(id) on delete cascade,
  client_id  uuid not null references clients(id),
  email      text not null,
  role       text not null default 'member'
             check (role in ('member','admin')),
  created_at timestamptz not null default now()
);

create table request_types (
  key                text primary key,
  display_name       text not null,
  ado_work_item_type text not null,
  ado_area_path      text not null,
  is_live            boolean not null default true
);

-- ── Core ──────────────────────────────────────────────────────────
create table requests (
  id              uuid primary key default gen_random_uuid(),
  reference       text not null unique,
  client_id       uuid not null references clients(id),
  request_type    text not null references request_types(key),
  title           text not null,
  priority        text not null default 'High'
                  check (priority in ('High','Highest')),
  status          text not null default 'SUBMITTED'
                  check (status in (
                    'SUBMITTED','IN REVIEW','IN DEVELOPMENT',
                    'CUSTOMER FEEDBACK','UAT','APPROVED','RESOLVED',
                    'CLOSED','REJECTED','ON HOLD','CREATE FAILED'
                  )),
  idempotency_key uuid not null unique,
  payload         jsonb not null default '{}'::jsonb,
  due_date        date,
  created_by      uuid references portal_users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on requests (client_id, status);
create index on requests (client_id, created_at desc);

create table work_item_mappings (
  request_id       uuid primary key references requests(id) on delete cascade,
  ado_org          text not null,
  ado_project      text not null,
  ado_work_item_id integer not null,
  ado_url          text not null,
  last_synced_rev  integer not null default 0,
  last_synced_at   timestamptz,
  unique (ado_org, ado_project, ado_work_item_id)
);

create table status_history (
  id          bigint generated always as identity primary key,
  request_id  uuid not null references requests(id) on delete cascade,
  from_status text,
  to_status   text not null,
  ado_state   text,
  source      text not null check (source in ('PORTAL','ADO','SYSTEM')),
  actor       text,
  changed_at  timestamptz not null default now()
);
create index on status_history (request_id, changed_at);

create table comments (
  id             bigint generated always as identity primary key,
  request_id     uuid not null references requests(id) on delete cascade,
  ado_comment_id integer,
  source         text not null check (source in ('PORTAL','ADO')),
  author         text,
  body           text not null,
  visibility     text not null default 'public' check (visibility in ('public','internal')),
  origin_marker  text,
  created_at     timestamptz not null default now()
);
create index on comments (request_id, created_at);

create table attachments (
  id                 bigint generated always as identity primary key,
  request_id         uuid not null references requests(id) on delete cascade,
  storage_path       text not null,
  file_name          text not null,
  content_type       text,
  size_bytes         bigint,
  ado_attachment_url text,
  source             text not null default 'PORTAL',
  uploaded_at        timestamptz not null default now()
);

-- ── Integration plumbing ──────────────────────────────────────────
create table outbox_events (
  id              bigint generated always as identity primary key,
  event_type      text not null,
  request_id      uuid not null references requests(id) on delete cascade,
  payload         jsonb not null default '{}'::jsonb,
  status          text not null default 'PENDING'
                  check (status in ('PENDING','PROCESSING','DONE','FAILED','DEAD')),
  attempts        integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  error           text,
  created_at      timestamptz not null default now(),
  processed_at    timestamptz
);
create index on outbox_events (status, next_attempt_at);

create table inbound_events (
  id              bigint generated always as identity primary key,
  notification_id text not null unique,
  event_type      text not null,
  ado_work_item_id integer,
  raw             jsonb,
  received_at     timestamptz not null default now()
);

create table audit_log (
  id             bigint generated always as identity primary key,
  correlation_id text,
  request_id     uuid references requests(id),
  direction      text check (direction in ('INBOUND','OUTBOUND','INTERNAL')),
  operation      text not null,
  http_status    integer,
  success        boolean,
  detail         text,
  at             timestamptz not null default now()
);

create table sync_watermark (
  scope             text primary key,
  last_changed_date timestamptz,
  last_run_at       timestamptz
);

create table client_ref_counters (
  client_id  uuid primary key references clients(id),
  last_value integer not null default 0
);
