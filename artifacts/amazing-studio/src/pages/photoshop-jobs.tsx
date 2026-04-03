import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search, CheckCircle2, AlertTriangle, UserCheck, Camera, Calendar,
  Clock, User, X, ChevronRight, Loader2, ImageIcon, BarChart3
} from "lucide-react";
import { useStaffAuth } from "@/contexts/StaffAuthContext";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const token = () => localStorage.getItem("amazingStudioToken_v2");
const authHeaders = () => ({
  "Content-Type": "application/json",
  ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
});
const fetchAuth = (url: string, opts?: RequestInit) =>
  fetch(url, { headers: authHeaders(), ...opts });

type BookingEditRow = {
  booking_id: number;
  order_code: string;
  shoot_date: string;
  booking_created_at: string;
  package_type: string;
  service_label: string;
  customer_name: string;
  customer_phone: string;
  job_id: number | null;
  job_code: string | null;
  status: string | null;
  assigned_staff_id: number | null;
  assigned_staff_name: string | null;
  received_file_date: string | null;
  internal_deadline: string | null;
  customer_deadline: string | null;
  total_photos: number | null;
  done_photos: number | null;
  progress_percent: number | null;
  notes: string | null;
};

type Stats = { myActive: number; myDoneThisMonth: number; unassigned: number };
type StaffItem = { id: number; name: string; role: string };

type DetailForm = {
  totalPhotos: string;
  donePhotos: string;
  receivedFileDate: string;
  internalDeadline: string;
  customerDeadline: string;
  notes: string;
  assignedStaffId: string;
  assignedStaffName: string;
};

// ── Shared helper: định nghĩa "Chưa nhận" dùng thống nhất ở 3 nơi ────────────
function isUnassigned(row: BookingEditRow): boolean {
  return !row.job_id || !row.assigned_staff_id || row.status === "chua_nhan";
}

function getCardUrgency(row: BookingEditRow): "red" | "yellow" | "done" | "normal" {
  if (row.status === "hoan_thanh") return "done";
  if (isUnassigned(row)) return "red";
  if (!row.internal_deadline) return "normal";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dl = new Date(row.internal_deadline);
  const days = Math.ceil((dl.getTime() - today.getTime()) / 86400000);
  if (days <= 3) return "red";
  if (days <= 5) return "yellow";
  return "normal";
}

const URGENCY_STYLE: Record<string, string> = {
  red:    "border-l-4 border-l-red-400 bg-red-50/40 dark:bg-red-900/10",
  yellow: "border-l-4 border-l-amber-400 bg-amber-50/40 dark:bg-amber-900/10",
  done:   "border-l-4 border-l-emerald-400 bg-emerald-50/40 dark:bg-emerald-900/10",
  normal: "border-l-4 border-l-slate-200 dark:border-l-slate-700 bg-card",
};

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch { return d; }
}

function daysLeft(deadline: string | null | undefined): string {
  if (!deadline) return "";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dl = new Date(deadline);
  const days = Math.ceil((dl.getTime() - today.getTime()) / 86400000);
  if (days < 0) return `Trễ ${Math.abs(days)} ngày`;
  if (days === 0) return "Hôm nay";
  return `Còn ${days} ngày`;
}

const STATUS_LABEL: Record<string, string> = {
  chua_nhan:  "Chưa nhận",
  dang_xu_ly: "Đang làm",
  cho_duyet:  "Chờ duyệt",
  hoan_thanh: "Hoàn thành",
};

const TABS = [
  { key: "all",        label: "Tất cả" },
  { key: "mine",       label: "Của tôi" },
  { key: "chua_nhan",  label: "Chưa nhận" },
  { key: "dang_xu_ly", label: "Đang làm" },
  { key: "hoan_thanh", label: "Hoàn thành" },
];

