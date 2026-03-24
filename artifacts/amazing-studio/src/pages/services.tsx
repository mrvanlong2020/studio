import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Check, Search, Package, Tag, Edit2, X, AlertCircle, ChevronRight } from "lucide-react";
import { formatVND } from "@/lib/utils";
import { Button, Input } from "@/components/ui";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Service = {
  id: number; name: string; code: string; category: string; description: string;
  type: string; price: number; costPrice: number; duration: string | null;
  includes: string[]; isActive: boolean; createdAt: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  wedding: "Cưới", beauty: "Beauty", family: "Gia đình",
  makeup: "Makeup", album: "Album", other: "Khác",
};
const CATEGORY_COLORS: Record<string, string> = {
  wedding: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  beauty: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  family: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  makeup: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
  album: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  other: "bg-muted text-muted-foreground",
};

export default function ServicesPage() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [showCreate, setShowCreate] = useState(false);

  const { data: services = [], isLoading } = useQuery<Service[]>({
    queryKey: ["services"],
    queryFn: () => fetch(`${BASE}/api/services`).then(r => r.json()),
  });

  const createService = useMutation({
    mutationFn: (body: Partial<Service>) =>
      fetch(`${BASE}/api/services`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(r => r.json()),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ["services"] });
      setShowCreate(false);
      navigate(`/services/${saved.id}`);
    },
  });

  const filtered = services.filter(s => {
    if (filterCat !== "all" && s.category !== filterCat) return false;
    if (search) {
      const q = search.toLowerCase();
      return s.name.toLowerCase().includes(q) || (s.code ?? "").toLowerCase().includes(q) || (s.description ?? "").toLowerCase().includes(q);
    }
    return true;
  });

  const categories = Array.from(new Set(services.map(s => s.category)));

  const handleCardClick = (id: number) => {
    console.log("[Services] Click gói id:", id);
    navigate(`/services/${id}`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dịch vụ & Gói</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {services.length} gói dịch vụ · Click vào gói để xem chi tiết và chỉnh sửa
          </p>
        </div>
        <Button className="gap-2" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4" /> Thêm gói dịch vụ
        </Button>
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9 h-10"
            placeholder="Tìm tên gói, mã gói, mô tả..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setFilterCat("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterCat === "all" ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80 text-muted-foreground"}`}
          >
            Tất cả ({services.length})
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setFilterCat(cat === filterCat ? "all" : cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterCat === cat ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80 text-muted-foreground"}`}
            >
              {CATEGORY_LABELS[cat] ?? cat} ({services.filter(s => s.category === cat).length})
            </button>
          ))}
        </div>
      </div>

      {/* Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-48 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Package className="w-14 h-14 mx-auto mb-4 opacity-25" />
          <p className="font-medium">Không tìm thấy gói dịch vụ</p>
          <p className="text-sm mt-1">Thử thay đổi bộ lọc hoặc tạo gói mới</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map(service => (
            <button
              key={service.id}
              onClick={() => handleCardClick(service.id)}
              className={`group text-left relative rounded-2xl border bg-card p-5 transition-all duration-200
                hover:shadow-lg hover:border-primary/40 hover:-translate-y-0.5 active:translate-y-0 active:shadow-md
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary
                ${!service.isActive ? "opacity-60 border-dashed" : "border-border"}`}
            >
              {/* Badge category */}
              <div className="flex items-center justify-between mb-3">
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${CATEGORY_COLORS[service.category] ?? CATEGORY_COLORS.other}`}>
                  {CATEGORY_LABELS[service.category] ?? service.category}
                </span>
                <div className="flex items-center gap-1.5">
                  {service.code && <span className="text-[11px] text-muted-foreground font-mono">{service.code}</span>}
                  {!service.isActive && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-muted rounded text-muted-foreground">Tạm ẩn</span>
                  )}
                  <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>

              {/* Name & Price */}
              <h3 className="text-base font-bold text-foreground mb-1 leading-snug">{service.name}</h3>
              <p className="text-2xl font-extrabold text-primary mb-2">{formatVND(service.price)}</p>

              {/* Description */}
              {service.description && (
                <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{service.description}</p>
              )}

              {/* Includes */}
              {service.includes.length > 0 && (
                <div className="space-y-1.5 mb-3">
                  {service.includes.slice(0, 3).map((item, idx) => (
                    <div key={idx} className="flex items-start gap-1.5 text-sm">
                      <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">{item}</span>
                    </div>
                  ))}
                  {service.includes.length > 3 && (
                    <p className="text-xs text-muted-foreground pl-5">+{service.includes.length - 3} mục khác...</p>
                  )}
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between pt-2 border-t border-border/50 mt-2">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Tag className="w-3 h-3" />
                  <span>{service.type === "package" ? "Gói dịch vụ" : "Dịch vụ lẻ"}</span>
                </div>
                <span className="text-xs text-primary font-medium group-hover:underline flex items-center gap-1">
                  <Edit2 className="w-3 h-3" /> Xem chi tiết
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <ServiceFormModal
          onClose={() => setShowCreate(false)}
          onSave={(data) => createService.mutate(data)}
          saving={createService.isPending}
          error={createService.isError ? "Có lỗi xảy ra khi tạo gói" : ""}
        />
      )}
    </div>
  );
}

export function ServiceFormModal({
  service, onClose, onSave, saving, error,
}: {
  service?: Service;
  onClose: () => void;
  onSave: (data: Partial<Service>) => void;
  saving: boolean;
  error: string;
}) {
  const [form, setForm] = useState({
    name: service?.name ?? "",
    code: service?.code ?? "",
    category: service?.category ?? "wedding",
    type: service?.type ?? "package",
    price: service?.price?.toString() ?? "",
    costPrice: service?.costPrice?.toString() ?? "",
    duration: service?.duration ?? "",
    description: service?.description ?? "",
    isActive: service?.isActive ?? true,
  });
  const [includes, setIncludes] = useState<string[]>(service?.includes ?? [""]);
  const [formError, setFormError] = useState(error);

  const addItem = () => setIncludes(p => [...p, ""]);
  const removeItem = (i: number) => setIncludes(p => p.filter((_, idx) => idx !== i));
  const updateItem = (i: number, val: string) => setIncludes(p => p.map((it, idx) => idx === i ? val : it));

  const handleSave = () => {
    if (!form.name.trim()) { setFormError("Vui lòng nhập tên gói"); return; }
    setFormError("");
    onSave({
      ...form,
      price: parseFloat(form.price) || 0,
      costPrice: parseFloat(form.costPrice) || 0,
      includes: includes.filter(i => i.trim()),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <h2 className="text-lg font-bold">{service ? "Chỉnh sửa gói dịch vụ" : "Thêm gói dịch vụ mới"}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {(formError || error) && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 rounded-xl text-destructive text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {formError || error}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
              Tên gói <span className="text-destructive">*</span>
            </label>
            <Input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="VD: Chụp ảnh cưới trọn ngày"
              className="h-10"
            />
          </div>

          {/* Code + Category */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Mã gói</label>
              <Input
                value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                placeholder="VD: SV001"
                className="h-10 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Danh mục</label>
              <select
                className="w-full h-10 border border-input rounded-lg px-3 text-sm bg-background"
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              >
                <option value="wedding">Cưới</option>
                <option value="beauty">Beauty</option>
                <option value="family">Gia đình</option>
                <option value="makeup">Makeup</option>
                <option value="album">Album</option>
                <option value="other">Khác</option>
              </select>
            </div>
          </div>

          {/* Price + Cost */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Giá bán (đ)</label>
              <Input
                type="number"
                value={form.price}
                onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                placeholder="0"
                className="h-10"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Giá vốn (đ)</label>
              <Input
                type="number"
                value={form.costPrice}
                onChange={e => setForm(f => ({ ...f, costPrice: e.target.value }))}
                placeholder="0"
                className="h-10"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Mô tả gói</label>
            <textarea
              className="w-full border border-input rounded-xl px-3 py-2.5 text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
              rows={3}
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Mô tả ngắn về gói dịch vụ..."
            />
          </div>

          {/* Includes */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Chi tiết gói</label>
              <button
                type="button"
                onClick={addItem}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Thêm mục
              </button>
            </div>
            <div className="space-y-2">
              {includes.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <Input
                    value={item}
                    onChange={e => updateItem(idx, e.target.value)}
                    placeholder={`VD: 2 sare, 2 vest, album 25x35cm...`}
                    className="h-9 flex-1 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    className="text-muted-foreground hover:text-destructive p-1 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {includes.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-3 border border-dashed border-border rounded-xl">
                  Nhấn "Thêm mục" để thêm chi tiết gói
                </p>
              )}
            </div>
          </div>

          {/* Type + Duration */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Loại dịch vụ</label>
              <select
                className="w-full h-10 border border-input rounded-lg px-3 text-sm bg-background"
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
              >
                <option value="package">Gói dịch vụ</option>
                <option value="addon">Dịch vụ thêm</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Thời gian</label>
              <Input
                value={form.duration}
                onChange={e => setForm(f => ({ ...f, duration: e.target.value }))}
                placeholder="VD: 8 giờ, 1 ngày..."
                className="h-10 text-sm"
              />
            </div>
          </div>

          {/* Active */}
          <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-border hover:bg-muted/30 transition-colors">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
              className="w-4 h-4 rounded accent-primary"
            />
            <div>
              <p className="text-sm font-medium">Gói đang hoạt động</p>
              <p className="text-xs text-muted-foreground">Hiển thị khi tạo báo giá và đơn hàng</p>
            </div>
          </label>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-border flex-shrink-0">
          <Button variant="outline" onClick={onClose} className="flex-1">Huỷ</Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1 gap-2">
            {saving ? (
              <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Đang lưu...</>
            ) : service ? "Lưu thay đổi" : "Tạo gói dịch vụ"}
          </Button>
        </div>
      </div>
    </div>
  );
}
