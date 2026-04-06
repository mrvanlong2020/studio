import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search, CheckCircle2, AlertTriangle, UserCheck, Camera,
  Clock, User, X, ChevronRight, Loader2, ImageIcon, BarChart3,
  PauseCircle, PlayCircle, Filter, Package, Users, FileText,
  Palette, Zap, MessageSquare, ChevronDown, ChevronUp
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

type BookingItem = {
  id?: string;
  label?: string;
  serviceName?: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice?: number;
  includedRetouchedPhotos?: number;
  albumName?: string | null;
  rawFilesIncluded?: boolean | null;
  conceptImages?: string[] | null;
};

type BookingSurcharge = {
  id?: string;
  label?: string;
  amount?: number;
  quantity?: number;
  note?: string | null;
};

type AssignedStaffItem = {
  role?: string;
  name?: string;
  staffName?: string;
  staffId?: string | number;
};

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
  total_amount: number | null;
  booking_notes: string | null;
  booking_items: unknown;
  booking_surcharges: unknown;
  booking_assigned_staff: unknown;
  included_retouched_photos_snapshot: number | null;
  photoshop_note: string | null;
  extra_retouch_price: number | null;
};

type Stats = { myActive: number; myDoneThisMonth: number; backlog: number };
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
  photoshopNote: string;
  extraRetouchPrice: string;
};

// ── Shared helper: "Chưa nhận" dùng thống nhất ở 3 nơi ─────────────────────
function isUnassigned(row: BookingEditRow): boolean {
  return !row.job_id || !row.assigned_staff_id || row.status === "chua_nhan";
}

// ── Sort priority: quá hạn → chưa nhận → ≤3 ngày → ≤5 ngày → còn lại → tạm hoãn → hoàn thành
function sortPriority(row: BookingEditRow): number {
  if (row.status === "hoan_thanh") return 70;
  if (row.status === "tam_hoan") return 60;

  if (row.internal_deadline) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dl = new Date(row.internal_deadline);
    const days = Math.ceil((dl.getTime() - today.getTime()) / 86400000);
    if (days < 0) return 10;
    if (isUnassigned(row)) return 20;
    if (days <= 3) return 30;
    if (days <= 5) return 40;
  }

  if (isUnassigned(row)) return 20;
  return 50;
}

// ── Urgency ───────────────────────────────────────────────────────────────────
function getCardUrgency(row: BookingEditRow): "red" | "yellow" | "done" | "paused" | "normal" {
  if (row.status === "hoan_thanh") return "done";
  if (row.status === "tam_hoan") return "paused";
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
  paused: "border-l-4 border-l-purple-300 bg-purple-50/40 dark:bg-purple-900/10",
  normal: "border-l-4 border-l-slate-200 dark:border-l-slate-700 bg-card",
};

const STATUS_LABEL: Record<string, string> = {
  chua_nhan:  "Chưa nhận",
  dang_xu_ly: "Đang làm",
  cho_duyet:  "Chờ duyệt",
  tam_hoan:   "Tạm hoãn",
  hoan_thanh: "Hoàn thành",
};

const TABS = [
  { key: "all",        label: "Chưa xong" },
  { key: "mine",       label: "Của tôi" },
  { key: "chua_nhan",  label: "Chưa nhận" },
  { key: "dang_xu_ly", label: "Đang làm" },
  { key: "tam_hoan",   label: "Tạm hoãn" },
  { key: "hoan_thanh", label: "Hoàn thành" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }); }
  catch { return d; }
}

function formatMonth(ym: string): string {
  const [y, m] = ym.split("-");
  return `Tháng ${m}/${y}`;
}

