import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatVND, formatDate } from "@/lib/utils";
import { getImageSrc } from "@/lib/imageUtils";
import { Button, Input, Select, Textarea, Badge, Card, CardContent, Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui";
import {
  Plus, Search, Phone, MapPin, Clock, Package2, ChevronRight, X, CheckCircle2,
  CreditCard, AlertCircle, FileText, Users, DollarSign, Receipt, ListChecks,
  Trash2, Edit2, Printer, Download
} from "lucide-react";
import { ServiceSearchBox, type ServiceOption } from "@/components/service-search-box";
import { SurchargeEditor, type SurchargeItem } from "@/components/surcharge-editor";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const fetchJson = (url: string, opts?: RequestInit) =>
  fetch(`${BASE}${url}`, { headers: { "Content-Type": "application/json" }, ...opts }).then(r => r.json());

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "Chờ xác nhận", color: "text-yellow-700", bg: "bg-yellow-100 border-yellow-200" },
  confirmed: { label: "Đã xác nhận", color: "text-blue-700", bg: "bg-blue-100 border-blue-200" },
  in_progress: { label: "Đang thực hiện", color: "text-purple-700", bg: "bg-purple-100 border-purple-200" },
  completed: { label: "Hoàn thành", color: "text-green-700", bg: "bg-green-100 border-green-200" },
  cancelled: { label: "Đã hủy", color: "text-red-700", bg: "bg-red-100 border-red-200" },
};

const SERVICE_CAT: Record<string, string> = {
  wedding: "Chụp cưới", beauty: "Chụp beauty", family: "Chụp gia đình",
  fashion: "Chụp thời trang", event: "Sự kiện", other: "Khác",
};

const PAYMENT_METHOD: Record<string, string> = {
  cash: "Tiền mặt", transfer: "Chuyển khoản", other: "Khác",
};

const PAYMENT_TYPE: Record<string, string> = {
  deposit: "Tiền cọc", partial: "Thanh toán một phần", payment: "Thanh toán", full: "Thanh toán đủ",
};

type Booking = {
  id: number; orderCode: string; customerId: number; customerName: string; customerPhone: string;
  shootDate: string; shootTime?: string; serviceCategory: string; packageType: string; location?: string;
  status: string; items: { name?: string; qty?: number; unitPrice?: number; total?: number; serviceName?: string; price?: number; notes?: string; conceptImages?: string[]; [key: string]: unknown }[];
  totalAmount: number; depositAmount: number; paidAmount: number; discountAmount: number; remainingAmount: number;
  totalExpenses: number; grossProfit: number; internalNotes?: string; notes?: string;
  payments: Payment[]; expenses: Expense[]; tasks: Task[];
  assignedStaff: number[]; createdAt: string;
};

type Payment = {
  id: number; amount: number; paymentMethod: string; paymentType: string; notes?: string; paidAt: string;
};

type Expense = {
  id: number; category: string; amount: number; description: string; type: string; expenseDate: string; paymentMethod: string;
};

type Task = {
  id: number; title: string; status: string; priority: string; dueDate?: string; assigneeName?: string; category: string;
};

type SimpleBooking = {
  id: number; orderCode: string; customerName: string; customerPhone: string; shootDate: string; shootTime?: string;
  serviceCategory: string; packageType: string; status: string; totalAmount: number; paidAmount: number; remainingAmount: number; createdAt: string;
};

