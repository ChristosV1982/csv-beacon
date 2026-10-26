begin;

-- Read-only module: no question, observation, report, response or storage copies.
insert into public.app_modules(code, name, is_active)
values ('SIRE_FLEET_VETTING_EXPERIENCE', 'SIRE 2.0 – Fleet Vetting Experience', true)
on conflict (code) do nothing;
insert into public.app_permissions(module_id, action)
select id, 'view' from public.app_modules where code = 'SIRE_FLEET_VETTING_EXPERIENCE'
on conflict (module_id, action) do nothing;

-- Mirror the existing viewer's view grants AND explicit position restrictions.
-- No editor/admin permissions are created.
insert into public.role_permissions(role, position, permission_id, scope, is_granted)
select rp.role, rp.position, target.id, rp.scope, rp.is_granted
from public.role_permissions rp
join public.app_permissions original on original.id = rp.permission_id and original.action = 'view'
join public.app_modules om on om.id = original.module_id and om.code = 'SIRE_QUESTIONS_VIEWER'
cross join public.app_permissions target
join public.app_modules tm on tm.id = target.module_id
  and tm.code = 'SIRE_FLEET_VETTING_EXPERIENCE' and target.action = 'view'
where not exists (
  select 1 from public.role_permissions r
  where r.role = rp.role and r.position is not distinct from rp.position
    and r.permission_id = target.id
);

insert into public.company_modules(company_id, module_key, is_enabled)
select company_id, 'sire_fleet_vetting_experience', is_enabled
from public.company_modules where module_key = 'sire_questions_viewer'
on conflict (company_id, module_key) do nothing;

insert into public.dashboard_platform_area_modules(area_id, module_card_key, sort_order, is_active)
select id, 'sire_fleet_vetting_experience', 12, true
from public.dashboard_platform_areas where area_key = 'inspection_libraries_vetting'
on conflict (area_id, module_card_key) do nothing;

do $$
declare
  definition text;
  anchor text := '(''sire_questions_viewer'', ''SIRE 2.0 Questions Viewer'', ''SIRE 2.0'', 11),';
begin
  select replace(pg_get_functiondef('public.csvb_standard_modules()'::regprocedure), E'\r\n', E'\n')
  into definition;
  if position('''sire_fleet_vetting_experience''' in definition) = 0 then
    if position(anchor in definition) = 0 then
      raise exception 'Standard module registry anchor missing; refusing partial registration.';
    end if;
    execute replace(definition, anchor, anchor || E'\n      ' ||
      '(''sire_fleet_vetting_experience'', ''SIRE 2.0 – Fleet Vetting Experience'', ''SIRE 2.0'', 12),');
  end if;
end $$;

-- Private authorization: frontend company context never confers authority.
create or replace function public.csvb_fve_authorized_company(p_company_id uuid)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare
  p public.profiles%rowtype;
  company uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to use Fleet Vetting Experience.' using errcode = '42501';
  end if;
  select * into p from public.profiles where id = auth.uid();
  if p.id is null or not coalesce(p.is_active, true) or coalesce(p.is_disabled, false) then
    raise exception 'Active user required.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.csvb_my_effective_app_permissions() e
    where e.module_code = 'SIRE_FLEET_VETTING_EXPERIENCE'
      and e.permission_action = 'view' and e.is_granted and e.scope <> 'none'
  ) then
    raise exception 'Fleet Vetting Experience view permission required.' using errcode = '42501';
  end if;
  if p.role::text in ('super_admin', 'platform_owner') then
    if p_company_id is null then
      raise exception 'Select a company for Fleet Vetting Experience.' using errcode = '22023';
    end if;
    company := p_company_id;
  else
    company := p.company_id;
    if p_company_id is not null and p_company_id is distinct from company then
      raise exception 'Company not accessible.' using errcode = '42501';
    end if;
  end if;
  if company is null or not exists (
    select 1 from public.companies c
    join public.company_modules m on m.company_id = c.id
      and m.module_key = 'sire_fleet_vetting_experience' and m.is_enabled
    where c.id = company and c.is_active
  ) then
    raise exception 'Fleet Vetting Experience is not enabled for this company.' using errcode = '42501';
  end if;
  if p.role::text = 'vessel' and not exists (
    select 1 from public.vessels v where v.id = p.vessel_id and v.company_id = company
  ) then
    raise exception 'A vessel assignment in this company is required.' using errcode = '42501';
  end if;
  return company;
end $$;
revoke all on function public.csvb_fve_authorized_company(uuid) from public, anon, authenticated;

-- Private, inlinable projection. IDs are used only internally for stable paging.
-- Deliberately no report references, responses, ranks, PIFs or effective counts.
create or replace function public.csvb_fve_rows(p_company_id uuid)
returns table(question_no text, vessel_name text, inspection_date date, oil_major text,
  designation text, observation_text text, sort_id uuid)
language sql stable as $$
  select public.csvb_canonical_question_no(public.csvb_sire_normalize_question_number(
      coalesce(nullif(trim(i.question_base), ''), nullif(trim(i.question_no), ''), i.question_full))),
    coalesce(v.name, 'Unknown vessel'), r.inspection_date,
    coalesce(nullif(trim(r.ocimf_inspecting_company), ''), nullif(trim(r.ocimf_company), ''), 'Not recorded'),
    case lower(trim(i.designation)) when 'human' then 'Human' when 'hardware' then 'Hardware'
      when 'process' then 'Process' end,
    i.observation_text, i.id
  from public.post_inspection_observation_items i
  join public.post_inspection_reports r on r.id = i.report_id
  left join public.vessels v on v.id = r.vessel_id
  where r.company_id = p_company_id
    and coalesce(i.has_observation, true)
    and nullif(trim(i.observation_text), '') is not null
    and lower(coalesce(nullif(trim(i.obs_type), ''), trim(i.observation_type))) in ('negative', 'negative_observation')
    and lower(trim(i.designation)) in ('human', 'hardware', 'process')
