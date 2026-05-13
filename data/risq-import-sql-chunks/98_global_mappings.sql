-- ============================================================
-- RISQ-05F-98
-- Create blank global eSMS mapping rows
-- Preserves existing mappings.
-- ============================================================

BEGIN;

WITH qs AS (
  SELECT id AS question_set_id
  FROM public.risq_question_sets
  WHERE question_set_code = 'RISQ_3_2'
  LIMIT 1
)
INSERT INTO public.risq_question_internal_mappings (
  question_id,
  company_id,
  esms_references,
  esms_forms,
  remarks,
  is_active,
  created_by,
  updated_by
)
SELECT
  q.id,
  NULL,
  '',
  '',
  '',
  true,
  auth.uid(),
  auth.uid()
FROM public.risq_questions q
JOIN qs
  ON qs.question_set_id = q.question_set_id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.risq_question_internal_mappings m
  WHERE m.question_id = q.id
    AND m.company_id IS NULL
);

COMMIT;

SELECT
  'RISQ blank global eSMS mappings created/preserved.' AS result,
  COUNT(*) AS global_mapping_rows_count
FROM public.risq_question_internal_mappings m
JOIN public.risq_questions q ON q.id = m.question_id
JOIN public.risq_question_sets qs ON qs.id = q.question_set_id
WHERE qs.question_set_code = 'RISQ_3_2'
  AND m.company_id IS NULL;
