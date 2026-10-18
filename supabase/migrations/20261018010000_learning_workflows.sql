create table if not exists public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (char_length(email) between 3 and 254),
  role public.organization_role not null check (role <> 'owner'),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  invited_by uuid not null references auth.users (id) on delete restrict,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (accepted_at is null or revoked_at is null)
);

create index if not exists organization_invitations_org_created_idx
  on public.organization_invitations (organization_id, created_at desc);

alter table public.organization_invitations enable row level security;

create policy invitations_admin_read on public.organization_invitations
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'administrator']));

create policy invitations_admin_create on public.organization_invitations
  for insert to authenticated
  with check (
    invited_by = auth.uid()
    and public.has_org_role(organization_id, array['owner', 'administrator'])
    and (role <> 'administrator' or public.has_org_role(organization_id, array['owner']))
  );

create or replace function public.preview_organization_invitation(invitation_token_hash text)
returns table (
  invitation_email text,
  invitation_role public.organization_role,
  invitation_expires_at timestamptz,
  invitation_accepted_at timestamptz,
  invitation_revoked_at timestamptz,
  organization_name text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select invitation.email,
         invitation.role,
         invitation.expires_at,
         invitation.accepted_at,
         invitation.revoked_at,
         organization.name
  from public.organization_invitations invitation
  join public.organizations organization on organization.id = invitation.organization_id
  where invitation.token_hash = invitation_token_hash
    and invitation.token_hash ~ '^[0-9a-f]{64}$'
  limit 1;
$$;

create or replace function public.revoke_organization_invitation(invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.organization_invitations%rowtype;
begin
  select * into target
  from public.organization_invitations
  where id = invitation_id
  for update;

  if not found or not public.has_org_role(target.organization_id, array['owner', 'administrator']) then
    raise exception 'Invitation not found or not authorized.';
  end if;
  if target.role = 'administrator'
     and not public.has_org_role(target.organization_id, array['owner']) then
    raise exception 'Only an organization owner can revoke an administrator invitation.';
  end if;
  if target.accepted_at is not null or target.revoked_at is not null then
    raise exception 'Only outstanding invitations can be revoked.';
  end if;

  update public.organization_invitations
  set revoked_at = now()
  where id = target.id;
end;
$$;

create or replace function public.accept_organization_invitation(invitation_token_hash text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  invitation public.organization_invitations%rowtype;
  current_email text;
begin
  if auth.uid() is null then
    raise exception 'Sign in before accepting an invitation.';
  end if;

  current_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  select *
    into invitation
  from public.organization_invitations
  where token_hash = invitation_token_hash
  for update;

  if not found
     or invitation.token_hash !~ '^[0-9a-f]{64}$'
     or invitation.expires_at <= now()
     or invitation.revoked_at is not null
     or invitation.accepted_at is not null
     or lower(invitation.email) <> current_email then
    raise exception 'This invitation is invalid, expired, already used, or belongs to another email.';
  end if;

  insert into public.organization_memberships (organization_id, user_id, role)
  values (invitation.organization_id, auth.uid(), invitation.role)
  on conflict (organization_id, user_id)
  do update set role = excluded.role, removed_at = null
  where public.organization_memberships.removed_at is not null;

  update public.organization_invitations
  set accepted_at = now()
  where id = invitation.id;
end;
$$;

revoke all on function public.preview_organization_invitation(text) from public;
revoke all on function public.accept_organization_invitation(text) from public;
grant execute on function public.preview_organization_invitation(text) to anon, authenticated;
grant execute on function public.accept_organization_invitation(text) to authenticated;
grant execute on function public.revoke_organization_invitation(uuid) to authenticated;

create table if not exists public.classrooms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  curriculum_id uuid,
  name text not null check (char_length(name) between 1 and 160),
  subject text not null,
  academic_period text not null default '',
  enrollment_code_hash text unique check (enrollment_code_hash is null or enrollment_code_hash ~ '^[0-9a-f]{64}$'),
  enrollment_expires_at timestamptz,
  created_by uuid not null references auth.users (id) on delete restrict,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (curriculum_id, organization_id)
    references public.curricula (id, organization_id) on delete restrict
);

create table if not exists public.class_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  classroom_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('teacher', 'student', 'observer')),
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (classroom_id, user_id),
  foreign key (classroom_id, organization_id)
    references public.classrooms (id, organization_id) on delete cascade,
  foreign key (organization_id, user_id)
    references public.organization_memberships (organization_id, user_id) on delete cascade
);

