import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  User, Phone, Mail, Calendar, Briefcase, Banknote,
  CheckCircle2, Clock, PlayCircle, XCircle, Lock, Camera,
  TrendingUp, Star, Shield, AlertCircle, Pencil,
} from "lucide-react";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { cn } from "@/lib/utils";
import StaffAvatar, { compressStaffAvatar } from "@/components/StaffAvatar";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const fetchJson = (url: string, opts?: RequestInit) =>
  fetch(`${BASE}${url}`, opts).then(r => { if (!r.ok) throw new Error("Lỗi"); return r.json(); });

const fmtVND = (v: number) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(v);

const fmtDate = (d?: string) => d
  ? new Date(d).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })
  : "—";

const ROLE_LABELS: Record<string, string> = {
  admin: "Quản lý", photographer: "Nhiếp ảnh", photo: "Nhiếp ảnh",
  makeup: "Trang điểm", sale: "Kinh doanh", photoshop: "Chỉnh sửa",
  assistant: "Hỗ trợ", marketing: "Marketing",
};

const COVER_GRADIENT: Record<string, string> = {
  admin:        "from-violet-500 via-purple-400 to-violet-200",
  photographer: "from-blue-500 via-indigo-400 to-blue-200",
  photo:        "from-blue-500 via-indigo-400 to-blue-200",
  makeup:       "from-pink-500 via-rose-400 to-pink-200",
  sale:         "from-orange-400 via-amber-300 to-orange-100",
  photoshop:    "from-teal-500 via-cyan-400 to-teal-200",
  assistant:    "from-slate-500 via-gray-400 to-slate-200",
  marketing:    "from-green-500 via-emerald-400 to-green-200",
};

interface ProfileData {
  staff: {
    id: number; name: string; phone: string; email?: string;
    joinDate?: string; isActive: boolean; status?: string;
    role: string; roles: string[]; notes?: string; avatar?: string;
  };
  monthStats: { total: number; completed: number; pending: number; inProgress: number; cancelled: number };
  earnings: { thisMonth: number; today: number; total: number };
}

interface MetricsData {
  month: number; year: number;
  jobs: { total: number; completed: number; pending: number; inProgress: number; cancelled: number };
  earnings: { thisMonth: number; byWeek: Array<{ week: string; amount: number }> };
}

interface KpiData {
  overallScore: number;
  overallStatus: "green" | "yellow" | "red";
  metrics: Array<{ metric: string; target: number; actual: number; score: number; status: "green" | "yellow" | "red"; bonusAmount: number }>;
}

const KPI_COLOR = { green: "text-emerald-600", yellow: "text-amber-500", red: "text-red-500" };
const KPI_BG = { green: "bg-emerald-100", yellow: "bg-amber-100", red: "bg-red-100" };
const KPI_BAR = { green: "bg-emerald-500", yellow: "bg-amber-400", red: "bg-red-400" };
const KPI_METRIC: Record<string, string> = { jobs_count: "Số công việc hoàn thành", earnings: "Thu nhập" };

