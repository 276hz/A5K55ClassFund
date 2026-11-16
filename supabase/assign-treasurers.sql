-- ClassFund: link the two manually-created Supabase Auth users to treasurer profiles.
-- Run ONCE in Supabase SQL Editor, AFTER creating both users in Authentication > Users.
-- Create these users in the Dashboard with Email + Password and mark email as confirmed:
--   thuydung@login.classfund.invalid  (Đặng Thùy Dung)
--   thuytrang@login.classfund.invalid (Nguyễn Thùy Trang)
-- Choose a temporary password for each account and share it privately with its owner.
-- This script never reads, prints, or changes passwords and does not need a service-role key.

do $$
declare
  v_dung uuid;
  v_trang uuid;
  v_user uuid;
  v_existing_other_roles integer;
begin
  select id into v_dung
    from auth.users
   where lower(email) = 'thuydung@login.classfund.invalid';
  select id into v_trang
    from auth.users
   where lower(email) = 'thuytrang@login.classfund.invalid';

  if v_dung is null then
    raise exception 'Chưa tạo Auth user thuydung@login.classfund.invalid trong Authentication > Users.';
  end if;
  if v_trang is null then
    raise exception 'Chưa tạo Auth user thuytrang@login.classfund.invalid trong Authentication > Users.';
  end if;
  if v_dung = v_trang then
    raise exception 'Hai username đang trỏ tới cùng một Auth user.';
  end if;

  if exists (
    select 1 from public.profiles
     where id = v_dung and username is not null and username <> 'thuydung'
  ) or exists (
    select 1 from public.profiles
     where id = v_trang and username is not null and username <> 'thuytrang'
  ) then
    raise exception 'Một Auth user đã được gán username khác; dừng để tránh ghi đè.';
  end if;

  if exists (
    select 1 from public.profiles
     where lower(username) in ('thuydung', 'thuytrang')
       and id not in (v_dung, v_trang)
  ) then
    raise exception 'Username đã được gán cho Auth user khác.';
  end if;

  select count(*) into v_existing_other_roles
    from public.user_roles
   where role = 'treasurer' and user_id not in (v_dung, v_trang);
  if v_existing_other_roles > 0 then
    raise exception 'Đã tồn tại role treasurer ngoài hai tài khoản dự kiến. Hãy kiểm tra user_roles trước.';
  end if;

  insert into public.profiles (id, full_name, username, must_change_password, password_provisioned_at)
  values
    (v_dung, 'Đặng Thùy Dung', 'thuydung', true, now()),
    (v_trang, 'Nguyễn Thùy Trang', 'thuytrang', true, now())
  on conflict (id) do update
    set full_name = excluded.full_name,
        username = excluded.username,
        must_change_password = case
          when profiles.username is null then true
          else profiles.must_change_password
        end,
        password_provisioned_at = case
          when profiles.username is null then now()
          else profiles.password_provisioned_at
        end;

  for v_user in select unnest(array[v_dung, v_trang]) loop
    if not exists (select 1 from public.user_roles where user_id = v_user and role = 'treasurer') then
      insert into public.user_roles (user_id, role) values (v_user, 'treasurer');
    end if;
  end loop;
end $$;

select p.full_name, p.username, r.role, p.must_change_password
  from public.profiles p
  join public.user_roles r on r.user_id = p.id
 where p.username in ('thuydung', 'thuytrang')
 order by p.username;
