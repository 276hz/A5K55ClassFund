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
