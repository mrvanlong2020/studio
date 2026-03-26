import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  convertSolarToLunar, getCanChi, getLunarMonthName, getTietKhi,
  LUNAR_HOLIDAYS, SOLAR_HOLIDAYS,
} from "@/lib/lunar";
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval,
  isSameDay, isToday, addDays, subDays, parseISO,
} from "date-fns";
import { vi } from "date-fns/locale";
import { formatVND } from "@/lib/utils";
import {
  ChevronLeft, ChevronRight, Calendar, Clock, Phone, Package2, Sun, Moon,
  AlertCircle, Plus, X, Check, Camera, User, Sparkles,
  ChevronDown, Trash2, Save, MapPin, CreditCard, ArrowLeft,
  Pencil, ShieldCheck, Eye, FileText,
} from "lucide-react";
import { Button, Input } from "@/components/ui";
import { ServiceSearchBox } from "@/components/service-search-box";
import { SurchargeEditor, type SurchargeItem } from "@/components/surcharge-editor";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Types ────────────────────────────────────────────────────────────────────
type Booking = {
  id: number; orderCode: string; customerId: number; customerName: string;
  customerPhone: string; shootDate: string; shootTime: string;
  serviceCategory: string; packageType: string; location: string | null;
  status: string; items: OrderLine[]; surcharges?: { name: string; amount: number }[];
  totalAmount: number; depositAmount: number;
  paidAmount: number; remainingAmount: number; assignedStaff: number[];
  notes: string | null;
  // Multi-service contract fields
  parentId: number | null;
  serviceLabel: string | null;
  isParentContract: boolean;
  photoCount?: number | null;
  // Loaded on detail fetch
  siblings?: Booking[];
  parentContract?: Booking & { remainingAmount: number };
  children?: Booking[];
};
type Customer = {
  id: number; name: string; phone: string; email?: string;
  facebook?: string; zalo?: string; avatar?: string; customCode?: string; totalDebt?: number;
};
type Staff = { id: number; name: string; role: string; roles: string[]; isActive: boolean; staffType?: string };
type ServiceSplit = { role: string; amount: number; rateType: "fixed" | "percent" };
type Service = { id: number; name: string; price: number; category: string; code: string; splits?: ServiceSplit[] };
type Addon = { key: string; name: string; price: number };
type PkgItem = { name: string; quantity: string; unit?: string; notes?: string };
type ServiceOption = {
  key: string; name: string; price: number;
  splits?: ServiceSplit[];
  printCost?: number; operatingCost?: number; salePercent?: number;
  items?: PkgItem[];
  addons?: Addon[];
  products?: string[];
  serviceType?: string | null;
  photoCount?: number | null;
  includesMakeup?: boolean;
  description?: string | null;
  notes?: string | null;
};
type OrderLine = {
  tempId: string; serviceName: string; serviceId: number | null; serviceKey: string; price: number;
  basePrice: number;
  selectedAddons: string[];
  photoId: number | null; photoName: string; photoTask: string;
  makeupId: number | null; makeupName: string; makeupTask: string;
};
type SubServiceDraft = {
  id: string;
  serviceLabel: string;
  shootDate: string;       // "" = inherit contract date
  shootTime: string;
  items: OrderLine[];
  photoId: number | null; photoName: string; photoTask: string;
  makeupId: number | null; makeupName: string; makeupTask: string;
  notes: string;
};

const STATUS = {
  draft:            { label: "Lịch tạm",          color: "bg-slate-100 text-slate-600 border-slate-300",   dot: "bg-slate-400",   bar: "bg-slate-300 text-slate-700" },
  pending_service:  { label: "Chưa chốt dịch vụ", color: "bg-orange-100 text-orange-700 border-orange-300", dot: "bg-orange-400",  bar: "bg-orange-400 text-white" },
  pending:          { label: "Chờ xác nhận",       color: "bg-yellow-100 text-yellow-800 border-yellow-300", dot: "bg-yellow-400",  bar: "bg-yellow-400 text-yellow-900" },
  confirmed:        { label: "Đã xác nhận",        color: "bg-blue-100 text-blue-800 border-blue-300",       dot: "bg-blue-500",    bar: "bg-blue-500 text-white" },
  in_progress:      { label: "Đang chụp",          color: "bg-purple-100 text-purple-800 border-purple-300", dot: "bg-purple-500",  bar: "bg-purple-500 text-white" },
  completed:        { label: "Hoàn thành",         color: "bg-green-100 text-green-800 border-green-300",    dot: "bg-green-500",   bar: "bg-green-500 text-white" },
  cancelled:        { label: "Đã hủy",             color: "bg-gray-100 text-gray-500 border-gray-300",       dot: "bg-gray-400",    bar: "bg-gray-300 text-gray-600" },
} as const;

function genId() { return Math.random().toString(36).slice(2); }

// ─── Lunar helpers ─────────────────────────────────────────────────────────────
function getLunarInfo(date: Date) {
  const d = date.getDate(), m = date.getMonth() + 1, y = date.getFullYear();
  const lunar = convertSolarToLunar(d, m, y);
  const tietKhi = getTietKhi(d, m, y);
  return {
    lunar, tietKhi,
    solarHoliday: SOLAR_HOLIDAYS[`${d}-${m}`] ?? null,
    lunarHoliday: LUNAR_HOLIDAYS[`${lunar.day}-${lunar.month}`] ?? null,
  };
}

