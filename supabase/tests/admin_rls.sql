-- Transactional policy checks using synthetic accounts and object metadata.
-- Run after both migrations in a disposable project; real Storage API checks
-- are still needed because these fixtures do not contain uploaded file bytes.
begin;
insert into auth.users (id, email, email_confirmed_at) values
  ('10000000-0000-4000-8000-000000000001', 'uploader-a@example.invalid', now()),
  ('10000000-0000-4000-8000-000000000002', 'uploader-b@example.invalid', now()),
  ('10000000-0000-4000-8000-000000000003', 'admin@example.invalid', now());
insert into public.app_admins (singleton, user_id) values (true, '10000000-0000-4000-8000-000000000003');
insert into storage.objects (bucket_id, name) values
  ('receipts', '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001.png'),
  ('receipts', '10000000-0000-4000-8000-000000000002/20000000-0000-4000-8000-000000000002/30000000-0000-4000-8000-000000000002.png');
insert into public.expenses (id, user_id, date, description, category, amount_cents, paid_by, receipt_path, receipt_name, receipt_size) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', current_date, 'Test A', 'Groceries', 2550, 'Alex',
   '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001.png', 'a.png', 10),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', current_date, 'Test B', 'Other', 1000, 'Sam',
   '10000000-0000-4000-8000-000000000002/20000000-0000-4000-8000-000000000002/30000000-0000-4000-8000-000000000002.png', 'b.png', 10);

set local role anon;
do $$ begin
  begin
    perform public.is_admin();
    raise exception 'Anonymous caller could check admin role';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.list_admin_expenses();
    raise exception 'Anonymous caller could list admin expenses';
  exception when insufficient_privilege then null; end;
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","user_metadata":{"admin":true}}';
do $$ declare affected integer; begin
  if public.is_admin() then raise exception 'Client metadata granted administrator access'; end if;
  if (select count(*) from public.expenses) <> 1 then raise exception 'Uploader can read other accounts'; end if;
  begin
    perform * from public.list_admin_expenses();
    raise exception 'Uploader can call admin listing RPC';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.app_admins (singleton, user_id) values (true, '10000000-0000-4000-8000-000000000001');
    raise exception 'Uploader can promote itself';
  exception when insufficient_privilege then null; end;
  begin
    update public.app_admins set user_id = '10000000-0000-4000-8000-000000000001';
    raise exception 'Uploader can change admin';
  exception when insufficient_privilege then null; end;
  update public.expenses set amount_cents = 999 where id = '20000000-0000-4000-8000-000000000002';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Uploader changed another account expense'; end if;
  delete from public.expenses where id = '20000000-0000-4000-8000-000000000002';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Uploader deleted another account expense'; end if;
  if exists (select 1 from storage.objects where name like '10000000-0000-4000-8000-000000000002/%') then
    raise exception 'Uploader can read another account bill';
  end if;
end $$;

set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}';
do $$ begin
  if not public.is_admin() then raise exception 'Designated admin was denied'; end if;
  if (select count(*) from public.expenses) <> 2 then raise exception 'Admin cannot read all expenses'; end if;
  if (select count(*) from public.list_admin_expenses()) <> 2 then raise exception 'Admin RPC missing expenses'; end if;
  if not exists (select 1 from public.list_admin_expenses() where uploader_email = 'uploader-a@example.invalid') then
    raise exception 'Admin RPC missing uploader email';
  end if;
  if (select count(*) from storage.objects where bucket_id = 'receipts') <> 2 then raise exception 'Admin cannot read all bill objects'; end if;
  begin
    update public.app_admins set user_id = '10000000-0000-4000-8000-000000000001';
    raise exception 'Browser administrator can grant admin access';
  exception when insufficient_privilege then null; end;
  begin
    update public.expenses set user_id = '10000000-0000-4000-8000-000000000003' where id = '20000000-0000-4000-8000-000000000001';
    raise exception 'Admin changed original ownership';
  exception when raise_exception then
    if SQLERRM <> 'Expense identity and creation time cannot be changed' then raise; end if;
  end;
end $$;

-- Replacing a bill uploads a new file into the ORIGINAL uploader's folder.
do $$ declare affected integer; begin
  delete from storage.objects where name = '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001.png';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Admin deleted a bill still referenced by an expense'; end if;
end $$;
insert into storage.objects (bucket_id, name) values
  ('receipts', '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000004.png');
update public.expenses set amount_cents = 3000, receipt_name = 'replacement.png',
  receipt_path = '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000004.png'
  where id = '20000000-0000-4000-8000-000000000001';
delete from public.expenses where id = '20000000-0000-4000-8000-000000000002';
-- These deletes affect only synthetic metadata fixtures, never real file bytes.
do $$ declare affected integer; begin
  delete from storage.objects where name = '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001.png';
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Admin could not clean the replaced bill'; end if;
  delete from storage.objects where name = '10000000-0000-4000-8000-000000000002/20000000-0000-4000-8000-000000000002/30000000-0000-4000-8000-000000000002.png';
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Admin could not clean the deleted expense bill'; end if;
end $$;

set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
do $$ begin
  if not exists (select 1 from public.expenses where amount_cents = 3000 and receipt_name = 'replacement.png') then
    raise exception 'Admin edit lost original uploader access';
  end if;
  if not exists (select 1 from storage.objects where name like '%30000000-0000-4000-8000-000000000004.png') then
    raise exception 'Original uploader cannot read replacement bill';
  end if;
end $$;

insert into storage.objects (bucket_id, name) values
  ('receipts', '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001/unused.png');
do $$ declare affected integer; begin
  delete from storage.objects where name like '%30000000-0000-4000-8000-000000000004.png';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Uploader deleted its referenced bill'; end if;
  delete from storage.objects where name like '%/unused.png';
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Uploader could not clean its unused upload'; end if;
end $$;

-- Revocation takes effect without trusting old JWT metadata or cached client roles.
reset role;
delete from public.app_admins;
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated","user_metadata":{"admin":true}}';
do $$ begin
  if public.is_admin() then raise exception 'Revoked admin retained role'; end if;
  if exists (select 1 from public.expenses) then raise exception 'Revoked admin retained record access'; end if;
  begin
    perform * from public.list_admin_expenses();
    raise exception 'Revoked admin retained RPC access';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
