-- Allow multiple legitimate extracted findings that share the same
-- report, question, designation, classification and source page.
--
-- The former expression index incorrectly treated such findings as
-- duplicates even when their observation text and sequence differed.
-- Individual item identity remains protected by the table UUID primary key.

drop index if exists public.uq_post_inspection_observation_items_report_sig;
