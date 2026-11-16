-- ===== 0001_schema.sql =====
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

-- ===== 0002_views.sql =====
-- ClassFund 0002: quy tắc kế toán nằm trong CSDL (nguồn sự thật duy nhất)
-- Tiền "đã thu" = giao dịch đã xác minh, chưa bị đảo, trừ phần đã hoàn.
-- Chuyển khoản chưa đối soát = "chờ đối soát" (KHÔNG tính là đã thu). Hứa nộp không bao giờ được tính.
create view public.payments_v with (security_invoker = true) as
select p.*,
       (r.id is not null) as reversed,
       (p.initial_status = 'verified' or rc.id is not null) as verified,
       coalesce(rf.refunded, 0)::bigint as refunded
from public.payments p
left join public.payment_reversals r on r.payment_id = p.id
left join public.reconciliation_records rc on rc.payment_id = p.id
left join (select payment_id, sum(amount) as refunded from public.refunds group by payment_id) rf on rf.payment_id = p.id;

create view public.student_contribution_status with (security_invoker = true) as
with base as (
  select s.id as student_id, s.full_name, c.id as contribution_id, c.name as contribution_name,
         c.type, a.status as assignment_status, (a.id is not null) as has_assignment,
         case c.type when 'fixed' then coalesce(a.required_amount, c.amount)
                     when 'custom' then a.required_amount else 0 end as required_amount
  from public.students s
  cross join public.contributions c
  left join public.contribution_assignments a on a.student_id = s.id and a.contribution_id = c.id
  where s.active
), pay as (
  select student_id, contribution_id,
         coalesce(sum(amount - refunded) filter (where verified and not reversed), 0)::bigint as received,
         coalesce(sum(amount) filter (where not verified and not reversed), 0)::bigint as pending
  from public.payments_v group by student_id, contribution_id
), adj as (
  select student_id, contribution_id, sum(amount)::bigint as adjusted from public.adjustments group by 1, 2
), calc as (
  select b.*, coalesce(p.received, 0) as received_amount, coalesce(p.pending, 0) as pending_amount,
         coalesce(j.adjusted, 0) as adjustment_amount,
         (b.type <> 'voluntary' and coalesce(b.assignment_status, 'required') = 'required'
          and not (b.type = 'custom' and not b.has_assignment)) as is_liable,
         greatest(coalesce(b.required_amount, 0) - coalesce(j.adjusted, 0), 0) as adj_required
  from base b
  left join pay p on p.student_id = b.student_id and p.contribution_id = b.contribution_id
  left join adj j on j.student_id = b.student_id and j.contribution_id = b.contribution_id
), eff as (
  select calc.*, case when is_liable then adj_required else 0 end as effective_required from calc
)
select student_id, full_name, contribution_id, contribution_name, type, assignment_status, is_liable,
       effective_required, received_amount, pending_amount, adjustment_amount,
       case when is_liable then greatest(effective_required - received_amount, 0) else 0 end::bigint as outstanding_amount,
       case when is_liable then greatest(received_amount - effective_required, 0) else 0 end::bigint as overpaid_amount,
       case
         when assignment_status = 'excluded' or (type = 'custom' and not has_assignment) then 'excluded'
         when assignment_status = 'exempt' then 'exempt'
         when type = 'voluntary' then case when received_amount > 0 then 'voluntary_paid'
                                           when pending_amount > 0 then 'pending_reconciliation' else 'voluntary_none' end
         when received_amount > effective_required then 'overpaid'
         when received_amount = effective_required then 'fully_paid'
         when received_amount > 0 then 'partially_paid'
         when pending_amount > 0 then 'pending_reconciliation'
         else 'not_paid' end as status
from eff;

