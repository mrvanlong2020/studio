import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatVND, formatDate } from "@/lib/utils";
import { Button, Input, Select, Textarea, Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui";
import { Plus, Search, FileText, User, Calendar, CheckCircle2, Clock, AlertCircle, Trash2, Edit, Printer, ReceiptText } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const fetchJson = (url: string, opts?: RequestInit) =>
  fetch(`${BASE}${url}`, { headers: { "Content-Type": "application/json" }, ...opts }).then(r => r.json());

const STUDIO_INFO = {
  name: "Amazing Studio",
  address: "Số 80, Hẻm 71, CMT8, KP Hiệp Bình, P. Hiệp Ninh, Tây Ninh",
  phone: "0392817079",
};

const DEFAULT_TERMS = `DỊCH VỤ:
- Bên A cam kết thực hiện đầy đủ dịch vụ theo nội dung đã thống nhất.
- Khách thanh toán 100% chi phí còn lại ngay sau buổi chụp để nhận file.
- Chưa thanh toán đủ, studio có quyền giữ sản phẩm.

DỜI / HỦY LỊCH:
- Dời 1 lần miễn phí nếu báo trước ≥ 3 ngày.
- Báo trễ / dời nhiều lần: có thể phát sinh phí.
- Hủy lịch: không hoàn cọc.

TRANG PHỤC:
- Khách giữ gìn váy, vest, phụ kiện trong suốt buổi chụp.
- Hư hỏng / dơ nặng → đền bù theo thực tế.

GIAO SẢN PHẨM:
- Studio giao đúng thời gian cam kết.
- Yêu cầu gấp → có thể tính phí.

PHÁT SINH:
- Các yêu cầu ngoài gói sẽ tính phí riêng.

Hai bên xác nhận và đồng ý toàn bộ nội dung hóa đơn dịch vụ này.`;

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  draft:     { label: "Nháp",        color: "text-gray-600",   bg: "bg-gray-100 border-gray-200",   icon: Edit },
  active:    { label: "Hiệu lực",    color: "text-green-700",  bg: "bg-green-100 border-green-200", icon: CheckCircle2 },
  signed:    { label: "Đã ký",       color: "text-green-700",  bg: "bg-green-100 border-green-200", icon: CheckCircle2 },
  expired:   { label: "Hết hạn",     color: "text-orange-700", bg: "bg-orange-100 border-orange-200", icon: Clock },
  cancelled: { label: "Đã hủy",      color: "text-red-700",    bg: "bg-red-100 border-red-200",     icon: AlertCircle },
};

type Contract = {
  id: number; contractCode: string; bookingId?: number; customerId?: number;
  customerName?: string; bookingCode?: string; title: string; content?: string;
  totalValue: number; status: string; signedAt?: string; expiresAt?: string; notes?: string;
  createdAt: string;
};

const EMPTY_FORM = {
  title: "", content: DEFAULT_TERMS, totalValue: "", status: "draft", customerId: "",
  bookingId: "", signedAt: "", expiresAt: "", notes: "",
};

function fmtVND(n: number) {
  return n.toLocaleString("vi-VN") + "đ";
}

