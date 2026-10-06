-- Sign up through the PERSONAL UPLOAD link first and confirm your email.
-- Replace YOUR_ADMIN_EMAIL_HERE, then run this in Supabase's SQL Editor.
-- This script promotes only an existing confirmed account. It cannot be called
-- through the app, and it will not silently replace a different administrator.
begin;
do $$
declare
  admin_email text := 'YOUR_ADMIN_EMAIL_HERE';
  admin_user_id uuid;
  confirmed_at timestamptz;
begin
  if admin_email = 'YOUR_ADMIN_EMAIL_HERE' then
    raise exception 'Replace YOUR_ADMIN_EMAIL_HERE with your Expense Tracker login email';
  end if;
  select id, email_confirmed_at into admin_user_id, confirmed_at
    from auth.users where lower(email) = lower(btrim(admin_email));
  if admin_user_id is null then
    raise exception 'Account not found. Sign up through the upload link first';
  end if;
  if confirmed_at is null then
    raise exception 'Confirm the account email before assigning administrator access';
  end if;
  insert into public.app_admins (singleton, user_id) values (true, admin_user_id)
    on conflict (singleton) do nothing;
  if not exists (select 1 from public.app_admins where user_id = admin_user_id) then
    raise exception 'A different administrator is already assigned. Review app_admins in the SQL Editor before changing it';
  end if;
end;
$$;
commit;
