import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search, CreditCard, Banknote, Phone, Clock, Trash2,
  X, Upload, Eye, AlertCircle, Receipt, ChevronDown,
  Sparkles, ListFilter,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  showTag,
}: {
  b: Booking;
  selected: boolean;
  onClick: () => void;
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

  return (
    <button
      onMouseDown={onClick}
      className={cn(
        "w-full text-left px-3 py-3 transition-all border-b border-border/30 last:border-0",
        selected
          ? "bg-primary/8"
          : "hover:bg-muted/50 active:bg-muted/80"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        {/* Avatar + info */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={cn(
            "w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0",
            selected ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
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
              {b.remainingAmount <= 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-green-100 text-green-700">
                  ✓ Đủ
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

        {/* Số tiền + ngày */}
        <div className="text-right flex-shrink-0">
          {b.remainingAmount > 0 ? (
            <p className="text-sm font-bold text-red-600">−{fmtVND(b.remainingAmount)}</p>
          ) : (
            <p className="text-sm font-bold text-green-600">{fmtVND(b.totalAmount)}</p>
          )}
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {b.latestPaymentAt
              ? fmtDate(b.latestPaymentAt)
              : fmtDate(b.createdAt ?? b.shootDate)}
          </p>
          <div className="flex items-center justify-end gap-1 mt-0.5">
            <span className={cn("w-1.5 h-1.5 rounded-full", statusCfg?.dot ?? "bg-gray-300")} />
            <span className="text-[9px] text-muted-foreground">{statusCfg?.label ?? b.status}</span>
          </div>
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
                  showTag={mode === "suggestions" ? getSuggestionTag(b) : undefined}
                />
              ))
            )}
          </div>

          {/* Footer gợi ý */}
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

  /* Suggestions */
  const { data: suggestions = [], isLoading: suggestionsLoading } = useQuery<Booking[]>({
    queryKey: ["payment-suggestions"],
    queryFn: () => fetchJson("/api/payments/suggestions"),
    staleTime: 0,
  });

  /* Selected booking */
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

  const { data: paymentHistory = [], refetch: refetchHistory } = useQuery<Payment[]>({
    queryKey: ["payments", selectedBooking?.id],
    queryFn: () => fetchJson(`/api/payments?bookingId=${selectedBooking!.id}`),
    enabled: !!selectedBooking,
  });

  /* Form */
  const [form, setForm] = useState({
    amount: "",
    paymentMethod: "cash",
    bankName: "",
    collectorName: "Quản Trị Viên",
    paidDate: today(),
    notes: "",
  });
  const [proofImage, setProofImage]   = useState<string | null>(null);
  const [proofPreview, setProofPreview] = useState(false);
  const [saving, setSaving]           = useState(false);
  const fileRef                       = useRef<HTMLInputElement>(null);

  /* Khi chọn hồ sơ */
  const handleSelectBooking = (b: Booking) => {
    setSelectedBooking(b);
    setForm(f => ({ ...f, amount: String(Math.max(0, b.remainingAmount)) }));
    setProofImage(null);
    if (fileRef.current) fileRef.current.value = "";
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
    if (!amt || amt <= 0) { alert("Vui lòng nhập số tiền thu"); return; }
    setSaving(true);
    try {
      await fetchJson("/api/payments", {
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
      await refreshSelectedBooking(selectedBooking);
      setForm(f => ({
        ...f,
        amount: String(Math.max(0, (selectedBooking?.remainingAmount ?? 0) - amt)),
        notes: "",
        bankName: "",
      }));
      setProofImage(null);
      if (fileRef.current) fileRef.current.value = "";
    } finally { setSaving(false); }
  };

  const deletePayment = useMutation({
    mutationFn: (id: number) => fetch(`${BASE}/api/payments/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await refetchHistory();
      if (selectedBooking) await refreshSelectedBooking(selectedBooking);
    },
  });

  const amtNum   = parseFloat(form.amount) || 0;
  const isOverpaid = amtNum > (selectedBooking?.remainingAmount ?? 0);
  const afterPay   = Math.max(0, (selectedBooking?.remainingAmount ?? 0) - amtNum);

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Thu tiền</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Chọn hồ sơ → Điền thông tin → Lưu phiếu thu
        </p>
      </div>

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

      {/* ── Phiếu thu + Lịch sử ──────────────────── */}
      {selectedBooking && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* LEFT: Form thu */}
          <div className="bg-card border border-border rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold flex items-center gap-1.5">
                <Receipt className="w-4 h-4 text-primary" /> Phiếu thu tiền
              </p>
              <button
                onClick={() => setSelectedBooking(null)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Thông tin hồ sơ */}
            <div className="bg-muted/40 rounded-xl p-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Khách hàng</span>
                <span className="font-semibold">{selectedBooking.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Số điện thoại</span>
                <span>{selectedBooking.customerPhone}</span>
              </div>
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
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Đã thu</span>
                  <span className="text-green-600 font-semibold">{fmtVND(selectedBooking.paidAmount)}</span>
                </div>
                <div className="flex justify-between text-base">
                  <span className="font-semibold">Còn lại</span>
                  <span className={cn("font-bold", selectedBooking.remainingAmount > 0 ? "text-red-600" : "text-green-600")}>
                    {selectedBooking.remainingAmount > 0
                      ? fmtVND(selectedBooking.remainingAmount)
                      : "✓ Đã thu đủ"}
                  </span>
                </div>
              </div>
            </div>

            {/* Số tiền thu lần này */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                💰 Số tiền thu lần này *
              </label>
              <div className="relative">
                <input
                  type="number"
                  className="w-full px-3 py-3 border border-border rounded-xl text-base font-bold bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 pr-20"
                  value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="0"
                />
                {selectedBooking.remainingAmount > 0 && (
                  <button
                    onClick={() => setForm(f => ({ ...f, amount: String(selectedBooking.remainingAmount) }))}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] px-2.5 py-1 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors"
                  >
                    Thu đủ
                  </button>
                )}
              </div>
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
                  className="w-full px-3 py-2 border border-border rounded-xl text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  value={form.collectorName}
                  onChange={e => setForm(f => ({ ...f, collectorName: e.target.value }))}
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
                      onClick={() => setProofPreview(true)}
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

            <button
              onClick={savePayment}
              disabled={saving || !form.amount || amtNum <= 0}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "Đang lưu..." : "✅ Lưu phiếu thu"}
            </button>
          </div>

          {/* RIGHT: Lịch sử thu */}
          <div className="bg-card border border-border rounded-2xl p-4">
            <p className="text-sm font-semibold mb-3 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-primary" /> Lịch sử thu tiền
              {paymentHistory.length > 0 && (
                <span className="ml-1 text-[11px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                  {paymentHistory.length} phiếu
                </span>
              )}
            </p>

            {paymentHistory.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
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
                          p.paymentMethod === "cash"
                            ? "bg-green-100 text-green-700"
                            : "bg-blue-100 text-blue-700"
                        )}>
                          {p.paymentMethod === "cash"
                            ? <Banknote className="w-4 h-4" />
                            : <CreditCard className="w-4 h-4" />}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-primary">{fmtVND(p.amount)}</p>
                          <p className="text-xs text-muted-foreground">
                            {METHOD_LABEL[p.paymentMethod] ?? p.paymentMethod}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {p.proofImageUrl && (
                          <button
                            onClick={() => { setProofImage(p.proofImageUrl!); setProofPreview(true); }}
                            className="text-[10px] px-2 py-1 bg-primary/10 text-primary rounded-lg flex items-center gap-0.5 font-medium"
                          >
                            <Eye className="w-3 h-3" /> Ảnh
                          </button>
                        )}
                        <button
                          onClick={() => { if (confirm("Xóa phiếu thu này?")) deletePayment.mutate(p.id); }}
                          className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
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
            {paymentHistory.length > 0 && (
              <div className="mt-4 pt-3 border-t border-border space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tổng đã thu</span>
                  <span className="font-bold text-green-600">{fmtVND(selectedBooking.paidAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Còn lại</span>
                  <span className={cn(
                    "font-bold",
                    selectedBooking.remainingAmount > 0 ? "text-red-600" : "text-green-600"
                  )}>
                    {selectedBooking.remainingAmount > 0
                      ? fmtVND(selectedBooking.remainingAmount)
                      : "✓ Đã thu đủ"}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Proof image lightbox */}
      {proofPreview && proofImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85"
          onClick={() => setProofPreview(false)}
        >
          <div
            className="relative max-w-lg max-h-[90vh]"
            onClick={e => e.stopPropagation()}
          >
            <img
              src={proofImage}
              alt="bằng chứng"
              className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl"
            />
            <button
              onClick={() => setProofPreview(false)}
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
