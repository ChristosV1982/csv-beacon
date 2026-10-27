BEGIN;
-- These helpers mutate counters/derived evidence status or restricted audit data.
-- Keep Office implementations intact; never treat them as vessel read access.
DO $$
DECLARE f record; definition text; target_action text;
BEGIN
  FOR f IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND
      (p.proname=ANY(ARRAY['mai_generate_component_unique_id',
        'mai_refresh_inspection_run_evidence_status','mai_refresh_lifecycle_event_evidence_status',
        'mai_log_component_particulars_lock_action','csvb_fve_target_review'])
       OR p.proname ~ '^mai_(soft_delete|void)') LOOP
    definition:=pg_get_functiondef(f.oid);
    target_action:=CASE
      WHEN f.proname='csvb_fve_target_review' THEN 'review'
      WHEN f.proname='mai_log_component_particulars_lock_action' THEN 'admin'
      WHEN f.proname ~ '^mai_(soft_delete|void)' THEN 'delete'
      ELSE 'edit' END;
    IF definition LIKE '%csvb_vessel_policy_private%' THEN
      definition:=replace(replace(definition,'''view''',quote_literal(target_action)),
        '''edit''',quote_literal(target_action));
      EXECUTE definition;
    END IF;
  END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
