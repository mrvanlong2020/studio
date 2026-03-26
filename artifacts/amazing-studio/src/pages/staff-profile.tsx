import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ArrowLeft, Phone, Mail, Calendar, Briefcase, Star,
  CheckCircle2, Clock, XCircle, PlayCircle, Banknote, TrendingUp,
  FileText, Plus, ChevronRight, Lock, Pencil, AlertCircle,
  CalendarOff, ClipboardList, Shield,
} from "lucide-react";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { cn } from "@/lib/utils";
import StaffAvatar from "@/components/StaffAvatar";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const fetchJson = (url: string, opts?: RequestInit) =>
  fetch(`${BASE}${url}`, opts).then(r => { if (!r.ok) throw new Error("Lỗi"); return r.json(); });

const fmtVND = (v: number) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(v);

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });

// ─── Types ───────────────────────────────────────────────────────────────────

interface StaffData {
  id: number; name: string; phone: string; email?: string;
  joinDate?: string; isActive: boolean; staffType: string;
  role: string; roles: string[]; baseSalaryAmount: number;
  commissionRate: number; notes?: string;
}

interface JobEntry {
  id: number; shootDate: string; packageType?: string; serviceLabel?: string;
  status: string; totalAmount: number;
  customerName: string; customerPhone?: string;
  roles: string[]; roleTasks: Record<string, string>;
}

interface EarningsRecord {
  id: number; bookingId: number; role: string; serviceName: string;
  rate: number; earnedDate: string;
}

interface RateEntry {
  id: number; role: string; taskKey: string; taskName: string;
  rate: number | null; rateType: string;
}

interface LeaveRequest {
  id: number; staffId: number; startDate: string; endDate: string;
  reason: string; status: string; approvedByName?: string;
  reviewedAt?: string; notes?: string; createdAt: string;
}

interface InternalNotes {
  id: number; staffId: number; skillsStrong?: string;
  workNotes?: string; internalRating?: number; generalNotes?: string;
}

interface ProfileData {
  staff: StaffData;
  monthStats: { total: number; completed: number; pending: number; inProgress: number; cancelled: number };
  monthJobs: JobEntry[];
  todayJobs: JobEntry[];
  jobHistory: JobEntry[];
  earnings: { thisMonth: number; today: number; total: number; records: EarningsRecord[] };
  rates: RateEntry[];
  leaveRequests: LeaveRequest[];
  internalNotes: InternalNotes | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  admin: "Quản lý", photographer: "Nhiếp ảnh", photo: "Nhiếp ảnh",
  makeup: "Trang điểm", sale: "Kinh doanh",
  photoshop: "Chỉnh sửa", assistant: "Hỗ trợ", marketing: "Marketing",
  unknown: "Tham gia",
};

const ROLE_ICONS: Record<string, string> = {
  admin: "👑", photographer: "📷", photo: "📷",
  makeup: "💄", sale: "💼", photoshop: "🖥️", assistant: "🤝", marketing: "📣",
};

const STATUS_LABELS: Record<string, string> = {
  completed: "Hoàn thành", hoan_thanh: "Hoàn thành",
  pending: "Chờ xử lý", confirmed: "Đã xác nhận",
  in_progress: "Đang thực hiện", cancelled: "Đã hủy", huy: "Đã hủy",
};

const STATUS_COLORS: Record<string, string> = {
  completed: "text-emerald-700 bg-emerald-50 border-emerald-200",
  hoan_thanh: "text-emerald-700 bg-emerald-50 border-emerald-200",
  pending: "text-amber-700 bg-amber-50 border-amber-200",
  confirmed: "text-blue-700 bg-blue-50 border-blue-200",
  in_progress: "text-violet-700 bg-violet-50 border-violet-200",
  cancelled: "text-red-700 bg-red-50 border-red-200",
  huy: "text-red-700 bg-red-50 border-red-200",
};

const LEAVE_STATUS_LABELS: Record<string, string> = {
  pending: "Chờ duyệt", approved: "Đã duyệt", rejected: "Từ chối",
};

const LEAVE_STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
};

// ─── Main Component ────────────────────────────────────────────────────────────

