-- Particulars-only editing: no lifecycle updates, transfer or insert path.
begin;
create or replace function public.csvb_admin_update_vessel_particulars(
  p_vessel_id uuid,
  p_name text,
  p_hull_number text default null,
  p_imo_number text default null,
  p_call_sign text default null,
  p_date_delivered date default null
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public as $$
declare
  vessel public.vessels;
  imo_clean text := nullif(trim(coalesce(p_imo_number,'')), '');
  imo_value public.vessels.imo_number%type;
begin
  perform public.csvb_require_platform_admin();
  if coalesce(trim(p_name),'') = '' then
    raise exception 'Vessel name is required.';
  end if;
  if imo_clean is not null then
    begin
      imo_value := imo_clean;
    exception when others then
      raise exception 'Invalid IMO number value: %', p_imo_number;
    end;
  end if;
  select * into vessel from public.vessels where id=p_vessel_id for update;
  if not found then raise exception 'Vessel not found: %', p_vessel_id; end if;
  update public.vessels set
    name=trim(p_name),
    hull_number=nullif(trim(coalesce(p_hull_number,'')), ''),
    imo_number=imo_value,
    call_sign=nullif(trim(coalesce(p_call_sign,'')), ''),
    date_delivered=p_date_delivered
  where id=p_vessel_id returning * into vessel;
  return jsonb_build_object('ok',true,'action','vessel_updated','vessel',
    to_jsonb(vessel) || jsonb_build_object('company_name',
      (select company_name from public.companies where id=vessel.company_id)));
end $$;
revoke all on function public.csvb_admin_update_vessel_particulars(uuid,text,text,text,text,date) from public,anon;
grant execute on function public.csvb_admin_update_vessel_particulars(uuid,text,text,text,text,date) to authenticated;
notify pgrst,'reload schema';
commit;
