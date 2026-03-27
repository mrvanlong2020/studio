import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Search, Shirt, Edit2, Trash2, X, Check,
  RefreshCw, Tag, Palette, Ruler, Package, Camera, Loader2
} from "lucide-react";
import { formatVND } from "@/lib/utils";

function getImageSrc(imageUrl: string | null): string | null {
  if (!imageUrl) return null;
  if (imageUrl.startsWith("/objects/")) return `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/storage${imageUrl}`;
  return imageUrl;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Dress = {
  id: number;
  code: string;
  name: string;
  category: string;
  color: string;
  size: string;
  style: string | null;
  rentalPrice: number;
  depositRequired: number;
  isAvailable: boolean;
  rentalStatus: string;
  condition: string;
  notes: string | null;
  imageUrl: string | null;
  createdAt: string;
};

const RENTAL_STATUS = {
  san_sang:      { label: "Sẵn sàng cho thuê", color: "text-emerald-700", bg: "bg-emerald-100 dark:bg-emerald-900/30", dot: "bg-emerald-500" },
  dang_cho_thue: { label: "Đang cho thuê",     color: "text-orange-700",  bg: "bg-orange-100 dark:bg-orange-900/30",  dot: "bg-orange-500" },
  ngung_cho_thue: { label: "Ngưng cho thuê",   color: "text-slate-600",   bg: "bg-slate-100 dark:bg-slate-800",       dot: "bg-slate-400" },
};

const CONDITION: Record<string, string> = {
  moi:       "Mới",
  tot:       "Tốt",
  can_giat:  "Cần giặt",
  can_sua:   "Cần sửa",
  hu:        "Hư",
  // Legacy English values
  new:       "Mới",
  excellent: "Xuất sắc",
  good:      "Tốt",
  fair:      "Khá",
  poor:      "Kém",
};


const EMPTY_FORM = {
  code: "", name: "", category: "", color: "", size: "", style: "",
  rentalPrice: 0, depositRequired: 0, rentalStatus: "san_sang",
  condition: "tot", notes: "", imageUrl: ""
};

async function uploadDressImage(file: File): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/api/storage/uploads/request-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
    });
    const { uploadURL, objectPath } = await res.json();
    if (!uploadURL) return null;
    await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
    return objectPath as string;
  } catch (err) {
    console.error("Upload error:", err);
    return null;
  }
}

