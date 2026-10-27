-- Retain normal Viewer read helpers, without enabling editor/export/notification writes.
BEGIN;
DO $$
DECLARE f record; definition text;
BEGIN
  FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname=ANY(ARRAY[
      'csvb_sire_question_references_for_questions','csvb_sire_question_ids_by_publication_filter',
      'csvb_sire_publication_secondary_filter_question_numbers','csvb_can_access_question_photo_path',
      'csvb_sire_match_question_number','csvb_sire_library_change_event_notifications_for_me',
      'csvb_sire_library_change_log_for_me','csvb_sire_library_update_alerts_for_me']) LOOP
    definition:=pg_get_functiondef(f.oid);
    IF definition LIKE '%csvb_vessel_policy_private%' THEN
      EXECUTE replace(definition,'''__DENIED__''','''SIRE_QUESTIONS_VIEWER''');
    END IF;
  END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
