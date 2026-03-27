import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Search, X, Check, AlertTriangle, Clock, ChevronDown,
  Edit2, Trash2, Film, Camera, User, Calendar, SortAsc,
  CheckCircle2, Circle, Loader, AlertCircle, RefreshCw
} from "lucide-react";
import { Button, Input, Badge } from "@/components/ui";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type PhotoshopJob = {
  id: number;
  jobCode: string;
  bookingId: number | null;
  customerName: string;
  customerPhone: string;
  serviceName: string;
  assignedStaffId: number | null;
  assignedStaffName: string;
  shootDate: string;
  receivedFileDate: string;
  internalDeadline: string;
  customerDeadline: string;
  status: string;
  progressPercent: number;
  totalPhotos: number;
  donePhotos: number;
  notes: string;
  isActive: boolean;
  createdAt: string;
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  chua_nhan:    { label: "Chưa nhận",     color: "text-slate-600",   bg: "bg-slate-100 dark:bg-slate-800",    icon: Circle },
  dang_xu_ly:   { label: "Đang xử lý",   color: "text-blue-600",    bg: "bg-blue-100 dark:bg-blue-900/40",   icon: Loader },
  cho_duyet:    { label: "Chờ duyệt",     color: "text-amber-600",   bg: "bg-amber-100 dark:bg-amber-900/40", icon: Clock },
  hoan_thanh:   { label: "Hoàn thành",   color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-900/40", icon: CheckCircle2 },
};

const ALL_STATUSES = Object.keys(STATUS_CONFIG);

function getDeadlineInfo(deadline: string): { label: string; cls: string } {
  if (!deadline) return { label: "", cls: "" };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(deadline);
  const diff = Math.ceil((d.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return { label: `Trễ ${-diff} ngày`, cls: "text-red-600 bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800" };
  if (diff === 0) return { label: "Hôm nay!", cls: "text-orange-600 bg-orange-50 border-orange-200 dark:bg-orange-950/30 dark:border-orange-800" };
  if (diff <= 2) return { label: `Còn ${diff} ngày`, cls: "text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800" };
  if (diff <= 5) return { label: `Còn ${diff} ngày`, cls: "text-yellow-600 bg-yellow-50 border-yellow-200" };
  return { label: `Còn ${diff} ngày`, cls: "text-muted-foreground" };
}

function formatDate(s: string) {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString("vi-VN"); } catch { return s; }
}

const EMPTY_FORM = {
  jobCode: "", customerName: "", customerPhone: "", serviceName: "",
  assignedStaffName: "", shootDate: "", receivedFileDate: "",
  internalDeadline: "", customerDeadline: "", status: "chua_nhan",
  progressPercent: 0, totalPhotos: 0, donePhotos: 0, notes: ""
};

export default function PhotoshopJobsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingJob, setEditingJob] = useState<PhotoshopJob | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [sortBy, setSortBy] = useState<"deadline" | "created" | "status" | "progress">("deadline");
  const [bookingSearch, setBookingSearch] = useState("");
  const [showBookingDrop, setShowBookingDrop] = useState(false);
  const [linkedBookingId, setLinkedBookingId] = useState<number | null>(null);
  const bookingSearchRef = useRef<HTMLDivElement>(null);

  const { data: jobs = [], isLoading } = useQuery<PhotoshopJob[]>({
    queryKey: ["photoshop-jobs"],
    queryFn: () => fetch(`${BASE}/api/photoshop-jobs`).then(r => r.json()),
    refetchInterval: 30000,
  });

  // Booking search for modal
  const { data: bookingResults = [] } = useQuery<any[]>({
    queryKey: ["bookings-search", bookingSearch],
    queryFn: () => bookingSearch.length >= 2
      ? fetch(`${BASE}/api/bookings?q=${encodeURIComponent(bookingSearch)}`).then(r => r.json())
      : Promise.resolve([]),
    enabled: bookingSearch.length >= 2,
  });

  // Close booking dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (bookingSearchRef.current && !bookingSearchRef.current.contains(e.target as Node)) {
        setShowBookingDrop(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const createJob = useMutation({
    mutationFn: (data: typeof EMPTY_FORM) => fetch(`${BASE}/api/photoshop-jobs`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data)
    }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["photoshop-jobs"] }); closeModal(); },
  });

  const updateJob = useMutation({
    mutationFn: ({ id, data }: { id: number; data: typeof EMPTY_FORM }) =>
      fetch(`${BASE}/api/photoshop-jobs/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data)
      }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["photoshop-jobs"] }); closeModal(); },
  });

  const deleteJob = useMutation({
    mutationFn: (id: number) => fetch(`${BASE}/api/photoshop-jobs/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["photoshop-jobs"] }),
  });

  const quickStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      fetch(`${BASE}/api/photoshop-jobs/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status })
      }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["photoshop-jobs"] }),
  });

  const quickProgress = useMutation({
    mutationFn: ({ id, progressPercent }: { id: number; progressPercent: number }) =>
      fetch(`${BASE}/api/photoshop-jobs/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ progressPercent })
      }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["photoshop-jobs"] }),
  });

  function openCreate() {
    setEditingJob(null);
    const today = new Date().toISOString().split("T")[0];
    setForm({ ...EMPTY_FORM, jobCode: `JOB-${Date.now().toString().slice(-6)}`, receivedFileDate: today });
    setLinkedBookingId(null);
    setBookingSearch("");
    setShowModal(true);
  }

  function openEdit(j: PhotoshopJob) {
    setEditingJob(j);
    setForm({
      jobCode: j.jobCode, customerName: j.customerName, customerPhone: j.customerPhone,
      serviceName: j.serviceName, assignedStaffName: j.assignedStaffName,
      shootDate: j.shootDate ?? "", receivedFileDate: j.receivedFileDate ?? "",
      internalDeadline: j.internalDeadline ?? "", customerDeadline: j.customerDeadline ?? "",
      status: j.status, progressPercent: j.progressPercent,
      totalPhotos: j.totalPhotos ?? 0, donePhotos: j.donePhotos ?? 0, notes: j.notes ?? ""
    });
    setLinkedBookingId(j.bookingId ?? null);
    setBookingSearch(j.bookingId ? `Đơn #${j.bookingId}` : "");
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingJob(null);
    setLinkedBookingId(null);
    setBookingSearch("");
    setShowBookingDrop(false);
  }

  function selectBooking(b: any) {
    setLinkedBookingId(b.id);
    setBookingSearch(`${b.orderCode ?? `#${b.id}`} — ${b.customerName}`);
    setShowBookingDrop(false);
    // Auto-fill form fields
    setForm(f => ({
      ...f,
      customerName: b.customerName ?? f.customerName,
      customerPhone: b.customerPhone ?? f.customerPhone,
      serviceName: b.serviceLabel ?? b.packageType ?? f.serviceName,
      shootDate: b.shootDate ? b.shootDate.split("T")[0] : f.shootDate,
      assignedStaffName: Array.isArray(b.assignedStaff) && b.assignedStaff.length > 0
        ? b.assignedStaff.map((s: any) => s.name ?? s).join(", ")
        : f.assignedStaffName,
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data = { ...form, ...(linkedBookingId ? { bookingId: linkedBookingId } : {}) };
    if (editingJob) updateJob.mutate({ id: editingJob.id, data: data as any });
    else createJob.mutate(data as any);
  }

  const filtered = useMemo(() => {
    let list = jobs.filter(j => j.isActive);
    if (filterStatus) list = list.filter(j => j.status === filterStatus);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(j =>
        j.jobCode.toLowerCase().includes(q) ||
        j.customerName.toLowerCase().includes(q) ||
        (j.assignedStaffName ?? "").toLowerCase().includes(q) ||
        (j.serviceName ?? "").toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => {
      if (sortBy === "deadline") {
        if (!a.customerDeadline && !b.customerDeadline) return 0;
        if (!a.customerDeadline) return 1;
        if (!b.customerDeadline) return -1;
        return a.customerDeadline.localeCompare(b.customerDeadline);
      }
      if (sortBy === "progress") return a.progressPercent - b.progressPercent;
      if (sortBy === "status") return a.status.localeCompare(b.status);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [jobs, filterStatus, search, sortBy]);

  const counts = useMemo(() => {
    const active = jobs.filter(j => j.isActive);
    return Object.fromEntries(ALL_STATUSES.map(s => [s, active.filter(j => j.status === s).length]));
  }, [jobs]);

  const urgentCount = useMemo(() => {
    return jobs.filter(j => j.isActive && j.status !== "hoan_thanh" && j.customerDeadline && (() => {
      const diff = Math.ceil((new Date(j.customerDeadline).getTime() - Date.now()) / 86400000);
      return diff <= 2;
    })()).length;
  }, [jobs]);

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-border bg-background">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
              <Film className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Tiến độ hậu kỳ</h1>
              <p className="text-xs text-muted-foreground">{filtered.length} job {urgentCount > 0 && <span className="text-red-500 font-medium">· {urgentCount} cần gấp</span>}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Tìm job, khách hàng..."
                className="pl-9 pr-4 py-2 text-sm rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 w-52" />
            </div>
            <select value={sortBy} onChange={e => setSortBy(e.target.value as never)}
              className="text-sm border border-border rounded-xl px-3 py-2 bg-background">
              <option value="deadline">Theo deadline</option>
              <option value="progress">Theo tiến độ</option>
              <option value="status">Theo trạng thái</option>
              <option value="created">Mới nhất</option>
            </select>
            <Button onClick={openCreate} size="sm" className="gap-1.5">
              <Plus className="w-4 h-4" /> Thêm job
            </Button>
          </div>
        </div>

        {/* Status filter tabs */}
        <div className="flex gap-2 mt-3 flex-wrap">
          <button
            onClick={() => setFilterStatus(null)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterStatus === null ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
            Tất cả ({jobs.filter(j => j.isActive).length})
          </button>
          {ALL_STATUSES.map(s => {
            const cfg = STATUS_CONFIG[s];
            return (
              <button key={s}
                onClick={() => setFilterStatus(filterStatus === s ? null : s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterStatus === s ? `${cfg.bg} ${cfg.color}` : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                {cfg.label} ({counts[s] ?? 0})
              </button>
            );
          })}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Đang tải...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <Film className="w-12 h-12 mb-3 opacity-20" />
            <p className="font-medium">Chưa có job hậu kỳ</p>
            <p className="text-sm mt-1">Bấm "Thêm job" để tạo job mới</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {filtered.map(job => {
              const cfg = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.chua_nhan;
              const StIcon = cfg.icon;
              const dlInfo = getDeadlineInfo(job.customerDeadline);
              const intDlInfo = getDeadlineInfo(job.internalDeadline);
              const isUrgent = dlInfo.cls.includes("red") || dlInfo.cls.includes("orange");

              return (
                <div key={job.id}
                  className={`rounded-2xl border p-4 bg-card transition-all hover:shadow-sm ${isUrgent && job.status !== "hoan_thanh" ? "border-red-200 dark:border-red-800/50" : "border-border"}`}>
                  <div className="flex items-start gap-4">
                    {/* Left: status + code */}
                    <div className="flex-shrink-0 text-center w-20">
                      <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${cfg.bg} ${cfg.color}`}>
                        <StIcon className="w-3.5 h-3.5" />
                        {cfg.label}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 font-mono">{job.jobCode}</p>
                    </div>

                    {/* Middle: info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{job.customerName || "—"}</span>
                        {job.customerPhone && <span className="text-xs text-muted-foreground">{job.customerPhone}</span>}
                        {job.serviceName && <Badge variant="outline" className="text-xs">{job.serviceName}</Badge>}
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap text-xs text-muted-foreground">
                        {job.assignedStaffName && (
                          <span className="flex items-center gap-1"><User className="w-3 h-3" />{job.assignedStaffName}</span>
                        )}
                        {job.shootDate && <span className="flex items-center gap-1"><Camera className="w-3 h-3" />Chụp: {formatDate(job.shootDate)}</span>}
                        {job.receivedFileDate && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Nhận file: {formatDate(job.receivedFileDate)}</span>}
                      </div>

                      {/* Progress bar */}
                      <div className="mt-2.5">
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                          <span>Tiến độ</span>
                          <span className="font-medium text-foreground">{job.progressPercent}%</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${job.progressPercent >= 100 ? "bg-emerald-500" : job.progressPercent >= 60 ? "bg-blue-500" : job.progressPercent >= 30 ? "bg-amber-500" : "bg-rose-400"}`}
                            style={{ width: `${Math.min(100, job.progressPercent)}%` }}
                          />
                        </div>
                        {/* Quick progress buttons */}
                        <div className="flex gap-1 mt-1.5">
                          {[0, 25, 50, 75, 100].map(pct => (
                            <button key={pct}
                              onClick={() => quickProgress.mutate({ id: job.id, progressPercent: pct })}
                              className={`text-xs px-1.5 py-0.5 rounded transition-colors ${job.progressPercent === pct ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80 text-muted-foreground"}`}>
                              {pct}%
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Deadline badges */}
                      <div className="flex flex-wrap gap-2 mt-2">
                        {job.internalDeadline && (
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${intDlInfo.cls || "text-muted-foreground border-border"}`}>
                            ⚡ Nội bộ: {formatDate(job.internalDeadline)} {intDlInfo.label && `(${intDlInfo.label})`}
                          </span>
                        )}
                        {job.customerDeadline && (
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${dlInfo.cls || "text-muted-foreground border-border"}`}>
                            👤 Khách: {formatDate(job.customerDeadline)} {dlInfo.label && `(${dlInfo.label})`}
                          </span>
                        )}
                      </div>

                      {job.notes && <p className="text-xs text-muted-foreground mt-1.5 italic">{job.notes}</p>}
                    </div>

                    {/* Right: actions */}
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      {/* Quick status change */}
                      <select
                        value={job.status}
                        onChange={e => quickStatus.mutate({ id: job.id, status: e.target.value })}
                        className={`text-xs border rounded-lg px-2 py-1 ${cfg.bg} ${cfg.color} border-current/20 cursor-pointer focus:outline-none`}>
                        {ALL_STATUSES.map(s => (
                          <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                        ))}
                      </select>
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(job)}
                          className="flex-1 p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-primary transition-colors" title="Sửa">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => { if (confirm("Xoá job này?")) deleteJob.mutate(job.id); }}
                          className="flex-1 p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors" title="Xoá">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="bg-background rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="font-bold text-lg">{editingJob ? "Sửa job hậu kỳ" : "Thêm job hậu kỳ mới"}</h2>
              <button onClick={closeModal} className="p-2 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSubmit} className="flex-1 overflow-auto p-5 space-y-4">

              {/* Booking search */}
              {!editingJob && (
                <div ref={bookingSearchRef} className="relative">
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    Liên kết đơn hàng (tuỳ chọn)
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <input
                      value={bookingSearch}
                      onChange={e => { setBookingSearch(e.target.value); setShowBookingDrop(true); if (!e.target.value) setLinkedBookingId(null); }}
                      onFocus={() => bookingSearch.length >= 2 && setShowBookingDrop(true)}
                      placeholder="Nhập tên khách hoặc mã đơn (ít nhất 2 ký tự)..."
                      className="w-full pl-9 pr-8 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    {bookingSearch && (
                      <button type="button" onClick={() => { setBookingSearch(""); setLinkedBookingId(null); setShowBookingDrop(false); }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  {linkedBookingId && (
                    <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                      <Check className="w-3 h-3" /> Đã liên kết đơn #{linkedBookingId} · thông tin tự động điền bên dưới
                    </p>
                  )}
                  {showBookingDrop && bookingSearch.length >= 2 && (
                    <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-popover border border-border rounded-xl shadow-lg max-h-48 overflow-auto">
                      {bookingResults.length === 0 ? (
                        <p className="text-sm text-muted-foreground p-3 text-center">Không tìm thấy đơn hàng nào</p>
                      ) : (
                        bookingResults.slice(0, 8).map((b: any) => (
                          <button key={b.id} type="button"
                            onClick={() => selectBooking(b)}
                            className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted transition-colors flex items-start gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="font-medium truncate">{b.customerName}</p>
                              <p className="text-xs text-muted-foreground">
                                {b.orderCode ?? `#${b.id}`}
                                {b.serviceLabel && ` · ${b.serviceLabel}`}
                                {b.shootDate && ` · ${new Date(b.shootDate).toLocaleDateString("vi-VN")}`}
                              </p>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Mã job *</label>
                  <input value={form.jobCode} onChange={e => setForm(f => ({ ...f, jobCode: e.target.value }))} required
                    className="w-full text-sm border border-border rounded-xl px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="VD: JOB-001" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Trạng thái</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full text-sm border border-border rounded-xl px-3 py-2 bg-background focus:outline-none">
                    {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Tên khách hàng *</label>
                  <input value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} required
                    className="w-full text-sm border border-border rounded-xl px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="Họ tên khách" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Số điện thoại</label>
                  <input value={form.customerPhone} onChange={e => setForm(f => ({ ...f, customerPhone: e.target.value }))}
                    className="w-full text-sm border border-border rounded-xl px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="0..." />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Dịch vụ</label>
                  <input value={form.serviceName} onChange={e => setForm(f => ({ ...f, serviceName: e.target.value }))}
                    className="w-full text-sm border border-border rounded-xl px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="VD: Album Studio" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Nhân viên phụ trách</label>
                  <input value={form.assignedStaffName} onChange={e => setForm(f => ({ ...f, assignedStaffName: e.target.value }))}
                    className="w-full text-sm border border-border rounded-xl px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="Tên nhân viên" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Ngày chụp</label>
                  <input type="date" value={form.shootDate} onChange={e => setForm(f => ({ ...f, shootDate: e.target.value }))}
                    className="w-full text-sm border border-border rounded-xl px-3 py-2 bg-background focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Ngày nhận file raw</label>
                  <input type="date" value={form.receivedFileDate} onChange={e => setForm(f => ({ ...f, receivedFileDate: e.target.value }))}
                    className="w-full text-sm border border-border rounded-xl px-3 py-2 bg-background focus:outline-none" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Deadline nội bộ ⚡</label>
                  <input type="date" value={form.internalDeadline} onChange={e => setForm(f => ({ ...f, internalDeadline: e.target.value }))}
                    className="w-full text-sm border border-border rounded-xl px-3 py-2 bg-background focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Deadline khách hàng 👤</label>
                  <input type="date" value={form.customerDeadline} onChange={e => setForm(f => ({ ...f, customerDeadline: e.target.value }))}
                    className="w-full text-sm border border-border rounded-xl px-3 py-2 bg-background focus:outline-none" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Tiến độ (%)</label>
                  <input type="number" min={0} max={100} value={form.progressPercent}
                    onChange={e => setForm(f => ({ ...f, progressPercent: +e.target.value }))}
                    className="w-full text-sm border border-border rounded-xl px-3 py-2 bg-background focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Tổng số ảnh</label>
                  <input type="number" min={0} value={form.totalPhotos}
                    onChange={e => setForm(f => ({ ...f, totalPhotos: +e.target.value }))}
                    className="w-full text-sm border border-border rounded-xl px-3 py-2 bg-background focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Đã làm xong</label>
                  <input type="number" min={0} value={form.donePhotos}
                    onChange={e => setForm(f => ({ ...f, donePhotos: +e.target.value }))}
                    className="w-full text-sm border border-border rounded-xl px-3 py-2 bg-background focus:outline-none" />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Ghi chú</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2} className="w-full text-sm border border-border rounded-xl px-3 py-2 bg-background focus:outline-none resize-none"
                  placeholder="Ghi chú thêm..." />
              </div>

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={closeModal}
                  className="flex-1 py-2.5 border border-border rounded-xl text-sm font-medium hover:bg-muted transition-colors">
                  Hủy
                </button>
                <button type="submit" disabled={createJob.isPending || updateJob.isPending}
                  className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
                  {editingJob ? "Lưu thay đổi" : "Tạo job"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
