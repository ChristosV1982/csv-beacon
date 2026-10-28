begin;

-- Required response-section registry. Extend this one server helper when a new
-- response-based section (e.g. Appendix 2) actually has an implemented data model.
-- Do not count future placeholders or free-text/general-details fields.
create function public.csvb_m02_completion_sections(p_report_id uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_agg(jsonb_build_object('key',key,'label',label,'total',total,
   'answered',answered,'remaining',total-answered) order by sort_order)
 from (
   select 'company' key,'Part 3' label,3 sort_order,count(*) total,
     count(*) filter(where r.response in ('Yes','No','N/S')) answered
   from public.m02_company_item_catalogue c
   left join public.m02_company_item_responses r on r.item_no=c.item_no and r.report_id=p_report_id
   union all
   select 'questions','Part 4',4,count(*),
     count(*) filter(where response in ('Yes','No','N/A','N/S'))
   from public.m02_inspection_responses where report_id=p_report_id
 ) sections
$$;
revoke all on function public.csvb_m02_completion_sections(uuid) from public,anon,authenticated;

create function public.csvb_m02_check_required_completion()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare sections jsonb; missing text;
begin
 -- Check the final transaction state, not an intermediate v1/v2 save step.
 if not exists(select 1 from public.m02_inspection_reports where id=new.id and status='completed') then
   return null;
 end if;
 sections:=public.csvb_m02_completion_sections(new.id);
 if exists(select 1 from jsonb_array_elements(sections) s where (s->>'total')::int=0) then
   raise exception 'Cannot mark Completed: required response sections are not available. Save Draft and retry.'
     using errcode='23514';
 end if;
 select string_agg(format('%s: %s remaining',s->>'label',s->>'remaining'),'; ' order by s->>'label')
 into missing from jsonb_array_elements(sections) s where (s->>'remaining')::int>0;
 if missing is not null then
   raise exception 'Cannot mark Completed. %. Save Draft is still available.',missing using errcode='23514';
 end if;
 return null;
end $$;
revoke all on function public.csvb_m02_check_required_completion() from public,anon,authenticated;
create constraint trigger m02_required_response_completion
 after insert or update on public.m02_inspection_reports
 deferrable initially deferred for each row
 when (new.status='completed')
 execute function public.csvb_m02_check_required_completion();

-- Existing completed records and all response values are left untouched.
-- The deferred constraint covers both old and versioned save RPCs atomically.
commit;
