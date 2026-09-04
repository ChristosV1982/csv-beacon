-- Port Call Intelligence dashboard-area registration v1.
-- This registers the card in Marine Applications & Vessel Interaction.
-- It does not enable the module for any company.

begin;

update public.dashboard_platform_area_modules m
set is_active = true,
    sort_order = 30,
    updated_at = now()
from public.dashboard_platform_areas a
where m.area_id = a.id
  and a.area_key = 'marine_applications_vessel_interaction'
  and m.module_card_key = 'port_call_intelligence';

insert into public.dashboard_platform_area_modules (
  area_id,
  module_card_key,
  sort_order,
  is_active
)
select
  a.id,
  'port_call_intelligence',
  30,
  true
from public.dashboard_platform_areas a
where a.area_key = 'marine_applications_vessel_interaction'
  and a.is_active = true
  and not exists (
    select 1
    from public.dashboard_platform_area_modules m
    where m.area_id = a.id
      and m.module_card_key = 'port_call_intelligence'
  );

do $block$
begin
  if not exists (
    select 1
    from public.dashboard_platform_area_modules m
    join public.dashboard_platform_areas a on a.id = m.area_id
    where a.area_key = 'marine_applications_vessel_interaction'
      and m.module_card_key = 'port_call_intelligence'
      and m.is_active = true
  ) then
    raise exception 'Port Call Intelligence dashboard registration failed.';
  end if;
end;
$block$;

commit;
