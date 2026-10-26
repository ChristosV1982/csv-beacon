BEGIN;
-- Count weights must not depend on which authorized viewer reads a report.
-- Retain the existing report-access helper for vessel/platform-owner edge cases.
ALTER POLICY human_counting_policy_read ON public.company_human_counting_policies
 USING (
   public.current_app_role_text() IN ('super_admin','platform_owner')
   OR company_id=public.current_profile_company_id()
   OR EXISTS (
     SELECT 1 FROM public.csvb_post_inspection_reports_for_me() r
     WHERE r.company_id=company_human_counting_policies.company_id
   )
 );
COMMIT;
