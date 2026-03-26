import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Plus, Search, Edit2, Trash2, ChevronDown, ChevronRight,
  Package, Tag, Layers, X, Check, AlertCircle,
  ShoppingCart, FileText, Eye, EyeOff, GripVertical
} from "lucide-react";
import { formatVND } from "@/lib/utils";
import { Button, Input, Badge } from "@/components/ui";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type PackageItem = { id?: number; name: string; quantity: string; unit: string; notes: string; sortOrder: number };
type ServicePackage = {
  id: number; groupId: number | null; code: string; name: string;
  price: number; costPrice: number;
  printCost: number; operatingCost: number; salePercent: number;
  description: string; notes: string;
  isActive: boolean; sortOrder: number; items: PackageItem[];
  serviceType?: string | null; photoCount?: number | null;
  addons?: { key: string; name: string; price: number }[];
  products?: string[];
};
type ServiceGroup = { id: number; name: string; description: string; isActive: boolean; sortOrder: number };
type Surcharge = { id: number; name: string; category: string; price: number; unit: string; description: string; isActive: boolean; sortOrder: number };

const UNIT_OPTIONS = ["lần", "buổi", "bàn", "tấm", "km", "người", "bộ", "cuốn", "trang", "ảnh", "clip", "ngày"];

function formatVNDShort(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}tr`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return `${n}`;
}

export default function PricingPage() {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<"packages" | "surcharges" | "groups">("packages");
  const [search, setSearch] = useState("");
  const [filterGroup, setFilterGroup] = useState<number | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const [selectedPkg, setSelectedPkg] = useState<ServicePackage | null>(null);

  const [showPkgModal, setShowPkgModal] = useState(false);
  const [editingPkg, setEditingPkg] = useState<ServicePackage | null>(null);
  const [showSurchargeModal, setShowSurchargeModal] = useState(false);
  const [editingSurcharge, setEditingSurcharge] = useState<Surcharge | null>(null);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ServiceGroup | null>(null);

  const { data: groups = [] } = useQuery<ServiceGroup[]>({
    queryKey: ["service-groups"],
    queryFn: () => fetch(`${BASE}/api/service-groups`).then(r => r.json()),
  });
  const { data: packages = [], isLoading: pkgLoading } = useQuery<ServicePackage[]>({
    queryKey: ["service-packages"],
    queryFn: () => fetch(`${BASE}/api/service-packages`).then(r => r.json()),
  });
  const { data: surcharges = [] } = useQuery<Surcharge[]>({
    queryKey: ["surcharges"],
    queryFn: () => fetch(`${BASE}/api/surcharges`).then(r => r.json()),
  });

  const allExpanded = useMemo(() => {
    if (expandedGroups.size === 0 && packages.length > 0) {
      const ids = new Set<number>();
      packages.forEach(p => { if (p.groupId) ids.add(p.groupId); });
      return ids;
    }
    return expandedGroups;
  }, [expandedGroups, packages]);

  const toggleGroup = (id: number) => {
    setExpandedGroups(prev => {
      const s = new Set(prev.size === 0 ? allExpanded : prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  const isGroupExpanded = (id: number) => allExpanded.has(id);

  const filteredPackages = useMemo(() => {
    return packages.filter(p => {
      if (filterGroup !== null && p.groupId !== filterGroup) return false;
      if (search) {
        const q = search.toLowerCase();
        return p.name.toLowerCase().includes(q) || (p.code ?? "").toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q);
      }
      return true;
    });
  }, [packages, filterGroup, search]);

  const groupedPackages = useMemo(() => {
    const map = new Map<number, ServicePackage[]>();
    filteredPackages.forEach(p => {
      const gid = p.groupId ?? 0;
      if (!map.has(gid)) map.set(gid, []);
      map.get(gid)!.push(p);
    });
    return map;
  }, [filteredPackages]);

  const deletePkg = useMutation({
    mutationFn: (id: number) => fetch(`${BASE}/api/service-packages/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["service-packages"] }); setSelectedPkg(null); },
  });
  const togglePkgActive = useMutation({
    mutationFn: (pkg: ServicePackage) => fetch(`${BASE}/api/service-packages/${pkg.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !pkg.isActive }),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["service-packages"] }),
  });
  const deleteSurcharge = useMutation({
    mutationFn: (id: number) => fetch(`${BASE}/api/surcharges/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["surcharges"] }),
  });
  const toggleSurchargeActive = useMutation({
    mutationFn: (s: Surcharge) => fetch(`${BASE}/api/surcharges/${s.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !s.isActive }),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["surcharges"] }),
  });
  const deleteGroup = useMutation({
    mutationFn: (id: number) => fetch(`${BASE}/api/service-groups/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["service-groups"] }),
  });

  const surchargesByCategory = useMemo(() => {
    const map = new Map<string, Surcharge[]>();
    surcharges.forEach(s => {
      const cat = s.category ?? "Khác";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(s);
    });
    return map;
  }, [surcharges]);

  return (
    <div className="flex h-full gap-6 -mx-4 sm:-mx-6 lg:-mx-8 -my-4 sm:-my-6 lg:-my-8 overflow-hidden">
      {/* Left Panel */}
      <div className={`flex flex-col ${selectedPkg ? "hidden lg:flex lg:w-[calc(100%-440px)]" : "w-full"} overflow-hidden`}>
        {/* Header */}
        <div className="px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 lg:pt-8 pb-4 flex-shrink-0">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Danh mục bảng giá</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Quản lý gói dịch vụ, phụ phí và nhóm dịch vụ</p>
            </div>
            <div className="flex gap-2">
              {tab === "packages" && (
                <Button onClick={() => { setEditingPkg(null); setShowPkgModal(true); }} className="gap-1.5 text-sm">
                  <Plus className="w-4 h-4" /> Tạo gói mới
                </Button>
              )}
              {tab === "surcharges" && (
                <Button onClick={() => { setEditingSurcharge(null); setShowSurchargeModal(true); }} className="gap-1.5 text-sm">
                  <Plus className="w-4 h-4" /> Thêm phụ phí
                </Button>
              )}
              {tab === "groups" && (
                <Button onClick={() => { setEditingGroup(null); setShowGroupModal(true); }} className="gap-1.5 text-sm">
                  <Plus className="w-4 h-4" /> Thêm nhóm
                </Button>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-muted/50 p-1 rounded-xl w-fit mb-4">
            {[
              { key: "packages", icon: Package, label: "Gói dịch vụ", count: packages.length },
              { key: "surcharges", icon: Tag, label: "Phụ phí", count: surcharges.length },
              { key: "groups", icon: Layers, label: "Nhóm dịch vụ", count: groups.length },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => { setTab(t.key as typeof tab); setSelectedPkg(null); }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.key ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                <t.icon className="w-4 h-4" />
                <span>{t.label}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab === t.key ? "bg-primary/10 text-primary" : "bg-muted"}`}>{t.count}</span>
              </button>
            ))}
          </div>

          {/* Search + Filter */}
          {tab === "packages" && (
            <div className="flex gap-2 flex-wrap">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  className="pl-9 h-9 text-sm"
                  placeholder="Tìm tên gói, mã gói..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <div className="flex gap-1 flex-wrap">
                <button
                  onClick={() => setFilterGroup(null)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterGroup === null ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"}`}
                >
                  Tất cả
                </button>
                {groups.map(g => (
                  <button
                    key={g.id}
                    onClick={() => setFilterGroup(g.id === filterGroup ? null : g.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterGroup === g.id ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"}`}
                  >
                    {g.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {tab === "surcharges" && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9 h-9 text-sm" placeholder="Tìm phụ phí..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 pb-8">
          {tab === "packages" && (
            <div className="space-y-4">
              {pkgLoading ? (
                <div className="text-center py-12 text-muted-foreground">Đang tải...</div>
              ) : groups.map(group => {
                const pkgsInGroup = groupedPackages.get(group.id) ?? [];
                if (pkgsInGroup.length === 0 && (filterGroup !== null || search)) return null;
                if (pkgsInGroup.length === 0 && !filterGroup && !search) return null;
                const expanded = isGroupExpanded(group.id);
                return (
                  <div key={group.id} className="border border-border rounded-xl overflow-hidden bg-card">
                    <button
                      onClick={() => toggleGroup(group.id)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Package className="w-4 h-4 text-primary" />
                        </div>
                        <div className="text-left">
                          <p className="font-semibold text-sm">{group.name}</p>
                          <p className="text-xs text-muted-foreground">{pkgsInGroup.length} gói</p>
                        </div>
                      </div>
                      {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                    </button>

                    {expanded && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 p-3">
                        {pkgsInGroup.map(pkg => (
                          <button
                            key={pkg.id}
                            onClick={() => setSelectedPkg(selectedPkg?.id === pkg.id ? null : pkg)}
                            className={`text-left p-4 rounded-xl border transition-all hover:shadow-md ${
                              selectedPkg?.id === pkg.id
                                ? "border-primary bg-primary/5 shadow-md"
                                : "border-border bg-background hover:border-primary/30"
                            } ${!pkg.isActive ? "opacity-60" : ""}`}
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <p className="font-semibold text-sm">{pkg.name}</p>
                                {pkg.code && <p className="text-xs text-muted-foreground">{pkg.code}</p>}
                                {/* Badge loại dịch vụ & số photo */}
                                {pkg.serviceType && (() => {
                                  const typeLabel: Record<string, string> = {
                                    tiec: "🎊 Tiệc cưới", tiec_le: "🎊 Tiệc + Lễ",
                                    phong_su: "📸 Phóng sự", phong_su_luxury: "📸 Phóng sự luxury",
                                    combo_co_makeup: "💄 Có makeup", combo_khong_makeup: "👗 Không makeup",
                                  };
                                  const isCombo = pkg.serviceType?.startsWith("combo");
                                  return (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      <span className="text-[9px] px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full font-semibold">{typeLabel[pkg.serviceType!] ?? pkg.serviceType}</span>
                                      {!isCombo && <span className="text-[9px] px-1.5 py-0.5 bg-sky-100 text-sky-700 rounded-full font-semibold">📷 {pkg.photoCount ?? 1} photo</span>}
                                    </div>
                                  );
                                })()}
                              </div>
                              {!pkg.isActive && <span className="text-[10px] px-1.5 py-0.5 bg-muted rounded text-muted-foreground">Ẩn</span>}
                            </div>
                            <p className="text-xl font-bold text-primary mb-1">{formatVND(pkg.price)}</p>
                            {/* Chi phí cố định */}
                            {(pkg.printCost > 0 || pkg.operatingCost > 0 || pkg.salePercent > 0) && (
                              <div className="mt-1.5 space-y-0.5 text-[11px] text-muted-foreground">
                                {pkg.printCost > 0 && <p>🖨️ In ấn: {formatVNDShort(pkg.printCost)}</p>}
                                {pkg.operatingCost > 0 && <p>⚡ Vận hành: {formatVNDShort(pkg.operatingCost)}</p>}
                                {pkg.salePercent > 0 && <p>💼 Sale: {pkg.salePercent}% ≈ {formatVNDShort(Math.round(pkg.price * pkg.salePercent / 100))}</p>}
                                <p className="text-green-600 font-semibold">
                                  📊 Lợi nhuận (chưa trừ nhân sự): {formatVNDShort(pkg.price - pkg.printCost - pkg.operatingCost - Math.round(pkg.price * pkg.salePercent / 100))}
                                </p>
                              </div>
                            )}
                            {pkg.items.length > 0 && (
                              <p className="text-xs text-muted-foreground mt-1.5">{pkg.items.length} hạng mục</p>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {filteredPackages.length === 0 && !pkgLoading && (
                <div className="text-center py-16 text-muted-foreground">
                  <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>Không tìm thấy gói dịch vụ</p>
                </div>
              )}
            </div>
          )}

          {tab === "surcharges" && (
            <div className="space-y-4">
              {Array.from(surchargesByCategory.entries()).map(([cat, list]) => {
                const filtered = search ? list.filter(s => s.name.toLowerCase().includes(search.toLowerCase())) : list;
                if (!filtered.length) return null;
                return (
                  <div key={cat} className="border border-border rounded-xl overflow-hidden bg-card">
                    <div className="px-4 py-2.5 bg-muted/30 border-b border-border">
                      <p className="font-semibold text-sm">{cat}</p>
                    </div>
                    <div className="divide-y divide-border">
                      {filtered.map(s => (
                        <div key={s.id} className={`flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors ${!s.isActive ? "opacity-60" : ""}`}>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">{s.name}</p>
                            {s.description && <p className="text-xs text-muted-foreground truncate">{s.description}</p>}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="font-bold text-primary text-sm">+{formatVND(s.price)}</p>
                            <p className="text-xs text-muted-foreground">/ {s.unit}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => toggleSurchargeActive.mutate(s)}
                              className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
                              title={s.isActive ? "Ẩn" : "Hiện"}
                            >
                              {s.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={() => { setEditingSurcharge(s); setShowSurchargeModal(true); }}
                              className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => { if (confirm("Xoá phụ phí này?")) deleteSurcharge.mutate(s.id); }}
                              className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors text-destructive/70 hover:text-destructive"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              {surcharges.length === 0 && (
                <div className="text-center py-16 text-muted-foreground">
                  <Tag className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>Chưa có phụ phí nào</p>
                </div>
              )}
            </div>
          )}

          {tab === "groups" && (
            <div className="space-y-2">
              {groups.map(g => {
                const count = packages.filter(p => p.groupId === g.id).length;
                return (
                  <div key={g.id} className={`flex items-center gap-3 p-4 rounded-xl border border-border bg-card hover:border-primary/20 transition-colors ${!g.isActive ? "opacity-60" : ""}`}>
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Layers className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold">{g.name}</p>
                      {g.description && <p className="text-sm text-muted-foreground">{g.description}</p>}
                      <p className="text-xs text-muted-foreground mt-0.5">{count} gói dịch vụ</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { setEditingGroup(g); setShowGroupModal(true); }}
                        className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => { if (confirm("Xoá nhóm này? Các gói trong nhóm sẽ không bị xoá.")) deleteGroup.mutate(g.id); }}
                        className="p-2 rounded-lg hover:bg-destructive/10 transition-colors text-destructive/70 hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right Detail Panel */}
      {selectedPkg && (
        <div className="w-full lg:w-[420px] flex-shrink-0 border-l border-border bg-card flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
            <div>
              <p className="font-bold text-base">{selectedPkg.name}</p>
              <p className="text-xs text-muted-foreground">{selectedPkg.code} · {groups.find(g => g.id === selectedPkg.groupId)?.name}</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => { setEditingPkg(selectedPkg); setShowPkgModal(true); }}
                className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => { if (confirm("Xoá gói này?")) deletePkg.mutate(selectedPkg.id); }}
                className="p-2 rounded-lg hover:bg-destructive/10 transition-colors text-destructive/70 hover:text-destructive"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button onClick={() => setSelectedPkg(null)} className="p-2 rounded-lg hover:bg-muted transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Price info + cost breakdown */}
            <div className="p-4 bg-primary/5 rounded-xl border border-primary/10">
              <p className="text-xs text-muted-foreground mb-1">Giá bán</p>
              <p className="text-2xl font-bold text-primary">{formatVND(selectedPkg.price)}</p>
            </div>
            {(selectedPkg.printCost > 0 || selectedPkg.operatingCost > 0 || selectedPkg.salePercent > 0) && (() => {
              const saleAmt = Math.round(selectedPkg.price * selectedPkg.salePercent / 100);
              const fixedCost = selectedPkg.printCost + selectedPkg.operatingCost + saleAmt;
              const profitBeforeStaff = selectedPkg.price - fixedCost;
              return (
                <div className="p-4 bg-muted/30 rounded-xl border border-border space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Chi phí cố định</p>
                  <div className="space-y-1 text-sm">
                    {selectedPkg.printCost > 0 && (
                      <div className="flex justify-between"><span className="text-muted-foreground">🖨️ In ấn</span><span>{formatVND(selectedPkg.printCost)}</span></div>
                    )}
                    {selectedPkg.operatingCost > 0 && (
                      <div className="flex justify-between"><span className="text-muted-foreground">⚡ Vận hành</span><span>{formatVND(selectedPkg.operatingCost)}</span></div>
                    )}
                    {selectedPkg.salePercent > 0 && (
                      <div className="flex justify-between"><span className="text-muted-foreground">💼 Sale ({selectedPkg.salePercent}%)</span><span>≈ {formatVND(saleAmt)}</span></div>
                    )}
                  </div>
                  <div className="border-t border-border pt-2 flex justify-between text-sm font-semibold">
                    <span className="text-muted-foreground">Còn lại (chưa trừ nhân sự)</span>
                    <span className={profitBeforeStaff >= 0 ? "text-green-600" : "text-destructive"}>{formatVND(profitBeforeStaff)}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground italic">* Chi phí nhiếp ảnh & trang điểm tính theo bảng giá riêng của từng nhân sự</p>
                </div>
              );
            })()}

            {selectedPkg.description && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Mô tả</p>
                <p className="text-sm">{selectedPkg.description}</p>
              </div>
            )}

            {/* Items */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Chi tiết hạng mục</p>
              {selectedPkg.items.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">Chưa có hạng mục chi tiết</p>
              ) : (
                <div className="space-y-1.5">
                  {selectedPkg.items.map((item, idx) => (
                    <div key={item.id ?? idx} className="flex items-start gap-2 p-2.5 bg-muted/30 rounded-lg">
                      <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium">{item.name}</span>
                        {item.quantity && item.unit && (
                          <span className="text-xs text-muted-foreground ml-1.5">× {item.quantity} {item.unit}</span>
                        )}
                        {item.notes && <p className="text-xs text-muted-foreground italic">{item.notes}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {selectedPkg.notes && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-xl border border-amber-200/50">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">Ghi chú</p>
                <p className="text-sm text-amber-800 dark:text-amber-300">{selectedPkg.notes}</p>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-border space-y-2 flex-shrink-0">
            <Button
              onClick={() => navigate("/bookings")}
              className="w-full gap-2"
            >
              <ShoppingCart className="w-4 h-4" /> Tạo đơn hàng từ gói này
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate("/quotes")}
              className="w-full gap-2"
            >
              <FileText className="w-4 h-4" /> Tạo báo giá từ gói này
            </Button>
            <button
              onClick={() => togglePkgActive.mutate(selectedPkg)}
              className={`w-full text-sm font-medium py-2 px-4 rounded-xl transition-colors border ${
                selectedPkg.isActive
                  ? "border-muted text-muted-foreground hover:bg-muted/50"
                  : "border-emerald-200 text-emerald-600 bg-emerald-50 hover:bg-emerald-100"
              }`}
            >
              {selectedPkg.isActive ? (
                <span className="flex items-center justify-center gap-2"><EyeOff className="w-4 h-4" /> Ẩn gói này</span>
              ) : (
                <span className="flex items-center justify-center gap-2"><Eye className="w-4 h-4" /> Hiển thị gói này</span>
              )}
            </button>
          </div>
        </div>
      )}

      {showPkgModal && (
        <PackageModal
          pkg={editingPkg}
          groups={groups}
          onClose={() => setShowPkgModal(false)}
          onSaved={(saved) => {
            qc.invalidateQueries({ queryKey: ["service-packages"] });
            setShowPkgModal(false);
            setSelectedPkg(saved);
          }}
        />
      )}

      {showSurchargeModal && (
        <SurchargeModal
          surcharge={editingSurcharge}
          onClose={() => setShowSurchargeModal(false)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ["surcharges"] }); setShowSurchargeModal(false); }}
        />
      )}

      {showGroupModal && (
        <GroupModal
          group={editingGroup}
          onClose={() => setShowGroupModal(false)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ["service-groups"] }); setShowGroupModal(false); }}
        />
      )}
    </div>
  );
}

function PackageModal({
  pkg, groups, onClose, onSaved,
}: {
  pkg: ServicePackage | null;
  groups: ServiceGroup[];
  onClose: () => void;
  onSaved: (p: ServicePackage) => void;
}) {
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
  const [form, setForm] = useState({
    groupId: pkg?.groupId?.toString() ?? "",
    code: pkg?.code ?? "",
    name: pkg?.name ?? "",
    price: pkg?.price?.toString() ?? "",
    costPrice: pkg?.costPrice?.toString() ?? "",
    printCost: pkg?.printCost?.toString() ?? "",
    operatingCost: pkg?.operatingCost?.toString() ?? "",
    salePercent: pkg?.salePercent?.toString() ?? "",
    description: pkg?.description ?? "",
    notes: pkg?.notes ?? "",
    isActive: pkg?.isActive ?? true,
  });
  const [items, setItems] = useState<PackageItem[]>(
    pkg?.items.length ? pkg.items : []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const addItem = () => setItems(prev => [...prev, { name: "", quantity: "1", unit: "bộ", notes: "", sortOrder: prev.length }]);
  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: keyof PackageItem, val: string) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it));
  };

  const save = async () => {
    if (!form.name.trim()) { setError("Vui lòng nhập tên gói"); return; }
    setSaving(true);
    setError("");
    try {
      const body = {
        ...form,
        groupId: form.groupId ? parseInt(form.groupId) : null,
        price: parseFloat(form.price) || 0,
        costPrice: parseFloat(form.costPrice) || 0,
        printCost: parseFloat(form.printCost) || 0,
        operatingCost: parseFloat(form.operatingCost) || 0,
        salePercent: parseFloat(form.salePercent) || 0,
        items: items.filter(it => it.name.trim()).map((it, i) => ({ ...it, sortOrder: i })),
      };
      const url = pkg ? `${BASE}/api/service-packages/${pkg.id}` : `${BASE}/api/service-packages`;
      const resp = await fetch(url, {
        method: pkg ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error("Lỗi lưu gói");
      const saved = await resp.json();
      onSaved(saved);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <h2 className="text-lg font-bold">{pkg ? "Chỉnh sửa gói dịch vụ" : "Tạo gói dịch vụ mới"}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 rounded-lg text-destructive text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Nhóm dịch vụ</label>
              <select
                className="w-full h-9 border border-input rounded-lg px-3 text-sm bg-background"
                value={form.groupId}
                onChange={e => setForm(f => ({ ...f, groupId: e.target.value }))}
              >
                <option value="">-- Chọn nhóm --</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Mã gói</label>
              <Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="VD: AS-BASIC" className="h-9 text-sm" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Tên gói <span className="text-destructive">*</span></label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nhập tên gói dịch vụ" className="h-9 text-sm" />
          </div>

          {/* Giá bán */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">💰 Giá bán (đ) <span className="text-destructive">*</span></label>
            <Input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="0" className="h-9 text-sm" />
          </div>

          {/* Chi phí cố định */}
          <div className="p-3 bg-muted/30 rounded-xl border border-border space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Chi phí cố định (tự động tính)</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">🖨️ In ấn (đ)</label>
                <Input type="number" value={form.printCost} onChange={e => setForm(f => ({ ...f, printCost: e.target.value }))} placeholder="0" className="h-8 text-sm" />
              </div>
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">⚡ Vận hành (đ)</label>
                <Input type="number" value={form.operatingCost} onChange={e => setForm(f => ({ ...f, operatingCost: e.target.value }))} placeholder="0" className="h-8 text-sm" />
              </div>
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">💼 Sale (%)</label>
                <Input type="number" value={form.salePercent} onChange={e => setForm(f => ({ ...f, salePercent: e.target.value }))} placeholder="10" className="h-8 text-sm" />
              </div>
            </div>
            {/* Live preview */}
            {(() => {
              const p = parseFloat(form.price) || 0;
              const pc = parseFloat(form.printCost) || 0;
              const oc = parseFloat(form.operatingCost) || 0;
              const sp = parseFloat(form.salePercent) || 0;
              const saleAmt = Math.round(p * sp / 100);
              const remaining = p - pc - oc - saleAmt;
              if (p <= 0) return null;
              return (
                <div className="text-xs bg-background rounded-lg px-3 py-2 space-y-0.5 border border-border">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Sale {sp}%</span><span>≈ {remaining < 0 ? '-' : ''}{Math.abs(saleAmt).toLocaleString("vi-VN")}đ</span>
                  </div>
                  <div className="flex justify-between font-semibold border-t border-border pt-1 mt-1">
                    <span>Còn lại (chưa trừ nhân sự)</span>
                    <span className={remaining >= 0 ? "text-green-600" : "text-destructive"}>{remaining.toLocaleString("vi-VN")}đ</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground italic">* Trừ thêm chi phí nhân sự khi tạo lịch</p>
                </div>
              );
            })()}
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Mô tả ngắn</label>
            <textarea
              className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background resize-none"
              rows={2}
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Mô tả gói dịch vụ..."
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-muted-foreground">Chi tiết hạng mục</label>
              <button onClick={addItem} className="flex items-center gap-1 text-xs text-primary hover:underline">
                <Plus className="w-3 h-3" /> Thêm hạng mục
              </button>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg">
                  <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <Input
                    value={item.name}
                    onChange={e => updateItem(idx, "name", e.target.value)}
                    placeholder="Tên hạng mục"
                    className="h-8 text-sm flex-1"
                  />
                  <Input
                    value={item.quantity}
                    onChange={e => updateItem(idx, "quantity", e.target.value)}
                    placeholder="SL"
                    className="h-8 text-sm w-14"
                  />
                  <select
                    className="h-8 border border-input rounded-md px-2 text-sm bg-background w-20"
                    value={item.unit}
                    onChange={e => updateItem(idx, "unit", e.target.value)}
                  >
                    {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <Input
                    value={item.notes}
                    onChange={e => updateItem(idx, "notes", e.target.value)}
                    placeholder="Ghi chú"
                    className="h-8 text-sm flex-1"
                  />
                  <button onClick={() => removeItem(idx)} className="text-destructive/60 hover:text-destructive p-1">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {items.length === 0 && (
                <div className="text-center py-4 text-sm text-muted-foreground border border-dashed border-border rounded-lg">
                  Nhấn "Thêm hạng mục" để bắt đầu
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Ghi chú nội bộ</label>
            <textarea
              className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background resize-none"
              rows={2}
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Ghi chú dành cho nhân viên..."
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
              className="w-4 h-4 rounded border-input"
            />
            <span className="text-sm">Gói đang hoạt động (hiển thị khi chọn)</span>
          </label>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-border flex-shrink-0">
          <Button variant="outline" onClick={onClose} className="flex-1">Huỷ</Button>
          <Button onClick={save} disabled={saving} className="flex-1">
            {saving ? "Đang lưu..." : pkg ? "Cập nhật gói" : "Tạo gói dịch vụ"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SurchargeModal({ surcharge, onClose, onSaved }: {
  surcharge: Surcharge | null; onClose: () => void; onSaved: () => void;
}) {
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
  const [form, setForm] = useState({
    name: surcharge?.name ?? "",
    category: surcharge?.category ?? "",
    price: surcharge?.price?.toString() ?? "",
    unit: surcharge?.unit ?? "lần",
    description: surcharge?.description ?? "",
    isActive: surcharge?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!form.name.trim()) { setError("Vui lòng nhập tên phụ phí"); return; }
    setSaving(true); setError("");
    try {
      const url = surcharge ? `${BASE}/api/surcharges/${surcharge.id}` : `${BASE}/api/surcharges`;
      const resp = await fetch(url, {
        method: surcharge ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, price: parseFloat(form.price) || 0 }),
      });
      if (!resp.ok) throw new Error("Lỗi lưu phụ phí");
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-bold">{surcharge ? "Sửa phụ phí" : "Thêm phụ phí mới"}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-6 py-4 space-y-4">
          {error && <div className="flex items-center gap-2 p-3 bg-destructive/10 rounded-lg text-destructive text-sm"><AlertCircle className="w-4 h-4" />{error}</div>}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Tên phụ phí *</label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="VD: Makeup chú rể" className="h-9 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Nhóm phụ phí</label>
              <Input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="VD: Nâng cấp makeup" className="h-9 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Đơn vị tính</label>
              <select className="w-full h-9 border border-input rounded-lg px-3 text-sm bg-background" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
                {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Giá (đ)</label>
            <Input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="0" className="h-9 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Mô tả</label>
            <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Mô tả phụ phí..." className="h-9 text-sm" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} className="w-4 h-4 rounded" />
            <span className="text-sm">Đang hoạt động</span>
          </label>
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-border">
          <Button variant="outline" onClick={onClose} className="flex-1">Huỷ</Button>
          <Button onClick={save} disabled={saving} className="flex-1">{saving ? "Đang lưu..." : surcharge ? "Cập nhật" : "Thêm phụ phí"}</Button>
        </div>
      </div>
    </div>
  );
}

function GroupModal({ group, onClose, onSaved }: {
  group: ServiceGroup | null; onClose: () => void; onSaved: () => void;
}) {
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
  const [form, setForm] = useState({
    name: group?.name ?? "",
    description: group?.description ?? "",
    isActive: group?.isActive ?? true,
    sortOrder: group?.sortOrder?.toString() ?? "0",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!form.name.trim()) { setError("Vui lòng nhập tên nhóm"); return; }
    setSaving(true); setError("");
    try {
      const url = group ? `${BASE}/api/service-groups/${group.id}` : `${BASE}/api/service-groups`;
      const resp = await fetch(url, {
        method: group ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, sortOrder: parseInt(form.sortOrder) || 0 }),
      });
      if (!resp.ok) throw new Error("Lỗi lưu nhóm");
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-bold">{group ? "Sửa nhóm dịch vụ" : "Thêm nhóm dịch vụ"}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-6 py-4 space-y-4">
          {error && <div className="flex items-center gap-2 p-3 bg-destructive/10 rounded-lg text-destructive text-sm"><AlertCircle className="w-4 h-4" />{error}</div>}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Tên nhóm *</label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="VD: Album studio" className="h-9 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Mô tả</label>
            <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Mô tả nhóm..." className="h-9 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Thứ tự hiển thị</label>
            <Input type="number" value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: e.target.value }))} className="h-9 text-sm" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} className="w-4 h-4 rounded" />
            <span className="text-sm">Đang hoạt động</span>
          </label>
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-border">
          <Button variant="outline" onClick={onClose} className="flex-1">Huỷ</Button>
          <Button onClick={save} disabled={saving} className="flex-1">{saving ? "Đang lưu..." : group ? "Cập nhật" : "Thêm nhóm"}</Button>
        </div>
      </div>
    </div>
  );
}
