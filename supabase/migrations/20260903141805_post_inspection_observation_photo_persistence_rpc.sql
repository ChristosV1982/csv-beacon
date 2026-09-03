-- Reproduce the live post-inspection observation-photo persistence RPC.
-- Operator-uploaded photos remain ineligible.
-- Execution is restricted to service_role.

CREATE OR REPLACE FUNCTION public.csvb_persist_post_inspection_observation_photos(p_report_id uuid, p_created_by uuid, p_entries jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_entry jsonb;
  v_observation jsonb;
  v_photo jsonb;

  v_question_no text;
  v_question_full text;
  v_obs_type text;
  v_observation_type text;
  v_designation text;
  v_positive_rank text;
  v_nature_of_concern text;
  v_classification_coding text;
  v_observation_text text;
  v_pgno_selected jsonb;
  v_page_hint integer;
  v_source_excerpt text;
  v_confidence numeric;

  v_hash text;
  v_storage_path text;
  v_size_bytes bigint;
  v_width integer;
  v_height integer;
  v_source_page integer;
  v_resource_name text;
  v_association_status text;

  v_observation_item_id uuid;
  v_photo_asset_id uuid;
  v_link_id uuid;

  v_existing_storage_path text;
  v_existing_size_bytes bigint;
  v_existing_width integer;
  v_existing_height integer;

  v_observation_sort_index integer;
  v_link_sort_index integer;

  v_observation_created boolean;
  v_asset_created boolean;
  v_link_created boolean;

  v_results jsonb := '[]'::jsonb;

  v_entries_processed integer := 0;
  v_observations_created integer := 0;
  v_assets_created integer := 0;
  v_links_created integer := 0;
begin
  if p_report_id is null then
    raise exception
      'p_report_id is required.'
      using errcode = '22023';
  end if;

  if p_created_by is null then
    raise exception
      'p_created_by is required.'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_created_by
  ) then
    raise exception
      'The importing profile does not exist.'
      using errcode = '23503';
  end if;

  if not exists (
    select 1
    from public.post_inspection_reports r
    where r.id = p_report_id
  ) then
    raise exception
      'The post-inspection report does not exist.'
      using errcode = '23503';
  end if;

  if jsonb_typeof(p_entries) is distinct from 'array' then
    raise exception
      'p_entries must be a JSON array.'
      using errcode = '22023';
  end if;

  if jsonb_array_length(p_entries) < 1 then
    raise exception
      'p_entries cannot be empty.'
      using errcode = '22023';
  end if;

  if jsonb_array_length(p_entries) > 100 then
    raise exception
      'A maximum of 100 photo entries is permitted.'
      using errcode = '22023';
  end if;

  for v_entry in
    select value
    from jsonb_array_elements(p_entries)
  loop
    v_observation_created := false;
    v_asset_created := false;
    v_link_created := false;

    v_observation := v_entry -> 'observation';
    v_photo := v_entry -> 'photo';

    if jsonb_typeof(v_observation)
         is distinct from 'object'
    then
      raise exception
        'Each entry requires an observation object.'
        using errcode = '22023';
    end if;

    if jsonb_typeof(v_photo)
         is distinct from 'object'
    then
      raise exception
        'Each entry requires a photo object.'
        using errcode = '22023';
    end if;

    v_question_no :=
      nullif(btrim(v_observation ->> 'question_no'), '');

    v_question_full :=
      nullif(btrim(v_observation ->> 'question_full'), '');

    v_obs_type :=
      nullif(btrim(v_observation ->> 'obs_type'), '');

    v_designation :=
      nullif(btrim(v_observation ->> 'designation'), '');

    v_positive_rank :=
      nullif(btrim(v_observation ->> 'positive_rank'), '');

    v_nature_of_concern :=
      nullif(
        btrim(v_observation ->> 'nature_of_concern'),
        ''
      );

    v_classification_coding :=
      nullif(
        btrim(v_observation ->> 'classification_coding'),
        ''
      );

    v_observation_text :=
      nullif(
        btrim(v_observation ->> 'observation_text'),
        ''
      );

    v_pgno_selected :=
      coalesce(
        v_observation -> 'pgno_selected',
        '[]'::jsonb
      );

    v_page_hint :=
      case
        when nullif(
          v_observation ->> 'page_hint',
          ''
        ) is null
        then null
        else (
          v_observation ->> 'page_hint'
        )::integer
      end;

    v_source_excerpt :=
      nullif(
        btrim(v_observation ->> 'source_excerpt'),
        ''
      );

    v_confidence :=
      case
        when nullif(
          v_observation ->> 'confidence',
          ''
        ) is null
        then null
        else (
          v_observation ->> 'confidence'
        )::numeric
      end;

    if v_question_no is null
       or v_question_no !~ '^[0-9]+(\.[0-9]+)+$'
    then
      raise exception
        'Invalid observation question number.'
        using errcode = '22023';
    end if;

    if v_obs_type not in (
      'negative',
      'largely'
    ) then
      raise exception
        'Only Negative or Largely as Expected observations are eligible.'
        using errcode = '23514';
    end if;

    if v_designation not in (
      'Human',
      'Process',
      'Hardware',
      'Photo'
    ) then
      raise exception
        'Invalid observation designation.'
        using errcode = '23514';
    end if;

    if v_observation_text is null then
      raise exception
        'Observation text is required.'
        using errcode = '22023';
    end if;

    if jsonb_typeof(v_pgno_selected)
         is distinct from 'array'
    then
      raise exception
        'pgno_selected must be a JSON array.'
        using errcode = '22023';
    end if;

    v_observation_type :=
      case
        when v_obs_type = 'negative'
          then 'negative_observation'
        else 'note_improvement'
      end;

    v_hash :=
      lower(
        nullif(
          btrim(v_photo ->> 'content_sha256'),
          ''
        )
      );

    v_size_bytes :=
      (v_photo ->> 'size_bytes')::bigint;

    v_width :=
      (v_photo ->> 'width')::integer;

    v_height :=
      (v_photo ->> 'height')::integer;

    v_source_page :=
      (v_photo ->> 'source_page')::integer;

    v_resource_name :=
      nullif(
        btrim(v_photo ->> 'resource_name'),
        ''
      );

    v_association_status :=
      nullif(
        btrim(v_photo ->> 'association_status'),
        ''
      );

    if v_hash is null
       or v_hash !~ '^[0-9a-f]{64}$'
    then
      raise exception
        'Invalid photo SHA-256 value.'
        using errcode = '22023';
    end if;

    if v_size_bytes < 1
       or v_size_bytes > 10485760
    then
      raise exception
        'Invalid photo size.'
        using errcode = '23514';
    end if;

    if v_width < 1 or v_height < 1 then
      raise exception
        'Invalid photo dimensions.'
        using errcode = '23514';
    end if;

    if v_source_page < 1 then
      raise exception
        'Invalid source page.'
        using errcode = '23514';
    end if;

    if v_association_status <>
       'exact_question_single_finding'
    then
      raise exception
        'Only exact single-finding photo associations may be automatically persisted.'
        using errcode = '23514';
    end if;

    v_storage_path :=
      p_report_id::text
      || '/'
      || v_hash
      || '.jpg';

    select i.id
    into v_observation_item_id
    from public.post_inspection_observation_items i
    where i.report_id = p_report_id
      and coalesce(
        nullif(btrim(i.question_base), ''),
        btrim(i.question_no)
      ) = v_question_no
      and i.obs_type = v_obs_type
      and lower(
        regexp_replace(
          btrim(coalesce(i.observation_text, '')),
          '\s+',
          ' ',
          'g'
        )
      ) =
      lower(
        regexp_replace(
          v_observation_text,
          '\s+',
          ' ',
          'g'
        )
      )
    order by i.created_at, i.id
    limit 1;

    if not found then
      select
        coalesce(max(i.sort_index), -1) + 1
      into v_observation_sort_index
      from public.post_inspection_observation_items i
      where i.report_id = p_report_id;

      insert into public.post_inspection_observation_items (
        report_id,
        question_no,
        question_base,
        question_full,
        has_observation,
        observation_type,
        obs_type,
        designation,
        positive_rank,
        nature_of_concern,
        classification_coding,
        observation_text,
        remarks,
        pgno_selected,
        page_hint,
        source_excerpt,
        confidence,
        sort_index
      )
      values (
        p_report_id,
        v_question_no,
        v_question_no,
        v_question_full,
        true,
        v_observation_type,
        v_obs_type,
        v_designation,
        v_positive_rank,
        v_nature_of_concern,
        v_classification_coding,
        v_observation_text,
        v_observation_text,
        v_pgno_selected,
        v_page_hint,
        v_source_excerpt,
        v_confidence,
        v_observation_sort_index
      )
      returning id
      into v_observation_item_id;

      v_observation_created := true;
      v_observations_created :=
        v_observations_created + 1;
    end if;

    select
      a.id,
      a.storage_path,
      a.size_bytes,
      a.width,
      a.height
    into
      v_photo_asset_id,
      v_existing_storage_path,
      v_existing_size_bytes,
      v_existing_width,
      v_existing_height
    from public.post_inspection_photo_assets a
    where a.report_id = p_report_id
      and a.content_sha256 = v_hash
    limit 1;

    if not found then
      insert into public.post_inspection_photo_assets (
        report_id,
        storage_bucket,
        storage_path,
        content_sha256,
        mime_type,
        size_bytes,
        width,
        height,
        created_by
      )
      values (
        p_report_id,
        'post-inspection-photos',
        v_storage_path,
        v_hash,
        'image/jpeg',
        v_size_bytes,
        v_width,
        v_height,
        p_created_by
      )
      returning id
      into v_photo_asset_id;

      v_asset_created := true;
      v_assets_created := v_assets_created + 1;
    else
      if v_existing_storage_path <> v_storage_path
         or v_existing_size_bytes <> v_size_bytes
         or v_existing_width <> v_width
         or v_existing_height <> v_height
      then
        raise exception
          'Existing photo metadata does not match the supplied SHA-256 asset.'
          using errcode = '23514';
      end if;
    end if;

    select p.id
    into v_link_id
    from public.post_inspection_observation_photos p
    where p.observation_item_id =
            v_observation_item_id
      and p.photo_asset_id =
            v_photo_asset_id
    limit 1;

    if not found then
      select
        coalesce(max(p.sort_index), -1) + 1
      into v_link_sort_index
      from public.post_inspection_observation_photos p
      where p.observation_item_id =
              v_observation_item_id;

      insert into
        public.post_inspection_observation_photos (
          observation_item_id,
          photo_asset_id,
          source_kind,
          source_heading,
          source_page,
          source_resource_name,
          association_status,
          sort_index,
          created_by
        )
      values (
        v_observation_item_id,
        v_photo_asset_id,
        'inspector_uploaded',
        'Inspector uploaded photos',
        v_source_page,
        v_resource_name,
        v_association_status,
        v_link_sort_index,
        p_created_by
      )
      returning id
      into v_link_id;

      v_link_created := true;
      v_links_created := v_links_created + 1;
    end if;

    v_entries_processed := v_entries_processed + 1;

    v_results :=
      v_results ||
      jsonb_build_array(
        jsonb_build_object(
          'question_no', v_question_no,
          'observation_item_id',
            v_observation_item_id,
          'photo_asset_id',
            v_photo_asset_id,
          'observation_photo_link_id',
            v_link_id,
          'storage_path',
            v_storage_path,
          'observation_created',
            v_observation_created,
          'asset_created',
            v_asset_created,
          'link_created',
            v_link_created
        )
      );
  end loop;

  return jsonb_build_object(
    'ok', true,
    'report_id', p_report_id,
    'entries_processed', v_entries_processed,
    'observations_created',
      v_observations_created,
    'photo_assets_created',
      v_assets_created,
    'photo_links_created',
      v_links_created,
    'results', v_results
  );
end
$function$
;

revoke all on function public.csvb_persist_post_inspection_observation_photos(uuid, uuid, jsonb) from public;
revoke all on function public.csvb_persist_post_inspection_observation_photos(uuid, uuid, jsonb) from anon;
revoke all on function public.csvb_persist_post_inspection_observation_photos(uuid, uuid, jsonb) from authenticated;
grant execute on function public.csvb_persist_post_inspection_observation_photos(uuid, uuid, jsonb) to service_role;
