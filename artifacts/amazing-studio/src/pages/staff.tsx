import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatVND, formatDate } from "@/lib/utils";
import {
  Button, Input, Select, Textarea, Dialog, DialogContent, DialogHeader, DialogTitle,
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@/components/ui";
import {
  Users, Plus, Edit, Trash2, Phone, Mail, Calendar, Award, TrendingUp,
  CheckCircle, AlertCircle, DollarSign, Briefcase, ChevronRight, Star,
  Settings, ListChecks, BarChart2, X,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function fetchJson<T = unknown>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) {
    let msg = `Lỗi ${res.status}`;
    try { const j = await res.json(); msg = j.error ?? j.message ?? msg; } catch { /* */ }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const ROLES = [
  { key: "sale", label: "Kinh doanh", color: "bg-green-100 text-green-700", emoji: "💼" },
  { key: "photographer", label: "Nhiếp ảnh", color: "bg-blue-100 text-blue-700", emoji: "📷" },
  { key: "makeup", label: "Trang điểm", color: "bg-pink-100 text-pink-700", emoji: "💄" },
  { key: "photoshop", label: "Chỉnh sửa", color: "bg-purple-100 text-purple-700", emoji: "🖥️" },
  { key: "marketing", label: "Marketing", color: "bg-orange-100 text-orange-700", emoji: "📣" },
] as const;

type RoleKey = typeof ROLES[number]["key"];

const ROLE_MAP = Object.fromEntries(ROLES.map(r => [r.key, r])) as Record<RoleKey, typeof ROLES[number]>;

type Staff = {
  id: number; name: string; phone: string; email?: string; avatar?: string;
  role: string; roles: string[]; baseSalaryAmount: number; salary?: number;
  salaryType: string; joinDate: string; isActive: boolean; notes?: string;
  earningsSummary?: { totalJobs: number; totalEarned: number; monthJobs: number; monthEarned: number; todayEarned: number };
};

type SalaryRate = {
  id: number; serviceKey: string; serviceName: string; role: string; rate: number; notes?: string;
};

type JobEarning = {
  id: number; bookingId: number; staffId: number; staffName: string; role: string;
  serviceKey: string; serviceName: string; rate: number; earnedDate: string;
  month: number; year: number; status: string; bookingCode?: string;
};

type SalaryOverride = {
  id: number; staffId: number; staffName: string; serviceKey: string; role: string; rate: number; notes?: string;
};

const EMPTY_STAFF_FORM = {
  name: "", phone: "", email: "", roles: [] as string[], baseSalaryAmount: "", joinDate: new Date().toISOString().slice(0, 10), isActive: true, notes: "",
};

const EMPTY_RATE_FORM = {
  serviceKey: "", serviceName: "", role: "photographer", rate: "", notes: "",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function RoleBadge({ roleKey }: { roleKey: string }) {
  const r = ROLE_MAP[roleKey as RoleKey];
  if (!r) return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{roleKey}</span>;
  return <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${r.color}`}>{r.emoji} {r.label}</span>;
}

function StaffAvatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "w-8 h-8 text-xs", md: "w-10 h-10 text-sm", lg: "w-14 h-14 text-xl" };
  return (
    <div className={`${sizes[size]} rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center text-primary font-bold flex-shrink-0`}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

export default function StaffPage() {
  const qc = useQueryClient();
  const now = new Date();
  const [activeTab, setActiveTab] = useState("hr");
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(null);
  const [earningsMonth, setEarningsMonth] = useState(now.getMonth() + 1);
  const [earningsYear, setEarningsYear] = useState(now.getFullYear());

  // Staff form
  const [isStaffOpen, setIsStaffOpen] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState<number | null>(null);
  const [staffForm, setStaffForm] = useState({ ...EMPTY_STAFF_FORM });
  const [staffError, setStaffError] = useState("");

  // Rate form
  const [isRateOpen, setIsRateOpen] = useState(false);
  const [editingRateId, setEditingRateId] = useState<number | null>(null);
  const [rateForm, setRateForm] = useState({ ...EMPTY_RATE_FORM });

  // Override form
  const [isOverrideOpen, setIsOverrideOpen] = useState(false);
  const [overrideForm, setOverrideForm] = useState({ staffId: "", serviceKey: "", role: "photographer", rate: "", notes: "" });

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: staff = [], isLoading: loadingStaff } = useQuery<Staff[]>({
    queryKey: ["staff"],
    queryFn: () => fetchJson<Staff[]>("/api/staff"),
  });

  const { data: salaryRates = [] } = useQuery<SalaryRate[]>({
    queryKey: ["salary-rates"],
    queryFn: () => fetchJson<SalaryRate[]>("/api/salary-rates"),
  });

  const { data: jobEarnings = [] } = useQuery<JobEarning[]>({
    queryKey: ["job-earnings", earningsMonth, earningsYear, selectedStaffId],
    queryFn: () => {
      const params = new URLSearchParams({ month: String(earningsMonth), year: String(earningsYear) });
      if (selectedStaffId) params.set("staffId", String(selectedStaffId));
      return fetchJson<JobEarning[]>(`/api/job-earnings?${params}`);
    },
  });

  const { data: overrides = [] } = useQuery<SalaryOverride[]>({
    queryKey: ["salary-overrides", selectedStaffId],
    queryFn: () => {
      const params = selectedStaffId ? `?staffId=${selectedStaffId}` : "";
      return fetchJson<SalaryOverride[]>(`/api/salary-overrides${params}`);
    },
  });

  // ── Staff mutations ────────────────────────────────────────────────────────
  const createStaff = useMutation({
    mutationFn: (d: typeof staffForm) => fetchJson<Staff>("/api/staff", { method: "POST", body: JSON.stringify({ ...d, baseSalaryAmount: parseFloat(d.baseSalaryAmount || "0") }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["staff"] }); setIsStaffOpen(false); setStaffForm({ ...EMPTY_STAFF_FORM }); },
    onError: (e: Error) => setStaffError(e.message),
  });

  const updateStaff = useMutation({
    mutationFn: ({ id, d }: { id: number; d: typeof staffForm }) =>
      fetchJson<Staff>(`/api/staff/${id}`, { method: "PUT", body: JSON.stringify({ ...d, baseSalaryAmount: parseFloat(d.baseSalaryAmount || "0") }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["staff"] }); setIsStaffOpen(false); },
    onError: (e: Error) => setStaffError(e.message),
  });

  const deleteStaff = useMutation({
    mutationFn: (id: number) => fetch(`${BASE}/api/staff/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["staff"] }); if (selectedStaffId === editingStaffId) setSelectedStaffId(null); },
  });

  // ── Rate mutations ─────────────────────────────────────────────────────────
  const createRate = useMutation({
    mutationFn: (d: typeof rateForm) => fetchJson<SalaryRate>("/api/salary-rates", { method: "POST", body: JSON.stringify({ ...d, rate: parseFloat(d.rate || "0") }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["salary-rates"] }); setIsRateOpen(false); setRateForm({ ...EMPTY_RATE_FORM }); },
  });

  const updateRate = useMutation({
    mutationFn: ({ id, d }: { id: number; d: typeof rateForm }) =>
      fetchJson<SalaryRate>(`/api/salary-rates/${id}`, { method: "PUT", body: JSON.stringify({ ...d, rate: parseFloat(d.rate || "0") }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["salary-rates"] }); setIsRateOpen(false); },
  });

  const deleteRate = useMutation({
    mutationFn: (id: number) => fetch(`${BASE}/api/salary-rates/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["salary-rates"] }),
  });

  // ── Override mutation ──────────────────────────────────────────────────────
  const createOverride = useMutation({
    mutationFn: (d: typeof overrideForm) =>
      fetchJson<SalaryOverride>("/api/salary-overrides", { method: "POST", body: JSON.stringify({ ...d, staffId: parseInt(d.staffId), rate: parseFloat(d.rate || "0") }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["salary-overrides", selectedStaffId] }); setIsOverrideOpen(false); },
  });

  const deleteOverride = useMutation({
    mutationFn: (id: number) => fetch(`${BASE}/api/salary-overrides/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["salary-overrides", selectedStaffId] }),
  });

  const markEarningPaid = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      fetchJson(`/api/job-earnings/${id}`, { method: "PUT", body: JSON.stringify({ status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["job-earnings"] }),
  });

  // ── Form helpers ───────────────────────────────────────────────────────────
  const openCreateStaff = () => {
    setStaffForm({ ...EMPTY_STAFF_FORM });
    setEditingStaffId(null);
    setStaffError("");
    setIsStaffOpen(true);
  };

  const openEditStaff = (s: Staff) => {
    setStaffForm({
      name: s.name, phone: s.phone, email: s.email || "", roles: s.roles || [],
      baseSalaryAmount: String(s.baseSalaryAmount || ""), joinDate: s.joinDate, isActive: s.isActive, notes: s.notes || "",
    });
    setEditingStaffId(s.id);
    setStaffError("");
    setIsStaffOpen(true);
  };

  const toggleRole = (key: string) => {
    setStaffForm(f => ({
      ...f,
      roles: f.roles.includes(key) ? f.roles.filter(r => r !== key) : [...f.roles, key],
    }));
  };

  const handleSubmitStaff = () => {
    setStaffError("");
    if (!staffForm.name.trim()) { setStaffError("Vui lòng nhập họ tên"); return; }
    if (!staffForm.phone.trim()) { setStaffError("Vui lòng nhập số điện thoại"); return; }
    if (staffForm.roles.length === 0) { setStaffError("Vui lòng chọn ít nhất 1 vai trò"); return; }
    if (editingStaffId) updateStaff.mutate({ id: editingStaffId, d: staffForm });
    else createStaff.mutate(staffForm);
  };

  // ── Salary rates grouped by serviceKey ────────────────────────────────────
  const ratesByService = useMemo(() => {
    const map: Record<string, { serviceName: string; rates: Record<string, number>; ids: Record<string, number> }> = {};
    for (const r of salaryRates) {
      if (!map[r.serviceKey]) map[r.serviceKey] = { serviceName: r.serviceName, rates: {}, ids: {} };
      map[r.serviceKey].rates[r.role] = r.rate;
      map[r.serviceKey].ids[r.role] = r.id;
    }
    return map;
  }, [salaryRates]);

  // ── Earnings summary ───────────────────────────────────────────────────────
  const earningsByStaff = useMemo(() => {
    const map: Record<number, { staffId: number; staffName: string; total: number; jobCount: number; earnings: JobEarning[] }> = {};
    for (const e of jobEarnings) {
      if (!map[e.staffId]) map[e.staffId] = { staffId: e.staffId, staffName: e.staffName, total: 0, jobCount: 0, earnings: [] };
      map[e.staffId].total += e.rate;
      map[e.staffId].jobCount++;
      map[e.staffId].earnings.push(e);
    }
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [jobEarnings]);

  const selectedStaff = staff.find(s => s.id === selectedStaffId);

  const isSavingStaff = createStaff.isPending || updateStaff.isPending;
  const isSavingRate = createRate.isPending || updateRate.isPending;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold">Nhân sự & Lương</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Quản lý đội ngũ, phân công vai trò và tính lương tự động</p>
        </div>
        {activeTab === "hr" && (
          <Button onClick={openCreateStaff} className="gap-2"><Plus className="w-4 h-4" />Thêm nhân viên</Button>
        )}
        {activeTab === "rates" && (
          <Button onClick={() => { setRateForm({ ...EMPTY_RATE_FORM }); setEditingRateId(null); setIsRateOpen(true); }} className="gap-2">
            <Plus className="w-4 h-4" />Thêm mức giá
          </Button>
        )}
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border bg-card p-3">
          <p className="text-xs text-muted-foreground">Nhân viên đang làm</p>
          <p className="text-2xl font-bold text-primary">{staff.filter(s => s.isActive).length}</p>
        </div>
        {ROLES.slice(0, 3).map(r => (
          <div key={r.key} className="rounded-xl border bg-card p-3">
            <p className="text-xs text-muted-foreground">{r.label}</p>
            <p className="text-xl font-bold">{staff.filter(s => s.roles?.includes(r.key)).length}</p>
          </div>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="hr"><Users className="w-3.5 h-3.5 mr-1.5" />Nhân sự</TabsTrigger>
          <TabsTrigger value="rates"><DollarSign className="w-3.5 h-3.5 mr-1.5" />Bảng giá lương</TabsTrigger>
          <TabsTrigger value="earnings"><BarChart2 className="w-3.5 h-3.5 mr-1.5" />Thu nhập</TabsTrigger>
          <TabsTrigger value="overrides"><Settings className="w-3.5 h-3.5 mr-1.5" />Lương riêng</TabsTrigger>
        </TabsList>

        {/* ── TAB: NHÂN SỰ ──────────────────────────────────────────────────── */}
        <TabsContent value="hr" className="space-y-3">
          {loadingStaff ? (
            <div className="py-16 text-center text-muted-foreground">Đang tải...</div>
          ) : staff.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>Chưa có nhân viên nào</p>
              <button onClick={openCreateStaff} className="mt-2 text-sm text-primary hover:underline">+ Thêm nhân viên đầu tiên</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {staff.map(s => (
                <div
                  key={s.id}
                  className={`rounded-xl border p-4 cursor-pointer transition-all hover:shadow-md ${selectedStaffId === s.id ? "border-primary bg-primary/5" : "bg-card hover:border-primary/40"}`}
                  onClick={() => setSelectedStaffId(s.id === selectedStaffId ? null : s.id)}
                >
                  <div className="flex items-start gap-3">
                    <StaffAvatar name={s.name} size="lg" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{s.name}</span>
                        {s.isActive
                          ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Đang làm</span>
                          : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">Đã nghỉ</span>}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                        <Phone className="w-3 h-3" />{s.phone}
                        {s.email && <><Mail className="w-3 h-3 ml-1" />{s.email}</>}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {(s.roles || []).map(r => <RoleBadge key={r} roleKey={r} />)}
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <div className="text-xs text-muted-foreground">
                          Lương cơ bản: <span className="font-semibold text-foreground">{formatVND(s.baseSalaryAmount)}</span>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={e => { e.stopPropagation(); openEditStaff(s); }} className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-primary transition-colors">
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={e => { e.stopPropagation(); if (confirm(`Xóa ${s.name}?`)) deleteStaff.mutate(s.id); }} className="p-1.5 hover:bg-destructive/10 rounded-lg text-muted-foreground hover:text-destructive transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Quick earnings summary */}
                  <div className="mt-3 pt-3 border-t grid grid-cols-3 gap-2">
                    <div className="text-center">
                      <p className="text-[10px] text-muted-foreground">Tháng này</p>
                      <p className="text-xs font-bold text-primary">
                        {formatVND(jobEarnings.filter(e => e.staffId === s.id && e.month === now.getMonth() + 1 && e.year === now.getFullYear()).reduce((sum, e) => sum + e.rate, 0))}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-muted-foreground">Số job</p>
                      <p className="text-xs font-bold">
                        {new Set(jobEarnings.filter(e => e.staffId === s.id && e.month === now.getMonth() + 1 && e.year === now.getFullYear()).map(e => e.bookingId)).size}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-muted-foreground">Hôm nay</p>
                      <p className="text-xs font-bold">
                        {formatVND(jobEarnings.filter(e => e.staffId === s.id && e.earnedDate === now.toISOString().slice(0, 10)).reduce((sum, e) => sum + e.rate, 0))}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── TAB: BẢNG GIÁ LƯƠNG ───────────────────────────────────────────── */}
        <TabsContent value="rates" className="space-y-4">
          <div className="text-sm text-muted-foreground rounded-xl border bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 p-3">
            <strong>Hướng dẫn:</strong> Đặt mức lương mặc định theo từng loại dịch vụ và vai trò. 
            Dùng <strong>"default"</strong> làm tên dịch vụ để đặt mức lương cơ bản. Khi job hoàn thành, hệ thống tự tìm đúng mức giá.
          </div>

          <div className="rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3 text-left">Dịch vụ / Loại job</th>
                  {ROLES.map(r => (
                    <th key={r.key} className="px-3 py-3 text-right whitespace-nowrap">{r.emoji} {r.label}</th>
                  ))}
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {Object.keys(ratesByService).length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-muted-foreground">
                      <DollarSign className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p>Chưa có mức giá lương nào</p>
                      <button onClick={() => { setRateForm({ ...EMPTY_RATE_FORM, serviceKey: "default", serviceName: "Mặc định" }); setIsRateOpen(true); }} className="mt-1 text-primary text-xs hover:underline">
                        + Thêm mức giá mặc định
                      </button>
                    </td>
                  </tr>
                )}
                {Object.entries(ratesByService).map(([svcKey, data]) => (
                  <tr key={svcKey} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div>
                        <span className="font-medium">{data.serviceName}</span>
                        {svcKey === "default" && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700">Mặc định</span>}
                        <p className="text-xs text-muted-foreground">{svcKey}</p>
                      </div>
                    </td>
                    {ROLES.map(r => (
                      <td key={r.key} className="px-3 py-3 text-right">
                        {data.rates[r.key] != null ? (
                          <span className="font-medium">{formatVND(data.rates[r.key])}</span>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </td>
                    ))}
                    <td className="px-3 py-3">
                      <button
                        onClick={() => {
                          setEditingRateId(null);
                          setRateForm({ serviceKey: svcKey, serviceName: data.serviceName, role: "photographer", rate: "", notes: "" });
                          setIsRateOpen(true);
                        }}
                        className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-primary"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Individual rate rows for editing */}
          <div>
            <h3 className="font-semibold text-sm mb-2 text-muted-foreground uppercase tracking-wide">Tất cả mức giá ({salaryRates.length})</h3>
            <div className="space-y-1.5">
              {salaryRates.map(r => {
                const role = ROLE_MAP[r.role as RoleKey];
                return (
                  <div key={r.id} className="flex items-center gap-3 px-3 py-2 rounded-lg border bg-card hover:bg-muted/20">
                    <div className="flex-1">
                      <span className="font-medium text-sm">{r.serviceName}</span>
                      <span className="mx-2 text-muted-foreground">×</span>
                      {role ? <span className={`text-xs px-1.5 py-0.5 rounded-full ${role.color}`}>{role.emoji} {role.label}</span> : <span className="text-xs">{r.role}</span>}
                    </div>
                    <span className="font-bold text-primary">{formatVND(r.rate)}</span>
                    <button onClick={() => { setEditingRateId(r.id); setRateForm({ serviceKey: r.serviceKey, serviceName: r.serviceName, role: r.role, rate: String(r.rate), notes: r.notes || "" }); setIsRateOpen(true); }} className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-primary">
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => { if (confirm("Xóa mức giá này?")) deleteRate.mutate(r.id); }} className="p-1 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </TabsContent>

        {/* ── TAB: THU NHẬP ─────────────────────────────────────────────────── */}
        <TabsContent value="earnings" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-center">
            <Select
              value={selectedStaffId ? String(selectedStaffId) : ""}
              onChange={e => setSelectedStaffId(e.target.value ? parseInt(e.target.value) : null)}
              className="w-44"
            >
              <option value="">Tất cả nhân viên</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            <Select value={String(earningsMonth)} onChange={e => setEarningsMonth(parseInt(e.target.value))} className="w-32">
              {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>Tháng {i + 1}</option>)}
            </Select>
            <Select value={String(earningsYear)} onChange={e => setEarningsYear(parseInt(e.target.value))} className="w-28">
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </Select>
          </div>

          {/* Summary cards */}
          {earningsByStaff.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {earningsByStaff.map(item => {
                const staffMember = staff.find(s => s.id === item.staffId);
                const monthlyBase = staffMember?.baseSalaryAmount ?? 0;
                const totalWithBase = item.total + monthlyBase;
                return (
                  <div key={item.staffId} className="rounded-xl border bg-card p-4">
                    <div className="flex items-center gap-2 mb-3">
                      {staffMember && <StaffAvatar name={staffMember.name} size="sm" />}
                      <div>
                        <p className="font-semibold text-sm">{item.staffName}</p>
                        <p className="text-xs text-muted-foreground">{item.jobCount} lượt làm việc</p>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs"><span className="text-muted-foreground">Lương cứng:</span><span>{formatVND(monthlyBase)}</span></div>
                      <div className="flex justify-between text-xs"><span className="text-muted-foreground">Theo job:</span><span className="text-primary font-semibold">+{formatVND(item.total)}</span></div>
                      <div className="flex justify-between text-sm font-bold border-t pt-1 mt-1"><span>Tổng ước tính:</span><span className="text-primary">{formatVND(totalWithBase)}</span></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Earnings detail */}
          <div className="rounded-xl border overflow-hidden">
            <div className="p-3 border-b bg-muted/30 flex justify-between items-center">
              <h3 className="font-semibold text-sm">Chi tiết từng job — T{earningsMonth}/{earningsYear}</h3>
              <span className="text-xs text-muted-foreground">{jobEarnings.length} bản ghi</span>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-muted/20 text-muted-foreground text-xs font-semibold">
                <tr>
                  <th className="px-3 py-2 text-left">Nhân viên</th>
                  <th className="px-3 py-2 text-left">Vai trò</th>
                  <th className="px-3 py-2 text-left">Dịch vụ</th>
                  <th className="px-3 py-2 text-left">Ngày</th>
                  <th className="px-3 py-2 text-right">Thu nhập</th>
                  <th className="px-3 py-2 text-center">TT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {jobEarnings.length === 0 && (
                  <tr><td colSpan={6} className="py-12 text-center text-muted-foreground">
                    <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    Chưa có thu nhập nào trong tháng này
                  </td></tr>
                )}
                {jobEarnings.map(e => {
                  const role = ROLE_MAP[e.role as RoleKey];
                  return (
                    <tr key={e.id} className="hover:bg-muted/20">
                      <td className="px-3 py-2 font-medium">{e.staffName}</td>
                      <td className="px-3 py-2">
                        {role ? <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${role.color}`}>{role.emoji} {role.label}</span> : <span className="text-xs">{e.role}</span>}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground text-xs">{e.serviceName || e.serviceKey}</td>
                      <td className="px-3 py-2 text-muted-foreground text-xs">{formatDate(e.earnedDate)}</td>
                      <td className="px-3 py-2 text-right font-bold text-primary">{formatVND(e.rate)}</td>
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={() => markEarningPaid.mutate({ id: e.id, status: e.status === "paid" ? "pending" : "paid" })}
                          title={e.status === "paid" ? "Đã thanh toán — bấm để hủy" : "Đánh dấu đã thanh toán"}
                          className={`p-1 rounded-lg transition-colors ${e.status === "paid" ? "text-green-600 hover:bg-green-50" : "text-muted-foreground hover:text-green-600 hover:bg-green-50"}`}
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* ── TAB: LƯƠNG RIÊNG (Overrides) ─────────────────────────────────── */}
        <TabsContent value="overrides" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground rounded-xl border bg-yellow-50/50 dark:bg-yellow-950/20 border-yellow-200 p-3 flex-1 mr-3">
              <strong>Lương riêng theo nhân viên:</strong> Khi một nhân viên cụ thể có mức giá khác với mặc định,
              thiết lập ở đây. Hệ thống sẽ ưu tiên mức giá riêng này khi tính lương.
            </div>
            <Button onClick={() => { setOverrideForm({ staffId: "", serviceKey: "", role: "photographer", rate: "", notes: "" }); setIsOverrideOpen(true); }} className="gap-2 flex-shrink-0">
              <Plus className="w-4 h-4" />Thêm
            </Button>
          </div>

          {/* Filter by staff */}
          <Select
            value={selectedStaffId ? String(selectedStaffId) : ""}
            onChange={e => setSelectedStaffId(e.target.value ? parseInt(e.target.value) : null)}
            className="w-48"
          >
            <option value="">Tất cả nhân viên</option>
            {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>

          <div className="space-y-2">
            {overrides.length === 0 && (
              <div className="py-12 text-center text-muted-foreground">
                <Star className="w-8 h-8 mx-auto mb-2 opacity-20" />
                <p>Chưa có lương riêng nào. Đang dùng mức giá mặc định cho tất cả.</p>
              </div>
            )}
            {overrides.map(o => {
              const role = ROLE_MAP[o.role as RoleKey];
              return (
                <div key={o.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border bg-card hover:bg-muted/10">
                  <div className="flex-1">
                    <span className="font-medium">{o.staffName}</span>
                    <span className="mx-2 text-muted-foreground">·</span>
                    <span className="text-muted-foreground text-sm">{o.serviceKey}</span>
                    <span className="mx-2 text-muted-foreground">·</span>
                    {role ? <span className={`text-xs px-1.5 py-0.5 rounded-full ${role.color}`}>{role.emoji} {role.label}</span> : <span className="text-xs">{o.role}</span>}
                  </div>
                  <span className="font-bold text-primary">{formatVND(o.rate)}</span>
                  <button onClick={() => { if (confirm("Xóa lương riêng này?")) deleteOverride.mutate(o.id); }} className="p-1 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      {/* ── STAFF CREATE/EDIT DIALOG ──────────────────────────────────────────── */}
      <Dialog open={isStaffOpen} onOpenChange={open => { if (!isSavingStaff) { setIsStaffOpen(open); if (!open) setStaffError(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingStaffId ? "Chỉnh sửa nhân viên" : "Thêm nhân viên mới"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
            {staffError && (
              <div className="flex items-start gap-2 p-3 bg-destructive/10 text-destructive rounded-xl text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{staffError}</span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-medium text-muted-foreground">Họ và tên *</label>
                <Input placeholder="Nguyễn Văn Minh" value={staffForm.name} onChange={e => setStaffForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Số điện thoại *</label>
                <Input placeholder="0912 345 678" value={staffForm.phone} onChange={e => setStaffForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Email</label>
                <Input placeholder="minh@studio.vn" value={staffForm.email} onChange={e => setStaffForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Ngày vào làm *</label>
                <Input type="date" value={staffForm.joinDate} onChange={e => setStaffForm(f => ({ ...f, joinDate: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Lương cơ bản (đ/tháng)</label>
                <Input type="number" placeholder="5000000" value={staffForm.baseSalaryAmount} onChange={e => setStaffForm(f => ({ ...f, baseSalaryAmount: e.target.value }))} />
              </div>
            </div>

            {/* Multi-role selection */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">Vai trò * <span className="text-muted-foreground/60">(chọn nhiều)</span></label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {ROLES.map(r => (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => toggleRole(r.key)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all ${staffForm.roles.includes(r.key) ? `${r.color} border-current` : "border-border text-muted-foreground hover:border-primary/40 hover:bg-muted/30"}`}
                  >
                    <span>{r.emoji}</span>
                    <span>{r.label}</span>
                    {staffForm.roles.includes(r.key) && <CheckCircle className="w-3.5 h-3.5 ml-auto" />}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input type="checkbox" id="isActive" checked={staffForm.isActive} onChange={e => setStaffForm(f => ({ ...f, isActive: e.target.checked }))} className="rounded" />
              <label htmlFor="isActive" className="text-sm">Đang làm việc</label>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Ghi chú</label>
              <Textarea rows={2} placeholder="Kinh nghiệm, chuyên môn..." value={staffForm.notes} onChange={e => setStaffForm(f => ({ ...f, notes: e.target.value }))} />
            </div>

            <div className="flex gap-2 pt-1">
              <Button onClick={handleSubmitStaff} disabled={isSavingStaff} className="flex-1">
                {isSavingStaff ? "Đang lưu..." : editingStaffId ? "Cập nhật" : "Thêm nhân viên"}
              </Button>
              <Button variant="outline" onClick={() => { setIsStaffOpen(false); setStaffError(""); }}>Hủy</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── RATE CREATE/EDIT DIALOG ────────────────────────────────────────────── */}
      <Dialog open={isRateOpen} onOpenChange={open => { if (!isSavingRate) setIsRateOpen(open); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingRateId ? "Sửa mức giá lương" : "Thêm mức giá lương"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Tên dịch vụ (hiển thị) *</label>
              <Input placeholder="VD: Chụp Album, Chụp Cổng, Mặc định..." value={rateForm.serviceName}
                onChange={e => setRateForm(f => ({ ...f, serviceName: e.target.value, serviceKey: f.serviceKey || e.target.value.toLowerCase().replace(/\s+/g, "_") }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Mã dịch vụ (service key) *</label>
              <Input placeholder="album, co_dau, default..." value={rateForm.serviceKey}
                onChange={e => setRateForm(f => ({ ...f, serviceKey: e.target.value }))} />
              <p className="text-xs text-muted-foreground mt-0.5">Dùng "default" cho mức giá mặc định</p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Vai trò *</label>
              <Select value={rateForm.role} onChange={e => setRateForm(f => ({ ...f, role: e.target.value }))}>
                {ROLES.map(r => <option key={r.key} value={r.key}>{r.emoji} {r.label}</option>)}
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Mức lương (VNĐ) *</label>
              <Input type="number" placeholder="300000" value={rateForm.rate}
                onChange={e => setRateForm(f => ({ ...f, rate: e.target.value }))} />
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                onClick={() => { if (editingRateId) updateRate.mutate({ id: editingRateId, d: rateForm }); else createRate.mutate(rateForm); }}
                disabled={isSavingRate || !rateForm.serviceKey || !rateForm.role || !rateForm.rate}
                className="flex-1"
              >
                {isSavingRate ? "Đang lưu..." : editingRateId ? "Cập nhật" : "Thêm mức giá"}
              </Button>
              <Button variant="outline" onClick={() => setIsRateOpen(false)}>Hủy</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── OVERRIDE CREATE DIALOG ─────────────────────────────────────────────── */}
      <Dialog open={isOverrideOpen} onOpenChange={setIsOverrideOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Thêm lương riêng theo nhân viên</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Nhân viên *</label>
              <Select value={overrideForm.staffId} onChange={e => setOverrideForm(f => ({ ...f, staffId: e.target.value }))}>
                <option value="">-- Chọn nhân viên --</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Mã dịch vụ (service key) *</label>
              <Input placeholder="album, co_dau, default..." value={overrideForm.serviceKey}
                onChange={e => setOverrideForm(f => ({ ...f, serviceKey: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Vai trò *</label>
              <Select value={overrideForm.role} onChange={e => setOverrideForm(f => ({ ...f, role: e.target.value }))}>
                {ROLES.map(r => <option key={r.key} value={r.key}>{r.emoji} {r.label}</option>)}
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Mức lương riêng (VNĐ) *</label>
              <Input type="number" placeholder="600000" value={overrideForm.rate}
                onChange={e => setOverrideForm(f => ({ ...f, rate: e.target.value }))} />
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                onClick={() => createOverride.mutate(overrideForm)}
                disabled={createOverride.isPending || !overrideForm.staffId || !overrideForm.serviceKey || !overrideForm.rate}
                className="flex-1"
              >
                {createOverride.isPending ? "Đang lưu..." : "Thêm"}
              </Button>
              <Button variant="outline" onClick={() => setIsOverrideOpen(false)}>Hủy</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
