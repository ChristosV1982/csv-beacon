-- Imported OCIMF history is separate from the main response and manual subcomments.
-- An initial receipt preserves provenance/deduplication; it is not a follow-up round.
create or replace function public.csvb_ocimf_normalize_text(p_text text)
returns text language sql immutable set search_path = public as $$
  select lower(btrim(regexp_replace(replace(coalesce(p_text, ''), chr(160), ' '), '\s+', ' ', 'g')));
$$;

create or replace function public.csvb_ocimf_content_fingerprint(
  p_immediate text, p_root text, p_corrective text, p_preventative text
) returns text language sql immutable set search_path = public, extensions as $$
  select encode(extensions.digest(convert_to(
    length(a)::text || ':' || a || length(b)::text || ':' || b ||
    length(c)::text || ':' || c || length(d)::text || ':' || d,
    'UTF8'), 'sha256'), 'hex')
  from (select public.csvb_ocimf_normalize_text(p_immediate) a,
    public.csvb_ocimf_normalize_text(p_root) b,
    public.csvb_ocimf_normalize_text(p_corrective) c,
    public.csvb_ocimf_normalize_text(p_preventative) d) n;
$$;

-- OCIMF does not provide a timezone. Store wall-clock time, never assume UTC.
-- Only unambiguous numeric day/month/year values are parsed; retain all raw text.
create or replace function public.csvb_ocimf_parse_timestamp(p_text text)
returns timestamp without time zone language plpgsql immutable set search_path = public as $$
declare m text[];
begin
  m := regexp_match(btrim(p_text), '^(\d{2})/(\d{2})/(\d{4})[[:space:]]+(\d{2}):(\d{2})(?::(\d{2}))?$');
  if m is null then return null; end if;
  if m[4]::int > 23 or m[5]::int > 59 or coalesce(m[6], '0')::int > 59 then return null; end if;
  return make_timestamp(m[3]::int, m[2]::int, m[1]::int, m[4]::int, m[5]::int, coalesce(m[6], '0')::int);
exception when others then return null;
end;
$$;

create table public.post_inspection_ocimf_comment_rounds (
  id uuid primary key default gen_random_uuid(),
  observation_item_id uuid not null references public.post_inspection_observation_items(id) on delete restrict,
  report_id uuid not null references public.post_inspection_reports(id) on delete restrict,
  company_id uuid,
  round_kind text not null check (round_kind in ('initial', 'subsequent')),
  immediate_cause text,
  root_cause text,
  corrective_action text,
  preventative_action text,
  ocimf_timestamp_raw text,
  ocimf_timestamp timestamp without time zone,
  ocimf_author_raw text,
  imported_at timestamptz not null default now(),
  imported_by uuid not null,
  source_page integer,
  source_section integer,
  source_order integer not null check (source_order >= 0),
  source_pdf_fingerprint text not null check (source_pdf_fingerprint ~ '^[a-f0-9]{64}$'),
  content_fingerprint text generated always as (
    public.csvb_ocimf_content_fingerprint(immediate_cause, root_cause, corrective_action, preventative_action)
  ) stored,
  supersedes_id uuid references public.post_inspection_ocimf_comment_rounds(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint post_inspection_ocimf_round_content_uniq unique (observation_item_id, content_fingerprint),
  constraint post_inspection_ocimf_round_nonempty check (
    nullif(btrim(coalesce(immediate_cause, '') || coalesce(root_cause, '') ||
      coalesce(corrective_action, '') || coalesce(preventative_action, '')), '') is not null
  )
);
create unique index post_inspection_ocimf_one_initial on public.post_inspection_ocimf_comment_rounds(observation_item_id)
  where round_kind = 'initial';
create index post_inspection_ocimf_rounds_report on public.post_inspection_ocimf_comment_rounds(report_id, imported_at, source_order);
alter table public.post_inspection_ocimf_comment_rounds enable row level security;
-- RPC-only access. No direct authenticated writes, updates or deletes.
revoke all on public.post_inspection_ocimf_comment_rounds from public, anon, authenticated;

create or replace function public.csvb_post_inspection_comment_rounds_for_me(p_report_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.csvb_post_inspection_reports_for_me() r where r.id = p_report_id
  ) then raise exception 'Report not found or not accessible.' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(c) order by c.imported_at, c.source_order, c.id), '[]'::jsonb)
    from public.post_inspection_ocimf_comment_rounds c where c.report_id = p_report_id);
