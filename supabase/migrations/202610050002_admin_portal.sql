-- Apply once AFTER 202610050001_expenses.sql. Existing bills remain unchanged.
begin;

-- Only the project owner can assign this single admin through the SQL Editor.
create table public.app_admins (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  assigned_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
revoke all on public.app_admins from public, anon, authenticated;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_admins where user_id = (select auth.uid()));
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

drop policy "Read own expenses" on public.expenses;
create policy "Read own expenses or administer" on public.expenses for select to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()));
drop policy "Update own expenses" on public.expenses;
create policy "Update own expenses or administer" on public.expenses for update to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()))
  with check ((select auth.uid()) = user_id or (select public.is_admin()));
drop policy "Delete own expenses" on public.expenses;
create policy "Delete own expenses or administer" on public.expenses for delete to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()));
-- Insert remains limited to one's own account; admins edit existing submissions.

drop policy "Read own bills" on storage.objects;
create policy "Read own bills or administer" on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin())));
drop policy "Upload own bills" on storage.objects;
create policy "Upload own bills or administer" on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin())));
drop policy "Delete unused own bills" on storage.objects;
create policy "Delete unused bills as owner or admin" on storage.objects for delete to authenticated
  using (bucket_id = 'receipts'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin()))
    and not exists (select 1 from public.expenses where receipt_path = name));

create index expenses_admin_date_idx on public.expenses (date desc, created_at desc, id);

-- Email addresses are available only through this explicitly authorized RPC.
create function public.list_admin_expenses() returns table (
  id uuid, user_id uuid, date date, description text, category text,
  amount_cents bigint, paid_by text, notes text, receipt_path text,
  receipt_name text, receipt_size bigint, created_at timestamptz, uploader_email text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  return query
    select e.id, e.user_id, e.date, e.description, e.category, e.amount_cents,
      e.paid_by, e.notes, e.receipt_path, e.receipt_name, e.receipt_size, e.created_at,
      u.email::text
    from public.expenses as e join auth.users as u on u.id = e.user_id;
end;
$$;
revoke all on function public.list_admin_expenses() from public, anon;
grant execute on function public.list_admin_expenses() to authenticated;

commit;
