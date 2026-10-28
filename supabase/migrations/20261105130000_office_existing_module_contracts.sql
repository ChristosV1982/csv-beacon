begin;
alter table public.csvb_office_api_contracts drop constraint csvb_office_api_contracts_rpc_action_check;
alter table public.csvb_office_api_contracts add constraint csvb_office_api_contracts_rpc_action_check
  check(rpc_action in ('view','edit','export','admin','review'));
-- Reuse literal module/action contracts already audited in existing public
-- wrappers. This is not endpoint-name or volatility-based inference.
insert into public.csvb_office_api_contracts(endpoint_kind,endpoint_name,module_codes,rpc_action)
select 'rpc',f.proname,array[min((r.parts)[1])],min((r.parts)[2])
from pg_proc f join pg_namespace n on n.oid=f.pronamespace
cross join lateral regexp_matches(pg_get_functiondef(f.oid),
  $rx$csvb_vessel_policy_permission\('([A-Z0-9_]+)'(?:\:\:text)?\s*,\s*'(view|edit|export|admin|review)'(?:\:\:text)?\)$rx$,'g') r(parts)
where n.nspname='public' and f.prokind='f'
  and (r.parts)[1]<>'__DENIED__'
group by f.proname having count(distinct (r.parts)[1])=1 and count(distinct (r.parts)[2])=1
on conflict do nothing;
notify pgrst,'reload schema';
commit;
