begin;
-- Storage authorizes twice: its preflight uses contentLength; the completed
-- object uses size. Both must exactly match the locked reservation.
create or replace function public.csvb_fve_storage_access(p_path text,p_operation text,p_metadata jsonb default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare e fve_response_evidence%rowtype; r fve_vessel_responses%rowtype; t fve_prevention_action_targets%rowtype;
begin
 if auth.uid() is null then return false; end if;
 select * into e from fve_response_evidence where storage_path=p_path;
 if not found then return false; end if;
 select * into r from fve_vessel_responses where id=e.response_id;
 if p_operation='read' then
   perform csvb_fve_target_access(e.company_id,r.action_target_id,'read');
   return not e.deleted and (r.status='submitted' or
     (r.status='draft' and csvb_fve_is_onboard_user() and csvb_fve_onboard_access(true)));
 end if;
 t:=csvb_fve_target_access(e.company_id,r.action_target_id,'respond');
 select * into r from fve_vessel_responses where id=e.response_id for update;
 select * into e from fve_response_evidence where id=e.id;
 if r.status<>'draft' or t.workflow_status not in('pending','returned') then return false; end if;
 if p_operation='delete' then return true; end if;
 return p_operation='upload' and not e.deleted and
   coalesce(p_metadata->>'size',p_metadata->>'contentLength')::bigint=e.size_bytes
   and p_metadata->>'mimetype'=e.mime_type;
exception when others then return false;
end $$;
commit;