end;
$$;

create or replace function public.csvb_post_inspection_import_comment_rounds_for_me(
  p_report_id uuid, p_rounds jsonb, p_pdf_fingerprint text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r public.post_inspection_reports%rowtype;
  i public.post_inspection_observation_items%rowtype;
  v jsonb;
  v_fingerprint text;
  v_main_fingerprint text;
  v_id uuid;
  v_supersedes uuid;
  v_initial integer := 0;
  v_appended integer := 0;
  v_receipts integer := 0;
  v_duplicates integer := 0;
  v_kind text;
  v_revision boolean;
begin
  if auth.uid() is null or not coalesce(public.csvb_can_write_post_inspection(), false)
     or coalesce(public.current_app_role_text(), '') not in
        ('super_admin', 'company_admin', 'company_superintendent') then
    raise exception 'No permission to import Post-Inspection Operator Comments.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.csvb_post_inspection_reports_for_me() x where x.id = p_report_id) then
    raise exception 'Report not found or not accessible.' using errcode = '42501';
  end if;
  if p_pdf_fingerprint is null or p_pdf_fingerprint !~ '^[a-f0-9]{64}$' then
    raise exception 'A valid source PDF fingerprint is required.';
  end if;
  if p_rounds is null or jsonb_typeof(p_rounds) <> 'array' then raise exception 'Rounds must be an array.'; end if;
  if jsonb_array_length(p_rounds) not between 1 and 500 then raise exception 'Provide between 1 and 500 rounds.'; end if;
  -- Serialize imports for this report. Concurrent imports re-check fingerprints under lock.
  select * into strict r from public.post_inspection_reports where id = p_report_id for update;
  for v in select value from jsonb_array_elements(p_rounds)
  loop
    if jsonb_typeof(v) <> 'object' or not (v ?& array['observation_item_id', 'action',
      'immediate_cause', 'root_cause', 'corrective_action', 'preventative_action', 'source_order']) then
      raise exception 'Round payload is incomplete.';
    end if;
    select * into i from public.post_inspection_observation_items
      where id = (v->>'observation_item_id')::uuid and report_id = p_report_id
        and obs_type = 'negative' and observation_type = 'negative_observation' for update;
    if not found then raise exception 'Round is not linked to an eligible negative finding in this report.'; end if;
    v_fingerprint := public.csvb_ocimf_content_fingerprint(v->>'immediate_cause', v->>'root_cause',
      v->>'corrective_action', v->>'preventative_action');
    if exists (select 1 from public.post_inspection_ocimf_comment_rounds c
      where c.observation_item_id = i.id and c.content_fingerprint = v_fingerprint) then
      v_duplicates := v_duplicates + 1; continue;
    end if;
    v_main_fingerprint := public.csvb_ocimf_content_fingerprint(i.immediate_cause, i.root_cause,
      i.corrective_action, i.preventative_action);
    v_kind := v->>'action';
    v_supersedes := null;
    if v_kind = 'initial' then
      if exists (select 1 from public.post_inspection_ocimf_comment_rounds c where c.observation_item_id = i.id)
         or nullif(btrim(coalesce(i.immediate_cause, '') || coalesce(i.root_cause, '') ||
           coalesce(i.corrective_action, '') || coalesce(i.preventative_action, '')), '') is not null then
        raise exception 'Initial responses changed since review. Reload and review again; no updates applied.';
      end if;
      -- Reuse existing reviewed-value and overwrite protections atomically.
      perform public.csvb_post_inspection_apply_operator_comments_for_me(p_report_id, jsonb_build_array(
        v || jsonb_build_object('overwrite_approved', false)));
      v_initial := v_initial + 1;
    elsif v_kind = 'initial_receipt' then
      if v_fingerprint <> v_main_fingerprint or exists (
        select 1 from public.post_inspection_ocimf_comment_rounds c where c.observation_item_id = i.id and c.round_kind = 'initial'
      ) then raise exception 'Initial source receipt no longer matches the saved response. Review again.'; end if;
      v_receipts := v_receipts + 1;
    elsif v_kind = 'subsequent' then
      if not exists (select 1 from public.post_inspection_ocimf_comment_rounds c where c.observation_item_id = i.id)
         and nullif(btrim(coalesce(i.immediate_cause, '') || coalesce(i.root_cause, '') ||
           coalesce(i.corrective_action, '') || coalesce(i.preventative_action, '')), '') is null then
        raise exception 'Review and import the initial response before appending subsequent comments.';
      end if;
      -- A cumulative PDF repeating the saved main response is not a new follow-up.
      if v_fingerprint = v_main_fingerprint then v_duplicates := v_duplicates + 1; continue; end if;
      v_revision := false;
      if nullif(public.csvb_ocimf_normalize_text(v->>'ocimf_author_raw'), '') is not null
        and nullif(public.csvb_ocimf_normalize_text(v->>'ocimf_timestamp_raw'), '') is not null then
        select c.id into v_supersedes from public.post_inspection_ocimf_comment_rounds c
          where c.observation_item_id = i.id
          and public.csvb_ocimf_normalize_text(c.ocimf_author_raw) = public.csvb_ocimf_normalize_text(v->>'ocimf_author_raw')
          and (public.csvb_ocimf_normalize_text(c.ocimf_timestamp_raw) = public.csvb_ocimf_normalize_text(v->>'ocimf_timestamp_raw')
            or c.ocimf_timestamp = public.csvb_ocimf_parse_timestamp(v->>'ocimf_timestamp_raw'))
          order by c.imported_at desc, c.source_order desc limit 1;
        v_revision := found;
      end if;
      if v_revision and not coalesce((v->>'revision_approved')::boolean, false) then
        raise exception 'Possible revision requires explicit approval. No updates applied.';
      end if;
      v_appended := v_appended + 1;
    else raise exception 'Unsupported round action.'; end if;
    insert into public.post_inspection_ocimf_comment_rounds (
      observation_item_id, report_id, company_id, round_kind,
      immediate_cause, root_cause, corrective_action, preventative_action,
      ocimf_timestamp_raw, ocimf_timestamp, ocimf_author_raw, imported_by,
      source_page, source_section, source_order, source_pdf_fingerprint, supersedes_id
    ) values (
      i.id, r.id, r.company_id, case when v_kind in ('initial', 'initial_receipt') then 'initial' else 'subsequent' end,
      v->>'immediate_cause', v->>'root_cause', v->>'corrective_action', v->>'preventative_action',
      nullif(v->>'ocimf_timestamp_raw', ''), public.csvb_ocimf_parse_timestamp(v->>'ocimf_timestamp_raw'),
      nullif(v->>'ocimf_author_raw', ''), auth.uid(),
      (v->>'source_page')::integer, (v->>'source_section')::integer, (v->>'source_order')::integer,
      p_pdf_fingerprint, v_supersedes
    ) returning id into v_id;
  end loop;
  return jsonb_build_object('initial_applied', v_initial, 'appended', v_appended,
    'receipts', v_receipts, 'duplicates', v_duplicates, 'applied', v_initial + v_appended);
end;
$$;
revoke all on function public.csvb_post_inspection_comment_rounds_for_me(uuid) from public, anon;
revoke all on function public.csvb_post_inspection_import_comment_rounds_for_me(uuid, jsonb, text) from public, anon;
grant execute on function public.csvb_post_inspection_comment_rounds_for_me(uuid) to authenticated;
grant execute on function public.csvb_post_inspection_import_comment_rounds_for_me(uuid, jsonb, text) to authenticated;
comment on table public.post_inspection_ocimf_comment_rounds is
  'Append-only imported OCIMF responses: initial provenance receipts and subsequent rounds. Manual subcomments are never repurposed. Restrictive FKs protect history from findings replacement.';
