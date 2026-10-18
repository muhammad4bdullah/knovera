create extension if not exists pgcrypto;

do $$ begin
  create type public.organization_role as enum (
    'owner',
    'administrator',
    'academic_coordinator',
    'teacher',
    'student',
    'observer'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.question_review_status as enum ('draft', 'reviewed', 'archived');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.paper_version_status as enum ('draft', 'published', 'archived');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 160),
  organization_type text not null default 'school',
  owner_user_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (id, owner_user_id)
);

create table if not exists public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.organization_role not null,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index if not exists organization_memberships_user_org_idx
  on public.organization_memberships (user_id, organization_id)
  where removed_at is null;

create or replace function public.has_org_role(
  target_organization_id uuid,
  allowed_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = target_organization_id
      and membership.user_id = auth.uid()
      and membership.removed_at is null
      and membership.role::text = any (allowed_roles)
  );
$$;

create or replace function public.is_org_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = target_organization_id
      and membership.user_id = auth.uid()
      and membership.removed_at is null
  );
$$;

create or replace function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.create_profile_for_auth_user();

create or replace function public.add_organization_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.organization_memberships (organization_id, user_id, role)
  values (new.id, new.owner_user_id, 'owner')
  on conflict (organization_id, user_id) do nothing;
  return new;
end;
$$;

create or replace function public.prevent_organization_owner_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.owner_user_id <> new.owner_user_id then
    raise exception 'Organization ownership transfer requires a dedicated workflow.';
  end if;
  return new;
end;
$$;

drop trigger if exists organization_owner_is_immutable on public.organizations;
create trigger organization_owner_is_immutable
  before update on public.organizations
  for each row execute function public.prevent_organization_owner_change();

create or replace function public.prevent_organization_scope_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if (to_jsonb(old) ->> 'organization_id') is distinct from (to_jsonb(new) ->> 'organization_id') then
    raise exception 'Organization ownership cannot be changed after a record is created.';
  end if;
  return new;
end;
$$;

drop trigger if exists on_organization_created_add_owner on public.organizations;
create trigger on_organization_created_add_owner
  after insert on public.organizations
  for each row execute function public.add_organization_owner();

create table if not exists public.curricula (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  source_reference text,
  version_label text not null default '1',
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (id, organization_id)
);

create table if not exists public.learning_outcomes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  curriculum_id uuid not null,
  code text not null check (char_length(code) between 1 and 40),
  subject text not null,
  topic text not null,
  statement text not null check (char_length(statement) between 1 and 2000),
  description text not null default '',
  status text not null default 'active' check (status in ('active', 'deprecated', 'superseded')),
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (curriculum_id, code),
  foreign key (curriculum_id, organization_id)
    references public.curricula (id, organization_id) on delete cascade
);

create index if not exists learning_outcomes_org_subject_idx
  on public.learning_outcomes (organization_id, subject, topic);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  outcome_id uuid not null,
  title text not null check (char_length(title) between 1 and 160),
  question_type text not null check (
    question_type in ('multiple_choice', 'multiple_select', 'true_false', 'short_answer', 'long_answer', 'structured')
  ),
  difficulty text not null check (difficulty in ('introductory', 'intermediate', 'advanced')),
  marks integer not null check (marks between 1 and 1000),
  prompt text not null check (char_length(prompt) between 1 and 20000),
  review_status public.question_review_status not null default 'draft',
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (outcome_id, organization_id)
    references public.learning_outcomes (id, organization_id) on delete restrict
);

create index if not exists questions_org_outcome_status_idx
  on public.questions (organization_id, outcome_id, review_status);

create table if not exists public.question_answer_keys (
  question_id uuid not null,
  organization_id uuid not null,
  answer_text text not null,
  marking_scheme jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (question_id, organization_id),
  foreign key (question_id, organization_id)
    references public.questions (id, organization_id) on delete cascade
);

create table if not exists public.papers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  subject text not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (id, organization_id)
);

