-- ============================================================
-- RISQ-05F-99
-- Final RISQ import verification
-- ============================================================

SELECT
  'RISQ-05F final verification.' AS result,
  (
    SELECT COUNT(*)
    FROM public.risq_sections s
    JOIN public.risq_question_sets qs ON qs.id = s.question_set_id
    WHERE qs.question_set_code = 'RISQ_3_2'
  ) AS sections_count,
  (
    SELECT COUNT(*)
    FROM public.risq_inspection_header_fields h
    JOIN public.risq_question_sets qs ON qs.id = h.question_set_id
    WHERE qs.question_set_code = 'RISQ_3_2'
  ) AS header_fields_count,
  (
    SELECT COUNT(*)
    FROM public.risq_questions q
    JOIN public.risq_question_sets qs ON qs.id = q.question_set_id
    WHERE qs.question_set_code = 'RISQ_3_2'
  ) AS questions_count,
  (
    SELECT COUNT(*)
    FROM public.risq_questions q
    JOIN public.risq_question_sets qs ON qs.id = q.question_set_id
    WHERE qs.question_set_code = 'RISQ_3_2'
      AND q.is_removed_question = false
  ) AS active_questions_count,
  (
    SELECT COUNT(*)
    FROM public.risq_questions q
    JOIN public.risq_question_sets qs ON qs.id = q.question_set_id
    WHERE qs.question_set_code = 'RISQ_3_2'
      AND q.is_removed_question = true
  ) AS removed_questions_count,
  (
    SELECT COUNT(*)
    FROM public.risq_questions q
    JOIN public.risq_question_sets qs ON qs.id = q.question_set_id
    WHERE qs.question_set_code = 'RISQ_3_2'
      AND q.answer_options_inferred = true
  ) AS inferred_answer_options_count,
  (
    SELECT COUNT(*)
    FROM public.risq_questions q
    JOIN public.risq_question_sets qs ON qs.id = q.question_set_id
    WHERE qs.question_set_code = 'RISQ_3_2'
      AND q.guide_status = 'not_provided'
      AND q.is_removed_question = false
  ) AS active_questions_without_guide_count,
  (
    SELECT COUNT(*)
    FROM public.risq_question_internal_mappings m
    JOIN public.risq_questions q ON q.id = m.question_id
    JOIN public.risq_question_sets qs ON qs.id = q.question_set_id
    WHERE qs.question_set_code = 'RISQ_3_2'
      AND m.company_id IS NULL
  ) AS global_mapping_rows_count;
