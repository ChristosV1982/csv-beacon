-- Office API boundary: masks legacy authorization without replacing tenancy.
-- Unknown API operations fail closed for migrated Office users. Legacy,
-- Super Admin, Inspector and vessel users do not enter this boundary.
begin;
create table public.csvb_office_api_contracts(
  endpoint_kind text not null check(endpoint_kind in ('rpc','relation')),
  endpoint_name text not null,
  module_codes text[] not null default '{}',
  rpc_action text check(rpc_action in ('view','edit','export','admin')),
  shared_read boolean not null default false,
  primary key(endpoint_kind,endpoint_name)
);
alter table public.csvb_office_api_contracts enable row level security;
revoke all on public.csvb_office_api_contracts from public,anon,authenticated;

-- These are scoped identity/navigation readers, not ordinary business writers.
insert into public.csvb_office_api_contracts(endpoint_kind,endpoint_name,shared_read,rpc_action)
select 'rpc',n,true,'view' from unnest(array[
  'get_my_profile','csvb_my_profile','get_my_company','current_app_role_text',
  'current_profile_company_id','current_profile_role','current_profile_vessel_id',
  'csvb_my_effective_app_permissions','csvb_my_company_modules',
  'csvb_dashboard_list_platform_areas','csvb_accessible_vessels_for_me',
  'csvb_my_office_authorization','csvb_office_authorization_applies',
  'csvb_office_authorize_module'
]) n;
insert into public.csvb_office_api_contracts(endpoint_kind,endpoint_name,shared_read)
select 'relation',n,true from unnest(array[
  'profiles','companies','vessels','onboard_ranks','app_modules','app_permissions',
  'role_permissions','app_roles','app_role_permissions','company_modules',
  'dashboard_platform_areas','dashboard_platform_area_modules'
]) n;

-- Explicit business read contracts. An unlisted RPC is NEVER inferred to be a
-- read from its name. In particular, response_draft creates a row and is omitted.
insert into public.csvb_office_api_contracts
  (endpoint_kind,endpoint_name,module_codes,rpc_action)
select 'rpc',n,mods,'view' from (values
  (array['SIRE_QUESTIONS_VIEWER','QUESTIONS_EDITOR'],array[
    'csvb_questions_master_for_me','csvb_expected_evidence_for_question_for_me',
    'csvb_pgno_master_for_question_for_me','csvb_sire_question_references_for_question',
    'csvb_sire_question_references_for_questions','csvb_sire_question_ids_by_publication_filter',
    'csvb_sire_publication_secondary_filter_options',
    'csvb_sire_publication_secondary_filter_question_numbers','csvb_sire_match_question_number',
    'csvb_sire_library_change_event_notifications_for_me','csvb_sire_library_change_log_for_me',
    'csvb_sire_library_update_alerts_for_me','csvb_sire_viewer_ai_usage_log_for_me',
    'csvb_my_device_offline_grants']),
  (array['POST_INSPECTION','POST_INSPECTION_STATS','INSPECTOR_INTELLIGENCE'],array[
    'csvb_post_inspection_reports_for_me','csvb_post_inspection_reports_for_me_v2',
    'csvb_human_counting_items_for_me','post_insp_export_observations_v2']),
  (array['POST_INSPECTION','POST_INSPECTION_STATS'],array[
    'csvb_post_inspection_report_by_id_for_me','csvb_human_policy_snapshot_status_for_me',
    'csvb_post_inspection_selectable_risk_profiles_for_me',
    'csvb_post_inspection_all_profile_risk_scores_for_me_adjusted',
    'csvb_post_inspection_current_risk_scores_for_me_adjusted',
    'csvb_post_inspection_visible_risk_scores_for_me_adjusted',
    'csvb_post_inspection_current_risk_scores_for_me',
    'csvb_pi_all_risks_for_report','csvb_pi_obs_risks_for_report','csvb_pi_obs_risks_for_item',
    'csvb_post_inspection_all_profile_current_risks_for_report',
    'csvb_post_inspection_current_risk_for_report','csvb_post_inspection_current_risks_for_report',
    'csvb_post_inspection_current_observation_risk_for_item',
    'csvb_post_inspection_current_observation_risk_for_report',
    'csvb_post_inspection_current_observation_risks_for_item',
    'csvb_post_inspection_current_observation_risks_for_report',
    'csvb_post_inspection_comment_rounds_for_me','csvb_human_counting_policy_for_me',
    'csvb_post_inspection_noc_options_for_designation']),
  (array['POST_INSPECTION_STATS'],array[
    'csvb_stats_mscat_records','csvb_stats_mscat_items','csvb_stats_mscat_summary',
    'csvb_stats_mscat_trend','post_insp_stats_by_type','post_insp_stats_by_vessel',
    'post_insp_stats_summary','post_insp_stats_top_questions',
    'fleet_obs_analytics_export','fleet_obs_analytics_export_v2','fleet_obs_analytics_summary',
    'fleet_obs_analytics_by_vessel','fleet_obs_analytics_by_source','fleet_obs_analytics_top_questions',
    'csvb_audit_types_for_me']),
  (array['INSPECTOR_INTELLIGENCE'],array[
    'csvb_inspectors_for_me','csvb_inspector_aliases_for_me',
    'csvb_third_party_inspector_observations_for_me']),
  (array['VETTING_INSPECTION_PLANNER'],array[
    'csvb_vetting_inspection_planner_for_me','csvb_vetting_inspection_planner_for_me_v2']),
  (array['SIRE_FLEET_VETTING_EXPERIENCE'],array[
    'csvb_fleet_vetting_experience_context','csvb_fleet_vetting_experience_counts',
    'csvb_fleet_vetting_experience_history','csvb_fve_prevention_context',
    'csvb_fve_prevention_history','csvb_fve_prevention_action_get',
    'csvb_fve_target_workflow','csvb_fve_action_workflow_summary']),
  (array['MOORING_ANCHORING_INVENTORIES'],array[
    'mai_operation_port_countries','mai_operation_port_search','mai_operation_facilities_for_port',
    'mai_get_component_total_hours','mai_get_available_inspection_templates',
    'mai_get_effective_fields','mai_get_effective_evidence_requirement','mai_current_actor_label']),
  (array['PORT_CALL_INTELLIGENCE'],array[
    'pci_list_company_vessels','pci_search_port_directory',
    'pci_list_approved_berths','pci_list_approved_cargo_grades'])
) reads(mods,names) cross join lateral unnest(names) n
on conflict do nothing;