create index if not exists classrooms_org_idx on public.classrooms (organization_id, name);
create index if not exists class_memberships_user_idx
  on public.class_memberships (user_id, classroom_id)
  where removed_at is null;

create or replace function public.has_class_role(target_classroom_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.class_memberships membership
    join public.organization_memberships organization_membership
      on organization_membership.organization_id = membership.organization_id
     and organization_membership.user_id = membership.user_id
     and organization_membership.removed_at is null
    where membership.classroom_id = target_classroom_id
      and membership.user_id = auth.uid()
      and membership.removed_at is null
      and membership.role = any (allowed_roles)
  );
$$;

revoke all on function public.has_class_role(uuid, text[]) from public;
grant execute on function public.has_class_role(uuid, text[]) to authenticated;

create or replace function public.enroll_in_class(enrollment_code_hash text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.classrooms%rowtype;
  organization_role text;
begin
  if auth.uid() is null or enrollment_code_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'A valid signed-in student and class code are required.';
  end if;

  select membership.role::text
    into organization_role
  from public.organization_memberships membership
  join public.classrooms classroom on classroom.organization_id = membership.organization_id
  where classroom.enrollment_code_hash = enroll_in_class.enrollment_code_hash
    and classroom.archived_at is null
    and (classroom.enrollment_expires_at is null or classroom.enrollment_expires_at > now())
    and membership.user_id = auth.uid()
    and membership.removed_at is null;

  if organization_role is distinct from 'student' then
    raise exception 'An active student organization membership is required.';
  end if;

  select * into target
  from public.classrooms classroom
  where classroom.enrollment_code_hash = enroll_in_class.enrollment_code_hash
    and classroom.archived_at is null
    and (classroom.enrollment_expires_at is null or classroom.enrollment_expires_at > now());

  if not found then
    raise exception 'This class code is invalid or expired.';
  end if;

  insert into public.class_memberships (organization_id, classroom_id, user_id, role)
  values (target.organization_id, target.id, auth.uid(), 'student')
  on conflict (classroom_id, user_id)
  do update set removed_at = null
  where public.class_memberships.removed_at is not null;

  return target.id;
end;
$$;

revoke all on function public.enroll_in_class(text) from public;
grant execute on function public.enroll_in_class(text) to authenticated;

create or replace function public.validate_class_membership()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  organization_role text;
begin
  select membership.role::text
    into organization_role
  from public.organization_memberships membership
  where membership.organization_id = new.organization_id
    and membership.user_id = new.user_id
    and membership.removed_at is null;

  if organization_role is null then
    raise exception 'Class members must have an active organization membership.';
  end if;

  if new.role = 'teacher' and organization_role not in ('owner', 'administrator', 'academic_coordinator', 'teacher') then
    raise exception 'This organization member cannot be assigned as a class teacher.';
  end if;
  if new.role = 'student' and organization_role <> 'student' then
    raise exception 'Only student organization members can be enrolled as students.';
  end if;

  if tg_op = 'UPDATE' and (
    new.classroom_id <> old.classroom_id
    or new.organization_id <> old.organization_id
    or new.user_id <> old.user_id
  ) then
    raise exception 'Class membership identity cannot be changed.';
  end if;

  return new;
end;
$$;

create trigger validate_class_membership_before_write
  before insert or update on public.class_memberships
  for each row execute function public.validate_class_membership();

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  classroom_id uuid not null,
  title text not null check (char_length(title) between 1 and 200),
  instructions text not null default '',
  due_at timestamptz,
  target_marks integer check (target_marks is null or target_marks > 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  answer_release_at timestamptz,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (id, organization_id, classroom_id),
  foreign key (classroom_id, organization_id)
    references public.classrooms (id, organization_id) on delete cascade
);

create table if not exists public.assignment_questions (
  assignment_id uuid not null,
  organization_id uuid not null,
  classroom_id uuid not null,
  question_id uuid not null,
  position integer not null check (position >= 0),
  marks_override integer check (marks_override > 0),
  primary key (assignment_id, question_id),
  foreign key (assignment_id, organization_id, classroom_id)
    references public.assignments (id, organization_id, classroom_id) on delete cascade,
  foreign key (question_id, organization_id)
    references public.questions (id, organization_id) on delete restrict
);

create table if not exists public.assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  classroom_id uuid not null,
  assignment_id uuid not null,
  student_id uuid not null references auth.users (id) on delete restrict,
  response_data jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'reviewed', 'returned')),
  submitted_at timestamptz,
  mark_awarded integer check (mark_awarded >= 0),
  teacher_feedback text,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (assignment_id, student_id),
  unique (id, organization_id, classroom_id),
  foreign key (assignment_id, organization_id, classroom_id)
    references public.assignments (id, organization_id, classroom_id) on delete cascade
);

