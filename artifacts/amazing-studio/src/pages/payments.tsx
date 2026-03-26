import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search, CreditCard, Banknote, Phone, User, FileText, CheckCircle2,
  Clock, Trash2, X, Upload, Eye, ChevronRight, AlertCircle, Receipt,
} from "lucide-react";
import { Button, Input, Select, Textarea, Badge, Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const fetchJson = (url: string, opts?: RequestInit) =>
  fetch(`${BASE}${url}`, { headers: { "Content-Type": "application/json" }, ...opts }).then(r => r.json());

const fmtVND = (n: number) => n?.toLocaleString("vi-VN") + "đ";
const fmtDate = (d: string | Date) => new Date(d).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
const today = () => new Date().toISOString().split("T")[0];

type SearchResult = {
  id: number; orderCode: string; customerId: number;
  customerName: string; customerPhone: string; customerCode?: string;
  packageType: string; totalAmount: number; paidAmount: number; remainingAmount: number;
  status: string; shootDate: string; notes?: string;
};

type Payment = {
  id: number; bookingId?: number; amount: number;
  paymentMethod: string; paymentType: string;
  collectorName?: string; bankName?: string; proofImageUrl?: string;
  paidDate?: string; notes?: string; paidAt: string;
};

const METHOD_LABEL: Record<string, string> = { cash: "Tiền mặt", bank_transfer: "Chuyển khoản" };
const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pending:     { label: "Chờ xác nhận", cls: "bg-yellow-100 text-yellow-700" },
  confirmed:   { label: "Đã xác nhận",  cls: "bg-blue-100 text-blue-700"   },
  in_progress: { label: "Đang thực hiện", cls: "bg-purple-100 text-purple-700" },
  completed:   { label: "Hoàn thành",   cls: "bg-green-100 text-green-700"  },
  cancelled:   { label: "Đã hủy",       cls: "bg-red-100 text-red-700"     },
};

