begin;

create extension if not exists pgtap with schema extensions;

select plan(31);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner-a@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"name":"Owner A"}', now(), now()),
  ('20000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'owner-b@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"name":"Owner B"}', now(), now()),
  ('30000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'student-a@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"name":"Student A"}', now(), now());

insert into public.organizations (id, name, organization_type, owner_user_id)
values
  ('a0000000-0000-4000-8000-000000000001', 'Tenant A', 'school', '10000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000002', 'Tenant B', 'school', '20000000-0000-4000-8000-000000000002');

insert into public.organization_memberships (organization_id, user_id, role)
values ('a0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003', 'student');

insert into public.curricula (id, organization_id, title, created_by)
values
  ('a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Tenant A curriculum', '10000000-0000-4000-8000-000000000001');

insert into public.learning_outcomes (id, organization_id, curriculum_id, code, subject, topic, statement)
values (
  'a2000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'A-1',
  'Science',
  'Motion',
  'Describe motion'
);

insert into public.questions (
  id, organization_id, outcome_id, title, question_type, difficulty, marks, prompt, review_status, created_by
)
values (
  'a3000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  'Tenant A question',
  'short_answer',
  'introductory',
  1,
  'What is motion?',
  'reviewed',
  '10000000-0000-4000-8000-000000000001'
);

insert into public.question_answer_keys (question_id, organization_id, answer_text)
values ('a3000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Change in position over time.');

insert into public.papers (id, organization_id, title, subject, created_by)
values ('ab000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Motion quiz', 'Science', '10000000-0000-4000-8000-000000000001');
insert into public.paper_versions (
  id, paper_id, organization_id, version_number, status, target_marks, question_snapshot, created_by
)
values (
  'ab100000-0000-4000-8000-000000000001',
  'ab000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  1,
  'draft',
  1,
  '[{"question_id":"a3000000-0000-4000-8000-000000000001","title":"Tenant A question","prompt":"What is motion?","marks":1}]',
  '10000000-0000-4000-8000-000000000001'
);

insert into public.classrooms (id, organization_id, name, subject, created_by)
values (
  'a4000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'Tenant A class',
  'Science',
  '10000000-0000-4000-8000-000000000001'
);

insert into public.class_memberships (organization_id, classroom_id, user_id, role)
values (
  'a0000000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000003',
  'student'
);

