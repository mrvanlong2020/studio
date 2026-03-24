import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatVND, formatDate } from "@/lib/utils";
import { Button, Input, Select, Textarea, Dialog, DialogContent, DialogHeader, DialogTitle, Badge } from "@/components/ui";
import { Search, Plus, Phone, MapPin, Edit, Trash2, Users, Facebook, Instagram, Star, X, ChevronRight, TrendingUp, Calendar } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const fetchJson = (url: string, opts?: RequestInit) =>
  fetch(`${BASE}${url}`, { headers: { "Content-Type": "application/json" }, ...opts }).then(r => r.json());

const SOURCE_LABELS: Record<string, string> = {
  facebook: "Facebook", instagram: "Instagram", referral: "Giới thiệu",
  google: "Google", tiktok: "TikTok", walk_in: "Tự đến", other: "Khác",
};

const SOURCE_COLORS: Record<string, string> = {
  facebook: "bg-blue-100 text-blue-700", instagram: "bg-pink-100 text-pink-700",
  referral: "bg-green-100 text-green-700", google: "bg-red-100 text-red-700",
  tiktok: "bg-gray-100 text-gray-700", walk_in: "bg-yellow-100 text-yellow-700",
  other: "bg-muted text-muted-foreground",
};

type Customer = {
  id: number; customCode: string; name: string; phone: string; email?: string;
  address?: string; gender?: string; facebook?: string; zalo?: string;
  source?: string; tags?: string; notes?: string; createdAt: string;
  totalBookings?: number; totalSpent?: number; lastBookingDate?: string;
};

const EMPTY_FORM = {
  name: "", phone: "", email: "", address: "", gender: "", facebook: "", zalo: "",
  source: "facebook", tags: "", notes: ""
};

