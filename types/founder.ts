// ============================================
// FOUNDER CONTROL SYSTEM TYPES (T3)
// Sprint 1: Responsibility Matrix + Task Engine 2.0 + Audit Log
// Sprint 2: Incidents + Approvals + Enhanced Audit Log
// ============================================

// ============================================
// USER & ROLE TYPES
// ============================================

export type UserRole = "founder" | "manager" | "reviewer" | "backupOwner";

export interface SystemUser {
  id: string;
  name: string;
  role: UserRole;
  permissions: string[];
  decisionLimit: number; // max budget decision in RUB
  active: boolean;
  createdAt: string;
}

// ============================================
// MARKETPLACE
// ============================================

export type MarketplaceId = "WB" | "Ozon";

// ============================================
// SKU RESPONSIBILITY MATRIX
// ============================================

export interface SkuResponsibility {
  id: string;
  skuId: string;
  marketplace: MarketplaceId;
  marketplaceOwnerId: string;
  adsOwnerId: string;
  contentOwnerId: string;
  supplyOwnerId: string;
  reviewerId: string;
  backupOwnerId: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// TASK ENGINE 2.0
// ============================================

export type TaskType =
  | "stock_check"
  | "price_update"
  | "content_fix"
  | "ads_optimization"
  | "supply_order"
  | "incident_fix"
  | "listing_fix"
  | "review_response"
  | "general";

export type TaskPriority = "critical" | "high" | "medium" | "low";

export type TaskStatus =
  | "new"
  | "in_progress"
  | "waiting"
  | "blocked"
  | "need_approval"
  | "done"
  | "overdue";

export type ProofType = "link" | "screenshot" | "text" | "file";

export interface FounderTask {
  id: string;
  title: string;
  description: string;
  marketplace: MarketplaceId | "all";
  skuId?: string;
  taskType: TaskType;
  priority: TaskPriority;
  status: TaskStatus;
  assigneeId: string;
  creatorId: string;
  reviewerId: string;
  dueDate: string;
  blockedReason?: string;
  waitingReason?: string;
  proofType?: ProofType;
  proofValue?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  overdueDays: number;
}

// ============================================
// GENERAL AUDIT LOG (T3)
// ============================================

export type AuditEntityType =
  | "task"
  | "responsibility"
  | "price"
  | "incident"
  | "approval"
  | "stock"
  | "ads";

export interface GeneralAuditLog {
  id: string;
  entityType: AuditEntityType;
  entityId: string;
  fieldName: string;
  oldValue: string;
  newValue: string;
  changedBy: string;
  changedAt: string;
}

// ============================================
// INCIDENT REGISTRY (T3 Sprint 2)
// ============================================

export type IncidentType =
  | "stock_mismatch"
  | "barcode_problem"
  | "return_spike"
  | "listing_blocked"
  | "pricing_risk"
  | "ad_overspend"
  | "supply_issue"
  | "document_issue"
  | "other";

export type IncidentSeverity = "low" | "medium" | "high" | "critical";

export type IncidentStatus = "open" | "in_progress" | "resolved" | "escalated" | "closed";

export interface Incident {
  id: string;
  incidentType: IncidentType;
  marketplace: MarketplaceId | "all";
  skuId?: string;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  ownerId: string;
  rootCause?: string;
  actionPlan?: string;
  createdAt: string;
  dueDate: string;
  resolvedAt?: string;
  escalatedAt?: string;
  updatedAt: string;
}

// ============================================
// APPROVAL WORKFLOW (T3 Sprint 2)
// ============================================

export type ApprovalEntityType = "price" | "promo" | "ads_budget" | "stock_scale" | "responsibility_change" | "other";

export type ApprovalType = "price_below_min" | "promo_loss_risk" | "budget_over_limit" | "critical_stock_scale" | "owner_change" | "general";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface Approval {
  id: string;
  entityType: ApprovalEntityType;
  entityId: string;
  approvalType: ApprovalType;
  reason: string;
  requestedBy: string;
  approverId: string; // founder
  status: ApprovalStatus;
  requestedAt: string;
  decidedAt?: string;
  decisionComment?: string;
}

// ============================================
// STOCK POSITION (T3 enriched)
// ============================================

export type StockRiskLevel = "none" | "low" | "medium" | "high" | "critical";

export interface StockPosition {
  id: string;
  skuId: string;
  marketplace: MarketplaceId;
  marketplaceStock: number;
  localStock: number;
  transitStock: number;
  reservedStock: number;
  dailySales: number;
  daysCover: number;
  reorderPoint: number;
  riskLevel: StockRiskLevel;
  updatedAt: string;
}

// ============================================
// FOUNDER DASHBOARD WIDGET TYPES
// ============================================

export interface FounderWidgetData {
  criticalIncidents: number;
  overdueTasks: number;
  pendingApprovals: number;
  noOwnerSkus: number;
  stockoutRiskSkus: number;
  lossRiskItems: number;
  adStockConflicts: number;
  teamScorecard: TeamMemberScore[];
}

export interface TeamMemberScore {
  userId: string;
  userName: string;
  role: UserRole;
  activeTasks: number;
  completedOnTime: number;
  overdueTasks: number;
  completionRate: number;
}

// ============================================
// API RESPONSE TYPES
// ============================================

export interface ResponsibilityMatrixResponse {
  matrix: SkuResponsibility[];
  users: SystemUser[];
  skuCount: number;
  noOwnerCount: number;
}

export interface TaskEngineResponse {
  tasks: FounderTask[];
  stats: {
    total: number;
    new: number;
    inProgress: number;
    waiting: number;
    blocked: number;
    needApproval: number;
    done: number;
    overdue: number;
  };
  users: SystemUser[];
}

export interface AuditLogResponse {
  logs: GeneralAuditLog[];
  total: number;
}

export interface IncidentRegistryResponse {
  incidents: Incident[];
  stats: {
    total: number;
    open: number;
    inProgress: number;
    resolved: number;
    escalated: number;
    closed: number;
    critical: number;
    high: number;
  };
  users: SystemUser[];
}

export interface ApprovalQueueResponse {
  approvals: Approval[];
  stats: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
  };
  users: SystemUser[];
}