insert into public.assignments (id, organization_id, classroom_id, title, target_marks, created_by, status)
values
  ('a5000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'Draft assignment', 10, '10000000-0000-4000-8000-000000000001', 'draft'),
  ('a5000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'Published assignment', 10, '10000000-0000-4000-8000-000000000001', 'published');

insert into public.projects (id, organization_id, classroom_id, title, created_by, status)
values
  ('a6000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'Draft project', '10000000-0000-4000-8000-000000000001', 'draft'),
  ('a6000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'Published project', '10000000-0000-4000-8000-000000000001', 'draft');

insert into public.rubrics (id, organization_id, title, created_by)
values ('aa000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Science project rubric', '10000000-0000-4000-8000-000000000001');
insert into public.rubric_criteria (id, organization_id, rubric_id, title, max_points, position)
values ('aa100000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000001', 'Evidence', 10, 0);
update public.projects
set rubric_id = 'aa000000-0000-4000-8000-000000000001',
    status = 'published'
where id = 'a6000000-0000-4000-8000-000000000002';
insert into public.project_submissions (
  id, organization_id, project_id, student_id, submission_version, evidence_text, status, submitted_at
)
values (
  'aa200000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'a6000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000003',
  1,
  'Project evidence',
  'submitted',
  now()
);

insert into public.assignment_submissions (
  id, organization_id, classroom_id, assignment_id, student_id, status,
  mark_awarded, teacher_feedback, reviewed_by, reviewed_at
)
values (
  'a8000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000001',
  'a5000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000003',
  'reviewed',
  5,
  'Good work.',
  '10000000-0000-4000-8000-000000000001',
  now()
);
insert into public.assignment_submissions (
  id, organization_id, classroom_id, assignment_id, student_id, status
)
values (
  'a8000000-0000-4000-8000-000000000002',
  'a0000000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000001',
  'a5000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000003',
  'submitted'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","email":"owner-a@example.test"}', true);

select is(
  (select count(*)::integer from public.organizations where id = 'a0000000-0000-4000-8000-000000000001'),
  1,
  'an owner can read their own organization'
);
select is(
  (select count(*)::integer from public.organizations where id = 'b0000000-0000-4000-8000-000000000002'),
  0,
  'an owner cannot read another tenant'
);
select is(
  (select count(*)::integer from public.question_answer_keys where question_id = 'a3000000-0000-4000-8000-000000000001'),
  1,
  'authorized staff can read their organization answer keys'
);
select is(
  (select count(*)::integer from public.organization_subscriptions where organization_id = 'a0000000-0000-4000-8000-000000000001' and plan_type = 'institute' and monthly_amount = 2000 and status = 'not_configured'),
  1,
  'each institute receives its own unconfigured PKR subscription record'
);
select is(
  (select count(*)::integer from public.profiles where id = '30000000-0000-4000-8000-000000000003'),
  1,
  'organization staff can read member display names for class roster management'
);
select lives_ok(
  $$update public.paper_versions set status = 'published', published_at = now() where id = 'ab100000-0000-4000-8000-000000000001'$$,
  'staff can publish a validated paper snapshot'
);
select is(
  (select count(*)::integer from public.paper_version_answer_keys where paper_version_id = 'ab100000-0000-4000-8000-000000000001' and question_id = 'a3000000-0000-4000-8000-000000000001' and answer_text = 'Change in position over time.'),
  1,
  'publication freezes staff answer keys alongside the student-safe snapshot'
);
select lives_ok(
  $$insert into public.organization_relationships (
      id, source_organization_id, target_organization_id, relationship_type, requested_by
    ) values (
      'a7000000-0000-4000-8000-000000000001',
      'a0000000-0000-4000-8000-000000000001',
      'b0000000-0000-4000-8000-000000000002',
      'affiliate',
      auth.uid()
    )$$,
  'an organization owner can request an explicit relationship'
);
select throws_ok(
  $$select public.review_assignment_submission('a8000000-0000-4000-8000-000000000002', 11, 'Too many marks.')$$,
  'P0001',
  'Awarded marks cannot exceed the assignment maximum.',
  'assignment reviews reject marks over the configured maximum'
);
select lives_ok(
  $$select public.review_assignment_submission('a8000000-0000-4000-8000-000000000002', 4, 'Reviewed by owner.')$$,
  'authorized staff can atomically review and grade a submission'
);
select is(
  (select count(*)::integer
   from public.assignment_submissions submission
   join public.assignment_submission_reviews review on review.submission_id = submission.id
   where submission.id = 'a8000000-0000-4000-8000-000000000002'
     and submission.status = 'reviewed'
     and review.mark_awarded = 4),
  1,
  'a review records the mark and advances the submission together'
);
select lives_ok(
  $$select public.evaluate_project_submission_with_rubric(
    'aa200000-0000-4000-8000-000000000001',
    '[{"criterion_id":"aa100000-0000-4000-8000-000000000001","points":8,"feedback":"Clear evidence."}]'::jsonb,
    'Strong project.'
  )$$,
  'authorized staff can score project criteria and submit overall feedback atomically'
);
select is(
  (select count(*)::integer
   from public.project_submissions submission
   join public.rubric_evaluations evaluation on evaluation.project_submission_id = submission.id
   where submission.id = 'aa200000-0000-4000-8000-000000000001'
     and submission.status = 'evaluated'
     and evaluation.points = 8),
  1,
  'project status and rubric scores persist together'
);

select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-8000-000000000003","role":"authenticated","email":"student-a@example.test"}', true);

select is(
  (select count(*)::integer from public.questions where id = 'a3000000-0000-4000-8000-000000000001'),
  0,
  'students cannot query the staff question bank'
);
select is(
  (select count(*)::integer from public.question_answer_keys where question_id = 'a3000000-0000-4000-8000-000000000001'),
  0,
  'students cannot read answer keys'
);
select is(
  (select count(*)::integer from public.assignments where id = 'a5000000-0000-4000-8000-000000000001'),
  0,
  'students cannot read draft assignments'
);
select is(
  (select count(*)::integer from public.assignments where id = 'a5000000-0000-4000-8000-000000000002'),
  1,
  'students can read published assignments for their class'
);
select is(
  (select count(*)::integer from public.projects where id = 'a6000000-0000-4000-8000-000000000001'),
  0,
  'students cannot read draft projects'
);
select is(
  (select count(*)::integer from public.projects where id = 'a6000000-0000-4000-8000-000000000002'),
  1,
  'students can read published projects for their class'
);
select is(
  (select count(*)::integer from public.organization_subscriptions),
  0,
  'students cannot read organization subscription records'
);
select is(
  (select count(*)::integer from public.paper_version_answer_keys where paper_version_id = 'ab100000-0000-4000-8000-000000000001'),
  0,
  'students cannot query frozen paper answer keys'
);
select is(
  (select count(*)::integer
   from public.rubric_evaluations
   where project_submission_id = 'aa200000-0000-4000-8000-000000000001'
     and criterion_id = 'aa100000-0000-4000-8000-000000000001'
     and points = 8),
  1,
  'students can read rubric results for their own evaluated project'
);
select throws_ok(
  $$select mark_awarded from public.assignment_submissions where id = 'a8000000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'students cannot select grading columns from their submission'
);
select is(
  (select count(*)::integer from public.assignment_submission_reviews where submission_id = 'a8000000-0000-4000-8000-000000000001'),
  0,
  'students cannot read submission reviews before the assignment release time'
);
select throws_ok(
  $$insert into public.questions (organization_id, outcome_id, title, question_type, difficulty, marks, prompt, created_by)
    values ('a0000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'Unauthorized', 'short_answer', 'introductory', 1, 'No', auth.uid())$$,
  '42501',
  null,
  'students cannot create staff questions through the API'
);

reset role;
update public.assignments
set answer_release_at = now() - interval '1 minute'
where id = 'a5000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-8000-000000000003","role":"authenticated","email":"student-a@example.test"}', true);
select is(
  (select count(*)::integer from public.assignment_submission_reviews where submission_id = 'a8000000-0000-4000-8000-000000000001' and mark_awarded = 5 and teacher_feedback = 'Good work.'),
  1,
  'students can read their review after the assignment release time'
);

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated","email":"owner-b@example.test"}', true);

select is(
  (select count(*)::integer from public.organization_relationships where id = 'a7000000-0000-4000-8000-000000000001' and status = 'pending'),
  1,
  'the other organization owner can see the relationship request'
);
select is(
  (select count(*)::integer from public.learning_outcomes where organization_id = 'a0000000-0000-4000-8000-000000000001'),
  0,
  'a relationship request does not grant access to another organization curriculum'
);
select lives_ok(
  $$select public.respond_to_organization_relationship('a7000000-0000-4000-8000-000000000001', true)$$,
  'the target organization owner can accept the relationship request'
);
select is(
  (select count(*)::integer from public.organization_relationships where id = 'a7000000-0000-4000-8000-000000000001' and status = 'active'),
  1,
  'accepted organization relationship is recorded as metadata'
);

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(
  (select count(*)::integer from public.organizations),
  0,
  'anonymous users cannot read organizations'
);

select * from finish();
rollback;
