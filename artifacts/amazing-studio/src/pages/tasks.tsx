import { useState, useMemo } from "react";
import type React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useListTasks, useCreateTask, useUpdateTask, useListStaff, TaskStatus, CreateTaskRequestPriority } from "@workspace/api-client-react";
import { Button, Input, Select, Textarea, Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui";
import { Plus, Clock, AlertCircle, CheckCircle2, User, Calendar, List, LayoutGrid, BookOpen, ChevronDown, ChevronRight, CheckCircle, XCircle } from "lucide-react";
import { formatDate } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const TOKEN_KEY = "amazingStudioToken_v2";
function authFetch(url: string, opts: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem(TOKEN_KEY);
  return fetch(url, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
    },
  });
}

type Booking = {
  id: number;
  orderCode: string;
  customerName: string;
  customerPhone: string;
  shootDate: string | null;
  shootTime: string | null;
  serviceCategory: string;
  packageType: string;
  serviceLabel: string | null;
  location: string | null;
  status: string;
  totalAmount: number;
  remainingAmount: number;
  isParentContract: boolean;
  parentId: number | null;
  taskCount: number;
};

const CATEGORY_LABELS: Record<string, string> = {
  photo: "Chụp ảnh", editing: "Chỉnh sửa", delivery: "Bàn giao", admin: "Hành chính",
  design: "Thiết kế", meeting: "Họp", other: "Khác",
};

