-- Comments-only import: no item replacement, header updates or risk refresh.
create or replace function public.csvb_post_inspection_apply_operator_comments_for_me(
  p_report_id uuid,
  p_updates jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_update record;
  v_count integer;
  v_applied integer := 0;
  v_rows integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if coalesce(public.current_app_role_text(), '') not in
      ('super_admin', 'company_admin', 'company_superintendent')
     or not coalesce(public.csvb_can_write_post_inspection(), false) then
    raise exception 'No permission to import Post-Inspection Operator Comments.'
      using errcode = '42501';
  end if;
  if p_report_id is null or not exists (
    select 1 from public.csvb_post_inspection_reports_for_me() r
    where r.id = p_report_id
  ) then
    raise exception 'Report not found or not accessible.' using errcode = '42501';
  end if;
  if p_updates is null or jsonb_typeof(p_updates) <> 'array' then
    raise exception 'updates must be an array.';
  end if;
  v_count := jsonb_array_length(p_updates);
  if v_count < 1 or v_count > 500 then
    raise exception 'Provide between 1 and 500 comment updates.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_updates) u(value)
    where jsonb_typeof(value) <> 'object'
      or not (value ?& array[
        'observation_item_id', 'immediate_cause', 'root_cause',
        'corrective_action', 'preventative_action',
        'expected_immediate_cause', 'expected_root_cause',
        'expected_corrective_action', 'expected_preventative_action'
      ])
  ) then
    raise exception 'Each update must include the item ID, four response values and reviewed prior values.';
  end if;
  if (select count(distinct value->>'observation_item_id')
      from jsonb_array_elements(p_updates) u(value)) <> v_count then
    raise exception 'Duplicate or missing observation item IDs are not allowed.';
  end if;

  for v_update in
    select * from jsonb_to_recordset(p_updates) as u(
      observation_item_id uuid,
      overwrite_approved boolean,
      immediate_cause text, root_cause text,
      corrective_action text, preventative_action text,
      expected_immediate_cause text, expected_root_cause text,
      expected_corrective_action text, expected_preventative_action text
    )
  loop
    update public.post_inspection_observation_items i
    set immediate_cause = v_update.immediate_cause,
        root_cause = v_update.root_cause,
        corrective_action = v_update.corrective_action,
        preventative_action = v_update.preventative_action
    where i.id = v_update.observation_item_id
      and i.report_id = p_report_id
      and i.obs_type = 'negative'
      and i.observation_type = 'negative_observation'
      and i.immediate_cause is not distinct from v_update.expected_immediate_cause
      and i.root_cause is not distinct from v_update.expected_root_cause
      and i.corrective_action is not distinct from v_update.expected_corrective_action
      and i.preventative_action is not distinct from v_update.expected_preventative_action
      and (
        coalesce(v_update.overwrite_approved, false)
        or not (
          (nullif(btrim(i.immediate_cause), '') is not null
            and nullif(btrim(i.immediate_cause), '') is distinct from nullif(btrim(v_update.immediate_cause), ''))
          or (nullif(btrim(i.root_cause), '') is not null
            and nullif(btrim(i.root_cause), '') is distinct from nullif(btrim(v_update.root_cause), ''))
          or (nullif(btrim(i.corrective_action), '') is not null
            and nullif(btrim(i.corrective_action), '') is distinct from nullif(btrim(v_update.corrective_action), ''))
          or (nullif(btrim(i.preventative_action), '') is not null
            and nullif(btrim(i.preventative_action), '') is distinct from nullif(btrim(v_update.preventative_action), ''))
        )
      );
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then
      raise exception 'An item is not an eligible negative finding, its response fields changed after review, or overwrite approval is missing. Reload and review again. No updates were applied.';
    end if;
    v_applied := v_applied + 1;
  end loop;
  return jsonb_build_object('applied', v_applied);
end;
$function$;

revoke all on function public.csvb_post_inspection_apply_operator_comments_for_me(uuid, jsonb) from public, anon;
grant execute on function public.csvb_post_inspection_apply_operator_comments_for_me(uuid, jsonb) to authenticated;
comment on function public.csvb_post_inspection_apply_operator_comments_for_me(uuid, jsonb)
  is 'Atomically updates only the four main Operator Comments response fields on authorized existing negative items, with reviewed-value concurrency checks.';