$$;
revoke all on function public.csvb_fve_rows(uuid) from public, anon, authenticated;

create or replace function public.csvb_fleet_vetting_experience_context(p_company_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  company uuid;
  choices jsonb := '[]'::jsonb;
  platform boolean;
begin
  if auth.uid() is null or not exists (
    select 1 from public.csvb_my_effective_app_permissions() e
    where e.module_code = 'SIRE_FLEET_VETTING_EXPERIENCE' and e.permission_action = 'view'
      and e.is_granted and e.scope <> 'none'
  ) then
    raise exception 'Fleet Vetting Experience view permission required.' using errcode = '42501';
  end if;
  select role::text in ('super_admin', 'platform_owner') into platform
    from public.profiles where id = auth.uid();
  if platform then
    select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.company_name)
      order by c.company_name), '[]'::jsonb) into choices
    from public.companies c join public.company_modules m on m.company_id = c.id
      and m.module_key = 'sire_fleet_vetting_experience' and m.is_enabled
    where c.is_active;
    if p_company_id is null then
      return jsonb_build_object('company_id', null, 'company_name', null, 'companies', choices,
        'oil_majors', '[]'::jsonb, 'today', current_date);
    end if;
  end if;
  company := public.csvb_fve_authorized_company(p_company_id);
  return jsonb_build_object('company_id', company,
    'company_name', (select company_name from public.companies where id = company),
    'companies', choices, 'today', current_date,
    'oil_majors', (select coalesce(jsonb_agg(oil_major order by oil_major), '[]'::jsonb)
      from (select distinct x.oil_major from public.csvb_fve_rows(company) x
        where x.question_no is not null) majors));
end $$;

create or replace function public.csvb_fleet_vetting_experience_history(
  p_company_id uuid default null, p_question_no text default null,
  p_from_date date default null, p_to_date date default null,
  p_oil_major text default null, p_category text default null,
  p_offset integer default 0, p_limit integer default 25
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  company uuid := public.csvb_fve_authorized_company(p_company_id);
  question text := public.csvb_canonical_question_no(public.csvb_sire_normalize_question_number(p_question_no));
  result jsonb;
begin
  if question is null then raise exception 'A standard SIRE question number is required.' using errcode = '22023'; end if;
  if p_from_date > p_to_date then raise exception 'From date must not be after To date.' using errcode = '22023'; end if;
  if p_category is not null and p_category not in ('Human', 'Hardware', 'Process') then
    raise exception 'Invalid category.' using errcode = '22023';
  end if;
  with matching as materialized (
    select * from public.csvb_fve_rows(company) x where x.question_no = question
      and (nullif(p_oil_major, '') is null or x.oil_major = p_oil_major)
      and (p_category is null or x.designation = p_category)
  ), in_period as (
    select * from matching x
    where (p_from_date is null or x.inspection_date >= p_from_date)
      and (p_to_date is null or x.inspection_date <= p_to_date)
  )
  select jsonb_build_object(
    'total', (select count(*) from in_period),
    'last_12_months', (select count(*) from matching where inspection_date >= (current_date - interval '12 months')::date
      and inspection_date <= current_date),
    'rows', (select coalesce(jsonb_agg(to_jsonb(page)), '[]'::jsonb) from (
      select vessel_name, inspection_date, oil_major, designation, observation_text from in_period
      order by inspection_date desc nulls last, vessel_name, sort_id
      offset greatest(coalesce(p_offset, 0), 0) limit least(greatest(coalesce(p_limit, 25), 1), 100)
    ) page)
  ) into result;
  return result;
end $$;

create or replace function public.csvb_fleet_vetting_experience_counts(
  p_company_id uuid default null, p_from_date date default null, p_to_date date default null,
  p_oil_major text default null, p_category text default null
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  company uuid := public.csvb_fve_authorized_company(p_company_id);
begin
  if p_from_date > p_to_date then raise exception 'From date must not be after To date.' using errcode = '22023'; end if;
  if p_category is not null and p_category not in ('Human', 'Hardware', 'Process') then
    raise exception 'Invalid category.' using errcode = '22023';
  end if;
  return (select coalesce(jsonb_agg(to_jsonb(badges) order by badges.question_no), '[]'::jsonb) from (
    select x.question_no, count(*) as count from public.csvb_fve_rows(company) x
    where x.question_no is not null
      and (p_from_date is null or x.inspection_date >= p_from_date)
      and (p_to_date is null or x.inspection_date <= p_to_date)
      and (nullif(p_oil_major, '') is null or x.oil_major = p_oil_major)
      and (p_category is null or x.designation = p_category)
    group by x.question_no
  ) badges);
end $$;

revoke all on function public.csvb_fleet_vetting_experience_context(uuid) from public, anon;
revoke all on function public.csvb_fleet_vetting_experience_history(uuid,text,date,date,text,text,integer,integer) from public, anon;
revoke all on function public.csvb_fleet_vetting_experience_counts(uuid,date,date,text,text) from public, anon;
grant execute on function public.csvb_fleet_vetting_experience_context(uuid) to authenticated;
grant execute on function public.csvb_fleet_vetting_experience_history(uuid,text,date,date,text,text,integer,integer) to authenticated;
grant execute on function public.csvb_fleet_vetting_experience_counts(uuid,date,date,text,text) to authenticated;

commit;
