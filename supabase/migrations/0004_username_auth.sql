-- ClassFund 0004: username-based login identity and first-login password rotation.
-- Supabase Auth still performs password verification; usernames map to non-deliverable
-- addresses in login.classfund.invalid. No personal email address is collected.
alter table public.profiles
  add column if not exists username text,
  add column if not exists must_change_password boolean not null default false,
  add column if not exists password_provisioned_at timestamptz;

create unique index if not exists profiles_username_uq
  on public.profiles (lower(username)) where username is not null;

alter table public.profiles
  drop constraint if exists profiles_username_format;
alter table public.profiles
  add constraint profiles_username_format
  check (username is null or username ~ '^[a-z][a-z0-9_]{2,31}$');

create or replace function public.complete_initial_password_change()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_must_change boolean;
  v_provisioned_at timestamptz;
  v_auth_updated_at timestamptz;
begin
  perform public.assert_treasurer();
  select must_change_password, password_provisioned_at
    into v_must_change, v_provisioned_at
    from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'profile_not_found'; end if;
  if not v_must_change then return true; end if;
  select updated_at into v_auth_updated_at from auth.users where id = auth.uid();
  if v_provisioned_at is null or v_auth_updated_at is null or v_auth_updated_at <= v_provisioned_at then
    raise exception 'password_change_required';
  end if;
  update public.profiles
     set must_change_password = false,
         password_provisioned_at = null
   where id = auth.uid();
  return true;
end;
$$;

revoke all on function public.complete_initial_password_change() from public, anon, authenticated;
grant execute on function public.complete_initial_password_change() to authenticated;
