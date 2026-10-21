-- Integration checks on the linked TEST project only. Every change is rolled back.
begin;
do $test$
declare
  v_user uuid;
  v_item public.post_inspection_observation_items%rowtype;
  v_report jsonb;
  v_before jsonb;
  v_after jsonb;
  v_risks jsonb;
  v_result jsonb;
  v_rounds jsonb;
  v_changed jsonb;
  v_count integer;
  v_denied boolean;
begin
  assert not has_table_privilege('authenticated','public.post_inspection_ocimf_comment_rounds','INSERT'),
    'Direct client writes denied';
  assert not has_table_privilege('authenticated','public.post_inspection_ocimf_comment_rounds','DELETE'),
    'Direct client deletes denied';
  assert not has_function_privilege('anon','public.csvb_post_inspection_comment_rounds_for_me(uuid)','EXECUTE'),
    'Anonymous RPC execution denied';
  assert has_function_privilege('authenticated','public.csvb_post_inspection_comment_rounds_for_me(uuid)','EXECUTE'),
    'Authenticated scoped reader granted';
  select id into strict v_user from public.profiles where role::text = 'super_admin' limit 1;
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',v_user,'role','authenticated')::text, true);
  select * into strict v_item from public.post_inspection_observation_items
    where obs_type = 'negative' and observation_type = 'negative_observation'
      and not exists (select 1 from public.post_inspection_ocimf_comment_rounds c where c.observation_item_id = post_inspection_observation_items.id)
    limit 1 for update;
  select to_jsonb(r) into v_report from public.post_inspection_reports r where id = v_item.report_id;
  select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) into v_risks
    from public.risk_observation_scores s where observation_item_id = v_item.id;
  update public.post_inspection_observation_items set immediate_cause = null, root_cause = null,
    corrective_action = null, preventative_action = null where id = v_item.id;
  select to_jsonb(i) into v_before from public.post_inspection_observation_items i where id = v_item.id;
  v_rounds := jsonb_build_array(
    jsonb_build_object('observation_item_id',v_item.id,'action','initial',
      'immediate_cause','Synthetic initial cause','root_cause','Synthetic root',
      'corrective_action','Synthetic correction','preventative_action','Synthetic prevention',
      'expected_immediate_cause',null,'expected_root_cause',null,'expected_corrective_action',null,'expected_preventative_action',null,
      'ocimf_timestamp_raw','01/10/2026 09:42:16','ocimf_author_raw','Synthetic Operator',
      'source_page',1,'source_section',2,'source_order',0),
    jsonb_build_object('observation_item_id',v_item.id,'action','subsequent',
      'immediate_cause','Synthetic second cause','root_cause',null,'corrective_action',null,'preventative_action','Second prevention',
      'ocimf_timestamp_raw','05/10/2026 09:42:16','ocimf_author_raw','Synthetic Operator',
      'source_page',2,'source_section',3,'source_order',1),
    jsonb_build_object('observation_item_id',v_item.id,'action','subsequent',
      'immediate_cause','Synthetic third cause','root_cause',null,'corrective_action',null,'preventative_action',null,
      'ocimf_timestamp_raw','10/10/2026 09:42:16','ocimf_author_raw','Synthetic Operator',
      'source_page',3,'source_section',4,'source_order',2)
  );
  v_result := public.csvb_post_inspection_import_comment_rounds_for_me(v_item.report_id, v_rounds, repeat('a',64));
  assert (v_result->>'initial_applied')::int = 1 and (v_result->>'appended')::int = 2, 'Initial and two append counts';
  assert jsonb_array_length(public.csvb_post_inspection_comment_rounds_for_me(v_item.report_id)) >= 3, 'Scoped reader';
  select to_jsonb(i) into v_after from public.post_inspection_observation_items i where id = v_item.id;
  assert v_after->>'immediate_cause' = 'Synthetic initial cause', 'Later rounds must not overwrite initial';
  assert (v_before - array['immediate_cause','root_cause','corrective_action','preventative_action','updated_at'])
    = (v_after - array['immediate_cause','root_cause','corrective_action','preventative_action','updated_at']),
    'No changes to legacy notes, findings or workflow';
  assert v_report = (select to_jsonb(r) from public.post_inspection_reports r where id = v_item.report_id), 'Header unchanged';
  assert v_risks = (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from public.risk_observation_scores s
    where observation_item_id = v_item.id), 'Risk snapshots unchanged';
  v_result := public.csvb_post_inspection_import_comment_rounds_for_me(v_item.report_id, v_rounds, repeat('b',64));
  assert (v_result->>'duplicates')::int = 3 and (v_result->>'applied')::int = 0, 'Different file hash same content is idempotent';
  -- Same metadata, changed content: no automatic duplicate/replacement.
  v_changed := (v_rounds->1) || jsonb_build_object('immediate_cause','Revised second cause');
  v_denied := false;
  begin
    perform public.csvb_post_inspection_import_comment_rounds_for_me(v_item.report_id,jsonb_build_array(v_changed),repeat('a',64));
  exception when others then
    if sqlerrm not like '%Possible revision requires explicit approval%' then raise; end if;
    v_denied := true;
  end;
  assert v_denied, 'Revision requires confirmation';
  perform public.csvb_post_inspection_import_comment_rounds_for_me(v_item.report_id,
    jsonb_build_array(v_changed || '{"revision_approved":true}'::jsonb),repeat('a',64));
  assert exists (select 1 from public.post_inspection_ocimf_comment_rounds
    where observation_item_id = v_item.id and immediate_cause = 'Revised second cause' and supersedes_id is not null),
    'Revision links to prior round and does not replace it';
  select count(*) into v_count from public.post_inspection_ocimf_comment_rounds where observation_item_id = v_item.id;
  -- Invalid second target must roll back the first append in the same RPC call.
  v_denied := false;
  begin
    perform public.csvb_post_inspection_import_comment_rounds_for_me(v_item.report_id,jsonb_build_array(
      (v_rounds->2) || jsonb_build_object('immediate_cause','Must roll back','ocimf_timestamp_raw','15/10/2026 09:42:16'),
      (v_rounds->2) || jsonb_build_object('observation_item_id',gen_random_uuid(),'immediate_cause','Invalid target')
    ),repeat('a',64));
  exception when others then
    if sqlerrm not like '%eligible negative finding%' then raise; end if;
    v_denied := true;
  end;
  assert v_denied and v_count = (select count(*) from public.post_inspection_ocimf_comment_rounds
    where observation_item_id = v_item.id), 'Batch failure rolls back all writes';
  -- A real FK must protect the history, even if a client omits the UI check.
  v_denied := false;
  begin delete from public.post_inspection_observation_items where id = v_item.id;
  exception when foreign_key_violation then v_denied := true; end;
  assert v_denied, 'Findings deletion must not cascade away imported history';
  -- Independent DB uniqueness, even if an RPC/client check were bypassed.
  v_denied := false;
  begin
    insert into public.post_inspection_ocimf_comment_rounds (
      observation_item_id, report_id, round_kind, immediate_cause, root_cause,
      corrective_action, preventative_action, imported_by, source_order, source_pdf_fingerprint
    ) select observation_item_id, report_id, 'subsequent', immediate_cause, root_cause,
      corrective_action, preventative_action, imported_by, source_order, repeat('c',64)
      from public.post_inspection_ocimf_comment_rounds where observation_item_id = v_item.id limit 1;
  exception when unique_violation then v_denied := true; end;
  assert v_denied, 'DB uniqueness rejects same observation/content independent of source file';
  assert public.csvb_ocimf_parse_timestamp('31/02/2026 09:42:16') is null, 'Reject invalid calendar date';
  assert public.csvb_ocimf_parse_timestamp('01/10/2026 25:42:16') is null, 'Reject invalid time';
  assert public.csvb_ocimf_parse_timestamp('01/10/2026 09:42:16') = timestamp '2026-10-01 09:42:16', 'Wall-clock date';
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  v_denied := false;
  begin perform public.csvb_post_inspection_comment_rounds_for_me(v_item.report_id);
  exception when insufficient_privilege then v_denied := true; end;
  assert v_denied, 'Anonymous read blocked';
  v_denied := false;
  begin perform public.csvb_post_inspection_import_comment_rounds_for_me(v_item.report_id,v_rounds,repeat('a',64));
  exception when insufficient_privilege then v_denied := true; end;
  assert v_denied, 'Anonymous write blocked';
end;
$test$;
select 'OCIMF comment-round database checks passed; all fixture changes rolled back' as result;
rollback;
