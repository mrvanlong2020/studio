import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search, CreditCard, Banknote, Phone, Clock, Trash2,
  X, Upload, Eye, AlertCircle, Receipt, ChevronDown,
  Sparkles, ListFilter, History, TrendingUp, ChevronRight,
  CalendarDays, Layers, CheckCircle, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CurrencyInput } from "@/components/ui/currency-input";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const fetchJson = (url: string, opts?: RequestInit) =>
  fetch(`${BASE}${url}`, { headers: { "Content-Type": "application/json" }, ...opts }).then(r => r.json());

const fmtVND = (n: number) => (n ?? 0).toLocaleString("vi-VN") + "đ";
const fmtDate = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
};
const today = () => new Date().toISOString().split("T")[0];

type Booking = {
  id: number;
  orderCode: string;
  customerId: number;
  customerName: string;
  customerPhone: string;
  customerCode?: string;
  packageType: string;
  totalAmount: number;
  discountAmount?: number;
  paidAmount: number;
  remainingAmount: number;
  status: string;
  shootDate: string;
  createdAt?: string;
  latestPaymentAt?: string | null;
  notes?: string;
  isParentContract?: boolean;
  serviceCount?: number;
};

type Payment = {
  id: number;
  bookingId?: number;
  amount: number;
  paymentMethod: string;
  paymentType: string;
  collectorName?: string;
  bankName?: string;
  proofImageUrl?: string;
  paidDate?: string;
  notes?: string;
  paidAt: string;
};

type RecentPaymentItem = {
  id: number;
  bookingId: number | null;
  rentalId: number | null;
  amount: number;
  paymentMethod: string;
  paymentType: string;
  collectorName: string | null;
  bankName: string | null;
  proofImageUrl: string | null;
  paidDate: string | null;
  paidAt: string | null;
  notes: string | null;
  customerName: string | null;
  customerPhone: string | null;
  orderCode: string | null;
  packageType: string | null;
  totalAmount: number;
  discountAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: string | null;
  isParentContract: boolean;
  paymentCount: number;
};

type RecentData = {
  payments: RecentPaymentItem[];
  summary: { count: number; total: number };
};

type Period = "today" | "7days" | "month";

const METHOD_LABEL: Record<string, string> = {
  cash: "Tiền mặt",
  bank_transfer: "Chuyển khoản",
};

const STATUS_CFG: Record<string, { label: string; dot: string }> = {
  pending:     { label: "Chờ xác nhận",   dot: "bg-yellow-400" },
  confirmed:   { label: "Đã xác nhận",    dot: "bg-blue-400"   },
  in_progress: { label: "Đang thực hiện", dot: "bg-purple-400" },
  completed:   { label: "Hoàn thành",     dot: "bg-green-400"  },
  cancelled:   { label: "Đã hủy",         dot: "bg-red-400"    },
};