create view public.student_overall with (security_invoker = true) as
select student_id, full_name,
       coalesce(sum(effective_required) filter (where is_liable), 0)::bigint as required_total,
       coalesce(sum(received_amount), 0)::bigint as received_total,
       coalesce(sum(pending_amount), 0)::bigint as pending_total,
       coalesce(sum(outstanding_amount), 0)::bigint as outstanding_total,
       case when count(*) filter (where is_liable) = 0 then 'no_obligations'
            when sum(outstanding_amount) = 0 then 'fully_paid'
            when coalesce(sum(received_amount) filter (where is_liable), 0) > 0 then 'partially_paid'
            else 'not_paid' end as overall_status
from public.student_contribution_status
group by student_id, full_name;

create view public.class_summary with (security_invoker = true) as
select
  (select coalesce(sum(amount - refunded), 0) from public.payments_v where verified and not reversed)::bigint as total_received,
  (select coalesce(sum(received_amount), 0) from public.student_contribution_status where is_liable)::bigint as required_received,
  (select coalesce(sum(effective_required), 0) from public.student_contribution_status)::bigint as total_required,
  (select coalesce(sum(outstanding_amount), 0) from public.student_contribution_status)::bigint as total_outstanding,
  (select coalesce(sum(received_amount), 0) from public.student_contribution_status where type = 'voluntary')::bigint as voluntary_received,
  (select coalesce(sum(amount), 0) from public.payments_v where not verified and not reversed)::bigint as pending_reconciliation,
  (select coalesce(sum(amount), 0) from public.payment_promises)::bigint as promised_total,
  (select count(*) from public.students where active) as student_count,
  (select count(*) from public.student_overall where overall_status = 'fully_paid') as fully_paid_count,
  (select count(*) from public.student_overall where overall_status = 'partially_paid') as partially_paid_count,
  (select count(*) from public.student_overall where overall_status = 'not_paid') as not_paid_count;

revoke all on public.payments_v, public.student_contribution_status, public.student_overall, public.class_summary from anon, authenticated;
grant select on public.payments_v, public.student_contribution_status, public.student_overall, public.class_summary to authenticated;

-- ===== 0003_functions.sql =====
-- ClassFund 0003: mọi thao tác ghi đi qua RPC. Người thực hiện luôn là auth.uid() (không nhận từ client).
create function public.assert_treasurer() returns void language plpgsql stable security definer
set search_path = public as $$
begin
  if auth.uid() is null or not public.is_treasurer() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end $$;

