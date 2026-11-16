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
