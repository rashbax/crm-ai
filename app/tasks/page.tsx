"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Layout from "@/components/Layout";
import { storage } from "@/lib/storage";
import { getTranslation } from "@/lib/translations";
import type { Language } from "@/types";
import type {
  FounderTask,
  SystemUser,
  TaskStatus,
  TaskPriority,
  TaskType,
  TaskImpact,
  RecurrencePattern,
  MarketplaceId,
  GeneralAuditLog,
} from "@/types/founder";
import {
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  SearchInput,
  Button,
  Badge,
  StatusPill,
} from "@/components/ui";

const TASK_TYPES: TaskType[] = [
  "stock_check", "price_update", "content_fix", "ads_optimization",
  "supply_order", "incident_fix", "listing_fix", "review_response", "general",
];

const PRIORITIES: TaskPriority[] = ["critical", "high", "medium", "low"];
const IMPACTS: TaskImpact[] = ["simple", "important", "critical"];
const RECURRENCES: RecurrencePattern[] = ["none", "daily", "weekly", "monthly"];

// "overdue" is now a signal — sort active tasks by their real status
const STATUS_ORDER: TaskStatus[] = [
  "blocked", "need_approval", "new", "in_progress", "waiting", "done",
];

type QuickFilter = "all" | "overdue" | "stale" | "need_approval_only" | "blocked_only";