-- Known ordinary mutation contracts. Existing RPCs retain their original
-- company/vessel/ownership and workflow checks after this additional gate.
insert into public.csvb_office_api_contracts
  (endpoint_kind,endpoint_name,module_codes,rpc_action)
select 'rpc',n,mods,'edit' from (values
  (array['POST_INSPECTION'],array[
    'csvb_store_post_inspection_risk_snapshot','csvb_store_post_inspection_risk_snapshots_all_profiles',
    'csvb_store_post_inspection_risk_snapshots_all_accessible_report',
    'csvb_refresh_all_post_inspection_risks_for_me','csvb_post_inspection_apply_operator_comments_for_me',
    'csvb_post_inspection_import_comment_rounds_for_me','csvb_human_counting_policy_save',
    'csvb_persist_post_inspection_observation_photos','csvb_log_post_inspection_mscat_learning_example',
    'csvb_mark_post_inspection_mscat_manually_reviewed']),
  (array['VETTING_INSPECTION_PLANNER'],array[
    'csvb_vetting_inspection_plan_save','csvb_vetting_inspection_plan_save_v2',
    'csvb_vetting_inspection_remark_add','csvb_vetting_inspection_remark_update',
    'csvb_vetting_inspection_remark_delete']),
  (array['SIRE_FLEET_VETTING_EXPERIENCE'],array[
    'csvb_fve_prevention_action_save','csvb_fve_prevention_action_issue',
    'csvb_fve_response_draft','csvb_fve_response_draft_text_save','csvb_fve_response_submit',
    'csvb_fve_response_discard','csvb_fve_target_review','csvb_fve_evidence_reserve',
    'csvb_fve_evidence_cancel','csvb_fve_cleanup_prepare','csvb_fve_cleanup_finish']),
  (array['MOORING_ANCHORING_INVENTORIES'],array[
    'mai_register_component','mai_record_vessel_operation','mai_record_component_usage',
    'mai_record_component_inspection','mai_record_initial_component_hours',
    'mai_record_lifecycle_event','mai_update_lifecycle_event','mai_review_lifecycle_event',
    'mai_save_component_field_values','mai_set_component_location',
    'mai_register_component_attachment','mai_soft_delete_component_attachment',
    'mai_soft_delete_lifecycle_event','mai_start_inspection_run',
    'mai_save_inspection_run_answer','mai_complete_inspection_run',
    'mai_refresh_inspection_run_evidence_status','mai_refresh_lifecycle_event_evidence_status',
    'mai_complete_component_particulars','mai_assign_vessel_lifecycle_profile']),
  (array['PORT_CALL_INTELLIGENCE'],array[
    'pci_add_company_terminal','pci_manage_company_terminal','pci_decide_profile_proposal']),
  (array['PORTABLE_LIFTING_APPLIANCES_WIRES'],array[
    'pla_register_component','pla_update_component_particulars','pla_record_component_event',
    'pla_record_component_inspection','pla_transfer_component_location',
    'pla_restore_component','pla_discard_component'])
) writes(mods,names) cross join lateral unnest(names) n
on conflict do nothing;