function formatVND(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(n);
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

function parseJson<T>(val: unknown): T | null {
  if (!val) return null;
  if (typeof val === "object") return val as T;
  if (typeof val === "string") {
    try { return JSON.parse(val) as T; } catch { return null; }
  }
  return null;
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: number; icon: React.ElementType; color: "blue" | "green" | "red";
}) {
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

// ── Collapsible section ───────────────────────────────────────────────────────
function Section({ icon: Icon, title, children, defaultOpen = true }: {
  icon: React.ElementType; title: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/40 hover:bg-muted/60 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Icon size={14} className="text-muted-foreground" />
          {title}
        </div>
        {open ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
      </button>
      {open && <div className="px-3 py-3 space-y-2">{children}</div>}
    </div>
  );
}

// ── Concept image gallery ─────────────────────────────────────────────────────
function ConceptGallery({ images }: { images: string[] }) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {images.map((src, i) => (
          <button key={i} type="button" onClick={() => setLightbox(src)}
            className="w-16 h-16 rounded-lg overflow-hidden border border-border bg-muted flex-shrink-0 hover:opacity-90 transition-opacity">
            <img src={src} alt={`concept-${i}`} className="w-full h-full object-cover" />
          </button>
        ))}
      </div>
      {lightbox && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="concept" className="max-w-full max-h-full rounded-xl shadow-2xl" />
        </div>
      )}
    </>
  );
}

