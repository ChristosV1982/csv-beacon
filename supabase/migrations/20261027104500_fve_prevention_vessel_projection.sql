begin;
-- Office needs source IDs to manage actions. Vessels do not: never provide
-- other-vessel Post-Inspection item IDs as a side effect of fleet awareness.
create or replace function public.csvb_fve_visible_actions(p_company_id uuid,p_source_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(
    (case when (select role::text from profiles where id=auth.uid())='vessel'
      then to_jsonb(a)-'source_observation_item_id'-'created_by'-'updated_by'
      else to_jsonb(a) end) || jsonb_build_object(
    'target_count',(select count(*) from fve_prevention_action_targets t where t.action_id=a.id),
    'targets',case when (select role::text from profiles where id=auth.uid())<>'vessel'
      then (select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'vessel_id',t.vessel_id,
        'vessel_name',v.name) order by v.name),'[]'::jsonb)
        from fve_prevention_action_targets t join vessels v on v.id=t.vessel_id where t.action_id=a.id)
      else '[]'::jsonb end) order by a.created_at),'[]'::jsonb)
  from fve_prevention_actions a
  where a.company_id=p_company_id and a.source_observation_item_id=p_source_id
  and ((select role::text from profiles where id=auth.uid())<>'vessel'
    or (a.status='issued' and exists(select 1 from fve_prevention_action_targets t
      join profiles p on p.id=auth.uid() and p.vessel_id=t.vessel_id
      where t.action_id=a.id and t.company_id=p_company_id)))
$$;
create or replace function public.csvb_fve_prevention_history(
  p_company_id uuid default null,p_question_no text default null,
  p_from_date date default null,p_to_date date default null,
  p_oil_major text default null,p_category text default null,
  p_offset integer default 0,p_limit integer default 25
) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare
  company uuid:=csvb_fve_authorized_company(p_company_id);
  base jsonb;
  question text:=csvb_canonical_question_no(csvb_sire_normalize_question_number(p_question_no));
  vessel_user boolean:=(select role::text='vessel' from profiles where id=auth.uid());
  enriched jsonb;
begin
  base:=csvb_fleet_vetting_experience_history(company,p_question_no,p_from_date,p_to_date,
    p_oil_major,p_category,p_offset,p_limit);
  select coalesce(jsonb_agg((to_jsonb(page)-'sort_id') || jsonb_build_object('prevention_actions',
    csvb_fve_visible_actions(company,page.sort_id))
    order by page.inspection_date desc nulls last,page.vessel_name,page.sort_id),'[]'::jsonb)
  into enriched from (
    select x.sort_id,case when vessel_user then null else x.sort_id end as source_observation_item_id,
      x.vessel_name,x.inspection_date,x.oil_major,x.designation,x.observation_text from csvb_fve_rows(company) x
    where x.question_no=question
      and (p_from_date is null or x.inspection_date>=p_from_date)
      and (p_to_date is null or x.inspection_date<=p_to_date)
      and (nullif(p_oil_major,'') is null or x.oil_major=p_oil_major)
      and (p_category is null or x.designation=p_category)
    order by x.inspection_date desc nulls last,x.vessel_name,x.sort_id
    offset greatest(coalesce(p_offset,0),0) limit least(greatest(coalesce(p_limit,25),1),100)
  ) page;
  return base || jsonb_build_object('rows',enriched,'can_edit',csvb_fve_can_edit());
end $$;
commit;
