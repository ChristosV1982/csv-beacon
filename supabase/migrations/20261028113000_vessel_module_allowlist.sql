-- Development-only vessel access policy. No account, vessel or business-data changes.
-- Office branches remain unchanged. Existing functions keep their OIDs/signatures;
-- their original implementations are retained in a non-API, owner-only schema.
BEGIN;

CREATE SCHEMA IF NOT EXISTS csvb_vessel_policy_private;
REVOKE ALL ON SCHEMA csvb_vessel_policy_private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.csvb_vessel_canonical_rank(p_rank text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
  SELECT CASE regexp_replace(lower(coalesce(p_rank,'')), '[^a-z0-9]', '', 'g')
    WHEN 'master' THEN 'master'
    WHEN 'chiefofficer' THEN 'chief_officer'
    WHEN 'chiefengineer' THEN 'chief_engineer'
    WHEN '2ndengineer' THEN 'second_engineer'
    WHEN 'secondengineer' THEN 'second_engineer'
    ELSE '' END
$$;

CREATE OR REPLACE FUNCTION public.csvb_vessel_rank_policy(p_module text,p_action text,p_rank text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
  SELECT CASE
    WHEN p_module='SIRE_QUESTIONS_VIEWER' THEN p_action='view'
    WHEN p_action NOT IN ('view','edit') THEN false
    WHEN p_module='SIRE_FLEET_VETTING_EXPERIENCE' THEN
      public.csvb_vessel_canonical_rank(p_rank) IN
        ('master','chief_officer','chief_engineer','second_engineer')
    WHEN p_module IN ('MOORING_ANCHORING_INVENTORIES','PORT_CALL_INTELLIGENCE',
                     'PORTABLE_LIFTING_APPLIANCES_WIRES') THEN
      public.csvb_vessel_canonical_rank(p_rank) IN ('master','chief_officer')
    ELSE false END
$$;

CREATE OR REPLACE FUNCTION public.csvb_vessel_policy_permission(
  p_module text,p_action text,p_company_id uuid DEFAULT NULL,p_vessel_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE p public.profiles%rowtype; r public.onboard_ranks%rowtype;
  rank_key text; rank_name text; v_module_key text; granted boolean;
BEGIN
  SELECT * INTO p FROM public.profiles WHERE id=auth.uid();
  IF NOT FOUND THEN RETURN false; END IF;
  -- This helper restricts vessel users only; never changes Office authorization.
  IF p.role::text<>'vessel' THEN RETURN true; END IF;
  IF NOT coalesce(p.is_active,true) OR coalesce(p.is_disabled,false)
     OR NOT coalesce(p.onboard_access_enabled,true)
     OR p.onboard_status='inactive'
     OR (p.onboard_status='disembarked' AND NOT coalesce(p.read_only_after_disembarkation,false))
     OR (p_action<>'view' AND coalesce(p.onboard_status,'') NOT IN ('onboard','temporarily_ashore'))
  THEN RETURN false; END IF;
  IF p_company_id IS NOT NULL AND p.company_id IS DISTINCT FROM p_company_id THEN RETURN false; END IF;
  IF p_vessel_id IS NOT NULL AND p.vessel_id IS DISTINCT FROM p_vessel_id THEN RETURN false; END IF;
  IF p.onboard_rank_id IS NOT NULL THEN
    SELECT * INTO r FROM public.onboard_ranks
      WHERE id=p.onboard_rank_id AND is_active
        AND (company_id IS NULL OR company_id=p.company_id);
    -- An invalid/inactive linked rank must never fall back to editable text.
    IF FOUND THEN rank_key:=public.csvb_vessel_canonical_rank(r.rank_code); rank_name:=r.rank_name; END IF;
  ELSE
    -- Controlled compatibility for existing profiles; never infer from usernames.
    rank_key:=public.csvb_vessel_canonical_rank(p.position);
    SELECT x.rank_name INTO rank_name FROM public.onboard_ranks x
      WHERE x.is_active AND (x.company_id IS NULL OR x.company_id=p.company_id)
        AND rank_key<>'' AND public.csvb_vessel_canonical_rank(x.rank_code)=rank_key
      ORDER BY (x.company_id IS NOT NULL) DESC,x.sort_order LIMIT 1;
  END IF;
  rank_name:=CASE rank_key WHEN 'master' THEN 'Master'
    WHEN 'chief_officer' THEN 'Chief Officer' WHEN 'chief_engineer' THEN 'Chief Engineer'
    WHEN 'second_engineer' THEN '2nd Engineer' END;
  IF NOT public.csvb_vessel_rank_policy(p_module,p_action,coalesce(rank_key,'')) THEN RETURN false; END IF;
  v_module_key:=CASE p_module
    WHEN 'SIRE_QUESTIONS_VIEWER' THEN 'sire_questions_viewer'
    WHEN 'SIRE_FLEET_VETTING_EXPERIENCE' THEN 'sire_fleet_vetting_experience'
    WHEN 'MOORING_ANCHORING_INVENTORIES' THEN 'mooring_anchoring_inventories'
    WHEN 'PORT_CALL_INTELLIGENCE' THEN 'port_call_intelligence'
    WHEN 'PORTABLE_LIFTING_APPLIANCES_WIRES' THEN 'portable_lifting_appliances_wires' END;
  IF p.company_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.company_modules cm
      WHERE cm.company_id=p.company_id AND cm.module_key=v_module_key AND cm.is_enabled)
  THEN RETURN false; END IF;
  IF p_module<>'SIRE_QUESTIONS_VIEWER' AND NOT EXISTS(
      SELECT 1 FROM public.vessels v WHERE v.id=p.vessel_id AND v.company_id=p.company_id)
  THEN RETURN false; END IF;
  SELECT rp.is_granted INTO granted FROM public.role_permissions rp
    JOIN public.app_permissions ap ON ap.id=rp.permission_id
    JOIN public.app_modules am ON am.id=ap.module_id
    WHERE rp.role::text='vessel' AND am.code=p_module AND ap.action=p_action
      AND (rp.position IS NULL OR rp.position=rank_name)
    ORDER BY (rp.position IS NOT NULL) DESC,rp.updated_at DESC NULLS LAST,rp.id LIMIT 1;
  RETURN coalesce(granted,false);
END $$;

-- Deny every existing vessel grant, including legacy spelling overrides.
-- The existing audit trigger records all Rights Matrix transitions.
-- Use the existing audited writer under an existing platform actor; no account changes.
DO $$
DECLARE actor uuid; previous_sub text:=current_setting('request.jwt.claim.sub',true);
  previous_claims text:=current_setting('request.jwt.claims',true);
  pos text; grants jsonb;
BEGIN
  SELECT id INTO actor FROM public.profiles
    WHERE role::text='super_admin' AND coalesce(is_active,true) AND NOT coalesce(is_disabled,false)
    ORDER BY id LIMIT 1;
  IF actor IS NULL THEN RAISE EXCEPTION 'Existing active Super Admin required for permission audit'; END IF;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  UPDATE public.role_permissions SET is_granted=false,scope='global'
    WHERE role::text='vessel' AND is_granted;
  UPDATE public.app_role_permissions SET allowed=false WHERE role_id='vessel' AND allowed;
  FOR pos IN SELECT unnest(ARRAY[NULL::text,'Master','Chief Officer','Chief Engineer','2nd Engineer']) LOOP
    SELECT jsonb_agg(jsonb_build_object('permission_id',ap.id,
      'scope',CASE WHEN am.code IN ('SIRE_QUESTIONS_VIEWER','SIRE_FLEET_VETTING_EXPERIENCE')
                       AND ap.action='view' THEN 'company' ELSE 'vessel_assigned' END,
      'is_granted',true)) INTO grants
    FROM public.app_permissions ap JOIN public.app_modules am ON am.id=ap.module_id
    WHERE (pos IS NULL AND am.code='SIRE_QUESTIONS_VIEWER' AND ap.action='view')
       OR (pos IS NOT NULL AND am.code<>'SIRE_QUESTIONS_VIEWER'
           AND public.csvb_vessel_rank_policy(am.code,ap.action,pos));
    IF grants IS NOT NULL THEN
      PERFORM public.csvb_set_role_permissions_audited('vessel'::public.app_role,pos,grants);
    END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
  PERFORM set_config('request.jwt.claims',coalesce(previous_claims,''),true);
END $$;

-- Keep the existing Office resolver byte-for-byte; prepend a vessel-only branch.
DO $$
DECLARE definition text;
BEGIN
  SELECT replace(pg_get_functiondef(p.oid),E'\r','') INTO definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='csvb_my_effective_app_permissions';
  IF definition IS NULL THEN RAISE EXCEPTION 'Missing effective permission resolver'; END IF;
  definition:=regexp_replace(definition,'\mBEGIN\M',$inject$BEGIN
  IF public.current_app_role_text()='vessel' THEN
    RETURN QUERY SELECT m.code::text,m.name::text,a.action::text,
      CASE WHEN m.code IN ('SIRE_QUESTIONS_VIEWER','SIRE_FLEET_VETTING_EXPERIENCE')
        AND a.action='view' THEN 'company' ELSE 'vessel_assigned' END::text,
      true,'vessel_rank_policy'::text
    FROM public.app_modules m JOIN public.app_permissions a ON a.module_id=m.id
    WHERE m.is_active AND public.csvb_vessel_policy_permission(m.code,a.action)
    ORDER BY m.code,a.action;
    RETURN;
  END IF;
$inject$,'i');
  EXECUTE definition;
END $$;

-- Bridge legacy MAI capability names to normal edit, never admin/delete.
CREATE OR REPLACE FUNCTION public.mai_has_permission(p_perm_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT CASE WHEN public.current_app_role_text()='vessel' THEN
    split_part(p_perm_key,'.',1)='MOORING_ANCHORING_INVENTORIES'
    AND public.csvb_vessel_policy_permission('MOORING_ANCHORING_INVENTORIES',
      CASE split_part(p_perm_key,'.',2)
        WHEN 'view' THEN 'view' WHEN 'edit' THEN 'edit'
        WHEN 'create' THEN 'edit' WHEN 'inspect' THEN 'edit' WHEN 'attach' THEN 'edit'
        ELSE 'admin' END)
  ELSE coalesce(public.is_platform_admin(),false) OR EXISTS(
    SELECT 1 FROM public.profiles p JOIN public.app_role_permissions arp
      ON arp.role_id=p.role::text AND arp.perm_key=p_perm_key AND arp.allowed
    WHERE p.id=auth.uid() AND p.is_active AND NOT p.is_disabled) END
$$;

DO $$
DECLARE definition text; changed text;
BEGIN
  SELECT replace(pg_get_functiondef('public.csvb_fve_onboard_access(boolean)'::regprocedure),E'\r','')
    INTO definition;
  changed:=regexp_replace(definition,'select exists',
    'select public.csvb_vessel_policy_permission(''SIRE_FLEET_VETTING_EXPERIENCE'',CASE WHEN p_write THEN ''edit'' ELSE ''view'' END) AND exists','i');
  IF changed=definition THEN RAISE EXCEPTION 'FVE onboard guard not located'; END IF;
  EXECUTE changed;
  SELECT replace(pg_get_functiondef('public.pla_current_user_can(text,uuid,uuid)'::regprocedure),E'\r','')
    INTO definition;
  changed:=replace(definition,'IF v_actor.role::text = ''vessel'' THEN',
    'IF v_actor.role::text = ''vessel'' THEN
      RETURN public.csvb_vessel_policy_permission(''PORTABLE_LIFTING_APPLIANCES_WIRES'',
        p_action,p_company_id,p_vessel_id);');
  IF changed=definition THEN RAISE EXCEPTION 'PLA vessel guard not located'; END IF;
  EXECUTE changed;
END $$;

-- Retain the existing helper name/contracts, but authorize both approved ranks.
CREATE OR REPLACE FUNCTION pci_private.is_master(p_company_id uuid,p_vessel_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid()
    AND p.role::text='vessel' AND p.company_id=p_company_id
    AND (p_vessel_id IS NULL OR p.vessel_id=p_vessel_id)
    AND public.csvb_vessel_policy_permission('PORT_CALL_INTELLIGENCE','edit',p_company_id,p_vessel_id))
$$;

-- Shared relation classification: source Post-Inspection tables stay denied.
-- FVE's narrow SECURITY DEFINER projection intentionally bypasses their RLS;
-- it remains the ONLY vessel-facing fleet-history exception.
CREATE OR REPLACE FUNCTION public.csvb_vessel_relation_permission(p_relation text,p_action text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE m text;
BEGIN
  IF coalesce(public.current_app_role_text(),'')<>'vessel' THEN RETURN true; END IF;
  IF p_action='view' AND p_relation=ANY(ARRAY[
    'profiles','companies','vessels','onboard_ranks','app_modules','app_permissions',
    'role_permissions','app_roles','app_role_permissions','company_modules',
    'dashboard_platform_areas','dashboard_platform_area_modules',
    'csvb_registered_devices','csvb_device_offline_grants']) THEN RETURN true; END IF;
  IF p_relation=ANY(ARRAY['questions','questions_master','expected_evidence','expected_evidence_master',
    'pgno_library','pgno_master','question_pgno','question_evidence_items','question_photos',
    'question_sources','question_versions','question_revisions','sire_publications',
    'sire_question_publications','sire_question_industry_guidance']) THEN
    RETURN p_action='view' AND public.csvb_vessel_policy_permission('SIRE_QUESTIONS_VIEWER','view');
  END IF;
  IF p_relation IN ('mai_ports','mai_port_facilities') AND p_action='view' THEN
    RETURN public.csvb_vessel_policy_permission('MOORING_ANCHORING_INVENTORIES','view')
      OR public.csvb_vessel_policy_permission('PORT_CALL_INTELLIGENCE','view');
  END IF;
  m:=CASE WHEN p_relation LIKE 'mai\_%' ESCAPE '\' THEN 'MOORING_ANCHORING_INVENTORIES'
    WHEN p_relation LIKE 'pla\_%' ESCAPE '\' THEN 'PORTABLE_LIFTING_APPLIANCES_WIRES'
    WHEN p_relation LIKE 'pci\_%' ESCAPE '\' THEN 'PORT_CALL_INTELLIGENCE'
    WHEN p_relation LIKE 'fve\_%' ESCAPE '\' THEN 'SIRE_FLEET_VETTING_EXPERIENCE'
    ELSE '__DENIED__' END;
  IF p_action='delete' THEN RETURN false; END IF;
  RETURN public.csvb_vessel_policy_permission(m,p_action);
END $$;

-- Restrictive policies intersect existing policies; they grant nothing new and
-- preserve all existing company/vessel/target/ownership restrictions.
DO $$
DECLARE t record; cmd text; action text;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity LOOP
    FOR cmd,action IN SELECT * FROM (VALUES
      ('SELECT','view'),('INSERT','edit'),('UPDATE','edit'),('DELETE','delete')) v LOOP
      EXECUTE format('CREATE POLICY csvb_vessel_allowlist_%s ON public.%I AS RESTRICTIVE FOR %s TO authenticated %s',
        lower(cmd),t.relname,cmd,
        CASE WHEN cmd='INSERT' THEN format('WITH CHECK(public.csvb_vessel_relation_permission(%L,%L))',t.relname,action)
          WHEN cmd='UPDATE' THEN format('USING(public.csvb_vessel_relation_permission(%L,%L)) WITH CHECK(public.csvb_vessel_relation_permission(%L,%L))',
            t.relname,action,t.relname,action)
          ELSE format('USING(public.csvb_vessel_relation_permission(%L,%L))',t.relname,action) END);
    END LOOP;
  END LOOP;
END $$;

-- Owner-executed views otherwise bypass underlying RLS. Keep existing columns,
-- ownership/grants/options and calculations, adding only the vessel read gate.
DO $$
DECLARE v record; definition text;
BEGIN
  FOR v IN SELECT c.oid,c.relname,iv.is_updatable FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN information_schema.views iv ON iv.table_schema=n.nspname AND iv.table_name=c.relname
    WHERE n.nspname='public' AND c.relkind='v' LOOP
    definition:=regexp_replace(pg_get_viewdef(v.oid,true),';\s*$','');
    IF v.is_updatable='YES' THEN
      -- Preserve automatic view updatability (and thus Office write contracts).
      IF definition ~* '\m(ORDER BY|LIMIT|OFFSET|GROUP BY)\M' THEN
        RAISE EXCEPTION 'Updatable view needs explicit gate placement: %',v.relname;
      END IF;
      IF definition ~* '\mWHERE\M' THEN
        definition:=regexp_replace(definition,'\mWHERE\M(.*)$',
          format('WHERE public.csvb_vessel_relation_permission(%L,''view'') AND (\1)',v.relname),'is');
      ELSE
        definition:=definition||format(' WHERE public.csvb_vessel_relation_permission(%L,''view'')',v.relname);
      END IF;
      EXECUTE format('CREATE OR REPLACE VIEW public.%I AS %s',v.relname,definition);
    ELSE
      EXECUTE format('CREATE OR REPLACE VIEW public.%I AS SELECT * FROM (%s) csvb_source
        WHERE public.csvb_vessel_relation_permission(%L,''view'')',v.relname,definition,v.relname);
    END IF;
  END LOOP;
END $$;

-- Guard existing RPC OIDs, retaining original bodies, signatures, defaults and
-- Office behavior in private implementations. This also covers SECURITY DEFINER
-- read RPCs that would otherwise bypass denied-module RLS.
DO $$
DECLARE f record; definition text; module_code text; action text; call_args text;
  wrapper text; result text; allowed_shared text[]:=ARRAY[
    'current_app_role_text','current_profile_company_id','current_profile_role','current_profile_vessel_id',
    'get_my_profile','my_role_text','my_vessel_id','is_admin_role','is_company','is_inspector',
    'is_platform_admin','is_super_admin','is_vessel','csvb_can_access_vessel',
    'csvb_my_company_modules','csvb_my_effective_app_permissions','csvb_dashboard_list_platform_areas',
    'csvb_vessel_canonical_rank','csvb_vessel_rank_policy','csvb_vessel_policy_permission',
    'csvb_vessel_relation_permission','mai_has_permission','pla_current_user_can'];
BEGIN
  FOR f IN SELECT p.*,pg_get_function_arguments(p.oid) arguments,
      pg_get_function_result(p.oid) result,l.lanname
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    JOIN pg_language l ON l.oid=p.prolang
    WHERE n.nspname='public' AND p.prosecdef AND p.prokind='f'
      AND p.prorettype NOT IN ('trigger'::regtype,'event_trigger'::regtype)
      AND l.lanname IN ('sql','plpgsql')
      AND NOT p.proname=ANY(allowed_shared)
    ORDER BY p.oid LOOP
    definition:=replace(pg_get_functiondef(f.oid),E'\r','');
    module_code:='__DENIED__'; action:='view';
    IF f.proname LIKE 'csvb_fve_%' OR f.proname LIKE 'csvb_fleet_vetting_experience_%' THEN
      module_code:='SIRE_FLEET_VETTING_EXPERIENCE';
      IF f.proname ~ '(response_(draft|submit|discard)|evidence_(reserve|cancel)|cleanup_(prepare|finish|fence)|prevention_action_(save|issue))'
        THEN action:='edit'; END IF;
      IF f.proname='csvb_fve_target_review' THEN action:='review'; END IF;
    ELSIF f.proname LIKE 'mai_%' THEN
      module_code:='MOORING_ANCHORING_INVENTORIES';
      IF f.proname ~ '^mai_(record|register|start|complete|save|update|set_component)'
        OR f.proname=ANY(ARRAY['mai_generate_component_unique_id',
          'mai_refresh_inspection_run_evidence_status','mai_refresh_lifecycle_event_evidence_status'])
        THEN action:='edit'; END IF;
      IF f.proname ~ '^mai_(import|upsert|assign|apply|lock|unlock|review)' THEN action:='admin'; END IF;
      IF f.proname ~ '^mai_(soft_delete|void)' THEN action:='delete'; END IF;
      IF f.proname='mai_log_component_particulars_lock_action' THEN action:='admin'; END IF;
    ELSIF f.proname LIKE 'pla_%' THEN
      module_code:='PORTABLE_LIFTING_APPLIANCES_WIRES';
      IF f.proname ~ '^pla_(register|record|update|transfer|assert)' THEN action:='edit'; END IF;
      IF f.proname ~ '^pla_(discard|restore)' THEN action:='admin'; END IF;
    ELSIF f.proname LIKE 'pci_%' THEN
      module_code:='PORT_CALL_INTELLIGENCE';
      IF f.proname ~ '^pci_(add|manage)' THEN action:='edit'; END IF;
      IF f.proname ~ '^pci_decide' THEN action:='review'; END IF;
    ELSIF f.proname=ANY(ARRAY['csvb_questions_master_for_me','csvb_can_access_question_master',
      'csvb_pgno_master_for_question_for_me','csvb_expected_evidence_for_question_for_me',
      'csvb_sire_question_references_for_question','csvb_sire_question_references_for_questions',
      'csvb_sire_question_ids_by_publication_filter','csvb_sire_publication_secondary_filter_question_numbers',
      'csvb_can_access_question_photo_path','csvb_sire_match_question_number',
      'csvb_sire_library_change_event_notifications_for_me','csvb_sire_library_change_log_for_me',
      'csvb_sire_library_update_alerts_for_me','csvb_my_device_offline_grants',
      'csvb_register_my_device','csvb_request_device_registration','csvb_my_device_status',
      'csvb_device_current_profile','csvb_device_is_company_admin_for','csvb_device_is_platform_admin',
      'csvb_registered_device_default_offline_days','csvb_offline_grant_effective_status',
      'csvb_company_module_enabled']) THEN
      module_code:='SIRE_QUESTIONS_VIEWER';
    ELSE
      -- Stateless/shared predicates are safe to retain; business readers/writers
      -- and dynamic administrative SQL are denied unless expressly admitted.
      IF f.proname ~ '^(csvb_)?(current_|is_|canonical_|normalize_)'
         OR f.proname IN ('get_my_company','csvb_my_profile') THEN CONTINUE; END IF;
    END IF;
    -- Preserve this OID: existing SQL dependencies must pass through the guard.
    EXECUTE replace(definition,'FUNCTION public.'||quote_ident(f.proname)||'(',
      'FUNCTION csvb_vessel_policy_private.'||quote_ident(f.proname)||'(');
    SELECT string_agg(CASE WHEN i=f.pronargs AND f.provariadic<>0 THEN 'VARIADIC ' ELSE '' END
      ||'$'||i,',' ORDER BY i) INTO call_args FROM generate_series(1,f.pronargs) i;
    result:=CASE WHEN f.proretset THEN
        format('RETURN QUERY SELECT * FROM csvb_vessel_policy_private.%I(%s);',f.proname,coalesce(call_args,''))
      WHEN f.prorettype='void'::regtype THEN
        format('PERFORM csvb_vessel_policy_private.%I(%s); RETURN;',f.proname,coalesce(call_args,''))
      ELSE format('RETURN csvb_vessel_policy_private.%I(%s);',f.proname,coalesce(call_args,'')) END;
    wrapper:=format('CREATE OR REPLACE FUNCTION public.%I(%s) RETURNS %s
      LANGUAGE plpgsql %s SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $gate$
      BEGIN
        IF public.current_app_role_text()=''vessel'' AND
          NOT public.csvb_vessel_policy_permission(%L,%L) THEN
          RAISE EXCEPTION ''Vessel access denied by module/rank policy.'' USING ERRCODE=''42501'';
        END IF;
        %s
      END $gate$',f.proname,f.arguments,f.result,
      CASE f.provolatile WHEN 's' THEN 'STABLE' WHEN 'i' THEN 'IMMUTABLE' ELSE 'VOLATILE' END,
      module_code,action,result);
    EXECUTE wrapper;
  END LOOP;
END $$;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA csvb_vessel_policy_private FROM PUBLIC,anon,authenticated;

-- Restrict storage without broadening existing path/ownership policies.
DO $$
BEGIN
  CREATE POLICY csvb_vessel_storage_allowlist ON storage.objects AS RESTRICTIVE
    FOR ALL TO authenticated USING(
      coalesce(public.current_app_role_text(),'')<>'vessel'
      OR (bucket_id LIKE '%fve%' AND public.csvb_vessel_policy_permission('SIRE_FLEET_VETTING_EXPERIENCE','view'))
      OR (bucket_id LIKE '%mooring%' AND public.csvb_vessel_policy_permission('MOORING_ANCHORING_INVENTORIES','view'))
      OR (bucket_id LIKE '%mai%' AND public.csvb_vessel_policy_permission('MOORING_ANCHORING_INVENTORIES','view'))
      OR (bucket_id LIKE '%pla%' AND public.csvb_vessel_policy_permission('PORTABLE_LIFTING_APPLIANCES_WIRES','view'))
      OR (bucket_id='port-call-intelligence-private' AND public.csvb_vessel_policy_permission('PORT_CALL_INTELLIGENCE','view'))
      OR (bucket_id='question-photos' AND public.csvb_vessel_policy_permission('SIRE_QUESTIONS_VIEWER','view'))
      OR (bucket_id LIKE 'sire-%' AND public.csvb_vessel_policy_permission('SIRE_QUESTIONS_VIEWER','view'))
    ) WITH CHECK(
      coalesce(public.current_app_role_text(),'')<>'vessel'
      OR (bucket_id LIKE '%fve%' AND public.csvb_vessel_policy_permission('SIRE_FLEET_VETTING_EXPERIENCE','edit'))
      OR ((bucket_id LIKE '%mooring%' OR bucket_id LIKE '%mai%') AND public.csvb_vessel_policy_permission('MOORING_ANCHORING_INVENTORIES','edit'))
      OR (bucket_id LIKE '%pla%' AND public.csvb_vessel_policy_permission('PORTABLE_LIFTING_APPLIANCES_WIRES','edit'))
      OR (bucket_id='port-call-intelligence-private' AND public.csvb_vessel_policy_permission('PORT_CALL_INTELLIGENCE','edit'))
    );
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;
