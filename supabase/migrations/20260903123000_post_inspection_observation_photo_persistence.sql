-- Post-inspection Inspector-uploaded observation photo persistence.
--
-- Required private Supabase Storage bucket:
--   id: post-inspection-photos
--   public: false
--   file_size_limit: 10485760
--   allowed_mime_types: image/jpeg
--
-- Storage objects must be uploaded and deleted through the Storage API.
-- Operator-uploaded photos are never eligible for these tables.

do $$
begin
  if to_regclass('public.post_inspection_reports') is null then
    raise exception
      'Required table public.post_inspection_reports is missing.';
  end if;

  if to_regclass(
    'public.post_inspection_observation_items'
  ) is null then
    raise exception
      'Required table public.post_inspection_observation_items is missing.';
  end if;

  if to_regprocedure(
    'public.is_platform_admin()'
  ) is null then
    raise exception
      'Required function public.is_platform_admin() is missing.';
  end if;

  if to_regprocedure(
    'public.current_profile_company_id()'
  ) is null then
    raise exception
      'Required function public.current_profile_company_id() is missing.';
  end if;

  if to_regprocedure(
    'public.current_profile_vessel_id()'
  ) is null then
    raise exception
      'Required function public.current_profile_vessel_id() is missing.';
  end if;
end
$$;

create table if not exists
  public.post_inspection_photo_assets (
    id uuid primary key default gen_random_uuid(),

    report_id uuid not null
      references public.post_inspection_reports(id)
      on delete cascade,

    storage_bucket text not null
      default 'post-inspection-photos',

    storage_path text not null,
    content_sha256 text not null,

    mime_type text not null
      default 'image/jpeg',

    size_bytes bigint not null,
    width integer not null,
    height integer not null,

    created_by uuid null,
    created_at timestamptz not null default now(),

    constraint post_inspection_photo_assets_bucket_chk
      check (
        storage_bucket = 'post-inspection-photos'
      ),

    constraint post_inspection_photo_assets_hash_chk
      check (
        content_sha256 ~ '^[0-9a-f]{64}$'
      ),

    constraint post_inspection_photo_assets_mime_chk
      check (
        mime_type = 'image/jpeg'
      ),

    constraint post_inspection_photo_assets_size_chk
      check (
        size_bytes > 0
        and size_bytes <= 10485760
      ),

    constraint post_inspection_photo_assets_dimensions_chk
      check (
        width > 0
        and height > 0
      ),

    constraint post_inspection_photo_assets_path_chk
      check (
        storage_path =
          report_id::text
          || '/'
          || content_sha256
          || '.jpg'
      ),

    constraint post_inspection_photo_assets_report_hash_uq
      unique (
        report_id,
        content_sha256
      ),

    constraint post_inspection_photo_assets_storage_path_uq
      unique (
        storage_bucket,
        storage_path
      )
  );

create table if not exists
  public.post_inspection_observation_photos (
    id uuid primary key default gen_random_uuid(),

    observation_item_id uuid not null
      references public.post_inspection_observation_items(id)
      on delete cascade,

    photo_asset_id uuid not null
      references public.post_inspection_photo_assets(id)
      on delete cascade,

    source_kind text not null
      default 'inspector_uploaded',

    source_heading text not null
      default 'Inspector uploaded photos',

    source_page integer not null,
    source_resource_name text null,

    association_status text not null,
    sort_index integer not null default 0,

    created_by uuid null,
    created_at timestamptz not null default now(),

    constraint post_inspection_observation_photos_source_kind_chk
      check (
        source_kind = 'inspector_uploaded'
      ),

    constraint post_inspection_observation_photos_heading_chk
      check (
        lower(btrim(source_heading)) =
          'inspector uploaded photos'
      ),

    constraint post_inspection_observation_photos_page_chk
      check (
        source_page > 0
      ),

    constraint post_inspection_observation_photos_association_chk
      check (
        association_status in (
          'exact_question_single_finding',
          'manual_confirmed'
        )
      ),

    constraint post_inspection_observation_photos_sort_chk
      check (
        sort_index >= 0
      ),

    constraint post_inspection_observation_photos_item_asset_uq
      unique (
        observation_item_id,
        photo_asset_id
      )
  );

create index if not exists
  post_inspection_observation_photos_asset_idx
on public.post_inspection_observation_photos(
  photo_asset_id
);

create index if not exists
  post_inspection_observation_photos_item_sort_idx