export default function StaffProfilePage() {
  const { id } = useParams<{ id: string }>();
  const staffId = parseInt(id ?? "0");
  const [, navigate] = useLocation();
  const { viewer, isAdmin, canViewProfile } = useStaffAuth();
  const qc = useQueryClient();

  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [leaveSheet, setLeaveSheet] = useState(false);
  const [approveDialog, setApproveDialog] = useState<LeaveRequest | null>(null);
  const [notesSheet, setNotesSheet] = useState(false);
  const [notesForm, setNotesForm] = useState<Partial<InternalNotes>>({});
  const [jobDetailId, setJobDetailId] = useState<number | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  // Leave form
  const [leaveForm, setLeaveForm] = useState({ startDate: "", endDate: "", reason: "", notes: "" });

  const { data: profile, isLoading, error } = useQuery<ProfileData>({
    queryKey: ["staff-profile", staffId],
    queryFn: () => fetchJson(`/api/staff/${staffId}/profile`),
    enabled: !!staffId,
  });

  const createLeave = useMutation({
    mutationFn: (data: typeof leaveForm) =>
      fetchJson(`/api/staff/${staffId}/leave-requests`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff-profile", staffId] });
      setLeaveSheet(false);
      setLeaveForm({ startDate: "", endDate: "", reason: "", notes: "" });
    },
  });

  const updateLeave = useMutation({
    mutationFn: ({ leaveId, status, approvedByName }: { leaveId: number; status: string; approvedByName?: string }) =>
      fetchJson(`/api/leave-requests/${leaveId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, approvedByName }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff-profile", staffId] });
      setApproveDialog(null);
    },
  });

  const saveNotes = useMutation({
    mutationFn: (data: Partial<InternalNotes>) =>
      fetchJson(`/api/staff/${staffId}/internal-notes`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff-profile", staffId] });
      setNotesSheet(false);
    },
  });

  const handleAvatarUpload = async (base64: string) => {
    setAvatarUploading(true);
    try {
      await fetchJson(`/api/staff/${staffId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar: base64 }),
      });
      qc.invalidateQueries({ queryKey: ["staff-profile", staffId] });
      qc.invalidateQueries({ queryKey: ["staff"] });
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleAvatarDelete = async () => {
    setAvatarUploading(true);
    try {
      await fetchJson(`/api/staff/${staffId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar: null }),
      });
      qc.invalidateQueries({ queryKey: ["staff-profile", staffId] });
      qc.invalidateQueries({ queryKey: ["staff"] });
    } finally {
      setAvatarUploading(false);
    }
  };

  // ── Access control ─────────────────────────────────────────────────────────
  if (!viewer) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <Lock className="w-12 h-12 text-muted-foreground/40" />
        <h2 className="text-lg font-semibold">Chưa đăng nhập</h2>
        <p className="text-sm text-muted-foreground text-center max-w-xs">
          Vui lòng chọn tài khoản của bạn từ trang Nhân sự trước khi xem hồ sơ
        </p>
        <Button onClick={() => navigate("/staff")} variant="outline" className="gap-2">
          <ArrowLeft className="w-4 h-4" /> Về trang Nhân sự
        </Button>
      </div>
    );
  }

  if (!canViewProfile(staffId)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <Shield className="w-12 h-12 text-destructive/40" />
        <h2 className="text-lg font-semibold">Không có quyền truy cập</h2>
        <p className="text-sm text-muted-foreground text-center max-w-xs">
          Bạn chỉ được xem hồ sơ của chính mình
        </p>
        <Button onClick={() => navigate("/staff")} variant="outline" className="gap-2">
          <ArrowLeft className="w-4 h-4" /> Quay lại
        </Button>
      </div>
    );
  }

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );

  if (error || !profile) return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
      <AlertCircle className="w-10 h-10 text-destructive/50" />
      <p className="text-muted-foreground">Không tải được hồ sơ</p>
      <Button variant="outline" onClick={() => navigate("/staff")}>Quay lại</Button>
    </div>
  );

  const { staff, monthStats, monthJobs, todayJobs, jobHistory, earnings, rates, leaveRequests, internalNotes } = profile;

  // ── Filter jobs for active stat card ──────────────────────────────────────
  const filteredJobs = activeFilter ? monthJobs.filter(j => {
    const s = (j.status || "").toLowerCase();
    if (activeFilter === "completed") return s === "completed" || s === "hoan_thanh";
    if (activeFilter === "pending") return s === "pending" || s === "confirmed";
    if (activeFilter === "in_progress") return s === "in_progress";
    if (activeFilter === "cancelled") return s === "cancelled" || s === "huy";
    return true;
  }) : [];

  const jobDetail = jobDetailId != null ? jobHistory.find(j => j.id === jobDetailId) : null;

  const rolesDisplay = [staff.role, ...(staff.roles || [])].filter((r, i, a) => a.indexOf(r) === i).filter(Boolean);

  const staffStatus = (staff as Record<string, unknown>).status as string | undefined;
  const canEdit = isAdmin || viewer?.id === staffId;

  // Status config
  const statusCfg = {
    active:    { label: "Đang làm",  cls: "bg-emerald-100 text-emerald-700" },
    probation: { label: "Thử việc",  cls: "bg-amber-100 text-amber-700" },
    inactive:  { label: "Nghỉ việc", cls: "bg-red-100 text-red-700" },
  }[staffStatus || (staff.isActive ? "active" : "inactive")] ?? { label: "Đang làm", cls: "bg-emerald-100 text-emerald-700" };

  return (
    <div className="space-y-4 pb-10">
      {/* ── Back button ─────────────────────────────────────────────────── */}
      <button
        onClick={() => navigate("/staff")}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Về danh sách nhân sự
      </button>

      {/* ── A. IDENTITY CARD ─────────────────────────────────────────────── */}
      <section className="bg-card border border-border rounded-2xl overflow-hidden">
        {/* Top accent bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-primary/70 via-primary to-primary/50" />

        <div className="p-5 flex items-start gap-4">
          {/* Avatar */}
          <div className="flex-shrink-0 mt-0.5">
            <StaffAvatar
              name={staff.name}
              avatar={(staff as Record<string, unknown>).avatar as string | undefined}
              role={rolesDisplay[0]}
              status={staffStatus}
              isActive={staff.isActive}
              size="xl"
              editable={canEdit}
              onUpload={handleAvatarUpload}
              onDelete={handleAvatarDelete}
              uploading={avatarUploading}
            />
            {canEdit && (
              <p className="text-[10px] text-muted-foreground text-center mt-1.5 leading-tight">
                {(staff as Record<string, unknown>).avatar ? "Bấm để đổi ảnh" : "Bấm để thêm ảnh"}
              </p>
            )}
          </div>

          {/* Info right */}
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h1 className="text-xl font-bold tracking-tight leading-tight truncate">{staff.name}</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {staff.staffType === "official" ? "Chính thức" : "Cộng tác viên"}
                  {staff.joinDate ? ` · Vào ${fmtDate(staff.joinDate)}` : ""}
                </p>
              </div>
              <span className={cn("text-xs px-2.5 py-1 rounded-full font-medium shrink-0", statusCfg.cls)}>
                {statusCfg.label}
              </span>
            </div>

            {/* Role badges */}
            <div className="flex flex-wrap gap-1.5">
              {rolesDisplay.map(r => (
                <span key={r} className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary font-medium">
                  {ROLE_ICONS[r] || "•"} {ROLE_LABELS[r] || r}
                </span>
              ))}
            </div>

            {/* Contact info */}
            <div className="space-y-1 pt-0.5">
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{staff.phone || "—"}</span>
              </div>
              {staff.email && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{staff.email}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Briefcase className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{staff.staffType === "official" ? "Nhân viên chính thức" : "Freelancer / CTV"}</span>
              </div>
              {staff.joinDate && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>Vào làm {fmtDate(staff.joinDate)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── D. THU NHẬP HÔM NAY ─────────────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-3">
        <div className="bg-gradient-to-br from-violet-500 to-violet-600 rounded-2xl p-4 text-white">
          <p className="text-xs font-medium opacity-80 mb-1">Job hôm nay</p>
          <p className="text-3xl font-bold">{todayJobs.length}</p>
          <p className="text-xs opacity-70 mt-1">lịch chụp</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-4 text-white">
          <p className="text-xs font-medium opacity-80 mb-1">Thu nhập hôm nay</p>
          <p className="text-xl font-bold">{fmtVND(earnings.today)}</p>
          <p className="text-xs opacity-70 mt-1">từ job hoàn thành</p>
        </div>
      </section>

      {/* ── B. CÔNG VIỆC THÁNG NÀY ─────────────────────────────────────── */}
      <section className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <ClipboardList className="w-3.5 h-3.5" /> Công việc tháng này
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatCard
            label="Tổng job" value={monthStats.total} icon={<ClipboardList className="w-4 h-4" />}
            color="blue" active={activeFilter === "all"}
            onClick={() => setActiveFilter(activeFilter === "all" ? null : "all")}
          />
          <StatCard
            label="Hoàn thành" value={monthStats.completed} icon={<CheckCircle2 className="w-4 h-4" />}
            color="green" active={activeFilter === "completed"}
            onClick={() => setActiveFilter(activeFilter === "completed" ? null : "completed")}
          />
          <StatCard
            label="Chờ xử lý" value={monthStats.pending} icon={<Clock className="w-4 h-4" />}
            color="amber" active={activeFilter === "pending"}
            onClick={() => setActiveFilter(activeFilter === "pending" ? null : "pending")}
          />
          {monthStats.inProgress > 0 && (
            <StatCard
              label="Đang làm" value={monthStats.inProgress} icon={<PlayCircle className="w-4 h-4" />}
              color="violet" active={activeFilter === "in_progress"}
              onClick={() => setActiveFilter(activeFilter === "in_progress" ? null : "in_progress")}
            />
          )}
          {monthStats.cancelled > 0 && (
            <StatCard
              label="Đã hủy" value={monthStats.cancelled} icon={<XCircle className="w-4 h-4" />}
              color="red" active={activeFilter === "cancelled"}
              onClick={() => setActiveFilter(activeFilter === "cancelled" ? null : "cancelled")}
            />
          )}
        </div>

        {/* Filtered job list */}
        {activeFilter && (
          <div className="space-y-2 mt-2">
            <p className="text-xs font-medium text-muted-foreground">
              {filteredJobs.length} job {activeFilter === "all" ? "" : `– ${activeFilter === "completed" ? "Hoàn thành" : activeFilter === "pending" ? "Chờ xử lý" : activeFilter === "in_progress" ? "Đang làm" : "Đã hủy"}`}
            </p>
            {filteredJobs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Không có job nào</p>
            ) : filteredJobs.map(job => (
              <JobRow key={job.id} job={job} onClick={() => setJobDetailId(job.id)} />
            ))}
          </div>
        )}
      </section>

      {/* ── C. TIỀN LƯƠNG THÁNG NÀY ────────────────────────────────────── */}
      <section className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Banknote className="w-3.5 h-3.5" /> Tiền lương tháng này
        </p>
        <div className="bg-gradient-to-r from-primary/5 to-primary/10 rounded-xl p-4 border border-primary/20">
          <p className="text-sm text-muted-foreground">Tổng lương (job hoàn thành)</p>
          <p className="text-3xl font-bold text-primary mt-1">{fmtVND(earnings.thisMonth)}</p>
          {staff.baseSalaryAmount > 0 && (
            <div className="mt-3 pt-3 border-t border-primary/20 flex justify-between text-sm">
              <span className="text-muted-foreground">Lương cơ bản</span>
              <span className="font-medium">{fmtVND(staff.baseSalaryAmount)}</span>
            </div>
          )}
          {staff.commissionRate > 0 && (
            <div className="flex justify-between text-sm mt-1">
              <span className="text-muted-foreground">Hoa hồng</span>
              <span className="font-medium">{staff.commissionRate}%</span>
            </div>
          )}
        </div>
        {/* Earnings breakdown */}
        {earnings.records.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground font-medium">Chi tiết theo job:</p>
            {earnings.records.map(e => (
              <div key={e.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border/40 last:border-0">
                <div>
                  <span className="font-medium">{e.serviceName || "Job"}</span>
                  <span className="text-xs text-muted-foreground ml-2">{ROLE_LABELS[e.role] || e.role}</span>
                </div>
                <span className="font-semibold text-primary">{fmtVND(e.rate)}</span>
              </div>
            ))}
          </div>
        )}
        {earnings.records.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-2">Chưa có lương ghi nhận tháng này</p>
        )}
      </section>

      {/* ── E. LỊCH SỬ CÔNG VIỆC ────────────────────────────────────────── */}
      <section className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" /> Lịch sử công việc
          </p>
          <span className="text-xs text-muted-foreground">{jobHistory.length} job</span>
        </div>
        {jobHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Chưa có job nào</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {jobHistory.map(job => (
              <JobRow key={job.id} job={job} onClick={() => setJobDetailId(job.id)} />
            ))}
          </div>
        )}
      </section>

      {/* ── F. ĐƠN XIN NGHỈ ─────────────────────────────────────────────── */}
      <section className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <CalendarOff className="w-3.5 h-3.5" /> Đơn xin nghỉ
          </p>
          <button
            onClick={() => setLeaveSheet(true)}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary font-medium hover:bg-primary/20 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Tạo đơn
          </button>
        </div>
        {leaveRequests.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Chưa có đơn xin nghỉ nào</p>
        ) : (
          <div className="space-y-2.5">
            {leaveRequests.map(lr => (
              <div key={lr.id} className="border border-border rounded-xl p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">{fmtDate(lr.startDate)} → {fmtDate(lr.endDate)}</p>
                    <p className="text-xs text-muted-foreground">{lr.reason}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-semibold", LEAVE_STATUS_COLORS[lr.status])}>
                      {LEAVE_STATUS_LABELS[lr.status] ?? lr.status}
                    </span>
                    {isAdmin && lr.status === "pending" && (
                      <button
                        onClick={() => setApproveDialog(lr)}
                        className="text-[10px] text-primary underline"
                      >
                        Xét duyệt
                      </button>
                    )}
                  </div>
                </div>
                {lr.approvedByName && (
                  <p className="text-[10px] text-muted-foreground">
                    {lr.status === "approved" ? "✅ Duyệt bởi: " : "❌ Từ chối bởi: "}{lr.approvedByName}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── G. BẢNG GIÁ CÁ NHÂN ────────────────────────────────────────── */}
      <section className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5" /> Bảng giá cá nhân
        </p>
        {rates.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Chưa có bảng giá nào</p>
        ) : (
          <div className="space-y-4">
            {Object.entries(
              rates.reduce((acc, r) => {
                if (!acc[r.role]) acc[r.role] = [];
                acc[r.role].push(r);
                return acc;
              }, {} as Record<string, RateEntry[]>)
            ).map(([role, items]) => (
              <div key={role}>
                <p className="text-xs font-semibold text-muted-foreground mb-2">
                  {ROLE_ICONS[role] || "•"} {ROLE_LABELS[role] || role}
                </p>
                <div className="space-y-1.5">
                  {items.filter(r => r.rate !== null && r.rate !== undefined && r.rate! > 0).map(r => (
                    <div key={r.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border/40 last:border-0">
                      <span className="text-foreground/80">{r.taskName}</span>
                      <span className="font-semibold tabular-nums">
                        {r.rateType === "percent"
                          ? `${r.rate}%`
                          : fmtVND(r.rate ?? 0)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── H. GHI CHÚ NỘI BỘ (Admin only) ────────────────────────────── */}
      {isAdmin && (
        <section className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-violet-500" />
              <span className="text-violet-600">Ghi chú nội bộ</span>
              <span className="text-[9px] bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded font-bold">ADMIN</span>
            </p>
            <button
              onClick={() => {
                setNotesForm(internalNotes ?? {});
                setNotesSheet(true);
              }}
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-violet-50 text-violet-700 font-medium hover:bg-violet-100 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" /> Chỉnh sửa
            </button>
          </div>
          {internalNotes ? (
            <div className="space-y-3">
              {internalNotes.skillsStrong && (
                <NoteBlock label="Kỹ năng mạnh" value={internalNotes.skillsStrong} />
              )}
              {internalNotes.workNotes && (
                <NoteBlock label="Lưu ý làm việc" value={internalNotes.workNotes} />
              )}
              {internalNotes.internalRating && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Đánh giá nội bộ</p>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(s => (
                      <Star key={s} className={cn("w-5 h-5", s <= internalNotes.internalRating! ? "text-amber-400 fill-amber-400" : "text-muted-foreground/30")} />
                    ))}
                  </div>
                </div>
              )}
              {internalNotes.generalNotes && (
                <NoteBlock label="Ghi chú chung" value={internalNotes.generalNotes} />
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">Chưa có ghi chú nội bộ nào</p>
          )}
        </section>
      )}

      {/* ══ Sheets & Dialogs ══════════════════════════════════════════════════ */}

      {/* Tạo đơn xin nghỉ */}
      <Sheet open={leaveSheet} onOpenChange={setLeaveSheet}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[90vh] overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>Tạo đơn xin nghỉ</SheetTitle>
          </SheetHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Ngày bắt đầu</Label>
                <Input type="date" value={leaveForm.startDate} onChange={e => setLeaveForm(f => ({ ...f, startDate: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Ngày kết thúc</Label>
                <Input type="date" value={leaveForm.endDate} onChange={e => setLeaveForm(f => ({ ...f, endDate: e.target.value }))} className="mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Lý do xin nghỉ *</Label>
              <Textarea rows={3} placeholder="Nhập lý do..." value={leaveForm.reason} onChange={e => setLeaveForm(f => ({ ...f, reason: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Ghi chú thêm</Label>
              <Textarea rows={2} placeholder="(tuỳ chọn)" value={leaveForm.notes} onChange={e => setLeaveForm(f => ({ ...f, notes: e.target.value }))} className="mt-1" />
            </div>
            <Button
              className="w-full"
              disabled={!leaveForm.startDate || !leaveForm.endDate || !leaveForm.reason.trim() || createLeave.isPending}
              onClick={() => createLeave.mutate(leaveForm)}
            >
              {createLeave.isPending ? "Đang gửi..." : "Gửi đơn xin nghỉ"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Xét duyệt đơn (Admin) */}
      <Dialog open={!!approveDialog} onOpenChange={() => setApproveDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Xét duyệt đơn xin nghỉ</DialogTitle>
          </DialogHeader>
          {approveDialog && (
            <div className="space-y-4">
              <div className="bg-muted/30 rounded-xl p-3 space-y-1">
                <p className="text-sm font-medium">{fmtDate(approveDialog.startDate)} → {fmtDate(approveDialog.endDate)}</p>
                <p className="text-sm text-muted-foreground">{approveDialog.reason}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline" className="flex-1 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                  disabled={updateLeave.isPending}
                  onClick={() => updateLeave.mutate({ leaveId: approveDialog.id, status: "approved", approvedByName: viewer?.name })}
                >
                  ✅ Duyệt
                </Button>
                <Button
                  variant="outline" className="flex-1 text-red-700 border-red-200 hover:bg-red-50"
                  disabled={updateLeave.isPending}
                  onClick={() => updateLeave.mutate({ leaveId: approveDialog.id, status: "rejected", approvedByName: viewer?.name })}
                >
                  ❌ Từ chối
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Ghi chú nội bộ (Admin) */}
      <Sheet open={notesSheet} onOpenChange={setNotesSheet}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[90vh] overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>Ghi chú nội bộ — {staff.name}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Kỹ năng mạnh</Label>
              <Textarea rows={2} placeholder="Ví dụ: Chụp phóng sự đám cưới, makeup tân cô dâu..." value={notesForm.skillsStrong ?? ""} onChange={e => setNotesForm(f => ({ ...f, skillsStrong: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Lưu ý làm việc</Label>
              <Textarea rows={2} placeholder="Ví dụ: Cần nhắc nhở đúng giờ, không làm việc nhóm tốt..." value={notesForm.workNotes ?? ""} onChange={e => setNotesForm(f => ({ ...f, workNotes: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Đánh giá nội bộ (1–5 sao)</Label>
              <div className="flex gap-2 mt-2">
                {[1, 2, 3, 4, 5].map(s => (
                  <button key={s} type="button" onClick={() => setNotesForm(f => ({ ...f, internalRating: s }))}>
                    <Star className={cn("w-7 h-7 transition-colors", s <= (notesForm.internalRating ?? 0) ? "text-amber-400 fill-amber-400" : "text-muted-foreground/30 hover:text-amber-300")} />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs">Ghi chú chung</Label>
              <Textarea rows={3} placeholder="Ghi chú khác..." value={notesForm.generalNotes ?? ""} onChange={e => setNotesForm(f => ({ ...f, generalNotes: e.target.value }))} className="mt-1" />
            </div>
            <Button
              className="w-full"
              disabled={saveNotes.isPending}
              onClick={() => saveNotes.mutate(notesForm)}
            >
              {saveNotes.isPending ? "Đang lưu..." : "Lưu ghi chú"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Chi tiết job */}
      <Sheet open={!!jobDetailId} onOpenChange={v => !v && setJobDetailId(null)}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader className="mb-4">
            <SheetTitle>Chi tiết job</SheetTitle>
          </SheetHeader>
          {jobDetail && (
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold">{jobDetail.customerName}</p>
                  {jobDetail.customerPhone && <p className="text-sm text-muted-foreground">{jobDetail.customerPhone}</p>}
                </div>
                <span className={cn("text-xs px-2.5 py-1 rounded-full border font-medium", STATUS_COLORS[jobDetail.status] ?? "bg-muted text-muted-foreground")}>
                  {STATUS_LABELS[jobDetail.status] ?? jobDetail.status}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Ngày chụp</p>
                  <p className="font-medium">{fmtDate(jobDetail.shootDate)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Dịch vụ</p>
                  <p className="font-medium">{jobDetail.serviceLabel || jobDetail.packageType || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Vai trò</p>
                  <p className="font-medium">{jobDetail.roles.map(r => ROLE_LABELS[r] || r).join(", ") || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Tổng đơn</p>
                  <p className="font-medium">{fmtVND(jobDetail.totalAmount)}</p>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground flex items-center gap-1">{icon} {label}</p>
      <p className="text-sm font-medium truncate">{value || "—"}</p>
    </div>
  );
}

function StatCard({
  label, value, icon, color, active, onClick,
}: {
  label: string; value: number; icon: React.ReactNode;
  color: "blue" | "green" | "amber" | "violet" | "red";
  active: boolean; onClick: () => void;
}) {
  const colors = {
    blue: "bg-blue-50 border-blue-200 text-blue-700",
    green: "bg-emerald-50 border-emerald-200 text-emerald-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    violet: "bg-violet-50 border-violet-200 text-violet-700",
    red: "bg-red-50 border-red-200 text-red-700",
  };
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col gap-1.5 p-3 rounded-xl border transition-all text-left",
        colors[color],
        active ? "ring-2 ring-current ring-offset-1 shadow-sm" : "hover:opacity-90"
      )}
    >
      <div className="flex items-center justify-between">
        {icon}
        <ChevronRight className={cn("w-3.5 h-3.5 transition-transform", active ? "rotate-90" : "")} />
      </div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-[10px] font-medium opacity-80">{label}</p>
    </button>
  );
}

function JobRow({ job, onClick }: { job: JobEntry; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-muted/30 transition-colors text-left"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium truncate">{job.customerName}</p>
          <span className={cn("text-[10px] px-2 py-0.5 rounded-full border font-medium flex-shrink-0", STATUS_COLORS[job.status] ?? "bg-muted text-muted-foreground border-border")}>
            {STATUS_LABELS[job.status] ?? job.status}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground">{fmtDate(job.shootDate)}</span>
          <span className="text-xs text-muted-foreground">•</span>
          <span className="text-xs text-muted-foreground truncate">{job.serviceLabel || job.packageType || "—"}</span>
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-xs text-muted-foreground">{job.roles.map(r => ROLE_LABELS[r] || r).join(", ")}</p>
        <ChevronRight className="w-4 h-4 text-muted-foreground mt-1 ml-auto" />
      </div>
    </button>
  );
}

function NoteBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-sm bg-muted/30 rounded-lg p-2.5">{value}</p>
    </div>
  );
}