/* ─── BookingRow ──────────────────────────── */
function BookingRow({
  b,
  selected,
  onClick,
  onQuickPay,
  showTag,
}: {
  b: Booking;
  selected: boolean;
  onClick: () => void;
  onQuickPay?: (b: Booking) => void;
  showTag?: "new" | "owed" | "deposited" | "recent";
}) {
  const TAG: Record<string, { label: string; cls: string }> = {
    new:       { label: "Mới tạo",   cls: "bg-blue-100 text-blue-700"   },
    owed:      { label: "Còn nợ",    cls: "bg-red-100 text-red-700"     },
    deposited: { label: "Vừa cọc",   cls: "bg-amber-100 text-amber-700" },
    recent:    { label: "Gần đây",   cls: "bg-gray-100 text-gray-600"   },
  };

  const tag = showTag ? TAG[showTag] : null;
  const statusCfg = STATUS_CFG[b.status];

  const isPaid        = b.remainingAmount <= 0;
  const isPartialPaid = !isPaid && b.paidAmount > 0;
  const isUnpaid      = !isPaid && b.paidAmount <= 0;

  const avatarCls = selected
    ? "bg-primary text-primary-foreground"
    : isPaid
      ? "bg-green-100 text-green-700"
      : isPartialPaid
        ? "bg-amber-100 text-amber-700"
        : "bg-red-100 text-red-600";

  return (
    <button
      onMouseDown={onClick}
      className={cn(
        "w-full text-left px-3 py-3 transition-all border-b last:border-0",
        selected
          ? "bg-primary/8 border-border/30"
          : isPaid
            ? "border-green-100 hover:bg-green-50/40 active:bg-green-50/60"
            : isPartialPaid
              ? "border-amber-100 hover:bg-amber-50/40 active:bg-amber-50/60"
              : "border-red-100 hover:bg-red-50/30 active:bg-red-50/50"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        {/* Avatar + info */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={cn(
            "w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0",
            avatarCls
          )}>
            {b.customerName?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="min-w-0">
            {/* Dòng 1: Tên + tag */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-semibold text-foreground leading-tight">{b.customerName}</span>
              {tag && (
                <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-semibold", tag.cls)}>
                  {tag.label}
                </span>
              )}
              {isPaid && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-green-100 text-green-700">
                  ✓ Đủ
                </span>
              )}
              {isPartialPaid && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-amber-100 text-amber-700">
                  ½ Một phần
                </span>
              )}
              {isUnpaid && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-red-100 text-red-600">
                  ✗ Chưa thu
                </span>
              )}
            </div>
            {/* Dòng 2: SĐT · Mã đơn · Gói */}
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5 flex-wrap">
              <span className="flex items-center gap-0.5">
                <Phone className="w-2.5 h-2.5" />
                {b.customerPhone}
              </span>
              {b.orderCode && (
                <>
                  <span className="opacity-40">·</span>
                  <span className="font-mono font-medium text-primary/70">{b.orderCode}</span>
                </>
              )}
              {b.isParentContract && (b.serviceCount ?? 0) > 0 && (
                <>
                  <span className="opacity-40">·</span>
                  <span className="text-[10px] px-1 py-0.5 rounded bg-violet-100 text-violet-700 font-semibold">
                    {b.serviceCount} dịch vụ
                  </span>
                </>
              )}
              {!b.isParentContract && (
                <>
                  <span className="opacity-40">·</span>
                  <span className="truncate max-w-[120px]">{b.packageType}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Số tiền + ngày + nút thu nhanh */}
        <div className="text-right flex-shrink-0 flex flex-col items-end gap-0.5">
          {isPaid ? (
            <p className="text-sm font-bold text-green-600">{fmtVND(b.totalAmount)}</p>
          ) : (
            <p className="text-sm font-bold text-red-600">−{fmtVND(b.remainingAmount)}</p>
          )}
          <p className="text-[10px] text-muted-foreground">
            {b.latestPaymentAt
              ? fmtDate(b.latestPaymentAt)
              : fmtDate(b.createdAt ?? b.shootDate)}
          </p>
          <div className="flex items-center justify-end gap-1">
            <span className={cn("w-1.5 h-1.5 rounded-full", statusCfg?.dot ?? "bg-gray-300")} />
            <span className="text-[9px] text-muted-foreground">{statusCfg?.label ?? b.status}</span>
          </div>
          {!isPaid && onQuickPay && (
            <button
              onMouseDown={(e) => { e.stopPropagation(); onQuickPay(b); }}
              className="mt-1 text-[10px] px-2 py-0.5 rounded-full bg-primary text-primary-foreground font-semibold hover:bg-primary/90 active:scale-95 transition-all"
            >
              Thu thêm ›
            </button>
          )}
        </div>
      </div>
    </button>
  );
}

/* ─── SmartSearchBox ─────────────────────── */
function SmartSearchBox({
  suggestions,
  suggestionsLoading,
  selectedId,
  onSelect,
}: {
  suggestions: Booking[];
  suggestionsLoading: boolean;
  selectedId?: number;
  onSelect: (b: Booking) => void;
}) {
  const [query, setQuery]             = useState("");
  const [focused, setFocused]         = useState(false);
  const [results, setResults]         = useState<Booking[]>([]);
  const [searching, setSearching]     = useState(false);
  const [mode, setMode]               = useState<"suggestions" | "search">("suggestions");
  const timer                         = useRef<ReturnType<typeof setTimeout>>();
  const inputRef                      = useRef<HTMLInputElement>(null);

  const doSearch = useCallback((q: string) => {
    clearTimeout(timer.current);
    if (!q.trim()) { setResults([]); setMode("suggestions"); return; }
    setMode("search");
    setSearching(true);
    timer.current = setTimeout(async () => {
      try {
        const res = await fetchJson(`/api/payments/search?q=${encodeURIComponent(q)}`);
        setResults(res);
      } finally { setSearching(false); }
    }, 280);
  }, []);

  const clear = () => {
    setQuery("");
    setResults([]);
    setMode("suggestions");
    inputRef.current?.focus();
  };

  const handleSelect = (b: Booking) => {
    onSelect(b);
    setFocused(false);
    setQuery(`${b.customerName} — ${b.customerPhone}`);
  };

  const showDropdown = focused && (mode === "suggestions" || query.trim().length > 0);
  const listItems: Booking[] = mode === "search" ? results : suggestions;

  // Tag helper for suggestions mode
  const getSuggestionTag = (b: Booking): "new" | "owed" | "deposited" | "recent" => {
    const ageMs = Date.now() - new Date(b.createdAt ?? 0).getTime();
    const isNew = ageMs < 3 * 24 * 3600 * 1000; // < 3 ngày
    if (b.remainingAmount > 0 && b.paidAmount > 0) return "deposited";
    if (b.remainingAmount > 0) return isNew ? "new" : "owed";
    return isNew ? "new" : "recent";
  };

  return (
    <div className="relative">
      {/* Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          className={cn(
            "w-full pl-9 pr-10 py-3 border rounded-xl text-sm bg-background transition-all",
            "focus:outline-none focus:ring-2 focus:ring-primary/30",
            focused ? "border-primary/60 shadow-sm" : "border-border"
          )}
          placeholder="Nhập tên, số điện thoại hoặc mã đơn hàng..."
          value={query}
          onChange={e => { setQuery(e.target.value); doSearch(e.target.value); }}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 160)}
          autoComplete="off"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {searching && (
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          )}
          {query && !searching && (
            <button onClick={clear} className="text-muted-foreground hover:text-foreground p-0.5">
              <X className="w-4 h-4" />
            </button>
          )}
          {!query && (
            <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", focused && "rotate-180")} />
          )}
        </div>
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute z-50 left-0 right-0 mt-1.5 bg-background border border-border rounded-2xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b border-border/60">
            {mode === "suggestions" ? (
              <>
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Gợi ý nhanh · Đơn hàng ưu tiên
                </span>
                {suggestionsLoading && (
                  <div className="ml-auto w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                )}
              </>
            ) : (
              <>
                <ListFilter className="w-3.5 h-3.5 text-primary" />
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Kết quả tìm kiếm
                </span>
                <span className="ml-auto text-[10px] text-muted-foreground">{results.length} kết quả</span>
              </>
            )}
          </div>

          {/* List */}
          <div className="max-h-72 overflow-y-auto overscroll-contain">
            {listItems.length === 0 ? (
              mode === "search" && !searching ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  <Search className="w-6 h-6 mx-auto mb-1.5 opacity-30" />
                  Không tìm thấy hồ sơ khớp với "{query}"
                </div>
              ) : mode === "suggestions" && !suggestionsLoading ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  Chưa có đơn hàng nào đang hoạt động
                </div>
              ) : null
            ) : (
              listItems.map(b => (
                <BookingRow
                  key={b.id}
                  b={b}
                  selected={selectedId === b.id}
                  onClick={() => handleSelect(b)}
                  onQuickPay={(bk) => handleSelect(bk)}
                  showTag={mode === "suggestions" ? getSuggestionTag(b) : undefined}
                />
              ))
            )}
          </div>

          {mode === "suggestions" && listItems.length > 0 && (
            <div className="px-3 py-2 bg-muted/30 border-t border-border/40 text-[10px] text-muted-foreground text-center">
              Gõ tên, SĐT hoặc mã đơn để tìm kiếm thêm
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Main Page ──────────────────────────── */
export default function PaymentsPage() {
  const qc = useQueryClient();
  const { effectiveIsAdmin, viewer } = useStaffAuth();

  /* Suggestions */
  const { data: suggestions = [], isLoading: suggestionsLoading } = useQuery<Booking[]>({
    queryKey: ["payment-suggestions"],
    queryFn: () => fetchJson("/api/payments/suggestions"),
    staleTime: 0,
  });

  /* Sheet + selected booking */
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

  const { data: paymentHistory = [], refetch: refetchHistory } = useQuery<Payment[]>({
    queryKey: ["payments", selectedBooking?.id],
    queryFn: () => fetchJson(`/api/payments?bookingId=${selectedBooking!.id}`),
    enabled: !!selectedBooking,
    staleTime: 0,
  });

  /* Recent payment history section */
  const [period, setPeriod] = useState<Period>("today");
  const [showAll, setShowAll] = useState(false);
  const recentLimit = showAll ? 50 : 10;

  const { data: recentData, refetch: refetchRecent, isFetching: recentFetching } = useQuery<RecentData>({
    queryKey: ["payments-recent", period, recentLimit],
    queryFn: () => fetchJson(`/api/payments/recent?period=${period}&limit=${recentLimit}`),
    staleTime: 0,
  });
  const recentPayments  = recentData?.payments  ?? [];
  const recentSummary   = recentData?.summary   ?? { count: 0, total: 0 };

  /* Form */
  const defaultCollector = viewer ? String(viewer.name || viewer.phone || "Quản Trị Viên") : "Quản Trị Viên";
  const [form, setForm] = useState({
    amount: "",
    paymentMethod: "cash",
    bankName: "",
    collectorName: defaultCollector,
    paidDate: today(),
    notes: "",
  });
  useEffect(() => {
    if (viewer) setForm(f => ({ ...f, collectorName: String(viewer.name || viewer.phone || "Quản Trị Viên") }));
  }, [viewer?.id]);

  const [proofImage, setProofImage]   = useState<string | null>(null);
  const [proofPreview, setProofPreview] = useState(false);
  const [proofPreviewUrl, setProofPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving]           = useState(false);
  const [saveError, setSaveError]     = useState<string | null>(null);
  const [mainSuccess, setMainSuccess] = useState<string | null>(null);
  const [newPaymentId, setNewPaymentId] = useState<number | null>(null);
  const fileRef                       = useRef<HTMLInputElement>(null);

  // Tự động xóa highlight sau 2s, với cleanup để tránh timer race
  useEffect(() => {
    if (newPaymentId === null) return;
    const t = setTimeout(() => setNewPaymentId(null), 2000);
    return () => clearTimeout(t);
  }, [newPaymentId]);

  /* isDirty: có dữ liệu chưa lưu */
  const isDirty = form.amount !== "" || form.notes !== "" || proofImage !== null;

  /* Reset toàn bộ form */
  const resetForm = () => {
    setForm(f => ({ ...f, amount: "", notes: "", bankName: "" }));
    setProofImage(null);
    setSaveError(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  /* Khi chọn hồ sơ → mở Sheet */
  const handleSelectBooking = (b: Booking) => {
    setSelectedBooking(b);
    setSaveError(null);
    setForm(f => ({ ...f, amount: "", notes: "", bankName: "" }));
    setProofImage(null);
    if (fileRef.current) fileRef.current.value = "";
    setSheetOpen(true);
  };

  /* Khi click vào phiếu thu gần đây → chọn booking tương ứng */
  const handleSelectFromRecent = async (p: RecentPaymentItem) => {
    if (!p.bookingId) return;
    // Set initial state từ cached data để mở Sheet ngay
    const booking: Booking = {
      id:              p.bookingId,
      orderCode:       p.orderCode ?? "",
      customerId:      0,
      customerName:    p.customerName ?? "",
      customerPhone:   p.customerPhone ?? "",
      packageType:     p.packageType ?? "",
      totalAmount:     p.totalAmount,
      discountAmount:  p.discountAmount,
      paidAmount:      p.paidAmount,
      remainingAmount: p.remainingAmount,
      status:          p.status ?? "",
      shootDate:       "",
      isParentContract: p.isParentContract,
      serviceCount:    0,
    };
    handleSelectBooking(booking);
    // Fetch fresh booking để cập nhật paidAmount chính xác (không dùng cache)
    if (p.customerPhone) {
      try {
        const fresh: Booking[] = await fetchJson(
          `/api/payments/search?q=${encodeURIComponent(p.customerPhone)}`
        );
        const refreshed = fresh.find(b => b.id === p.bookingId);
        if (refreshed) setSelectedBooking(refreshed);
      } catch {}
    }
  };

  /* Đóng Sheet: kiểm tra isDirty */
  const handleSheetOpenChange = (open: boolean) => {
    if (!open) {
      if (isDirty) {
        const confirmed = window.confirm("Bạn có chắc muốn đóng? Dữ liệu chưa lưu sẽ bị mất.");
        if (!confirmed) return;
      }
      setSheetOpen(false);
      setSelectedBooking(null);
      resetForm();
    } else {
      setSheetOpen(true);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setProofImage(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  /* Sau khi lưu: refresh dữ liệu booking từ suggestions hoặc search */
  const refreshSelectedBooking = async (current: Booking) => {
    try {
      const updated: Booking[] = await fetchJson(
        `/api/payments/search?q=${encodeURIComponent(current.customerPhone)}`
      );
      const refreshed = updated.find(b => b.id === current.id);
      if (refreshed) {
        setSelectedBooking(refreshed);
        qc.invalidateQueries({ queryKey: ["payment-suggestions"] });
      }
    } catch {}
  };

  const savePayment = async () => {
    if (!selectedBooking) return;
    const amt = parseFloat(form.amount);
    if (!amt || amt <= 0) {
      setSaveError("Vui lòng nhập số tiền thu hợp lệ");
      return;
    }
    setSaveError(null);
    setSaving(true);
    try {
      const created = await fetchJson("/api/payments", {
        method: "POST",
        body: JSON.stringify({
          bookingId:     selectedBooking.id,
          amount:        amt,
          paymentMethod: form.paymentMethod,
          paymentType:   "payment",
          collectorName: form.collectorName,
          bankName:      form.paymentMethod === "bank_transfer" ? form.bankName : null,
          proofImageUrl: proofImage ?? null,
          paidDate:      form.paidDate,
          notes:         form.notes || null,
          paidAt:        form.paidDate ? new Date(form.paidDate).toISOString() : undefined,
        }),
      });
      await refetchHistory();
      await refetchRecent();
      await refreshSelectedBooking(selectedBooking);
      qc.invalidateQueries({ queryKey: ["booking", selectedBooking.id] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["payments-recent"] });
      qc.invalidateQueries({ queryKey: ["payment-suggestions"] });
      // Chỉ reset form sau khi lưu THÀNH CÔNG
      resetForm();
      setSheetOpen(false);
      setSelectedBooking(null);
      setMainSuccess("✅ Đã lưu phiếu thu thành công!");
      setTimeout(() => setMainSuccess(null), 2500);
      // Highlight item mới trong 2 giây
      if (created?.id) {
        setNewPaymentId(Number(created.id));
      }
    } catch {
      setSaveError("Có lỗi khi lưu phiếu thu. Vui lòng thử lại.");
    } finally {
      setSaving(false);
    }
  };

  const deletePayment = useMutation({
    mutationFn: (id: number) => fetch(`${BASE}/api/payments/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await refetchHistory();
      await refetchRecent();
      if (selectedBooking) await refreshSelectedBooking(selectedBooking);
    },
  });

  /* Tính toán số tiền */
  const amtNum = parseFloat(form.amount) || 0;

  // actualPaid: source of truth — tổng từ paymentHistory (đã fetch fresh từ DB)
  // Fallback về selectedBooking.paidAmount nếu paymentHistory chưa load
  const actualPaid = paymentHistory.length > 0
    ? paymentHistory.reduce((s, p) => s + ((p as any).amount ?? 0), 0)
    : (selectedBooking?.paidAmount ?? 0);

  // effectiveRemaining: tính từ actualPaid — không dùng cache
  const effectiveTotal    = selectedBooking ? selectedBooking.totalAmount : 0;
  const effectiveDiscount = selectedBooking ? (selectedBooking.discountAmount ?? 0) : 0;
  const effectiveRemaining = Math.max(0, effectiveTotal - effectiveDiscount - actualPaid);

  const isOverpaid = amtNum > effectiveRemaining;
  const afterPay   = Math.max(0, effectiveRemaining - amtNum);

  /* Đồng bộ dữ liệu cọc cũ */
  const [syncing, setSyncing] = useState(false);
  const handleSyncDeposits = async () => {
    if (!confirm("Hệ thống sẽ:\n• Tạo phiếu thu cọc cho các đơn chưa có\n• Xóa phiếu cọc bị trùng\n• Cập nhật lại số tiền đã thu\n\nTiếp tục?")) return;
    setSyncing(true);
    try {
      const r = await fetchJson("/api/payments/sync-deposits", { method: "POST" });
      alert(r.message);
      await refetchRecent();
      qc.invalidateQueries({ queryKey: ["payment-suggestions"] });
    } catch {
      alert("Có lỗi khi đồng bộ, thử lại");
    } finally { setSyncing(false); }
  };

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Thu tiền</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {effectiveIsAdmin ? "Chọn hồ sơ → Điền thông tin → Lưu phiếu thu" : `Thu hộ bởi ${viewer?.name ?? "nhân viên"} — chụp ảnh biên nhận khi thu tiền mặt`}
          </p>
        </div>
        {effectiveIsAdmin && (
          <button
            onClick={handleSyncDeposits}
            disabled={syncing}
            title="Đồng bộ tiền cọc cũ thành phiếu thu"
            className="flex-shrink-0 flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border border-border bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            <History className="w-3.5 h-3.5" />
            {syncing ? "Đang đồng bộ..." : "Đồng bộ cọc cũ"}
          </button>
        )}
      </div>

      {!effectiveIsAdmin && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <Receipt className="w-4 h-4 shrink-0" />
          <span>Nhớ chụp ảnh biên nhận hoặc ảnh chuyển khoản khi thu tiền để quản lý kiểm tra.</span>
        </div>
      )}

      {/* Banner thành công sau khi lưu */}
      {mainSuccess && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm font-medium">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{mainSuccess}</span>
        </div>
      )}

      {/* ── Search box thông minh ─────────────────── */}
      <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-primary" /> Chọn hồ sơ cần thu
        </p>
        <SmartSearchBox
          suggestions={suggestions}
          suggestionsLoading={suggestionsLoading}
          selectedId={selectedBooking?.id}
          onSelect={handleSelectBooking}
        />
      </div>

      {/* ── Lịch sử thu gần đây ──────────────────── */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-border/60">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold">Lịch sử thu gần đây</span>
              {recentFetching && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
            </div>
            {/* Period filter tabs */}
            <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-xl">
              {([
                { v: "today",  label: "Hôm nay"   },
                { v: "7days",  label: "7 ngày"     },
                { v: "month",  label: "Tháng này"  },
              ] as { v: Period; label: string }[]).map(tab => (
                <button
                  key={tab.v}
                  onClick={() => { setPeriod(tab.v); setShowAll(false); }}
                  className={cn(
                    "px-3 py-1 rounded-lg text-xs font-semibold transition-all",
                    period === tab.v
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Summary bar */}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="bg-green-50 border border-green-100 rounded-xl px-3 py-2.5 flex items-center gap-2.5">
              <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <p className="text-[10px] text-green-600 font-medium">
                  {period === "today" ? "Hôm nay đã thu" : period === "7days" ? "7 ngày đã thu" : "Tháng này đã thu"}
                </p>
                <p className="text-sm font-bold text-green-700">{fmtVND(recentSummary.total)}</p>
              </div>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5 flex items-center gap-2.5">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Receipt className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-[10px] text-blue-600 font-medium">Số giao dịch</p>
                <p className="text-sm font-bold text-blue-700">{recentSummary.count} phiếu</p>
              </div>
            </div>
          </div>
        </div>

        {/* List */}
        <div>
          {recentPayments.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              <History className="w-8 h-8 mx-auto mb-2 opacity-25" />
              <p className="text-sm">
                {period === "today" ? "Hôm nay chưa có phiếu thu nào" :
                 period === "7days" ? "7 ngày qua chưa có phiếu thu" :
                 "Tháng này chưa có phiếu thu nào"}
              </p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-border/40">
                {recentPayments.map((p) => {
                  const isCash    = p.paymentMethod === "cash";
                  const isDeposit = p.paymentType === "deposit";
                  const isPaidFull = p.remainingAmount <= 0;
                  const txLabel   = isDeposit ? "Đặt cọc"
                                  : isPaidFull ? "Thu đủ"
                                  : p.paymentCount <= 1 ? "Thu lần đầu"
                                  : "Thu thêm";
                  const txCls     = isDeposit
                    ? "bg-amber-100 text-amber-700"
                    : isPaidFull
                    ? "bg-green-100 text-green-700"
                    : "bg-blue-100 text-blue-700";
                  const paidWhen  = p.paidDate
                    ? fmtDate(p.paidDate)
                    : p.paidAt
                    ? fmtDate(p.paidAt)
                    : "—";
                  const paidTime  = p.paidAt
                    ? new Date(p.paidAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
                    : "";

                  return (
                    <button
                      key={p.id}
                      onClick={() => handleSelectFromRecent(p)}
                      className={cn(
                        "w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors flex items-center gap-3 group",
                        p.id === newPaymentId && "bg-emerald-50 dark:bg-emerald-950/20"
                      )}
                    >
                      {/* Phương thức icon */}
                      <div className={cn(
                        "w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0",
                        isCash ? "bg-emerald-100 text-emerald-600" : "bg-blue-100 text-blue-600"
                      )}>
                        {isCash ? <Banknote className="w-4 h-4" /> : <CreditCard className="w-4 h-4" />}
                      </div>

                      {/* Thông tin chính */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-semibold text-foreground truncate">
                            {p.customerName ?? "Khách lẻ"}
                          </span>
                          <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0", txCls)}>
                            {txLabel}
                          </span>
                          {p.isParentContract && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-violet-100 text-violet-700 flex-shrink-0 flex items-center gap-0.5">
                              <Layers className="w-2.5 h-2.5" /> Đa DV
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5 flex-wrap">
                          {p.customerPhone && (
                            <span className="flex items-center gap-0.5">
                              <Phone className="w-2.5 h-2.5" />{p.customerPhone}
                            </span>
                          )}
                          {p.orderCode && (
                            <>
                              <span className="opacity-40">·</span>
                              <span className="font-mono font-medium text-primary/70">{p.orderCode}</span>
                            </>
                          )}
                          <span className="opacity-40">·</span>
                          <span className="flex items-center gap-0.5">
                            <CalendarDays className="w-2.5 h-2.5" />
                            {paidWhen}
                            {paidTime && ` ${paidTime}`}
                          </span>
                          {p.collectorName && (
                            <>
                              <span className="opacity-40">·</span>
                              <span>{p.collectorName}</span>
                            </>
                          )}
                        </div>
                        {p.notes && (
                          <p className="text-[11px] text-muted-foreground italic mt-0.5 truncate">"{p.notes}"</p>
                        )}
                      </div>

                      {/* Số tiền + ảnh + mũi tên */}
                      <div className="text-right flex-shrink-0 flex items-center gap-2">
                        <div>
                          <p className={cn(
                            "text-sm font-bold",
                            isCash ? "text-emerald-600" : "text-blue-600"
                          )}>
                            +{fmtVND(p.amount)}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {METHOD_LABEL[p.paymentMethod] ?? p.paymentMethod}
                          </p>
                        </div>
                        {p.proofImageUrl && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setProofPreviewUrl(p.proofImageUrl!);
                              setProofPreview(true);
                            }}
                            className="flex-shrink-0"
                          >
                            <img
                              src={p.proofImageUrl}
                              alt="Biên lai"
                              className="w-11 h-11 rounded-lg object-cover aspect-square border border-border flex-shrink-0"
                              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                            />
                          </button>
                        )}
                        <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors flex-shrink-0" />
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Xem thêm */}
              {!showAll && recentPayments.length >= 10 && (
                <div className="px-4 py-3 border-t border-border/40 text-center">
                  <button
                    onClick={() => setShowAll(true)}
                    className="text-xs font-semibold text-primary hover:text-primary/80 flex items-center gap-1 mx-auto transition-colors"
                  >
                    <ChevronDown className="w-3.5 h-3.5" /> Xem thêm giao dịch
                  </button>
                </div>
              )}
              {showAll && (
                <div className="px-4 py-3 border-t border-border/40 text-center">
                  <button
                    onClick={() => setShowAll(false)}
                    className="text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1 mx-auto transition-colors"
                  >
                    Thu gọn
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Sheet thu tiền ────────────────────────── */}
      <Sheet open={sheetOpen} onOpenChange={handleSheetOpenChange}>
        <SheetContent
          side="bottom"
          className="!p-0 flex flex-col overflow-hidden"
          style={{ minHeight: "85vh", maxHeight: "95vh" }}
        >
          {/* Sheet header — sticky, đủ rộng tránh nút X mặc định */}
          <div className="shrink-0 px-4 pt-4 pb-3 pr-14 border-b border-border bg-background">
            <SheetTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <Receipt className="w-4 h-4 text-primary shrink-0" />
              <span className="truncate">{selectedBooking?.customerName ?? "Thu tiền"}</span>
            </SheetTitle>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {selectedBooking?.orderCode && (
                <span className="text-xs font-mono font-bold text-primary">{selectedBooking.orderCode}</span>
              )}
              {selectedBooking?.packageType && (
                <span className="text-xs text-muted-foreground truncate">{selectedBooking.packageType}</span>
              )}
            </div>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="p-4 space-y-4">

              {/* Error banner */}
              {saveError && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1">{saveError}</span>
                  <button onClick={() => setSaveError(null)} className="flex-shrink-0 p-0.5 hover:opacity-70">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Thông tin hồ sơ */}
              {selectedBooking && (
                <div className="bg-muted/40 rounded-xl p-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Khách hàng</span>
                    <span className="font-semibold">{selectedBooking.customerName}</span>
                  </div>
                  {selectedBooking.customerPhone && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Số điện thoại</span>
                      <span>{selectedBooking.customerPhone}</span>
                    </div>
                  )}
                  {selectedBooking.orderCode && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Mã đơn</span>
                      <span className="font-mono font-bold text-primary">{selectedBooking.orderCode}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Gói dịch vụ</span>
                    <span className="text-right max-w-[180px]">{selectedBooking.packageType}</span>
                  </div>
                  <div className="border-t border-border/50 pt-2 space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tổng đơn</span>
                      <span className="font-bold">{fmtVND(selectedBooking.totalAmount)}</span>
                    </div>
                    {(selectedBooking.discountAmount ?? 0) > 0 && (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Giảm giá</span>
                          <span className="text-orange-600 font-semibold">−{fmtVND(selectedBooking.discountAmount ?? 0)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Sau giảm giá</span>
                          <span className="font-semibold text-primary">
                            {fmtVND(selectedBooking.totalAmount - (selectedBooking.discountAmount ?? 0))}
                          </span>
                        </div>
                      </>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Đã thu</span>
                      <span className="text-green-600 font-semibold">{fmtVND(selectedBooking.paidAmount)}</span>
                    </div>
                    <div className="flex justify-between text-base">
                      <span className="font-semibold">Còn lại</span>
                      <span className={cn("font-bold", effectiveRemaining > 0 ? "text-red-600" : "text-green-600")}>
                        {effectiveRemaining > 0
                          ? fmtVND(effectiveRemaining)
                          : "✓ Đã thu đủ"}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Số tiền thu lần này */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                  💰 Số tiền thu lần này *
                </label>
                <CurrencyInput
                  className="w-full px-3 py-3 border border-border rounded-xl text-base font-bold bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  value={form.amount}
                  onChange={raw => { setForm(f => ({ ...f, amount: raw })); setSaveError(null); }}
                  placeholder="Nhập số tiền cần thu..."
                />

                {/* Quick suggestion buttons */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {[500000, 1000000, 2000000].map(amt => (
                    <button key={amt} type="button"
                      onClick={() => setForm(f => ({ ...f, amount: String(amt) }))}
                      className="text-xs px-2.5 py-1.5 bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground border border-border rounded-lg font-medium transition-colors">
                      {(amt / 1000).toFixed(0)}k
                    </button>
                  ))}
                  {effectiveRemaining > 0 && (
                    <button type="button"
                      onClick={() => setForm(f => ({ ...f, amount: String(effectiveRemaining) }))}
                      className="text-xs px-2.5 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded-lg font-semibold transition-colors">
                      Thu đủ ({fmtVND(effectiveRemaining)})
                    </button>
                  )}
                </div>

                {!form.amount && (
                  <p className="mt-1.5 text-xs text-muted-foreground italic">
                    Vui lòng nhập số tiền cần thu hoặc chọn gợi ý bên trên
                  </p>
                )}
                {amtNum > 0 && (
                  <div className={cn(
                    "mt-1.5 flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-2",
                    isOverpaid ? "bg-orange-50 text-orange-700" : "bg-green-50 text-green-700"
                  )}>
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    {isOverpaid
                      ? "Số thu vượt quá số còn nợ"
                      : `Còn lại sau khi thu: ${fmtVND(afterPay)}`}
                  </div>
                )}
              </div>

              {/* Hình thức */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                  💳 Hình thức thanh toán
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { v: "cash",          label: "💵 Tiền mặt"     },
                    { v: "bank_transfer", label: "🏦 Chuyển khoản" },
                  ].map(opt => (
                    <button
                      key={opt.v}
                      onClick={() => setForm(f => ({ ...f, paymentMethod: opt.v }))}
                      className={cn(
                        "py-2.5 rounded-xl text-sm font-medium border transition-all",
                        form.paymentMethod === opt.v
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-muted/30 text-muted-foreground hover:border-primary/40"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {form.paymentMethod === "bank_transfer" && (
                  <input
                    className="mt-2 w-full px-3 py-2 border border-border rounded-xl text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="Tên ngân hàng / Số tài khoản / Mã giao dịch..."
                    value={form.bankName}
                    onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))}
                  />
                )}
              </div>

              {/* Người thu & Ngày thu */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">👤 Người thu</label>
                  <input
                    className={`w-full px-3 py-2 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${effectiveIsAdmin ? "bg-background" : "bg-muted/40 cursor-default"}`}
                    value={form.collectorName}
                    onChange={e => effectiveIsAdmin && setForm(f => ({ ...f, collectorName: e.target.value }))}
                    readOnly={!effectiveIsAdmin}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">📅 Ngày thu</label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 border border-border rounded-xl text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                    value={form.paidDate}
                    onChange={e => setForm(f => ({ ...f, paidDate: e.target.value }))}
                  />
                </div>
              </div>

              {/* Bằng chứng */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                  📷 Bằng chứng thu tiền
                </label>
                {proofImage ? (
                  <div className="relative rounded-xl overflow-hidden border border-border">
                    <img src={proofImage} alt="bằng chứng" className="w-full max-h-32 object-cover" />
                    <div className="absolute top-1.5 right-1.5 flex gap-1">
                      <button
                        onClick={() => { setProofPreviewUrl(proofImage); setProofPreview(true); }}
                        className="p-1.5 bg-black/60 text-white rounded-lg"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => { setProofImage(null); if (fileRef.current) fileRef.current.value = ""; }}
                        className="p-1.5 bg-black/60 text-white rounded-lg"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="w-full border-2 border-dashed border-border rounded-xl py-4 text-xs text-muted-foreground hover:border-primary/40 hover:bg-muted/20 transition-all flex items-center justify-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    Tải ảnh chuyển khoản / biên lai / phiếu thu
                  </button>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                />
              </div>

              {/* Ghi chú */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">📝 Ghi chú</label>
                <textarea
                  className="w-full px-3 py-2 border border-border rounded-xl text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                  rows={2}
                  placeholder="Khách đưa thiếu / Thu lần 2 / Giữ cọc / Thu hộ..."
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>

              {/* ── Lịch sử thu của booking này ───── */}
              <div className="pt-2">
                <p className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-primary" /> Lịch sử thu tiền
                  {paymentHistory.length > 0 && (
                    <span className="ml-1 text-[11px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                      {paymentHistory.length} phiếu
                    </span>
                  )}
                </p>

                {paymentHistory.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Receipt className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Chưa có phiếu thu nào</p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {paymentHistory.map(p => (
                      <div
                        key={p.id}
                        className="border border-border rounded-xl p-3 bg-muted/20 space-y-2"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <div className={cn(
                              "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                              p.paymentType === "deposit"
                                ? "bg-amber-100 text-amber-700"
                                : p.paymentMethod === "cash"
                                ? "bg-green-100 text-green-700"
                                : "bg-blue-100 text-blue-700"
                            )}>
                              {p.paymentMethod === "cash"
                                ? <Banknote className="w-4 h-4" />
                                : <CreditCard className="w-4 h-4" />}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <p className="text-sm font-bold text-primary">{fmtVND(p.amount)}</p>
                                {p.paymentType === "deposit" && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">
                                    Cọc
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {METHOD_LABEL[p.paymentMethod] ?? p.paymentMethod}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {p.proofImageUrl && (
                              <button
                                onClick={() => { setProofPreviewUrl(p.proofImageUrl!); setProofPreview(true); }}
                                className="text-[10px] px-2 py-1 bg-primary/10 text-primary rounded-lg flex items-center gap-0.5 font-medium"
                              >
                                <Eye className="w-3 h-3" /> Ảnh
                              </button>
                            )}
                            {effectiveIsAdmin && (
                              <button
                                onClick={() => { if (confirm("Xóa phiếu thu này?")) deletePayment.mutate(p.id); }}
                                className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground space-y-0.5 pl-10">
                          <div className="flex items-center gap-2">
                            <Clock className="w-3 h-3 flex-shrink-0" />
                            <span>{p.paidDate ? fmtDate(p.paidDate) : fmtDate(p.paidAt)}</span>
                            {p.collectorName && (
                              <><span className="opacity-40">·</span><span>{p.collectorName}</span></>
                            )}
                          </div>
                          {p.bankName && (
                            <p className="pl-4">{p.bankName}</p>
                          )}
                          {p.notes && (
                            <p className="pl-4 italic">"{p.notes}"</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Tổng kết */}
                {selectedBooking && paymentHistory.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-border space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tổng đã thu</span>
                      <span className="font-bold text-green-600">{fmtVND(actualPaid)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Còn lại</span>
                      <span className={cn(
                        "font-bold",
                        effectiveRemaining > 0 ? "text-red-600" : "text-green-600"
                      )}>
                        {effectiveRemaining > 0
                          ? fmtVND(effectiveRemaining)
                          : "✓ Đã thu đủ"}
                      </span>
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>

          {/* Sticky save button */}
          <div className="shrink-0 p-4 border-t border-border bg-background">
            <button
              onClick={savePayment}
              disabled={saving || !form.amount || amtNum <= 0}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "Đang lưu..." : "✅ Lưu phiếu thu"}
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Proof image lightbox */}
      {proofPreview && proofPreviewUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85"
          onClick={() => { setProofPreview(false); setProofPreviewUrl(null); }}
        >
          <div
            className="relative max-w-lg max-h-[90vh]"
            onClick={e => e.stopPropagation()}
          >
            <img
              src={proofPreviewUrl}
              alt="bằng chứng"
              className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl"
            />
            <button
              onClick={() => { setProofPreview(false); setProofPreviewUrl(null); }}
              className="absolute top-3 right-3 bg-black/60 text-white rounded-full p-1.5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