create or replace function public.protect_assignment_submission()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and (
    new.id <> old.id
    or new.organization_id <> old.organization_id
    or new.classroom_id <> old.classroom_id
    or new.assignment_id <> old.assignment_id
    or new.student_id <> old.student_id
    or new.created_at <> old.created_at
  ) then
    raise exception 'Submission identity cannot be changed.';
  end if;

  if new.student_id = auth.uid() and not public.has_class_role(new.classroom_id, array['teacher']) then
    if tg_op = 'INSERT' and (
      new.mark_awarded is not null
      or new.teacher_feedback is not null
      or new.reviewed_by is not null
      or new.reviewed_at is not null
    ) then
      raise exception 'Students cannot submit grading or teacher-feedback fields.';
    end if;
    if tg_op = 'UPDATE' and (
      new.mark_awarded is distinct from old.mark_awarded
      or new.teacher_feedback is distinct from old.teacher_feedback
      or new.reviewed_by is distinct from old.reviewed_by
      or new.reviewed_at is distinct from old.reviewed_at
    ) then
      raise exception 'Students cannot change grading or teacher-feedback fields.';
    end if;
    if new.status = 'submitted' and new.submitted_at is null then
      new.submitted_at := now();
    end if;
    if new.status not in ('draft', 'submitted') then
      raise exception 'Students may only save a draft or submit their work.';
    end if;
    if new.status = 'submitted' then
      new.submitted_at := case when tg_op = 'UPDATE' then coalesce(old.submitted_at, now()) else now() end;
      if exists (
        select 1 from public.assignments assignment
        where assignment.id = new.assignment_id
          and (
            assignment.status <> 'published'
            or (assignment.due_at is not null and assignment.due_at <= now())
          )
      ) then
        raise exception 'This assignment is closed or past its deadline.';
      end if;
    else
      new.submitted_at := null;
    end if;
  elsif tg_op = 'UPDATE' and new.reviewed_by is distinct from old.reviewed_by then
    if new.reviewed_by is not null and new.reviewed_by <> auth.uid() then
      raise exception 'The reviewer must be the signed-in staff member.';
    end if;
    if new.reviewed_by is not null then
      new.reviewed_at := coalesce(new.reviewed_at, now());
    end if;
  end if;

  if new.mark_awarded is not null and exists (
    select 1 from public.assignments assignment
    where assignment.id = new.assignment_id
      and assignment.target_marks is not null
      and new.mark_awarded > assignment.target_marks
  ) then
    raise exception 'Awarded marks cannot exceed the assignment maximum.';
  end if;

  return new;
end;
$$;

create trigger protect_assignment_submission_before_write
  before insert or update on public.assignment_submissions
  for each row execute function public.protect_assignment_submission();

create index if not exists assignments_class_status_due_idx
  on public.assignments (organization_id, classroom_id, status, due_at);
