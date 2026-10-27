-- Supersedes the untracked development-only manual usage migration.
-- No usage records or operation contracts are changed. Never use CASCADE here.
begin;
lock table public.mai_component_usage_logs in access exclusive mode;
do $$
declare has_entries boolean;
begin
  if exists(select 1 from public.mai_component_usage_logs where operation_type='manual_usage') then
    raise exception 'Manual usage entries now exist. Cleanup stopped; preserve and review those records first.';
  end if;
  if exists(select 1 from information_schema.columns where table_schema='public'
    and table_name='mai_component_usage_logs' and column_name='manual_bulk_request_id') then
    execute 'select exists(select 1 from public.mai_component_usage_logs
      where manual_bulk_request_id is not null)' into has_entries;
    if has_entries then
      raise exception 'Manual usage entries now exist. Cleanup stopped; preserve and review those records first.';
    end if;
  end if;
end $$;
drop function if exists public.mai_register_manual_usage_bulk(uuid,uuid[],date,numeric,text,uuid);
drop function if exists public.mai_manual_usage_components(uuid);
drop function if exists public.mai_manual_usage_access(uuid,boolean);
drop index if exists public.mai_usage_manual_request_component_uniq;
alter table public.mai_component_usage_logs drop column if exists manual_bulk_request_id;
notify pgrst,'reload schema';
commit;