export default function TaskEnginePage() {
  const { data: session } = useSession();
  const [lang, setLang] = useState<Language>("ru");
  const [tasks, setTasks] = useState<FounderTask[]>([]);
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [stats, setStats] = useState<any>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "all">("all");
  const [impactFilter, setImpactFilter] = useState<TaskImpact | "all">("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");

  // Task creation / edit modal
  const [showModal, setShowModal] = useState(false);
  const [editTask, setEditTask] = useState<FounderTask | null>(null);

  // Status change modal
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusTask, setStatusTask] = useState<FounderTask | null>(null);
  const [newStatus, setNewStatus] = useState<TaskStatus>("in_progress");
  const [statusReason, setStatusReason] = useState("");
  const [statusProof, setStatusProof] = useState("");

  // History modal (GAP 4)
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyTask, setHistoryTask] = useState<FounderTask | null>(null);
  const [historyLogs, setHistoryLogs] = useState<GeneralAuditLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formMp, setFormMp] = useState<MarketplaceId | "all">("all");
  const [formSku, setFormSku] = useState("");
  const [formType, setFormType] = useState<TaskType>("general");
  const [formPriority, setFormPriority] = useState<TaskPriority>("medium");
  const [formImpact, setFormImpact] = useState<TaskImpact>("simple");
  const [formRecurrence, setFormRecurrence] = useState<RecurrencePattern>("none");
  const [formAssignee, setFormAssignee] = useState("");
  const [formReviewer, setFormReviewer] = useState("");
  const [formDue, setFormDue] = useState("");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    setLang(storage.getLang());
    const params = new URLSearchParams(window.location.search);
    const f = params.get("filter");
    if (f === "overdue") setQuickFilter("overdue");
    else if (f === "stale") setQuickFilter("stale");
    else if (f === "need_approval") setQuickFilter("need_approval_only");
    else if (f === "blocked") setQuickFilter("blocked_only");
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const res = await fetch("/api/founder/tasks", { cache: "no-store" });
      const data = await res.json();
      setTasks(data.tasks || []);
      setUsers(data.users || []);
      setStats(data.stats || {});
    } catch (err) {
      console.error("Failed to load tasks:", err);
    }
  };

  const getUserName = (id: string) => {
    if (!id) return "—";
    return users.find((u) => u.id === id)?.name || id;
  };

  const getTypeName = (type: TaskType) => {
    const names: Record<TaskType, { ru: string; uz: string }> = {
      stock_check: { ru: "Проверка остатков", uz: "Qoldiq tekshirish" },
      price_update: { ru: "Обновление цен", uz: "Narx yangilash" },
      content_fix: { ru: "Контент", uz: "Kontent" },
      ads_optimization: { ru: "Реклама", uz: "Reklama" },
      supply_order: { ru: "Закупка", uz: "Xarid" },
      incident_fix: { ru: "Инцидент", uz: "Hodisa" },
      listing_fix: { ru: "Листинг", uz: "Listing" },
      review_response: { ru: "Отзыв", uz: "Sharh" },
      general: { ru: "Общее", uz: "Umumiy" },
    };
    return names[type]?.[lang] || type;
  };

  const getStatusName = (status: TaskStatus) => {
    const names: Record<TaskStatus, { ru: string; uz: string }> = {
      new: { ru: "Новая", uz: "Yangi" },
      in_progress: { ru: "В работе", uz: "Jarayonda" },
      waiting: { ru: "Ожидание", uz: "Kutilmoqda" },
      blocked: { ru: "Заблокирована", uz: "Bloklangan" },
      need_approval: { ru: "Нужен Founder", uz: "Founder kerak" },
      done: { ru: "Выполнена", uz: "Bajarildi" },
    };
    return names[status]?.[lang] || status;
  };

  const getStatusColor = (status: TaskStatus): string => {
    const colors: Record<TaskStatus, string> = {
      new: "primary",
      in_progress: "warning",
      waiting: "default",
      blocked: "danger",
      need_approval: "warning",
      done: "success",
    };
    return colors[status] || "default";
  };

  const getPriorityLabel = (p: TaskPriority) => {
    const names: Record<TaskPriority, { ru: string; uz: string }> = {
      critical: { ru: "Критический", uz: "Kritik" },
      high: { ru: "Высокий", uz: "Yuqori" },
      medium: { ru: "Средний", uz: "O'rta" },
      low: { ru: "Низкий", uz: "Past" },
    };
    return names[p]?.[lang] || p;
  };

  const getPriorityColor = (p: TaskPriority) => {
    const colors: Record<TaskPriority, string> = {
      critical: "text-danger font-bold",
      high: "text-warning font-semibold",
      medium: "text-text-main",
      low: "text-text-muted",
    };
    return colors[p] || "";
  };

  const getImpactLabel = (i: TaskImpact) => {
    const names: Record<TaskImpact, { ru: string; uz: string }> = {
      simple: { ru: "Обычное", uz: "Oddiy" },
      important: { ru: "Важное", uz: "Muhim" },
      critical: { ru: "Критичное", uz: "Kritik" },
    };
    return names[i]?.[lang] || i;
  };

  const getRecurrenceLabel = (r: RecurrencePattern) => {
    const names: Record<RecurrencePattern, { ru: string; uz: string }> = {
      none: { ru: "Без повтора", uz: "Takrorsiz" },
      daily: { ru: "Ежедневно", uz: "Har kun" },
      weekly: { ru: "Еженедельно", uz: "Har hafta" },
      monthly: { ru: "Ежемесячно", uz: "Har oy" },
    };
    return names[r]?.[lang] || r;
  };

  const filtered = tasks
    .filter((t) => {
      // Quick filters take precedence
      if (quickFilter === "overdue") return t.isOverdue;
      if (quickFilter === "stale") return t.isStale;
      if (quickFilter === "need_approval_only") return t.status === "need_approval";
      if (quickFilter === "blocked_only") return t.status === "blocked";

      const matchSearch =
        !search ||
        t.title.toLowerCase().includes(search.toLowerCase()) ||
        t.id.toLowerCase().includes(search.toLowerCase()) ||
        (t.skuId || "").toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || t.status === statusFilter;
      const matchPriority = priorityFilter === "all" || t.priority === priorityFilter;
      const matchImpact = impactFilter === "all" || t.impactLevel === impactFilter;
      const matchAssignee = assigneeFilter === "all" || t.assigneeId === assigneeFilter;
      return matchSearch && matchStatus && matchPriority && matchImpact && matchAssignee;
    })
    .sort((a, b) => {
      // Overdue tasks first (signal sort)
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;
      const ai = STATUS_ORDER.indexOf(a.status);
      const bi = STATUS_ORDER.indexOf(b.status);
      if (ai !== bi) return ai - bi;
      const pi = PRIORITIES.indexOf(a.priority);
      const qi = PRIORITIES.indexOf(b.priority);
      return pi - qi;
    });

  const openCreateModal = () => {
    setEditTask(null);
    setFormTitle(""); setFormDesc(""); setFormMp("all"); setFormSku("");
    setFormType("general"); setFormPriority("medium"); setFormImpact("simple");
    setFormRecurrence("none"); setFormAssignee(""); setFormReviewer("");
    setFormDue(""); setFormError("");
    setShowModal(true);
  };

  const handleSaveTask = async () => {
    setFormError("");
    if (!formTitle.trim()) {
      setFormError(lang === "ru" ? "Заголовок обязателен" : "Sarlavha majburiy");
      return;
    }
    if (!formAssignee) {
      setFormError(lang === "ru" ? "Назначьте исполнителя" : "Ijrochi tayinlang");
      return;
    }
    if (!formDue) {
      setFormError(lang === "ru" ? "Укажите дедлайн" : "Muddatni belgilang");
      return;
    }

    const payload: any = {
      title: formTitle.trim(),
      description: formDesc.trim(),
      marketplace: formMp,
      skuId: formSku || undefined,
      taskType: formType,
      priority: formPriority,
      impactLevel: formImpact,
      recurrence: formRecurrence,
      assigneeId: formAssignee,
      reviewerId: formReviewer,
      dueDate: formDue,
      creatorId: session?.user?.id ?? "user-001",
      changedBy: session?.user?.id ?? "user-001",
    };
    if (editTask) payload.id = editTask.id;

    const res = await fetch("/api/founder/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) { setFormError(data.error || "Error"); return; }
    setShowModal(false);
    loadData();
  };

  const openStatusModal = (task: FounderTask, status: TaskStatus) => {
    setStatusTask(task);
    setNewStatus(status);
    setStatusReason("");
    setStatusProof("");
    setShowStatusModal(true);
  };

  const handleChangeStatus = async () => {
    if (!statusTask) return;
    const payload: any = {
      action: "update_status",
      id: statusTask.id,
      status: newStatus,
      changedBy: session?.user?.id ?? "user-001",
    };
    if (newStatus === "waiting" || newStatus === "blocked") payload.reason = statusReason;
    if (newStatus === "done") { payload.proofType = "text"; payload.proofValue = statusProof; }

    const res = await fetch("/api/founder/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "Error"); return; }
    setShowStatusModal(false);
    loadData();
  };

  // GAP 4: Load and show task history
  const openHistoryModal = async (task: FounderTask) => {
    setHistoryTask(task);
    setHistoryLogs([]);
    setHistoryLoading(true);
    setShowHistoryModal(true);
    try {
      const res = await fetch(
        `/api/founder/audit?entityType=task&entityId=${task.id}&limit=30`,
        { cache: "no-store" }
      );
      const data = await res.json();
      setHistoryLogs(data.logs || []);
    } catch { /* ignore */ }
    setHistoryLoading(false);
  };

  const handleDeleteTask = async (id: string) => {
    await fetch("/api/founder/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id, changedBy: session?.user?.id ?? "user-001" }),
    });
    loadData();
  };

  const label = {
    title: lang === "ru" ? "Задачи" : "Vazifalar",
    subtitle:
      lang === "ru"
        ? "Операционная дисциплина: ответственный, дедлайн, доказательство"
        : "Operatsion intizom: egasi, muddat, dalil",
    newBtn: lang === "ru" ? "Новая задача" : "Yangi vazifa",
    save: lang === "ru" ? "Сохранить" : "Saqlash",
    cancel: lang === "ru" ? "Отмена" : "Bekor qilish",
    apply: lang === "ru" ? "Применить" : "Qo'llash",
  };

  // Available transitions — overdue is a signal, not a status, so transitions are based on real status
  const getTransitions = (s: TaskStatus): TaskStatus[] => {
    const map: Record<TaskStatus, TaskStatus[]> = {
      new: ["in_progress", "blocked", "waiting"],
      in_progress: ["waiting", "blocked", "need_approval", "done"],
      waiting: ["in_progress", "blocked"],
      blocked: ["in_progress", "waiting"],
      need_approval: ["in_progress", "done"],
      done: [],
    };
    return map[s] || [];
  };

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1 className="page-title">{label.title}</h1>
          <p className="page-subtitle">{label.subtitle}</p>
        </div>
        <Button variant="primary" onClick={openCreateModal}>
          {label.newBtn}
        </Button>
      </div>

      {/* Stats row — 6 real statuses */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-3">
        {(["new", "in_progress", "waiting", "blocked", "need_approval", "done"] as TaskStatus[]).map((s) => (
          <Card
            key={s}
            className={`cursor-pointer ${statusFilter === s && quickFilter === "all" ? "ring-2 ring-primary" : ""}`}
            onClick={() => { setStatusFilter(statusFilter === s ? "all" : s); setQuickFilter("all"); }}
          >
            <div className="p-3 text-center">
              <p className="text-xs text-text-muted">{getStatusName(s)}</p>
              <p className={`text-xl font-bold ${
                s === "blocked" ? "text-danger" :
                s === "done" ? "text-success" :
                s === "need_approval" ? "text-warning" : "text-text-main"
              }`}>
                {stats[s === "in_progress" ? "inProgress" : s === "need_approval" ? "needApproval" : s] || 0}
              </p>
            </div>
          </Card>
        ))}
      </div>

      {/* GAP 7: Quick-filter signal chips */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => { setQuickFilter(quickFilter === "overdue" ? "all" : "overdue"); setStatusFilter("all"); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
            quickFilter === "overdue"
              ? "bg-danger text-white border-danger"
              : "bg-danger/10 text-danger border-danger/30 hover:bg-danger/20"
          }`}
        >
          🔴 {lang === "ru" ? "Просрочено" : "Muddati o'tgan"}{" "}
          <span className="font-bold">({stats.overdue || 0})</span>
        </button>
        <button
          onClick={() => { setQuickFilter(quickFilter === "stale" ? "all" : "stale"); setStatusFilter("all"); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
            quickFilter === "stale"
              ? "bg-warning text-white border-warning"
              : "bg-warning/10 text-warning border-warning/30 hover:bg-warning/20"
          }`}
        >
          🟡 {lang === "ru" ? "Застряли (3+ дней)" : "Harakatsiz (3+ kun)"}{" "}
          <span className="font-bold">({stats.stale || 0})</span>
        </button>
        <button
          onClick={() => { setQuickFilter(quickFilter === "need_approval_only" ? "all" : "need_approval_only"); setStatusFilter("all"); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
            quickFilter === "need_approval_only"
              ? "bg-warning text-white border-warning"
              : "bg-warning/10 text-warning border-warning/30 hover:bg-warning/20"
          }`}
        >
          ⏳ {lang === "ru" ? "Ждут Founder" : "Founder kutmoqda"}{" "}
          <span className="font-bold">({stats.needApproval || 0})</span>
        </button>
        <button
          onClick={() => { setQuickFilter(quickFilter === "blocked_only" ? "all" : "blocked_only"); setStatusFilter("all"); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
            quickFilter === "blocked_only"
              ? "bg-danger text-white border-danger"
              : "bg-danger/10 text-danger border-danger/30 hover:bg-danger/20"
          }`}
        >
          🚫 {lang === "ru" ? "Заблокированы" : "Bloklangan"}{" "}
          <span className="font-bold">({stats.blocked || 0})</span>
        </button>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <div className="p-4 flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[180px]">
            <SearchInput
              placeholder={lang === "ru" ? "Поиск по задачам..." : "Vazifalar bo'yicha qidirish..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as TaskPriority | "all")}
            className="px-3 py-2 border border-border rounded-lg text-sm"
          >
            <option value="all">{lang === "ru" ? "Все приоритеты" : "Barcha ustuvorliklar"}</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>{getPriorityLabel(p)}</option>
            ))}
          </select>
          {/* GAP 7: Impact filter */}
          <select
            value={impactFilter}
            onChange={(e) => setImpactFilter(e.target.value as TaskImpact | "all")}
            className="px-3 py-2 border border-border rounded-lg text-sm"
          >
            <option value="all">{lang === "ru" ? "Все влияния" : "Barcha ta'sir"}</option>
            {IMPACTS.map((i) => (
              <option key={i} value={i}>{getImpactLabel(i)}</option>
            ))}
          </select>
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="px-3 py-2 border border-border rounded-lg text-sm"
          >
            <option value="all">{lang === "ru" ? "Все исполнители" : "Barcha ijrochilar"}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
      </Card>

      {/* Tasks Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{lang === "ru" ? "Приоритет / Влияние" : "Ustuvorlik / Ta'sir"}</TableHead>
              <TableHead>{lang === "ru" ? "Задача" : "Vazifa"}</TableHead>
              <TableHead>{lang === "ru" ? "Тип" : "Turi"}</TableHead>
              <TableHead>{lang === "ru" ? "Исполнитель" : "Ijrochi"}</TableHead>
              <TableHead>{lang === "ru" ? "Статус / Сигналы" : "Status / Signallar"}</TableHead>
              <TableHead>{lang === "ru" ? "Дедлайн" : "Muddat"}</TableHead>
              <TableHead>{lang === "ru" ? "Действия" : "Amallar"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length > 0 ? (
              filtered.map((task) => (
                <TableRow
                  key={task.id}
                  className={
                    task.isOverdue
                      ? "bg-danger/5"
                      : task.isStale
                      ? "bg-warning/5"
                      : task.status === "blocked"
                      ? "bg-warning/5"
                      : ""
                  }
                >
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className={`text-sm ${getPriorityColor(task.priority)}`}>
                        {getPriorityLabel(task.priority)}
                      </span>
                      {/* GAP 2: Impact level badge */}
                      <span className={`text-xs ${
                        task.impactLevel === "critical" ? "text-danger" :
                        task.impactLevel === "important" ? "text-warning" :
                        "text-text-muted"
                      }`}>
                        {getImpactLabel(task.impactLevel || "simple")}
                      </span>
                      {/* GAP 3: Recurrence badge */}
                      {task.recurrence && task.recurrence !== "none" && (
                        <span className="text-xs text-primary">
                          ↻ {getRecurrenceLabel(task.recurrence)}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm">{task.title}</p>
                      {task.skuId && (
                        <p className="text-xs text-text-muted">SKU: {task.skuId}</p>
                      )}
                      {task.marketplace !== "all" && (
                        <p className="text-xs text-text-muted">{task.marketplace}</p>
                      )}
                      {task.blockedReason && (
                        <p className="text-xs text-danger mt-1">
                          {lang === "ru" ? "Причина:" : "Sabab:"} {task.blockedReason}
                        </p>
                      )}
                      {task.waitingReason && (
                        <p className="text-xs text-warning mt-1">
                          {lang === "ru" ? "Ожидание:" : "Kutish:"} {task.waitingReason}
                        </p>
                      )}
                      {task.proofValue && (
                        <p className="text-xs text-success mt-1">
                          {lang === "ru" ? "Результат:" : "Natija:"} {task.proofValue}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{getTypeName(task.taskType)}</TableCell>
                  <TableCell className="text-sm">{getUserName(task.assigneeId)}</TableCell>
                  <TableCell>
                    <StatusPill status={task.status}>
                      {getStatusName(task.status)}
                    </StatusPill>
                    {/* GAP 1: Overdue as signal badge */}
                    {task.isOverdue && (
                      <p className="text-xs text-danger font-semibold mt-1">
                        🔴 +{task.overdueDays}d
                      </p>
                    )}
                    {/* GAP 5: Stale signal badge */}
                    {task.isStale && !task.isOverdue && (
                      <p className="text-xs text-warning font-semibold mt-1">
                        🟡 {lang === "ru" ? "Нет активности" : "Faolsiz"}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {new Date(task.dueDate).toLocaleDateString(
                      lang === "ru" ? "ru-RU" : "uz-UZ"
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      {getTransitions(task.status).map((ts) => (
                        <button
                          key={ts}
                          onClick={() => openStatusModal(task, ts)}
                          className="text-xs text-primary hover:text-primary-dark font-medium text-left"
                        >
                          → {getStatusName(ts)}
                        </button>
                      ))}
                      {/* GAP 4: History button */}
                      <button
                        onClick={() => openHistoryModal(task)}
                        className="text-xs text-text-muted hover:text-text-main font-medium text-left mt-1"
                      >
                        {lang === "ru" ? "📋 История" : "📋 Tarix"}
                      </button>
                      {task.status !== "done" && (
                        <button
                          onClick={() => handleDeleteTask(task.id)}
                          className="text-xs text-danger hover:text-danger/80 font-medium text-left"
                        >
                          {lang === "ru" ? "Удалить" : "O'chirish"}
                        </button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-text-muted">
                  {lang === "ru" ? "Задач нет" : "Vazifalar yo'q"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Create / Edit Task Modal */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowModal(false)}
        >
          <Card
            className="w-full max-w-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <h2 className="text-xl font-bold text-text-main mb-4">{label.newBtn}</h2>

              {formError && (
                <div className="bg-danger/10 text-danger text-sm p-3 rounded-lg mb-4">
                  {formError}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="text-xs text-text-muted mb-1 block">
                    {lang === "ru" ? "Заголовок *" : "Sarlavha *"}
                  </label>
                  <input
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                    placeholder={lang === "ru" ? "Что нужно сделать?" : "Nima qilish kerak?"}
                  />
                </div>
                <div>
                  <label className="text-xs text-text-muted mb-1 block">
                    {lang === "ru" ? "Описание" : "Tavsif"}
                  </label>
                  <textarea
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm min-h-[60px]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">
                      {lang === "ru" ? "Тип задачи" : "Vazifa turi"}
                    </label>
                    <select
                      value={formType}
                      onChange={(e) => setFormType(e.target.value as TaskType)}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                    >
                      {TASK_TYPES.map((t) => (
                        <option key={t} value={t}>{getTypeName(t)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">
                      {lang === "ru" ? "Приоритет" : "Ustuvorlik"}
                    </label>
                    <select
                      value={formPriority}
                      onChange={(e) => setFormPriority(e.target.value as TaskPriority)}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                    >
                      {PRIORITIES.map((p) => (
                        <option key={p} value={p}>{getPriorityLabel(p)}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {/* GAP 2: Impact level + GAP 3: Recurrence */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">
                      {lang === "ru" ? "Влияние на бизнес *" : "Biznesga ta'sir *"}
                    </label>
                    <select
                      value={formImpact}
                      onChange={(e) => setFormImpact(e.target.value as TaskImpact)}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                    >
                      {IMPACTS.map((i) => (
                        <option key={i} value={i}>{getImpactLabel(i)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">
                      {lang === "ru" ? "Повторение" : "Takrorlanish"}
                    </label>
                    <select
                      value={formRecurrence}
                      onChange={(e) => setFormRecurrence(e.target.value as RecurrencePattern)}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                    >
                      {RECURRENCES.map((r) => (
                        <option key={r} value={r}>{getRecurrenceLabel(r)}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">
                      {lang === "ru" ? "Исполнитель *" : "Ijrochi *"}
                    </label>
                    <select
                      value={formAssignee}
                      onChange={(e) => setFormAssignee(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                    >
                      <option value="">-- {lang === "ru" ? "выберите" : "tanlang"} --</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">
                      {lang === "ru" ? "Дедлайн *" : "Muddat *"}
                    </label>
                    <input
                      type="date"
                      value={formDue}
                      onChange={(e) => setFormDue(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">
                      {lang === "ru" ? "Площадка" : "Platforma"}
                    </label>
                    <select
                      value={formMp}
                      onChange={(e) => setFormMp(e.target.value as MarketplaceId | "all")}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                    >
                      <option value="all">{lang === "ru" ? "Все" : "Barchasi"}</option>
                      <option value="WB">Wildberries</option>
                      <option value="Ozon">Ozon</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">SKU</label>
                    <input
                      value={formSku}
                      onChange={(e) => setFormSku(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                      placeholder={lang === "ru" ? "Необязательно" : "Ixtiyoriy"}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-text-muted mb-1 block">
                    {lang === "ru" ? "Ревьюер" : "Tekshiruvchi"}
                  </label>
                  <select
                    value={formReviewer}
                    onChange={(e) => setFormReviewer(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                  >
                    <option value="">-- {lang === "ru" ? "необязательно" : "ixtiyoriy"} --</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex gap-2 justify-end mt-6">
                <Button variant="ghost" onClick={() => setShowModal(false)}>{label.cancel}</Button>
                <Button variant="primary" onClick={handleSaveTask}>{label.save}</Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Status Change Modal */}
      {showStatusModal && statusTask && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowStatusModal(false)}
        >
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <h2 className="text-lg font-bold text-text-main mb-2">
                {getStatusName(statusTask.status)} → {getStatusName(newStatus)}
              </h2>
              <p className="text-sm text-text-muted mb-4">{statusTask.title}</p>

              {(newStatus === "waiting" || newStatus === "blocked") && (
                <div className="mb-4">
                  <label className="text-xs text-text-muted mb-1 block">
                    {lang === "ru" ? "Причина (обязательно)" : "Sabab (majburiy)"}
                  </label>
                  <textarea
                    value={statusReason}
                    onChange={(e) => setStatusReason(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm min-h-[80px]"
                    placeholder={
                      newStatus === "waiting"
                        ? lang === "ru" ? "Что ожидаем?" : "Nimani kutyapmiz?"
                        : lang === "ru" ? "Что блокирует?" : "Nima to'sqinlik qilyapti?"
                    }
                  />
                </div>
              )}

              {newStatus === "done" && (
                <div className="mb-4">
                  <label className="text-xs text-text-muted mb-1 block">
                    {lang === "ru" ? "Результат / Proof (обязательно)" : "Natija / Proof (majburiy)"}
                  </label>
                  <textarea
                    value={statusProof}
                    onChange={(e) => setStatusProof(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm min-h-[80px]"
                    placeholder={lang === "ru" ? "Ссылка, скриншот или описание результата" : "Havola, skrinshot yoki natija tavsifi"}
                  />
                </div>
              )}

              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => setShowStatusModal(false)}>{label.cancel}</Button>
                <Button variant="primary" onClick={handleChangeStatus}>{label.apply}</Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* GAP 4: Task History Modal */}
      {showHistoryModal && historyTask && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowHistoryModal(false)}
        >
          <Card
            className="w-full max-w-lg max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <h2 className="text-lg font-bold text-text-main mb-1">
                {lang === "ru" ? "История изменений" : "O'zgarishlar tarixi"}
              </h2>
              <p className="text-sm text-text-muted mb-4">{historyTask.title}</p>

              {historyLoading ? (
                <p className="text-sm text-text-muted py-4 text-center">
                  {lang === "ru" ? "Загрузка..." : "Yuklanmoqda..."}
                </p>
              ) : historyLogs.length === 0 ? (
                <p className="text-sm text-text-muted py-4 text-center">
                  {lang === "ru" ? "История пуста" : "Tarix bo'sh"}
                </p>
              ) : (
                <div className="space-y-3">
                  {historyLogs.map((log) => (
                    <div key={log.id} className="flex gap-3 items-start border-l-2 border-border pl-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-text-main capitalize">
                            {log.fieldName}
                          </span>
                          {log.oldValue && (
                            <>
                              <span className="text-xs text-text-muted line-through">{log.oldValue}</span>
                              <span className="text-xs text-text-muted">→</span>
                            </>
                          )}
                          <span className="text-xs font-medium text-primary">{log.newValue}</span>
                        </div>
                        <p className="text-xs text-text-muted mt-0.5">
                          {getUserName(log.changedBy)} · {new Date(log.changedAt).toLocaleString(
                            lang === "ru" ? "ru-RU" : "uz-UZ"
                          )}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end mt-4">
                <Button variant="ghost" onClick={() => setShowHistoryModal(false)}>
                  {label.cancel}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </Layout>
  );
}
