begin;
-- Permission probes return a boolean; probing Edit is not performing an edit.
-- Their Office branches use the same authoritative resolver.
insert into public.csvb_office_api_contracts(endpoint_kind,endpoint_name,module_codes,rpc_action)
values
  ('rpc','pla_current_user_can',array['PORTABLE_LIFTING_APPLIANCES_WIRES'],'view'),
  ('rpc','mai_has_permission',array['MOORING_ANCHORING_INVENTORIES'],'view')
on conflict(endpoint_kind,endpoint_name) do update
  set module_codes=excluded.module_codes,rpc_action=excluded.rpc_action,shared_read=false;
notify pgrst,'reload schema';
commit;