create index if not exists submissions_student_status_idx
  on public.assignment_submissions (student_id, status, submitted_at desc);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  classroom_id uuid,
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '',
  due_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (id, organization_id, classroom_id),
  unique (id, organization_id),
  foreign key (classroom_id, organization_id)
    references public.classrooms (id, organization_id) on delete cascade
);

create table if not exists public.project_outcomes (
  project_id uuid not null,
  organization_id uuid not null,
  outcome_id uuid not null,
  primary key (project_id, outcome_id),
  foreign key (project_id, organization_id)
    references public.projects (id, organization_id) on delete cascade,
  foreign key (outcome_id, organization_id)
    references public.learning_outcomes (id, organization_id) on delete restrict
);

create table if not exists public.project_submissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  student_id uuid not null references auth.users (id) on delete restrict,
  submission_version integer not null default 1 check (submission_version > 0),
  evidence_text text not null default '',
  status text not null default 'in_progress'
    check (status in ('in_progress', 'submitted', 'under_review', 'changes_requested', 'evaluated')),
  submitted_at timestamptz,
  feedback text,
  evaluated_by uuid references auth.users (id) on delete set null,
  evaluated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (project_id, student_id, submission_version),
  unique (id, organization_id),
  foreign key (project_id, organization_id)
    references public.projects (id, organization_id) on delete cascade
);

create or replace function public.protect_project_submission()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and (
    new.id <> old.id
    or new.organization_id <> old.organization_id
    or new.project_id <> old.project_id
    or new.student_id <> old.student_id
    or new.submission_version <> old.submission_version
    or new.created_at <> old.created_at
  ) then
    raise exception 'Project submission identity cannot be changed.';
  end if;

  if new.student_id = auth.uid()
     and not exists (
       select 1 from public.projects project
       where project.id = new.project_id
         and project.classroom_id is not null
         and public.has_class_role(project.classroom_id, array['teacher'])
     ) then
    if tg_op = 'INSERT' and (new.feedback is not null or new.evaluated_by is not null or new.evaluated_at is not null) then
      raise exception 'Students cannot submit teacher-feedback fields.';
    end if;
    if tg_op = 'UPDATE' and (
      new.feedback is distinct from old.feedback
      or new.evaluated_by is distinct from old.evaluated_by
      or new.evaluated_at is distinct from old.evaluated_at
    ) then
      raise exception 'Students cannot change teacher-feedback fields.';
    end if;
    if new.status not in ('in_progress', 'submitted') then
      raise exception 'Students may only save work or submit it for review.';
    end if;
    if new.status = 'submitted' and new.submitted_at is null then
      new.submitted_at := now();
    end if;
    if new.status = 'in_progress' then
      new.submitted_at := null;
    end if;
  elsif tg_op = 'UPDATE' and new.evaluated_by is distinct from old.evaluated_by then
    if new.evaluated_by is not null and new.evaluated_by <> auth.uid() then
      raise exception 'The evaluator must be the signed-in staff member.';
    end if;
    if new.evaluated_by is not null then
      new.evaluated_at := coalesce(new.evaluated_at, now());
    end if;
  end if;

  return new;
end;
$$;

create trigger protect_project_submission_before_write
  before insert or update on public.project_submissions
  for each row execute function public.protect_project_submission();

create table if not exists public.rubrics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (id, organization_id)
);

create table if not exists public.rubric_criteria (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  rubric_id uuid not null,
  outcome_id uuid,
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '',
  max_points integer not null check (max_points > 0),
  position integer not null check (position >= 0),
  unique (id, organization_id),
  foreign key (rubric_id, organization_id)
    references public.rubrics (id, organization_id) on delete cascade,
  foreign key (outcome_id, organization_id)
    references public.learning_outcomes (id, organization_id) on delete restrict
);

create table if not exists public.rubric_evaluations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_submission_id uuid not null,
  criterion_id uuid not null references public.rubric_criteria (id) on delete restrict,
  evaluator_id uuid not null references auth.users (id) on delete restrict,
  points integer not null check (points >= 0),
  feedback text not null default '',
  evaluated_at timestamptz not null default now(),
  foreign key (project_submission_id, organization_id)
    references public.project_submissions (id, organization_id) on delete cascade,
  foreign key (criterion_id, organization_id)
    references public.rubric_criteria (id, organization_id) on delete restrict
);

