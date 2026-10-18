# Knovera

Knovera is a responsive education workspace prototype for curriculum planning, assessment authoring, classroom learning and project evidence. It currently has two separate slices: the original browser-only curriculum/paper demo at `/`, and a Supabase-backed account and learning-workflow foundation under `/app`.

This is **not production-ready**. Do not use real student, assessment, or confidential institutional data until the migrations and row-level security (RLS) policies have been reviewed and tested in a dedicated project.

## Run the local demo

Requirements: Node.js 24 or a compatible current LTS release, and npm.

```powershell
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The root curriculum and paper demo works without external services and saves data in the current browser's `localStorage`.

## Supabase-backed workflows

The `/app` routes use Supabase Auth and database policies when configured:

- Sign up, sign in, email-confirmation callback, sign out, password reset and update.
- Create an organization; organization owners/admins can create expiring, single-use invitation links. Email delivery is not configured.
- In **Academic workspace**, organization-scoped curricula and learning outcomes, validated CSV outcome import, SyllabusShift comparison of stored versions, staff question authoring with separately stored answer keys, reviewed question workflow, immutable published paper/answer-key snapshots, and separate student-paper and staff-answer-key print/PDF views.
- Create classes, manage basic class rosters, and issue one-time, expiring enrollment codes; organization students can join classes with a code.
- Create/publish assignments; students can submit and revise text responses, class staff can review or return them, and student access to marks/feedback is gated until staff release it.
- Create project rubrics with criterion-level points, attach them to projects, save evaluated scores and feedback atomically, and upload private student evidence files (PDF, text, JPEG, PNG; up to 15 MB each).
- View live, access-controlled assignment and project activity summaries in **Reports**; learner accounts see only their own submission counts and released marks.
- Tenant-scoped schema, role checks, RLS, private storage bucket policies and a partial pgTAP policy test.
- Separate institute/academy subscription records at the specified PKR 2,000/month price (status remains `not_configured`; no payment is taken), explicit organization relationship requests that do not grant data access, and atomic paper-plus-version draft creation.

These routes are an early vertical slice, not a complete education SaaS. The root dashboard and browser demo still use browser demo data; use `/app` for connected organization workflows, `/app/academics` for organization-backed curriculum, CSV outcome import, SyllabusShift comparisons of saved versions, questions, and paper-version/print/PDF workflows, and `/app/reports` for live workflow summaries. CSV is the only ingestion format; XLSX/OCR extraction and an approval process are not implemented. Portfolios and outcome mastery remain incomplete. There is no billing, email delivery, or production operations setup.

## Configure a Supabase development project

1. Create a new Supabase project for development. Do not use a production database.
2. Copy the template and edit it locally:

   ```powershell
   Copy-Item .env.example .env.local
   ```

   Set `NEXT_PUBLIC_SUPABASE_URL` and either `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the project's API settings. Set `NEXT_PUBLIC_SITE_URL=http://localhost:3000`. These are public client credentials; **never put a service-role key in this app or send credentials in chat**.
3. In Supabase **Authentication → URL Configuration**, set the Site URL to `http://localhost:3000` and add `http://localhost:3000/auth/callback` to the redirect URL allowlist. Configure email delivery/provider settings before expecting confirmation or password-reset mail in a real deployment.
4. Install the Supabase CLI using the official Windows installation instructions. From the project root, authenticate, link to the development project's reference (shown in Supabase project settings), inspect all four migrations, then apply them in timestamp order:

   ```powershell
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   ```

   The migration files are in [`supabase/migrations/`](./supabase/migrations/). The third migration adds organization relationships, subscription-status records, atomic academic writes, release-gated assignment review records, basic roster profile access, project rubrics/evaluations, and frozen answer-key snapshots for published papers; the fourth adds project-scoped private evidence uploads. These migrations do not add a payment processor or enable paid features. Alternatively, review and run each SQL migration in the Supabase SQL Editor in filename order. Never run an unreviewed migration against production. If a previous SQL Editor attempt failed partway through, inspect the existing schema before retrying; do not blindly replay a partially applied migration.
5. Restart the Next.js server after saving `.env.local`:

   ```powershell
   npm run dev
   ```

   Visit `/signup`, register, confirm the email if required, sign in and create an institute, academy, or independent teacher workspace. Institute and academy subscriptions are separately recorded as `not_configured`; this is not proof of payment, and paid access is not enabled. An owner/admin can create an invitation link; the recipient must sign in with the invited email. Invite a student to the organization before attempting to join a class with an enrollment code. Owners of both organizations can create an explicit relationship request; it is metadata only and does not share private records.
6. Before handling any real data, review every policy and run the database tests against a disposable local Supabase database. With Docker and the Supabase CLI available:

   ```powershell
   supabase start
   supabase status
   supabase test db
   ```

   The checked-in [`supabase/config.toml`](./supabase/config.toml) configures a local-only stack and local Auth redirects. Use the API URL and anon key from `supabase status` in `.env.local` when connecting the browser to that local stack; keep the local and remote project credentials separate. Local email messages can be inspected in Supabase Inbucket at `http://localhost:54324`. The current 31 pgTAP assertions cover only a small subset of the policies; they are not a certification of the entire schema or a substitute for an independent security review. The migrations have not been applied or executed against a live PostgreSQL/Supabase project in this workspace.

## Available scripts

```powershell
npm run dev        # Start the development server
npm run build      # Build the production bundle
npm run start      # Serve a previously built bundle
npm run lint       # Run ESLint
npm run typecheck  # Run TypeScript without emitting files
npm test           # Run domain calculation and data-shape tests
```

See [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md) for the scope and remaining production work.
