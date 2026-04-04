import { useState, useMemo, useEffect } from "react";
import type React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useListTasks, useUpdateTask, useListStaff, TaskStatus } from "@workspace/api-client-react";
import { Select } from "@/components/ui";
import {
  Clock, AlertCircle, CheckCircle2, User, Calendar,
  List, LayoutGrid, Search, X, Loader2, Briefcase, Save,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { StaffAssignmentEditor, type StaffAssignment } from "@/components/staff-assignment-editor";

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
  assigned_staff: StaffAssignment[];
  tasks: TaskAssignment[];
};

type StaffRate = { staffId: number; role: string; taskKey: string; rate: number | null };
type StaffOption = { id: number; name: string; roles: string[] };

// ── Kanban/List constants ─────────────────────────────────────────────────────
const PRIO_CONFIG = {
  high:   { label: "Cao",        color: "text-red-700",    bg: "bg-red-100 border-red-200" },
  medium: { label: "Trung bình", color: "text-yellow-700", bg: "bg-yellow-100 border-yellow-200" },
  low:    { label: "Thấp",       color: "text-green-700",  bg: "bg-green-100 border-green-200" },
};

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; iconColor: string; bg: string; border: string }> = {
  todo:        { label: "Chờ xử lý",      icon: Clock,        iconColor: "text-slate-500",   bg: "bg-slate-50 dark:bg-slate-900/20",     border: "border-slate-200" },
  in_progress: { label: "Đang thực hiện", icon: AlertCircle,  iconColor: "text-blue-500",    bg: "bg-blue-50 dark:bg-blue-900/20",       border: "border-blue-200" },
  done:        { label: "Hoàn thành",     icon: CheckCircle2, iconColor: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-900/20", border: "border-emerald-200" },
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
  return (b.assigned_staff ?? []).length > 0;
}

function daysUntil(d: string | null | undefined): { days: number; label: string; color: string } | null {
  if (!d) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dt = new Date(d); dt.setHours(0, 0, 0, 0);
  const diff = Math.round((dt.getTime() - today.getTime()) / 86400000);
  if (diff < 0)   return { days: diff, label: `${Math.abs(diff)} ngày trước`, color: "text-slate-400" };
  if (diff === 0) return { days: 0,    label: "Hôm nay!",                    color: "text-orange-600 font-bold" };
  if (diff <= 3)  return { days: diff, label: `Còn ${diff} ngày`,            color: "text-red-600 font-semibold" };
  if (diff <= 7)  return { days: diff, label: `Còn ${diff} ngày`,            color: "text-amber-600" };
  return { days: diff, label: `Còn ${diff} ngày`, color: "text-muted-foreground" };
}

// ── Booking Card ──────────────────────────────────────────────────────────────
function BookingCard({
  booking, staffOptions, allStaffRates, onSaved,
}: {
  booking: BookingWithTasks;
  staffOptions: StaffOption[];
  allStaffRates: StaffRate[];
  onSaved: () => void;
}) {
  const serverStaff = booking.assigned_staff ?? [];
  const [localStaff, setLocalStaff] = useState<StaffAssignment[]>(() => serverStaff);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  const serverKey = JSON.stringify(serverStaff);
  useEffect(() => {
    setLocalStaff(serverStaff);
    setSaveErr("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverKey]);

  const isDirty = JSON.stringify(localStaff) !== serverKey;
  const fully = serverStaff.length > 0;
  const du = daysUntil(booking.shoot_date);
  const borderColor = fully ? "border-l-emerald-400" : "border-l-red-400";

  const handleSave = async () => {
    setSaving(true); setSaveErr("");
    try {
      const res = await authFetch(`${BASE}/api/bookings/${booking.booking_id}`, {
        method: "PUT",
        body: JSON.stringify({ assignedStaff: localStaff }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        setSaveErr(e.error || "Lỗi lưu nhân sự");
        return;
      }
      onSaved();
    } catch (e) {
      setSaveErr(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`rounded-xl border border-border border-l-4 ${borderColor} bg-card shadow-sm p-3 transition-all hover:shadow-md`}>
      {/* Header */}
      <div className="mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm">{booking.customer_name}</span>
          <span className="text-xs text-muted-foreground font-mono">{booking.order_code}</span>
          {!fully && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 font-medium">
              Chưa có nhân sự
            </span>
          )}
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

      {/* Inline staff editor */}
      <div className="border-t border-border/40 pt-2.5">
        <StaffAssignmentEditor
          value={localStaff}
          onChange={setLocalStaff}
          staffOptions={staffOptions}
          allStaffRates={allStaffRates}
          baseJobType="mac_dinh"
        />
      </div>

      {/* Error */}
      {saveErr && (
        <div className="mt-1.5 text-xs text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg px-2 py-1">
          {saveErr}
        </div>
      )}

      {/* Save button (only when dirty) */}
      {isDirty && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-2 w-full py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          {saving ? "Đang lưu..." : "Lưu thay đổi nhân sự"}
        </button>
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

  // Staff rates for StaffAssignmentEditor
  const { data: allStaffRates = [] } = useQuery<StaffRate[]>({
    queryKey: ["staff-rates"],
    queryFn: () =>
      authFetch(`${BASE}/api/staff-rates`)
        .then(r => r.ok ? r.json() : [])
        .then((d: unknown) => (Array.isArray(d) ? d : [])),
  });

  const staffOptions: StaffOption[] = (staff as Array<{ id: number | string; name: string; roles?: string[] }>).map(s => ({
    id: Number(s.id),
    name: s.name,
    roles: s.roles || [],
  }));

  // Filter booking-view data
  const filteredBookings = useMemo(() => {
    let data = [...bookingViewData];
    if (tab === "chua_du")  data = data.filter(b => !isFullyStaffed(b));
    if (tab === "du_nguoi") data = data.filter(b => isFullyStaffed(b));
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

  const handleSaved = () => {
    qc.invalidateQueries({ queryKey: ["tasks-booking-view"] });
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
            <input
              className="w-full pl-9 pr-9 py-2 rounded-xl border border-border bg-background text-sm placeholder:text-muted-foreground"
              placeholder="Tìm tên khách, SĐT, mã đơn..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
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
                  <BookingCard
                    key={b.booking_id}
                    booking={b}
                    staffOptions={staffOptions}
                    allStaffRates={allStaffRates}
                    onSaved={handleSaved}
                  />
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
            <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="animate-spin mr-2" />Đang tải...</div>
          ) : (
            <div className="flex gap-3 flex-1 overflow-x-auto min-h-0">
              {columns.map(col => {
                const ColTasks = tasksByStatus[col.id as keyof typeof tasksByStatus] ?? [];
                return (
                  <div key={col.id}
                    className={`flex flex-col flex-1 min-w-[240px] max-w-sm rounded-xl border ${col.border} ${col.bg} min-h-0`}
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
    </div>
  );
}
