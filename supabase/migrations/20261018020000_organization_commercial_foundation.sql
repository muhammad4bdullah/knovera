alter table public.organizations
  add constraint organizations_supported_type_check
  check (organization_type in (
    'school',
    'institute',
    'academy',
    'tutoring_center',
    'teacher_workspace',
    'other'
  ));

create or replace function public.prevent_organization_type_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.organization_type <> old.organization_type then
    raise exception 'Organization type cannot be changed after registration.';
  end if;
  return new;
end;
$$;

create trigger organization_type_is_immutable
  before update on public.organizations
  for each row execute function public.prevent_organization_type_change();

create table public.organization_subscriptions (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  plan_type text not null check (plan_type in ('institute', 'academy')),
  currency text not null default 'PKR' check (currency = 'PKR'),
  monthly_amount integer not null check (monthly_amount = 2000),
  status text not null default 'not_configured'
    check (status in ('not_configured', 'pending', 'active', 'past_due', 'canceled')),
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  period_starts_at timestamptz,
  period_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    status <> 'active'
    or (
      provider is not null
      and provider_subscription_id is not null
      and period_starts_at is not null
      and period_ends_at is not null
    )
  )
);

create index organization_subscriptions_status_idx
  on public.organization_subscriptions (status, period_ends_at);

alter table public.organization_subscriptions enable row level security;

create policy organization_subscriptions_read_admins on public.organization_subscriptions
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'administrator']));

create or replace function public.create_organization_subscription_record()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  plan text;
begin
  plan := case
    when new.organization_type in ('school', 'institute') then 'institute'
    when new.organization_type in ('academy', 'tutoring_center') then 'academy'
    else null
  end;

  if plan is not null then
    insert into public.organization_subscriptions (
      organization_id,
      plan_type,
      currency,
      monthly_amount,
      status
    )
    values (new.id, plan, 'PKR', 2000, 'not_configured');
  end if;
  return new;
end;
$$;

create trigger organizations_create_subscription_record
  after insert on public.organizations
  for each row execute function public.create_organization_subscription_record();

insert into public.organization_subscriptions (
  organization_id,
  plan_type,
  currency,
  monthly_amount,
  status
)
select
  organization.id,
  case
    when organization.organization_type in ('school', 'institute') then 'institute'
    else 'academy'
  end,
  'PKR',
  2000,
  'not_configured'
from public.organizations organization
where organization.organization_type in ('school', 'institute', 'academy', 'tutoring_center')
on conflict (organization_id) do nothing;

create or replace function public.prevent_subscription_identity_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.organization_id <> old.organization_id
     or new.plan_type <> old.plan_type
     or new.currency <> old.currency
     or new.monthly_amount <> old.monthly_amount then
    raise exception 'Subscription ownership and plan pricing cannot be changed through this workflow.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger organization_subscription_identity_is_immutable
  before update on public.organization_subscriptions
  for each row execute function public.prevent_subscription_identity_change();

create table public.organization_relationships (
  id uuid primary key default gen_random_uuid(),
  source_organization_id uuid not null references public.organizations (id) on delete cascade,
  target_organization_id uuid not null references public.organizations (id) on delete cascade,
  relationship_type text not null check (
    relationship_type in ('parent', 'affiliate', 'partner', 'other')
  ),
  status text not null default 'pending' check (status in ('pending', 'active', 'declined')),
  requested_by uuid not null references auth.users (id) on delete restrict,
  responded_by uuid references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (source_organization_id <> target_organization_id),
  check (
    (status = 'pending' and responded_by is null and responded_at is null)
    or (status <> 'pending' and responded_by is not null and responded_at is not null)
  ),
  unique (source_organization_id, target_organization_id)
);

create index organization_relationships_target_idx
  on public.organization_relationships (target_organization_id, status);

create unique index organization_relationships_undirected_pair_idx
  on public.organization_relationships (
    least(source_organization_id, target_organization_id),
    greatest(source_organization_id, target_organization_id)
  );

alter table public.organization_relationships enable row level security;

create policy organization_relationships_read_members on public.organization_relationships
  for select to authenticated
  using (
    public.is_org_member(source_organization_id)
    or public.is_org_member(target_organization_id)
  );

