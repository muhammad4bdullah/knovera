drop policy if exists student_evidence_read_private on storage.objects;
create policy student_evidence_read_private on storage.objects
  for select to authenticated
  using (
    bucket_id = 'student-evidence'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (storage.foldername(name))[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (storage.foldername(name))[4] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and exists (
      select 1 from public.projects project
      where project.id = ((storage.foldername(name))[4])::uuid
        and project.organization_id = ((storage.foldername(name))[1])::uuid
        and project.classroom_id = ((storage.foldername(name))[2])::uuid
    )
    and (
      ((storage.foldername(name))[3])::uuid = auth.uid()
      or public.has_org_role(((storage.foldername(name))[1])::uuid, array['owner', 'administrator', 'academic_coordinator'])
      or public.has_class_role(((storage.foldername(name))[2])::uuid, array['teacher'])
    )
  );

drop policy if exists student_evidence_insert_own on storage.objects;
create policy student_evidence_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'student-evidence'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (storage.foldername(name))[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (storage.foldername(name))[4] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and ((storage.foldername(name))[3])::uuid = auth.uid()
    and exists (
      select 1 from public.projects project
      where project.id = ((storage.foldername(name))[4])::uuid
        and project.organization_id = ((storage.foldername(name))[1])::uuid
        and project.classroom_id = ((storage.foldername(name))[2])::uuid
        and project.status = 'published'
        and public.has_class_role(project.classroom_id, array['student'])
    )
  );

drop policy if exists student_evidence_delete_owner_or_staff on storage.objects;
create policy student_evidence_delete_owner_or_staff on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'student-evidence'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (storage.foldername(name))[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (storage.foldername(name))[4] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and exists (
      select 1 from public.projects project
      where project.id = ((storage.foldername(name))[4])::uuid
        and project.organization_id = ((storage.foldername(name))[1])::uuid
        and project.classroom_id = ((storage.foldername(name))[2])::uuid
    )
    and (
      ((storage.foldername(name))[3])::uuid = auth.uid()
      or public.has_org_role(((storage.foldername(name))[1])::uuid, array['owner', 'administrator'])
    )
  );
