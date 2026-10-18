# Implementation status

This status describes checked-in code, not a production release. Supabase configuration, migrations and database access were not available for live verification.

| Capability | Status | Notes |
|---|---|---|
| Next.js + TypeScript foundation and responsive local app | Implemented | Strict TypeScript, lint, domain tests, responsive dashboard, sample curriculum and paper workflows. |
| Curriculum outcomes, question bank and PaperForge | Supabase staff workflow added; local demo remains | `/app/academics` supports tenant-scoped curricula/outcomes, validated CSV outcome import, questions with separate answer keys, review, immutable student-safe paper snapshots and staff-only frozen answer keys with separate print/PDF routes. Root-page UI still uses browser storage. No XLSX/document extraction. |
| SyllabusShift | Structured comparison and CSV import added; not live-verified | `/app/academics` imports validated CSV outcome rows and compares stored curriculum outcomes by code, reporting additions, removals, and changed fields. No OCR/AI extraction or approval workflow. |
| Supabase authentication | Wired, not live-verified | Email/password sign-in/up, callback, password recovery/update, sign-out and protected `/app` routes. Requires user-owned project configuration. |
| Academy Hub and organization membership | Wired, not live-verified | Create organization, list memberships, role-aware invitation links, invite preview/acceptance and invitation revocation. Email delivery is not configured. |
| Institute/academy identity and relationships | Schema/UI added, not live-verified | Institute and academy are separate organization types; relationship requests require owner action and do not grant data access. |
| Subscription ownership | Status foundation added, not billing | New institutes/academies each get their own PKR 2,000/month `not_configured` record; existing records are backfilled. No payment provider, paid access, renewal, or charge is implemented. Independent-teacher pricing remains undecided; students remain free. |
| Classes and enrollment | Wired, not live-verified | Class creation, single-use enrollment codes, student code enrollment, scoped class lists, and basic roster display/add/remove controls for organization managers. Email search and dedicated roster management remain incomplete. |
| Assignments | Basic text workflow, not live-verified | Draft/publish, student text submissions, teacher review, return-for-revision and staff-controlled feedback release. Marks and feedback are stored separately and are not readable by students until release. No question-backed assignment builder, file uploads, or tested delivery notifications. |
| Projects | Basic workflow, not live-verified | Draft/publish, text and private file evidence (PDF, text, JPEG, PNG; 15 MB/file), configurable criteria rubrics, atomic criterion scoring and feedback. Project scores are hidden until evaluation is complete, and published rubric criteria are immutable. Portfolios and outcome mastery logic remain incomplete. |
| Reports | Basic live summary added; not live-verified | `/app/reports` shows class activity to authorized staff and only own submission totals/released marks to students. No CSV/PDF exports, longitudinal analytics, or validated dashboard aggregates. |
| Tenant schema, RLS and private storage policies | Prepared, not executed | Four migrations define organization/class/workflow tables, triggers, policies, and storage buckets. Project evidence uploads are scoped by organization, class, student, and published project; access uses short-lived signed links. Assignment grades are split into a release-gated review table; project rubric scores are constrained to the assigned rubric and become visible to students only after evaluation completes. Must be independently reviewed and tested against PostgreSQL before sensitive use. |
| Database security tests | Partial | `supabase/tests/rls.test.sql` contains 31 pgTAP assertions, including tenant isolation, question/answer-key restrictions, relationship boundaries, roster profile visibility, assignment review/release, project rubric evaluation, and frozen answer-key access. It does not exercise all workflow policies and was not run here. |
| Billing, document ingestion, email delivery, production integrations | Not implemented | Subscription status records are not payments; no payment provider, AI provider, OCR, outbound invitation email, or production operations setup. |
| Local quality checks | Passed | `npm run lint`, `npm run typecheck`, `npm test` (7/7) and `npm run build` pass after the current changes. The checked-in Supabase CLI config supports a local stack, but SQL pgTAP tests were not run because the CLI and Docker are unavailable here. |

## Usage and safety boundary

The root page is still a local browser demo; its records are not shared across users/devices and are not protected as student data. Supabase-backed routes are available under `/app` only after project setup. Do not enter real learner records or confidential questions until all migrations and policies have been reviewed and tested.

## Release gate

Before a pilot, add document extraction and approval for SyllabusShift, migrate remaining root-only demo workflows onto the organization-backed model, add comprehensive integration and RLS tests (including submissions, grading and storage), verify auth email delivery and redirect settings, implement project portfolios and evidence-to-outcome mastery workflows, and complete privacy, retention, accessibility, operational and legal reviews for the deployment market. The current work must not be represented as a complete or production-ready platform.
