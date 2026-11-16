-- ClassFund 0001: bảng, ràng buộc, bất biến, nhật ký, RLS
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 1 and 120),
  created_at timestamptz not null default now()
);
create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role = 'treasurer'),
  created_at timestamptz not null default now()
);
create function public.limit_treasurers() returns trigger language plpgsql as $$
begin
  -- Serialize concurrent role provisioning so the two-account cap cannot race.
  perform pg_advisory_xact_lock(hashtext('classfund_treasurer_limit'));
  if (select count(*) from public.user_roles) >= 2 then
    raise exception 'treasurer_limit';
  end if;
  return new;
end $$;
create trigger user_roles_limit before insert on public.user_roles
  for each row execute function public.limit_treasurers();

create function public.is_treasurer() returns boolean language sql stable security definer
set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'treasurer');
$$;

create table public.students (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(btrim(full_name)) between 1 and 120),
  student_number text check (student_number is null or char_length(student_number) <= 30),
  name_key text generated always as (lower(regexp_replace(btrim(full_name), '\s+', ' ', 'g'))) stored,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index students_name_active_uq on public.students (name_key) where active;
create unique index students_number_active_uq on public.students (student_number) where active and student_number is not null;

create table public.contributions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text check (description is null or char_length(description) <= 500),
  type text not null check (type in ('fixed', 'voluntary', 'custom')),
  amount bigint check (amount is null or (amount >= 0 and amount <= 1000000000)),
  start_date date,
  due_date date,
  status text not null default 'active' check (status in ('active', 'closed')),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fixed_needs_amount check (type <> 'fixed' or amount > 0),
  constraint due_after_start check (due_date is null or start_date is null or due_date >= start_date)
);

create table public.contribution_assignments (
  id uuid primary key default gen_random_uuid(),
  contribution_id uuid not null references public.contributions(id),
  student_id uuid not null references public.students(id),
  status text not null check (status in ('required', 'exempt', 'excluded')),
  required_amount bigint check (required_amount is null or (required_amount >= 0 and required_amount <= 1000000000)),
  reason text check (reason is null or char_length(reason) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contribution_id, student_id)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id),
  contribution_id uuid not null references public.contributions(id),
  amount bigint not null check (amount > 0 and amount <= 1000000000),
  method text not null check (method in ('cash', 'bank_transfer', 'other')),
  paid_at timestamptz not null default now(),
  recorded_by uuid not null references auth.users(id),
  reference text check (reference is null or char_length(reference) <= 100),
  note text check (note is null or char_length(note) <= 500),
  initial_status text not null check (initial_status in ('pending', 'verified')),
  idempotency_key uuid not null unique,
  created_at timestamptz not null default now()
);
create index payments_student_contribution_idx on public.payments (student_id, contribution_id);
create index payments_paid_at_idx on public.payments (paid_at desc);

create table public.payment_reversals (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null unique references public.payments(id),
  reason text not null check (char_length(btrim(reason)) between 3 and 300),
  reversed_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id),
  amount bigint not null check (amount > 0),
  reason text not null check (char_length(btrim(reason)) between 3 and 300),
  refunded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index refunds_payment_idx on public.refunds (payment_id);
create table public.adjustments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id),
  contribution_id uuid not null references public.contributions(id),
  amount bigint not null check (amount > 0 and amount <= 1000000000), -- giảm số tiền phải nộp
  reason text not null check (char_length(btrim(reason)) between 3 and 300),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index adjustments_sc_idx on public.adjustments (student_id, contribution_id);
create table public.payment_promises (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id),
  contribution_id uuid references public.contributions(id),
  amount bigint not null check (amount > 0 and amount <= 1000000000),
  expected_date date,
  note text check (note is null or char_length(note) <= 500),
  recorded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table public.reconciliation_records (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null unique references public.payments(id),
  note text check (note is null or char_length(note) <= 300),
  reconciled_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table public.idempotency_records (
  key uuid primary key,
  user_id uuid not null,
  action text not null,
  result_id uuid not null,
  created_at timestamptz not null default now()
);
create table public.audit_logs (
  id bigint generated always as identity primary key,
  event_id uuid not null unique default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  reason text,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

-- Bất biến: không sửa/xoá các bảng tài chính và nhật ký (kể cả service role, trừ khi tắt trigger bằng quyền superuser)
create function public.forbid_mutation() returns trigger language plpgsql as $$
begin
  raise exception 'immutable_record' using errcode = '42501';
end $$;
do $$
declare t text;
begin
  foreach t in array array['payments','payment_reversals','refunds','adjustments','payment_promises','reconciliation_records','audit_logs','idempotency_records'] loop
    execute format('create trigger %I before update or delete on public.%I for each row execute function public.forbid_mutation()', t || '_immutable', t);
    execute format('create trigger %I before truncate on public.%I for each statement execute function public.forbid_mutation()', t || '_notruncate', t);
  end loop;
end $$;

-- Nhật ký tự động cho mọi bảng nghiệp vụ
create function public.audit_row() returns trigger language plpgsql security definer
set search_path = public as $$
declare v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
        v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
        v_id text;
begin
  v_id := coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'user_id', v_old ->> 'user_id');
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, before_data, after_data, reason)
  values (auth.uid(), tg_table_name || '.' || lower(tg_op), tg_table_name, v_id, v_old, v_new,
          coalesce(v_new ->> 'reason', v_old ->> 'reason'));
  return coalesce(new, old);
end $$;
do $$
declare t text;
begin
  foreach t in array array['students','contributions','contribution_assignments','payments','payment_reversals','refunds','adjustments','payment_promises','reconciliation_records','user_roles'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row()', t || '_audit', t);
  end loop;
end $$;

-- RLS: chỉ thủ quỹ được đọc; KHÔNG có policy ghi => mọi thao tác ghi phải đi qua hàm RPC
do $$
declare t text;
begin
  foreach t in array array['profiles','user_roles','students','contributions','contribution_assignments','payments','payment_reversals','refunds','adjustments','payment_promises','reconciliation_records','idempotency_records','audit_logs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    if t not in ('profiles','user_roles','idempotency_records') then
      execute format('create policy %I on public.%I for select to authenticated using (public.is_treasurer())', t || '_select', t);
    end if;
  end loop;
end $$;
create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid() or public.is_treasurer());
create policy user_roles_select on public.user_roles for select to authenticated using (user_id = auth.uid() or public.is_treasurer());