create function public.create_student(p_full_name text, p_student_number text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public.assert_treasurer();
  insert into public.students (full_name, student_number)
  values (regexp_replace(btrim(p_full_name), '\s+', ' ', 'g'), nullif(btrim(p_student_number), ''))
  returning id into v_id;
  return v_id;
exception when unique_violation then raise exception 'duplicate_student';
end $$;

create function public.update_student(p_id uuid, p_full_name text, p_student_number text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_treasurer();
  update public.students set full_name = regexp_replace(btrim(p_full_name), '\s+', ' ', 'g'),
         student_number = nullif(btrim(p_student_number), ''), updated_at = now()
  where id = p_id and active;
  if not found then raise exception 'student_not_found'; end if;
exception when unique_violation then raise exception 'duplicate_student';
end $$;

create function public.archive_student(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_treasurer();
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'reason_required'; end if;
  update public.students set active = false, updated_at = now() where id = p_id and active;
  if not found then raise exception 'student_not_found'; end if;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, reason)
  values (auth.uid(), 'students.archive', 'students', p_id::text, btrim(p_reason));
end $$;

create function public.import_students(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; v_inserted int := 0; v_skipped jsonb := '[]'::jsonb; v_name text; v_num text;
begin
  perform public.assert_treasurer();
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then raise exception 'invalid_import'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_name := regexp_replace(btrim(r ->> 'full_name'), '\s+', ' ', 'g');
    v_num := nullif(btrim(coalesce(r ->> 'student_number', '')), '');
    begin
      insert into public.students (full_name, student_number) values (v_name, v_num);
      v_inserted := v_inserted + 1;
    exception when unique_violation or check_violation then
      v_skipped := v_skipped || jsonb_build_array(v_name);
    end;
  end loop;
  return jsonb_build_object('inserted', v_inserted, 'skipped', v_skipped);
end $$;

create function public.save_contribution(p_id uuid, p_name text, p_description text, p_type text, p_amount bigint,
  p_start_date date, p_due_date date, p_status text, p_notes text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public.assert_treasurer();
  if p_id is null then
    insert into public.contributions (name, description, type, amount, start_date, due_date, status, notes)
    values (btrim(p_name), nullif(btrim(p_description), ''), p_type, p_amount, p_start_date, p_due_date, coalesce(p_status, 'active'), nullif(btrim(p_notes), ''))
    returning id into v_id;
  else
    -- Khóa hàng khoản thu để tuần tự hóa với ghi nhận giao dịch.
    perform 1 from public.contributions where id = p_id for update;
    if not found then raise exception 'contribution_not_found'; end if;
    -- Không cho đổi loại/số tiền sau khi đã có giao dịch hoặc phân công.
    if (exists (select 1 from public.payments where contribution_id = p_id)
        or exists (select 1 from public.contribution_assignments where contribution_id = p_id))
       and exists (select 1 from public.contributions where id = p_id and (type <> p_type or amount is distinct from p_amount)) then
      raise exception 'contribution_locked';
    end if;
    update public.contributions set name = btrim(p_name), description = nullif(btrim(p_description), ''), type = p_type,
      amount = p_amount, start_date = p_start_date, due_date = p_due_date, status = coalesce(p_status, status),
      notes = nullif(btrim(p_notes), ''), updated_at = now() where id = p_id returning id into v_id;
    if v_id is null then raise exception 'contribution_not_found'; end if;
  end if;
  return v_id;
end $$;

create function public.set_assignment(p_contribution_id uuid, p_student_id uuid, p_status text, p_required_amount bigint, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_type text; v_old public.contribution_assignments;
begin
  perform public.assert_treasurer();
  perform pg_advisory_xact_lock(hashtext(p_contribution_id::text || ':' || p_student_id::text));
  select type into v_type from public.contributions where id = p_contribution_id for share;
  if v_type is null then raise exception 'contribution_not_found'; end if;
  if not exists (select 1 from public.students where id = p_student_id and active) then raise exception 'student_not_found'; end if;
  if p_status not in ('required','exempt','excluded') then raise exception 'invalid_assignment_status'; end if;
  if p_status in ('exempt', 'excluded') and char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'reason_required'; end if;
  if p_status = 'required' and p_required_amount is not null and p_required_amount <= 0 then raise exception 'invalid_amount'; end if;
  if v_type = 'custom' and p_status = 'required' and p_required_amount is null then raise exception 'amount_required'; end if;
  select * into v_old from public.contribution_assignments where contribution_id = p_contribution_id and student_id = p_student_id for update;
  if (v_old.id is null and (p_status <> 'required' or p_required_amount is not null) and
        (exists (select 1 from public.payments where contribution_id = p_contribution_id and student_id = p_student_id)
         or exists (select 1 from public.adjustments where contribution_id = p_contribution_id and student_id = p_student_id)))
     or (v_old.id is not null and (v_old.status is distinct from p_status or v_old.required_amount is distinct from p_required_amount)
        and (exists (select 1 from public.payments where contribution_id = p_contribution_id and student_id = p_student_id)
             or exists (select 1 from public.adjustments where contribution_id = p_contribution_id and student_id = p_student_id))) then
    raise exception 'assignment_locked';
  end if;
  insert into public.contribution_assignments (contribution_id, student_id, status, required_amount, reason)
  values (p_contribution_id, p_student_id, p_status, p_required_amount, nullif(btrim(p_reason), ''))
  on conflict (contribution_id, student_id) do update
    set status = excluded.status, required_amount = excluded.required_amount, reason = excluded.reason, updated_at = now();
end $$;

create function public.record_payment(p_student_id uuid, p_contribution_id uuid, p_amount bigint, p_method text,
  p_reference text, p_note text, p_idempotency_key uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_type text; v_cstatus text; v_prev uuid; v_astatus text; v_has boolean;
begin
  perform public.assert_treasurer();
  if p_idempotency_key is null then raise exception 'invalid_request'; end if;
  perform pg_advisory_xact_lock(hashtext(p_idempotency_key::text));
  select result_id into v_prev from public.idempotency_records where key = p_idempotency_key and user_id = auth.uid();
  if found then return v_prev; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000000 then raise exception 'invalid_amount'; end if;
  perform pg_advisory_xact_lock(hashtext(p_contribution_id::text || ':' || p_student_id::text));
  select type, status into v_type, v_cstatus from public.contributions where id = p_contribution_id for share;
  if v_type is null then raise exception 'contribution_not_found'; end if;
  if v_cstatus <> 'active' then raise exception 'contribution_closed'; end if;
  if not exists (select 1 from public.students where id = p_student_id and active) then raise exception 'student_not_found'; end if;
  select status, true into v_astatus, v_has from public.contribution_assignments
   where contribution_id = p_contribution_id and student_id = p_student_id;
  if v_astatus in ('exempt', 'excluded') or (v_type = 'custom' and v_has is not true) then raise exception 'student_not_liable'; end if;
  insert into public.payments (student_id, contribution_id, amount, method, recorded_by, reference, note, initial_status, idempotency_key)
  values (p_student_id, p_contribution_id, p_amount, p_method, auth.uid(), nullif(btrim(p_reference), ''), nullif(btrim(p_note), ''),
          case when p_method = 'bank_transfer' then 'pending' else 'verified' end, p_idempotency_key)
  returning id into v_id;
  insert into public.idempotency_records (key, user_id, action, result_id) values (p_idempotency_key, auth.uid(), 'record_payment', v_id);
  return v_id;
end $$;

create function public.reconcile_payment(p_payment_id uuid, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_pay public.payments;
begin
  perform public.assert_treasurer();
  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found then raise exception 'payment_not_found'; end if;
  if v_pay.initial_status = 'verified' then raise exception 'already_verified'; end if;
  if exists (select 1 from public.payment_reversals where payment_id = p_payment_id) then raise exception 'payment_reversed'; end if;
  insert into public.reconciliation_records (payment_id, note, reconciled_by)
  values (p_payment_id, nullif(btrim(p_note), ''), auth.uid());
exception when unique_violation then raise exception 'already_verified';
end $$;

create function public.reverse_payment(p_payment_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_pay public.payments;
begin
  perform public.assert_treasurer();
  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found then raise exception 'payment_not_found'; end if;
  if exists (select 1 from public.refunds where payment_id = p_payment_id) then raise exception 'payment_has_refund'; end if;
  insert into public.payment_reversals (payment_id, reason, reversed_by) values (p_payment_id, btrim(p_reason), auth.uid());
exception when unique_violation then raise exception 'payment_reversed';
end $$;

create function public.refund_payment(p_payment_id uuid, p_amount bigint, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_pay public.payments_v; v_id uuid; v_locked uuid;
begin
  perform public.assert_treasurer();
  select id into v_locked from public.payments where id = p_payment_id for update;
  if v_locked is null then raise exception 'payment_not_found'; end if;
  select * into v_pay from public.payments_v where id = p_payment_id;
  if v_pay.reversed then raise exception 'payment_reversed'; end if;
  if not v_pay.verified then raise exception 'payment_not_verified'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > v_pay.amount - v_pay.refunded then raise exception 'invalid_amount'; end if;
  insert into public.refunds (payment_id, amount, reason, refunded_by) values (p_payment_id, p_amount, btrim(p_reason), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create function public.add_adjustment(p_student_id uuid, p_contribution_id uuid, p_amount bigint, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_type text; v_base bigint; v_adjusted bigint; v_status text;
begin
  perform public.assert_treasurer();
  perform pg_advisory_xact_lock(hashtext(p_contribution_id::text || ':' || p_student_id::text));
  if p_amount is null or p_amount <= 0 or p_amount > 1000000000 then raise exception 'invalid_amount'; end if;
  if char_length(btrim(coalesce(p_reason,''))) < 3 then raise exception 'reason_required'; end if;
  if not exists (select 1 from public.students where id = p_student_id and active) then raise exception 'student_not_found'; end if;
  select type, amount into v_type, v_base from public.contributions where id = p_contribution_id for share;
  if v_type is null or v_type = 'voluntary' then raise exception 'contribution_not_found'; end if;
  select status, required_amount into v_status, v_base from public.contribution_assignments
    where contribution_id = p_contribution_id and student_id = p_student_id for update;
  if not found then
    if v_type = 'custom' then raise exception 'student_not_liable'; end if;
    select amount into v_base from public.contributions where id = p_contribution_id;
    v_status := 'required';
  end if;
  if v_status <> 'required' then raise exception 'student_not_liable'; end if;
  if v_type = 'fixed' then
    select coalesce(a.required_amount, c.amount) into v_base from public.contributions c
    left join public.contribution_assignments a on a.contribution_id=c.id and a.student_id=p_student_id where c.id=p_contribution_id;
  end if;
  if v_base is null then raise exception 'amount_required'; end if;
  select coalesce(sum(amount),0) into v_adjusted from public.adjustments where student_id=p_student_id and contribution_id=p_contribution_id;
  if p_amount > greatest(v_base - v_adjusted, 0) then raise exception 'adjustment_exceeds_required'; end if;
  insert into public.adjustments (student_id, contribution_id, amount, reason, created_by)
  values (p_student_id, p_contribution_id, p_amount, btrim(p_reason), auth.uid()) returning id into v_id;
  return v_id;
end $$;

create function public.add_promise(p_student_id uuid, p_contribution_id uuid, p_amount bigint, p_expected_date date, p_note text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public.assert_treasurer();
  if not exists (select 1 from public.students where id = p_student_id and active) then raise exception 'student_not_found'; end if;
  insert into public.payment_promises (student_id, contribution_id, amount, expected_date, note, recorded_by)
  values (p_student_id, p_contribution_id, p_amount, p_expected_date, nullif(btrim(p_note), ''), auth.uid()) returning id into v_id;
  return v_id;
end $$;

-- Trang công khai: chỉ số liệu tổng hợp, không có dữ liệu cá nhân
create function public.public_progress() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'total_received', s.total_received,
    'required_received', s.required_received,
    'total_required', s.total_required,
    'progress_percent', case when s.total_required > 0
        then least(100, floor(100 * least(s.required_received, s.total_required)::numeric / s.total_required)) else 0 end,
    'completed_contributions', (select count(*) from (
        select contribution_id from public.student_contribution_status where type <> 'voluntary'
        group by contribution_id having sum(effective_required) > 0 and sum(outstanding_amount) = 0) x),
    'total_contributions', (select count(*) from public.contributions where type <> 'voluntary')
  ) from public.class_summary s;
$$;

-- Quyền thực thi: mặc định từ chối, chỉ mở những gì cần
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind = 'f' loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;
grant execute on function public.public_progress() to anon, authenticated;
grant execute on function public.is_treasurer() to authenticated;
grant execute on function public.create_student(text, text), public.update_student(uuid, text, text), public.archive_student(uuid, text),
  public.import_students(jsonb), public.save_contribution(uuid, text, text, text, bigint, date, date, text, text),
  public.set_assignment(uuid, uuid, text, bigint, text), public.record_payment(uuid, uuid, bigint, text, text, text, uuid),
  public.reconcile_payment(uuid, text), public.reverse_payment(uuid, text), public.refund_payment(uuid, bigint, text),
  public.add_adjustment(uuid, uuid, bigint, text), public.add_promise(uuid, uuid, bigint, date, text) to authenticated;

-- ===== 0004_username_auth.sql =====
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
