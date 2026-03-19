import React from "react";

export interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

export function Card({ children, className = "", onClick }: CardProps) {
  return (
    <div className={`bg-card rounded-card shadow-card border border-border ${className}`} onClick={onClick}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className = "" }: CardProps) {
  return (
    <div className={`px-6 py-4 border-b border-border ${className}`}>
      {children}
    </div>
  );
}

export function CardBody({ children, className = "" }: CardProps) {
  return (
    <div className={`px-6 py-4 ${className}`}>
      {children}
    </div>
  );
}

export function CardTitle({ children, className = "" }: CardProps) {
  return (
    <h3 className={`text-base font-semibold text-text-main ${className}`}>
      {children}
    </h3>
  );
}

export function CardSubtitle({ children, className = "" }: CardProps) {
  return (
    <p className={`text-sm text-text-muted mt-1 ${className}`}>
      {children}
    </p>
  );
}