-- Tables/views are assigned by their established subsystem prefix, not by an
-- inferred RPC action. HTTP writes always require Edit (DELETE requires Admin).
insert into public.csvb_office_api_contracts(endpoint_kind,endpoint_name,module_codes)
select 'relation',c.relname,
 case
   when c.relname like 'mai\_%' escape '\' then array['MOORING_ANCHORING_INVENTORIES']
   when c.relname like 'pci\_%' escape '\' then array['PORT_CALL_INTELLIGENCE']
   when c.relname like 'pla\_%' escape '\' then array['PORTABLE_LIFTING_APPLIANCES_WIRES']
   when c.relname like 'fve\_%' escape '\' then array['SIRE_FLEET_VETTING_EXPERIENCE']
   when c.relname like 'post_inspection%' then array['POST_INSPECTION','POST_INSPECTION_STATS']
   when c.relname like 'vetting_inspection%' then array['VETTING_INSPECTION_PLANNER']
   when c.relname in ('inspectors','inspector_aliases','third_party_inspector_observations')
     then array['INSPECTOR_INTELLIGENCE']
   when c.relname like 'company_policy%' then array['COMPANY_POLICY']
   when c.relname like 'risq%' then array['RISQ_QUESTIONS_VIEWER','RISQ_QUESTIONS_EDITOR']
   when c.relname like 'tmsa%' then array['TMSA_OFFICE_MANAGER']
   when c.relname like 'thread%' then array['THREADS']
   when c.relname like 'audit%' then array['AUDIT_OBSERVATIONS']
   when c.relname like 'questionnaire%' or c.relname like 'self_assess%'
     or c.relname in ('responses','answers_pgno','evidence') then array['QUESTIONNAIRE']
   when c.relname like 'question%' or c.relname like 'sire_%'
     or c.relname in ('pgno_master','expected_evidence_master') then
     array['SIRE_QUESTIONS_VIEWER','QUESTIONS_EDITOR']
   else array['__UNMAPPED__'] end
from pg_class c join pg_namespace ns on ns.oid=c.relnamespace
where ns.nspname='public' and c.relkind in ('r','v')
on conflict do nothing;

create function csvb_office_auth_private.api_allowed(
  p_kind text,p_name text,p_action text default null)
returns boolean language plpgsql stable security definer
set search_path=pg_catalog,public,csvb_office_auth_private as $$
declare contract public.csvb_office_api_contracts; mod text; action text;
begin
  if not public.csvb_office_authorization_applies() then return true; end if;
  select * into contract from public.csvb_office_api_contracts
    where endpoint_kind=p_kind and endpoint_name=p_name;
  if not found then return false; end if;
  action:=coalesce(p_action,contract.rpc_action,'view');
  if contract.shared_read then return action='view'; end if;
  for mod in select unnest(contract.module_codes) loop
    -- Shared source readers never authorize a write through an analytics/viewer module.
    if action<>'view' and mod in ('POST_INSPECTION_STATS','SIRE_QUESTIONS_VIEWER',
      'RISQ_QUESTIONS_VIEWER') then continue; end if;
    if public.csvb_office_authorize_module(mod,action) then return true; end if;
  end loop;
  return false;
end $$;

create function public.csvb_office_api_pre_request()
returns void language plpgsql security definer
set search_path=pg_catalog,public,csvb_office_auth_private as $$
declare path text; method text; name text; kind text; action text;
begin
  if not public.csvb_office_authorization_applies() then return; end if;
  path:=coalesce(current_setting('request.path',true),'');
  method:=upper(coalesce(current_setting('request.method',true),'GET'));
  kind:=case when path like '/rpc/%' then 'rpc' else 'relation' end;
  name:=regexp_replace(path,'^/(rpc/)?','');
  action:=case when kind='rpc' then null
    when method in ('GET','HEAD','OPTIONS') then 'view'
    when method='DELETE' then 'admin' else 'edit' end;
  if not csvb_office_auth_private.api_allowed(kind,name,action) then
    raise insufficient_privilege using message=format(
      'Office Access Profile denies this operation: %s %s',name,coalesce(action,'RPC'));
  end if;
end $$;

create function public.csvb_my_office_authorization()
returns jsonb language sql stable security definer
set search_path=pg_catalog,public,csvb_office_auth_private as $$
  select jsonb_build_object('enforced',public.csvb_office_authorization_applies(),
    'custom_permissions_applied',exists(select 1 from public.csvb_office_user_permission_overrides
      where profile_id=auth.uid()),
    'access_profile_code',(select office_access_profile_code from public.profiles where id=auth.uid()),
    'permissions',case when public.csvb_office_authorization_applies() then
      (select jsonb_agg(jsonb_build_object('module_code',m.code,'action',a.action,
        'decision',csvb_office_auth_private.decision(auth.uid(),m.code,a.action)))
       from public.app_modules m join public.app_permissions a on a.module_id=m.id where m.is_active)
      else '[]'::jsonb end)