export default function BookingsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showPayForm, setShowPayForm] = useState(false);
  const [activeTab, setActiveTab] = useState<"info" | "payment" | "expense" | "task">("info");
  const [payForm, setPayForm] = useState({ amount: "", paymentMethod: "transfer", paymentType: "payment", notes: "" });

  const { data: bookings = [], isLoading } = useQuery<SimpleBooking[]>({
    queryKey: ["bookings"],
    queryFn: () => fetchJson("/api/bookings"),
  });

  const { data: customers = [] } = useQuery<{ id: number; name: string; phone: string; customCode?: string }[]>({
    queryKey: ["customers-light"],
    queryFn: () => fetchJson("/api/customers"),
  });

  const { data: detail, isLoading: detailLoading } = useQuery<Booking>({
    queryKey: ["booking", selectedId],
    queryFn: () => fetchJson(`/api/bookings/${selectedId}`),
    enabled: !!selectedId,
  });

  const addPayment = useMutation({
    mutationFn: (data: Record<string, unknown>) => fetchJson("/api/payments", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["booking", selectedId] }); qc.invalidateQueries({ queryKey: ["bookings"] }); setShowPayForm(false); setPayForm({ amount: "", paymentMethod: "transfer", paymentType: "payment", notes: "" }); },
  });

  const deletePayment = useMutation({
    mutationFn: (id: number) => fetch(`${BASE}/api/payments/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["booking", selectedId] }); qc.invalidateQueries({ queryKey: ["bookings"] }); },
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => fetchJson(`/api/bookings/${id}`, { method: "PUT", body: JSON.stringify({ status }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["booking", selectedId] }); qc.invalidateQueries({ queryKey: ["bookings"] }); },
  });

  const deleteBooking = useMutation({
    mutationFn: (id: number) => fetch(`${BASE}/api/bookings/${id}`, { method: "DELETE" }),
    onSuccess: () => { setSelectedId(null); qc.invalidateQueries({ queryKey: ["bookings"] }); },
  });

  const filtered = bookings.filter(b => {
    const matchSearch = !search || b.customerName.toLowerCase().includes(search.toLowerCase()) || b.orderCode?.toLowerCase().includes(search.toLowerCase()) || b.customerPhone.includes(search);
    const matchStatus = !statusFilter || b.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totals = {
    total: bookings.reduce((s, b) => s + b.totalAmount, 0),
    paid: bookings.reduce((s, b) => s + b.paidAmount, 0),
    remaining: bookings.reduce((s, b) => s + b.remainingAmount, 0),
    count: bookings.length,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold">Quản lý Đơn hàng</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Tạo đơn, theo dõi tiến độ và thu tiền tất cả trong một màn hình</p>
        </div>
        <Button onClick={() => setShowCreateForm(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Tạo đơn mới
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Tổng đơn", value: totals.count, sub: "đơn hàng", color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Tổng doanh thu", value: formatVND(totals.total), sub: "dự kiến", color: "text-green-600", bg: "bg-green-50" },
          { label: "Đã thu", value: formatVND(totals.paid), sub: "thực tế", color: "text-primary", bg: "bg-primary/5" },
          { label: "Còn công nợ", value: formatVND(totals.remaining), sub: "chưa thu", color: "text-red-600", bg: "bg-red-50" },
        ].map(c => (
          <div key={c.label} className={`rounded-xl border p-3 ${c.bg}`}>
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className={`text-lg font-bold ${c.color}`}>{c.value}</p>
            <p className="text-xs text-muted-foreground">{c.sub}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-4">
        {/* List */}
        <div className={`flex-1 ${selectedId ? "hidden lg:flex lg:flex-col" : "flex flex-col"} min-w-0`}>
          {/* Filters */}
          <div className="flex gap-2 mb-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Tìm khách, mã đơn, SĐT..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-40">
              <option value="">Tất cả</option>
              {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
          </div>

          {isLoading ? (
            <div className="flex-1 flex items-center justify-center py-20 text-muted-foreground">Đang tải...</div>
          ) : filtered.length === 0 ? (
            <div className="flex-1 flex items-center justify-center py-20 text-muted-foreground">Không có đơn hàng</div>
          ) : (
            <div className="space-y-2 overflow-y-auto">
              {filtered.map(b => {
                const s = STATUS_MAP[b.status] ?? STATUS_MAP.pending;
                const pct = b.totalAmount > 0 ? (b.paidAmount / b.totalAmount) * 100 : 0;
                return (
                  <div
                    key={b.id}
                    onClick={() => { setSelectedId(b.id); setActiveTab("info"); }}
                    className={`rounded-xl border p-4 cursor-pointer transition-all hover:shadow-md ${selectedId === b.id ? "border-primary bg-primary/5 shadow-sm" : "bg-card hover:border-primary/40"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm">{b.customerName}</span>
                          <span className="text-xs text-muted-foreground">{b.orderCode}</span>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${s.bg}`}>{s.label}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                          <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{b.customerPhone}</span>
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDate(b.shootDate)} {b.shootTime?.slice(0, 5)}</span>
                          <span className="flex items-center gap-1"><Package2 className="w-3 h-3" />{b.packageType}</span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-sm text-primary">{formatVND(b.totalAmount)}</p>
                        {b.remainingAmount > 0 && <p className="text-[10px] text-red-600 font-medium">Còn: {formatVND(b.remainingAmount)}</p>}
                        {b.remainingAmount === 0 && <p className="text-[10px] text-green-600 font-medium">Đã thanh toán đủ</p>}
                      </div>
                    </div>
                    <div className="mt-2">
                      <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                        <span>Đã thu: {formatVND(b.paidAmount)}</span>
                        <span>{Math.round(pct)}%</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selectedId && (
          <div className="w-full lg:w-[55%] xl:w-[60%] flex-shrink-0">
            <div className="bg-card rounded-2xl border shadow-sm overflow-hidden h-full">
              {detailLoading || !detail ? (
                <div className="flex items-center justify-center h-64 text-muted-foreground">Đang tải chi tiết...</div>
              ) : (
                <>
                  {/* Order Header */}
                  <div className="px-5 py-4 border-b bg-gradient-to-r from-primary/5 to-card">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="font-bold text-lg">{detail.customerName}</h2>
                          <span className="text-sm text-muted-foreground">{detail.orderCode}</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1 flex-wrap">
                          <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{detail.customerPhone}</span>
                          <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{formatDate(detail.shootDate)} {detail.shootTime?.slice(0, 5)}</span>
                          {detail.location && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{detail.location}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Select value={detail.status} onChange={e => updateStatus.mutate({ id: detail.id, status: e.target.value })} className="text-xs h-8 py-1">
                          {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </Select>
                        <button onClick={() => setSelectedId(null)} className="lg:hidden p-1.5 hover:bg-muted rounded-lg">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Financial Summary */}
                    <div className="grid grid-cols-3 gap-2 mt-3">
                      {[
                        { label: "Tổng đơn", value: formatVND(detail.totalAmount), color: "text-foreground" },
                        { label: "Đã thu", value: formatVND(detail.paidAmount), color: "text-green-600" },
                        { label: "Còn nợ", value: formatVND(detail.remainingAmount), color: detail.remainingAmount > 0 ? "text-red-600" : "text-green-600" },
                      ].map(f => (
                        <div key={f.label} className="bg-background rounded-lg p-2 text-center border">
                          <p className="text-[10px] text-muted-foreground">{f.label}</p>
                          <p className={`text-sm font-bold ${f.color}`}>{f.value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Progress bar */}
                    <div className="mt-2">
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min((detail.paidAmount / detail.totalAmount) * 100, 100)}%` }} />
                      </div>
                    </div>
                  </div>

                  {/* Tabs */}
                  <div className="flex border-b text-sm overflow-x-auto">
                    {(["info", "payment", "expense", "task"] as const).map(tab => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-4 py-2.5 font-medium whitespace-nowrap border-b-2 transition-colors flex items-center gap-1.5
                          ${activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                      >
                        {tab === "info" && <><FileText className="w-3.5 h-3.5" />Thông tin</>}
                        {tab === "payment" && <><CreditCard className="w-3.5 h-3.5" />Thu tiền{detail.payments.length > 0 && <span className="text-[10px] bg-primary/15 text-primary rounded-full px-1.5">{detail.payments.length}</span>}</>}
                        {tab === "expense" && <><Receipt className="w-3.5 h-3.5" />Chi phí</>}
                        {tab === "task" && <><ListChecks className="w-3.5 h-3.5" />Công việc{detail.tasks.length > 0 && <span className="text-[10px] bg-muted text-muted-foreground rounded-full px-1.5">{detail.tasks.length}</span>}</>}
                      </button>
                    ))}
                  </div>

                  {/* Tab Content */}
                  <div className="overflow-y-auto max-h-[calc(100vh-420px)] p-4 space-y-4">
                    {/* INFO TAB */}
                    {activeTab === "info" && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div><p className="text-muted-foreground text-xs">Loại dịch vụ</p><p className="font-medium">{SERVICE_CAT[detail.serviceCategory] ?? detail.serviceCategory}</p></div>
                          <div><p className="text-muted-foreground text-xs">Gói</p><p className="font-medium">{detail.packageType}</p></div>
                          {detail.discountAmount > 0 && <div><p className="text-muted-foreground text-xs">Giảm giá</p><p className="font-medium text-green-600">-{formatVND(detail.discountAmount)}</p></div>}
                          <div><p className="text-muted-foreground text-xs">Chi phí show</p><p className="font-medium text-red-600">{formatVND(detail.totalExpenses)}</p></div>
                          <div><p className="text-muted-foreground text-xs">Lợi nhuận gộp</p><p className={`font-bold ${detail.grossProfit >= 0 ? "text-green-600" : "text-red-600"}`}>{formatVND(detail.grossProfit)}</p></div>
                        </div>

                        {detail.items.length > 0 && (
                          <div className="space-y-3">
                            <h4 className="font-semibold text-sm">Danh sách dịch vụ</h4>
                            {detail.items.map((item, i) => {
                              const displayName = item.serviceName || item.name || `Dịch vụ ${i + 1}`;
                              const displayPrice = item.price ?? item.total ?? 0;
                              return (
                                <div key={i} className="rounded-xl border border-border/50 overflow-hidden">
                                  <div className="flex items-center justify-between px-3 py-2.5 bg-muted/30">
                                    <span className="font-semibold text-sm">{displayName}</span>
                                    {displayPrice > 0 && (
                                      <span className="text-sm font-bold text-primary">{formatVND(displayPrice)}</span>
                                    )}
                                  </div>
                                  {item.notes && (
                                    <div className="px-3 py-2 bg-amber-50/40 border-t border-border/30">
                                      <p className="text-[10px] font-bold text-amber-700 mb-1">📝 Ghi chú dịch vụ</p>
                                      <p className="text-xs text-amber-800 leading-relaxed whitespace-pre-line">{item.notes}</p>
                                    </div>
                                  )}
                                  {item.conceptImages && item.conceptImages.length > 0 && (
                                    <div className="px-3 py-2 border-t border-border/30">
                                      <p className="text-[10px] font-bold text-muted-foreground mb-2">🖼️ Ảnh concept ({item.conceptImages.length})</p>
                                      <div className="grid grid-cols-4 gap-1.5">
                                        {item.conceptImages.map((imgUrl, ci) => {
                                          const src = getImageSrc(imgUrl);
                                          return src ? (
                                            <a key={ci} href={src} target="_blank" rel="noopener noreferrer"
                                              className="aspect-square rounded-lg overflow-hidden bg-muted hover:ring-2 hover:ring-primary transition-all block">
                                              <img src={src} alt={`concept ${ci + 1}`} className="w-full h-full object-cover" />
                                            </a>
                                          ) : null;
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {detail.notes && (
                          <div className="p-3 bg-muted/30 rounded-xl text-sm">
                            <p className="font-semibold text-xs text-muted-foreground mb-1">Ghi chú khách hàng</p>
                            <p>{detail.notes}</p>
                          </div>
                        )}
                        {detail.internalNotes && (
                          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-xl text-sm">
                            <p className="font-semibold text-xs text-yellow-700 mb-1">⚠ Ghi chú nội bộ</p>
                            <p className="text-yellow-800">{detail.internalNotes}</p>
                          </div>
                        )}

                        <div className="flex gap-2 pt-2 border-t">
                          <Button variant="destructive" size="sm" className="gap-1.5" onClick={() => { if (confirm("Xóa đơn hàng này?")) deleteBooking.mutate(detail.id); }}>
                            <Trash2 className="w-3.5 h-3.5" /> Xóa đơn
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* PAYMENT TAB */}
                    {activeTab === "payment" && (
                      <div className="space-y-4">
                        {/* Add payment button */}
                        {!showPayForm ? (
                          <Button onClick={() => setShowPayForm(true)} className="w-full gap-2">
                            <Plus className="w-4 h-4" /> Ghi nhận thanh toán
                          </Button>
                        ) : (
                          <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
                            <h4 className="font-semibold text-sm">Ghi nhận thanh toán mới</h4>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-xs font-medium text-muted-foreground">Số tiền</label>
                                <Input type="number" placeholder="0" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} />
                              </div>
                              <div>
                                <label className="text-xs font-medium text-muted-foreground">Loại thanh toán</label>
                                <Select value={payForm.paymentType} onChange={e => setPayForm(f => ({ ...f, paymentType: e.target.value }))}>
                                  {Object.entries(PAYMENT_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </Select>
                              </div>
                              <div>
                                <label className="text-xs font-medium text-muted-foreground">Phương thức</label>
                                <Select value={payForm.paymentMethod} onChange={e => setPayForm(f => ({ ...f, paymentMethod: e.target.value }))}>
                                  {Object.entries(PAYMENT_METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </Select>
                              </div>
                              <div>
                                <label className="text-xs font-medium text-muted-foreground">Ghi chú</label>
                                <Input placeholder="Ghi chú..." value={payForm.notes} onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))} />
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button onClick={() => addPayment.mutate({ bookingId: detail.id, amount: parseFloat(payForm.amount), paymentMethod: payForm.paymentMethod, paymentType: payForm.paymentType, notes: payForm.notes })} disabled={!payForm.amount || addPayment.isPending}>
                                {addPayment.isPending ? "Đang lưu..." : "Xác nhận thu tiền"}
                              </Button>
                              <Button variant="outline" onClick={() => setShowPayForm(false)}>Hủy</Button>
                            </div>
                          </div>
                        )}

                        {/* Payment history */}
                        <div>
                          <h4 className="font-semibold text-sm mb-2">Lịch sử thanh toán ({detail.payments.length})</h4>
                          {detail.payments.length === 0 ? (
                            <div className="text-center py-6 text-muted-foreground text-sm">Chưa có khoản thanh toán nào</div>
                          ) : (
                            <div className="space-y-2">
                              {detail.payments.map(p => (
                                <div key={p.id} className="flex items-center justify-between p-3 rounded-xl border bg-card">
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                                      <span className="font-bold text-green-700">{formatVND(p.amount)}</span>
                                      <span className="text-xs text-muted-foreground">{PAYMENT_TYPE[p.paymentType] ?? p.paymentType}</span>
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-0.5 ml-6">
                                      {PAYMENT_METHOD[p.paymentMethod] ?? p.paymentMethod} · {formatDate(p.paidAt)}
                                      {p.notes && ` · ${p.notes}`}
                                    </div>
                                  </div>
                                  <button onClick={() => { if (confirm("Xóa khoản thanh toán này?")) deletePayment.mutate(p.id); }} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Debt summary */}
                        <div className="rounded-xl border p-3 bg-muted/20">
                          <div className="space-y-1.5 text-sm">
                            <div className="flex justify-between"><span className="text-muted-foreground">Tổng đơn hàng</span><span className="font-semibold">{formatVND(detail.totalAmount)}</span></div>
                            {detail.discountAmount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Giảm giá</span><span className="text-green-600">-{formatVND(detail.discountAmount)}</span></div>}
                            <div className="flex justify-between"><span className="text-muted-foreground">Đã thanh toán</span><span className="text-green-600 font-semibold">{formatVND(detail.paidAmount)}</span></div>
                            <div className="flex justify-between border-t pt-1.5"><span className="font-bold">Còn lại</span><span className={`font-bold text-base ${detail.remainingAmount > 0 ? "text-red-600" : "text-green-600"}`}>{formatVND(detail.remainingAmount)}</span></div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* EXPENSE TAB */}
                    {activeTab === "expense" && (
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <h4 className="font-semibold text-sm">Chi phí của show này</h4>
                          <span className="text-sm font-bold text-red-600">{formatVND(detail.totalExpenses)}</span>
                        </div>
                        {detail.expenses.length === 0 ? (
                          <div className="text-center py-6 text-muted-foreground text-sm">Chưa có khoản chi phí nào</div>
                        ) : (
                          <div className="space-y-2">
                            {detail.expenses.map(e => (
                              <div key={e.id} className="flex items-center justify-between p-3 rounded-xl border bg-card">
                                <div>
                                  <p className="font-medium text-sm">{e.description}</p>
                                  <p className="text-xs text-muted-foreground">{e.category} · {formatDate(e.expenseDate)}</p>
                                </div>
                                <span className="font-bold text-red-600">{formatVND(e.amount)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="rounded-xl border p-3 bg-muted/20 text-sm">
                          <div className="flex justify-between mb-1"><span className="text-muted-foreground">Doanh thu show</span><span className="font-semibold">{formatVND(detail.totalAmount)}</span></div>
                          <div className="flex justify-between mb-1"><span className="text-muted-foreground">Chi phí show</span><span className="text-red-600 font-semibold">-{formatVND(detail.totalExpenses)}</span></div>
                          <div className="flex justify-between border-t pt-1"><span className="font-bold">Lợi nhuận gộp</span><span className={`font-bold ${detail.grossProfit >= 0 ? "text-green-600" : "text-red-600"}`}>{formatVND(detail.grossProfit)}</span></div>
                        </div>
                      </div>
                    )}

                    {/* TASK TAB */}
                    {activeTab === "task" && (
                      <div className="space-y-2">
                        {detail.tasks.length === 0 ? (
                          <div className="text-center py-6 text-muted-foreground text-sm">Chưa có công việc nào</div>
                        ) : (
                          detail.tasks.map(t => {
                            const prio = t.priority === "high" ? "bg-red-100 text-red-700" : t.priority === "medium" ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-700";
                            const stat = t.status === "done" ? "text-green-600" : t.status === "in_progress" ? "text-blue-600" : "text-muted-foreground";
                            return (
                              <div key={t.id} className="flex items-center gap-3 p-3 rounded-xl border bg-card">
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-sm">{t.title}</p>
                                  <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
                                    {t.assigneeName && <span className="flex items-center gap-1"><Users className="w-3 h-3" />{t.assigneeName}</span>}
                                    {t.dueDate && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDate(t.dueDate)}</span>}
                                  </div>
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${prio}`}>{t.priority === "high" ? "Cao" : t.priority === "medium" ? "TB" : "Thấp"}</span>
                                  <span className={`text-[10px] font-medium ${stat}`}>{t.status === "done" ? "✓ Xong" : t.status === "in_progress" ? "⬤ Đang làm" : "○ Chưa làm"}</span>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Create Booking Modal */}
      <Dialog open={showCreateForm} onOpenChange={setShowCreateForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Tạo đơn hàng mới</DialogTitle>
          </DialogHeader>
          <CreateBookingForm
            customers={customers}
            onSuccess={() => { setShowCreateForm(false); qc.invalidateQueries({ queryKey: ["bookings"] }); }}
            onCancel={() => setShowCreateForm(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CustomerSearchBox({
  customers,
  onSelect,
  onCreateNew,
}: {
  customers: { id: number; name: string; phone: string; customCode?: string }[];
  onSelect: (c: { id: number; name: string; phone: string; customCode?: string }) => void;
  onCreateNew: () => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<{ id: number; name: string; phone: string; customCode?: string } | null>(null);

  const filtered = (() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const phoneExact = customers.filter(c => c.phone.includes(query));
    const nameMatch  = customers.filter(c => !c.phone.includes(query) && c.name.toLowerCase().includes(q));
    return [...phoneExact, ...nameMatch].slice(0, 10);
  })();

  const handleSelect = (c: typeof customers[0]) => {
    setSelected(c);
    setQuery(c.name);
    setOpen(false);
    onSelect(c);
  };

  const handleClear = () => {
    setSelected(null);
    setQuery("");
    setOpen(false);
    onSelect({ id: 0, name: "", phone: "" });
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          className="w-full pl-8 pr-8 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
          placeholder="Tìm theo tên hoặc số điện thoại..."
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); setSelected(null); }}
          onFocus={() => { if (query) setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          autoComplete="off"
        />
        {query && (
          <button onClick={handleClear} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {selected && (
        <div className="mt-1 flex items-center gap-2 text-xs text-primary bg-primary/5 border border-primary/20 rounded-lg px-3 py-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="font-semibold">{selected.name}</span>
          <span className="text-muted-foreground">—</span>
          <span>{selected.phone}</span>
          {selected.customCode && <span className="text-muted-foreground">— {selected.customCode}</span>}
        </div>
      )}

      {open && query.trim() && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-background border border-border rounded-xl shadow-lg overflow-hidden max-h-56 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-3">
              <p className="text-sm text-muted-foreground text-center mb-2">Không tìm thấy khách hàng "{query}"</p>
              <button
                onClick={onCreateNew}
                className="w-full flex items-center justify-center gap-2 text-xs text-primary bg-primary/5 hover:bg-primary/10 border border-primary/20 rounded-lg py-2 font-medium transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Tạo khách hàng mới
              </button>
            </div>
          ) : (
            filtered.map(c => (
              <button
                key={c.id}
                onMouseDown={() => handleSelect(c)}
                className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-muted text-left transition-colors border-b border-border/40 last:border-0"
              >
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold flex-shrink-0">
                  {c.name[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="w-3 h-3" /> {c.phone}
                    {c.customCode && <span className="ml-1 text-primary/60 font-medium">• {c.customCode}</span>}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function CreateBookingForm({ customers, onSuccess, onCancel }: {
  customers: { id: number; name: string; phone: string; customCode?: string }[];
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    customerId: "", shootDate: "", shootTime: "08:00", serviceCategory: "wedding",
    packageType: "", location: "", depositAmount: "", discountAmount: "0", notes: "",
  });
  const [selectedService, setSelectedService] = useState<ServiceOption | null>(null);
  const [surcharges, setSurcharges] = useState<SurchargeItem[]>([]);
  const [manualTotal, setManualTotal] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [showNewCustomer, setShowNewCustomer] = useState(false);

  // Auto-compute total from service price + surcharges
  const surchargesTotal = surcharges.reduce((s, i) => s + (i.amount || 0), 0);
  const autoTotal = (selectedService?.price ?? 0) + surchargesTotal;
  const displayTotal = manualTotal !== "" ? parseFloat(manualTotal) || 0 : autoTotal;

  // When service changes, clear manual total so auto takes over
  useEffect(() => { setManualTotal(""); }, [selectedService?.key]);

  const handleSubmit = async () => {
    const packageName = selectedService?.name || form.packageType;
    if (!form.customerId || !form.shootDate || !packageName) return alert("Vui lòng chọn khách hàng, ngày chụp và gói dịch vụ");
    if (displayTotal <= 0) return alert("Tổng tiền phải lớn hơn 0");
    setLoading(true);
    try {
      const cleanedSurcharges = surcharges
        .filter(s => s.name.trim() && s.amount > 0)
        .map(({ name, amount }) => ({ name, amount }));
      await fetch(`${BASE}/api/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          packageType: packageName,
          customerId: parseInt(form.customerId),
          totalAmount: displayTotal,
          depositAmount: parseFloat(form.depositAmount || "0"),
          discountAmount: parseFloat(form.discountAmount || "0"),
          surcharges: cleanedSurcharges,
        }),
      });
      onSuccess();
    } catch { alert("Lỗi tạo đơn hàng"); } finally { setLoading(false); }
  };

  return (
    <div className="space-y-3.5 max-h-[75vh] overflow-y-auto pr-1">
      {/* Khách hàng */}
      <div>
        <label className="text-xs font-medium text-muted-foreground">Khách hàng *</label>
        <CustomerSearchBox
          customers={customers}
          onSelect={c => setForm(f => ({ ...f, customerId: c.id ? String(c.id) : "" }))}
          onCreateNew={() => setShowNewCustomer(true)}
        />
        {showNewCustomer && (
          <div className="mt-1.5 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
            💡 Vui lòng vào trang <strong>Khách hàng</strong> để tạo mới, sau đó quay lại tạo đơn.
            <button className="ml-2 underline text-amber-600" onClick={() => setShowNewCustomer(false)}>Đóng</button>
          </div>
        )}
      </div>

      {/* Ngày + Giờ */}
      <div className="grid grid-cols-2 gap-3">
        <div><label className="text-xs font-medium text-muted-foreground">Ngày chụp *</label><Input type="date" value={form.shootDate} onChange={e => setForm(f => ({ ...f, shootDate: e.target.value }))} /></div>
        <div><label className="text-xs font-medium text-muted-foreground">Giờ chụp</label><Input type="time" value={form.shootTime} onChange={e => setForm(f => ({ ...f, shootTime: e.target.value }))} /></div>
      </div>

      {/* Loại dịch vụ */}
      <div>
        <label className="text-xs font-medium text-muted-foreground">Loại dịch vụ *</label>
        <Select value={form.serviceCategory} onChange={e => setForm(f => ({ ...f, serviceCategory: e.target.value }))}>
          {Object.entries(SERVICE_CAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </div>

      {/* Gói dịch vụ — ServiceSearchBox */}
      <div>
        <label className="text-xs font-medium text-muted-foreground">Gói dịch vụ *</label>
        <ServiceSearchBox
          value={selectedService}
          onChange={svc => {
            setSelectedService(svc);
            if (svc) setForm(f => ({ ...f, packageType: svc.name }));
            else setForm(f => ({ ...f, packageType: "" }));
          }}
          allowCustom
          onCustom={() => {
            setSelectedService(null);
            setForm(f => ({ ...f, packageType: "" }));
          }}
        />
        {/* Manual package name if no service selected */}
        {!selectedService && (
          <Input
            className="mt-1.5"
            placeholder="Hoặc nhập tên gói tự do..."
            value={form.packageType}
            onChange={e => setForm(f => ({ ...f, packageType: e.target.value }))}
          />
        )}
      </div>

      {/* Phụ thu / phát sinh */}
      <div className="p-3 bg-amber-50/60 border border-amber-200/60 rounded-xl">
        <SurchargeEditor value={surcharges} onChange={setSurcharges} />
      </div>

      {/* Địa điểm */}
      <div><label className="text-xs font-medium text-muted-foreground">Địa điểm</label><Input placeholder="Địa điểm chụp..." value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} /></div>

      {/* Tổng tiền tự động */}
      <div className="bg-muted/30 rounded-xl p-3 space-y-2.5 border border-border/50">
        {selectedService && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Giá gói</span>
            <span className="font-medium">{formatVND(selectedService.price)}</span>
          </div>
        )}
        {surchargesTotal > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Phụ thu / phát sinh</span>
            <span className="font-medium text-amber-600">+{formatVND(surchargesTotal)}</span>
          </div>
        )}
        <div className="flex justify-between items-center border-t border-border/50 pt-2">
          <span className="text-sm font-semibold">Tổng tiền *</span>
          <Input
            type="number"
            className="h-8 w-40 text-right text-sm font-bold"
            placeholder={String(autoTotal || "")}
            value={manualTotal !== "" ? manualTotal : autoTotal > 0 ? String(autoTotal) : ""}
            onChange={e => setManualTotal(e.target.value)}
          />
        </div>
        {manualTotal !== "" && autoTotal > 0 && parseFloat(manualTotal) !== autoTotal && (
          <p className="text-[10px] text-amber-600 text-right">
            Tự nhập. Tự động: {formatVND(autoTotal)}
            <button className="ml-1.5 underline" onClick={() => setManualTotal("")}>Khôi phục</button>
          </p>
        )}
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Đặt cọc</span>
          <Input type="number" className="h-8 w-40 text-right text-sm" placeholder="0" value={form.depositAmount} onChange={e => setForm(f => ({ ...f, depositAmount: e.target.value }))} />
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Giảm giá</span>
          <Input type="number" className="h-8 w-40 text-right text-sm" placeholder="0" value={form.discountAmount} onChange={e => setForm(f => ({ ...f, discountAmount: e.target.value }))} />
        </div>
        {displayTotal > 0 && (
          <div className="flex justify-between items-center border-t border-border/50 pt-2">
            <span className="text-sm font-semibold text-destructive">Còn lại</span>
            <span className="text-sm font-bold text-destructive">
              {formatVND(Math.max(0, displayTotal - (parseFloat(form.depositAmount || "0")) - (parseFloat(form.discountAmount || "0"))))}
            </span>
          </div>
        )}
      </div>

      <div><label className="text-xs font-medium text-muted-foreground">Ghi chú</label><Textarea rows={2} placeholder="Ghi chú thêm..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>

      <div className="flex gap-2 pt-1">
        <Button onClick={handleSubmit} disabled={loading} className="flex-1">{loading ? "Đang tạo..." : "Tạo đơn hàng"}</Button>
        <Button variant="outline" onClick={onCancel}>Hủy</Button>
      </div>
    </div>
  );
}
