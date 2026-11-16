import type { Field } from "@/components/RpcForm";

export const contributionFields = (c?: { name: string; description: string | null; type: string; amount: number | null; start_date: string | null; due_date: string | null; status: string; notes: string | null }): Field[] => [
  { name: "name", label: "Tên khoản thu", required: true, maxLength: 120, defaultValue: c?.name ?? "" },
  { name: "type", label: "Loại", type: "select" as const, defaultValue: c?.type ?? "fixed", options: [{ value: "fixed", label: "Cố định (mọi học sinh cùng số tiền)" }, { value: "voluntary", label: "Tự nguyện (không phát sinh nợ)" }, { value: "custom", label: "Tuỳ chỉnh (mỗi học sinh một mức)" }] },
  { name: "amount", label: "Số tiền (cố định) / gợi ý (tự nguyện)", type: "money" as const, defaultValue: c?.amount ? new Intl.NumberFormat("vi-VN").format(c.amount) : "" },
  { name: "start_date", label: "Ngày bắt đầu", type: "date" as const, defaultValue: c?.start_date ?? "" },
  { name: "due_date", label: "Hạn nộp", type: "date" as const, defaultValue: c?.due_date ?? "" },
  ...(c ? [{ name: "status", label: "Tình trạng", type: "select" as const, defaultValue: c.status, options: [{ value: "active", label: "Đang thu" }, { value: "closed", label: "Đã đóng" }] }] : []),
  { name: "description", label: "Mô tả", type: "textarea" as const, maxLength: 500, defaultValue: c?.description ?? "" },
  { name: "notes", label: "Ghi chú riêng", type: "textarea" as const, maxLength: 1000, defaultValue: c?.notes ?? "" },
];
