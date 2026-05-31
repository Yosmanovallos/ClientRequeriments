-- ── Request types (5 live, 2 not-yet-live) ───────────────────────
insert into request_types (key, display_name, ado_work_item_type, ado_area_path, is_live) values
  ('new_report',   'New Report',                           'Report Request',  'BLG\PowerBI Requests', true),
  ('new_page',     'New Page (within an existing report)', 'Page Request',    'BLG\PowerBI Requests', true),
  ('new_feature',  'New feature on a Page/Report',         'Feature Request', 'BLG\PowerBI Requests', true),
  ('fix_issue',    'Fix Issue on a Report/Page',           'Bug',             'BLG\PowerBI Requests', true),
  ('view_request', 'View Request',                         'View Request',    'BLG\Data Warehouse',   true),
  ('data_eng',     'Data Engineering Request',             'DE Request',      'BLG\Data Engineering', false),
  ('other',        'Other Requests/Questions',             'Question',        'BLG\Intake',           false)
on conflict (key) do nothing;

-- ── Demo client: Bell Legal Group ────────────────────────────────
-- Run this only in dev/test. Replace with real invite flow in production.
insert into clients (id, name, ref_prefix, active) values
  ('00000000-0000-0000-0000-000000000001', 'Bell Legal Group', 'CBLPBR', true)
on conflict (id) do nothing;

insert into client_ref_counters (client_id, last_value) values
  ('00000000-0000-0000-0000-000000000001', 628)
on conflict (client_id) do nothing;

-- ── Sync watermark (reconciliation baseline) ─────────────────────
insert into sync_watermark (scope, last_changed_date)
values ('ado.workitems', now() - interval '1 day')
on conflict (scope) do nothing;