function printInvoice(contract: Contract) {
  const today = new Date().toLocaleDateString("vi-VN");
  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<title>Hóa Đơn Dịch Vụ - ${contract.contractCode}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@300;400;500;600;700;800&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Be Vietnam Pro',sans-serif; color:#2c2c2c; background:#fff; font-size:14px; line-height:1.6; }
  .page { max-width:820px; margin:0 auto; padding:40px; }
  @media print {
    body { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .no-print { display:none !important; }
    .page { padding:24px; }
  }
</style>
</head>
<body>
<div class="page">
  <div class="no-print" style="text-align:right;margin-bottom:24px;">
    <button onclick="window.print()" style="background:#8B1A6B;color:#fff;border:none;padding:11px 28px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;">
      🖨️ In / Lưu PDF
    </button>
  </div>

  <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:28px;padding-bottom:20px;border-bottom:3px solid #8B1A6B;">
    <div>
      <div style="font-size:26px;font-weight:800;color:#8B1A6B;">✨ ${STUDIO_INFO.name}</div>
      <div style="color:#666;font-size:12px;margin-top:4px;">📍 ${STUDIO_INFO.address}</div>
      <div style="color:#666;font-size:12px;margin-top:2px;">📞 ${STUDIO_INFO.phone}</div>
    </div>
    <div style="text-align:right;min-width:180px;">
      <div style="font-size:20px;font-weight:800;color:#8B1A6B;text-transform:uppercase;">Hóa Đơn Dịch Vụ</div>
      <div style="font-size:13px;color:#555;margin-top:8px;">Số: <strong style="color:#2c2c2c;">${contract.contractCode}</strong></div>
      <div style="font-size:13px;color:#555;margin-top:3px;">Ngày lập: <strong style="color:#2c2c2c;">${today}</strong></div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;">
    <div style="background:#fdf8ff;border:1px solid #e0d0e8;border-radius:10px;padding:16px;">
      <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#9b59b6;margin-bottom:10px;">🏢 Bên cung cấp dịch vụ</div>
      <div style="font-weight:700;font-size:14px;">${STUDIO_INFO.name}</div>
      <div style="color:#555;margin-top:5px;font-size:12.5px;">📍 ${STUDIO_INFO.address}</div>
      <div style="color:#555;margin-top:3px;font-size:12.5px;">📞 ${STUDIO_INFO.phone}</div>
    </div>
    <div style="background:#fdf8ff;border:1px solid #e0d0e8;border-radius:10px;padding:16px;">
      <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#9b59b6;margin-bottom:10px;">👤 Khách hàng</div>
      <div style="font-weight:700;font-size:14px;">${contract.customerName || "—"}</div>
    </div>
  </div>

  <div style="margin-bottom:24px;">
    <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#9b59b6;margin-bottom:14px;">🎁 Nội dung dịch vụ</div>
    <div style="border:1px solid #e0d0e8;border-radius:10px;padding:16px;background:#fff;">
      <div style="font-weight:700;font-size:15px;color:#2c2c2c;">${contract.title}</div>
    </div>
  </div>

  <div style="background:linear-gradient(135deg,#8B1A6B 0%,#6c3483 100%);border-radius:12px;padding:20px 24px;margin-bottom:24px;color:#fff;">
    <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;opacity:0.8;margin-bottom:14px;">💰 Thanh toán</div>
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <span>Tổng giá trị dịch vụ</span>
      <span style="font-size:22px;font-weight:800;">${fmtVND(contract.totalValue || 0)}</span>
    </div>
  </div>

  ${contract.content ? `
  <div style="margin-bottom:32px;page-break-inside:avoid;">
    <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#9b59b6;margin-bottom:10px;">📋 Điều khoản dịch vụ</div>
    <div style="background:#f9f9f9;border:1px solid #eee;border-radius:10px;padding:16px 20px;font-size:12.5px;color:#444;line-height:1.9;white-space:pre-wrap;">${contract.content.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
  </div>
  ` : ""}

  ${contract.notes ? `
  <div style="background:#fff8e1;border:1px solid #ffe082;border-radius:10px;padding:14px 18px;margin-bottom:24px;">
    <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;color:#f57f17;margin-bottom:7px;">📝 Ghi chú</div>
    <div style="color:#555;font-size:13px;line-height:1.7;">${contract.notes}</div>
  </div>
  ` : ""}

  <div style="page-break-inside:avoid;">
    <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#9b59b6;margin-bottom:14px;">✍️ Xác nhận &amp; ký tên</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;">
      <div style="text-align:center;border:1px dashed #d0b8d0;border-radius:10px;padding:20px 16px;">
        <div style="font-weight:700;font-size:13px;color:#8B1A6B;margin-bottom:4px;">Bên A – ${STUDIO_INFO.name}</div>
        <div style="font-size:11.5px;color:#888;margin-bottom:3px;">Đại diện ký tên</div>
        <div style="height:70px;border-bottom:1.5px solid #bbb;margin:12px 24px 8px;"></div>
        <div style="font-size:11.5px;color:#888;font-style:italic;">(Ký, ghi rõ họ tên)</div>
        <div style="margin-top:10px;font-size:12px;color:#666;">Ngày ___/___/______</div>
      </div>
      <div style="text-align:center;border:1px dashed #d0b8d0;border-radius:10px;padding:20px 16px;">
        <div style="font-weight:700;font-size:13px;color:#8B1A6B;margin-bottom:4px;">Bên B – ${contract.customerName || "Khách hàng"}</div>
        <div style="font-size:11.5px;color:#888;margin-bottom:3px;">${contract.customerName || "—"}</div>
        <div style="height:70px;border-bottom:1.5px solid #bbb;margin:12px 24px 8px;"></div>
        <div style="font-size:11.5px;color:#888;font-style:italic;">(Ký, ghi rõ họ tên)</div>
        <div style="margin-top:10px;font-size:12px;color:#666;">Ngày ___/___/______</div>
      </div>
    </div>
  </div>

  <div style="text-align:center;margin-top:36px;padding-top:16px;border-top:1px solid #f0e0f0;color:#ccc;font-size:11px;">
    Hóa đơn được tạo bởi ${STUDIO_INFO.name} · ${today}
  </div>
</div>
</body>
</html>`;
  const win = window.open("", "_blank", "width=900,height=750");
  if (win) { win.document.write(html); win.document.close(); }
}

export default function ContractsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: contracts = [], isLoading } = useQuery<Contract[]>({
    queryKey: ["contracts"],
    queryFn: () => fetchJson("/api/contracts"),
  });

  const { data: customers = [] } = useQuery<{ id: number; name: string; phone: string }[]>({
    queryKey: ["customers-light"],
    queryFn: () => fetchJson("/api/customers"),
  });

  const { data: bookings = [] } = useQuery<{ id: number; orderCode: string; customerName: string }[]>({
    queryKey: ["bookings-light"],
    queryFn: () => fetchJson("/api/bookings"),
  });

  const selected = contracts.find(c => c.id === selectedId);

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => fetchJson("/api/contracts", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["contracts"] }); setIsOpen(false); setForm({ ...EMPTY_FORM }); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      fetchJson(`/api/contracts/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["contracts"] }); setIsOpen(false); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => fetch(`${BASE}/api/contracts/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["contracts"] }); setSelectedId(null); },
  });

  const openCreate = () => { setForm({ ...EMPTY_FORM }); setEditingId(null); setIsOpen(true); };
  const openEdit = (c: Contract) => {
    setForm({
      title: c.title,
      content: c.content || DEFAULT_TERMS,
      totalValue: String(c.totalValue),
      status: c.status,
      customerId: String(c.customerId || ""),
      bookingId: String(c.bookingId || ""),
      signedAt: c.signedAt?.slice(0, 10) || "",
      expiresAt: c.expiresAt?.slice(0, 10) || "",
      notes: c.notes || "",
    });
    setEditingId(c.id); setIsOpen(true);
  };

  const handleSubmit = () => {
    if (!form.title || !form.totalValue) return alert("Vui lòng nhập tên hóa đơn và giá trị dịch vụ");
    const data = {
      ...form,
      totalValue: parseFloat(form.totalValue),
      customerId: form.customerId ? parseInt(form.customerId) : undefined,
      bookingId: form.bookingId ? parseInt(form.bookingId) : undefined,
      signedAt: form.signedAt || undefined,
      expiresAt: form.expiresAt || undefined,
    };
    if (editingId) updateMutation.mutate({ id: editingId, data });
    else createMutation.mutate(data);
  };

  const filtered = contracts.filter(c => {
    const matchSearch = !search
      || c.title.toLowerCase().includes(search.toLowerCase())
      || c.contractCode?.toLowerCase().includes(search.toLowerCase())
      || c.customerName?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const stats = {
    total: contracts.length,
    active: contracts.filter(c => c.status === "active" || c.status === "signed").length,
    draft: contracts.filter(c => c.status === "draft").length,
    totalValue: contracts.filter(c => c.status === "active" || c.status === "signed").reduce((s, c) => s + c.totalValue, 0),
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ReceiptText className="w-6 h-6 text-primary" />
            Hóa đơn dịch vụ
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Quản lý hóa đơn, in và lưu hóa đơn cho khách hàng</p>
        </div>
        <Button onClick={openCreate} className="gap-2"><Plus className="w-4 h-4" />Tạo hóa đơn mới</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Tổng hóa đơn",    value: stats.total,             color: "text-foreground" },
          { label: "Đang hiệu lực",   value: stats.active,            color: "text-green-600" },
          { label: "Bản nháp",        value: stats.draft,             color: "text-gray-600" },
          { label: "Tổng giá trị HĐ", value: formatVND(stats.totalValue), color: "text-primary" },
        ].map(s => (
          <div key={s.label} className="rounded-xl border bg-card p-3">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-4">
        {/* List */}
        <div className={`flex-1 min-w-0 ${selectedId ? "hidden lg:block" : ""}`}>
          <div className="flex gap-2 mb-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Tên hóa đơn, mã, khách hàng..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-40">
              <option value="">Tất cả</option>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
          </div>

          {isLoading ? (
            <div className="py-20 text-center text-muted-foreground">Đang tải...</div>
          ) : (
            <div className="space-y-2">
              {filtered.map(c => {
                const sc = STATUS_CONFIG[c.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.draft;
                const Icon = sc.icon;
                const isExpiring = c.expiresAt && new Date(c.expiresAt) < new Date(Date.now() + 7 * 24 * 3600000) && (c.status === "active" || c.status === "signed");
                return (
                  <div
                    key={c.id}
                    onClick={() => setSelectedId(c.id === selectedId ? null : c.id)}
                    className={`rounded-xl border p-4 cursor-pointer transition-all hover:shadow-md ${selectedId === c.id ? "border-primary bg-primary/5" : "bg-card hover:border-primary/40"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                          <span className="font-semibold text-sm">{c.title}</span>
                          <span className="text-xs text-muted-foreground">{c.contractCode}</span>
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${sc.bg} ${sc.color} flex items-center gap-1`}>
                            <Icon className="w-3 h-3" />{sc.label}
                          </span>
                          {isExpiring && <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-medium">⚠ Sắp hết hạn</span>}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                          {c.customerName && <span className="flex items-center gap-1"><User className="w-3 h-3" />{c.customerName}</span>}
                          {c.signedAt && <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Ký: {formatDate(c.signedAt)}</span>}
                          {c.expiresAt && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Hết hạn: {formatDate(c.expiresAt)}</span>}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-primary">{formatVND(c.totalValue)}</p>
                        <div className="flex gap-1 mt-1 justify-end">
                          <button
                            onClick={e => { e.stopPropagation(); printInvoice(c); }}
                            className="p-1 hover:bg-primary/10 rounded text-muted-foreground hover:text-primary"
                            title="In hóa đơn"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); openEdit(c); }}
                            className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-primary"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); if (confirm("Xóa hóa đơn này?")) deleteMutation.mutate(c.id); }}
                            className="p-1 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <div className="py-16 text-center text-muted-foreground">
                  <ReceiptText className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p>Chưa có hóa đơn nào</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selectedId && selected && (
          <div className="w-full lg:w-96 flex-shrink-0">
            <div className="bg-card rounded-2xl border shadow-sm p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-lg leading-snug">{selected.title}</h3>
                  <p className="text-sm text-muted-foreground">{selected.contractCode}</p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => printInvoice(selected)}
                    className="p-2 hover:bg-primary/10 rounded-lg text-muted-foreground hover:text-primary"
                    title="In / Lưu hóa đơn"
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => openEdit(selected)}
                    className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-primary"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                {selected.customerName && (
                  <div>
                    <p className="text-xs text-muted-foreground">Khách hàng</p>
                    <p className="font-medium">{selected.customerName}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground">Giá trị</p>
                  <p className="font-bold text-primary">{formatVND(selected.totalValue)}</p>
                </div>
                {selected.signedAt && (
                  <div>
                    <p className="text-xs text-muted-foreground">Ngày ký</p>
                    <p className="font-medium">{formatDate(selected.signedAt)}</p>
                  </div>
                )}
                {selected.expiresAt && (
                  <div>
                    <p className="text-xs text-muted-foreground">Hết hạn</p>
                    <p className="font-medium">{formatDate(selected.expiresAt)}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground">Ngày tạo</p>
                  <p className="font-medium">{formatDate(selected.createdAt)}</p>
                </div>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-1">Trạng thái</p>
                <Select
                  value={selected.status}
                  onChange={e => updateMutation.mutate({ id: selected.id, data: { status: e.target.value } })}
                  className="text-sm"
                >
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </Select>
              </div>

              {selected.content && (
                <div className="p-3 bg-muted/30 rounded-xl">
                  <p className="font-semibold text-xs text-muted-foreground mb-2">📋 Điều khoản dịch vụ</p>
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{selected.content}</p>
                </div>
              )}

              {selected.notes && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-xl">
                  <p className="font-semibold text-xs text-yellow-700 mb-1">📝 Ghi chú</p>
                  <p className="text-yellow-800 text-xs">{selected.notes}</p>
                </div>
              )}

              <div className="flex gap-2 pt-2 border-t">
                <Button
                  onClick={() => printInvoice(selected)}
                  className="flex-1 gap-2"
                >
                  <Printer className="w-4 h-4" /> In / Lưu hóa đơn
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => { if (confirm("Xóa hóa đơn?")) deleteMutation.mutate(selected.id); }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Chỉnh sửa hóa đơn" : "Tạo hóa đơn dịch vụ mới"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[75vh] overflow-y-auto pr-1">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Tên dịch vụ / hóa đơn *</label>
              <Input
                placeholder="VD: Chụp ảnh cưới trọn gói / Thuê váy cưới..."
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Khách hàng</label>
                <Select value={form.customerId} onChange={e => setForm(f => ({ ...f, customerId: e.target.value }))}>
                  <option value="">-- Chọn khách hàng --</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Đơn hàng liên kết</label>
                <Select value={form.bookingId} onChange={e => setForm(f => ({ ...f, bookingId: e.target.value }))}>
                  <option value="">-- Chọn đơn hàng --</option>
                  {bookings.map(b => <option key={b.id} value={b.id}>{b.orderCode} — {b.customerName}</option>)}
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Giá trị dịch vụ *</label>
                <Input type="number" placeholder="0" value={form.totalValue} onChange={e => setForm(f => ({ ...f, totalValue: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Trạng thái</label>
                <Select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Ngày ký</label>
                <Input type="date" value={form.signedAt} onChange={e => setForm(f => ({ ...f, signedAt: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Ngày hết hạn</label>
                <Input type="date" value={form.expiresAt} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))} />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">
                📋 Điều khoản dịch vụ
                <span className="ml-2 text-muted-foreground/60 font-normal">(có thể chỉnh sửa trước khi in)</span>
              </label>
              <Textarea
                rows={10}
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                className="font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, content: DEFAULT_TERMS }))}
                className="mt-1 text-xs text-primary hover:underline"
              >
                ↺ Khôi phục điều khoản mặc định
              </button>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Ghi chú nội bộ</label>
              <Textarea rows={2} placeholder="Ghi chú thêm..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending}
                className="flex-1"
              >
                {editingId ? "Cập nhật hóa đơn" : "Tạo hóa đơn"}
              </Button>
              <Button variant="outline" onClick={() => setIsOpen(false)}>Hủy</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