on public.post_inspection_observation_photos(
  observation_item_id,
  sort_index
);

create or replace function
  public.csvb_validate_post_inspection_observation_photo()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_observation_report_id uuid;
  v_observation_type text;
  v_asset_report_id uuid;
begin
  select
    i.report_id,
    i.obs_type
  into
    v_observation_report_id,
    v_observation_type
  from public.post_inspection_observation_items i
  where i.id = new.observation_item_id;

  if not found then
    raise exception
      'Observation item % does not exist.',
      new.observation_item_id
      using errcode = '23503';
  end if;

  select a.report_id
  into v_asset_report_id
  from public.post_inspection_photo_assets a
  where a.id = new.photo_asset_id;

  if not found then
    raise exception
      'Photo asset % does not exist.',
      new.photo_asset_id
      using errcode = '23503';
  end if;

  if v_observation_report_id <> v_asset_report_id then
    raise exception
      'The observation and photo asset belong to different reports.'
      using errcode = '23514';
  end if;

  if v_observation_type not in (
    'negative',
    'largely'
  ) then
    raise exception
      'Photos may only be linked to Negative or Largely as Expected observations.'
      using errcode = '23514';
  end if;

  return new;
end
$$;

drop trigger if exists
  trg_validate_post_inspection_observation_photo
on public.post_inspection_observation_photos;

create trigger
  trg_validate_post_inspection_observation_photo
before insert or update
on public.post_inspection_observation_photos
for each row
execute function
  public.csvb_validate_post_inspection_observation_photo();

revoke all
on function
  public.csvb_validate_post_inspection_observation_photo()
from public, anon;

grant execute
on function
  public.csvb_validate_post_inspection_observation_photo()
to authenticated, service_role;

alter table public.post_inspection_photo_assets
  enable row level security;

alter table public.post_inspection_observation_photos
  enable row level security;

revoke all
on table
  public.post_inspection_photo_assets,
  public.post_inspection_observation_photos
from public, anon, authenticated;

grant select
on table
  public.post_inspection_photo_assets,
  public.post_inspection_observation_photos
to authenticated;

grant select, insert, update, delete
on table
  public.post_inspection_photo_assets,
  public.post_inspection_observation_photos
to service_role;

drop policy if exists
  post_inspection_photo_assets_select
on public.post_inspection_photo_assets;

create policy
  post_inspection_photo_assets_select
on public.post_inspection_photo_assets
for select
to authenticated
using (
  (select public.is_platform_admin())
  or exists (
    select 1
    from public.post_inspection_reports r
    where
      r.id =
        post_inspection_photo_assets.report_id
      and (
        r.company_id =
          (
            select
              public.current_profile_company_id()
          )
        or r.vessel_id =
          (
            select
              public.current_profile_vessel_id()
          )
      )
  )
);

drop policy if exists
  post_inspection_observation_photos_select
on public.post_inspection_observation_photos;

create policy
  post_inspection_observation_photos_select
on public.post_inspection_observation_photos
for select
to authenticated
using (
  (select public.is_platform_admin())
  or exists (
    select 1
    from public.post_inspection_observation_items i
    join public.post_inspection_reports r
      on r.id = i.report_id
    where
      i.id =
        post_inspection_observation_photos.observation_item_id
      and (
        r.company_id =
          (
            select
              public.current_profile_company_id()
          )
        or r.vessel_id =
          (
            select
              public.current_profile_vessel_id()
          )
      )
  )
);

drop policy if exists
  post_inspection_photos_storage_select
on storage.objects;

create policy
  post_inspection_photos_storage_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'post-inspection-photos'
  and exists (
    select 1
    from public.post_inspection_photo_assets a
    join public.post_inspection_reports r
      on r.id = a.report_id
    where
      a.storage_bucket =
        storage.objects.bucket_id
      and a.storage_path =
        storage.objects.name
      and (
        (select public.is_platform_admin())
        or r.company_id =
          (
            select
              public.current_profile_company_id()
          )
        or r.vessel_id =
          (
            select
              public.current_profile_vessel_id()
          )
      )
  )
);

comment on table
  public.post_inspection_photo_assets
is
  'Deduplicated Inspector-uploaded JPEG assets retained only for eligible post-inspection findings.';

comment on table
  public.post_inspection_observation_photos
is
  'Links Inspector-uploaded photos to exact Negative or Largely as Expected observation items.';