export default function CustomersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: customers = [], isLoading } = useQuery<Customer[]>({
    queryKey: ["customers", search, sourceFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search.length > 1) params.set("search", search);
      return fetchJson(`/api/customers?${params}`);
    },
  });

  const { data: customerDetail } = useQuery<Customer & { bookings: any[] }>({
    queryKey: ["customer-detail", selectedId],
    queryFn: () => fetchJson(`/api/customers/${selectedId}`),
    enabled: !!selectedId,
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => fetchJson("/api/customers", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customers"] }); setIsOpen(false); setForm({ ...EMPTY_FORM }); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: typeof form }) => fetchJson(`/api/customers/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customers"] }); qc.invalidateQueries({ queryKey: ["customer-detail", editingId] }); setIsOpen(false); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => fetch(`${BASE}/api/customers/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customers"] }); setSelectedId(null); },
  });

  const openCreate = () => { setForm({ ...EMPTY_FORM }); setEditingId(null); setIsOpen(true); };
  const openEdit = (c: Customer) => {
    setForm({ name: c.name, phone: c.phone, email: c.email || "", address: c.address || "", gender: c.gender || "", facebook: c.facebook || "", zalo: c.zalo || "", source: c.source || "other", tags: c.tags || "", notes: c.notes || "" });
    setEditingId(c.id); setIsOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name || !form.phone) return alert("Vui lòng nhập tên và số điện thoại");
    if (editingId) updateMutation.mutate({ id: editingId, data: form });
    else createMutation.mutate(form);
  };

  const filtered = customers.filter(c => {
    const matchSource = !sourceFilter || c.source === sourceFilter;
    return matchSource;
  });

  const stats = {
    total: customers.length,
    bySource: Object.entries(SOURCE_LABELS).map(([k, v]) => ({ key: k, label: v, count: customers.filter(c => c.source === k).length })).filter(x => x.count > 0),
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold">Khách hàng</h1>
          <p className="text-sm text-muted-foreground mt-0.5">CRM quản lý và chăm sóc khách hàng toàn diện</p>
        </div>
        <Button onClick={openCreate} className="gap-2"><Plus className="w-4 h-4" />Thêm khách hàng</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border bg-card p-3">
          <p className="text-xs text-muted-foreground">Tổng khách</p>
          <p className="text-2xl font-bold text-primary">{stats.total}</p>
        </div>
        {stats.bySource.slice(0, 3).map(s => (
          <div key={s.key} className="rounded-xl border bg-card p-3">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="text-xl font-bold">{s.count}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-4">
        {/* List */}
        <div className={`flex-1 min-w-0 ${selectedId ? "hidden lg:block" : ""}`}>
          <div className="flex gap-2 mb-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Tên, SĐT, email..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} className="w-40">
              <option value="">Tất cả nguồn</option>
              {Object.entries(SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </div>

          {isLoading ? (
            <div className="py-20 text-center text-muted-foreground">Đang tải...</div>
          ) : (
            <div className="space-y-2">
              {filtered.map(c => (
                <div
                  key={c.id}
                  onClick={() => setSelectedId(c.id === selectedId ? null : c.id)}
                  className={`rounded-xl border p-4 cursor-pointer transition-all hover:shadow-md ${selectedId === c.id ? "border-primary bg-primary/5" : "bg-card hover:border-primary/40"}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{c.name}</span>
                        <span className="text-xs text-muted-foreground">{c.customCode}</span>
                        {c.source && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${SOURCE_COLORS[c.source] ?? "bg-muted text-muted-foreground"}`}>{SOURCE_LABELS[c.source]}</span>}
                        {c.tags && typeof c.tags === "string" && c.tags.split(",").slice(0, 2).map(t => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-accent-foreground">{t.trim()}</span>)}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                        <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span>
                        {c.email && <span>{c.email}</span>}
                        {c.address && <span className="flex items-center gap-1 truncate"><MapPin className="w-3 h-3 flex-shrink-0" />{c.address}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={e => { e.stopPropagation(); openEdit(c); }} className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-primary transition-colors">
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={e => { e.stopPropagation(); if (confirm("Xóa khách hàng này?")) deleteMutation.mutate(c.id); }} className="p-1.5 hover:bg-destructive/10 rounded-lg text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && <div className="py-16 text-center text-muted-foreground">Không tìm thấy khách hàng</div>}
            </div>
          )}
        </div>

        {/* Customer Detail Panel */}
        {selectedId && customerDetail && (
          <div className="w-full lg:w-80 xl:w-96 flex-shrink-0">
            <div className="bg-card rounded-2xl border shadow-sm overflow-hidden">
              <div className="p-4 border-b bg-gradient-to-br from-primary/5 to-card">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                      {customerDetail.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-bold">{customerDetail.name}</h3>
                      <p className="text-xs text-muted-foreground">{customerDetail.customCode}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(customerDetail)} className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-primary">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button onClick={() => setSelectedId(null)} className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground lg:hidden">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {[
                    { label: "Số điện thoại", value: customerDetail.phone, icon: Phone },
                    { label: "Địa chỉ", value: customerDetail.address, icon: MapPin },
                    { label: "Facebook", value: customerDetail.facebook, icon: Facebook },
                    { label: "Zalo", value: customerDetail.zalo, icon: Phone },
                    { label: "Nguồn", value: SOURCE_LABELS[customerDetail.source!], icon: TrendingUp },
                    { label: "Giới tính", value: customerDetail.gender === "male" ? "Nam" : customerDetail.gender === "female" ? "Nữ" : undefined, icon: Users },
                  ].filter(f => f.value).map(f => (
                    <div key={f.label}>
                      <p className="text-xs text-muted-foreground">{f.label}</p>
                      <p className="font-medium text-sm">{f.value}</p>
                    </div>
                  ))}
                </div>

                {customerDetail.tags && typeof customerDetail.tags === "string" && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Tags</p>
                    <div className="flex flex-wrap gap-1">
                      {customerDetail.tags.split(",").map(t => <span key={t} className="text-xs px-2 py-0.5 bg-accent rounded-full">{t.trim()}</span>)}
                    </div>
                  </div>
                )}

                {customerDetail.notes && (
                  <div className="p-3 bg-muted/30 rounded-xl text-sm">
                    <p className="font-semibold text-xs text-muted-foreground mb-1">Ghi chú</p>
                    <p>{customerDetail.notes}</p>
                  </div>
                )}

                {/* Bookings */}
                {customerDetail.bookings && customerDetail.bookings.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                      <Calendar className="w-4 h-4" /> Đơn hàng ({customerDetail.bookings.length})
                    </h4>
                    <div className="space-y-2">
                      {customerDetail.bookings.map((b: any) => (
                        <div key={b.id} className="p-2.5 rounded-xl border bg-muted/20 text-sm">
                          <div className="flex justify-between">
                            <span className="font-medium">{b.packageType}</span>
                            <span className="text-primary font-semibold">{formatVND(b.totalAmount)}</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">{formatDate(b.shootDate)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-xs text-muted-foreground pt-1 border-t">Tham gia: {formatDate(customerDetail.createdAt)}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Chỉnh sửa khách hàng" : "Thêm khách hàng mới"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="text-xs font-medium text-muted-foreground">Họ và tên *</label><Input placeholder="Nguyễn Thị Hoa" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div><label className="text-xs font-medium text-muted-foreground">Số điện thoại *</label><Input placeholder="0912 345 678" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Giới tính</label>
                <Select value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}>
                  <option value="">Không chọn</option>
                  <option value="female">Nữ</option>
                  <option value="male">Nam</option>
                </Select>
              </div>
              <div className="col-span-2"><label className="text-xs font-medium text-muted-foreground">Email</label><Input placeholder="email@gmail.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
              <div className="col-span-2"><label className="text-xs font-medium text-muted-foreground">Địa chỉ</label><Input placeholder="TP. Hồ Chí Minh" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
              <div><label className="text-xs font-medium text-muted-foreground">Facebook</label><Input placeholder="facebook.com/..." value={form.facebook} onChange={e => setForm(f => ({ ...f, facebook: e.target.value }))} /></div>
              <div><label className="text-xs font-medium text-muted-foreground">Zalo</label><Input placeholder="SĐT Zalo" value={form.zalo} onChange={e => setForm(f => ({ ...f, zalo: e.target.value }))} /></div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Nguồn khách hàng</label>
                <Select value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))}>
                  {Object.entries(SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </div>
              <div><label className="text-xs font-medium text-muted-foreground">Tags (cách nhau bởi dấu phẩy)</label><Input placeholder="VIP, Cô dâu, Tái ký" value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} /></div>
              <div className="col-span-2"><label className="text-xs font-medium text-muted-foreground">Ghi chú</label><Textarea rows={2} placeholder="Sở thích, ghi chú đặc biệt..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} className="flex-1">
                {createMutation.isPending || updateMutation.isPending ? "Đang lưu..." : editingId ? "Cập nhật" : "Thêm khách hàng"}
              </Button>
              <Button variant="outline" onClick={() => setIsOpen(false)}>Hủy</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
