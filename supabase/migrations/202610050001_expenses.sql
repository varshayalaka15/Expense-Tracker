-- Run in a new Supabase project's SQL Editor, or with `supabase db push`.
begin;

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  description text not null check (length(btrim(description)) between 1 and 160),
  category text not null check (category in ('Groceries', 'Utilities', 'Transport', 'Household', 'Other')),
  amount_cents bigint not null check (amount_cents between 1 and 9999999999),
  paid_by text not null check (length(btrim(paid_by)) between 1 and 80),
  notes text not null default '' check (length(notes) <= 1000),
  receipt_path text not null unique check (
    receipt_path ~ ('^' || user_id::text || '/' || id::text || '/[0-9a-f-]+\.(jpg|png|webp)$')
  ),
  receipt_name text not null check (length(receipt_name) between 1 and 255),
  receipt_size bigint not null check (receipt_size between 1 and 10485760),
  created_at timestamptz not null default now()
);

create index expenses_user_date_idx on public.expenses (user_id, date desc, created_at desc, id);
alter table public.expenses enable row level security;
revoke all on public.expenses from anon;
grant select, insert, update, delete on public.expenses to authenticated;

create policy "Read own expenses" on public.expenses for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Insert own expenses" on public.expenses for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Update own expenses" on public.expenses for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Delete own expenses" on public.expenses for delete to authenticated
  using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']);

create policy "Read own bills" on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Upload own bills" on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Delete unused own bills" on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (select 1 from public.expenses where receipt_path = name));

-- A record must refer to an uploaded private bill. This runs as the caller,
-- so storage RLS still applies. Photos are immutable; replacement uploads a new file.
create function public.check_expense_receipt() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from storage.objects where bucket_id = 'receipts' and name = new.receipt_path) then
    raise exception 'Upload the receipt before saving the expense';
  end if;
  if TG_OP = 'UPDATE' then
    if new.id <> old.id or new.user_id <> old.user_id or new.created_at <> old.created_at then
      raise exception 'Expense identity and creation time cannot be changed';
    end if;
  end if;
  return new;
end;
$$;
create trigger check_expense_receipt before insert or update on public.expenses
  for each row execute function public.check_expense_receipt();

commit;