create or replace function public.validate_rubric_evaluation_points()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  maximum integer;
begin
  select max_points into maximum
  from public.rubric_criteria
  where id = new.criterion_id
    and organization_id = new.organization_id;
  if maximum is null or new.points > maximum then
    raise exception 'Rubric points must be within the criterion maximum.';
  end if;
  return new;
end;
$$;

create trigger validate_rubric_evaluation_before_write
  before insert or update on public.rubric_evaluations
  for each row execute function public.validate_rubric_evaluation_points();

create index if not exists projects_org_status_due_idx on public.projects (organization_id, status, due_at);
create index if not exists project_submissions_student_idx
  on public.project_submissions (student_id, status, submitted_at desc);

create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  actor_id uuid not null references auth.users (id) on delete restrict,
  action text not null check (char_length(action) between 1 and 120),
  entity_type text not null check (char_length(entity_type) between 1 and 80),
  entity_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.learning_outcome_prerequisites (
  organization_id uuid not null,
  outcome_id uuid not null,
  prerequisite_outcome_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (outcome_id, prerequisite_outcome_id),
  check (outcome_id <> prerequisite_outcome_id),
  foreign key (outcome_id, organization_id)
    references public.learning_outcomes (id, organization_id) on delete cascade,
  foreign key (prerequisite_outcome_id, organization_id)
    references public.learning_outcomes (id, organization_id) on delete cascade
);

create or replace function public.prevent_outcome_prerequisite_cycle()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if exists (
    with recursive transitive_prerequisites(outcome_id) as (
      select edge.prerequisite_outcome_id
      from public.learning_outcome_prerequisites edge
      where edge.organization_id = new.organization_id
        and edge.outcome_id = new.prerequisite_outcome_id
      union
      select edge.prerequisite_outcome_id
      from public.learning_outcome_prerequisites edge
      join transitive_prerequisites chain on edge.outcome_id = chain.outcome_id
      where edge.organization_id = new.organization_id
    )
    select 1 from transitive_prerequisites where outcome_id = new.outcome_id
  ) then
    raise exception 'Learning outcome prerequisites cannot contain a cycle.';
  end if;
  return new;
end;
$$;

create trigger prevent_outcome_prerequisite_cycle_before_insert
  before insert or update on public.learning_outcome_prerequisites
  for each row execute function public.prevent_outcome_prerequisite_cycle();

create table if not exists public.learning_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  classroom_id uuid not null,
  student_id uuid not null references auth.users (id) on delete restrict,
  outcome_id uuid not null,
  evidence_type text not null check (evidence_type in ('assignment', 'project', 'teacher_observation')),
  source_id uuid,
  evidence_summary text not null default '',
  recorded_by uuid not null references auth.users (id) on delete restrict,
  recorded_at timestamptz not null default now(),
  foreign key (classroom_id, organization_id)
    references public.classrooms (id, organization_id) on delete cascade,
  foreign key (outcome_id, organization_id)
    references public.learning_outcomes (id, organization_id) on delete restrict
);

create index if not exists learning_evidence_student_outcome_idx
  on public.learning_evidence (student_id, outcome_id, recorded_at desc);

create index if not exists audit_events_org_created_idx
  on public.audit_events (organization_id, created_at desc);

create or replace function public.record_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  record_data jsonb;
  organization_key text;
  entity_key text;
begin
  record_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  organization_key := coalesce(record_data ->> 'organization_id', record_data ->> 'id');
  entity_key := coalesce(record_data ->> 'id', record_data ->> 'question_id', record_data ->> 'user_id', '');

  if auth.uid() is not null
     and organization_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    insert into public.audit_events (organization_id, actor_id, action, entity_type, entity_id)
    values (
      organization_key::uuid,
      auth.uid(),
      lower(tg_op) || ':' || tg_table_name,
      tg_table_name,
      entity_key
    );
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

do $$
declare
  audited_table text;
