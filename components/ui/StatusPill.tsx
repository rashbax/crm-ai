import React from "react";

type Status = 
  | "active" 
  | "draft" 
  | "blocked" 
  | "new" 
  | "processing" 
  | "shipped" 
  | "cancelled"
  | "scheduled"
  | "ended";

interface StatusPillProps {
  status: Status;
  children?: React.ReactNode;
}

export function StatusPill({ status, children }: StatusPillProps) {
  const styles: Record<Status, string> = {
    active: "bg-success-light text-success border-success",
    draft: "bg-warning-light text-warning border-warning",
    blocked: "bg-danger-light text-danger border-danger",
    new: "bg-info-light text-info border-info",
    processing: "bg-warning-light text-warning border-warning",
    shipped: "bg-success-light text-success border-success",
    cancelled: "bg-danger-light text-danger border-danger",
    scheduled: "bg-info-light text-info border-info",
    ended: "bg-gray-100 text-gray-600 border-gray-300",
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[status]}`}>
      {children || status}
    </span>
  );
}