export default function MyProfilePage() {
  const { viewer, token, isAdmin } = useStaffAuth();
  const qc = useQueryClient();
  const [pwDialog, setPwDialog] = useState(false);
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [pwError, setPwError] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [imgError, setImgError] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const authHeader = { Authorization: `Bearer ${token ?? ""}` };

  const { data: profile, isLoading } = useQuery<ProfileData>({
    queryKey: ["my-profile"],
    queryFn: () => fetchJson("/api/staff/me/profile", { headers: authHeader }),
    enabled: !!token,
  });

  const now = new Date();
  const { data: metrics } = useQuery<MetricsData>({
    queryKey: ["my-metrics", now.getMonth() + 1, now.getFullYear()],
    queryFn: () => fetchJson(`/api/staff/me/metrics?month=${now.getMonth() + 1}&year=${now.getFullYear()}`, { headers: authHeader }),
    enabled: !!token,
  });

  const { data: kpi } = useQuery<KpiData>({
    queryKey: ["my-kpi", now.getMonth() + 1, now.getFullYear()],
    queryFn: () => fetchJson(`/api/staff/me/kpi?month=${now.getMonth() + 1}&year=${now.getFullYear()}`, { headers: authHeader }),
    enabled: !!token,
  });

  const changePw = useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) =>
      fetchJson("/api/staff/me/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify(data),
      }),
    onSuccess: () => { setPwDialog(false); setPwForm({ current: "", next: "", confirm: "" }); setPwError(""); },
    onError: (e: Error) => setPwError(e.message || "Đổi mật khẩu thất bại"),
  });

  const handlePwSubmit = () => {
    setPwError("");
    if (!pwForm.next || pwForm.next.length < 4) { setPwError("Mật khẩu mới phải có ít nhất 4 ký tự"); return; }
    if (pwForm.next !== pwForm.confirm) { setPwError("Xác nhận mật khẩu không khớp"); return; }
    changePw.mutate({ currentPassword: pwForm.current, newPassword: pwForm.next });
  };

  const handleAvatarUpload = async (file: File) => {
    if (!viewer) return;
    setAvatarUploading(true);
    try {
      const b64 = await compressStaffAvatar(file);
      await fetchJson(`/api/staff/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ avatar: b64 }),
      });
      qc.invalidateQueries({ queryKey: ["my-profile"] });
      qc.invalidateQueries({ queryKey: ["staff"] });
      setImgError(false);
    } finally { setAvatarUploading(false); }
  };

  if (!viewer) return null;
  if (isLoading) return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );

  const staff = profile?.staff;
  const rolesDisplay = staff
    ? [staff.role, ...(staff.roles || [])].filter((r, i, a) => a.indexOf(r) === i).filter(Boolean)
    : [viewer.role];
  const mainRole = rolesDisplay[0] || "assistant";
  const avatarUrl = !imgError ? (staff?.avatar ?? viewer.avatar) : undefined;
  const joinDate = staff?.joinDate;

  const monthJobStats = metrics?.jobs ?? profile?.monthStats;
  const monthEarnings = metrics?.earnings.thisMonth ?? profile?.earnings.thisMonth ?? 0;
  const byWeek = metrics?.earnings.byWeek ?? [];

  const monthNames = ["Tháng 1","Tháng 2","Tháng 3","Tháng 4","Tháng 5","Tháng 6","Tháng 7","Tháng 8","Tháng 9","Tháng 10","Tháng 11","Tháng 12"];
  const currentMonthLabel = monthNames[now.getMonth()];

  return (
    <div className="space-y-4 pb-10 max-w-3xl mx-auto">

      {/* ── Identity Card ──────────────────────────────────────────────────── */}
      <section className="bg-card border border-border rounded-2xl shadow-md overflow-hidden">
        {/* Cover gradient */}
        <div className={cn("h-24 sm:h-28 bg-gradient-to-br opacity-90", COVER_GRADIENT[mainRole] ?? "from-primary/60 via-primary/30 to-primary/10")} />

        <div className="px-5 pb-5">
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div className="relative flex-shrink-0 -mt-16 sm:-mt-20">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="block relative focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-full group"
                aria-label="Đổi ảnh đại diện"
              >
                <div className={cn(
                  "w-36 h-36 sm:w-44 sm:h-44 rounded-full overflow-hidden",
                  "ring-4 ring-white shadow-[0_8px_32px_rgba(0,0,0,0.18)]",
                  "border-2 border-primary/20",
                )}>
                  <StaffAvatar
                    name={viewer.name}
                    avatar={avatarUrl}
                    role={mainRole}
                    status={staff?.status ?? (staff?.isActive !== false ? "active" : "inactive")}
                    size="2xl"
                    editable={true}
                    onUpload={async (b64) => {
                      if (!viewer) return;
                      setAvatarUploading(true);
                      try {
                        await fetchJson(`/api/staff/me`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json", ...authHeader },
                          body: JSON.stringify({ avatar: b64 }),
                        });
                        qc.invalidateQueries({ queryKey: ["my-profile"] });
                        qc.invalidateQueries({ queryKey: ["staff"] });
                      } finally { setAvatarUploading(false); }
                    }}
                    uploading={avatarUploading}
                  />
                </div>
                {/* Camera hint */}
                <div className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/20 flex items-center justify-center transition-colors">
                  <Camera size={26} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </button>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 mt-4">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <h1 className="text-xl font-bold text-foreground leading-tight">{viewer.name}</h1>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {rolesDisplay.map(r => (
                      <span key={r} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                        {ROLE_LABELS[r] ?? r}
                      </span>
                    ))}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 shrink-0"
                  onClick={() => { setPwDialog(true); setPwError(""); }}
                >
                  <Lock className="w-3.5 h-3.5" /> Đổi mật khẩu
                </Button>
              </div>

              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 shrink-0" />
                  <span>{viewer.phone || staff?.phone || "—"}</span>
                </div>
                {(viewer.email || staff?.email) && (
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{viewer.email || staff?.email}</span>
                  </div>
                )}
                {joinDate && (
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 shrink-0" />
                    <span>Vào làm: {fmtDate(joinDate)}</span>
                  </div>
                )}
                {isAdmin && (
                  <div className="flex items-center gap-2">
                    <Shield className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                    <span className="text-emerald-700 font-medium">Quản trị viên</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Monthly Stats Cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Tổng buổi", value: monthJobStats?.total ?? 0, icon: Briefcase, color: "text-blue-600 bg-blue-50" },
          { label: "Hoàn thành", value: monthJobStats?.completed ?? 0, icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50" },
          { label: "Đang/chờ", value: (monthJobStats?.inProgress ?? 0) + (monthJobStats?.pending ?? 0), icon: Clock, color: "text-amber-600 bg-amber-50" },
          { label: "Thu nhập T.này", value: null, earningsVal: monthEarnings, icon: Banknote, color: "text-violet-600 bg-violet-50" },
        ].map((card) => (
          <div key={card.label} className="bg-card border border-border rounded-xl p-4 flex flex-col gap-2 shadow-sm">
            <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", card.color)}>
              <card.icon className="w-4.5 h-4.5" />
            </div>
            <p className="text-muted-foreground text-xs font-medium">{card.label}</p>
            <p className="text-xl font-bold text-foreground leading-none">
              {card.earningsVal !== undefined
                ? <span className="text-sm font-bold">{fmtVND(card.earningsVal)}</span>
                : card.value}
            </p>
          </div>
        ))}
      </div>

      {/* ── Earnings Chart ──────────────────────────────────────────────────── */}
      {byWeek.length > 0 && (
        <section className="bg-card border border-border rounded-2xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground mb-4">
            Thu nhập theo tuần — {currentMonthLabel}
          </h2>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={byWeek} margin={{ top: 0, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="week" tick={{ fontSize: 12 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
              />
              <Tooltip
                formatter={(v: number) => [fmtVND(v), "Thu nhập"]}
                labelFormatter={(l) => `Tuần ${l}`}
              />
              <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>
      )}

      {/* ── KPI Widget ─────────────────────────────────────────────────────── */}
      {kpi && kpi.metrics.length > 0 && (
        <section className="bg-card border border-border rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground">Điểm KPI — {currentMonthLabel}</h2>
            <div className={cn(
              "flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold",
              KPI_BG[kpi.overallStatus], KPI_COLOR[kpi.overallStatus]
            )}>
              <Star className="w-3.5 h-3.5" />
              {kpi.overallScore}/100
            </div>
          </div>

          <div className="space-y-3">
            {kpi.metrics.map((m, i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground font-medium">{KPI_METRIC[m.metric] ?? m.metric}</span>
                  <span className={cn("font-semibold", KPI_COLOR[m.status])}>
                    {m.actual} / {m.target} ({m.score}đ)
                  </span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", KPI_BAR[m.status])}
                    style={{ width: `${Math.min(m.score, 100)}%` }}
                  />
                </div>
                {m.bonusAmount > 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    Thưởng nếu đạt: {fmtVND(m.bonusAmount)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Change Password Dialog ──────────────────────────────────────────── */}
      <Dialog open={pwDialog} onOpenChange={setPwDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="w-4 h-4" /> Đổi mật khẩu
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Mật khẩu hiện tại</Label>
              <Input
                type="password"
                placeholder="Nhập mật khẩu hiện tại"
                value={pwForm.current}
                onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Mật khẩu mới</Label>
              <Input
                type="password"
                placeholder="Ít nhất 4 ký tự"
                value={pwForm.next}
                onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Xác nhận mật khẩu mới</Label>
              <Input
                type="password"
                placeholder="Nhập lại mật khẩu mới"
                value={pwForm.confirm}
                onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
                onKeyDown={e => e.key === "Enter" && handlePwSubmit()}
              />
            </div>
            {pwError && (
              <p className="text-sm text-destructive flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {pwError}
              </p>
            )}
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setPwDialog(false)}>Hủy</Button>
              <Button className="flex-1" onClick={handlePwSubmit} disabled={changePw.isPending}>
                {changePw.isPending ? "Đang lưu..." : "Lưu mật khẩu"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
