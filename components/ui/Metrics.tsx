import React from "react";

interface MetricMainProps {
  children: React.ReactNode;
  className?: string;
}

export function MetricMain({ children, className = "" }: MetricMainProps) {
  return (
    <div className={`text-3xl font-bold text-text-main ${className}`}>
      {children}
    </div>
  );
}

interface MetricLabelProps {
  children: React.ReactNode;
  className?: string;
}

export function MetricLabel({ children, className = "" }: MetricLabelProps) {
  return (
    <span className={`text-sm text-text-muted ${className}`}>
      {children}
    </span>
  );
}

interface MetricChangeProps {
  value: string | number;
  positive?: boolean;
  className?: string;
}

export function MetricChange({ value, positive, className = "" }: MetricChangeProps) {
  const colorClass = positive 
    ? "text-success" 
    : positive === false 
    ? "text-danger" 
    : "text-text-muted";
    
  return (
    <span className={`text-sm font-medium ${colorClass} ${className}`}>
      {value}
    </span>
  );
}

interface MetricRowProps {
  children: React.ReactNode;
  className?: string;
}

export function MetricRow({ children, className = "" }: MetricRowProps) {
  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`}>
      {children}
    </div>
  );
}