export default function PaymentsPage() {
  const qc = useQueryClient();

  /* ─── Search ─────────────────────────────────── */
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  const doSearch = useCallback((q: string) => {
    clearTimeout(searchTimer.current);
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetchJson(`/api/payments/search?q=${encodeURIComponent(q)}`);
        setSearchResults(res);
      } finally { setSearching(false); }
    }, 300);
  }, []);

  /* ─── Selected booking ───────────────────────── */
  const [selectedBooking, setSelectedBooking] = useState<SearchResult | null>(null);

  const { data: paymentHistory = [], refetch: refetchHistory } = useQuery<Payment[]>({
    queryKey: ["payments", selectedBooking?.id],
    queryFn: () => fetchJson(`/api/payments?bookingId=${selectedBooking!.id}`),
    enabled: !!selectedBooking,
  });

  /* ─── Collection form ────────────────────────── */
  const [form, setForm] = useState({
    amount: "",
    paymentMethod: "cash",
    bankName: "",
    collectorName: "Quản Trị Viên",
    paidDate: today(),
    notes: "",
  });
  const [proofImage, setProofImage] = useState<string | null>(null);
  const [proofPreview, setProofPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setProofImage(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const selectBooking = (b: SearchResult) => {
    setSelectedBooking(b);
    setForm(f => ({ ...f, amount: String(Math.max(0, b.remainingAmount)) }));
    setProofImage(null);
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
          proofImageUrl: proofImage || null,
          paidDate:      form.paidDate,
          notes:         form.notes || null,
          paidAt:        form.paidDate ? new Date(form.paidDate).toISOString() : undefined,
        }),
      });
      await refetchHistory();
      qc.invalidateQueries({ queryKey: ["bookings"] });
      // Refresh selected booking data
      const updated = await fetchJson(`/api/payments/search?q=${encodeURIComponent(selectedBooking.customerPhone)}`);
      const refreshed = updated.find((b: SearchResult) => b.id === selectedBooking.id);
      if (refreshed) {
        setSelectedBooking(refreshed);
        setSearchResults(prev => prev.map((r: SearchResult) => r.id === refreshed.id ? refreshed : r));
      }
      setForm(f => ({ ...f, amount: String(Math.max(0, (refreshed?.remainingAmount ?? 0))), notes: "", bankName: "" }));
      setProofImage(null);
      if (fileRef.current) fileRef.current.value = "";
    } finally { setSaving(false); }
  };

  const deletePayment = useMutation({
    mutationFn: (id: number) => fetch(`${BASE}/api/payments/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await refetchHistory();
      if (selectedBooking) {
        const updated = await fetchJson(`/api/payments/search?q=${encodeURIComponent(selectedBooking.customerPhone)}`);
        const refreshed = updated.find((b: SearchResult) => b.id === selectedBooking.id);
        if (refreshed) { setSelectedBooking(refreshed); setSearchResults(prev => prev.map((r: SearchResult) => r.id === refreshed.id ? refreshed : r)); }
      }
    },
  });

  const amtNum = parseFloat(form.amount) || 0;
  const remaining = selectedBooking ? Math.max(0, selectedBooking.remainingAmount - amtNum) : 0;
  const isOverpaid  = amtNum > (selectedBooking?.remainingAmount ?? 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Thu tiền</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Tìm hồ sơ → Thu tiền → Xác nhận → Lưu bằng chứng</p>
      </div>

      {/* ── Tìm kiếm hồ sơ ─────────────────────────── */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">🔍 Tìm hồ sơ cần thu</p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            className="w-full pl-9 pr-4 py-2.5 border border-border rounded-xl text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Nhập tên khách, số điện thoại hoặc mã đơn hàng..."
            value={searchQ}
            onChange={e => { setSearchQ(e.target.value); doSearch(e.target.value); }}
            autoComplete="off"
          />
          {searching && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />}
        </div>

        {searchResults.length > 0 && (
          <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
            {searchResults.map(b => (
              <button
                key={b.id}
                onClick={() => selectBooking(b)}
                className={cn(
                  "w-full text-left border rounded-xl px-3 py-2.5 transition-all",
                  selectedBooking?.id === b.id
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border bg-card hover:border-primary/40 hover:bg-muted/30"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold flex-shrink-0">
                      {b.customerName?.[0]?.toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{b.customerName}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-2">
                        <span className="flex items-center gap-0.5"><Phone className="w-3 h-3" /> {b.customerPhone}</span>
                        {b.customerCode && <span className="text-primary/60">• {b.customerCode}</span>}
                        {b.orderCode && <span>• {b.orderCode}</span>}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-foreground">{fmtVND(b.totalAmount)}</p>
                    {b.remainingAmount > 0
                      ? <p className="text-xs text-red-600 font-medium">Còn: {fmtVND(b.remainingAmount)}</p>
                      : <p className="text-xs text-green-600 font-medium">✓ Đã đủ</p>}
                  </div>
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{b.packageType}</span>
                  <span>•</span>
                  <span>{fmtDate(b.shootDate)}</span>
                  <span className={cn("ml-auto px-1.5 py-0.5 rounded text-[10px] font-semibold", STATUS_LABEL[b.status]?.cls)}>
                    {STATUS_LABEL[b.status]?.label ?? b.status}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        {searchQ && !searching && searchResults.length === 0 && (
          <p className="mt-3 text-sm text-center text-muted-foreground py-4">Không tìm thấy hồ sơ khớp với "{searchQ}"</p>
        )}
      </div>

      {/* ── Phiếu thu tiền ──────────────────────────── */}
      {selectedBooking && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* LEFT: Form thu tiền */}
          <div className="bg-card border border-border rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">📋 Phiếu thu tiền</p>
              <button onClick={() => setSelectedBooking(null)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Thông tin hồ sơ */}
            <div className="bg-muted/40 rounded-xl p-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Khách hàng</span>
                <span className="font-semibold">{selectedBooking.customerName} — {selectedBooking.customerPhone}</span>
              </div>
              {selectedBooking.orderCode && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Mã đơn</span>
                  <span className="font-mono font-semibold text-primary">{selectedBooking.orderCode}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Gói dịch vụ</span>
                <span className="font-medium">{selectedBooking.packageType}</span>
              </div>
              <div className="border-t border-border/60 pt-2 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tổng đơn</span>
                  <span className="font-bold">{fmtVND(selectedBooking.totalAmount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Đã thu trước</span>
                  <span className="text-green-600 font-semibold">{fmtVND(selectedBooking.paidAmount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground font-medium">Còn lại</span>
                  <span className={cn("font-bold text-base", selectedBooking.remainingAmount > 0 ? "text-red-600" : "text-green-600")}>
                    {fmtVND(selectedBooking.remainingAmount)}
                  </span>
                </div>
              </div>
            </div>

            {/* Số tiền thu lần này */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">💰 Số tiền thu lần này *</label>
              <div className="relative">
                <input
                  type="number"
                  className="w-full px-3 py-2.5 border border-border rounded-xl text-sm font-bold text-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="0"
                />
                {selectedBooking.remainingAmount > 0 && (
                  <button
                    onClick={() => setForm(f => ({ ...f, amount: String(selectedBooking.remainingAmount) }))}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] px-2 py-0.5 bg-primary/10 text-primary rounded font-medium hover:bg-primary/20"
                  >
                    Thu đủ
                  </button>
                )}
              </div>
              {amtNum > 0 && (
                <div className={cn("mt-1.5 flex items-center gap-1 text-xs font-medium rounded-lg px-2.5 py-1.5", isOverpaid ? "bg-orange-50 text-orange-700" : "bg-green-50 text-green-700")}>
                  {isOverpaid
                    ? <><AlertCircle className="w-3.5 h-3.5" /> Số thu vượt quá số còn nợ</>
                    : <><CheckCircle2 className="w-3.5 h-3.5" /> Còn lại sau khi thu: {fmtVND(remaining)}</>}
                </div>
              )}
            </div>

            {/* Hình thức thanh toán */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1.5">💳 Hình thức thanh toán</label>
              <div className="grid grid-cols-2 gap-2">
                {[{ v: "cash", label: "💵 Tiền mặt" }, { v: "bank_transfer", label: "🏦 Chuyển khoản" }].map(opt => (
                  <button
                    key={opt.v}
                    onClick={() => setForm(f => ({ ...f, paymentMethod: opt.v }))}
                    className={cn(
                      "py-2 rounded-xl text-sm font-medium border transition-all",
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
                  placeholder="Tên ngân hàng / Số tài khoản..."
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
              <label className="text-xs font-semibold text-muted-foreground block mb-1.5">📷 Bằng chứng thu tiền</label>
              {proofImage ? (
                <div className="relative rounded-xl overflow-hidden border border-border">
                  <img src={proofImage} alt="bằng chứng" className="w-full max-h-32 object-cover" />
                  <div className="absolute top-1.5 right-1.5 flex gap-1">
                    <button onClick={() => setProofPreview(true)} className="p-1 bg-black/50 text-white rounded-lg"><Eye className="w-3.5 h-3.5" /></button>
                    <button onClick={() => { setProofImage(null); if (fileRef.current) fileRef.current.value = ""; }} className="p-1 bg-black/50 text-white rounded-lg"><X className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full border-2 border-dashed border-border rounded-xl py-3 text-xs text-muted-foreground hover:border-primary/40 hover:bg-muted/20 transition-all flex items-center justify-center gap-2"
                >
                  <Upload className="w-4 h-4" /> Upload ảnh chuyển khoản / phiếu thu
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
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
              disabled={saving || !form.amount}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "Đang lưu..." : "✅ Lưu phiếu thu"}
            </button>
          </div>

          {/* RIGHT: Lịch sử thu tiền */}
          <div className="bg-card border border-border rounded-2xl p-4">
            <p className="text-sm font-semibold mb-3">📑 Lịch sử thu tiền</p>
            {paymentHistory.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Receipt className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Chưa có phiếu thu nào</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {paymentHistory.map(p => (
                  <div key={p.id} className="border border-border rounded-xl p-3 bg-muted/20">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className={cn("w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                          p.paymentMethod === "cash" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700")}>
                          {p.paymentMethod === "cash" ? <Banknote className="w-4 h-4" /> : <CreditCard className="w-4 h-4" />}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-primary">{fmtVND(p.amount)}</p>
                          <p className="text-xs text-muted-foreground">{METHOD_LABEL[p.paymentMethod] ?? p.paymentMethod}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {p.proofImageUrl && (
                          <button
                            onClick={() => { setProofImage(p.proofImageUrl!); setProofPreview(true); }}
                            className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded flex items-center gap-0.5"
                          >
                            <Eye className="w-3 h-3" /> Ảnh
                          </button>
                        )}
                        <button
                          onClick={() => { if (confirm("Xóa phiếu thu này?")) deletePayment.mutate(p.id); }}
                          className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3 h-3" />
                        {p.paidDate ? fmtDate(p.paidDate) : fmtDate(p.paidAt)}
                        {p.collectorName && <><span>•</span><span>{p.collectorName}</span></>}
                        {p.bankName && <><span>•</span><span>{p.bankName}</span></>}
                      </div>
                      {p.notes && <p className="italic pl-4">"{p.notes}"</p>}
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
                  <span className={cn("font-bold", selectedBooking.remainingAmount > 0 ? "text-red-600" : "text-green-600")}>
                    {selectedBooking.remainingAmount > 0 ? fmtVND(selectedBooking.remainingAmount) : "✓ Đã thu đủ"}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Proof image preview dialog */}
      {proofPreview && proofImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={() => setProofPreview(false)}>
          <div className="relative max-w-lg max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <img src={proofImage} alt="bằng chứng" className="max-w-full max-h-[85vh] object-contain rounded-xl" />
            <button onClick={() => setProofPreview(false)} className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1.5">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