create policy organization_relationships_request_source_owner on public.organization_relationships
  for insert to authenticated
  with check (
    requested_by = auth.uid()
    and status = 'pending'
    and responded_by is null
    and responded_at is null
    and public.has_org_role(source_organization_id, array['owner'])
  );

create policy organization_relationships_update_target_owner on public.organization_relationships
  for update to authenticated
  using (
    status = 'pending'
    and public.has_org_role(target_organization_id, array['owner'])
  )
  with check (
    status in ('active', 'declined')
    and responded_by = auth.uid()
    and responded_at is not null
    and public.has_org_role(target_organization_id, array['owner'])
  );

create or replace function public.prevent_organization_relationship_identity_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.source_organization_id <> old.source_organization_id
     or new.target_organization_id <> old.target_organization_id
     or new.relationship_type <> old.relationship_type
     or new.requested_by <> old.requested_by
     or new.created_at <> old.created_at
     or old.status <> 'pending'
     or new.status not in ('active', 'declined') then
    raise exception 'Relationship identity is immutable and only a pending request can be answered.';
  end if;
  return new;
end;
$$;

create trigger organization_relationship_identity_is_immutable
  before update on public.organization_relationships
  for each row execute function public.prevent_organization_relationship_identity_change();

create or replace function public.respond_to_organization_relationship(
  relationship_id uuid,
  accept_request boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  relationship public.organization_relationships%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in before responding to an organization relationship.';
  end if;

  select * into relationship
  from public.organization_relationships
  where id = relationship_id
  for update;

  if not found
     or relationship.status <> 'pending'
     or not public.has_org_role(relationship.target_organization_id, array['owner']) then
    raise exception 'Relationship request not found or not authorized.';
  end if;

  update public.organization_relationships
  set status = case when accept_request then 'active' else 'declined' end,
      responded_by = auth.uid(),
      responded_at = now()
  where id = relationship.id;
end;
$$;

revoke all on function public.respond_to_organization_relationship(uuid, boolean) from public;
grant execute on function public.respond_to_organization_relationship(uuid, boolean) to authenticated;

create or replace function public.create_question_with_answer_key(
  target_organization_id uuid,
  target_outcome_id uuid,
  question_title text,
  question_type text,
  question_difficulty text,
  question_marks integer,
  question_prompt text,
  question_answer text
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  created_question_id uuid;
begin
  if auth.uid() is null
     or not public.has_org_role(target_organization_id, array['owner', 'administrator', 'academic_coordinator', 'teacher']) then
    raise exception 'You are not authorized to create questions for this organization.';
  end if;
  if question_title is null
     or char_length(btrim(question_title)) < 1
     or char_length(question_title) > 160
     or question_type is null
     or question_type not in ('multiple_choice', 'multiple_select', 'true_false', 'short_answer', 'long_answer', 'structured')
     or question_difficulty is null
     or question_difficulty not in ('introductory', 'intermediate', 'advanced')
     or question_marks is null
     or question_marks < 1
     or question_marks > 1000
     or question_prompt is null
     or char_length(btrim(question_prompt)) < 1
     or char_length(question_prompt) > 20000
     or question_answer is null
     or char_length(btrim(question_answer)) < 1
     or char_length(question_answer) > 20000 then
    raise exception 'Question fields are invalid.';
  end if;

  insert into public.questions (
    organization_id,
    outcome_id,
    title,
    question_type,
    difficulty,
    marks,
    prompt,
    created_by
  )
  values (
    target_organization_id,
    target_outcome_id,
    btrim(question_title),
    question_type,
    question_difficulty,
    question_marks,
    btrim(question_prompt),
    auth.uid()
  )
  returning id into created_question_id;

  insert into public.question_answer_keys (question_id, organization_id, answer_text)
  values (created_question_id, target_organization_id, btrim(question_answer));

  return created_question_id;
end;
$$;

revoke all on function public.create_question_with_answer_key(uuid, uuid, text, text, text, integer, text, text) from public;
grant execute on function public.create_question_with_answer_key(uuid, uuid, text, text, text, integer, text, text) to authenticated;

create or replace function public.create_paper_with_draft_version(
  target_organization_id uuid,
  paper_title text,
  target_marks integer,
  selected_question_ids uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  created_paper_id uuid;
  question_total integer;
  selected_count integer;
  question_snapshot jsonb;
  subject_name text;
begin
  if auth.uid() is null
     or not public.has_org_role(target_organization_id, array['owner', 'administrator', 'academic_coordinator', 'teacher']) then
    raise exception 'You are not authorized to create a paper for this organization.';
  end if;
  if paper_title is null
     or char_length(btrim(paper_title)) < 1
     or char_length(paper_title) > 200
     or target_marks is null
     or target_marks < 1
     or selected_question_ids is null
     or cardinality(selected_question_ids) < 1 then
    raise exception 'Paper title, target marks, and at least one question are required.';
  end if;
  if cardinality(selected_question_ids) <> (
    select count(distinct question_id)
    from unnest(selected_question_ids) as selected(question_id)
  ) then
    raise exception 'A question cannot be selected more than once.';
  end if;

  select
    count(*)::integer,
    coalesce(sum(question.marks), 0)::integer,
    jsonb_agg(
      jsonb_build_object(
        'question_id', question.id,
        'title', question.title,
        'prompt', question.prompt,
        'marks', question.marks
      )
      order by array_position(selected_question_ids, question.id)
    ),
    case when count(distinct outcome.subject) = 1 then min(outcome.subject) else 'Mixed subjects' end
  into selected_count, question_total, question_snapshot, subject_name
  from public.questions question
  join public.learning_outcomes outcome
    on outcome.id = question.outcome_id
   and outcome.organization_id = question.organization_id
  where question.organization_id = target_organization_id
    and question.id = any(selected_question_ids)
    and question.review_status = 'reviewed';

  if selected_count <> cardinality(selected_question_ids) then
    raise exception 'Every selected question must be reviewed and belong to this organization.';
  end if;
  if question_total <> target_marks then
    raise exception 'The selected question marks must equal the paper target.';
  end if;

  insert into public.papers (organization_id, title, subject, created_by)
  values (target_organization_id, btrim(paper_title), subject_name, auth.uid())
  returning id into created_paper_id;

  insert into public.paper_versions (
    paper_id,
    organization_id,
    version_number,
    status,
    target_marks,
    question_snapshot,
    created_by
  )
  values (
    created_paper_id,
    target_organization_id,
    1,
    'draft',
    target_marks,
    question_snapshot,
    auth.uid()
  );

  return created_paper_id;
end;
$$;

revoke all on function public.create_paper_with_draft_version(uuid, text, integer, uuid[]) from public;
grant execute on function public.create_paper_with_draft_version(uuid, text, integer, uuid[]) to authenticated;

create table public.assignment_submission_reviews (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique,
  organization_id uuid not null,
  classroom_id uuid not null,
  assignment_id uuid not null,
  mark_awarded integer check (mark_awarded is null or mark_awarded >= 0),
  teacher_feedback text,
  reviewer_id uuid not null references auth.users (id) on delete restrict,
  reviewed_at timestamptz not null default now(),
  foreign key (submission_id, organization_id, classroom_id)
    references public.assignment_submissions (id, organization_id, classroom_id) on delete cascade,
  foreign key (assignment_id, organization_id, classroom_id)
    references public.assignments (id, organization_id, classroom_id) on delete cascade
);

insert into public.assignment_submission_reviews (
  submission_id,
  organization_id,
  classroom_id,
  assignment_id,
  mark_awarded,
  teacher_feedback,
  reviewer_id,
  reviewed_at
)
select
  submission.id,
  submission.organization_id,
  submission.classroom_id,
  submission.assignment_id,
  submission.mark_awarded,
  submission.teacher_feedback,
  coalesce(submission.reviewed_by, assignment.created_by),
  coalesce(submission.reviewed_at, now())
from public.assignment_submissions submission
join public.assignments assignment
  on assignment.id = submission.assignment_id
 and assignment.organization_id = submission.organization_id
 and assignment.classroom_id = submission.classroom_id
where submission.mark_awarded is not null
   or submission.teacher_feedback is not null
on conflict (submission_id) do nothing;

update public.assignment_submissions
set mark_awarded = null,
    teacher_feedback = null,
    reviewed_by = null,
    reviewed_at = null
where mark_awarded is not null
   or teacher_feedback is not null
   or reviewed_by is not null
   or reviewed_at is not null;

alter table public.assignment_submission_reviews enable row level security;

revoke all on public.assignment_submission_reviews from anon, authenticated;
grant select, insert, update on public.assignment_submission_reviews to authenticated;

create policy assignment_reviews_read_staff on public.assignment_submission_reviews
  for select to authenticated
  using (
    public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator'])
    or public.has_class_role(classroom_id, array['teacher'])
  );

create policy assignment_reviews_read_released_student on public.assignment_submission_reviews
  for select to authenticated
  using (
    exists (
      select 1
      from public.assignment_submissions submission
      join public.assignments assignment
        on assignment.id = submission.assignment_id
       and assignment.organization_id = submission.organization_id
       and assignment.classroom_id = submission.classroom_id
      where submission.id = assignment_submission_reviews.submission_id
        and submission.student_id = auth.uid()
        and submission.status = 'reviewed'
        and assignment.answer_release_at is not null
        and assignment.answer_release_at <= now()
    )
  );

create policy assignment_reviews_manage_staff on public.assignment_submission_reviews
  for all to authenticated
  using (
    public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator'])
    or public.has_class_role(classroom_id, array['teacher'])
  )
  with check (
    reviewer_id = auth.uid()
    and (
      public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator'])
      or public.has_class_role(classroom_id, array['teacher'])
    )
  );

create or replace function public.validate_assignment_submission_review()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  maximum_marks integer;
  submission_status text;
begin
  if tg_op = 'UPDATE' and (
    new.submission_id <> old.submission_id
    or new.organization_id <> old.organization_id
    or new.classroom_id <> old.classroom_id
    or new.assignment_id <> old.assignment_id
  ) then
    raise exception 'Assignment review identity cannot be changed.';
  end if;
  if new.reviewer_id <> auth.uid() then
    raise exception 'The reviewer must be the signed-in staff member.';
  end if;

  select assignment.target_marks, submission.status
  into maximum_marks, submission_status
  from public.assignments assignment
  join public.assignment_submissions submission
    on submission.assignment_id = assignment.id
   and submission.organization_id = assignment.organization_id
   and submission.classroom_id = assignment.classroom_id
  where assignment.id = new.assignment_id
    and assignment.organization_id = new.organization_id
    and assignment.classroom_id = new.classroom_id
    and submission.id = new.submission_id;
  if not found or submission_status <> 'reviewed' then
    raise exception 'Only a reviewed submission can have a saved grade.';
  end if;
  if new.mark_awarded is not null
     and maximum_marks is not null
     and new.mark_awarded > maximum_marks then
    raise exception 'Awarded marks cannot exceed the assignment maximum.';
  end if;
  return new;
end;
$$;

create trigger validate_assignment_submission_review_before_write
  before insert or update on public.assignment_submission_reviews
  for each row execute function public.validate_assignment_submission_review();

revoke select on public.assignment_submissions from authenticated;
grant select (
  id,
  organization_id,
  classroom_id,
  assignment_id,
  student_id,
  response_data,
  status,
  submitted_at,
  created_at
) on public.assignment_submissions to authenticated;
revoke update on public.assignment_submissions from authenticated;
grant update (response_data, status, submitted_at)
  on public.assignment_submissions to authenticated;

create or replace function public.review_assignment_submission(
  target_submission_id uuid,
  awarded_mark integer,
  feedback_text text
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  submission record;
  maximum_marks integer;
begin
  if auth.uid() is null
     or feedback_text is null
     or char_length(feedback_text) > 5000
     or (awarded_mark is not null and awarded_mark < 0) then
    raise exception 'Review fields are invalid.';
  end if;

  select id, organization_id, classroom_id, assignment_id, student_id, status
  into submission
  from public.assignment_submissions
  where id = target_submission_id
  for update;

  if not found then
    raise exception 'Submission not found, not awaiting review, or not authorized.';
  end if;

  if submission.status not in ('submitted', 'returned')
     or not (
       public.has_org_role(submission.organization_id, array['owner', 'administrator', 'academic_coordinator'])
       or public.has_class_role(submission.classroom_id, array['teacher'])
     ) then
    raise exception 'Submission not found, not awaiting review, or not authorized.';
  end if;

  select target_marks into maximum_marks
  from public.assignments
  where id = submission.assignment_id
    and organization_id = submission.organization_id
    and classroom_id = submission.classroom_id;
  if awarded_mark is not null and maximum_marks is not null and awarded_mark > maximum_marks then
    raise exception 'Awarded marks cannot exceed the assignment maximum.';
  end if;

  update public.assignment_submissions
  set status = 'reviewed'
  where id = submission.id;

  insert into public.assignment_submission_reviews (
    submission_id,
    organization_id,
    classroom_id,
    assignment_id,
    mark_awarded,
    teacher_feedback,
    reviewer_id,
    reviewed_at
  )
  values (
    submission.id,
    submission.organization_id,
    submission.classroom_id,
    submission.assignment_id,
    awarded_mark,
    nullif(feedback_text, ''),
    auth.uid(),
    now()
  )
  on conflict (submission_id) do update
  set mark_awarded = excluded.mark_awarded,
      teacher_feedback = excluded.teacher_feedback,
      reviewer_id = excluded.reviewer_id,
      reviewed_at = excluded.reviewed_at;
end;
$$;

revoke all on function public.review_assignment_submission(uuid, integer, text) from public;
grant execute on function public.review_assignment_submission(uuid, integer, text) to authenticated;

create or replace function public.can_read_organization_profile(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select target_user_id = auth.uid()
    or exists (
      select 1
      from public.organization_memberships target_membership
      join public.organization_memberships viewer_membership
        on viewer_membership.organization_id = target_membership.organization_id
       and viewer_membership.user_id = auth.uid()
       and viewer_membership.removed_at is null
      where target_membership.user_id = target_user_id
        and target_membership.removed_at is null
    );
$$;

revoke all on function public.can_read_organization_profile(uuid) from public;
grant execute on function public.can_read_organization_profile(uuid) to authenticated;

create policy profiles_read_shared_organization_members on public.profiles
  for select to authenticated
  using (public.can_read_organization_profile(id));

create policy memberships_read_academic_coordinators on public.organization_memberships
  for select to authenticated
  using (public.has_org_role(organization_id, array['academic_coordinator']));

alter table public.projects
  add column rubric_id uuid,
  add constraint projects_rubric_same_organization_fk
    foreign key (rubric_id, organization_id)
    references public.rubrics (id, organization_id) on delete restrict;

create unique index rubric_evaluations_submission_criterion_uidx
  on public.rubric_evaluations (project_submission_id, criterion_id);

create or replace function public.validate_rubric_evaluation_points()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  maximum integer;
  submission_status text;
  target_criterion_id uuid;
  target_organization_id uuid;
  target_submission_id uuid;
  target_points integer;
begin
  if tg_op = 'DELETE' then
    target_criterion_id := old.criterion_id;
    target_organization_id := old.organization_id;
    target_submission_id := old.project_submission_id;
    target_points := old.points;
  else
    target_criterion_id := new.criterion_id;
    target_organization_id := new.organization_id;
    target_submission_id := new.project_submission_id;
    target_points := new.points;
  end if;

  select project_submission.status, criteria.max_points
  into submission_status, maximum
  from public.rubric_criteria criteria
  join public.projects project
    on project.rubric_id = criteria.rubric_id
   and project.organization_id = criteria.organization_id
  join public.project_submissions project_submission
    on project_submission.project_id = project.id
   and project_submission.organization_id = project.organization_id
  where criteria.id = target_criterion_id
    and criteria.organization_id = target_organization_id
    and project_submission.id = target_submission_id;
  if not found then
    raise exception 'Rubric points must match the project rubric and stay within the criterion maximum.';
  end if;
  if tg_op <> 'DELETE' and target_points > maximum then
    raise exception 'Rubric points must match the project rubric and stay within the criterion maximum.';
  end if;

  if tg_op = 'UPDATE' and submission_status = 'evaluated' then
    raise exception 'Published project evaluations are immutable.';
  end if;
  if tg_op = 'DELETE' then
    if submission_status = 'evaluated' then
      raise exception 'Published project evaluations are immutable.';
    end if;
    return old;
  end if;
  return new;
end;
$$;

drop trigger validate_rubric_evaluation_before_write on public.rubric_evaluations;
create trigger validate_rubric_evaluation_before_write
  before insert or update or delete on public.rubric_evaluations
  for each row execute function public.validate_rubric_evaluation_points();

create or replace function public.require_complete_project_rubric()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  target_rubric_id uuid;
  criterion_count integer;
  evaluation_count integer;
  invalid_evaluation_count integer;
begin
  if new.status <> 'evaluated' then
    return new;
  end if;

  select rubric_id into target_rubric_id
  from public.projects
  where id = new.project_id
    and organization_id = new.organization_id;
  if target_rubric_id is null then
    return new;
  end if;

  select count(*) into criterion_count
  from public.rubric_criteria
  where rubric_id = target_rubric_id
    and organization_id = new.organization_id;
  select count(*),
         count(*) filter (where criteria.id is null)
    into evaluation_count, invalid_evaluation_count
  from public.rubric_evaluations evaluation
  left join public.rubric_criteria criteria
    on criteria.id = evaluation.criterion_id
   and criteria.rubric_id = target_rubric_id
   and criteria.organization_id = new.organization_id
  where evaluation.project_submission_id = new.id
    and evaluation.organization_id = new.organization_id;

  if criterion_count = 0
     or evaluation_count <> criterion_count
     or invalid_evaluation_count <> 0 then
    raise exception 'Score every criterion in the project rubric before completing evaluation.';
  end if;
  return new;
end;
$$;

create trigger require_complete_project_rubric_before_evaluation
  before update of status on public.project_submissions
  for each row execute function public.require_complete_project_rubric();

create or replace function public.prevent_published_project_rubric_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.status <> 'draft'
     and (
       new.status = 'draft'
       or new.rubric_id is distinct from old.rubric_id
     ) then
    raise exception 'A published project rubric cannot be changed.';
  end if;
  return new;
end;
$$;

create trigger prevent_published_project_rubric_change_before_write
  before update on public.projects
  for each row execute function public.prevent_published_project_rubric_change();

create or replace function public.prevent_rubric_criteria_change_after_use()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  target_criterion_id uuid;
  target_rubric_id uuid;
begin
  if tg_op = 'DELETE' then
    target_criterion_id := old.id;
    target_rubric_id := old.rubric_id;
  else
    if new.id <> old.id
       or new.organization_id <> old.organization_id
       or new.rubric_id <> old.rubric_id then
      raise exception 'Rubric criterion identity cannot be changed.';
    end if;
    target_criterion_id := old.id;
    target_rubric_id := old.rubric_id;
  end if;
  if exists (
    select 1
    from public.projects project
    where project.rubric_id = target_rubric_id
      and project.status <> 'draft'
  ) or exists (
    select 1
    from public.rubric_evaluations evaluation
    where evaluation.criterion_id = target_criterion_id
  ) then
    raise exception 'A rubric criterion cannot change after its rubric is used by a published project.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger prevent_rubric_criteria_change_after_use_before_write
  before update or delete on public.rubric_criteria
  for each row execute function public.prevent_rubric_criteria_change_after_use();

drop policy rubric_evaluations_read_authorized on public.rubric_evaluations;
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
          (submission.student_id = auth.uid() and submission.status = 'evaluated')
          or (project.classroom_id is not null and public.has_class_role(project.classroom_id, array['teacher']))
        )
    )
  );

create or replace function public.create_rubric_with_criteria(
  target_organization_id uuid,
  rubric_title text,
  criterion_list jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  new_rubric_id uuid := gen_random_uuid();
  criterion jsonb;
  criterion_title text;
  criterion_description text;
  criterion_points integer;
  position_number integer := 0;
begin
  if auth.uid() is null
     or char_length(trim(coalesce(rubric_title, ''))) not between 1 and 200
     or not public.has_org_role(target_organization_id, array['owner', 'administrator', 'academic_coordinator', 'teacher']) then
    raise exception 'Rubric details are invalid or the user is not authorized.';
  end if;
  if jsonb_typeof(criterion_list) is distinct from 'array'
     or jsonb_array_length(criterion_list) not between 1 and 10 then
    raise exception 'Rubric details are invalid or the user is not authorized.';
  end if;

  insert into public.rubrics (id, organization_id, title, created_by)
  values (new_rubric_id, target_organization_id, trim(rubric_title), auth.uid());

  for criterion in select value from jsonb_array_elements(criterion_list)
  loop
    criterion_title := trim(coalesce(criterion ->> 'title', ''));
    criterion_description := coalesce(criterion ->> 'description', '');
    if jsonb_typeof(criterion) <> 'object'
       or criterion_title = ''
       or char_length(criterion_title) > 200
       or char_length(criterion_description) > 2000
       or coalesce(criterion ->> 'max_points', '') !~ '^[1-9][0-9]{0,3}$' then
      raise exception 'Every rubric criterion needs a title and a maximum from 1 to 1000 points.';
    end if;
    criterion_points := (criterion ->> 'max_points')::integer;
    if criterion_points > 1000 then
      raise exception 'Criterion maximums cannot exceed 1000 points.';
    end if;

    insert into public.rubric_criteria (
      organization_id, rubric_id, title, description, max_points, position
    )
    values (
      target_organization_id,
      new_rubric_id,
      criterion_title,
      criterion_description,
      criterion_points,
      position_number
    );
    position_number := position_number + 1;
  end loop;
  return new_rubric_id;
end;
$$;

revoke all on function public.create_rubric_with_criteria(uuid, text, jsonb) from public;
grant execute on function public.create_rubric_with_criteria(uuid, text, jsonb) to authenticated;

create or replace function public.evaluate_project_submission_with_rubric(
  target_submission_id uuid,
  criterion_scores jsonb,
  overall_feedback text
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  submission record;
  target_rubric_id uuid;
  criterion_score jsonb;
  target_criterion_id uuid;
  target_points integer;
  criterion_max integer;
  criterion_feedback text;
  criterion_total integer;
begin
  if auth.uid() is null
     or overall_feedback is null
     or char_length(overall_feedback) > 10000 then
    raise exception 'Evaluation fields are invalid.';
  end if;
  if jsonb_typeof(criterion_scores) is distinct from 'array' then
    raise exception 'Evaluation fields are invalid.';
  end if;

  select id, organization_id, project_id, student_id, status
  into submission
  from public.project_submissions
  where id = target_submission_id
  for update;
  if not found then
    raise exception 'Project submission not found or not authorized.';
  end if;
  if submission.status not in ('submitted', 'under_review')
     or not (
       public.has_org_role(submission.organization_id, array['owner', 'administrator', 'academic_coordinator'])
       or exists (
         select 1
         from public.projects project
         where project.id = submission.project_id
           and project.classroom_id is not null
           and public.has_class_role(project.classroom_id, array['teacher'])
       )
     ) then
    raise exception 'Project submission is not awaiting evaluation or the user is not authorized.';
  end if;

  select rubric_id into target_rubric_id
  from public.projects
  where id = submission.project_id
    and organization_id = submission.organization_id;
  if target_rubric_id is null then
    raise exception 'This project does not have a rubric.';
  end if;

  select count(*) into criterion_total
  from public.rubric_criteria
  where rubric_id = target_rubric_id
    and organization_id = submission.organization_id;
  if criterion_total = 0
     or jsonb_array_length(criterion_scores) <> criterion_total
     or (
       select count(distinct value ->> 'criterion_id')
       from jsonb_array_elements(criterion_scores)
     ) <> criterion_total then
    raise exception 'Provide exactly one score for every rubric criterion.';
  end if;

  for criterion_score in select value from jsonb_array_elements(criterion_scores)
  loop
    if jsonb_typeof(criterion_score) <> 'object'
       or coalesce(criterion_score ->> 'criterion_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or coalesce(criterion_score ->> 'points', '') !~ '^[0-9]+$' then
      raise exception 'Rubric score entries are invalid.';
    end if;
    target_criterion_id := (criterion_score ->> 'criterion_id')::uuid;
    target_points := (criterion_score ->> 'points')::integer;
    criterion_feedback := coalesce(criterion_score ->> 'feedback', '');
    select max_points into criterion_max
    from public.rubric_criteria
    where id = target_criterion_id
      and rubric_id = target_rubric_id
      and organization_id = submission.organization_id;
    if not found then
      raise exception 'Rubric scores must match this project rubric and stay within criterion maximums.';
    end if;
    if target_points > criterion_max or char_length(criterion_feedback) > 2000 then
      raise exception 'Rubric scores must match this project rubric and stay within criterion maximums.';
    end if;

    insert into public.rubric_evaluations (
      organization_id,
      project_submission_id,
      criterion_id,
      evaluator_id,
      points,
      feedback,
      evaluated_at
    )
    values (
      submission.organization_id,
      submission.id,
      target_criterion_id,
      auth.uid(),
      target_points,
      criterion_feedback,
      now()
    )
    on conflict (project_submission_id, criterion_id) do update
    set evaluator_id = excluded.evaluator_id,
        points = excluded.points,
        feedback = excluded.feedback,
        evaluated_at = excluded.evaluated_at;
  end loop;

  update public.project_submissions
  set status = 'evaluated',
      feedback = nullif(overall_feedback, ''),
      evaluated_by = auth.uid(),
      evaluated_at = now()
  where id = submission.id;
end;
$$;

revoke all on function public.evaluate_project_submission_with_rubric(uuid, jsonb, text) from public;
grant execute on function public.evaluate_project_submission_with_rubric(uuid, jsonb, text) to authenticated;

create table public.paper_version_answer_keys (
  paper_version_id uuid not null,
  organization_id uuid not null,
  question_id uuid not null,
  answer_text text not null,
  created_at timestamptz not null default now(),
  primary key (paper_version_id, question_id),
  foreign key (paper_version_id, organization_id)
    references public.paper_versions (id, organization_id) on delete cascade,
  foreign key (question_id, organization_id)
    references public.questions (id, organization_id) on delete restrict
);

alter table public.paper_version_answer_keys enable row level security;
revoke all on public.paper_version_answer_keys from anon, authenticated;
grant select on public.paper_version_answer_keys to authenticated;

create policy paper_version_answer_keys_read_staff on public.paper_version_answer_keys
  for select to authenticated
  using (
    public.has_org_role(organization_id, array['owner', 'administrator', 'academic_coordinator', 'teacher'])
  );

create or replace function public.snapshot_paper_version_answer_keys()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  question_item jsonb;
  source_question_id uuid;
  source_answer text;
begin
  if new.status <> 'published' or old.status = 'published' then
    return new;
  end if;

  for question_item in select value from jsonb_array_elements(new.question_snapshot)
  loop
    source_question_id := (question_item ->> 'question_id')::uuid;
    select answer_text into source_answer
    from public.question_answer_keys
    where question_id = source_question_id
      and organization_id = new.organization_id;
    if not found then
      raise exception 'Every published paper question must have a staff answer key.';
    end if;
    insert into public.paper_version_answer_keys (
      paper_version_id, organization_id, question_id, answer_text
    )
    values (new.id, new.organization_id, source_question_id, source_answer);
  end loop;
  return new;
end;
$$;

revoke all on function public.snapshot_paper_version_answer_keys() from public;
grant execute on function public.snapshot_paper_version_answer_keys() to authenticated;

create trigger snapshot_paper_version_answer_keys_after_publish
  after update of status on public.paper_versions
  for each row execute function public.snapshot_paper_version_answer_keys();

comment on table public.organization_relationships is
  'Organization metadata only. An active relationship does not grant access to the other organization''s records.';
comment on table public.organization_subscriptions is
  'One independently owned subscription record per institute or academy. Billing provider integration is not configured.';
