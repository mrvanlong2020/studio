import { useState, useMemo } from "react";
import type React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useListTasks, useUpdateTask, useListStaff, TaskStatus } from "@workspace/api-client-react";
import { Select } from "@/components/ui";
import {
  Plus, Clock, AlertCircle, CheckCircle2, User, Calendar,
  List, LayoutGrid, Search, X, Loader2, Camera, Briefcase
} from "lucide-react";
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

// ── Types ─────────────────────────────────────────────────────────────────────
type TaskAssignment = {
  task_id: number;
  title: string;
  assignee_id: number | null;
  assignee_name: string | null;
  role: string | null;
  task_type: string | null;
  task_status: string;
  cost: number;
  notes: string | null;
};

type BookingWithTasks = {
  booking_id: number;
  order_code: string;
  shoot_date: string | null;
  booking_created_at: string;
  package_type: string;
  service_label: string | null;
  booking_status: string;
  location: string | null;
  customer_name: string;
  customer_phone: string;
  tasks: TaskAssignment[];
};

type StaffItem = { id: number | string; name: string };

// ── Role options ──────────────────────────────────────────────────────────────
const ROLE_OPTIONS = [
  { role: "photographer", taskType: "chup",      label: "Chụp hình",  emoji: "📷",
    chipCls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  { role: "makeup",       taskType: "makeup",    label: "Makeup",     emoji: "💄",
    chipCls: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" },
  { role: "assistant",    taskType: "support",   label: "Thợ phụ",    emoji: "🤝",
    chipCls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  { role: "support",      taskType: "support",   label: "Hỗ trợ",     emoji: "🛠️",
    chipCls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  { role: "videographer", taskType: "quay_phim", label: "Quay phim",  emoji: "🎬",
    chipCls: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" },
  { role: "other",        taskType: "other",     label: "Khác",       emoji: "📋",
    chipCls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
];

function getRoleOption(role: string | null) {
  return ROLE_OPTIONS.find(r => r.role === role) ?? ROLE_OPTIONS[ROLE_OPTIONS.length - 1];
}

// ── Kanban/List constants ─────────────────────────────────────────────────────
const PRIO_CONFIG = {
  high:   { label: "Cao",       color: "text-red-700",    bg: "bg-red-100 border-red-200" },
  medium: { label: "Trung bình",color: "text-yellow-700", bg: "bg-yellow-100 border-yellow-200" },
  low:    { label: "Thấp",      color: "text-green-700",  bg: "bg-green-100 border-green-200" },
};

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; iconColor: string; bg: string; border: string }> = {
  todo:        { label: "Chờ xử lý",      icon: Clock,       iconColor: "text-slate-500",   bg: "bg-slate-50 dark:bg-slate-900/20",  border: "border-slate-200" },
  in_progress: { label: "Đang thực hiện", icon: AlertCircle, iconColor: "text-blue-500",    bg: "bg-blue-50 dark:bg-blue-900/20",    border: "border-blue-200" },
  done:        { label: "Hoàn thành",     icon: CheckCircle2,iconColor: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-900/20", border: "border-emerald-200" },
};
const columns = (Object.entries(STATUS_CONFIG) as [TaskStatus, typeof STATUS_CONFIG[string]][])
  .map(([id, cfg]) => ({ id, ...cfg }));

const CATEGORY_LABELS: Record<string, string> = {
  photo: "Chụp ảnh", editing: "Chỉnh sửa", delivery: "Bàn giao", admin: "Hành chính",
  design: "Thiết kế", meeting: "Họp", other: "Khác",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtShootDate(d: string | null | undefined) {
  if (!d) return "—";
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch { return d; }
}

function isFullyStaffed(b: BookingWithTasks): boolean {
  return b.tasks.some(t => t.task_type === "chup") && b.tasks.some(t => t.task_type === "makeup");
}

function getStaffingStatus(b: BookingWithTasks): "du_nguoi" | "chua_du" {
  return isFullyStaffed(b) ? "du_nguoi" : "chua_du";
}

function daysUntil(d: string | null | undefined): { days: number; label: string; color: string } | null {
  if (!d) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const dt = new Date(d); dt.setHours(0,0,0,0);
  const diff = Math.round((dt.getTime() - today.getTime()) / 86400000);
  if (diff < 0)  return { days: diff, label: `${Math.abs(diff)} ngày trước`, color: "text-slate-400" };
  if (diff === 0) return { days: 0, label: "Hôm nay!", color: "text-orange-600 font-bold" };
  if (diff <= 3)  return { days: diff, label: `Còn ${diff} ngày`, color: "text-red-600 font-semibold" };
  if (diff <= 7)  return { days: diff, label: `Còn ${diff} ngày`, color: "text-amber-600" };
  return { days: diff, label: `Còn ${diff} ngày`, color: "text-muted-foreground" };
}

// ── Assignment Modal ──────────────────────────────────────────────────────────
function AssignmentModal({
  booking, onClose, staffList,
}: {
  booking: BookingWithTasks;
  onClose: () => void;
  staffList: StaffItem[];
}) {
  const qc = useQueryClient();
  const [staffId, setStaffId] = useState("");
  const [roleKey, setRoleKey] = useState("photographer");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const selectedRole = ROLE_OPTIONS.find(r => r.role === roleKey) ?? ROLE_OPTIONS[0];

  const handleSave = async () => {
    if (!staffId) { setErr("Chọn nhân sự trước"); return; }
    setSaving(true); setErr("");
    try {
      const res = await authFetch(`${BASE}/api/tasks`, {
        method: "POST",
        body: JSON.stringify({
          bookingId: booking.booking_id,
          title: `${selectedRole.label} - ${booking.customer_name}`,
          assigneeId: parseInt(staffId),
          role: selectedRole.role,
          taskType: selectedRole.taskType,
          category: "photo",
          notes: notes || null,
          priority: "medium",
          status: "todo",
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Lỗi giao việc");
      }
      qc.invalidateQueries({ queryKey: ["tasks-booking-view"] });
      qc.invalidateQueries({ queryKey: ["/api/tasks"] });
      onClose();
    } catch (e) { setErr(String(e instanceof Error ? e.message : e)); }
    finally { setSaving(false); }
  };

  const du = daysUntil(booking.shoot_date);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-background rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-4 pt-4 pb-3 border-b border-border">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-semibold text-base">Giao việc</h2>
              <div className="text-sm text-muted-foreground mt-0.5">{booking.customer_name} · {booking.order_code}</div>
            </div>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted"><X size={18} /></button>
          </div>
          <div className="flex flex-wrap gap-2 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Camera size={11} />{fmtShootDate(booking.shoot_date)}
            </span>
            {du && <span className={du.color}>{du.label}</span>}
            <span>{booking.service_label || booking.package_type || "—"}</span>
            {booking.location && <span>📍 {booking.location}</span>}
          </div>
        </div>

        <div className="p-4 space-y-4">
          {err && <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{err}</div>}

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Vai trò</label>
            <div className="grid grid-cols-3 gap-1.5">
              {ROLE_OPTIONS.map(r => (
                <button key={r.role} onClick={() => setRoleKey(r.role)}
                  className={`flex flex-col items-center gap-1 px-2 py-2 rounded-xl border text-xs font-medium transition-colors
                    ${roleKey === r.role ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-muted-foreground"}`}>
                  <span className="text-base">{r.emoji}</span>
                  <span>{r.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Nhân sự</label>
            <select className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
              value={staffId} onChange={e => setStaffId(e.target.value)}>
              <option value="">— Chọn nhân sự —</option>
              {staffList.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Ghi chú (tuỳ chọn)</label>
            <textarea rows={2} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm resize-none"
              placeholder="Ghi chú thêm..." value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          <button onClick={handleSave} disabled={saving}
            className="w-full py-3 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {saving ? "Đang lưu..." : `Giao ${selectedRole.label}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Booking card ──────────────────────────────────────────────────────────────
function BookingCard({
  booking, onAdd, onRemoveTask,
}: {
  booking: BookingWithTasks;
  onAdd: () => void;
  onRemoveTask: (taskId: number) => void;
}) {
  const staffing = getStaffingStatus(booking);
  const fully = staffing === "du_nguoi";
  const du = daysUntil(booking.shoot_date);
  const borderColor = fully ? "border-l-emerald-400" : "border-l-red-400";

  const hasTasks = booking.tasks.length > 0;
  const statusBadge = !hasTasks
    ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 font-medium">Chưa giao</span>
    : !fully
    ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 font-medium">Chưa đủ người</span>
    : null;

  return (
    <div className={`rounded-xl border border-border border-l-4 ${borderColor} bg-card shadow-sm p-3 transition-all hover:shadow-md`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{booking.customer_name}</span>
            <span className="text-xs text-muted-foreground font-mono">{booking.order_code}</span>
            {statusBadge}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-xs text-muted-foreground">
            <span>{booking.customer_phone}</span>
            <span>{booking.service_label || booking.package_type || "—"}</span>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-xs">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Calendar size={10} />Chụp: {fmtShootDate(booking.shoot_date)}
            </span>
            {du && <span className={du.color}>{du.label}</span>}
            {booking.location && <span className="text-muted-foreground">📍 {booking.location}</span>}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground/60">
            Tạo: {fmtShootDate(booking.booking_created_at)}
          </div>
        </div>
        <button onClick={onAdd}
          className="shrink-0 w-8 h-8 rounded-full bg-primary/10 hover:bg-primary/20 text-primary flex items-center justify-center transition-colors">
          <Plus size={16} />
        </button>
      </div>

      {/* Staff chips */}
      {hasTasks ? (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {booking.tasks.map(t => {
            const ro = getRoleOption(t.role);
            return (
              <div key={t.task_id}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${ro.chipCls}`}>
                <span>{ro.emoji}</span>
                <span>{t.assignee_name ?? "—"}</span>
                <span className="opacity-60">({ro.label})</span>
                <button onClick={() => onRemoveTask(t.task_id)}
                  className="ml-0.5 hover:opacity-100 opacity-50 transition-opacity">
                  <X size={10} />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-2 text-xs text-muted-foreground italic">Nhấn + để giao việc</div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function TasksPage() {
  const qc = useQueryClient();
  const { data: tasks = [], isLoading: tasksLoading } = useListTasks({});
  const { data: staff = [] } = useListStaff();
  const updateTask = useUpdateTask();

  const [viewMode, setViewMode] = useState<"booking" | "kanban" | "list">("booking");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"all" | "chua_du" | "du_nguoi">("all");
  const [assigningBooking, setAssigningBooking] = useState<BookingWithTasks | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [filterAssignee, setFilterAssignee] = useState("");
  const [filterPrio, setFilterPrio] = useState("");

  // Booking-view data
  const { data: bookingViewData = [], isLoading: bvLoading } = useQuery<BookingWithTasks[]>({
    queryKey: ["tasks-booking-view"],
    queryFn: async () => {
      const res = await authFetch(`${BASE}/api/tasks/booking-view`);
      return res.ok ? res.json() : [];
    },
    enabled: viewMode === "booking",
    staleTime: 0,
  });

  const staffList = (staff as StaffItem[]).map(s => ({ id: s.id, name: s.name }));

  // Filter booking-view data
  const filteredBookings = useMemo(() => {
    let data = [...bookingViewData];
    if (tab === "chua_du")   data = data.filter(b => !isFullyStaffed(b));
    if (tab === "du_nguoi")  data = data.filter(b => isFullyStaffed(b));
    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter(b =>
        b.customer_name.toLowerCase().includes(q) ||
        b.customer_phone.toLowerCase().includes(q) ||
        b.order_code.toLowerCase().includes(q) ||
        (b.shoot_date && b.shoot_date.includes(q))
      );
    }
    return data;
  }, [bookingViewData, tab, search]);

  const handleStatusChange = (taskId: number, newStatus: TaskStatus) => {
    updateTask.mutate({ id: taskId, data: { status: newStatus } }, {
      onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/tasks"] }),
    });
  };

  const handleRemoveTask = async (taskId: number) => {
    if (!confirm("Bỏ giao việc này?")) return;
    const res = await authFetch(`${BASE}/api/tasks/${taskId}`, { method: "DELETE" });
    if (!res.ok && res.status !== 204) {
      const e = await res.json().catch(() => ({}));
      alert(e.error || "Không thể xoá giao việc này");
      return;
    }
    qc.invalidateQueries({ queryKey: ["tasks-booking-view"] });
    qc.invalidateQueries({ queryKey: ["/api/tasks"] });
  };

  const filteredTasks = tasks.filter(t => {
    const matchAssignee = !filterAssignee || String(t.assigneeId) === filterAssignee;
    const matchPrio = !filterPrio || t.priority === filterPrio;
    return matchAssignee && matchPrio;
  });
  const tasksByStatus = {
    todo:        filteredTasks.filter(t => t.status === "todo"),
    in_progress: filteredTasks.filter(t => t.status === "in_progress"),
    done:        filteredTasks.filter(t => t.status === "done"),
  };

  const counts = {
    all:      bookingViewData.length,
    chua_du:  bookingViewData.filter(b => !isFullyStaffed(b)).length,
    du_nguoi: bookingViewData.filter(b => isFullyStaffed(b)).length,
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold">Giao việc</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {viewMode === "booking"
              ? `${filteredBookings.length} đơn hàng`
              : `${tasksByStatus.todo.length} chờ · ${tasksByStatus.in_progress.length} đang làm · ${tasksByStatus.done.length} xong`}
          </p>
        </div>
        <div className="flex rounded-lg border overflow-hidden">
          <button onClick={() => setViewMode("booking")}
            className={`px-3 py-1.5 text-sm flex items-center gap-1.5 ${viewMode === "booking" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
            <Briefcase className="w-3.5 h-3.5" /> Theo đơn
          </button>
          <button onClick={() => setViewMode("kanban")}
            className={`px-3 py-1.5 text-sm flex items-center gap-1.5 ${viewMode === "kanban" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
            <LayoutGrid className="w-3.5 h-3.5" /> Kanban
          </button>
          <button onClick={() => setViewMode("list")}
            className={`px-3 py-1.5 text-sm flex items-center gap-1.5 ${viewMode === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
            <List className="w-3.5 h-3.5" /> Danh sách
          </button>
        </div>
      </div>

      {/* ─── BOOKING VIEW (default) ──────────────────────────────────────────── */}
      {viewMode === "booking" && (
        <div className="flex flex-col flex-1 min-h-0 gap-3">
          {/* Search */}
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input className="w-full pl-9 pr-9 py-2 rounded-xl border border-border bg-background text-sm placeholder:text-muted-foreground"
              placeholder="Tìm tên khách, SĐT, mã đơn..." value={search} onChange={e => setSearch(e.target.value)} />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-foreground">
                <X size={14} />
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-1">
            {([
              { key: "all",      label: `Tất cả (${counts.all})` },
              { key: "chua_du",  label: `Chưa đủ (${counts.chua_du})` },
              { key: "du_nguoi", label: `Đủ người (${counts.du_nguoi})` },
            ] as { key: typeof tab; label: string }[]).map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${tab === t.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Cards */}
          <div className="flex-1 overflow-y-auto">
            {bvLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
                <Loader2 size={20} className="animate-spin" /><span>Đang tải...</span>
              </div>
            ) : filteredBookings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                <Briefcase size={36} className="opacity-30" />
                <span className="text-sm">Không có đơn hàng nào</span>
                {search && <span className="text-xs opacity-60">Thử xóa tìm kiếm</span>}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground px-1">{filteredBookings.length} đơn</div>
                {filteredBookings.map(b => (
                  <BookingCard key={b.booking_id} booking={b}
                    onAdd={() => setAssigningBooking(b)}
                    onRemoveTask={handleRemoveTask} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── KANBAN VIEW ─────────────────────────────────────────────────────── */}
      {viewMode === "kanban" && (
        <>
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
          {tasksLoading ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">Đang tải...</div>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-4 flex-1">
              {columns.map(col => {
                const ColTasks = tasksByStatus[col.id];
                return (
                  <div key={col.id}
                    className={`flex-1 min-w-72 rounded-2xl border ${col.border} ${col.bg} flex flex-col`}
                    onDragOver={e => e.preventDefault()}
                    onDrop={() => { if (dragId !== null) handleStatusChange(dragId, col.id); setDragId(null); }}>
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
                          <div key={task.id} draggable onDragStart={() => setDragId(task.id)}
                            className="bg-background rounded-xl border shadow-sm p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-all group">
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
                                  <Calendar className="w-3 h-3" />{formatDate(task.dueDate)}
                                </span>
                              )}
                            </div>
                            <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              {columns.filter(c => c.id !== col.id).map(c => (
                                <button key={c.id} onClick={() => handleStatusChange(task.id, c.id)}
                                  className={`text-[10px] px-2 py-1 rounded border ${c.bg} ${c.iconColor} font-medium hover:opacity-80 transition`}>
                                  → {c.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ─── LIST VIEW ───────────────────────────────────────────────────────── */}
      {viewMode === "list" && (
        <>
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
          {tasksLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">Đang tải...</div>
          ) : filteredTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <CheckCircle2 className="w-10 h-10 opacity-30" />
              <p>Không có công việc nào</p>
            </div>
          ) : (
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground text-xs">Công việc</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground text-xs">Người thực hiện</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground text-xs">Trạng thái</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground text-xs">Hạn</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground text-xs">Ưu tiên</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTasks.map(task => {
                    const prio = PRIO_CONFIG[task.priority as keyof typeof PRIO_CONFIG] ?? PRIO_CONFIG.medium;
                    const st = STATUS_CONFIG[task.status as TaskStatus] ?? STATUS_CONFIG.todo;
                    const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "done";
                    return (
                      <tr key={task.id} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="py-2 px-3">
                          <p className="font-medium truncate max-w-xs">{task.title}</p>
                          {task.description && <p className="text-xs text-muted-foreground truncate max-w-xs">{task.description}</p>}
                        </td>
                        <td className="py-2 px-3">
                          {task.assigneeName
                            ? <span className="flex items-center gap-1"><User className="w-3 h-3 text-muted-foreground" />{task.assigneeName}</span>
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="py-2 px-3">
                          <Select value={task.status} onChange={e => handleStatusChange(task.id, e.target.value as TaskStatus)} className="text-xs h-7 py-0 w-36">
                            {columns.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                          </Select>
                        </td>
                        <td className="py-2 px-3">
                          {task.dueDate
                            ? <span className={`text-xs flex items-center gap-1 ${isOverdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                                <Calendar className="w-3 h-3" />{formatDate(task.dueDate)}
                              </span>
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="py-2 px-3">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${prio.bg} ${prio.color}`}>{prio.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Assignment modal */}
      {assigningBooking && (
        <AssignmentModal booking={assigningBooking} onClose={() => setAssigningBooking(null)} staffList={staffList} />
      )}
    </div>
  );
}
