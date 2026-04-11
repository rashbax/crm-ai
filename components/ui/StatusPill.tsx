import React from "react";

type Status =
  | "active"
  | "draft"
  | "blocked"
  | "processing"
  | "shipped"
  | "in_transit"
  | "delivered"
  | "returned"
  | "cancelled"
  | "scheduled"
  | "ended"
  | "critical"
  | "low"
  | "normal"
  | "good"
  | "closed"
  | "replied"
  | "in_progress"
  | "waiting"
  | "need_approval"
  | "done"
  | "overdue"
  | "open"
  | "escalated"
  | "resolved"
  | "pending"
  | "approved"
  | "rejected"
  | "yangi"
  | "jarayonda"
  | "kutyapti"
  | "javob_berilgan"
  | "yopilgan"
  | "sla_breached"
  | "new"
  | "reopened";

export interface StatusPillProps {
  status: Status;
  children?: React.ReactNode;
  title?: string;
}

export function StatusPill({ status, children, title }: StatusPillProps) {
  const styles: Record<Status, string> = {
    active: "bg-success-light text-success border-success",
    draft: "bg-warning-light text-warning border-warning",
    blocked: "bg-danger-light text-danger border-danger",
    processing: "bg-warning-light text-warning border-warning",
    shipped: "bg-info-light text-info border-info",
    in_transit: "bg-blue-100 text-blue-700 border-blue-300",
    delivered: "bg-success-light text-success border-success",
    returned: "bg-danger-light text-danger border-danger",
    cancelled: "bg-danger-light text-danger border-danger",
    scheduled: "bg-info-light text-info border-info",
    ended: "bg-gray-100 text-gray-600 border-gray-300",
    critical: "bg-danger-light text-danger border-danger",
    low: "bg-warning-light text-warning border-warning",
    normal: "bg-gray-100 text-gray-600 border-gray-300",
    good: "bg-success-light text-success border-success",
    closed: "bg-gray-100 text-gray-600 border-gray-300",
    replied: "bg-info-light text-info border-info",
    in_progress: "bg-warning-light text-warning border-warning",
    waiting: "bg-gray-100 text-gray-600 border-gray-300",
    need_approval: "bg-warning-light text-warning border-warning",
    done: "bg-success-light text-success border-success",
    overdue: "bg-danger-light text-danger border-danger",
    open: "bg-info-light text-info border-info",
    escalated: "bg-danger-light text-danger border-danger",
    resolved: "bg-success-light text-success border-success",
    pending: "bg-warning-light text-warning border-warning",
    approved: "bg-success-light text-success border-success",
    rejected: "bg-danger-light text-danger border-danger",
    yangi: "bg-info-light text-info border-info",
    jarayonda: "bg-warning-light text-warning border-warning",
    kutyapti: "bg-gray-100 text-gray-600 border-gray-300",
    javob_berilgan: "bg-success-light text-success border-success",
    yopilgan: "bg-gray-100 text-gray-600 border-gray-300",
    sla_breached: "bg-danger-light text-danger border-danger",
    new: "bg-info-light text-info border-info",
    reopened: "bg-warning-light text-warning border-warning",
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[status]}`} title={title}>
      {children || status}
    </span>
  );
}