// ── Stat card component ───────────────────────────────────────────────────────
function StatCard({
  label, value, icon: Icon, color,
}: { label: string; value: number; icon: React.ElementType; color: "blue" | "green" | "red" }) {
  const colors = {
    blue:  "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400",
    green: "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400",
    red:   "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400",
  };
  return (
    <div className="rounded-xl border border-border bg-card p-3 flex flex-col gap-1 shadow-sm">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colors[color]}`}>
        <Icon size={16} />
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground leading-tight">{label}</div>
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({ percent }: { percent: number }) {
  const pct = Math.min(100, Math.max(0, percent || 0));
  const color = pct >= 100 ? "bg-emerald-500" : pct >= 70 ? "bg-blue-500" : pct >= 40 ? "bg-amber-500" : "bg-slate-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-muted-foreground w-8 text-right">{Math.round(pct)}%</span>
    </div>
  );
}

// ── Detail Modal ──────────────────────────────────────────────────────────────
function DetailModal({
  row, onClose, staffList, isAdmin, viewerId, viewerName,
}: {
  row: BookingEditRow;
  onClose: () => void;
  staffList: StaffItem[];
  isAdmin: boolean;
  viewerId: number | null;
  viewerName: string;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<DetailForm>({
    totalPhotos: String(row.total_photos ?? ""),
    donePhotos: String(row.done_photos ?? ""),
    receivedFileDate: row.received_file_date ?? "",
    internalDeadline: row.internal_deadline ?? "",
    customerDeadline: row.customer_deadline ?? "",
    notes: row.notes ?? "",
    assignedStaffId: row.assigned_staff_id != null ? String(row.assigned_staff_id) : "",
    assignedStaffName: row.assigned_staff_name ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["photoshop-booking-view"] });
    qc.invalidateQueries({ queryKey: ["photoshop-stats"] });
  };

  const claimJob = async () => {
    setSaving(true); setErr("");
    try {
      if (!row.job_id) {
        const r = await fetchAuth(`${BASE}/api/photoshop-jobs`, {
          method: "POST",
          body: JSON.stringify({
            bookingId: row.booking_id,
            customerName: row.customer_name,
            customerPhone: row.customer_phone,
            serviceName: row.service_label || row.package_type,
            shootDate: row.shoot_date,
            assignedStaffId: viewerId,
            assignedStaffName: viewerName,
            status: "dang_xu_ly",
            receivedFileDate: new Date().toISOString().split("T")[0],
          }),
        });
        if (!r.ok) {
          const e = await r.json().catch(() => ({}));
          throw new Error(e.error || "Lỗi nhận việc");
        }
      } else {
        const r = await fetchAuth(`${BASE}/api/photoshop-jobs/${row.job_id}`, {
          method: "PUT",
          body: JSON.stringify({
            assignedStaffId: viewerId,
            assignedStaffName: viewerName,
            status: "dang_xu_ly",
            receivedFileDate: new Date().toISOString().split("T")[0],
          }),
        });
        if (!r.ok) throw new Error("Lỗi nhận việc");
      }
      invalidate();
      onClose();
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally { setSaving(false); }
  };

  const save = async (extraFields?: Record<string, unknown>) => {
    setSaving(true); setErr("");
    try {
      const done = Number(form.donePhotos) || 0;
      const total = Number(form.totalPhotos) || 0;
      const progress = total > 0 ? Math.round((done / total) * 100) : 0;

      let staffId = form.assignedStaffId ? Number(form.assignedStaffId) : null;
      let staffName = form.assignedStaffName;
      if (isAdmin && form.assignedStaffId) {
        const found = staffList.find(s => String(s.id) === form.assignedStaffId);
        if (found) staffName = found.name;
      }

      const payload: Record<string, unknown> = {
        totalPhotos: total,
        donePhotos: done,
        progressPercent: progress,
        receivedFileDate: form.receivedFileDate,
        internalDeadline: form.internalDeadline,
        customerDeadline: form.customerDeadline,
        notes: form.notes,
        ...(isAdmin ? { assignedStaffId: staffId, assignedStaffName: staffName } : {}),
        ...extraFields,
      };

      if (row.job_id) {
        const r = await fetchAuth(`${BASE}/api/photoshop-jobs/${row.job_id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        if (!r.ok) throw new Error("Lỗi lưu");
      } else {
        const r = await fetchAuth(`${BASE}/api/photoshop-jobs`, {
          method: "POST",
          body: JSON.stringify({
            bookingId: row.booking_id,
            customerName: row.customer_name,
            customerPhone: row.customer_phone,
            serviceName: row.service_label || row.package_type,
            shootDate: row.shoot_date,
            ...payload,
          }),
        });
        if (!r.ok) throw new Error("Lỗi tạo job");
      }
      invalidate();
      onClose();
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally { setSaving(false); }
  };

  const markDone = () => save({ status: "hoan_thanh" });

  const urgency = getCardUrgency(row);
  const pct = form.totalPhotos && Number(form.totalPhotos) > 0
    ? Math.round((Number(form.donePhotos) / Number(form.totalPhotos)) * 100)
    : 0;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-background rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`px-4 pt-4 pb-3 rounded-t-2xl sm:rounded-t-2xl ${urgency === "red" ? "bg-red-50 dark:bg-red-900/20" : urgency === "yellow" ? "bg-amber-50 dark:bg-amber-900/20" : urgency === "done" ? "bg-emerald-50 dark:bg-emerald-900/20" : "bg-muted/30"}`}>
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs text-muted-foreground mb-0.5">{row.order_code}</div>
              <h2 className="font-semibold text-base leading-tight">{row.customer_name}</h2>
              <div className="text-sm text-muted-foreground">{row.customer_phone}</div>
            </div>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-black/10"><X size={18} /></button>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <span className="text-xs px-2 py-0.5 rounded-full bg-background/70 font-medium">{row.service_label || row.package_type || "—"}</span>
            {row.status && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${row.status === "hoan_thanh" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40" : row.status === "dang_xu_ly" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40" : "bg-slate-100 text-slate-600 dark:bg-slate-800"}`}>
                {STATUS_LABEL[row.status] || row.status}
              </span>
            )}
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Info row */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Ngày chụp</div>
              <div className="font-medium">{formatDate(row.shoot_date)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Người phụ trách</div>
              <div className="font-medium">{row.assigned_staff_name || "—"}</div>
            </div>
          </div>

          {/* Nhận việc button — show if unassigned (non-admin uses their own account) */}
          {isUnassigned(row) && !saving && (
            <button
              onClick={claimJob}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2"
              disabled={saving}
            >
              <UserCheck size={16} />
              {viewerName ? `Tôi nhận việc này (${viewerName})` : "Nhận việc"}
            </button>
          )}

          {err && <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{err}</div>}

          {/* Assign staff (admin only) */}
          {isAdmin && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Giao việc cho nhân viên</label>
              <select
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={form.assignedStaffId}
                onChange={e => {
                  const found = staffList.find(s => String(s.id) === e.target.value);
                  setForm(f => ({ ...f, assignedStaffId: e.target.value, assignedStaffName: found?.name ?? "" }));
                }}
              >
                <option value="">— Chưa giao —</option>
                {staffList.map(s => (
                  <option key={s.id} value={String(s.id)}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Ngày bắt đầu */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Ngày bắt đầu hậu kỳ</label>
            <input
              type="date"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={form.receivedFileDate}
              onChange={e => setForm(f => ({ ...f, receivedFileDate: e.target.value }))}
            />
          </div>

          {/* Deadlines */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Deadline nội bộ</label>
              <input
                type="date"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={form.internalDeadline}
                onChange={e => setForm(f => ({ ...f, internalDeadline: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Deadline khách</label>
              <input
                type="date"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={form.customerDeadline}
                onChange={e => setForm(f => ({ ...f, customerDeadline: e.target.value }))}
              />
            </div>
          </div>

          {/* Progress */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Tổng số ảnh</label>
              <input
                type="number" min="0"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={form.totalPhotos}
                onChange={e => setForm(f => ({ ...f, totalPhotos: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Đã hậu kỳ xong</label>
              <input
                type="number" min="0"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={form.donePhotos}
                onChange={e => setForm(f => ({ ...f, donePhotos: e.target.value }))}
              />
            </div>
          </div>
          {Number(form.totalPhotos) > 0 && (
            <ProgressBar percent={pct} />
          )}

          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Ghi chú</label>
            <textarea
              rows={2}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Ghi chú nội bộ..."
            />
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 pt-1">
            {row.status !== "hoan_thanh" && (
              <button
                onClick={markDone}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <CheckCircle2 size={15} />
                Hoàn thành
              </button>
            )}
            <button
              onClick={() => save()}
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : null}
              Lưu tiến độ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Booking card ──────────────────────────────────────────────────────────────
function BookingCard({ row, onClick }: { row: BookingEditRow; onClick: () => void }) {
  const urgency = getCardUrgency(row);
  const pct = row.total_photos && row.total_photos > 0
    ? Math.round(((row.done_photos ?? 0) / row.total_photos) * 100)
    : (row.progress_percent ?? 0);

  const dlDays = row.internal_deadline ? daysLeft(row.internal_deadline) : "";
  const dlColor = urgency === "red" ? "text-red-500" : urgency === "yellow" ? "text-amber-500" : "text-muted-foreground";

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border shadow-sm p-3 transition-all hover:shadow-md ${URGENCY_STYLE[urgency]}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-semibold text-sm truncate">{row.customer_name}</span>
            {isUnassigned(row) ? (
              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-900/40 font-medium">Chưa nhận</span>
            ) : row.status === "hoan_thanh" ? (
              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 font-medium">Hoàn thành</span>
            ) : (
              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 font-medium">{STATUS_LABEL[row.status ?? ""] || "Đang làm"}</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mb-1">{row.customer_phone} • {row.service_label || row.package_type || "—"}</div>

          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mb-2">
            <span className="flex items-center gap-1">
              <Camera size={10} />
              {formatDate(row.shoot_date)}
            </span>
            {row.internal_deadline && (
              <span className={`flex items-center gap-1 font-medium ${dlColor}`}>
                <Clock size={10} />
                {dlDays} ({formatDate(row.internal_deadline)})
              </span>
            )}
            {row.assigned_staff_name && (
              <span className="flex items-center gap-1">
                <User size={10} />
                {row.assigned_staff_name}
              </span>
            )}
          </div>

          {row.total_photos ? (
            <div className="space-y-0.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><ImageIcon size={10} />{row.done_photos ?? 0}/{row.total_photos} ảnh</span>
                <span className="font-medium">{Math.round(pct)}%</span>
              </div>
              <ProgressBar percent={pct} />
            </div>
          ) : (
            <div className="text-xs text-muted-foreground italic">Chưa nhập số ảnh</div>
          )}
        </div>
        <ChevronRight size={16} className="text-muted-foreground shrink-0 mt-1" />
      </div>
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PhotoshopJobsPage() {
  const { viewer, isAdmin } = useStaffAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<BookingEditRow | null>(null);

  const { data: rows = [], isLoading } = useQuery<BookingEditRow[]>({
    queryKey: ["photoshop-booking-view"],
    queryFn: () =>
      fetchAuth(`${BASE}/api/photoshop-jobs/booking-view`)
        .then(r => r.ok ? r.json() : []),
    staleTime: 0,
  });

  const { data: stats } = useQuery<Stats>({
    queryKey: ["photoshop-stats"],
    queryFn: () =>
      fetchAuth(`${BASE}/api/photoshop-jobs/my-stats`)
        .then(r => r.ok ? r.json() : { myActive: 0, myDoneThisMonth: 0, unassigned: 0 }),
    staleTime: 0,
  });

  const { data: staffList = [] } = useQuery<StaffItem[]>({
    queryKey: ["staff"],
    queryFn: () =>
      fetchAuth(`${BASE}/api/staff`)
        .then(r => r.ok ? r.json() : [])
        .then((d: unknown) => Array.isArray(d) ? d : []),
    enabled: isAdmin,
  });

  const filtered = useMemo(() => {
    let data = rows;

    if (tab === "mine") {
      data = data.filter(r => r.assigned_staff_id === viewer?.id);
    } else if (tab === "chua_nhan") {
      data = data.filter(r => isUnassigned(r));
    } else if (tab === "dang_xu_ly") {
      data = data.filter(r => r.status === "dang_xu_ly" || r.status === "cho_duyet");
    } else if (tab === "hoan_thanh") {
      data = data.filter(r => r.status === "hoan_thanh");
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter(r =>
        (r.customer_name ?? "").toLowerCase().includes(q) ||
        (r.customer_phone ?? "").toLowerCase().includes(q) ||
        (r.shoot_date ?? "").includes(q) ||
        (r.order_code ?? "").toLowerCase().includes(q)
      );
    }
    return data;
  }, [rows, tab, search, viewer?.id]);

  const handleCardClick = (row: BookingEditRow) => {
    // Always show latest data by refreshing from the list
    setSelected(row);
  };

  const handleModalClose = () => {
    setSelected(null);
    qc.invalidateQueries({ queryKey: ["photoshop-booking-view"] });
    qc.invalidateQueries({ queryKey: ["photoshop-stats"] });
  };

  return (
    <div className="p-3 sm:p-4 max-w-2xl mx-auto space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Tiến độ Hậu kỳ</h1>
          <p className="text-sm text-muted-foreground">Quản lý hậu kỳ theo đơn hàng</p>
        </div>
        <BarChart3 size={22} className="text-muted-foreground" />
      </div>

      {/* Stats boxes */}
      <div className="grid grid-cols-3 gap-2.5">
        <StatCard
          label={isAdmin ? "Đang làm" : "Đơn của tôi"}
          value={stats?.myActive ?? 0}
          icon={UserCheck}
          color="blue"
        />
        <StatCard
          label="Xong tháng này"
          value={stats?.myDoneThisMonth ?? 0}
          icon={CheckCircle2}
          color="green"
        />
        <StatCard
          label="Chưa có ai nhận"
          value={stats?.unassigned ?? 0}
          icon={AlertTriangle}
          color="red"
        />
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-background text-sm placeholder:text-muted-foreground"
          placeholder="Tìm tên khách, số điện thoại, ngày chụp..."
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
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              tab === t.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
          <Loader2 size={20} className="animate-spin" />
          <span>Đang tải...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Calendar size={36} className="mx-auto mb-2 opacity-30" />
          <div className="text-sm">Không có đơn hàng nào</div>
          {search && <div className="text-xs mt-1 opacity-60">Thử xóa bộ lọc</div>}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground px-1">{filtered.length} đơn hàng</div>
          {filtered.map(row => (
            <BookingCard key={row.booking_id} row={row} onClick={() => handleCardClick(row)} />
          ))}
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <DetailModal
          row={selected}
          onClose={handleModalClose}
          staffList={staffList}
          isAdmin={isAdmin}
          viewerId={viewer?.id ?? null}
          viewerName={viewer?.name ?? ""}
        />
      )}
    </div>
  );
}