begin
  foreach audited_table in array array[
    'organizations',
    'organization_memberships',
    'organization_invitations',
    'curricula',
    'learning_outcomes',
    'questions',
    'papers',
    'paper_versions',
    'classrooms',
    'class_memberships',
    'assignments',
    'assignment_submissions',
    'projects',
    'project_submissions',
    'rubric_evaluations'
  ]
  loop
    execute format(
      'create trigger audit_%I after insert or update or delete on public.%I for each row execute function public.record_audit_event()',
      audited_table,
      audited_table
    );
  end loop;
end $$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'classrooms',
    'class_memberships',
    'assignments',
    'assignment_questions',
    'assignment_submissions',
    'projects',
    'project_outcomes',
    'project_submissions',
    'rubrics',
    'rubric_criteria',
    'rubric_evaluations',
    'audit_events',
    'learning_outcome_prerequisites',
    'learning_evidence'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'classrooms',
    'class_memberships',
    'assignments',
    'assignment_questions',
    'assignment_submissions',
    'projects',
    'project_outcomes',
    'project_submissions',
    'rubrics',
    'rubric_criteria',
    'rubric_evaluations',
    'audit_events',
    'learning_outcome_prerequisites',
    'learning_evidence'
  ]
  loop
    execute format(
      'create trigger organization_scope_is_immutable before update on public.%I for each row execute function public.prevent_organization_scope_change()',
      table_name
    );
  end loop;
end $$;

create policy classrooms_read_members on public.classrooms
  for select to authenticated
  using (
    public.is_org_member(organization_id)
    and (
      public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator'])
      or public.has_class_role(id, array['teacher', 'student', 'observer'])
    )
  );