$$;

-- Preserve original resolution byte-for-byte for all non-migrated identities.
do $$
declare definition text;
begin
  select replace(pg_get_functiondef('public.csvb_my_effective_app_permissions()'::regprocedure),
    E'\r','') into definition;
  definition:=regexp_replace(definition,'\mBEGIN\M',$branch$BEGIN
  IF public.csvb_office_authorization_applies() THEN
    RETURN QUERY SELECT m.code::text,m.name::text,a.action::text,
      (d.value->>'scope')::text,true,(d.value->>'source')::text
    FROM public.app_modules m JOIN public.app_permissions a ON a.module_id=m.id
    CROSS JOIN LATERAL (SELECT csvb_office_auth_private.decision(
      auth.uid(),m.code,a.action) AS value) d
    WHERE m.is_active AND coalesce((d.value->>'allowed')::boolean,false)
    ORDER BY m.code,a.action;
    RETURN;
  END IF;
$branch$,'i');
  execute definition;
end $$;

-- Existing restrictive table policies AND owner-executed view predicates already
-- call this helper. Add Office behavior; retain the complete vessel branch.
do $$
declare definition text;
begin
  select replace(pg_get_functiondef('public.csvb_vessel_relation_permission(text,text)'::regprocedure),
    E'\r','') into definition;
  definition:=regexp_replace(definition,'\mBEGIN\M',$branch$BEGIN
  IF public.csvb_office_authorization_applies() THEN
    RETURN csvb_office_auth_private.api_allowed('relation',p_relation,
      CASE WHEN p_action='delete' THEN 'admin' ELSE p_action END);
  END IF;
$branch$,'i');
  execute definition;
end $$;

create function public.csvb_office_storage_allowed(p_bucket text,p_write boolean)
returns boolean language plpgsql stable security definer
set search_path=pg_catalog,public,csvb_office_auth_private as $$
declare mods text[]; mod text;
begin
  if not public.csvb_office_authorization_applies() then return true; end if;
  mods:=case p_bucket
    when 'inspection-reports' then array['POST_INSPECTION']
    when 'post-inspection-photos' then array['POST_INSPECTION']
    when 'question-photos' then array['SIRE_QUESTIONS_VIEWER','QUESTIONS_EDITOR']
    when 'mai-evidence' then array['MOORING_ANCHORING_INVENTORIES']
    when 'port-call-intelligence-private' then array['PORT_CALL_INTELLIGENCE']
    when 'fve-response-evidence' then array['SIRE_FLEET_VETTING_EXPERIENCE']
    when 'audit-reports' then array['AUDIT_OBSERVATIONS']
    when 'thread-attachments' then array['THREADS']
    when 'company-policy-documents' then array['COMPANY_POLICY_DOCUMENTS','COMPANY_POLICY']
    when 'company-policy-assets' then array['COMPANY_POLICY']
    when 'tmsa-kpi-evidence' then array['TMSA_OFFICE_MANAGER']
    else array['__UNMAPPED__'] end;
  foreach mod in array mods loop
    if p_write and mod='SIRE_QUESTIONS_VIEWER' then continue; end if;
    if public.csvb_office_authorize_module(mod,case when p_write then 'edit' else 'view' end)
      then return true; end if;
  end loop;
  return false;
end $$;
create policy csvb_office_read on storage.objects as restrictive for select to authenticated
  using(public.csvb_office_storage_allowed(bucket_id,false));
create policy csvb_office_insert on storage.objects as restrictive for insert to authenticated
  with check(public.csvb_office_storage_allowed(bucket_id,true));
create policy csvb_office_update on storage.objects as restrictive for update to authenticated
  using(public.csvb_office_storage_allowed(bucket_id,true))
  with check(public.csvb_office_storage_allowed(bucket_id,true));
create policy csvb_office_delete on storage.objects as restrictive for delete to authenticated
  using(public.csvb_office_storage_allowed(bucket_id,true));

revoke all on all functions in schema csvb_office_auth_private from public,anon,authenticated;
revoke all on function public.csvb_office_api_pre_request(),
  public.csvb_my_office_authorization(),public.csvb_office_storage_allowed(text,boolean)
  from public,anon;
grant execute on function public.csvb_office_api_pre_request(),
  public.csvb_my_office_authorization(),public.csvb_office_storage_allowed(text,boolean)
  to authenticated,service_role;
-- Hook configuration and activation intentionally occur only in the final migration.
notify pgrst,'reload schema';
commit;
