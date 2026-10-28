begin;
-- Existing offline-device readiness check is caller-scoped identity metadata,
-- not permission to open the device-administration module.
insert into public.csvb_office_api_contracts(endpoint_kind,endpoint_name,module_codes,rpc_action,shared_read)
values('rpc','csvb_my_device_status','{}','view',true)
on conflict(endpoint_kind,endpoint_name) do update set shared_read=true,rpc_action='view';
notify pgrst,'reload schema';
commit;
