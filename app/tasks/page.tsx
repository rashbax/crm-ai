"use client";

import { useState, useEffect } from "react";
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
  MarketplaceId,
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

const STATUS_ORDER: TaskStatus[] = [
  "overdue", "blocked", "need_approval", "new", "in_progress", "waiting", "done",
];

export default function TaskEnginePage() {
  const [lang, setLang] = useState<Language>("ru");
  const [tasks, setTasks] = useState<FounderTask[]>([]);
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [stats, setStats] = useState<any>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "all">("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editTask, setEditTask] = useState<FounderTask | null>(null);

  // Status change modal
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusTask, setStatusTask] = useState<FounderTask | null>(null);
  const [newStatus, setNewStatus] = useState<TaskStatus>("in_progress");
  const [statusReason, setStatusReason] = useState("");
  const [statusProof, setStatusProof] = useState("");

  // Form
  const [formTitle, setFormTitle] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formMp, setFormMp] = useState<MarketplaceId | "all">("all");
  const [formSku, setFormSku] = useState("");
  const [formType, setFormType] = useState<TaskType>("general");
  const [formPriority, setFormPriority] = useState<TaskPriority>("medium");
  const [formAssignee, setFormAssignee] = useState("");
  const [formReviewer, setFormReviewer] = useState("");
  const [formDue, setFormDue] = useState("");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    setLang(storage.getLang());
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
      overdue: { ru: "Просрочена", uz: "Muddati o'tgan" },
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
      overdue: "danger",
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

  const filtered = tasks
    .filter((t) => {
      const matchSearch =
        !search ||
        t.title.toLowerCase().includes(search.toLowerCase()) ||
        t.id.toLowerCase().includes(search.toLowerCase()) ||
        (t.skuId || "").toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || t.status === statusFilter;
      const matchPriority = priorityFilter === "all" || t.priority === priorityFilter;
      const matchAssignee = assigneeFilter === "all" || t.assigneeId === assigneeFilter;
      return matchSearch && matchStatus && matchPriority && matchAssignee;
    })
    .sort((a, b) => {
      const ai = STATUS_ORDER.indexOf(a.status);
      const bi = STATUS_ORDER.indexOf(b.status);
      if (ai !== bi) return ai - bi;
      const pi = PRIORITIES.indexOf(a.priority);
      const qi = PRIORITIES.indexOf(b.priority);
      return pi - qi;
    });

  const openCreateModal = () => {
    setEditTask(null);
    setFormTitle("");
    setFormDesc("");
    setFormMp("all");
    setFormSku("");
    setFormType("general");
    setFormPriority("medium");
    setFormAssignee("");
    setFormReviewer("");
    setFormDue("");
    setFormError("");
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
      assigneeId: formAssignee,
      reviewerId: formReviewer,
      dueDate: formDue,
      creatorId: "user-001",
      changedBy: "user-001",
    };
    if (editTask) payload.id = editTask.id;

    const res = await fetch("/api/founder/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setFormError(data.error || "Error");
      return;
    }
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
      changedBy: "user-001",
    };
    if (newStatus === "waiting" || newStatus === "blocked") {
      payload.reason = statusReason;
    }
    if (newStatus === "done") {
      payload.proofType = "text";
      payload.proofValue = statusProof;
    }

    const res = await fetch("/api/founder/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Error");
      return;
    }
    setShowStatusModal(false);
    loadData();
  };

  const handleDeleteTask = async (id: string) => {
    await fetch("/api/founder/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id, changedBy: "user-001" }),
    });
    loadData();
  };

  const label = {
    title: lang === "ru" ? "Задачи 2.0" : "Vazifalar 2.0",
    subtitle: lang === "ru" ? "Операционный интизом: владелец, дедлайн, доказательство" : "Operatsion intizom: owner, deadline, proof",
    newBtn: lang === "ru" ? "Новая задача" : "Yangi vazifa",
    save: lang === "ru" ? "Сохранить" : "Saqlash",
    cancel: lang === "ru" ? "Отмена" : "Bekor qilish",
    apply: lang === "ru" ? "Применить" : "Qo'llash",
  };

  // Available transitions for a given status
  const getTransitions = (s: TaskStatus): TaskStatus[] => {
    const map: Record<TaskStatus, TaskStatus[]> = {
      new: ["in_progress", "blocked", "waiting"],
      in_progress: ["waiting", "blocked", "need_approval", "done"],
      waiting: ["in_progress", "blocked"],
      blocked: ["in_progress", "waiting"],
      need_approval: ["in_progress", "done"],
      done: [],
      overdue: ["in_progress", "blocked", "waiting"],
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

      {/* Stats row */}
      <div className="grid grid-cols-3 md:grid-cols-7 gap-3 mb-6">
        {(["new", "in_progress", "waiting", "blocked", "need_approval", "done", "overdue"] as TaskStatus[]).map(
          (s) => (
            <Card
              key={s}
              className={`cursor-pointer ${statusFilter === s ? "ring-2 ring-primary" : ""}`}
              onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
            >
              <div className="p-3 text-center">
                <p className="text-xs text-text-muted">{getStatusName(s)}</p>
                <p className={`text-xl font-bold ${s === "overdue" || s === "blocked" ? "text-danger" : s === "done" ? "text-success" : "text-text-main"}`}>
                  {stats[s === "in_progress" ? "inProgress" : s === "need_approval" ? "needApproval" : s] || 0}
                </p>
              </div>
            </Card>
          )
        )}
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <div className="p-4 flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[200px]">
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
              <TableHead>{lang === "ru" ? "Приоритет" : "Ustuvorlik"}</TableHead>
              <TableHead>{lang === "ru" ? "Задача" : "Vazifa"}</TableHead>
              <TableHead>{lang === "ru" ? "Тип" : "Turi"}</TableHead>
              <TableHead>{lang === "ru" ? "Исполнитель" : "Ijrochi"}</TableHead>
              <TableHead>{lang === "ru" ? "Статус" : "Status"}</TableHead>
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
                    task.status === "overdue"
                      ? "bg-danger/5"
                      : task.status === "blocked"
                      ? "bg-warning/5"
                      : ""
                  }
                >
                  <TableCell>
                    <span className={`text-sm ${getPriorityColor(task.priority)}`}>
                      {getPriorityLabel(task.priority)}
                    </span>
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
                    {task.overdueDays > 0 && task.status !== "done" && (
                      <p className="text-xs text-danger mt-1">+{task.overdueDays}d</p>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {new Date(task.dueDate).toLocaleDateString(lang === "ru" ? "ru-RU" : "uz-UZ")}
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
                      {task.status !== "done" && (
                        <button
                          onClick={() => handleDeleteTask(task.id)}
                          className="text-xs text-danger hover:text-danger/80 font-medium text-left mt-1"
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

      {/* Create Task Modal */}
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
              <h2 className="text-xl font-bold text-text-main mb-4">
                {label.newBtn}
              </h2>

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
                <Button variant="ghost" onClick={() => setShowModal(false)}>
                  {label.cancel}
                </Button>
                <Button variant="primary" onClick={handleSaveTask}>
                  {label.save}
                </Button>
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
          <Card
            className="w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
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
                <Button variant="ghost" onClick={() => setShowStatusModal(false)}>
                  {label.cancel}
                </Button>
                <Button variant="primary" onClick={handleChangeStatus}>
                  {label.apply}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </Layout>
  );
}