export default function WardrobePage() {
  const qc = useQueryClient();
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const imgFileRef = useRef<HTMLInputElement>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingDress, setEditingDress] = useState<Dress | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [savingStatus, setSavingStatus] = useState<Record<number, boolean>>({});

  const { data: dresses = [], isLoading } = useQuery<Dress[]>({
    queryKey: ["dresses"],
    queryFn: () => fetch(`${BASE}/api/dresses`).then(r => r.json()),
  });

  const { data: dbCategories = [] } = useQuery<string[]>({
    queryKey: ["dress-categories"],
    queryFn: () => fetch(`${BASE}/api/dresses/categories`).then(r => r.json()),
  });

  const [catInput, setCatInput] = useState("");
  const [catOpen, setCatOpen] = useState(false);
  const catRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (catRef.current && !catRef.current.contains(e.target as Node)) {
        setCatOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const createDress = useMutation({
    mutationFn: (data: typeof EMPTY_FORM) => fetch(`${BASE}/api/dresses`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data)
    }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["dresses"] }); qc.invalidateQueries({ queryKey: ["dress-categories"] }); closeModal(); },
  });

  const updateDress = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<typeof EMPTY_FORM> }) =>
      fetch(`${BASE}/api/dresses/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data)
      }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["dresses"] }); qc.invalidateQueries({ queryKey: ["dress-categories"] }); closeModal(); },
  });

  const deleteDress = useMutation({
    mutationFn: (id: number) => fetch(`${BASE}/api/dresses/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["dresses"] }); qc.invalidateQueries({ queryKey: ["dress-categories"] }); },
  });

  const quickStatus = useMutation({
    mutationFn: ({ id, rentalStatus }: { id: number; rentalStatus: string }) =>
      fetch(`${BASE}/api/dresses/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rentalStatus })
      }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dresses"] }),
  });

  function openCreate() {
    setEditingDress(null);
    const num = (dresses.length + 1).toString().padStart(3, "0");
    setForm({ ...EMPTY_FORM, code: `VP-${num}` });
    setCatInput("");
    setCatOpen(false);
    setShowModal(true);
  }

  function openEdit(d: Dress) {
    setEditingDress(d);
    const cat = d.category ?? "";
    setForm({
      code: d.code, name: d.name, category: cat,
      color: d.color, size: d.size, style: d.style ?? "",
      rentalPrice: d.rentalPrice, depositRequired: d.depositRequired,
      rentalStatus: d.rentalStatus, condition: d.condition,
      notes: d.notes ?? "", imageUrl: d.imageUrl ?? ""
    });
    setCatInput(cat);
    setCatOpen(false);
    setShowModal(true);
  }

  function closeModal() { setShowModal(false); setEditingDress(null); setCatOpen(false); }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editingDress) updateDress.mutate({ id: editingDress.id, data: form });
    else createDress.mutate(form);
  }

  const filtered = useMemo(() => {
    let list = [...dresses];
    if (filterStatus !== "all") list = list.filter(d => d.rentalStatus === filterStatus);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(d =>
        d.name.toLowerCase().includes(q) ||
        d.code.toLowerCase().includes(q) ||
        (d.category ?? "").toLowerCase().includes(q) ||
        (d.color ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [dresses, filterStatus, search]);

  const counts = useMemo(() => ({
    all: dresses.length,
    san_sang: dresses.filter(d => d.rentalStatus === "san_sang").length,
    dang_cho_thue: dresses.filter(d => d.rentalStatus === "dang_cho_thue").length,
    ngung_cho_thue: dresses.filter(d => d.rentalStatus === "ngung_cho_thue").length,
  }), [dresses]);

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-border bg-background">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center">
              <Shirt className="w-5 h-5 text-pink-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Kho trang phục</h1>
              <p className="text-xs text-muted-foreground">{counts.all} trang phục · {counts.san_sang} sẵn sàng</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Tìm trang phục..."
                className="pl-9 pr-4 py-2 text-sm rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 w-52" />
            </div>
            <button onClick={openCreate}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors">
              <Plus className="w-4 h-4" /> Thêm váy mới
            </button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mt-3 flex-wrap">
          {[
            { key: "all", label: `Tất cả (${counts.all})` },
            { key: "san_sang", label: `Sẵn sàng (${counts.san_sang})` },
            { key: "dang_cho_thue", label: `Đang cho thuê (${counts.dang_cho_thue})` },
            { key: "ngung_cho_thue", label: `Ngưng cho thuê (${counts.ngung_cho_thue})` },
          ].map(f => (
            <button key={f.key}
              onClick={() => setFilterStatus(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterStatus === f.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
              {f.label}
            </button>
          ))}
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
            <Shirt className="w-12 h-12 mb-3 opacity-20" />
            <p className="font-medium">Chưa có trang phục nào</p>
            <p className="text-sm mt-1">Bấm "+ Thêm váy mới" để bắt đầu</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map(dress => {
              const st = RENTAL_STATUS[dress.rentalStatus as keyof typeof RENTAL_STATUS] ?? RENTAL_STATUS.san_sang;
              return (
                <div key={dress.id}
                  className="bg-card rounded-2xl border border-border overflow-hidden hover:shadow-md transition-all group">
                  {/* Image */}
                  <div className="aspect-[3/4] bg-muted relative">
                    {dress.imageUrl ? (
                      <img src={getImageSrc(dress.imageUrl) ?? dress.imageUrl} alt={dress.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground/20">
                        <Shirt className="w-16 h-16" />
                      </div>
                    )}
                    {/* Code badge */}
                    <div className="absolute top-2 left-2">
                      <span className="px-2 py-0.5 bg-white/90 dark:bg-black/70 rounded-lg text-xs font-mono font-medium">
                        {dress.code}
                      </span>
                    </div>
                    {/* Status badge */}
                    <div className="absolute top-2 right-2">
                      <span className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium ${st.bg} ${st.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                        {st.label}
                      </span>
                    </div>
                    {/* Action buttons overlay */}
                    <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEdit(dress)}
                        className="p-1.5 bg-white/90 dark:bg-black/70 rounded-lg hover:bg-primary hover:text-white transition-colors" title="Sửa">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => { if (confirm(`Xoá "${dress.name}"?`)) deleteDress.mutate(dress.id); }}
                        className="p-1.5 bg-white/90 dark:bg-black/70 rounded-lg hover:bg-red-500 hover:text-white transition-colors" title="Xoá">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-3">
                    <h3 className="font-semibold text-sm leading-tight mb-0.5 truncate">{dress.name}</h3>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {dress.category && <span className="text-xs text-muted-foreground">{dress.category}</span>}
                      <span className="text-xs text-muted-foreground">· {dress.color} · Size {dress.size}</span>
                    </div>
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-xs text-muted-foreground">Giá thuê</p>
                        <p className="font-bold text-primary text-sm">{formatVND(dress.rentalPrice)}</p>
                      </div>
                      {dress.depositRequired > 0 && (
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Cọc</p>
                          <p className="text-sm font-medium text-muted-foreground">{formatVND(dress.depositRequired)}</p>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${["moi","new","excellent"].includes(dress.condition) ? "bg-emerald-100 text-emerald-700" : ["tot","good"].includes(dress.condition) ? "bg-blue-100 text-blue-700" : ["can_giat","fair"].includes(dress.condition) ? "bg-yellow-100 text-yellow-700" : dress.condition === "can_sua" ? "bg-orange-100 text-orange-700" : "bg-red-100 text-red-700"}`}>
                        {CONDITION[dress.condition] ?? dress.condition}
                      </span>
                      {/* Quick status change */}
                      <select
                        value={dress.rentalStatus}
                        onChange={e => quickStatus.mutate({ id: dress.id, rentalStatus: e.target.value })}
                        className="text-xs border border-border rounded-lg px-1.5 py-1 bg-background cursor-pointer focus:outline-none">
                        <option value="san_sang">Sẵn sàng</option>
                        <option value="dang_cho_thue">Đang thuê</option>
                        <option value="ngung_cho_thue">Ngưng thuê</option>
                      </select>
                    </div>
                    {dress.notes && <p className="text-xs text-muted-foreground mt-1.5 italic truncate">{dress.notes}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="bg-background rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="font-bold text-lg">{editingDress ? "Sửa trang phục" : "Thêm trang phục mới"}</h2>
              <button onClick={closeModal} className="p-2 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSubmit} className="flex-1 overflow-auto p-5 space-y-4">
              {/* Row 1: Code + Category */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Mã váy *</label>
                  <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} required
                    className="w-full text-sm border border-border rounded-xl px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="VD: VP-001" />
                </div>
                <div ref={catRef} className="relative">
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Nhóm trang phục</label>
                  <input
                    value={catInput}
                    onChange={e => {
                      setCatInput(e.target.value);
                      setForm(f => ({ ...f, category: e.target.value }));
                      setCatOpen(true);
                    }}
                    onFocus={() => setCatOpen(true)}
                    placeholder="Chọn hoặc nhập nhóm mới..."
                    autoComplete="off"
                    className="w-full text-sm border border-border rounded-xl px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  {catOpen && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-background border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto">
                      {dbCategories
                        .filter(c => c.toLowerCase().includes(catInput.toLowerCase()))
                        .map(c => (
                          <button key={c} type="button"
                            onMouseDown={e => { e.preventDefault(); setCatInput(c); setForm(f => ({ ...f, category: c })); setCatOpen(false); }}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors flex items-center justify-between ${form.category === c ? "text-primary font-medium" : ""}`}>
                            {c}
                            {form.category === c && <Check className="w-3.5 h-3.5" />}
                          </button>
                        ))}
                      {catInput.trim() && !dbCategories.some(c => c.toLowerCase() === catInput.trim().toLowerCase()) && (
                        <button type="button"
                          onMouseDown={e => { e.preventDefault(); const v = catInput.trim(); setCatInput(v); setForm(f => ({ ...f, category: v })); setCatOpen(false); }}
                          className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-primary/5 transition-colors flex items-center gap-2 border-t border-border">
                          <Plus className="w-3.5 h-3.5" /> Tạo nhóm mới: <span className="font-medium">"{catInput.trim()}"</span>
                        </button>
                      )}
                      {dbCategories.length === 0 && !catInput.trim() && (
                        <div className="px-3 py-2 text-xs text-muted-foreground">Gõ tên nhóm để tạo mới</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Tên váy *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required
                  className="w-full text-sm border border-border rounded-xl px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="Tên trang phục" />
              </div>

              {/* Color + Size + Style */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Màu sắc *</label>
                  <input value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} required
                    className="w-full text-sm border border-border rounded-xl px-3 py-2 bg-background focus:outline-none"
                    placeholder="Trắng, Đỏ..." />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Size *</label>
                  <input value={form.size} onChange={e => setForm(f => ({ ...f, size: e.target.value }))} required
                    className="w-full text-sm border border-border rounded-xl px-3 py-2 bg-background focus:outline-none"
                    placeholder="S, M, L, XL..." />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Loại váy</label>
                  <input value={form.style} onChange={e => setForm(f => ({ ...f, style: e.target.value }))}
                    className="w-full text-sm border border-border rounded-xl px-3 py-2 bg-background focus:outline-none"
                    placeholder="A-line, Mermaid..." />
                </div>
              </div>

              {/* Prices */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Giá thuê (VNĐ) *</label>
                  <input type="number" min={0} value={form.rentalPrice}
                    onChange={e => setForm(f => ({ ...f, rentalPrice: +e.target.value }))}
                    className="w-full text-sm border border-border rounded-xl px-3 py-2 bg-background focus:outline-none" required />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Giá cọc (VNĐ)</label>
                  <input type="number" min={0} value={form.depositRequired}
                    onChange={e => setForm(f => ({ ...f, depositRequired: +e.target.value }))}
                    className="w-full text-sm border border-border rounded-xl px-3 py-2 bg-background focus:outline-none" />
                </div>
              </div>

              {/* Status + Condition */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Trạng thái cho thuê</label>
                  <select value={form.rentalStatus} onChange={e => setForm(f => ({ ...f, rentalStatus: e.target.value }))}
                    className="w-full text-sm border border-border rounded-xl px-3 py-2 bg-background focus:outline-none">
                    <option value="san_sang">Sẵn sàng cho thuê</option>
                    <option value="dang_cho_thue">Đang cho thuê</option>
                    <option value="ngung_cho_thue">Ngưng cho thuê</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Tình trạng</label>
                  <select value={form.condition} onChange={e => setForm(f => ({ ...f, condition: e.target.value }))}
                    className="w-full text-sm border border-border rounded-xl px-3 py-2 bg-background focus:outline-none">
                    {Object.entries(CONDITION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>

              {/* Image Upload */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Ảnh trang phục</label>
                <div className="flex items-center gap-3">
                  {form.imageUrl ? (
                    <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-border flex-shrink-0">
                      <img
                        src={getImageSrc(form.imageUrl) ?? form.imageUrl}
                        alt="preview"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setForm(f => ({ ...f, imageUrl: "" }))}
                        className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div
                      onClick={() => imgFileRef.current?.click()}
                      className="w-20 h-20 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors flex-shrink-0"
                    >
                      {isUploading
                        ? <Loader2 className="w-5 h-5 text-primary animate-spin" />
                        : <Camera className="w-5 h-5 text-muted-foreground" />}
                    </div>
                  )}
                  <div className="flex-1 space-y-1.5">
                    <button
                      type="button"
                      onClick={() => imgFileRef.current?.click()}
                      disabled={isUploading}
                      className="w-full flex items-center justify-center gap-2 py-2 border border-border rounded-xl text-sm text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors disabled:opacity-50"
                    >
                      {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                      {isUploading ? "Đang tải ảnh..." : "Tải ảnh lên"}
                    </button>
                    <input
                      value={form.imageUrl.startsWith("/objects/") ? "" : form.imageUrl}
                      onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))}
                      className="w-full text-xs border border-border rounded-lg px-2.5 py-1.5 bg-background focus:outline-none text-muted-foreground"
                      placeholder="Hoặc dán link ảnh..."
                    />
                  </div>
                </div>
                <input
                  ref={imgFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setIsUploading(true);
                    const objectPath = await uploadDressImage(file);
                    setIsUploading(false);
                    if (objectPath) setForm(f => ({ ...f, imageUrl: objectPath }));
                    e.target.value = "";
                  }}
                />
              </div>

              {/* Notes */}
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
                <button type="submit" disabled={createDress.isPending || updateDress.isPending}
                  className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
                  {editingDress ? "Lưu thay đổi" : "Thêm váy"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