create table if not exists public.paper_versions (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null,
  organization_id uuid not null,
  version_number integer not null check (version_number > 0),
  status public.paper_version_status not null default 'draft',
  target_marks integer not null check (target_marks > 0),
  question_snapshot jsonb not null default '[]'::jsonb,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (paper_id, version_number),
  unique (id, organization_id),
  check ((status = 'published') = (published_at is not null)),
  foreign key (paper_id, organization_id)
    references public.papers (id, organization_id) on delete cascade
);

create or replace function public.validate_paper_publication()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  item jsonb;
  question_record public.questions%rowtype;
  total integer := 0;
  seen_ids uuid[] := array[]::uuid[];
  question_id_text text;
  question_marks integer;
begin
  if new.status <> 'published' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    raise exception 'Create a draft paper version, then publish it.';
  end if;
  if old.status = 'published' then
    raise exception 'Published paper versions are immutable.';
  end if;
  if jsonb_typeof(new.question_snapshot) <> 'array' then
    raise exception 'A published paper must contain a question list.';
  end if;
  if jsonb_array_length(new.question_snapshot) = 0 then
    raise exception 'A published paper must contain at least one question.';
  end if;

  for item in select value from jsonb_array_elements(new.question_snapshot)
  loop
    if jsonb_typeof(item) <> 'object'
       or item ?| array['answer', 'answer_key', 'marking_scheme']
       or coalesce(item ->> 'question_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or coalesce(item ->> 'marks', '') !~ '^[1-9][0-9]*$' then
      raise exception 'Paper snapshots require a question ID and positive marks, and must not contain answer keys.';
    end if;

    question_id_text := item ->> 'question_id';
    question_marks := (item ->> 'marks')::integer;
    if question_id_text::uuid = any(seen_ids) then
      raise exception 'A paper cannot include the same question more than once.';
    end if;
    seen_ids := array_append(seen_ids, question_id_text::uuid);

    select * into question_record
    from public.questions question
    where question.id = question_id_text::uuid
      and question.organization_id = new.organization_id
      and question.review_status = 'reviewed';
    if not found then
      raise exception 'Every published question must be reviewed and belong to this organization.';
    end if;
    if question_record.marks <> question_marks
       or question_record.prompt is distinct from item ->> 'prompt'
       or question_record.title is distinct from item ->> 'title' then
      raise exception 'The published question snapshot does not match its reviewed source question.';
    end if;
    total := total + question_marks;
  end loop;

  if total <> new.target_marks then
    raise exception 'The paper mark total does not match its target.';
  end if;
  new.published_at := coalesce(new.published_at, now());
  return new;
end;
$$;

drop trigger if exists validate_paper_publication_before_update on public.paper_versions;
create trigger validate_paper_publication_before_update
  before insert or update on public.paper_versions
  for each row execute function public.validate_paper_publication();

create index if not exists paper_versions_org_paper_idx
  on public.paper_versions (organization_id, paper_id, version_number desc);

create or replace function public.prevent_published_paper_version_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.status = 'published' then
    raise exception 'Published paper versions are immutable; create a new version instead.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists published_paper_versions_are_immutable on public.paper_versions;
create trigger published_paper_versions_are_immutable
  before update or delete on public.paper_versions
  for each row execute function public.prevent_published_paper_version_mutation();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists questions_touch_updated_at on public.questions;
create trigger questions_touch_updated_at
  before update on public.questions
  for each row execute function public.touch_updated_at();

do $$
declare
  scoped_table text;
begin
  foreach scoped_table in array array[
    'organization_memberships',
    'curricula',
    'learning_outcomes',
    'questions',
    'question_answer_keys',
    'papers',
    'paper_versions'
  ]
  loop
    execute format(
      'drop trigger if exists organization_scope_is_immutable on public.%I',
      scoped_table
    );
    execute format(
      'create trigger organization_scope_is_immutable before update on public.%I for each row execute function public.prevent_organization_scope_change()',
      scoped_table
    );
  end loop;
end $$;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.curricula enable row level security;
alter table public.learning_outcomes enable row level security;
alter table public.questions enable row level security;
alter table public.question_answer_keys enable row level security;
alter table public.papers enable row level security;
alter table public.paper_versions enable row level security;

drop policy if exists profiles_read_self on public.profiles;
create policy profiles_read_self on public.profiles
  for select to authenticated
  using (id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists organizations_read_members on public.organizations;
create policy organizations_read_members on public.organizations
  for select to authenticated
  using (public.is_org_member(id));

drop policy if exists organizations_create_owner on public.organizations;
create policy organizations_create_owner on public.organizations
  for insert to authenticated
  with check (owner_user_id = auth.uid());

drop policy if exists organizations_update_admins on public.organizations;
create policy organizations_update_admins on public.organizations
  for update to authenticated
  using (public.has_org_role(id, array['owner', 'administrator']))
  with check (public.has_org_role(id, array['owner', 'administrator']));

drop policy if exists memberships_read_self_or_admin on public.organization_memberships;
create policy memberships_read_self_or_admin on public.organization_memberships
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.has_org_role(organization_id, array['owner', 'administrator'])
  );

drop policy if exists memberships_add_admin on public.organization_memberships;
create policy memberships_add_admin on public.organization_memberships
  for insert to authenticated
  with check (
    role <> 'owner'
    and (role <> 'administrator' or public.has_org_role(organization_id, array['owner']))
    and public.has_org_role(organization_id, array['owner', 'administrator'])
  );

drop policy if exists memberships_remove_non_owner on public.organization_memberships;
create policy memberships_remove_non_owner on public.organization_memberships
  for delete to authenticated
  using (
    role <> 'owner'
    and (role <> 'administrator' or public.has_org_role(organization_id, array['owner']))
    and public.has_org_role(organization_id, array['owner', 'administrator'])
  );

drop policy if exists curricula_read_members on public.curricula;
create policy curricula_read_members on public.curricula
  for select to authenticated using (public.is_org_member(organization_id));

drop policy if exists curricula_manage_academics on public.curricula;
create policy curricula_manage_academics on public.curricula
  for all to authenticated
  using (public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator']))
  with check (public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator']));

drop policy if exists outcomes_read_members on public.learning_outcomes;
create policy outcomes_read_members on public.learning_outcomes
  for select to authenticated using (public.is_org_member(organization_id));

drop policy if exists outcomes_manage_academics on public.learning_outcomes;
create policy outcomes_manage_academics on public.learning_outcomes
  for all to authenticated
  using (public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator']))
  with check (public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator']));

drop policy if exists questions_read_staff on public.questions;
create policy questions_read_staff on public.questions
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator', 'teacher']));

drop policy if exists questions_manage_staff on public.questions;
create policy questions_manage_staff on public.questions
  for all to authenticated
  using (public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator', 'teacher']))
  with check (public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator', 'teacher']));

drop policy if exists answer_keys_read_staff on public.question_answer_keys;
create policy answer_keys_read_staff on public.question_answer_keys
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator', 'teacher']));

drop policy if exists answer_keys_manage_staff on public.question_answer_keys;
create policy answer_keys_manage_staff on public.question_answer_keys
  for all to authenticated
  using (public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator', 'teacher']))
  with check (public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator', 'teacher']));

drop policy if exists papers_read_staff on public.papers;
create policy papers_read_staff on public.papers
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator', 'teacher']));

drop policy if exists papers_manage_staff on public.papers;
create policy papers_manage_staff on public.papers
  for all to authenticated
  using (public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator', 'teacher']))
  with check (public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator', 'teacher']));

drop policy if exists paper_versions_read_staff on public.paper_versions;
create policy paper_versions_read_staff on public.paper_versions
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator', 'teacher']));

drop policy if exists paper_versions_create_staff on public.paper_versions;
create policy paper_versions_create_staff on public.paper_versions
  for insert to authenticated
  with check (
    status = 'draft'
    and published_at is null
    and public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator', 'teacher'])
  );

drop policy if exists paper_versions_update_drafts on public.paper_versions;
create policy paper_versions_update_drafts on public.paper_versions
  for update to authenticated
  using (
    status = 'draft'
    and public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator', 'teacher'])
  )
  with check (public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator', 'teacher']));

revoke all on function public.has_org_role(uuid, text[]) from public;
revoke all on function public.is_org_member(uuid) from public;
grant execute on function public.has_org_role(uuid, text[]) to authenticated;
grant execute on function public.is_org_member(uuid) to authenticated;