create policy classrooms_manage_academics on public.classrooms
  for all to authenticated
  using (public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator']))
  with check (public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator']));

create policy outcome_prerequisites_read_members on public.learning_outcome_prerequisites
  for select to authenticated using (public.is_org_member(organization_id));
create policy outcome_prerequisites_manage_academics on public.learning_outcome_prerequisites
  for all to authenticated
  using (public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator']))
  with check (public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator']));

create policy class_memberships_read_class on public.class_memberships
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator'])
    or public.has_class_role(classroom_id, array['teacher'])
  );
create policy class_memberships_manage_staff on public.class_memberships
  for insert to authenticated
  with check (
    public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator'])
  );
create policy class_memberships_update_staff on public.class_memberships
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator']))
  with check (public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator']));
create policy class_memberships_remove_staff on public.class_memberships
  for delete to authenticated
  using (public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator']));

create policy assignments_read_class on public.assignments
  for select to authenticated
  using (
    public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator'])
    or public.has_class_role(classroom_id, array['teacher'])
    or (
      status in ('published', 'closed')
      and public.has_class_role(classroom_id, array['student', 'observer'])
    )
  );
create policy assignments_manage_teachers on public.assignments
  for all to authenticated
  using (
    public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator'])
    or public.has_class_role(classroom_id, array['teacher'])
  )
  with check (
    public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator'])
    or public.has_class_role(classroom_id, array['teacher'])
  );

create policy assignment_questions_read_class on public.assignment_questions
  for select to authenticated
  using (
    public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator'])
    or public.has_class_role(classroom_id, array['teacher', 'student', 'observer'])
  );
create policy assignment_questions_manage_teachers on public.assignment_questions
  for all to authenticated
  using (
    public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator'])
    or public.has_class_role(classroom_id, array['teacher'])
  )
  with check (
    public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator'])
    or public.has_class_role(classroom_id, array['teacher'])
  );

create policy assignment_submissions_read_authorized on public.assignment_submissions
  for select to authenticated
  using (
    student_id = auth.uid()
    or public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator'])
    or public.has_class_role(classroom_id, array['teacher'])
  );
create policy assignment_submissions_insert_own on public.assignment_submissions
  for insert to authenticated
  with check (
    student_id = auth.uid()
    and status = 'draft'
    and public.has_class_role(classroom_id, array['student'])
    and exists (
      select 1 from public.assignments assignment
      where assignment.id = assignment_submissions.assignment_id
        and assignment.status = 'published'
        and (assignment.due_at is null or assignment.due_at > now())
    )
  );
create policy assignment_submissions_update_authorized on public.assignment_submissions
  for update to authenticated
  using (
    (student_id = auth.uid() and status in ('draft', 'returned'))
    or public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator'])
    or public.has_class_role(classroom_id, array['teacher'])
  )
  with check (
    (
      student_id = auth.uid()
      and status in ('draft', 'submitted')
      and public.has_class_role(classroom_id, array['student'])
    )
    or public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator'])
    or public.has_class_role(classroom_id, array['teacher'])
  );

create policy projects_read_class on public.projects
  for select to authenticated
  using (
    public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator'])
    or (classroom_id is not null and public.has_class_role(classroom_id, array['teacher']))
    or (
      status in ('published', 'closed')
      and classroom_id is not null
      and public.has_class_role(classroom_id, array['student', 'observer'])
    )
  );
create policy projects_manage_teachers on public.projects
  for all to authenticated
  using (
    public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator'])
    or (classroom_id is not null and public.has_class_role(classroom_id, array['teacher']))
  )
  with check (
    public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator'])
    or (classroom_id is not null and public.has_class_role(classroom_id, array['teacher']))
  );

create policy project_outcomes_read_class on public.project_outcomes
  for select to authenticated
  using (
    public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator'])
    or exists (
      select 1 from public.projects project
      where project.id = project_outcomes.project_id
        and project.classroom_id is not null
        and public.has_class_role(project.classroom_id, array['teacher', 'student', 'observer'])
    )
  );
create policy project_outcomes_manage_staff on public.project_outcomes
  for all to authenticated
  using (
    public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator'])
    or exists (
      select 1 from public.projects project
      where project.id = project_outcomes.project_id
        and project.classroom_id is not null
        and public.has_class_role(project.classroom_id, array['teacher'])
    )
  )
  with check (
    public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator'])
    or exists (
      select 1 from public.projects project
      where project.id = project_outcomes.project_id
        and project.classroom_id is not null
        and public.has_class_role(project.classroom_id, array['teacher'])
    )
  );

create policy project_submissions_read_authorized on public.project_submissions
  for select to authenticated
  using (
    student_id = auth.uid()
    or public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator'])
    or exists (
      select 1 from public.projects project
      where project.id = project_submissions.project_id
        and project.classroom_id is not null
        and public.has_class_role(project.classroom_id, array['teacher'])
    )
  );
create policy project_submissions_create_own on public.project_submissions
  for insert to authenticated
  with check (
    student_id = auth.uid()
    and status in ('in_progress', 'submitted')
    and exists (
      select 1 from public.projects project
      where project.id = project_submissions.project_id
        and project.status = 'published'
        and project.classroom_id is not null
        and public.has_class_role(project.classroom_id, array['student'])
    )
  );
create policy project_submissions_update_authorized on public.project_submissions
  for update to authenticated
  using (
    (student_id = auth.uid() and status in ('in_progress', 'changes_requested'))
    or public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator'])
    or exists (
      select 1 from public.projects project
      where project.id = project_submissions.project_id
        and project.classroom_id is not null
        and public.has_class_role(project.classroom_id, array['teacher'])
    )
  )
  with check (
    student_id = auth.uid()
    or public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator'])
    or exists (
      select 1 from public.projects project
      where project.id = project_submissions.project_id
        and project.classroom_id is not null
        and public.has_class_role(project.classroom_id, array['teacher'])
    )
  );

create policy rubrics_read_members on public.rubrics
  for select to authenticated using (public.is_org_member(organization_id));
create policy rubrics_manage_staff on public.rubrics
  for all to authenticated
  using (public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator', 'teacher']))
  with check (public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator', 'teacher']));
create policy rubric_criteria_read_members on public.rubric_criteria
  for select to authenticated using (public.is_org_member(organization_id));
create policy rubric_criteria_manage_staff on public.rubric_criteria
  for all to authenticated
  using (public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator', 'teacher']))
  with check (public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator', 'teacher']));
create policy rubric_evaluations_read_authorized on public.rubric_evaluations
  for select to authenticated
  using (
    public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator'])
    or exists (
      select 1
      from public.project_submissions submission
      join public.projects project on project.id = submission.project_id
      where submission.id = rubric_evaluations.project_submission_id
        and (
          submission.student_id = auth.uid()
          or (project.classroom_id is not null and public.has_class_role(project.classroom_id, array['teacher']))
        )
    )
  );
create policy rubric_evaluations_manage_teachers on public.rubric_evaluations
  for all to authenticated
  using (
    public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator'])
    or exists (
      select 1
      from public.project_submissions submission
      join public.projects project on project.id = submission.project_id
      where submission.id = rubric_evaluations.project_submission_id
        and project.classroom_id is not null
        and public.has_class_role(project.classroom_id, array['teacher'])
    )
  )
  with check (
    evaluator_id = auth.uid()
    and (
      public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator'])
      or exists (
        select 1
        from public.project_submissions submission
        join public.projects project on project.id = submission.project_id
        where submission.id = rubric_evaluations.project_submission_id
          and project.classroom_id is not null
          and public.has_class_role(project.classroom_id, array['teacher'])
      )
    )
  );

create policy audit_read_admins on public.audit_events
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'administrator']));

create policy learning_evidence_read_authorized on public.learning_evidence
  for select to authenticated
  using (
    student_id = auth.uid()
    or public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator'])
    or public.has_class_role(classroom_id, array['teacher'])
  );
create policy learning_evidence_insert_teachers on public.learning_evidence
  for insert to authenticated
  with check (
    recorded_by = auth.uid()
    and (
      public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator'])
      or public.has_class_role(classroom_id, array['teacher'])
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'organization-private',
  'organization-private',
  false,
  15728640,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/csv',
    'image/jpeg',
    'image/png'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'student-evidence',
  'student-evidence',
  false,
  15728640,
  array['application/pdf', 'text/plain', 'image/jpeg', 'image/png']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy organization_files_read_members on storage.objects
  for select to authenticated
  using (
    bucket_id = 'organization-private'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

create policy organization_files_upload_staff on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'organization-private'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and public.has_org_role(((storage.foldername(name))[1])::uuid, array['owner', 'administrator', 'academic_coordinator', 'teacher'])
  );

create policy organization_files_delete_admins on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'organization-private'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and public.has_org_role(((storage.foldername(name))[1])::uuid, array['owner', 'administrator'])
  );

create policy student_evidence_read_private on storage.objects
  for select to authenticated
  using (
    bucket_id = 'student-evidence'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (storage.foldername(name))[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and exists (
      select 1 from public.classrooms classroom
      where classroom.id = ((storage.foldername(name))[2])::uuid
        and classroom.organization_id = ((storage.foldername(name))[1])::uuid
    )
    and (
      ((storage.foldername(name))[3])::uuid = auth.uid()
      or public.has_org_role(((storage.foldername(name))[1])::uuid, array['owner', 'administrator', 'academic_coordinator'])
      or public.has_class_role(((storage.foldername(name))[2])::uuid, array['teacher'])
    )
  );

create policy student_evidence_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'student-evidence'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (storage.foldername(name))[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and ((storage.foldername(name))[3])::uuid = auth.uid()
    and public.has_class_role(((storage.foldername(name))[2])::uuid, array['student'])
    and exists (
      select 1 from public.classrooms classroom
      where classroom.id = ((storage.foldername(name))[2])::uuid
        and classroom.organization_id = ((storage.foldername(name))[1])::uuid
    )
  );

create policy student_evidence_delete_owner_or_staff on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'student-evidence'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (storage.foldername(name))[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (
      ((storage.foldername(name))[3])::uuid = auth.uid()
      or public.has_org_role(((storage.foldername(name))[1])::uuid, array['owner', 'administrator'])
    )
    and exists (
      select 1 from public.classrooms classroom
      where classroom.id = ((storage.foldername(name))[2])::uuid
        and classroom.organization_id = ((storage.foldername(name))[1])::uuid
    )
  );