// ── Detail Modal ──────────────────────────────────────────────────────────────
function DetailModal({ row, onClose, staffList, isAdmin, viewerId, viewerName }: {
  row: BookingEditRow; onClose: () => void; staffList: StaffItem[];
  isAdmin: boolean; viewerId: number | null; viewerName: string;
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
    photoshopNote: row.photoshop_note ?? "",
    extraRetouchPrice: String(row.extra_retouch_price ?? ""),
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["photoshop-booking-view"] });
    qc.invalidateQueries({ queryKey: ["photoshop-stats"] });
  };

  // Parsed booking data
  const bookingItemsRaw = parseJson<unknown>(row.booking_items);
  const bookingItems: BookingItem[] = Array.isArray(bookingItemsRaw) ? bookingItemsRaw as BookingItem[] : [];
  const surchargesRaw = parseJson<unknown>(row.booking_surcharges);
  const surcharges: BookingSurcharge[] = Array.isArray(surchargesRaw) ? surchargesRaw as BookingSurcharge[] : [];
  const assignedStaffRaw = parseJson<unknown>(row.booking_assigned_staff);
  const assignedStaff: AssignedStaffItem[] = Array.isArray(assignedStaffRaw) ? assignedStaffRaw as AssignedStaffItem[] : [];

  const getStaffDisplayName = (s: AssignedStaffItem) => s.staffName || s.name || "";
  const photographer = assignedStaff.find(s => ["photographer", "photo", "Photographer"].includes(s.role ?? ""));
  const makeupArtist = assignedStaff.find(s => ["makeup", "Makeup", "makeup_artist"].includes(s.role ?? ""));

  const allConceptImages = bookingItems.flatMap(item => item.conceptImages ?? []);

  const included = row.included_retouched_photos_snapshot ?? 0;
  const doneNum = Number(form.donePhotos) || 0;
  const extraCount = Math.max(0, doneNum - included);
  const extraPrice = Number(form.extraRetouchPrice) || 0;
  const extraTotal = extraCount * extraPrice;

  const pct = Number(form.totalPhotos) > 0
    ? Math.round((doneNum / Number(form.totalPhotos)) * 100) : 0;

  const urgency = getCardUrgency(row);
  const headerBg = urgency === "red" ? "bg-red-50 dark:bg-red-900/20"
    : urgency === "yellow" ? "bg-amber-50 dark:bg-amber-900/20"
    : urgency === "done" ? "bg-emerald-50 dark:bg-emerald-900/20"
    : urgency === "paused" ? "bg-purple-50 dark:bg-purple-900/20"
    : "bg-muted/30";

  const dlDaysInternal = form.internalDeadline ? daysLeft(form.internalDeadline) : null;
  const dlColorInternal = (() => {
    if (!form.internalDeadline) return "";
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = Math.ceil((new Date(form.internalDeadline).getTime() - today.getTime()) / 86400000);
    return days < 0 ? "text-red-600 font-semibold" : days <= 3 ? "text-amber-600 font-semibold" : "text-foreground";
  })();

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
        if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || "Lỗi nhận việc"); }
      } else {
        const r = await fetchAuth(`${BASE}/api/photoshop-jobs/${row.job_id}`, {
          method: "PUT",
          body: JSON.stringify({
            assignedStaffId: viewerId, assignedStaffName: viewerName,
            status: "dang_xu_ly", receivedFileDate: new Date().toISOString().split("T")[0],
          }),
        });
        if (!r.ok) throw new Error("Lỗi nhận việc");
      }
      invalidate(); onClose();
    } catch (e) { setErr(String(e instanceof Error ? e.message : e)); }
    finally { setSaving(false); }
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
        totalPhotos: total, donePhotos: done, progressPercent: progress,
        receivedFileDate: form.receivedFileDate,
        internalDeadline: form.internalDeadline,
        customerDeadline: form.customerDeadline,
        notes: form.notes,
        photoshopNote: form.photoshopNote,
        extraRetouchPrice: Number(form.extraRetouchPrice) || 0,
        ...(isAdmin ? { assignedStaffId: staffId, assignedStaffName: staffName } : {}),
        ...extraFields,
      };

      if (row.job_id) {
        const r = await fetchAuth(`${BASE}/api/photoshop-jobs/${row.job_id}`, { method: "PUT", body: JSON.stringify(payload) });
        if (!r.ok) throw new Error("Lỗi lưu");
      } else {
        const r = await fetchAuth(`${BASE}/api/photoshop-jobs`, {
          method: "POST",
          body: JSON.stringify({
            bookingId: row.booking_id, customerName: row.customer_name,
            customerPhone: row.customer_phone, serviceName: row.service_label || row.package_type,
            shootDate: row.shoot_date, ...payload,
          }),
        });
        if (!r.ok) throw new Error("Lỗi tạo job");
      }
      invalidate(); onClose();
    } catch (e) { setErr(String(e instanceof Error ? e.message : e)); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-background rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[95vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className={`px-4 pt-4 pb-3 rounded-t-2xl ${headerBg}`}>
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
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                ${row.status === "hoan_thanh" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40"
                : row.status === "tam_hoan" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40"
                : row.status === "dang_xu_ly" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40"
                : "bg-slate-100 text-slate-600 dark:bg-slate-800"}`}>
                {STATUS_LABEL[row.status] || row.status}
              </span>
            )}
          </div>
        </div>

        <div className="p-3 space-y-3">

          {/* Nhận việc */}
          {isUnassigned(row) && !saving && (
            <button onClick={claimJob} disabled={saving}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2">
              <UserCheck size={16} />
              {viewerName ? `Tôi nhận việc này (${viewerName})` : "Nhận việc"}
            </button>
          )}
          {err && <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{err}</div>}

          {/* Section 1: Thông tin đơn */}
          <Section icon={Package} title="📦 Thông tin đơn" defaultOpen={true}>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Mã đơn</div>
                <div className="font-medium">{row.order_code || "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Gói dịch vụ</div>
                <div className="font-medium">{row.service_label || row.package_type || "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Giá gói</div>
                <div className="font-medium">{formatVND(row.total_amount)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Ngày chụp</div>
                <div className="font-medium">{formatDate(row.shoot_date)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Ngày bắt đầu HK</div>
                <div className="font-medium">{formatDate(form.receivedFileDate) || "—"}</div>
              </div>
            </div>
          </Section>

          {/* Section 2: Nhân sự */}
          <Section icon={Users} title="👥 Nhân sự" defaultOpen={true}>
            {assignedStaff.length === 0 ? (
              <div className="text-xs text-muted-foreground italic">Chưa có nhân sự được giao</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {photographer && getStaffDisplayName(photographer) && (
                  <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/20 px-2.5 py-1.5 rounded-lg">
                    <Camera size={13} className="text-blue-500" />
                    <span className="text-xs font-medium">📷 {getStaffDisplayName(photographer)}</span>
                  </div>
                )}
                {makeupArtist && getStaffDisplayName(makeupArtist) && (
                  <div className="flex items-center gap-1.5 bg-pink-50 dark:bg-pink-900/20 px-2.5 py-1.5 rounded-lg">
                    <User size={13} className="text-pink-500" />
                    <span className="text-xs font-medium">💄 {getStaffDisplayName(makeupArtist)}</span>
                  </div>
                )}
                {assignedStaff.filter(s => s !== photographer && s !== makeupArtist).map((s, i) => (
                  <div key={i} className="flex items-center gap-1.5 bg-muted px-2.5 py-1.5 rounded-lg">
                    <User size={13} className="text-muted-foreground" />
                    <span className="text-xs font-medium">{getStaffDisplayName(s)} ({s.role})</span>
                  </div>
                ))}
              </div>
            )}
            {isAdmin && (
              <div className="mt-2">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Giao việc cho nhân viên HK</label>
                <select className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={form.assignedStaffId}
                  onChange={e => {
                    const found = staffList.find(s => String(s.id) === e.target.value);
                    setForm(f => ({ ...f, assignedStaffId: e.target.value, assignedStaffName: found?.name ?? "" }));
                  }}>
                  <option value="">— Chưa giao —</option>
                  {staffList.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                </select>
              </div>
            )}
          </Section>

          {/* Section 3: Sản phẩm phải giao */}
          <Section icon={FileText} title="📋 Sản phẩm phải giao" defaultOpen={true}>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Ảnh trong gói</span>
                <span className="font-medium">{included > 0 ? `${included} ảnh` : "—"}</span>
              </div>
              {bookingItems.map((item, i) => (
                <div key={i} className="rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs space-y-0.5">
                  <div className="font-medium">{item.label || item.serviceName || `Dịch vụ ${i + 1}`}</div>
                  {item.albumName && <div className="text-muted-foreground">Album: {item.albumName}</div>}
                  {item.rawFilesIncluded && <div className="text-muted-foreground">Có file gốc</div>}
                  {item.includedRetouchedPhotos != null && (
                    <div className="text-muted-foreground">Ảnh hậu kỳ: {item.includedRetouchedPhotos}</div>
                  )}
                </div>
              ))}
              {surcharges.length > 0 && (
                <div className="pt-1">
                  <div className="text-xs text-muted-foreground mb-1 font-medium">Phát sinh đã chốt</div>
                  {surcharges.map((s, i) => (
                    <div key={i} className="flex justify-between text-xs py-0.5">
                      <span className="text-muted-foreground">{s.label || `Phát sinh ${i + 1}`}{s.quantity && s.quantity > 1 ? ` ×${s.quantity}` : ""}</span>
                      <span className="font-medium">{formatVND(s.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Section>

          {/* Section 4: Concept tham khảo */}
          <Section icon={Palette} title="🎨 Concept tham khảo" defaultOpen={false}>
            {allConceptImages.length === 0 ? (
              <div className="text-xs text-muted-foreground italic">Chưa upload concept</div>
            ) : (
              <ConceptGallery images={allConceptImages} />
            )}
          </Section>

          {/* Section 5: Ảnh vượt gói + tính tiền */}
          <Section icon={Zap} title="⚡ Tiến độ & Ảnh vượt gói" defaultOpen={true}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Tổng số ảnh</label>
                <input type="number" min="0" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={form.totalPhotos} onChange={e => setForm(f => ({ ...f, totalPhotos: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Đã hậu kỳ xong</label>
                <input type="number" min="0" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={form.donePhotos} onChange={e => setForm(f => ({ ...f, donePhotos: e.target.value }))} />
              </div>
            </div>
            {Number(form.totalPhotos) > 0 && <ProgressBar percent={pct} />}

            <div className="mt-2 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 px-3 py-2.5 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Ảnh trong gói</span>
                <span className="font-medium">{included > 0 ? included : "—"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Ảnh đã làm</span>
                <span className="font-medium">{doneNum}</span>
              </div>
              {included > 0 && (
                <div className="flex justify-between text-sm font-semibold">
                  <span className={extraCount > 0 ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}>
                    Vượt gói
                  </span>
                  <span className={extraCount > 0 ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}>
                    {extraCount} ảnh
                  </span>
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Đơn giá / ảnh thêm (VND)</label>
                <input type="number" min="0" step="1000"
                  className="w-full rounded-lg border border-amber-300 dark:border-amber-700 bg-background px-3 py-2 text-sm"
                  value={form.extraRetouchPrice}
                  onChange={e => setForm(f => ({ ...f, extraRetouchPrice: e.target.value }))}
                  placeholder="0" />
              </div>
              {extraCount > 0 && extraPrice > 0 && (
                <div className="flex justify-between text-sm font-bold pt-0.5 border-t border-amber-200 dark:border-amber-800">
                  <span>Tổng phát sinh</span>
                  <span className="text-amber-700 dark:text-amber-400">{formatVND(extraTotal)}</span>
                </div>
              )}
            </div>
          </Section>

          {/* Section 6: Ghi chú */}
          <Section icon={MessageSquare} title="📝 Ghi chú" defaultOpen={true}>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Ghi chú khách hàng (sale nhập)</label>
              <div className="w-full rounded-lg border border-border bg-blue-50/60 dark:bg-blue-900/10 px-3 py-2 text-sm min-h-[44px] whitespace-pre-wrap">
                {row.booking_notes
                  ? <span className="text-muted-foreground">{row.booking_notes}</span>
                  : <span className="text-muted-foreground/50 italic">Không có ghi chú từ sale</span>
                }
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Ghi chú hậu kỳ</label>
              <textarea rows={2} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none"
                value={form.photoshopNote}
                onChange={e => setForm(f => ({ ...f, photoshopNote: e.target.value }))}
                placeholder="Ghi chú nội bộ cho hậu kỳ..." />
            </div>
          </Section>

          {/* Section 7: Deadlines */}
          <Section icon={Clock} title="⏱ Deadlines" defaultOpen={true}>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Ngày bắt đầu hậu kỳ</label>
              <input type="date" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={form.receivedFileDate} onChange={e => setForm(f => ({ ...f, receivedFileDate: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={`text-xs font-medium mb-1 block ${dlColorInternal || "text-muted-foreground"}`}>
                  Deadline nội bộ{dlDaysInternal ? ` (${dlDaysInternal})` : ""}
                </label>
                <input type="date" className={`w-full rounded-lg border bg-background px-3 py-2 text-sm
                  ${dlColorInternal.includes("red") ? "border-red-400" : dlColorInternal.includes("amber") ? "border-amber-400" : "border-border"}`}
                  value={form.internalDeadline} onChange={e => setForm(f => ({ ...f, internalDeadline: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Deadline khách{row.customer_deadline ? ` (${daysLeft(row.customer_deadline)})` : ""}
                </label>
                <input type="date" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={form.customerDeadline} onChange={e => setForm(f => ({ ...f, customerDeadline: e.target.value }))} />
              </div>
            </div>
          </Section>

          {/* Section 8: Hành động */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            {row.status !== "hoan_thanh" && row.status !== "tam_hoan" && (
              <button onClick={() => save({ status: "tam_hoan" })} disabled={saving}
                className="py-2.5 rounded-xl bg-purple-100 hover:bg-purple-200 text-purple-700 dark:bg-purple-900/30 dark:hover:bg-purple-900/50 dark:text-purple-300 font-semibold text-sm transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50">
                <PauseCircle size={15} />
                Tạm hoãn
              </button>
            )}
            {row.status === "tam_hoan" && (
              <button onClick={() => save({ status: "dang_xu_ly" })} disabled={saving}
                className="py-2.5 rounded-xl bg-blue-100 hover:bg-blue-200 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 font-semibold text-sm transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50">
                <PlayCircle size={15} />
                Tiếp tục làm
              </button>
            )}

            {row.status !== "hoan_thanh" && (
              <button onClick={() => save({ status: "hoan_thanh" })} disabled={saving}
                className="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50">
                <CheckCircle2 size={15} />
                Hoàn thành
              </button>
            )}

            <button onClick={() => save()} disabled={saving}
              className={`py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50
                ${row.status === "hoan_thanh" ? "col-span-2" : ""}`}>
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
    <button onClick={onClick}
      className={`w-full text-left rounded-xl border shadow-sm p-3 transition-all hover:shadow-md ${URGENCY_STYLE[urgency]}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-semibold text-sm truncate">{row.customer_name}</span>
            {isUnassigned(row) ? (
              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-900/40 font-medium">Chưa nhận</span>
            ) : row.status === "hoan_thanh" ? (
              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 font-medium">Hoàn thành</span>
            ) : row.status === "tam_hoan" ? (
              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/40 font-medium">Tạm hoãn</span>
            ) : (
              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 font-medium">
                {STATUS_LABEL[row.status ?? ""] || "Đang làm"}
              </span>
            )}
          </div>

          <div className="text-xs text-muted-foreground mb-1">
            {row.customer_phone} • {row.service_label || row.package_type || "—"}
          </div>

          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mb-2">
            <span className="flex items-center gap-1"><Camera size={10} />{formatDate(row.shoot_date)}</span>
            {row.internal_deadline && (
              <span className={`flex items-center gap-1 font-medium ${dlColor}`}>
                <Clock size={10} />{dlDays} ({formatDate(row.internal_deadline)})
              </span>
            )}
            {row.assigned_staff_name && (
              <span className="flex items-center gap-1"><User size={10} />{row.assigned_staff_name}</span>
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
  const [filterMonth, setFilterMonth] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterStaff, setFilterStaff] = useState("all");
  const [showFilters, setShowFilters] = useState(false);

  const { data: rows = [], isLoading } = useQuery<BookingEditRow[]>({
    queryKey: ["photoshop-booking-view"],
    queryFn: () => fetchAuth(`${BASE}/api/photoshop-jobs/booking-view`).then(r => r.ok ? r.json() : []),
    staleTime: 0,
  });

  const { data: stats } = useQuery<Stats>({
    queryKey: ["photoshop-stats"],
    queryFn: () => fetchAuth(`${BASE}/api/photoshop-jobs/my-stats`).then(r => r.ok ? r.json() : { myActive: 0, myDoneThisMonth: 0, backlog: 0 }),
    staleTime: 0,
  });

  const { data: staffList = [] } = useQuery<StaffItem[]>({
    queryKey: ["staff"],
    queryFn: () => fetchAuth(`${BASE}/api/staff`).then(r => r.ok ? r.json() : []).then((d: unknown) => Array.isArray(d) ? d : []),
    enabled: isAdmin,
  });

  const availableMonths = useMemo(() => {
    const months = new Set(rows.map(r => r.booking_created_at?.slice(0, 7)).filter(Boolean) as string[]);
    return Array.from(months).sort().reverse();
  }, [rows]);

  const staffsInData = useMemo(() => {
    const map = new Map<number, string>();
    rows.forEach(r => { if (r.assigned_staff_id && r.assigned_staff_name) map.set(r.assigned_staff_id, r.assigned_staff_name); });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [rows]);

  const filtered = useMemo(() => {
    let data = [...rows];

    if (tab === "all") {
      data = data.filter(r => r.status !== "hoan_thanh");
    } else if (tab === "mine") {
      data = data.filter(r => r.assigned_staff_id === viewer?.id);
    } else if (tab === "chua_nhan") {
      data = data.filter(r => isUnassigned(r));
    } else if (tab === "dang_xu_ly") {
      data = data.filter(r => r.status === "dang_xu_ly" || r.status === "cho_duyet");
    } else if (tab === "tam_hoan") {
      data = data.filter(r => r.status === "tam_hoan");
    } else if (tab === "hoan_thanh") {
      data = data.filter(r => r.status === "hoan_thanh");
    }

    if (filterMonth !== "all") {
      data = data.filter(r => r.booking_created_at?.slice(0, 7) === filterMonth);
    }
    if (filterStatus !== "all") {
      if (filterStatus === "chua_nhan") {
        data = data.filter(r => isUnassigned(r));
      } else {
        data = data.filter(r => r.status === filterStatus);
      }
    }
    if (filterStaff !== "all") {
      data = data.filter(r => String(r.assigned_staff_id) === filterStaff);
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

    data.sort((a, b) => sortPriority(a) - sortPriority(b));
    return data;
  }, [rows, tab, filterMonth, filterStatus, filterStaff, search, viewer?.id]);

  const activeFilterCount = [filterMonth, filterStatus, filterStaff].filter(f => f !== "all").length;

  const handleModalClose = () => {
    setSelected(null);
    qc.invalidateQueries({ queryKey: ["photoshop-booking-view"] });
    qc.invalidateQueries({ queryKey: ["photoshop-stats"] });
  };

  return (
    <div className="p-3 sm:p-4 max-w-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Tiến độ Hậu kỳ</h1>
          <p className="text-sm text-muted-foreground">Quản lý hậu kỳ theo đơn hàng</p>
        </div>
        <BarChart3 size={22} className="text-muted-foreground" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2.5">
        <StatCard label={isAdmin ? "Đang làm" : "Tôi đang làm"} value={stats?.myActive ?? 0} icon={UserCheck} color="blue" />
        <StatCard label="Xong tháng này" value={stats?.myDoneThisMonth ?? 0} icon={CheckCircle2} color="green" />
        <StatCard label="Đơn tồn" value={stats?.backlog ?? 0} icon={AlertTriangle} color="red" />
      </div>

      {/* Search + Filter toggle */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-background text-sm placeholder:text-muted-foreground"
            placeholder="Tìm tên khách, SĐT, ngày chụp..."
            value={search} onChange={e => setSearch(e.target.value)} />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-foreground">
              <X size={14} />
            </button>
          )}
        </div>
        <button onClick={() => setShowFilters(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-colors ${showFilters || activeFilterCount > 0 ? "bg-primary text-primary-foreground border-primary" : "border-border bg-background text-muted-foreground hover:text-foreground"}`}>
          <Filter size={14} />
          {activeFilterCount > 0 ? `Lọc (${activeFilterCount})` : "Lọc"}
        </button>
      </div>

      {/* Dropdown filters */}
      {showFilters && (
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground font-medium mb-1 block uppercase tracking-wide">Tháng phát sinh</label>
            <select className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
              value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
              <option value="all">Tháng phát sinh</option>
              {availableMonths.map(m => <option key={m} value={m}>{formatMonth(m)}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground font-medium mb-1 block uppercase tracking-wide">Trạng thái</label>
            <select className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
              value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="all">Mọi trạng thái</option>
              <option value="chua_nhan">Chưa nhận</option>
              <option value="dang_xu_ly">Đang làm</option>
              <option value="cho_duyet">Chờ duyệt</option>
              <option value="tam_hoan">Tạm hoãn</option>
              <option value="hoan_thanh">Hoàn thành</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground font-medium mb-1 block uppercase tracking-wide">Nhân viên</label>
            <select className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
              value={filterStaff} onChange={e => setFilterStaff(e.target.value)}>
              <option value="all">Mọi nhân viên</option>
              {staffsInData.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${tab === t.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
          <Loader2 size={20} className="animate-spin" /><span>Đang tải...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <CheckCircle2 size={36} className="mx-auto mb-2 opacity-30" />
          <div className="text-sm">Không có đơn hàng nào</div>
          {(search || activeFilterCount > 0) && <div className="text-xs mt-1 opacity-60">Thử xóa bộ lọc</div>}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground px-1">{filtered.length} đơn hàng</div>
          {filtered.map(row => (
            <BookingCard key={row.booking_id} row={row} onClick={() => setSelected(row)} />
          ))}
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <DetailModal row={selected} onClose={handleModalClose}
          staffList={staffList} isAdmin={isAdmin}
          viewerId={viewer?.id ?? null} viewerName={viewer?.name ?? ""} />
      )}
    </div>
  );
}