// ─── Phone autocomplete ───────────────────────────────────────────────────────
function PhoneAutocomplete({ value, onChange, onSelect }: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (c: Customer) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data: results = [] } = useQuery<Customer[]>({
    queryKey: ["customer-search", value],
    queryFn: () => fetch(`${BASE}/api/customers?search=${encodeURIComponent(value)}`).then(r => r.json()),
    enabled: value.length >= 3,
    staleTime: 5_000,
  });
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          className="pl-9 h-10"
          placeholder="Số điện thoại *"
          value={value}
          onChange={e => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => value.length >= 3 && setOpen(true)}
        />
      </div>
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 bg-background border border-border rounded-xl shadow-lg mt-1 max-h-48 overflow-y-auto">
          {results.map(c => (
            <button
              key={c.id}
              className="w-full text-left px-3 py-2.5 hover:bg-muted/60 transition-colors"
              onMouseDown={() => { onSelect(c); setOpen(false); }}
            >
              <p className="font-semibold text-sm">{c.name}</p>
              <p className="text-xs text-muted-foreground">{c.phone}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Order line row ────────────────────────────────────────────────────────────
function fmtVND(n: number) {
  return n.toLocaleString("vi-VN") + "đ";
}

type StaffRate = { staffId: number; role: string; taskKey: string; rate: number | null; rateType: string };
type CastRatePkg = { id: number; staffId: number; role: string; packageId: number; amount: number | null };

function lookupRate(staffId: number | null, role: string, taskKey: string, rates: StaffRate[]): number {
  if (!staffId) return 0;
  const exact = rates.find(r => r.staffId === staffId && r.role === role && r.taskKey === taskKey && r.rate != null);
  if (exact) return exact.rateType === "percent" ? 0 : (exact.rate ?? 0);
  const fallback = rates.find(r => r.staffId === staffId && r.role === role && r.taskKey === "mac_dinh" && r.rate != null);
  return fallback?.rate ?? 0;
}

function lookupCastByPkg(staffId: number | null, role: string, packageId: number | null, castRates: CastRatePkg[]): number | null {
  if (!staffId || !packageId) return null;
  const found = castRates.find(c => c.staffId === staffId && c.role === role && c.packageId === packageId);
  return found?.amount ?? null;
}

function OrderLineRow({ line, photographers, makeupArtists, services, allStaffRates, allCastRates, onChange, onRemove }: {
  line: OrderLine;
  photographers: Staff[];
  makeupArtists: Staff[];
  services: ServiceOption[];
  allStaffRates: StaffRate[];
  allCastRates: CastRatePkg[];
  onChange: (u: OrderLine) => void;
  onRemove?: () => void;
}) {
  const [useCustom, setUseCustom] = useState(!line.serviceId && !line.serviceKey && !!line.serviceName);

  const selectedSvc = line.serviceKey ? services.find(s => s.key === line.serviceKey) : null;
  const isPkg = !!selectedSvc?.key?.startsWith("pkg-");

  // Extract packageId from serviceKey (format: "pkg-{id}")
  const packageId = selectedSvc?.key?.startsWith("pkg-") ? parseInt(selectedSvc.key.replace("pkg-", "")) : null;

  // Cast nhân sự thực tế — ưu tiên bảng cast theo gói (staff_cast_rates), fallback sang staff_rate_prices
  const actualPhotoCastPkg = lookupCastByPkg(line.photoId, "photographer", packageId, allCastRates);
  const actualMakeupCastPkg = lookupCastByPkg(line.makeupId, "makeup", packageId, allCastRates);
  const actualPtsCastPkg = lookupCastByPkg(line.photoId, "photoshop", packageId, allCastRates);

  // Fallback sang hệ thống cũ (staff_rate_prices) nếu chưa có cast theo gói
  const actualPhotoCastOld = lookupRate(line.photoId, "photographer", line.photoTask || "mac_dinh", allStaffRates);
  const actualMakeupCastOld = lookupRate(line.makeupId, "makeup", line.makeupTask || "mac_dinh", allStaffRates);

  const photoCast = line.photoId ? (actualPhotoCastPkg ?? actualPhotoCastOld) : 0;
  const makeupCast = line.makeupId ? (actualMakeupCastPkg ?? actualMakeupCastOld) : 0;
  const ptsCast = line.photoId ? (actualPtsCastPkg ?? 0) : 0;

  // Chi phí cố định gói
  const printCost = selectedSvc?.printCost || 0;
  const operatingCost = selectedSvc?.operatingCost || 0;
  const salePercent = selectedSvc?.salePercent || 0;
  const saleAmt = Math.round(line.price * salePercent / 100);
  const totalCost = ptsCast + printCost + operatingCost + saleAmt + photoCast + makeupCast;
  const profit = line.price - totalCost;

  // Addon state — computed from line.selectedAddons + selectedSvc.addons
  const availableAddons: Addon[] = selectedSvc?.addons || [];
  const selectedAddonObjs = availableAddons.filter(a => line.selectedAddons?.includes(a.key));
  const addonTotal = selectedAddonObjs.reduce((s, a) => s + a.price, 0);

  // Dịch vụ đơn: splits cũ
  const splits = (selectedSvc?.splits || []).filter(() => !isPkg);
  const photoSplit = splits.find(sp => sp.role === "photographer");
  const makeupSplit = splits.find(sp => sp.role === "makeup");
  function calcSplit(sp: ServiceSplit | undefined) {
    if (!sp) return 0;
    return sp.rateType === "percent" ? (line.price * sp.amount / 100) : sp.amount;
  }

  function handleSelectPackage(key: string) {
    setUseCustom(false);
    const svc = services.find(s => s.key === key);
    const idNum = key.startsWith("svc-") ? parseInt(key.replace("svc-", "")) : null;
    const noMakeup = svc?.includesMakeup === false;
    onChange({
      ...line,
      serviceId: idNum,
      serviceKey: key,
      serviceName: svc?.name ?? "",
      price: svc?.price ?? 0,
      basePrice: svc?.price ?? 0,
      selectedAddons: [],
      // Tự xóa makeup khi chọn gói không có makeup
      ...(noMakeup ? { makeupId: null, makeupName: "", makeupTask: "" } : {}),
    });
  }

  function handleToggleAddon(addonKey: string, addonPrice: number) {
    const current = line.selectedAddons || [];
    const isSelected = current.includes(addonKey);
    const next = isSelected ? current.filter(k => k !== addonKey) : [...current, addonKey];
    const newAddonTotal = availableAddons.filter(a => next.includes(a.key)).reduce((s, a) => s + a.price, 0);
    onChange({ ...line, selectedAddons: next, price: (line.basePrice || 0) + newAddonTotal });
  }

  // Build a ServiceOption from current line for controlled state
  const currentServiceValue = selectedSvc ? {
    key: selectedSvc.key,
    id: line.serviceId ?? 0,
    name: selectedSvc.name,
    groupName: "",
    price: selectedSvc.price,
    serviceType: selectedSvc.serviceType,
    includesMakeup: selectedSvc.includesMakeup,
    photoCount: selectedSvc.photoCount,
    printCost: selectedSvc.printCost,
    operatingCost: selectedSvc.operatingCost,
    salePercent: selectedSvc.salePercent,
    addons: selectedSvc.addons,
    items: selectedSvc.items,
    products: selectedSvc.products,
    description: selectedSvc.description,
    notes: selectedSvc.notes,
  } : null;

  return (
    <div className="p-2.5 bg-muted/30 rounded-xl border border-border/50 space-y-2">
      {/* Chọn dịch vụ / gói — ServiceSearchBox */}
      <div className="flex gap-1.5 items-start">
        <div className="flex-1 min-w-0">
          <ServiceSearchBox
            value={useCustom ? null : currentServiceValue}
            onChange={svc => {
              if (!svc) { setUseCustom(false); onChange({ ...line, serviceId: null, serviceKey: "", serviceName: "", basePrice: 0, selectedAddons: [] }); return; }
              handleSelectPackage(svc.key);
            }}
            placeholder="Tìm gói / dịch vụ..."
            allowCustom
            onCustom={() => { setUseCustom(true); onChange({ ...line, serviceId: null, serviceKey: "", serviceName: "", basePrice: 0, selectedAddons: [] }); }}
          />
          {useCustom && (
            <Input className="h-9 text-sm mt-1.5" placeholder="Tên dịch vụ tự nhập..." value={line.serviceName} onChange={e => onChange({ ...line, serviceName: e.target.value })} />
          )}
        </div>
        <button onClick={onRemove} className="p-1.5 mt-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors flex-shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Gói: badge loại dịch vụ + số photo — chỉ hiện khi có serviceType */}
      {isPkg && selectedSvc?.serviceType && (() => {
        const typeLabel: Record<string, string> = {
          tiec: "🎊 Tiệc cưới",
          tiec_le: "🎊 Tiệc + Lễ",
          phong_su: "📸 Phóng sự",
          phong_su_luxury: "📸 Phóng sự luxury (2 photo)",
          combo_co_makeup: "💄 Combo có makeup",
          combo_khong_makeup: "👗 Combo không makeup",
          quay_phim: "🎬 Quay phim",
          beauty: "✨ Chụp Beauty",
          gia_dinh: "👨‍👩‍👧 Chụp Gia đình",
          makeup_le: "💋 Makeup lẻ",
          in_anh: "🖨️ In ảnh",
        };
        const label = typeLabel[selectedSvc.serviceType] ?? selectedSvc.serviceType;
        const photoN = selectedSvc?.photoCount ?? 1;
        const isNoPhoto = ["makeup_le", "in_anh"].includes(selectedSvc.serviceType ?? "");
        return (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 bg-indigo-100 text-indigo-700 text-[10px] font-semibold px-2 py-1 rounded-full">
              {label}
            </span>
            {/* Badge photographer — chỉ hiện cho gói chụp ảnh, không phải combo/makeup/in ảnh */}
            {!selectedSvc?.serviceType?.startsWith("combo") && !isNoPhoto && photoN > 0 && (
              <span className="inline-flex items-center gap-1 bg-sky-100 text-sky-700 text-[10px] font-semibold px-2 py-1 rounded-full">
                📷 {photoN} photographer
              </span>
            )}
          </div>
        );
      })()}

      {/* Gói: description + notes panel */}
      {isPkg && selectedSvc?.description && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
          <p className="text-[10px] font-semibold text-amber-800 mb-1">📋 Mô tả dịch vụ</p>
          <div className="space-y-1">
            {selectedSvc.description.split("\n").filter(Boolean).map((line, i) => (
              <p key={i} className="text-[10px] text-amber-700 leading-relaxed">{line}</p>
            ))}
          </div>
          {selectedSvc.notes && (
            <div className="mt-1.5 pt-1.5 border-t border-amber-200">
              <p className="text-[10px] font-semibold text-amber-900 mb-0.5">⚠️ Lưu ý</p>
              <p className="text-[10px] text-amber-800">{selectedSvc.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Gói: hiện "Bao gồm" */}
      {isPkg && selectedSvc?.items && selectedSvc.items.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-2">
          <p className="text-[10px] font-semibold text-blue-800 mb-1">✅ Bao gồm</p>
          <div className="space-y-0.5">
            {selectedSvc.items.map((item, i) => (
              <div key={i} className="text-[10px] text-blue-700 flex gap-1">
                <span className="text-blue-400">•</span>
                <span>{item.quantity} {item.unit} {item.name}{item.notes ? ` (${item.notes})` : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gói: sản phẩm đầu ra */}
      {isPkg && selectedSvc?.products && selectedSvc.products.length > 0 && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg px-2.5 py-2">
          <p className="text-[10px] font-semibold text-purple-800 mb-1">🎁 Sản phẩm nhận được</p>
          <div className="space-y-0.5">
            {selectedSvc.products.map((p, i) => (
              <div key={i} className="text-[10px] text-purple-700 flex gap-1">
                <span className="text-purple-400">•</span><span>{p}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chọn nhân sự */}
      <div className="grid grid-cols-2 gap-1.5">
        <div>
          <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1"><Camera className="w-3 h-3" /> Nhiếp ảnh</p>
          <select className="w-full h-8 border border-input rounded-lg px-2 text-xs bg-background" value={line.photoId ?? ""}
            onChange={e => { const s = photographers.find(x => x.id === parseInt(e.target.value)); onChange({ ...line, photoId: s?.id ?? null, photoName: s?.name ?? "", photoTask: "" }); }}>
            <option value="">— Chọn —</option>
            {photographers.map(s => <option key={s.id} value={s.id}>{s.name}{s.staffType === "freelancer" ? " (CTV)" : ""}</option>)}
          </select>
          {line.photoId && (
            <select className="w-full h-8 border border-input rounded-lg px-2 text-xs bg-background mt-1" value={line.photoTask ?? ""}
              onChange={e => onChange({ ...line, photoTask: e.target.value })}>
              <option value="">— Loại chụp —</option>
              <option value="chup_cong">Chụp cổng</option>
              <option value="chup_album">Chụp album</option>
              <option value="chup_tiec_truyen_thong">Chụp tiệc truyền thống</option>
              <option value="chup_tiec_phong_su">Chụp tiệc phóng sự</option>
              <option value="chup_beauty">Chụp beauty</option>
              <option value="chup_nang_tho">Chụp nàng thơ</option>
              <option value="chup_gia_dinh">Chụp gia đình</option>
              <option value="chup_em_be">Chụp em bé</option>
              <option value="chup_ngoai_canh">Chụp ngoại cảnh</option>
              <option value="chup_prewedding">Chụp prewedding</option>
              <option value="chup_concept">Chụp concept</option>
              <option value="chup_san_pham">Chụp sản phẩm</option>
              <option value="ho_tro_chup">Hỗ trợ chụp</option>
              <option value="mac_dinh">Mặc định</option>
            </select>
          )}
          {line.photoId && photoCast > 0 && (
            <div className="mt-1 text-[10px] bg-blue-50 text-blue-700 rounded px-2 py-1 flex justify-between">
              <span>💰 Cast {photographers.find(p => p.id === line.photoId)?.name}</span>
              <span className="font-semibold">{fmtVND(photoCast)}</span>
            </div>
          )}
          {line.photoId && photoCast === 0 && (
            <div className="mt-1 text-[10px] bg-orange-50 text-orange-600 rounded px-2 py-1">⚠️ Chưa có cast</div>
          )}
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1"><Sparkles className="w-3 h-3" /> Makeup</p>
          {isPkg && selectedSvc?.includesMakeup === false ? (
            <div className="h-8 flex items-center px-3 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-500 italic">
              🚫 Gói không bao gồm makeup
            </div>
          ) : (
            <>
              <select className="w-full h-8 border border-input rounded-lg px-2 text-xs bg-background" value={line.makeupId ?? ""}
                onChange={e => { const s = makeupArtists.find(x => x.id === parseInt(e.target.value)); onChange({ ...line, makeupId: s?.id ?? null, makeupName: s?.name ?? "", makeupTask: "" }); }}>
                <option value="">— Không —</option>
                {makeupArtists.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {line.makeupId && (
                <select className="w-full h-8 border border-input rounded-lg px-2 text-xs bg-background mt-1" value={line.makeupTask ?? ""}
                  onChange={e => onChange({ ...line, makeupTask: e.target.value })}>
                  <option value="">— Loại makeup —</option>
                  <option value="makeup_chup_cong">Makeup chụp cổng</option>
                  <option value="makeup_chup_album">Makeup chụp album</option>
                  <option value="makeup_chup_tiec">Makeup chụp tiệc</option>
                  <option value="makeup_nang_tho">Makeup nàng thơ</option>
                  <option value="makeup_beauty">Makeup beauty</option>
                  <option value="makeup_ngoai_canh">Makeup ngoại cảnh</option>
                  <option value="makeup_co_dau">Makeup cô dâu</option>
                  <option value="makeup_me">Makeup mẹ / người thân</option>
                  <option value="makeup_phu">Makeup phụ</option>
                  <option value="mac_dinh">Mặc định</option>
                </select>
              )}
              {line.makeupId && makeupCast > 0 && (
                <div className="mt-1 text-[10px] bg-pink-50 text-pink-700 rounded px-2 py-1 flex justify-between">
                  <span>💰 Cast {makeupArtists.find(m => m.id === line.makeupId)?.name}</span>
                  <span className="font-semibold">{fmtVND(makeupCast)}</span>
                </div>
              )}
              {line.makeupId && makeupCast === 0 && (
                <div className="mt-1 text-[10px] bg-orange-50 text-orange-600 rounded px-2 py-1">⚠️ Chưa có cast</div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Addon */}
      {isPkg && availableAddons.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
          <p className="text-[10px] font-semibold text-amber-800 mb-1.5">➕ Dịch vụ cộng thêm (addon)</p>
          <div className="space-y-1">
            {availableAddons.map(addon => {
              const checked = line.selectedAddons?.includes(addon.key) ?? false;
              return (
                <label key={addon.key} className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => handleToggleAddon(addon.key, addon.price)}
                    className="w-3.5 h-3.5 accent-amber-600 cursor-pointer"
                  />
                  <span className={`text-[10px] flex-1 ${checked ? "text-amber-900 font-semibold" : "text-amber-700"}`}>{addon.name}</span>
                  <span className="text-[10px] text-amber-700 font-medium">+{fmtVND(addon.price)}</span>
                </label>
              );
            })}
          </div>
          {addonTotal > 0 && (
            <div className="mt-1.5 pt-1.5 border-t border-amber-200 flex justify-between text-[10px] font-semibold text-amber-800">
              <span>Addon cộng thêm</span><span>+{fmtVND(addonTotal)}</span>
            </div>
          )}
        </div>
      )}

      {/* Giá bán — khóa với gói, cho sửa với dịch vụ đơn */}
      <div className="flex items-end gap-3">
        <div>
          <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
            <CreditCard className="w-3 h-3" /> Giá {isPkg ? "tổng" : "bán"} (đ)
            {isPkg && <span className="ml-1 bg-green-100 text-green-700 text-[9px] px-1 py-0.5 rounded font-semibold">Cố định tiệm</span>}
          </p>
          {isPkg ? (
            <div className="h-8 flex items-center px-3 bg-green-50 border border-green-200 rounded-lg text-sm font-bold text-green-700">
              {fmtVND(line.price)}
              {addonTotal > 0 && <span className="ml-2 text-[10px] text-amber-600 font-normal">({fmtVND(line.basePrice || 0)} + addon)</span>}
            </div>
          ) : (
            <Input type="number" className="h-8 text-sm w-40" value={line.price || ""} placeholder="0"
              onChange={e => onChange({ ...line, price: parseFloat(e.target.value) || 0 })} />
          )}
        </div>
        {/* Dịch vụ đơn: studio giữ */}
        {!isPkg && line.price > 0 && splits.length > 0 && (
          <div className="text-[10px] text-muted-foreground pb-1">
            Studio giữ: <span className="font-semibold text-green-600">
              {fmtVND(line.price - calcSplit(photoSplit) - calcSplit(makeupSplit))}
            </span>
          </div>
        )}
      </div>

      {/* Panel lợi nhuận (chỉ hiện khi gói được chọn) */}
      {isPkg && line.price > 0 && (
        <div className="text-[11px] rounded-lg border overflow-hidden">
          <div className="bg-emerald-600 text-white px-3 py-1.5 flex justify-between items-center">
            <span className="font-bold">📊 Dự tính lợi nhuận</span>
            <span className={`font-bold text-sm ${profit >= 0 ? "text-emerald-100" : "text-red-200"}`}>
              {profit >= 0 ? "+" : ""}{fmtVND(profit)}
            </span>
          </div>
          <div className="bg-white px-3 py-1">
            <div className="flex justify-between font-semibold text-emerald-700 text-[10px]">
              <span>💵 Doanh thu</span><span>{fmtVND(line.price)}</span>
            </div>
          </div>
          <div className="bg-red-50 px-3 py-1.5 space-y-0.5 text-[10px]">
            <p className="font-semibold text-red-800">(-) Chi phí sản xuất</p>
            {/* Cast chụp: thực tế nếu có nhân sự */}
            {photoCast > 0 && (
              <div className="flex justify-between text-blue-700">
                <span>📷 Cast chụp{line.photoId ? ` — ${photographers.find(p => p.id === line.photoId)?.name ?? ""}` : ""}</span>
                <span>{fmtVND(photoCast)}</span>
              </div>
            )}
            {/* Cast makeup: thực tế nếu có nhân sự */}
            {makeupCast > 0 && (
              <div className="flex justify-between text-pink-700">
                <span>💄 Cast makeup{line.makeupId ? ` — ${makeupArtists.find(m => m.id === line.makeupId)?.name ?? ""}` : ""}</span>
                <span>{fmtVND(makeupCast)}</span>
              </div>
            )}
            {/* PTS cast */}
            {ptsCast > 0 && (
              <div className="flex justify-between text-purple-700">
                <span>🖥️ PTS chỉnh ảnh</span>
                <span>{fmtVND(ptsCast)}</span>
              </div>
            )}
            {printCost > 0 && <div className="flex justify-between text-red-700"><span>🖨️ In ấn</span><span>{fmtVND(printCost)}</span></div>}
            {operatingCost > 0 && <div className="flex justify-between text-red-700"><span>⚡ Vận hành</span><span>{fmtVND(operatingCost)}</span></div>}
            {saleAmt > 0 && <div className="flex justify-between text-red-700"><span>💼 Sale {salePercent}%</span><span>{fmtVND(saleAmt)}</span></div>}
            <div className="flex justify-between font-semibold text-red-800 border-t border-red-200 pt-0.5">
              <span>Tổng chi phí</span><span>{fmtVND(totalCost)}</span>
            </div>
          </div>
          <div className={`px-3 py-1.5 flex justify-between font-bold text-[11px] ${profit >= 0 ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
            <span>= Lợi nhuận</span>
            <span>{profit >= 0 ? "+" : ""}{fmtVND(profit)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Show form (create / edit booking) ────────────────────────────────────────
function ShowFormPanel({
  date, initialTime = "07:00", onDateChange, booking, onClose, onSaved,
}: {
  date: Date;
  initialTime?: string;
  onDateChange: (d: Date) => void;
  booking: Booking | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!booking;

  const [phone, setPhone] = useState(booking?.customerPhone ?? "");
  const [customerName, setCustomerName] = useState(booking?.customerName ?? "");
  const [customerId, setCustomerId] = useState<number | null>(booking?.customerId ?? null);
  const [facebook, setFacebook] = useState("");
  const [zalo, setZalo] = useState("");
  const [avatar, setAvatar] = useState<string>("");
  const [showExtra, setShowExtra] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [shootDate, setShootDateLocal] = useState(() => format(date, "yyyy-MM-dd"));
  const shootDateObj = useMemo(() => {
    try { const d = parseISO(shootDate); return isNaN(d.getTime()) ? date : d; } catch { return date; }
  }, [shootDate, date]);
  const [location, setLocation] = useState(booking?.location ?? "");
  const [status, setStatus] = useState(booking?.status ?? "confirmed");

  const handleShootDateChange = (newVal: string) => {
    setShootDateLocal(newVal);
    try {
      const parsed = parseISO(newVal);
      if (!isNaN(parsed.getTime())) onDateChange(parsed);
    } catch { /* ignore */ }
  };


  const [deposit, setDeposit] = useState(booking?.depositAmount?.toString() ?? "0");
  const [depositMethod, setDepositMethod] = useState<"cash" | "bank_transfer">("cash");
  const [notes, setNotes] = useState(booking?.notes ?? "");
  const [photoCount, setPhotoCount] = useState<string>(() => String(booking?.photoCount ?? ""));
  const [surcharges, setSurcharges] = useState<SurchargeItem[]>(() => {
    const raw = booking?.surcharges ?? [];
    return raw.map((s: { name: string; amount: number }, i: number) => ({ id: `s${i}`, ...s }));
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // ── Service blocks (unified: single or multi-service) ────────────────────
  const emptyOrderLine = (): OrderLine => ({
    tempId: genId(), serviceName: "", serviceId: null, serviceKey: "",
    price: 0, basePrice: 0, selectedAddons: [],
    photoId: null, photoName: "", photoTask: "",
    makeupId: null, makeupName: "", makeupTask: "",
  });
  const makeSubDraft = (defaultDate: string, defaultTime: string): SubServiceDraft => ({
    id: genId(), serviceLabel: "", shootDate: defaultDate, shootTime: defaultTime,
    items: booking?.items?.length
      ? booking.items.map(i => ({ ...i, tempId: genId() }))
      : [emptyOrderLine()],
    photoId: null, photoName: "", photoTask: "",
    makeupId: null, makeupName: "", makeupTask: "",
    notes: booking?.notes ?? "",
  });
  const [subDrafts, setSubDrafts] = useState<SubServiceDraft[]>(() => [
    makeSubDraft(format(date, "yyyy-MM-dd"), initialTime),
  ]);
  const updateSubDraft = (id: string, patch: Partial<SubServiceDraft>) =>
    setSubDrafts(p => p.map(s => s.id === id ? { ...s, ...patch } : s));
  const addSubDraft = () =>
    setSubDrafts(p => [...p, { id: genId(), serviceLabel: "", shootDate: shootDate, shootTime: "08:00", items: [emptyOrderLine()], photoId: null, photoName: "", photoTask: "", makeupId: null, makeupName: "", makeupTask: "", notes: "" }]);

  const { data: allStaff = [] } = useQuery<Staff[]>({ queryKey: ["staff"], queryFn: () => fetch(`${BASE}/api/staff`).then(r => r.json()) });
  const { data: services = [] } = useQuery<Service[]>({ queryKey: ["services"], queryFn: () => fetch(`${BASE}/api/services`).then(r => r.json()) });
  const { data: pricingPackages = [] } = useQuery<{
    id: number; name: string; price: number;
    printCost: number; operatingCost: number; salePercent: number;
    items?: PkgItem[]; addons?: Addon[]; products?: string[]; description?: string | null; notes?: string | null;
    serviceType?: string | null; photoCount?: number | null; includesMakeup?: boolean;
  }[]>({ queryKey: ["service-packages"], queryFn: () => fetch(`${BASE}/api/service-packages`).then(r => r.json()) });
  const { data: allStaffRates = [] } = useQuery<StaffRate[]>({ queryKey: ["staff-rates"], queryFn: () => fetch(`${BASE}/api/staff-rates`).then(r => r.json()) });
  const { data: allCastRates = [] } = useQuery<CastRatePkg[]>({ queryKey: ["staff-cast-all"], queryFn: () => fetch(`${BASE}/api/staff-cast`).then(r => r.json()), staleTime: 60_000 });

  // Support both old single-role and new multi-role staff
  const hasRole = (s: Staff, role: string) => s.roles?.includes(role) || s.role === role;
  const photographers = allStaff.filter(s => s.isActive && hasRole(s, "photographer"));
  const makeupArtists = allStaff.filter(s => s.isActive && hasRole(s, "makeup"));
  const saleStaff = allStaff.filter(s => s.isActive && hasRole(s, "sale"));
  const photoshopStaff = allStaff.filter(s => s.isActive && hasRole(s, "photoshop"));

  // Booking-level role assignments
  const getAssignedObj = () => {
    const as = booking?.assignedStaff;
    if (as && !Array.isArray(as) && typeof as === "object") return as as Record<string, number>;
    return {};
  };
  const [saleId, setSaleId] = useState<number | null>(() => getAssignedObj().sale ?? null);
  const [saleTask, setSaleTask] = useState<string>(() => String(getAssignedObj().saleTask ?? "mac_dinh"));
  const [photoshopId, setPhotoshopId] = useState<number | null>(() => getAssignedObj().photoshop ?? null);
  const [photoshopTask, setPhotoshopTask] = useState<string>(() => String(getAssignedObj().photoshopTask ?? "mac_dinh"));
  const allServices: ServiceOption[] = [
    ...services.map(s => ({ key: `svc-${s.id}`, name: s.name, price: s.price, splits: s.splits || [] })),
    ...pricingPackages.map(p => ({
      key: `pkg-${p.id}`, name: p.name, price: p.price, splits: [],
      printCost: p.printCost || 0, operatingCost: p.operatingCost || 0, salePercent: p.salePercent || 0,
      items: p.items || [], addons: p.addons || [], products: p.products || [],
      serviceType: p.serviceType ?? null,
      photoCount: p.photoCount ?? null,
      includesMakeup: p.includesMakeup !== false,
      description: p.description ?? null,
      notes: p.notes ?? null,
    })),
  ];

  const subDraftsTotal = subDrafts.reduce((s, sub) => s + sub.items.reduce((si, l) => si + (l.price || 0), 0), 0);
  const surchargesTotal = surcharges.reduce((s, i) => s + (i.amount || 0), 0);
  const totalAmount = subDraftsTotal + surchargesTotal;
  const depositNum = parseFloat(deposit) || 0;
  const remaining = Math.max(0, totalAmount - depositNum);

  const handleSelectCustomer = (c: Customer) => {
    setCustomerId(c.id); setCustomerName(c.name); setPhone(c.phone);
    setFacebook(c.facebook ?? ""); setZalo(c.zalo ?? "");
    if (c.avatar) setAvatar(c.avatar);
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setAvatar(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const save = async () => {
    setError("");
    if (!customerName.trim()) { setError("Vui lòng nhập tên khách hàng"); return; }
    if (!phone.trim()) { setError("Vui lòng nhập số điện thoại"); return; }
    if (!shootDate) { setError("Vui lòng chọn ngày hợp đồng"); return; }
    const isMulti = subDrafts.length >= 2;
    setSaving(true);
    try {
      // ── 1. Tạo / tìm khách hàng ──
      let cid = customerId;
      if (!cid) {
        const found = await fetch(`${BASE}/api/customers?search=${encodeURIComponent(phone)}`).then(r => r.json()) as Customer[];
        const existing = found.find(c => c.phone === phone);
        if (existing) {
          cid = existing.id;
          if (avatar && !existing.avatar) {
            await fetch(`${BASE}/api/customers/${cid}`, {
              method: "PUT", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ avatar }),
            });
          }
        } else {
          const nc = await fetch(`${BASE}/api/customers`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: customerName, phone, facebook: facebook || undefined, zalo: zalo || undefined, avatar: avatar || undefined, source: "walk-in" }),
          }).then(r => r.json()) as Customer;
          cid = nc.id;
        }
      }

      let saved: Booking;

      // ── Multi-service contract mode ──
      if (isMulti) {
        const assignedStaff: Record<string, unknown> = {};
        if (saleId) { assignedStaff.sale = saleId; assignedStaff.saleTask = saleTask || "mac_dinh"; }
        if (photoshopId) { assignedStaff.photoshop = photoshopId; assignedStaff.photoshopTask = photoshopTask || "mac_dinh"; }

        const subServicePayloads = subDrafts.map(sub => {
          const validItems = sub.items.filter(l => l.serviceName || l.serviceId);
          const subTotal = sub.items.reduce((s, l) => s + (l.price || 0), 0);
          const subAssigned: Record<string, unknown> = {};
          if (sub.photoId) { subAssigned.photo = sub.photoId; subAssigned.photoTask = sub.photoTask || "mac_dinh"; }
          if (sub.makeupId) { subAssigned.makeup = sub.makeupId; subAssigned.makeupTask = sub.makeupTask || "mac_dinh"; }
          return {
            serviceLabel: sub.serviceLabel || `Dịch vụ ${subDrafts.indexOf(sub) + 1}`,
            shootDate: sub.shootDate || shootDate,
            shootTime: sub.shootTime || "08:00",
            items: validItems.map(({ tempId: _t, ...rest }) => rest),
            totalAmount: subTotal,
            assignedStaff: subAssigned,
            notes: sub.notes || null,
          };
        });

        const body = {
          customerId: cid,
          shootDate,
          shootTime: "08:00",
          totalAmount: subDraftsTotal,
          depositAmount: depositNum,
          depositPaymentMethod: depositMethod,
          discountAmount: 0,
          isParentContract: true,
          packageType: subDrafts.map(s => s.serviceLabel || "Dịch vụ").join(" + "),
          assignedStaff,
          notes: notes || null,
          location: location || null,
          subServices: subServicePayloads,
        };

        saved = await fetch(`${BASE}/api/bookings`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        }).then(r => { if (!r.ok) throw new Error("Lỗi tạo hợp đồng"); return r.json(); });

        qc.invalidateQueries({ queryKey: ["bookings"] });
        qc.invalidateQueries({ queryKey: ["customers"] });
        onSaved();
        return;
      }

      // ── 2. Single booking ──
      const sub0 = subDrafts[0];
      const effectiveShootDate = sub0.shootDate || shootDate;
      const validLines = sub0.items.filter(l => l.serviceName || l.serviceId);
      const hasServices = validLines.length > 0;

      const packageType = hasServices
        ? (validLines.length === 1
            ? (validLines[0].serviceName || "Dịch vụ")
            : `${validLines[0].serviceName || "Dịch vụ"} (+${validLines.length - 1})`)
        : "Chưa chốt dịch vụ";

      const finalStatus = hasServices ? status : (status === "confirmed" || status === "in_progress" || status === "completed" ? status : "pending_service");
      const singleTotal = subDraftsTotal + surchargesTotal;
      const finalTotal = hasServices ? singleTotal : surchargesTotal;
      const finalDeposit = (hasServices || surchargesTotal > 0) ? depositNum : 0;

      const assignedStaff: Record<string, unknown> = {};
      if (saleId) { assignedStaff.sale = saleId; assignedStaff.saleTask = saleTask || "mac_dinh"; }
      if (photoshopId) { assignedStaff.photoshop = photoshopId; assignedStaff.photoshopTask = photoshopTask || "mac_dinh"; }

      const cleanedSurcharges = surcharges
        .filter(s => s.name.trim() && s.amount > 0)
        .map(({ name, amount }) => ({ name, amount }));

      const body = {
        customerId: cid, shootDate: effectiveShootDate, shootTime: sub0.shootTime || "08:00",
        serviceCategory: "wedding", packageType,
        location: location || null, status: finalStatus,
        totalAmount: finalTotal, depositAmount: finalDeposit,
        depositPaymentMethod: finalDeposit > 0 ? depositMethod : undefined,
        discountAmount: 0,
        items: hasServices ? validLines.map(({ tempId: _t, ...rest }) => rest) : [],
        surcharges: cleanedSurcharges,
        assignedStaff, notes: notes || null,
        photoCount: photoCount !== "" ? parseInt(photoCount) : null,
      };

      if (isEdit && booking) {
        saved = await fetch(`${BASE}/api/bookings/${booking.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        }).then(r => { if (!r.ok) throw new Error("Lỗi cập nhật"); return r.json(); });
      } else {
        saved = await fetch(`${BASE}/api/bookings`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        }).then(r => { if (!r.ok) throw new Error("Lỗi tạo đơn"); return r.json(); });
      }

      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Có lỗi, thử lại");
    } finally { setSaving(false); }
  };

  const deleteMutation = useMutation({
    mutationFn: () => fetch(`${BASE}/api/bookings/${booking?.id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["bookings"] }); onSaved(); },
  });

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b flex-shrink-0 bg-gradient-to-r from-primary/5 to-transparent">
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors flex-shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm">{isEdit ? "✏️ Chỉnh sửa show" : "✨ Tạo show mới"}</p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {format(shootDateObj, "EEEE, dd/MM/yyyy", { locale: vi })} · {subDrafts[0]?.shootTime ?? initialTime}
          </p>
        </div>
        {isEdit && (
          <button
            onClick={() => { if (confirm("Xoá show này?")) deleteMutation.mutate(); }}
            className="p-1.5 rounded-lg text-destructive/60 hover:text-destructive hover:bg-destructive/10 transition-colors flex-shrink-0"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-5 max-w-2xl mx-auto">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 rounded-xl text-destructive text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}

          {/* A. Khách hàng */}
          <section className="space-y-2">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" /> A. Khách hàng
            </h4>
            {/* 1. Tên khách hàng */}
            <Input className="h-10" placeholder="Tên khách hàng *" value={customerName} onChange={e => setCustomerName(e.target.value)} />
            {/* 2. Số điện thoại */}
            <PhoneAutocomplete value={phone} onChange={v => { setPhone(v); setCustomerId(null); }} onSelect={handleSelectCustomer} />
            {customerId && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-1.5 rounded-lg">
                <Check className="w-3.5 h-3.5" /> Khách cũ đã tìm thấy (ID #{customerId})
              </div>
            )}
            {/* 3. Avatar khách hàng */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                className="relative w-14 h-14 rounded-full border-2 border-dashed border-border hover:border-primary overflow-hidden flex items-center justify-center bg-muted/40 transition-colors flex-shrink-0"
              >
                {avatar
                  ? <img src={avatar} alt="avatar" className="w-full h-full object-cover" />
                  : <Camera className="w-5 h-5 text-muted-foreground" />
                }
                <div className="absolute inset-0 bg-black/20 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Camera className="w-4 h-4 text-white" />
                </div>
              </button>
              <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
              <div className="flex-1">
                <p className="text-xs font-medium text-foreground">Ảnh đại diện khách hàng</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Bấm vào vòng tròn để chọn ảnh từ thiết bị</p>
                {avatar && (
                  <button type="button" onClick={() => setAvatar("")} className="text-[11px] text-destructive hover:underline mt-0.5">Xoá ảnh</button>
                )}
              </div>
            </div>
            {/* 4. + Mở rộng FB / Zalo */}
            <button type="button" onClick={() => setShowExtra(!showExtra)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground py-0.5">
              <span className={`w-4 h-4 rounded-full border border-current flex items-center justify-center transition-transform ${showExtra ? "rotate-45" : ""}`}>
                <Plus className="w-2.5 h-2.5" />
              </span>
              {showExtra ? "Ẩn Facebook / Zalo" : "Thêm Facebook / Zalo"}
            </button>
            {showExtra && (
              <div className="grid grid-cols-2 gap-2">
                <Input className="h-9 text-sm" placeholder="Facebook link" value={facebook} onChange={e => setFacebook(e.target.value)} />
                <Input className="h-9 text-sm" placeholder="Zalo SĐT" value={zalo} onChange={e => setZalo(e.target.value)} />
              </div>
            )}
          </section>

          {/* B. Thông tin hợp đồng */}
          <section className="space-y-2">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" /> B. Thông tin hợp đồng
            </h4>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 block">📅 Ngày hợp đồng *</label>
                <Input type="date" className="h-9 text-sm" value={shootDate} onChange={e => handleShootDateChange(e.target.value)} />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 block">Trạng thái</label>
                <select className="w-full h-9 border border-input rounded-lg px-2 text-sm bg-background" value={status} onChange={e => setStatus(e.target.value)}>
                  <option value="draft">📋 Lịch tạm</option>
                  <option value="pending_service">⏳ Chưa chốt dịch vụ</option>
                  <option value="pending">🟡 Chờ xác nhận</option>
                  <option value="confirmed">🔵 Đã xác nhận</option>
                  <option value="in_progress">🟣 Đang thực hiện</option>
                  <option value="completed">🟢 Hoàn thành</option>
                  <option value="cancelled">⚫ Đã hủy</option>
                </select>
              </div>
            </div>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9 h-9 text-sm" placeholder="Địa điểm (tuỳ chọn)" value={location} onChange={e => setLocation(e.target.value)} />
            </div>
          </section>

          {/* C. Danh sách dịch vụ */}
          <section className="space-y-3">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Package2 className="w-3.5 h-3.5" /> C. Dịch vụ / Job chụp
              {subDrafts.length >= 2 && (
                <span className="normal-case text-[10px] font-medium text-violet-500 bg-violet-50 dark:bg-violet-950/30 px-1.5 py-0.5 rounded-full border border-violet-200 dark:border-violet-800">
                  Hợp đồng {subDrafts.length} dịch vụ
                </span>
              )}
            </h4>
            {subDrafts.map((sub, idx) => {
              const subTotal = sub.items.reduce((s, l) => s + (l.price || 0), 0);
              return (
                <div key={sub.id} className="rounded-xl border border-violet-200 dark:border-violet-800 overflow-hidden">
                  {/* Block header */}
                  <div className="flex items-center gap-2 px-3 py-2 bg-violet-50 dark:bg-violet-950/30 border-b border-violet-200 dark:border-violet-800">
                    <span className="w-5 h-5 rounded-full bg-violet-600 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">{idx + 1}</span>
                    <Input
                      className="h-7 text-sm border-0 bg-transparent p-0 font-semibold focus-visible:ring-0 placeholder:text-muted-foreground/60 flex-1"
                      placeholder={idx === 0 ? "Tên dịch vụ (VD: Đám hỏi, Ngày cưới...)" : `Tên dịch vụ ${idx + 1} (VD: Ngày cưới...)`}
                      value={sub.serviceLabel}
                      onChange={e => updateSubDraft(sub.id, { serviceLabel: e.target.value })}
                    />
                    {subDrafts.length > 1 && (
                      <button type="button" onClick={() => setSubDrafts(p => p.filter(s => s.id !== sub.id))} className="p-1 text-muted-foreground hover:text-destructive transition-colors" title="Xoá dịch vụ này">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="p-3 space-y-2.5 bg-background">
                    {/* Date/time row */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-muted-foreground mb-1 block">📅 Ngày thực hiện</label>
                        <Input type="date" className="h-8 text-sm" value={sub.shootDate} onChange={e => updateSubDraft(sub.id, { shootDate: e.target.value })} />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground mb-1 block">⏰ Giờ bắt đầu</label>
                        <Input type="time" className="h-8 text-sm" value={sub.shootTime} onChange={e => updateSubDraft(sub.id, { shootTime: e.target.value })} />
                      </div>
                    </div>
                    {/* Service rows */}
                    <div>
                      <label className="text-[10px] text-muted-foreground mb-1 block">Gói / dịch vụ</label>
                      <div className="space-y-1.5">
                        {sub.items.map(line => (
                          <OrderLineRow key={line.tempId} line={line} photographers={photographers} makeupArtists={makeupArtists} services={allServices} allStaffRates={allStaffRates} allCastRates={allCastRates}
                            onChange={updated => updateSubDraft(sub.id, { items: sub.items.map(l => l.tempId === line.tempId ? updated : l) })}
                            onRemove={sub.items.length > 1 ? () => updateSubDraft(sub.id, { items: sub.items.filter(l => l.tempId !== line.tempId) }) : undefined}
                          />
                        ))}
                        <button
                          type="button"
                          onClick={() => updateSubDraft(sub.id, { items: [...sub.items, emptyOrderLine()] })}
                          className="text-xs text-primary hover:underline"
                        >
                          + Thêm gói trong cùng ngày
                        </button>
                      </div>
                    </div>
                    {/* Notes */}
                    <Input className="h-8 text-sm" placeholder="Ghi chú cho dịch vụ này..." value={sub.notes} onChange={e => updateSubDraft(sub.id, { notes: e.target.value })} />
                    {/* Sub total */}
                    {subTotal > 0 && (
                      <div className="text-xs text-right text-primary font-semibold">{formatVND(subTotal)}</div>
                    )}
                    {/* Add next service button — inside the block, at the bottom */}
                    {idx === subDrafts.length - 1 && (
                      <button
                        type="button"
                        onClick={addSubDraft}
                        className="w-full mt-1 py-2 border-2 border-dashed border-violet-300 dark:border-violet-700 rounded-lg text-sm text-violet-600 dark:text-violet-400 hover:border-violet-500 hover:bg-violet-50/50 dark:hover:bg-violet-950/20 transition-all flex items-center justify-center gap-2 font-medium"
                      >
                        <Plus className="w-4 h-4" /> Thêm dịch vụ mới
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </section>

          {/* C2. Phụ thu / phát sinh */}
          <section className="space-y-2">
            <div className="p-3 bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/60 rounded-xl">
              <SurchargeEditor value={surcharges} onChange={setSurcharges} />
            </div>
          </section>

          {/* D. Phân công nhân sự (booking-level) */}
          {(saleStaff.length > 0 || photoshopStaff.length > 0) && (
            <section className="space-y-2">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" /> D. Phân công (Sale / Photoshop)
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {saleStaff.length > 0 && (
                  <div>
                    <label className="text-[10px] text-muted-foreground mb-1 block">💼 Người sale</label>
                    <select
                      className="w-full h-8 border border-input rounded-lg px-2 text-xs bg-background"
                      value={saleId ?? ""}
                      onChange={e => setSaleId(e.target.value ? parseInt(e.target.value) : null)}
                    >
                      <option value="">-- Chưa chọn --</option>
                      {saleStaff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    {saleId && (
                      <select className="w-full h-8 border border-input rounded-lg px-2 text-xs bg-background mt-1"
                        value={saleTask} onChange={e => setSaleTask(e.target.value)}>
                        <option value="mac_dinh">— Loại sale (mặc định) —</option>
                        <option value="sale_chup_cong">Sale chụp cổng</option>
                        <option value="sale_chup_album">Sale chụp album</option>
                        <option value="sale_chup_tiec">Sale chụp tiệc</option>
                        <option value="sale_beauty">Sale beauty</option>
                        <option value="sale_prewedding">Sale prewedding</option>
                        <option value="sale_combo_cuoi">Sale combo cưới</option>
                        <option value="sale_tron_goi">Sale trọn gói</option>
                        <option value="sale_phat_sinh">Sale phát sinh</option>
                      </select>
                    )}
                  </div>
                )}
                {photoshopStaff.length > 0 && (
                  <div>
                    <label className="text-[10px] text-muted-foreground mb-1 block">🖥️ Người photoshop</label>
                    <select
                      className="w-full h-8 border border-input rounded-lg px-2 text-xs bg-background"
                      value={photoshopId ?? ""}
                      onChange={e => setPhotoshopId(e.target.value ? parseInt(e.target.value) : null)}
                    >
                      <option value="">-- Chưa chọn --</option>
                      {photoshopStaff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    {photoshopId && (
                      <select className="w-full h-8 border border-input rounded-lg px-2 text-xs bg-background mt-1"
                        value={photoshopTask} onChange={e => setPhotoshopTask(e.target.value)}>
                        <option value="mac_dinh">— Loại chỉnh sửa (mặc định) —</option>
                        <option value="chinh_album">Chỉnh album</option>
                        <option value="chinh_anh_le">Chỉnh ảnh lẻ</option>
                        <option value="chinh_anh_beauty">Chỉnh ảnh beauty</option>
                        <option value="chinh_anh_cuoi">Chỉnh ảnh cưới</option>
                        <option value="blend_mau">Blend màu</option>
                        <option value="retouch_da">Retouch da</option>
                        <option value="thiet_ke_album">Thiết kế album</option>
                        <option value="xuat_file">Xuất file</option>
                      </select>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* E. Tiền */}
          <section className="space-y-2">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5" /> E. Thanh toán
            </h4>
            <div className="bg-muted/40 rounded-xl p-3 space-y-2.5 border border-border/50">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Tổng tiền:</span>
                <span className="font-bold text-base">{formatVND(totalAmount)}</span>
              </div>
              <div className="flex justify-between items-center gap-3">
                <span className="text-sm text-muted-foreground flex-shrink-0">Đặt cọc:</span>
                <Input type="number" className="h-8 text-sm text-right w-40" value={deposit} placeholder="0" onChange={e => setDeposit(e.target.value)} />
              </div>
              {parseFloat(deposit) > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground flex-shrink-0">H.thức cọc:</span>
                  <div className="flex gap-1 ml-auto">
                    {([{ v: "cash", label: "💵 Tiền mặt" }, { v: "bank_transfer", label: "🏦 CK" }] as { v: "cash" | "bank_transfer"; label: string }[]).map(opt => (
                      <button
                        key={opt.v}
                        type="button"
                        onClick={() => setDepositMethod(opt.v)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${depositMethod === opt.v ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex justify-between items-center border-t border-border/60 pt-2">
                <span className="text-sm font-semibold">Còn lại:</span>
                <span className={`font-bold text-base ${remaining > 0 ? "text-destructive" : "text-emerald-600"}`}>{formatVND(remaining)}</span>
              </div>
            </div>
          </section>

          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">📸 Số tấm ảnh chỉnh:</label>
            <input
              type="number" min="0" step="1"
              className="w-24 border border-input rounded-lg px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 tabular-nums"
              placeholder="0"
              value={photoCount}
              onChange={e => setPhotoCount(e.target.value)}
            />
            <span className="text-xs text-muted-foreground">tấm (dùng tính cast)</span>
          </div>
          <textarea
            className="w-full border border-input rounded-xl px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
            rows={2} placeholder="Ghi chú nội bộ..."
            value={notes} onChange={e => setNotes(e.target.value)}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t flex-shrink-0 bg-background/80 max-w-2xl mx-auto w-full">
        <Button onClick={save} disabled={saving} className="w-full gap-2 h-11">
          {saving
            ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Đang lưu...</>
            : <><Save className="w-4 h-4" /> {isEdit ? "Cập nhật show" : "Lưu & tạo show"}</>
          }
        </Button>
      </div>
    </div>
  );
}

// ─── Show Detail Panel (read-only, Google Calendar style) ─────────────────────
type DetailAddon = { key: string; name: string; price: number };
type DetailPackage = { id: number; code: string; addons?: DetailAddon[]; products?: string[]; items?: PkgItem[]; description?: string | null; notes?: string | null };

// ─── Xuất hợp đồng PDF ────────────────────────────────────────────────────────
function fmtVNDStr(n: number) {
  return n.toLocaleString("vi-VN") + " đ";
}

function generateContractHTML(booking: Booking, siblings: Booking[]): string {
  const today = new Date();
  const todayStr = format(today, "dd/MM/yyyy");
  const shootDateStr = (() => {
    try { const d = parseISO(booking.shootDate); return isNaN(d.getTime()) ? booking.shootDate : format(d, "dd/MM/yyyy"); } catch { return booking.shootDate; }
  })();

  // For multi-service: compute totals from siblings if available
  const allServices = siblings.length > 0 ? siblings : [booking];
  const totalAmount = siblings.length > 0
    ? siblings.reduce((s, b) => s + (b.totalAmount || 0), 0)
    : booking.totalAmount;
  const paidAmount = siblings.length > 0
    ? siblings.reduce((s, b) => s + (b.paidAmount || 0), 0)
    : booking.paidAmount;
  const remainingAmount = Math.max(0, totalAmount - paidAmount);

  const servicesHTML = allServices.map((b, idx) => {
    const bDate = (() => { try { const d = parseISO(b.shootDate); return isNaN(d.getTime()) ? b.shootDate : format(d, "dd/MM/yyyy"); } catch { return b.shootDate; }})();
    const label = b.serviceLabel || b.packageType || `Dịch vụ ${idx + 1}`;
    const items = (b.items || []);
    const surcharges = b.surcharges || [];
    const surchargesTotal = surcharges.reduce((s, i) => s + (i.amount || 0), 0);

    const itemRows = items.map((it) => `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #f0e8f0;">${it.serviceName || "—"}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #f0e8f0;text-align:right;font-weight:600;color:#8B1A6B;">${fmtVNDStr(it.price || 0)}</td>
      </tr>
      ${it.photoName ? `<tr><td colspan="2" style="padding:2px 10px 6px;color:#666;font-size:12px;border-bottom:1px solid #f0e8f0;">📷 Nhiếp ảnh: ${it.photoName}${it.makeupName ? ` &nbsp;|&nbsp; 💄 Makeup: ${it.makeupName}` : ""}</td></tr>` : ""}
    `).join("");

    const surchargeRows = surcharges.map((s) => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #f0e8f0;color:#c0392b;font-style:italic;">+ ${s.name}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #f0e8f0;text-align:right;color:#c0392b;">${fmtVNDStr(s.amount)}</td>
      </tr>
    `).join("");

    const multiHeader = allServices.length > 1 ? `
      <div style="background:#f8f0fa;border-left:4px solid #9b59b6;padding:8px 14px;margin-bottom:8px;border-radius:0 8px 8px 0;">
        <strong style="color:#6c3483;">📋 ${label}</strong>
        <span style="color:#888;font-size:12px;margin-left:10px;">Ngày: ${bDate} &nbsp;|&nbsp; Giờ: ${b.shootTime?.slice(0,5) || "—"}</span>
      </div>
    ` : "";

    return `
      ${multiHeader}
      <table style="width:100%;border-collapse:collapse;margin-bottom:${allServices.length > 1 ? "20px" : "0"};">
        <thead>
          <tr style="background:#f8f0fa;">
            <th style="padding:10px;text-align:left;color:#6c3483;font-size:13px;font-weight:700;border-bottom:2px solid #c39bd3;">Dịch vụ</th>
            <th style="padding:10px;text-align:right;color:#6c3483;font-size:13px;font-weight:700;border-bottom:2px solid #c39bd3;">Thành tiền</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
          ${surchargeRows}
          ${surchargesTotal > 0 ? `<tr><td style="padding:6px 10px;color:#888;font-size:12px;" colspan="2">Tổng phụ thu: ${fmtVNDStr(surchargesTotal)}</td></tr>` : ""}
        </tbody>
      </table>
    `;
  }).join('<div style="height:1px;background:#e8d5e8;margin:12px 0;"></div>');

  const contractCode = booking.orderCode || `HD-${booking.id}`;

  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Hợp Đồng Dịch Vụ - ${contractCode}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@300;400;500;600;700;800&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Be Vietnam Pro',sans-serif; color:#2c2c2c; background:#fff; font-size:14px; }
  .page { max-width:800px; margin:0 auto; padding:40px; }
  @media print {
    body { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .no-print { display:none !important; }
    .page { padding:20px; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- Nút in - ẩn khi in -->
  <div class="no-print" style="text-align:right;margin-bottom:20px;">
    <button onclick="window.print()" style="background:#8B1A6B;color:#fff;border:none;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;">
      🖨️ In / Lưu PDF
    </button>
  </div>

  <!-- Header Studio -->
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:32px;padding-bottom:20px;border-bottom:3px solid #8B1A6B;">
    <div>
      <div style="font-size:28px;font-weight:800;color:#8B1A6B;letter-spacing:-0.5px;">✨ Amazing Studio</div>
      <div style="color:#888;font-size:13px;margin-top:4px;">Chụp ảnh cưới &amp; cho thuê váy cưới chuyên nghiệp</div>
      <div style="color:#666;font-size:12px;margin-top:2px;">📍 TP. Hồ Chí Minh &nbsp;·&nbsp; 📞 0900 000 000</div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:22px;font-weight:800;color:#8B1A6B;">HỢP ĐỒNG DỊCH VỤ</div>
      <div style="font-size:13px;color:#555;margin-top:6px;">Số HĐ: <strong>${contractCode}</strong></div>
      <div style="font-size:13px;color:#555;">Ngày lập: <strong>${todayStr}</strong></div>
    </div>
  </div>

  <!-- Thông tin 2 bên -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:28px;">
    <div style="background:#fdf8ff;border:1px solid #e8d5e8;border-radius:12px;padding:18px;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#9b59b6;margin-bottom:10px;">🏢 Bên cung cấp dịch vụ (Bên A)</div>
      <div style="font-weight:700;font-size:15px;color:#2c2c2c;">Amazing Studio</div>
      <div style="color:#555;margin-top:4px;font-size:13px;">Địa chỉ: TP. Hồ Chí Minh</div>
      <div style="color:#555;font-size:13px;">Điện thoại: 0900 000 000</div>
    </div>
    <div style="background:#fdf8ff;border:1px solid #e8d5e8;border-radius:12px;padding:18px;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#9b59b6;margin-bottom:10px;">👤 Khách hàng (Bên B)</div>
      <div style="font-weight:700;font-size:15px;color:#2c2c2c;">${booking.customerName}</div>
      <div style="color:#555;margin-top:4px;font-size:13px;">Điện thoại: ${booking.customerPhone || "—"}</div>
    </div>
  </div>

  <!-- Thông tin lịch -->
  <div style="background:#fdf8ff;border:1px solid #e8d5e8;border-radius:12px;padding:16px 20px;margin-bottom:24px;">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#9b59b6;margin-bottom:10px;">📅 Thông tin lịch chụp</div>
    <div style="display:flex;gap:32px;flex-wrap:wrap;">
      <div><span style="color:#888;font-size:12px;">Ngày chụp</span><br/><strong style="font-size:15px;">${shootDateStr}</strong></div>
      <div><span style="color:#888;font-size:12px;">Giờ bắt đầu</span><br/><strong style="font-size:15px;">${booking.shootTime?.slice(0,5) || "—"}</strong></div>
      ${booking.location ? `<div><span style="color:#888;font-size:12px;">Địa điểm</span><br/><strong style="font-size:15px;">${booking.location}</strong></div>` : ""}
    </div>
  </div>

  <!-- Chi tiết dịch vụ -->
  <div style="margin-bottom:24px;">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#9b59b6;margin-bottom:12px;">🎁 Nội dung dịch vụ</div>
    ${servicesHTML}
  </div>

  <!-- Tổng tiền -->
  <div style="background:linear-gradient(135deg,#8B1A6B,#6c3483);border-radius:12px;padding:20px 24px;margin-bottom:28px;color:#fff;">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;opacity:0.8;margin-bottom:14px;">💰 Thanh toán</div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <span style="opacity:0.9;">Tổng giá trị hợp đồng</span>
      <span style="font-size:20px;font-weight:800;">${fmtVNDStr(totalAmount)}</span>
    </div>
    <div style="height:1px;background:rgba(255,255,255,0.2);margin:10px 0;"></div>
    <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
      <span style="opacity:0.85;">✅ Đã đặt cọc / đã thanh toán</span>
      <span style="font-weight:600;">${fmtVNDStr(paidAmount)}</span>
    </div>
    <div style="display:flex;justify-content:space-between;">
      <span style="opacity:0.85;">⏳ Còn lại cần thanh toán</span>
      <span style="font-weight:700;font-size:16px;">${fmtVNDStr(remainingAmount)}</span>
    </div>
  </div>

  ${booking.notes ? `
  <!-- Ghi chú -->
  <div style="background:#fff8e1;border:1px solid #ffe082;border-radius:10px;padding:14px 18px;margin-bottom:24px;">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#f57f17;margin-bottom:6px;">📝 Ghi chú</div>
    <div style="color:#555;font-size:13px;line-height:1.6;">${booking.notes}</div>
  </div>
  ` : ""}

  <!-- Điều khoản -->
  <div style="margin-bottom:32px;">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#9b59b6;margin-bottom:10px;">📋 Điều khoản &amp; cam kết</div>
    <div style="background:#f9f9f9;border-radius:10px;padding:16px;font-size:12px;color:#555;line-height:1.8;">
      <p>1. Bên A cam kết thực hiện đúng và đầy đủ các dịch vụ đã thỏa thuận theo hợp đồng này.</p>
      <p>2. Bên B thanh toán số tiền còn lại trước hoặc vào ngày chụp theo thỏa thuận.</p>
      <p>3. Trường hợp Bên B hủy lịch trước 07 ngày, tiền cọc sẽ được hoàn lại 50%. Hủy dưới 07 ngày, tiền cọc sẽ không được hoàn lại.</p>
      <p>4. Bên A có trách nhiệm bàn giao sản phẩm (ảnh, album) trong thời gian đã cam kết.</p>
      <p>5. Hai bên cùng ký xác nhận và đồng ý với các điều khoản trên.</p>
    </div>
  </div>

  <!-- Chữ ký -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:20px;">
    <div style="text-align:center;">
      <div style="font-weight:700;margin-bottom:6px;color:#8B1A6B;">Bên A — Amazing Studio</div>
      <div style="font-size:12px;color:#888;margin-bottom:60px;">(Ký, ghi rõ họ tên)</div>
      <div style="border-top:1px dashed #ccc;padding-top:8px;color:#666;font-size:12px;">Xác nhận ngày: ___/___/______</div>
    </div>
    <div style="text-align:center;">
      <div style="font-weight:700;margin-bottom:6px;color:#8B1A6B;">Bên B — Khách hàng</div>
      <div style="font-size:12px;color:#888;margin-bottom:60px;">(Ký, ghi rõ họ tên)</div>
      <div style="border-top:1px dashed #ccc;padding-top:8px;color:#666;font-size:12px;">Xác nhận ngày: ___/___/______</div>
    </div>
  </div>

  <div style="text-align:center;margin-top:32px;padding-top:20px;border-top:1px solid #f0e0f0;color:#bbb;font-size:11px;">
    Hợp đồng được tạo tự động bởi Amazing Studio Management System · ${todayStr}
  </div>
</div>
</body>
</html>`;
}

function ShowDetailPanel({
  booking, onClose, onEdit, onDeleteDone, isAdmin,
}: {
  booking: Booking;
  onClose: () => void;
  onEdit: () => void;
  onDeleteDone: () => void;
  isAdmin: boolean;
}) {
  const qc = useQueryClient();
  const { data: allStaff = [] } = useQuery<Staff[]>({
    queryKey: ["staff"],
    queryFn: () => fetch(`${BASE}/api/staff`).then(r => r.json()),
    staleTime: 60_000,
  });
  const { data: allPackages = [] } = useQuery<DetailPackage[]>({
    queryKey: ["service-packages"],
    queryFn: () => fetch(`${BASE}/api/service-packages`).then(r => r.json()),
    staleTime: 60_000,
  });

  // ── Fetch full detail (includes siblings/parentContract) when applicable ──
  const needsFullDetail = !!booking.parentId || !!booking.isParentContract;
  const { data: fullDetail } = useQuery<Booking & { siblings?: Booking[]; parentContract?: Booking; children?: Booking[] }>({
    queryKey: ["booking-full", booking.id],
    queryFn: () => fetch(`${BASE}/api/bookings/${booking.id}`).then(r => r.json()),
    enabled: needsFullDetail,
    staleTime: 30_000,
  });
  const siblings: Booking[] = fullDetail?.siblings ?? [];
  const parentContract: (Booking & { remainingAmount: number }) | null = (fullDetail?.parentContract as (Booking & { remainingAmount: number })) ?? null;

  const [deleting, setDeleting] = useState(false);

  const st = STATUS[booking.status as keyof typeof STATUS] ?? STATUS.pending;

  // Parse assignedStaff — might be object or array
  const assignedObj: Record<string, unknown> =
    booking.assignedStaff && !Array.isArray(booking.assignedStaff) && typeof booking.assignedStaff === "object"
      ? (booking.assignedStaff as Record<string, unknown>)
      : {};
  const saleStaffId = assignedObj.sale as number | undefined;
  const photoshopStaffId = assignedObj.photoshop as number | undefined;
  const saleStaffName = saleStaffId ? allStaff.find(s => s.id === saleStaffId)?.name : null;
  const photoshopStaffName = photoshopStaffId ? allStaff.find(s => s.id === photoshopStaffId)?.name : null;

  const surcharges = booking.surcharges ?? [];
  const surchargesTotal = surcharges.reduce((s, i) => s + (i.amount || 0), 0);

  const shootDateObj = useMemo(() => {
    try { const d = parseISO(booking.shootDate); return isNaN(d.getTime()) ? new Date() : d; } catch { return new Date(); }
  }, [booking.shootDate]);

  // Resolve package addons → names
  function resolveAddons(item: OrderLine): string[] {
    if (!item.selectedAddons?.length) return [];
    const pkgId = item.serviceKey?.startsWith("pkg-") ? parseInt(item.serviceKey.replace("pkg-", "")) : null;
    if (!pkgId) return item.selectedAddons;
    const pkg = allPackages.find(p => p.id === pkgId);
    if (!pkg?.addons) return item.selectedAddons;
    return item.selectedAddons.map(k => pkg.addons!.find(a => a.key === k)?.name ?? k);
  }

  // Resolve package products/description for first item
  function getPackageDetail(item: OrderLine): { description?: string | null; notes?: string | null; products?: string[]; items?: PkgItem[] } {
    const pkgId = item.serviceKey?.startsWith("pkg-") ? parseInt(item.serviceKey.replace("pkg-", "")) : null;
    if (!pkgId) return {};
    const pkg = allPackages.find(p => p.id === pkgId);
    return pkg ? { description: pkg.description, notes: pkg.notes, products: pkg.products, items: pkg.items } : {};
  }

  const handleDelete = async () => {
    if (!confirm("Xoá show này? Hành động không thể hoàn tác.")) return;
    setDeleting(true);
    try {
      await fetch(`${BASE}/api/bookings/${booking.id}`, { method: "DELETE" });
      qc.invalidateQueries({ queryKey: ["bookings"] });
      onDeleteDone();
    } finally { setDeleting(false); }
  };

  const handlePrintContract = () => {
    const html = generateContractHTML(booking, siblings);
    const win = window.open("", "_blank");
    if (!win) { alert("Vui lòng cho phép trình duyệt mở cửa sổ mới để xuất hợp đồng."); return; }
    win.document.write(html);
    win.document.close();
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* ── Header bar ── */}
      <div className="flex items-center gap-2 px-4 py-3 border-b flex-shrink-0 bg-gradient-to-r from-primary/5 to-transparent">
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors flex-shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${st.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
            {st.label}
          </span>
        </div>
        {/* Role indicator */}
        <div className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-full ${isAdmin ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
          {isAdmin ? <ShieldCheck className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          {isAdmin ? "Admin" : "Nhân viên"}
        </div>
        <button
          onClick={handlePrintContract}
          className="p-1.5 rounded-lg text-violet-500 hover:text-violet-700 hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors flex-shrink-0"
          title="Xuất hợp đồng PDF"
        >
          <FileText className="w-4 h-4" />
        </button>
        {isAdmin && (
          <>
            <button onClick={handleDelete} disabled={deleting} className="p-1.5 rounded-lg text-destructive/50 hover:text-destructive hover:bg-destructive/10 transition-colors flex-shrink-0" title="Xoá show">
              <Trash2 className="w-4 h-4" />
            </button>
            <button onClick={onEdit} className="p-1.5 rounded-lg text-primary hover:bg-primary/10 transition-colors flex-shrink-0" title="Chỉnh sửa">
              <Pencil className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4 max-w-2xl mx-auto">

          {/* 1. Khách hàng */}
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center flex-shrink-0 text-primary font-bold text-xl">
              {booking.customerName?.trim().split(" ").pop()?.charAt(0).toUpperCase() ?? "?"}
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <h2 className="font-bold text-xl leading-tight truncate">{booking.customerName}</h2>
              <a href={`tel:${booking.customerPhone}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary mt-0.5">
                <Phone className="w-3.5 h-3.5" />{booking.customerPhone}
              </a>
            </div>
          </div>

          <div className="border-t border-border/40" />

          {/* 2. Ngày giờ địa điểm */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2.5 text-sm">
              <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="font-medium capitalize">{format(shootDateObj, "EEEE, dd/MM/yyyy", { locale: vi })}</span>
              <span className="text-muted-foreground">·</span>
              <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="font-bold text-primary">{booking.shootTime?.slice(0, 5)}</span>
            </div>
            {booking.location && (
              <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                <MapPin className="w-4 h-4 flex-shrink-0" />
                <span>{booking.location}</span>
              </div>
            )}
          </div>

          <div className="border-t border-border/40" />

          {/* 2b. Hợp đồng đa dịch vụ — hiển thị các dịch vụ liên kết */}
          {booking.parentId && (
            <>
              {/* Service label badge */}
              {booking.serviceLabel && (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border border-violet-300 dark:border-violet-700">
                    📋 {booking.serviceLabel}
                  </span>
                  <span className="text-xs text-muted-foreground">trong hợp đồng nhiều dịch vụ</span>
                </div>
              )}

              {/* Siblings list */}
              {siblings.length > 0 && (
                <div className="rounded-xl border border-violet-200 dark:border-violet-800 overflow-hidden">
                  <div className="px-3 py-2 bg-violet-50 dark:bg-violet-950/30 border-b border-violet-200 dark:border-violet-800">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">
                      📅 Tất cả dịch vụ trong hợp đồng ({siblings.length})
                    </p>
                  </div>
                  {siblings.map((sib, idx) => {
                    const sibDate = (() => { try { const d = parseISO(sib.shootDate); return isNaN(d.getTime()) ? null : d; } catch { return null; } })();
                    const isCurrent = sib.id === booking.id;
                    const sibSt = STATUS[sib.status as keyof typeof STATUS] ?? STATUS.pending;
                    return (
                      <div key={sib.id} className={`flex items-center gap-3 px-3 py-2.5 ${idx > 0 ? "border-t border-violet-100 dark:border-violet-900" : ""} ${isCurrent ? "bg-violet-50 dark:bg-violet-950/20" : ""}`}>
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${sibSt.dot}`} />
                        <div className="flex-1 min-w-0">
                          <span className={`text-sm font-semibold ${isCurrent ? "text-violet-700 dark:text-violet-300" : ""}`}>
                            {sib.serviceLabel || sib.packageType || `Dịch vụ ${idx + 1}`}
                            {isCurrent && <span className="ml-1.5 text-[10px] bg-violet-200 dark:bg-violet-800 px-1.5 py-0.5 rounded font-bold">Đang xem</span>}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {sibDate ? format(sibDate, "dd/MM/yyyy") : "—"}
                        </span>
                        {isAdmin && sib.totalAmount > 0 && (
                          <span className="text-xs font-bold text-primary flex-shrink-0">{fmtVND(sib.totalAmount)}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Contract totals from parent */}
              {isAdmin && parentContract && (
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 overflow-hidden">
                  <div className="px-3 py-2 bg-emerald-50 dark:bg-emerald-950/30 border-b border-emerald-200 dark:border-emerald-800">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">💰 Tổng hợp đồng</p>
                  </div>
                  <div className="px-3 py-2.5 space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Tổng hợp đồng</span>
                      <span className="font-bold">{fmtVND(parentContract.totalAmount)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Đã đặt cọc</span>
                      <span className="font-semibold text-emerald-600">{fmtVND(parentContract.depositAmount)}</span>
                    </div>
                    <div className="flex justify-between text-sm border-t border-border/40 pt-1.5">
                      <span className="font-semibold">Còn lại</span>
                      <span className={`font-bold ${parentContract.remainingAmount > 0 ? "text-destructive" : "text-emerald-600"}`}>{fmtVND(parentContract.remainingAmount)}</span>
                    </div>
                  </div>
                </div>
              )}
              <div className="border-t border-border/40" />
            </>
          )}

          {/* 3. Dịch vụ */}
          {booking.items && booking.items.length > 0 ? (
            <div className="space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Package2 className="w-3.5 h-3.5" /> Dịch vụ đặt chụp
              </p>
              {booking.items.map((item, idx) => {
                const pkgDetail = getPackageDetail(item);
                const addonNames = resolveAddons(item);
                return (
                  <div key={idx} className="rounded-xl border border-border/50 overflow-hidden">
                    {/* Service header */}
                    <div className="flex items-center justify-between px-3 py-2.5 bg-muted/30">
                      <span className="font-semibold text-sm">{item.serviceName || "Dịch vụ"}</span>
                      {isAdmin && item.price > 0 && (
                        <span className="text-sm font-bold text-primary">{fmtVND(item.price)}</span>
                      )}
                    </div>

                    {/* Description */}
                    {pkgDetail.description && (
                      <div className="px-3 py-2 bg-amber-50/50 dark:bg-amber-950/10 border-t border-border/30">
                        {pkgDetail.description.split("\n").filter(Boolean).map((line, i) => (
                          <p key={i} className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">{line}</p>
                        ))}
                      </div>
                    )}

                    {/* Package items (bao gồm) */}
                    {pkgDetail.items && pkgDetail.items.length > 0 && (
                      <div className="px-3 py-2 bg-blue-50/40 dark:bg-blue-950/10 border-t border-border/30">
                        <p className="text-[10px] font-bold text-blue-700 dark:text-blue-300 mb-1.5">✅ Bao gồm</p>
                        <div className="space-y-0.5">
                          {pkgDetail.items.map((pi, i) => (
                            <div key={i} className="text-xs text-blue-700 dark:text-blue-400 flex gap-1">
                              <span className="text-blue-400">•</span>
                              <span>{pi.quantity} {pi.unit} {pi.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Products */}
                    {pkgDetail.products && pkgDetail.products.length > 0 && (
                      <div className="px-3 py-2 bg-purple-50/40 dark:bg-purple-950/10 border-t border-border/30">
                        <p className="text-[10px] font-bold text-purple-700 dark:text-purple-300 mb-1.5">🎁 Sản phẩm nhận được</p>
                        <div className="space-y-0.5">
                          {pkgDetail.products.map((p, i) => (
                            <div key={i} className="text-xs text-purple-700 dark:text-purple-400 flex gap-1">
                              <span className="text-purple-400">•</span><span>{p}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Selected addons */}
                    {addonNames.length > 0 && (
                      <div className="px-3 py-2 bg-orange-50/40 dark:bg-orange-950/10 border-t border-border/30">
                        <p className="text-[10px] font-bold text-orange-700 dark:text-orange-300 mb-1.5">➕ Addon đã chọn</p>
                        {addonNames.map((n, i) => (
                          <div key={i} className="text-xs text-orange-700 dark:text-orange-400 flex gap-1">
                            <span className="text-orange-400">•</span><span>{n}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Staff assignments */}
                    {(item.photoName || item.makeupName) && (
                      <div className="px-3 py-2 border-t border-border/30 space-y-1">
                        {item.photoName && (
                          <div className="flex items-center gap-2 text-xs">
                            <Camera className="w-3.5 h-3.5 text-sky-500 flex-shrink-0" />
                            <span className="text-muted-foreground">Nhiếp ảnh:</span>
                            <span className="font-medium">{item.photoName}</span>
                          </div>
                        )}
                        {item.makeupName && (
                          <div className="flex items-center gap-2 text-xs">
                            <Sparkles className="w-3.5 h-3.5 text-pink-500 flex-shrink-0" />
                            <span className="text-muted-foreground">Makeup:</span>
                            <span className="font-medium">{item.makeupName}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground italic py-2">
              <Package2 className="w-4 h-4" /> Chưa chốt dịch vụ
            </div>
          )}

          {/* 4. Sale / Photoshop — admin only (booking-level) */}
          {isAdmin && (saleStaffName || photoshopStaffName) && (
            <>
              <div className="border-t border-border/40" />
              <div className="space-y-1.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" /> Phân công thêm
                </p>
                {saleStaffName && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-base flex-shrink-0">💼</span>
                    <span className="font-medium">{saleStaffName}</span>
                    <span className="text-xs text-muted-foreground">(Sale)</span>
                  </div>
                )}
                {photoshopStaffName && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-base flex-shrink-0">🖥️</span>
                    <span className="font-medium">{photoshopStaffName}</span>
                    <span className="text-xs text-muted-foreground">(Photoshop)</span>
                  </div>
                )}
              </div>
            </>
          )}

          {/* 5. Phụ thu / phát sinh */}
          {surcharges.length > 0 && (
            <>
              <div className="border-t border-border/40" />
              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">➕ Phụ thu / phát sinh</p>
                <div className="rounded-xl border border-amber-200/60 overflow-hidden">
                  {surcharges.map((s, i) => (
                    <div key={i} className={`flex justify-between items-center px-3 py-2 text-sm ${i > 0 ? "border-t border-amber-100" : ""} bg-amber-50/40`}>
                      <span className="text-amber-800 dark:text-amber-300">{s.name}</span>
                      {isAdmin && <span className="font-semibold text-amber-900 dark:text-amber-200">{fmtVND(s.amount)}</span>}
                    </div>
                  ))}
                  {isAdmin && surchargesTotal > 0 && (
                    <div className="flex justify-between items-center px-3 py-2 text-sm font-bold bg-amber-100/60 border-t border-amber-200">
                      <span className="text-amber-900">Tổng phụ thu</span>
                      <span className="text-amber-900">{fmtVND(surchargesTotal)}</span>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* 6. Thanh toán — admin only */}
          {isAdmin && (
            <>
              <div className="border-t border-border/40" />
              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5" /> Thanh toán
                </p>
                <div className="rounded-xl border border-border/50 overflow-hidden divide-y divide-border/40">
                  <div className="flex justify-between items-center px-3 py-2.5">
                    <span className="text-sm text-muted-foreground">Tổng tiền</span>
                    <span className="font-bold text-base">{formatVND(booking.totalAmount)}</span>
                  </div>
                  <div className="flex justify-between items-center px-3 py-2.5">
                    <span className="text-sm text-muted-foreground">Đã thanh toán</span>
                    <span className="font-semibold text-emerald-600">{formatVND(booking.paidAmount)}</span>
                  </div>
                  <div className={`flex justify-between items-center px-3 py-2.5 ${booking.remainingAmount > 0 ? "bg-destructive/5" : "bg-emerald-50/40"}`}>
                    <span className="text-sm font-semibold">Còn lại</span>
                    <span className={`font-bold text-base ${booking.remainingAmount > 0 ? "text-destructive" : "text-emerald-600"}`}>
                      {booking.remainingAmount > 0 && <span className="mr-1">⚠️</span>}
                      {formatVND(booking.remainingAmount)}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* 7. Photo count + Ghi chú */}
          {(booking.photoCount || booking.notes) && (
            <div className="border-t border-border/40" />
          )}
          {booking.photoCount != null && booking.photoCount > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">📸 Số tấm ảnh chỉnh:</span>
              <span className="font-semibold text-sky-600">{booking.photoCount.toLocaleString("vi-VN")} tấm</span>
            </div>
          )}
          {booking.notes && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">📝 Ghi chú nội bộ</p>
              <p className="text-sm text-muted-foreground bg-muted/30 rounded-xl px-3 py-2 leading-relaxed">{booking.notes}</p>
            </div>
          )}

          {/* 8. Quick links — admin */}
          {isAdmin && (
            <>
              <div className="border-t border-border/40" />
              <div className="flex gap-2 flex-wrap">
                <a href="/bookings" className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                  📋 Xem đơn hàng
                </a>
                <a href="/payments" className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                  💳 Thu tiền
                </a>
              </div>
            </>
          )}

          {/* Order code footer */}
          <p className="text-center text-xs text-muted-foreground/60 pb-2">#{booking.orderCode}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Month day cell ────────────────────────────────────────────────────────────
const HOUR_PX = 64; // px per hour in day view

function MonthDayCell({
  date, bookings, isSelected, isOtherMonth, onDayClick, onEventClick,
}: {
  date: Date; bookings: Booking[]; isSelected: boolean; isOtherMonth?: boolean;
  onDayClick: (d: Date) => void; onEventClick: (b: Booking) => void;
}) {
  const { lunar, solarHoliday, lunarHoliday } = useMemo(() => getLunarInfo(date), [date]);
  const isSun = date.getDay() === 0;
  const isSat = date.getDay() === 6;
  const isLunarNew = lunar.day === 1;
  const isRam = lunar.day === 15;
  const MAX_VISIBLE = 3;

  return (
    <div
      className={[
        "group relative flex flex-col border-r border-b border-border/50 cursor-pointer select-none overflow-hidden",
        "transition-colors duration-100",
        isSelected ? "bg-primary/5" : isToday(date) ? "bg-orange-50/30 dark:bg-orange-950/10" : "hover:bg-muted/20",
        isOtherMonth ? "opacity-25" : "",
      ].join(" ")}
      style={{ minHeight: "clamp(130px, calc((100vh - 260px) / 6), 220px)" }}
      onClick={() => onDayClick(date)}
    >
      {/* Day header — compact */}
      <div className="flex items-center justify-between px-1.5 pt-1 pb-0.5 flex-shrink-0">
        <div className="flex items-center gap-1">
          <span className={[
            "text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full leading-none flex-shrink-0",
            isToday(date) ? "bg-primary text-primary-foreground" : isSun ? "text-red-500" : isSat ? "text-blue-600" : "text-foreground",
            isSelected && !isToday(date) ? "ring-2 ring-primary" : "",
          ].join(" ")}>
            {date.getDate()}
          </span>
          <span className={[
            "text-[8px] font-medium leading-none",
            lunarHoliday ? "text-red-500" : isLunarNew ? "text-primary" : isRam ? "text-amber-600" : "text-muted-foreground/60",
          ].join(" ")}>
            {isLunarNew ? `AL 1/${lunar.month}` : isRam ? "Rằm" : `AL${lunar.day}`}
          </span>
        </div>
        {(solarHoliday || lunarHoliday) && (
          <span className="text-[7px] text-red-500 font-semibold leading-none truncate max-w-[36px] hidden sm:block">
            {(solarHoliday || lunarHoliday)?.slice(0, 7)}
          </span>
        )}
      </div>

      {/* Event chips — ưu tiên: giờ → tên → photo → job */}
      <div className="flex-1 px-1 pb-1 space-y-[3px] overflow-hidden">
        {bookings
          .slice()
          .sort((a, b) => (a.shootTime ?? "").localeCompare(b.shootTime ?? ""))
          .slice(0, MAX_VISIBLE)
          .map(b => {
            const st = STATUS[b.status as keyof typeof STATUS] ?? STATUS.pending;
            const item = b.items?.[0];
            // Photo: lấy họ/tên cuối cùng (rút gọn)
            const photoLast = item?.photoName?.split(" ").pop() ?? "";
            const makeupLast = item?.makeupName?.split(" ").pop() ?? "";
            // Job: rút gọn nếu dài
            const jobText = (item?.serviceName || b.packageType?.split("(")[0].trim() || "").slice(0, 14);
            // Giờ: "07h" hoặc "07:30"
            const hourStr = b.shootTime
              ? b.shootTime.endsWith(":00") ? b.shootTime.slice(0, 2) + "h" : b.shootTime.slice(0, 5)
              : "";

            return (
              <button
                key={b.id}
                onClick={e => { e.stopPropagation(); onEventClick(b); }}
                className={`w-full text-left rounded px-1.5 py-[3px] ${st.bar} hover:brightness-95 transition-all`}
              >
                {/* Dòng 1 (bắt buộc): Giờ + Tên khách */}
                <div className="flex items-baseline gap-1 leading-tight">
                  <span className="text-[10px] font-black flex-shrink-0">{hourStr}</span>
                  <span className="text-[10px] font-semibold truncate">{b.customerName}</span>
                </div>
                {/* Dòng 2 (ưu tiên cao): Photo chính */}
                {photoLast && (
                  <div className="text-[9px] leading-tight font-medium opacity-90">
                    P: {photoLast}{makeupLast ? ` · M: ${makeupLast}` : ""}
                  </div>
                )}
                {/* Dòng 3 (nếu không có photo, hiện job): Job chụp */}
                {!photoLast && jobText && (
                  <div className="text-[9px] leading-tight opacity-85 truncate">{jobText}</div>
                )}
                {/* Dòng 3 bonus: job sau photo nếu vừa chỗ */}
                {photoLast && jobText && (
                  <div className="text-[8px] leading-tight opacity-75 truncate hidden sm:block">{jobText}</div>
                )}
              </button>
            );
          })}
        {bookings.length > MAX_VISIBLE && (
          <div className="text-[9px] text-muted-foreground pl-1">
            +{bookings.length - MAX_VISIBLE} show nữa
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Day view — 24h timeline ───────────────────────────────────────────────────
function DayView({
  date, bookings, isLoading,
  onBack, onPrevDay, onNextDay,
  onTimeClick, onEventClick,
  isAdmin, onToggleMode,
}: {
  date: Date; bookings: Booking[]; isLoading: boolean;
  onBack: () => void; onPrevDay: () => void; onNextDay: () => void;
  onTimeClick: (time: string) => void; onEventClick: (b: Booking) => void;
  isAdmin: boolean; onToggleMode: () => void;
}) {
  const { lunar, tietKhi, solarHoliday, lunarHoliday } = useMemo(() => getLunarInfo(date), [date]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to first event or 6am on mount
  useEffect(() => {
    const firstBooking = bookings.slice().sort((a, b) => (a.shootTime ?? "").localeCompare(b.shootTime ?? ""))[0];
    const scrollHour = firstBooking
      ? Math.max(0, parseInt(firstBooking.shootTime ?? "06") - 1)
      : 6;
    scrollRef.current?.scrollTo({ top: scrollHour * HOUR_PX, behavior: "smooth" });
  }, [date, bookings]);

  const hours = Array.from({ length: 24 }, (_, i) => i);

  // Position event on timeline
  const getEventStyle = (b: Booking) => {
    const [h, m] = (b.shootTime ?? "07:00").split(":").map(Number);
    const top = (h + m / 60) * HOUR_PX;
    const durationH = 2; // default 2 hours
    return { top, height: Math.max(durationH * HOUR_PX - 4, 28) };
  };

  const nowH = new Date().getHours() + new Date().getMinutes() / 60;
  const isToday_ = isToday(date);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* Header */}
      <div className="flex-shrink-0 border-b bg-card">
        <div className="flex items-center gap-2 px-4 py-3">
          <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Sun className="w-4 h-4 text-orange-400" />
              <span className="font-bold text-base capitalize">
                {format(date, "EEEE, dd/MM/yyyy", { locale: vi })}
              </span>
              {isToday_ && <span className="text-[10px] bg-primary text-primary-foreground px-2 py-0.5 rounded-full font-bold">Hôm nay</span>}
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Moon className="w-3 h-3 text-indigo-400" />
                {lunar.day}/{lunar.month} Âm lịch · {getCanChi(lunar.year)}
              </span>
              {tietKhi && <span className="text-xs text-orange-500">✦ {tietKhi}</span>}
              {(solarHoliday || lunarHoliday) && <span className="text-xs text-red-500 font-semibold">{solarHoliday || lunarHoliday}</span>}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onToggleMode}
              title={isAdmin ? "Admin mode — Bấm để xem chế độ nhân viên" : "Nhân viên mode — Bấm để xem chế độ admin"}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-medium transition-all ${isAdmin ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400" : "border-orange-300 bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400"}`}
            >
              {isAdmin ? <ShieldCheck className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              {isAdmin ? "Admin" : "NV"}
            </button>
            <button onClick={onPrevDay} className="p-2 rounded-lg hover:bg-muted transition-colors"><ChevronLeft className="w-4 h-4" /></button>
            <button onClick={onNextDay} className="p-2 rounded-lg hover:bg-muted transition-colors"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
        {/* Booking summary for the day */}
        {!isLoading && bookings.length > 0 && (
          <div className="px-4 pb-2 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground font-medium">{bookings.length} show hôm nay:</span>
            {bookings.slice().sort((a, b) => (a.shootTime ?? "").localeCompare(b.shootTime ?? "")).map(b => {
              const st = STATUS[b.status as keyof typeof STATUS] ?? STATUS.pending;
              return (
                <button key={b.id} onClick={() => onEventClick(b)} className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${st.color} hover:opacity-80`}>
                  {b.shootTime?.slice(0, 5)} {b.customerName}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 24h Timeline */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto relative">
        {isLoading ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">Đang tải...</div>
        ) : (
          <div className="relative" style={{ height: 24 * HOUR_PX }}>
            {/* Hour lines */}
            {hours.map(h => (
              <div
                key={h}
                className="absolute left-0 right-0 border-b border-border/40 flex"
                style={{ top: h * HOUR_PX, height: HOUR_PX }}
                onClick={() => onTimeClick(`${String(h).padStart(2, "0")}:00`)}
              >
                {/* Time label */}
                <div className="w-14 flex-shrink-0 text-right pr-3 pt-1">
                  <span className="text-xs text-muted-foreground/70 font-medium select-none">
                    {h === 0 ? "" : `${String(h).padStart(2, "0")}:00`}
                  </span>
                </div>
                {/* Clickable area */}
                <div className="flex-1 hover:bg-primary/5 cursor-pointer transition-colors" />
              </div>
            ))}

            {/* Current time indicator */}
            {isToday_ && (
              <div className="absolute left-14 right-0 flex items-center z-20 pointer-events-none" style={{ top: nowH * HOUR_PX - 1 }}>
                <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1.5 flex-shrink-0" />
                <div className="flex-1 h-0.5 bg-red-500" />
              </div>
            )}

            {/* Events */}
            {bookings.map(b => {
              const st = STATUS[b.status as keyof typeof STATUS] ?? STATUS.pending;
              const { top, height } = getEventStyle(b);
              const photo = b.items?.[0]?.photoName;
              const makeup = b.items?.[0]?.makeupName;
              return (
                <button
                  key={b.id}
                  onClick={e => { e.stopPropagation(); onEventClick(b); }}
                  className={`absolute left-16 right-4 rounded-lg px-2.5 py-1.5 text-left z-10 shadow-sm hover:shadow-md hover:brightness-95 transition-all border ${st.color}`}
                  style={{ top: top + 2, height: height }}
                >
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span className="font-bold text-sm truncate">{b.customerName}</span>
                    <span className="text-xs font-mono flex-shrink-0 flex items-center gap-1">
                      <Clock className="w-3 h-3" />{b.shootTime?.slice(0, 5)}
                    </span>
                  </div>
                  {height > 40 && (
                    <div className="text-[10px] opacity-80 space-y-0.5">
                      <div className="truncate flex items-center gap-1"><Package2 className="w-3 h-3 flex-shrink-0" />{b.packageType}</div>
                      {photo && <div className="flex items-center gap-1"><Camera className="w-3 h-3 flex-shrink-0" />{photo}</div>}
                      {makeup && <div className="flex items-center gap-1"><Sparkles className="w-3 h-3 flex-shrink-0" />{makeup}</div>}
                      {b.remainingAmount > 0 && <div className="text-destructive font-semibold flex items-center gap-1"><AlertCircle className="w-3 h-3 flex-shrink-0" />Còn nợ {formatVND(b.remainingAmount)}</div>}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* FAB — create show */}
      <div className="absolute bottom-6 right-6 z-30">
        <button
          onClick={() => onTimeClick("07:00")}
          className="w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl flex items-center justify-center transition-all hover:scale-105 active:scale-95"
        >
          <Plus className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}

// ─── Main Calendar Page ────────────────────────────────────────────────────────
type CalView = "month" | "day" | "detail" | "form";

// Simple role management — persisted to localStorage
function useViewMode() {
  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    try { return localStorage.getItem("cal_view_mode") !== "staff"; } catch { return true; }
  });
  const toggle = () => setIsAdmin(prev => {
    const next = !prev;
    try { localStorage.setItem("cal_view_mode", next ? "admin" : "staff"); } catch { /* ignore */ }
    return next;
  });
  return { isAdmin, toggle };
}

export default function CalendarPage() {
  const [calView, setCalView] = useState<CalView>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTime, setSelectedTime] = useState("07:00");
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [viewingBooking, setViewingBooking] = useState<Booking | null>(null);
  const [showLunar, setShowLunar] = useState(true);
  const { isAdmin, toggle: toggleAdminMode } = useViewMode();

  const { data: bookings = [], isLoading } = useQuery<Booking[]>({
    queryKey: ["bookings"],
    queryFn: () => fetch(`${BASE}/api/bookings`).then(r => r.json()),
    staleTime: 30_000,
  });

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const firstDayOfMonth = monthStart.getDay();

  const monthLunar = useMemo(() => convertSolarToLunar(1, currentDate.getMonth() + 1, currentDate.getFullYear()), [currentDate]);

  const getBookingsForDay = useCallback(
    (date: Date) => bookings.filter(b => !b.isParentContract && isSameDay(new Date(b.shootDate), date)),
    [bookings]
  );

  const selectedBookings = getBookingsForDay(selectedDate);
  const monthBookings = bookings.filter(b => { if (b.isParentContract) return false; const d = new Date(b.shootDate); return d >= monthStart && d <= monthEnd; });

  // Handlers — month view
  const handleDayClick = useCallback((date: Date) => {
    setSelectedDate(date);
    setCurrentDate(date);
    setCalView("day");
  }, []);

  // Click event on month → open detail panel
  const handleEventClickFromMonth = useCallback((b: Booking) => {
    setSelectedDate(new Date(b.shootDate));
    setCurrentDate(new Date(b.shootDate));
    setViewingBooking(b);
    setCalView("detail");
  }, []);

  // Handlers — day view
  const handleTimeClick = useCallback((time: string) => {
    setSelectedTime(time);
    setEditingBooking(null);
    setViewingBooking(null);
    setCalView("form");
  }, []);

  // Click event on day → open detail panel
  const handleEventClickFromDay = useCallback((b: Booking) => {
    setViewingBooking(b);
    setSelectedTime(b.shootTime ?? "07:00");
    setCalView("detail");
  }, []);

  // Detail → back
  const handleDetailClose = useCallback(() => {
    // Go back to day or month depending on where we came from
    setCalView("day");
    setViewingBooking(null);
  }, []);

  // Detail → edit form (pencil)
  const handleDetailEdit = useCallback(() => {
    if (!viewingBooking) return;
    setEditingBooking(viewingBooking);
    setSelectedTime(viewingBooking.shootTime ?? "07:00");
    setCalView("form");
  }, [viewingBooking]);

  // Detail → deleted
  const handleDetailDeleteDone = useCallback(() => {
    setCalView("day");
    setViewingBooking(null);
    setEditingBooking(null);
  }, []);

  const handleBackToMonth = useCallback(() => {
    setCalView("month");
    setEditingBooking(null);
    setViewingBooking(null);
  }, []);

  const handleBackToDay = useCallback(() => {
    setCalView("day");
    setEditingBooking(null);
    setViewingBooking(null);
  }, []);

  const handleFormSaved = useCallback(() => {
    setCalView("day");
    setEditingBooking(null);
    setViewingBooking(null);
  }, []);

  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevDay = () => { const d = subDays(selectedDate, 1); setSelectedDate(d); setCurrentDate(d); };
  const nextDay = () => { const d = addDays(selectedDate, 1); setSelectedDate(d); setCurrentDate(d); };

  // ── DETAIL VIEW (full screen) ──
  if (calView === "detail" && viewingBooking) {
    return (
      <div className="flex flex-col -m-4 sm:-m-6" style={{ height: "calc(100vh - 60px)" }}>
        <ShowDetailPanel
          key={viewingBooking.id}
          booking={viewingBooking}
          onClose={handleDetailClose}
          onEdit={handleDetailEdit}
          onDeleteDone={handleDetailDeleteDone}
          isAdmin={isAdmin}
        />
      </div>
    );
  }

  // ── FORM VIEW (full screen) ──
  if (calView === "form") {
    return (
      <div className="flex flex-col -m-4 sm:-m-6" style={{ height: "calc(100vh - 60px)" }}>
        <ShowFormPanel
          key={`${editingBooking?.id ?? "new"}-${format(selectedDate, "yyyy-MM-dd")}-${selectedTime}`}
          date={selectedDate}
          initialTime={selectedTime}
          onDateChange={d => { setSelectedDate(d); setCurrentDate(d); }}
          booking={editingBooking}
          onClose={editingBooking && viewingBooking ? () => { setCalView("detail"); setEditingBooking(null); } : handleBackToDay}
          onSaved={handleFormSaved}
        />
      </div>
    );
  }

  // ── DAY VIEW (full screen) ──
  if (calView === "day") {
    return (
      <div className="flex flex-col -m-4 sm:-m-6 relative" style={{ height: "calc(100vh - 60px)" }}>
        <DayView
          date={selectedDate}
          bookings={selectedBookings}
          isLoading={isLoading}
          onBack={handleBackToMonth}
          onPrevDay={prevDay}
          onNextDay={nextDay}
          onTimeClick={handleTimeClick}
          onEventClick={handleEventClickFromDay}
          isAdmin={isAdmin}
          onToggleMode={toggleAdminMode}
        />
      </div>
    );
  }

  // ── MONTH VIEW (full screen) ──
  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Lịch Chụp</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {monthBookings.length} show tháng này · Bấm ngày để xem lịch 24h
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowLunar(!showLunar)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${showLunar ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}
          >
            <Moon className="w-3.5 h-3.5" /> Âm lịch
          </button>
          {/* Role toggle */}
          <button
            onClick={toggleAdminMode}
            title={isAdmin ? "Đang xem chế độ Admin — Bấm để chuyển sang Nhân viên" : "Đang xem chế độ Nhân viên — Bấm để chuyển sang Admin"}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${isAdmin ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400" : "border-orange-300 bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400"}`}
          >
            {isAdmin ? <ShieldCheck className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {isAdmin ? "Admin" : "Nhân viên"}
          </button>
          <Button onClick={() => { setEditingBooking(null); setViewingBooking(null); setSelectedTime("07:00"); setCalView("form"); }} className="gap-2 h-9">
            <Plus className="w-4 h-4" /> Tạo show
          </Button>
        </div>
      </div>

      {/* Calendar card */}
      <div className="bg-card rounded-2xl border shadow-sm overflow-hidden">
        {/* Month nav */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-card to-muted/10">
          <div>
            <div className="flex items-center gap-2">
              <Sun className="w-4 h-4 text-orange-400" />
              <span className="text-lg font-bold capitalize">{format(currentDate, "MMMM yyyy", { locale: vi })}</span>
            </div>
            {showLunar && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <Moon className="w-3 h-3 text-indigo-400" />
                {getLunarMonthName(monthLunar.month, monthLunar.leap)} {getCanChi(monthLunar.year)} ({monthLunar.year})
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={prevMonth} className="w-8 h-8 rounded-lg border bg-background hover:bg-muted flex items-center justify-center transition-colors"><ChevronLeft className="w-4 h-4" /></button>
            <button
              onClick={() => { const t = new Date(); setCurrentDate(t); setSelectedDate(t); }}
              className="px-3 h-8 rounded-lg border bg-background hover:bg-muted text-sm font-medium transition-colors"
            >Hôm nay</button>
            <button onClick={nextMonth} className="w-8 h-8 rounded-lg border bg-background hover:bg-muted flex items-center justify-center transition-colors"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>

        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 border-b border-border/50">
          {["CN", "T2", "T3", "T4", "T5", "T6", "T7"].map((d, i) => (
            <div key={d} className={`text-center text-xs font-bold py-2 border-r border-border/50 last:border-r-0 ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-600" : "text-muted-foreground"}`}>{d}</div>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-7">
          {/* Leading days from prev month */}
          {Array.from({ length: firstDayOfMonth }).map((_, i) => {
            const d = new Date(monthStart); d.setDate(d.getDate() - (firstDayOfMonth - i));
            return <MonthDayCell key={`p${i}`} date={d} bookings={getBookingsForDay(d)} isSelected={false} isOtherMonth onDayClick={handleDayClick} onEventClick={handleEventClickFromMonth} />;
          })}
          {/* Current month days */}
          {daysInMonth.map(day => (
            <MonthDayCell key={day.toISOString()} date={day} bookings={getBookingsForDay(day)}
              isSelected={isSameDay(day, selectedDate)}
              onDayClick={handleDayClick}
              onEventClick={handleEventClickFromMonth}
            />
          ))}
          {/* Trailing days from next month */}
          {Array.from({ length: (7 - ((firstDayOfMonth + daysInMonth.length) % 7)) % 7 }).map((_, i) => {
            const d = new Date(monthEnd); d.setDate(d.getDate() + i + 1);
            return <MonthDayCell key={`n${i}`} date={d} bookings={getBookingsForDay(d)} isSelected={false} isOtherMonth onDayClick={handleDayClick} onEventClick={handleEventClickFromMonth} />;
          })}
        </div>

        {/* Footer legend */}
        {showLunar && (
          <div className="px-4 py-2 border-t bg-muted/20 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><Moon className="w-3 h-3 text-indigo-400" /> Âm lịch</span>
            <span className="flex items-center gap-1">✦ Tiết khí</span>
            <span className="flex items-center gap-1 text-red-500">● Ngày lễ</span>
            <span className="flex items-center gap-1 ml-auto text-primary font-medium">Bấm ngày → xem lịch 24h · Bấm giờ → tạo show</span>
          </div>
        )}
      </div>
    </div>
  );
}