const PRIO_CONFIG = {
  high: { label: "Cao", color: "text-red-700", bg: "bg-red-100 border-red-200" },
  medium: { label: "Trung bình", color: "text-yellow-700", bg: "bg-yellow-100 border-yellow-200" },
  low: { label: "Thấp", color: "text-green-700", bg: "bg-green-100 border-green-200" },
};

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; iconColor: string; bg: string; border: string }> = {
  todo: { label: "Chờ xử lý", icon: Clock, iconColor: "text-slate-500", bg: "bg-slate-50 dark:bg-slate-900/20", border: "border-slate-200" },
  in_progress: { label: "Đang thực hiện", icon: AlertCircle, iconColor: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-900/20", border: "border-blue-200" },
  done: { label: "Hoàn thành", icon: CheckCircle2, iconColor: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-900/20", border: "border-emerald-200" },
};

const columns: { id: TaskStatus; label: string; icon: React.ElementType; iconColor: string; bg: string; border: string }[] =
  (Object.entries(STATUS_CONFIG) as [TaskStatus, typeof STATUS_CONFIG[string]][]).map(([id, cfg]) => ({ id, ...cfg }));

const BOOKING_STATUS_LABEL: Record<string, string> = {
  pending: "Chờ xác nhận", confirmed: "Đã xác nhận", completed: "Hoàn thành", cancelled: "Đã hủy",
};

export default function TasksPage() {
  const qc = useQueryClient();
  const { data: tasks = [], isLoading } = useListTasks({});
  const { data: staff = [] } = useListStaff();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();

  const [viewMode, setViewMode] = useState<"kanban" | "list" | "booking">("kanban");
  const [isOpen, setIsOpen] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);
  const [filterAssignee, setFilterAssignee] = useState("");
  const [filterPrio, setFilterPrio] = useState("");
  const [expandedBookingId, setExpandedBookingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    title: "", description: "", assigneeId: "", priority: "medium" as CreateTaskRequestPriority,
    dueDate: "", category: "other", bookingId: undefined as number | undefined,
  });

  // Fetch upcoming bookings (enabled only when "booking" tab is active)
  const { data: upcomingBookings = [], isLoading: bookingsLoading } = useQuery<Booking[]>({
    queryKey: ["bookings-for-tasks"],
    queryFn: async () => {
      const res = await authFetch(`${BASE}/api/bookings`);
      if (!res.ok) return [];
      const all: Booking[] = await res.json();
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 7);
      return all
        .filter(b => !b.isParentContract && b.shootDate && new Date(b.shootDate) >= cutoff && b.status !== "cancelled")
        .sort((a, b) => {
          const da = a.shootDate ? new Date(a.shootDate).getTime() : 0;
          const db2 = b.shootDate ? new Date(b.shootDate).getTime() : 0;
          return da - db2;
        });
    },
    enabled: viewMode === "booking",
    staleTime: 30_000,
  });

  // Map bookingId → tasks
  const tasksByBookingId = useMemo(() => {
    const map: Record<number, typeof tasks> = {};
    for (const t of tasks) {
      if (t.bookingId != null) {
        if (!map[t.bookingId]) map[t.bookingId] = [];
        map[t.bookingId].push(t);
      }
    }
    return map;
  }, [tasks]);

  const handleStatusChange = (taskId: number, newStatus: TaskStatus) => {
    updateTask.mutate({ id: taskId, data: { status: newStatus } }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/api/tasks"] });
      }
    });
  };

  const handleCreate = () => {
    if (!form.title) return;
    createTask.mutate({
      data: {
        title: form.title,
        description: form.description,
        assigneeId: form.assigneeId ? parseInt(form.assigneeId) : undefined,
        priority: form.priority,
        dueDate: form.dueDate || undefined,
        category: form.category,
        bookingId: form.bookingId,
      }
    }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/api/tasks"] });
        qc.invalidateQueries({ queryKey: ["bookings-for-tasks"] });
        setIsOpen(false);
        setForm({ title: "", description: "", assigneeId: "", priority: "medium", dueDate: "", category: "other", bookingId: undefined });
      }
    });
  };

  const openCreateForBooking = (booking: Booking) => {
    setForm({ title: "", description: "", assigneeId: "", priority: "medium", dueDate: booking.shootDate || "", category: "other", bookingId: booking.id });
    setIsOpen(true);
  };

  const filteredTasks = tasks.filter(t => {
    const matchAssignee = !filterAssignee || String(t.assigneeId) === filterAssignee;
    const matchPrio = !filterPrio || t.priority === filterPrio;
    return matchAssignee && matchPrio;
  });

  const tasksByStatus = {
    todo: filteredTasks.filter(t => t.status === "todo"),
    in_progress: filteredTasks.filter(t => t.status === "in_progress"),
    done: filteredTasks.filter(t => t.status === "done"),
  };

  const counts = { todo: tasksByStatus.todo.length, in_progress: tasksByStatus.in_progress.length, done: tasksByStatus.done.length };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold">Giao việc</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {viewMode === "booking"
              ? `${upcomingBookings.length} buổi chụp sắp tới`
              : `${counts.todo} chờ · ${counts.in_progress} đang làm · ${counts.done} hoàn thành`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border overflow-hidden">
            <button
              onClick={() => setViewMode("kanban")}
              className={`px-3 py-1.5 text-sm flex items-center gap-1.5 ${viewMode === "kanban" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
            >
              <LayoutGrid className="w-3.5 h-3.5" /> Kanban
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`px-3 py-1.5 text-sm flex items-center gap-1.5 ${viewMode === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
            >
              <List className="w-3.5 h-3.5" /> Danh sách
            </button>
            <button
              onClick={() => setViewMode("booking")}
              className={`px-3 py-1.5 text-sm flex items-center gap-1.5 ${viewMode === "booking" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
            >
              <BookOpen className="w-3.5 h-3.5" /> Theo đơn
            </button>
          </div>
          {viewMode !== "booking" && (
            <Button onClick={() => { setForm(f => ({ ...f, bookingId: undefined })); setIsOpen(true); }} className="gap-1.5">
              <Plus className="w-4 h-4" />Thêm việc
            </Button>
          )}
        </div>
      </div>

      {/* Filters — only for kanban/list views */}
      {viewMode !== "booking" && (
        <div className="flex gap-2 mb-4">
          <Select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} className="text-sm">
            <option value="">Tất cả nhân viên</option>
            {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Select value={filterPrio} onChange={e => setFilterPrio(e.target.value)} className="text-sm">
            <option value="">Tất cả độ ưu tiên</option>
            <option value="high">🔴 Cao</option>
            <option value="medium">🟡 Trung bình</option>
            <option value="low">🟢 Thấp</option>
          </Select>
        </div>
      )}

      {/* ─── BOOKING VIEW ─────────────────────────────────────────────────────── */}
      {viewMode === "booking" && (
        <div className="flex-1 overflow-y-auto">
          {bookingsLoading || isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">Đang tải...</div>
          ) : upcomingBookings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <BookOpen className="w-10 h-10 opacity-30" />
              <p>Không có buổi chụp nào sắp tới</p>
            </div>
          ) : (
            <div className="space-y-2">
              {upcomingBookings.map(booking => {
                const bookingTasks = tasksByBookingId[booking.id] ?? [];
                // Use server-provided taskCount as the authoritative source; fall back to local count
                const apiTaskCount = booking.taskCount ?? bookingTasks.length;
                const hasTasks = apiTaskCount > 0;
                const isExpanded = expandedBookingId === booking.id;
                const shootDate = booking.shootDate ? new Date(booking.shootDate) : null;
                const isToday = shootDate && shootDate.toDateString() === today.toDateString();
                const isPast = shootDate && shootDate < today && !isToday;
                const daysUntil = shootDate ? Math.round((shootDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null;

                const doneTasks = bookingTasks.filter((t: { status: string }) => t.status === "done").length;
                const pendingTasks = bookingTasks.filter((t: { status: string }) => t.status === "todo").length;
                const inProgressTasks = bookingTasks.filter((t: { status: string }) => t.status === "in_progress").length;

                return (
                  <div
                    key={booking.id}
                    className={`rounded-xl border-l-4 border border-border bg-background shadow-sm overflow-hidden transition-all ${
                      hasTasks ? "border-l-emerald-500" : "border-l-red-500"
                    }`}
                  >
                    {/* Booking row — clickable to expand */}
                    <button
                      className="w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors text-left"
                      onClick={() => setExpandedBookingId(isExpanded ? null : booking.id)}
                    >
                      {/* Status indicator icon */}
                      {hasTasks
                        ? <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                        : <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />}

                      {/* Main info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{booking.customerName}</span>
                          <span className="text-xs text-muted-foreground font-mono">{booking.orderCode}</span>
                          {booking.status && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${
                              booking.status === "completed" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                              booking.status === "confirmed" ? "bg-blue-50 text-blue-700 border-blue-200" :
                              booking.status === "cancelled" ? "bg-red-50 text-red-700 border-red-200" :
                              "bg-slate-50 text-slate-700 border-slate-200"
                            }`}>
                              {BOOKING_STATUS_LABEL[booking.status] ?? booking.status}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {shootDate ? (
                              <span className={isToday ? "text-orange-600 font-bold" : isPast ? "text-slate-500" : "text-foreground font-medium"}>
                                {formatDate(booking.shootDate!)}
                                {isToday && " — Hôm nay!"}
                                {!isToday && daysUntil !== null && daysUntil > 0 && ` (còn ${daysUntil} ngày)`}
                                {!isToday && daysUntil !== null && daysUntil < 0 && ` (${Math.abs(daysUntil)} ngày trước)`}
                              </span>
                            ) : "—"}
                          </span>
                          <span>{booking.serviceLabel || booking.packageType}</span>
                          {booking.location && <span>{booking.location}</span>}
                        </div>
                      </div>

                      {/* Task count badge */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {hasTasks ? (
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 font-medium">
                              Đã giao {apiTaskCount} việc
                            </span>
                            {doneTasks > 0 && <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 font-medium">{doneTasks} xong</span>}
                            {inProgressTasks > 0 && <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200 font-medium">{inProgressTasks} đang làm</span>}
                            {pendingTasks > 0 && <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 font-medium">{pendingTasks} chờ</span>}
                          </div>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 border border-red-200 font-medium">Chưa giao việc</span>
                        )}
                        {isExpanded
                          ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                      </div>
                    </button>

                    {/* Expanded panel */}
                    {isExpanded && (
                      <div className="border-t border-border bg-muted/20 px-4 py-3">
                        {/* Existing tasks for this booking */}
                        {bookingTasks.length > 0 ? (
                          <div className="space-y-2 mb-3">
                            {bookingTasks.map(task => {
                              const prio = PRIO_CONFIG[task.priority as keyof typeof PRIO_CONFIG] ?? PRIO_CONFIG.medium;
                              const st = STATUS_CONFIG[task.status as TaskStatus] ?? STATUS_CONFIG.todo;
                              const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "done";
                              return (
                                <div key={task.id} className="flex items-center gap-3 bg-background rounded-lg border px-3 py-2">
                                  <st.icon className={`w-3.5 h-3.5 flex-shrink-0 ${st.iconColor}`} />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{task.title}</p>
                                    {task.description && <p className="text-xs text-muted-foreground truncate">{task.description}</p>}
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    {task.assigneeName && (
                                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                                        <User className="w-3 h-3" />{task.assigneeName}
                                      </span>
                                    )}
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${prio.bg} ${prio.color}`}>{prio.label}</span>
                                    {task.dueDate && (
                                      <span className={`text-xs flex items-center gap-1 ${isOverdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                                        <Calendar className="w-3 h-3" />{formatDate(task.dueDate)}
                                      </span>
                                    )}
                                    <Select
                                      value={task.status}
                                      onChange={e => handleStatusChange(task.id, e.target.value as TaskStatus)}
                                      className="text-xs h-7 py-0 w-32"
                                    >
                                      {columns.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                                    </Select>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground mb-3 italic">Chưa có công việc nào được giao cho buổi chụp này.</p>
                        )}
                        {/* Add task button */}
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-xs"
                          onClick={() => openCreateForBooking(booking)}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Thêm việc cho buổi chụp này
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── KANBAN VIEW ──────────────────────────────────────────────────────── */}
      {viewMode === "kanban" && (
        isLoading ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">Đang tải...</div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-4 flex-1">
            {columns.map(col => {
              const ColTasks = tasksByStatus[col.id];
              return (
                <div
                  key={col.id}
                  className={`flex-1 min-w-72 rounded-2xl border ${col.border} ${col.bg} flex flex-col`}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => { if (dragId !== null) handleStatusChange(dragId, col.id); setDragId(null); }}
                >
                  <div className={`px-4 py-3 flex items-center justify-between border-b ${col.border}`}>
                    <div className="flex items-center gap-2">
                      <col.icon className={`w-4 h-4 ${col.iconColor}`} />
                      <span className="font-semibold text-sm">{col.label}</span>
                    </div>
                    <span className="text-xs font-bold bg-background border rounded-full px-2 py-0.5">{ColTasks.length}</span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {ColTasks.map(task => {
                      const prio = PRIO_CONFIG[task.priority as keyof typeof PRIO_CONFIG] ?? PRIO_CONFIG.medium;
                      const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "done";
                      return (
                        <div
                          key={task.id}
                          draggable
                          onDragStart={() => setDragId(task.id)}
                          className="bg-background rounded-xl border shadow-sm p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-all group"
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <p className="font-medium text-sm leading-snug flex-1">{task.title}</p>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium flex-shrink-0 ${prio.bg} ${prio.color}`}>{prio.label}</span>
                          </div>
                          {task.description && <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{task.description}</p>}
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <div className="flex items-center gap-2">
                              {task.assigneeName && <span className="flex items-center gap-1"><User className="w-3 h-3" />{task.assigneeName}</span>}
                              {task.category && task.category !== "other" && <span className="bg-muted px-1.5 py-0.5 rounded text-[10px]">{CATEGORY_LABELS[task.category] ?? task.category}</span>}
                            </div>
                            {task.dueDate && (
                              <span className={`flex items-center gap-1 ${isOverdue ? "text-red-600 font-medium" : ""}`}>
                                <Calendar className="w-3 h-3" />
                                {formatDate(task.dueDate)}
                              </span>
                            )}
                          </div>
                          {/* Status move buttons */}
                          <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            {columns.filter(c => c.id !== col.id).map(c => (
                              <button key={c.id} onClick={() => handleStatusChange(task.id, c.id)} className={`text-[10px] px-2 py-1 rounded border ${c.bg} ${c.iconColor} font-medium hover:opacity-80 transition`}>
                                → {c.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    {ColTasks.length === 0 && <div className="text-center py-8 text-xs text-muted-foreground">Kéo thẻ vào đây</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ─── LIST VIEW ────────────────────────────────────────────────────────── */}
      {viewMode === "list" && (
        isLoading ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">Đang tải...</div>
        ) : (
          <div className="rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-xs font-semibold uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Công việc</th>
                  <th className="px-4 py-3 text-left">Nhân viên</th>
                  <th className="px-4 py-3 text-center">Ưu tiên</th>
                  <th className="px-4 py-3 text-center">Trạng thái</th>
                  <th className="px-4 py-3 text-left">Hạn</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredTasks.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-muted-foreground">Không có công việc</td></tr>}
                {filteredTasks.map(task => {
                  const prio = PRIO_CONFIG[task.priority as keyof typeof PRIO_CONFIG] ?? PRIO_CONFIG.medium;
                  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "done";
                  return (
                    <tr key={task.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <p className="font-medium">{task.title}</p>
                        {task.description && <p className="text-xs text-muted-foreground truncate max-w-xs">{task.description}</p>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{task.assigneeName || "—"}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${prio.bg} ${prio.color}`}>{prio.label}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Select value={task.status} onChange={e => handleStatusChange(task.id, e.target.value as TaskStatus)} className="text-xs h-7 py-0 w-36 mx-auto">
                          {columns.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                        </Select>
                      </td>
                      <td className={`px-4 py-3 text-sm ${isOverdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                        {task.dueDate ? formatDate(task.dueDate) : "—"}
                      </td>
                      <td className="px-4 py-3"></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ─── Create Task Modal ─────────────────────────────────────────────────── */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {form.bookingId ? "Thêm việc cho buổi chụp" : "Tạo công việc mới"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {form.bookingId && (
              <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                <BookOpen className="w-4 h-4 flex-shrink-0" />
                <span>Công việc sẽ được gắn với buổi chụp <strong>#{form.bookingId}</strong></span>
              </div>
            )}
            <div><label className="text-xs font-medium text-muted-foreground">Tiêu đề *</label><Input placeholder="Tên công việc..." value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
            <div><label className="text-xs font-medium text-muted-foreground">Mô tả</label><Textarea rows={2} placeholder="Chi tiết..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Giao cho</label>
                <Select value={form.assigneeId} onChange={e => setForm(f => ({ ...f, assigneeId: e.target.value }))}>
                  <option value="">-- Chọn nhân viên --</option>
                  {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Độ ưu tiên</label>
                <Select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as CreateTaskRequestPriority }))}>
                  <option value="high">🔴 Cao</option>
                  <option value="medium">🟡 Trung bình</option>
                  <option value="low">🟢 Thấp</option>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Danh mục</label>
                <Select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </div>
              <div><label className="text-xs font-medium text-muted-foreground">Hạn hoàn thành</label><Input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} /></div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleCreate} disabled={createTask.isPending} className="flex-1">{createTask.isPending ? "Đang tạo..." : "Tạo công việc"}</Button>
              <Button variant="outline" onClick={() => setIsOpen(false)}>Hủy</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
