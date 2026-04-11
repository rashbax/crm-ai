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

export type AssignmentStatus = "active" | "temporary" | "backup_active" | "inactive";

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
  // GAP 1: when this assignment started
  startDate: string;
  // GAP 2: 4-state status (replaces boolean active)
  assignmentStatus: AssignmentStatus;
  // GAP 3: authority limit description per assignment
  authorityLimit: string;
  // GAP 4: optional notes / history reference
  notes?: string;
  // Legacy — kept for backward compat, derived from assignmentStatus
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
  | "done";

export type TaskImpact = "simple" | "important" | "critical";

export type RecurrencePattern = "none" | "daily" | "weekly" | "monthly";

export type ProofType = "link" | "screenshot" | "text" | "file";

export interface FounderTask {
  id: string;
  title: string;
  description: string;
  marketplace: MarketplaceId | "all";
  skuId?: string;
  taskType: TaskType;
  priority: TaskPriority;
  impactLevel: TaskImpact;
  status: TaskStatus;
  assigneeId: string;
  creatorId: string;
  reviewerId: string;
  dueDate: string;
  blockedReason?: string;
  waitingReason?: string;
  proofType?: ProofType;
  proofValue?: string;
  recurrence: RecurrencePattern;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  // P2: linked to an approved approval (auto-created task)
  linkedApprovalId?: string;
  // Computed signals (not persisted, set at read time)
  overdueDays: number;
  isOverdue: boolean;
  isStale: boolean;
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
  | "ads"
  | "appeal";

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

// GAP 1/2: removed "escalated" (now a flag), added "waiting" and "reopened"
export type IncidentStatus = "open" | "in_progress" | "waiting" | "resolved" | "closed" | "reopened";

export interface Incident {
  id: string;
  incidentType: IncidentType;
  marketplace: MarketplaceId | "all";
  skuId?: string;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  ownerId: string;
  // GAP 3: Roles (§7)
  createdBy: string;
  reviewerId?: string;
  closerId?: string;
  // GAP 4: now required at create time (enforced in API + UI)
  rootCause: string;
  actionPlan: string;
  // GAP 1: escalation is a signal flag, not a status
  isEscalated: boolean;
  escalatedAt?: string;
  // GAP 5: computed signal — 12h no update (not persisted)
  isSilent: boolean;
  // GAP 9: reopen tracking
  reopenCount: number;
  reopenReasons: string[];
  // GAP 8: linked tasks
  linkedTaskIds?: string[];
  estimatedLoss?: number;
  createdAt: string;
  dueDate: string;
  resolvedAt?: string;
  closedAt?: string;
  updatedAt: string;
}

// ============================================
// APPROVAL WORKFLOW (T3 Sprint 2)
// ============================================

export type ApprovalEntityType = "price" | "promo" | "ads_budget" | "stock_scale" | "responsibility_change" | "other";

export type ApprovalType = "price_below_min" | "promo_loss_risk" | "budget_over_limit" | "critical_stock_scale" | "owner_change" | "general";

export type ApprovalStatus = "pending" | "approved" | "rejected";

// GAP 4
export type ApprovalPriority = "critical" | "high" | "medium" | "low";

export interface Approval {
  id: string;
  entityType: ApprovalEntityType;
  entityId: string;
  approvalType: ApprovalType;
  // GAP 4: priority for founder queue sorting
  priority: ApprovalPriority;
  // GAP 1: marketplace + SKU linkage
  marketplace?: string;
  skuId?: string;
  skuList?: string[];
  // GAP 2: old/new value (mandatory in form)
  oldValue?: string;
  newValue?: string;
  // GAP 3: business impact description
  businessImpact?: string;
  reason: string;
  requestedBy: string;
  approverId: string;
  status: ApprovalStatus;
  // GAP 5: expiry
  expiresAt?: string;
  // Computed signals (not persisted)
  isExpired: boolean;
  isStale: boolean;
  requestedAt: string;
  approvedAt?: string;
  rejectedAt?: string;
  decidedAt?: string;
  // GAP 6: mandatory decision comment (enforced in API + UI)
  decisionComment?: string;
  // GAP 8: resubmit chain
  parentApprovalId?: string;
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
    stale: number;
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
    waiting: number;
    resolved: number;
    reopened: number;
    closed: number;
    critical: number;
    high: number;
    // signals
    silent: number;
    noOwner: number;
    escalated: number;
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
    // signals
    expired: number;
    stale: number;
    critical: number;
  };
  users: SystemUser[];
}

// ============================================
// APPEALS / MUROJAATLAR (T3-13)
// ============================================

export type AppealType = "savol" | "sharh" | "shikoyat" | "buyurtma";

export type AppealStatus = "yangi" | "jarayonda" | "kutyapti" | "javob_berilgan" | "yopilgan";

export type AppealPriority = "critical" | "high" | "medium" | "low";

export type AppealSentiment = "positive" | "neutral" | "negative";

export interface AppealReply {
  id: string;
  text: string;
  repliedBy: string;
  repliedAt: string;
  outcome?: "resolved" | "pending" | "reopened";
}

export interface Appeal {
  id: string;
  marketplace: MarketplaceId;
  appealType: AppealType;
  customerName: string;
  message: string;
  orderId?: string;
  skuId?: string;
  status: AppealStatus;
  priority: AppealPriority;
  sentiment: AppealSentiment;
  ownerId: string;
  tags: string[];
  slaDeadline: string;
  slaBreached: boolean;
  replies: AppealReply[];
  escalatedTo?: string;
  escalatedAt?: string;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
}

export interface AppealRegistryResponse {
  appeals: Appeal[];
  stats: {
    total: number;
    yangi: number;
    jarayonda: number;
    kutyapti: number;
    javob_berilgan: number;
    yopilgan: number;
    slaBreached: number;
    negative: number;
  };
  users: SystemUser[];
}
