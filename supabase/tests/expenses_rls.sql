-- Run after the migration in a disposable Supabase project's SQL Editor.
-- Fixtures represent uploaded objects; no real file bytes are created.
-- Successful execution ends with ROLLBACK and leaves no accounts or expenses.
begin;

insert into auth.users (id, email) values
  ('10000000-0000-4000-8000-000000000001', 'expense-test-a@example.invalid'),
  ('10000000-0000-4000-8000-000000000002', 'expense-test-b@example.invalid');

insert into storage.objects (bucket_id, name) values
  ('receipts', '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001.png'),
  ('receipts', '10000000-0000-4000-8000-000000000002/20000000-0000-4000-8000-000000000002/30000000-0000-4000-8000-000000000002.png');

insert into public.expenses (id, user_id, date, description, category, amount_cents, paid_by, receipt_path, receipt_name, receipt_size) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', current_date, 'Test A', 'Groceries', 2550, 'Alex',
   '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001.png', 'a.png', 10),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', current_date, 'Test B', 'Other', 1000, 'Sam',
   '10000000-0000-4000-8000-000000000002/20000000-0000-4000-8000-000000000002/30000000-0000-4000-8000-000000000002.png', 'b.png', 10);

do $$ begin
  if not exists (select 1 from storage.buckets where id = 'receipts' and public = false and file_size_limit = 10485760) then
    raise exception 'Receipt bucket must be private and limited to 10 MB';
  end if;
end $$;

set local role anon;
do $$ begin
  begin
    perform 1 from public.expenses;
    raise exception 'Anonymous access to expenses was allowed';
  exception when insufficient_privilege then null;
  end;
  if exists (select 1 from storage.objects where bucket_id = 'receipts') then
    raise exception 'Anonymous access to private bills was allowed';
  end if;
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
do $$ declare affected integer; begin
  if (select count(*) from public.expenses) <> 1 or not exists (select 1 from public.expenses where description = 'Test A') then
    raise exception 'Account A must see only its own expense';
  end if;
  if (select count(*) from storage.objects where bucket_id = 'receipts') <> 1 then
    raise exception 'Account A must see only its own bill';
  end if;
  update public.expenses set amount_cents = 2000 where id = '20000000-0000-4000-8000-000000000002';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Account A updated account B expense'; end if;
  delete from public.expenses where id = '20000000-0000-4000-8000-000000000002';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Account A deleted account B expense'; end if;

  begin
    update public.expenses set amount_cents = 0 where id = '20000000-0000-4000-8000-000000000001';
    raise exception 'Zero amount was accepted';
  exception when check_violation then null;
  end;
  begin
    update public.expenses set category = 'Unknown' where id = '20000000-0000-4000-8000-000000000001';
    raise exception 'Unknown category was accepted';
  exception when check_violation then null;
  end;
  begin
    update public.expenses set receipt_size = 10485761 where id = '20000000-0000-4000-8000-000000000001';
    raise exception 'Oversized receipt metadata was accepted';
  exception when check_violation then null;
  end;
  begin
    update public.expenses set receipt_path = '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001/missing.png'
      where id = '20000000-0000-4000-8000-000000000001';
    raise exception 'Missing receipt was accepted';
  exception when raise_exception then
    if SQLERRM <> 'Upload the receipt before saving the expense' then raise; end if;
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('receipts', '10000000-0000-4000-8000-000000000002/forbidden.png');
    raise exception 'Account A uploaded into account B folder';
  exception when insufficient_privilege then null;
  end;

  update public.expenses set amount_cents = 3000 where id = '20000000-0000-4000-8000-000000000001';
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Account A could not update its expense'; end if;
end $$;

set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}';
do $$ begin
  if (select count(*) from public.expenses) <> 1 or not exists (select 1 from public.expenses where description = 'Test B' and amount_cents = 1000) then
    raise exception 'Account B must see only its unchanged expense';
  end if;
  if (select count(*) from storage.objects where bucket_id = 'receipts') <> 1 then
    raise exception 'Account B must see only its bill';
  end if;
  delete from public.expenses where id = '20000000-0000-4000-8000-000000000002';
  if exists (select 1 from public.expenses) then raise exception 'Account B could not delete its expense'; end if;
end $$;

reset role;
rollback;
