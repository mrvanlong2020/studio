import { useState, useMemo, useCallback, useRef, useEffect, Component } from "react";
import type { ReactNode, ErrorInfo } from "react";
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
import { getImageSrc } from "@/lib/imageUtils";
import {
  ChevronLeft, ChevronRight, Calendar, Clock, Phone, Package2, Sun, Moon,
  AlertCircle, Plus, X, Check, Camera, User, Sparkles,
  ChevronDown, Trash2, Save, MapPin, CreditCard, ArrowLeft,
  Pencil, ShieldCheck, Eye, FileText, CalendarDays,
} from "lucide-react";
import { Button, Input } from "@/components/ui";
import { CurrencyInput } from "@/components/ui/currency-input";
import { ServiceSearchBox } from "@/components/service-search-box";
import { SurchargeEditor, type SurchargeItem } from "@/components/surcharge-editor";
import { DeductionEditor, type DeductionItem } from "@/components/deduction-editor";
import { StaffAssignmentEditor, type StaffAssignment, newStaffAssignment } from "@/components/staff-assignment-editor";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function authFetch(url: string, opts: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem("amazingStudioToken_v2");
  const headers = { ...(opts.headers as Record<string, string> ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  return fetch(url, { ...opts, headers });
}

// ─── Types ────────────────────────────────────────────────────────────────────
type Booking = {
  id: number; orderCode: string; customerId: number; customerName: string;
  customerPhone: string; shootDate: string; shootTime: string;
  serviceCategory: string; packageType: string; location: string | null;
  status: string; items: OrderLine[]; surcharges?: { name: string; amount: number }[];
  totalAmount: number; depositAmount: number; discountAmount?: number;
  paidAmount: number; remainingAmount: number; assignedStaff: number[];
  notes: string | null;
  // Multi-service contract fields
  parentId: number | null;
  serviceLabel: string | null;
  isParentContract: boolean;
  photoCount?: number | null;
  servicePackageId?: number | null;
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
  surcharges: SurchargeItem[];
  deductions: DeductionItem[];
  baseJobType: string; // Base job type key from BASE_TASKS (e.g., "chup_cong", "chup_album")
  photoId: number | null; photoName: string; photoTask: string;
  makeupId: number | null; makeupName: string; makeupTask: string;
  assignedStaff: StaffAssignment[];
  notes?: string;
  conceptImages?: string[];
};
type SubServiceDraft = {
  id: string;
  siblingId?: number;
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
  const autoSelectedRef = useRef<string | null>(null);
  const { data: results = [] } = useQuery<Customer[]>({
    queryKey: ["customer-search", value],
    queryFn: () => authFetch(`${BASE}/api/customers?search=${encodeURIComponent(value)}`).then(r => r.json()),
    enabled: value.length >= 3,
    staleTime: 5_000,
  });
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  useEffect(() => {
    const digits = value.replace(/\D/g, "");
    if (digits.length >= 10 && results.length > 0 && autoSelectedRef.current !== digits) {
      const exact = results.find(c => c.phone.replace(/\D/g, "") === digits);
      if (exact) {
        autoSelectedRef.current = digits;
        onSelect(exact);
        setOpen(false);
      }
    }
    if (digits.length < 10) autoSelectedRef.current = null;
  }, [results, value, onSelect]);
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
function fmtVND(n: number | null | undefined) {
  return ((n ?? 0) || 0).toLocaleString("vi-VN") + "đ";
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

function OrderLineRow({ line, photographers, makeupArtists, services, allStaffRates, allCastRates, allStaff, onChange, onRemove }: {
  line: OrderLine;
  photographers: Staff[];
  makeupArtists: Staff[];
  services: ServiceOption[];
  allStaffRates: StaffRate[];
  allCastRates: CastRatePkg[];
  allStaff: Staff[];
  onChange: (u: OrderLine) => void;
  onRemove?: () => void;
}) {
  const [useCustom, setUseCustom] = useState(!line.serviceId && !line.serviceKey && !!line.serviceName);
  const [uploadingConcept, setUploadingConcept] = useState(false);
  const [uploadConceptError, setUploadConceptError] = useState<string | null>(null);
  const conceptImgRef = useRef<HTMLInputElement>(null);

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
  
  // Phí phát sinh cho gói này
  const surchargesTotal = (line.surcharges || []).reduce((s, i) => s + (i.amount || 0), 0);
  const deductionsTotal = (line.deductions || []).reduce((s, d) => s + (d.amount || 0), 0);
  
  const totalCost = ptsCast + printCost + operatingCost + saleAmt + photoCast + makeupCast + surchargesTotal;
  const effectiveRevenue = Math.max(0, line.price - deductionsTotal);
  const profit = effectiveRevenue - totalCost;

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
      surcharges: [],
      deductions: [],
      baseJobType: "mac_dinh", // Reset to default when selecting new service
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
    items: selectedSvc.items?.map(item => ({
      name: item.name,
      quantity: Number(item.quantity),
      unit: item.unit,
      notes: item.notes,
    })),
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

      {/* Chọn nhân sự — Dynamic staff list */}
      <StaffAssignmentEditor
        value={line.assignedStaff}
        onChange={newStaff => onChange({ ...line, assignedStaff: newStaff })}
        staffOptions={allStaff.map(s => ({ id: s.id, name: s.name, roles: s.roles || [] }))}
        allStaffRates={allStaffRates.map(r => ({ staffId: r.staffId, role: r.role, taskKey: r.taskKey, rate: r.rate }))}
        baseJobType={line.baseJobType}
      />

      {/* Phí phát sinh — Surcharges per package */}
      <SurchargeEditor 
        value={line.surcharges || []} 
        onChange={newSurcharges => onChange({ ...line, surcharges: newSurcharges })} 
      />

      {/* Giảm trừ dịch vụ — Deductions per package */}
      <DeductionEditor
        deductions={line.deductions || []}
        onChange={newDeductions => onChange({ ...line, deductions: newDeductions })}
      />

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
            <CurrencyInput className="h-8 text-sm w-40" value={String(line.price || "")} placeholder="0"
              onChange={raw => onChange({ ...line, price: parseFloat(raw) || 0 })} />
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

      {/* Ghi chú & Ảnh concept per dịch vụ */}
      <div className="space-y-2 border-t border-border/30 pt-2">
        <div>
          <p className="text-[10px] text-muted-foreground mb-1">📝 Ghi chú / Yêu cầu dịch vụ này</p>
          <textarea
            value={line.notes ?? ""}
            onChange={e => onChange({ ...line, notes: e.target.value })}
            rows={2}
            placeholder="Ghi chú yêu cầu của khách cho dịch vụ này…"
            className="w-full text-xs border border-input rounded-lg px-2.5 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
          />
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground mb-1.5">🖼️ Ảnh concept ({(line.conceptImages ?? []).length})</p>
          {(line.conceptImages ?? []).length > 0 && (
            <div className="grid grid-cols-4 gap-1.5 mb-2">
              {(line.conceptImages ?? []).map((imgUrl, i) => {
                const src = getImageSrc(imgUrl);
                return src ? (
                  <div key={i} className="relative aspect-square">
                    <img src={src} alt={`concept ${i + 1}`} className="w-full h-full object-cover rounded-lg" />
                    <button
                      type="button"
                      onClick={() => onChange({ ...line, conceptImages: (line.conceptImages ?? []).filter((_, j) => j !== i) })}
                      className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 rounded-full flex items-center justify-center text-white hover:bg-destructive transition-colors"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ) : null;
              })}
            </div>
          )}
          <button
            type="button"
            onClick={() => conceptImgRef.current?.click()}
            disabled={uploadingConcept}
            className="flex items-center gap-1.5 text-xs text-muted-foreground border border-dashed border-border rounded-lg px-2.5 py-1.5 hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
          >
            {uploadingConcept ? <span>Đang tải ảnh...</span> : <><Plus className="w-3 h-3" /> Thêm ảnh concept</>}
          </button>
          {uploadConceptError && (
            <p className="text-xs text-red-500 mt-1">{uploadConceptError}</p>
          )}
          <input
            ref={conceptImgRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setUploadingConcept(true);
              setUploadConceptError(null);
              try {
                const res = await authFetch(`${BASE}/api/storage/uploads/request-url`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
                });
                const { uploadURL, objectPath } = await res.json();
                if (!uploadURL || !objectPath) throw new Error("Invalid response from storage service");
                const putRes = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
                if (!putRes.ok) throw new Error(`Upload failed: ${putRes.status}`);
                onChange({ ...line, conceptImages: [...(line.conceptImages ?? []), objectPath] });
              } catch (err) {
                console.error("Concept image upload failed:", err);
                setUploadConceptError("Tải ảnh thất bại, vui lòng thử lại.");
              } finally {
                setUploadingConcept(false);
                e.target.value = "";
              }
            }}
          />
        </div>
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
            {deductionsTotal > 0 && (
              <div className="flex justify-between text-red-600 text-[10px]">
                <span>⬇ Giảm trừ dịch vụ</span><span>−{fmtVND(deductionsTotal)}</span>
              </div>
            )}
            {deductionsTotal > 0 && (
              <div className="flex justify-between font-semibold text-emerald-700 text-[10px] border-t border-emerald-100 pt-0.5">
                <span>= Thực thu</span><span>{fmtVND(effectiveRevenue)}</span>
              </div>
            )}
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
  date, initialTime = "07:00", onDateChange, booking, onClose, onSaved, siblingBookings = [],
}: {
  date: Date;
  initialTime?: string;
  onDateChange: (d: Date) => void;
  booking: Booking | null;
  onClose: () => void;
  onSaved: () => void;
  siblingBookings?: Booking[];
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
  const [discount, setDiscount] = useState(booking?.discountAmount?.toString() ?? "0");
  const [notes, setNotes] = useState(booking?.notes ?? "");
  const [photoCount, setPhotoCount] = useState<string>(() => String(booking?.photoCount ?? ""));
  const [surcharges, setSurcharges] = useState<SurchargeItem[]>(() => {
    const raw = booking?.surcharges ?? [];
    return raw.map((s: { name: string; amount: number }, i: number) => ({ id: `s${i}`, ...s }));
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const hasSiblingEdit = siblingBookings.length > 0;

  // ── Service blocks (unified: single or multi-service) ────────────────────
  const emptyOrderLine = (): OrderLine => ({
    tempId: genId(), serviceName: "", serviceId: null, serviceKey: "",
    price: 0, basePrice: 0, selectedAddons: [], surcharges: [], deductions: [],
    baseJobType: "mac_dinh", // Default job type for staff rates lookup
    photoId: null, photoName: "", photoTask: "",
    makeupId: null, makeupName: "", makeupTask: "",
    assignedStaff: [],
    notes: "", conceptImages: [],
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
  const [subDrafts, setSubDrafts] = useState<SubServiceDraft[]>(() => siblingBookings.length > 0 ? siblingBookings.map(sib => ({
    id: genId(),
    siblingId: sib.id,
    serviceLabel: sib.serviceLabel || sib.packageType || "",
    shootDate: sib.shootDate || format(date, "yyyy-MM-dd"),
    shootTime: sib.shootTime || "08:00",
    items: sib.items?.length ? sib.items.map(i => ({ ...i, tempId: genId() })) : [emptyOrderLine()],
    photoId: null, photoName: "", photoTask: "",
    makeupId: null, makeupName: "", makeupTask: "",
    notes: sib.notes ?? "",
  })) : [makeSubDraft(format(date, "yyyy-MM-dd"), initialTime)]);
  const updateSubDraft = (id: string, patch: Partial<SubServiceDraft>) =>
    setSubDrafts(p => p.map(s => s.id === id ? { ...s, ...patch } : s));
  const addSubDraft = () =>
    setSubDrafts(p => [...p, { id: genId(), serviceLabel: "", shootDate: shootDate, shootTime: "08:00", items: [emptyOrderLine()], photoId: null, photoName: "", photoTask: "", makeupId: null, makeupName: "", makeupTask: "", notes: "" }]);

  const { data: allStaff = [] } = useQuery<Staff[]>({ queryKey: ["staff"], queryFn: () => authFetch(`${BASE}/api/staff`).then(r => r.ok ? r.json() : []).then((d: unknown) => Array.isArray(d) ? d : []) });
  const { data: services = [] } = useQuery<Service[]>({ queryKey: ["services"], queryFn: () => authFetch(`${BASE}/api/services`).then(r => r.ok ? r.json() : []).then((d: unknown) => Array.isArray(d) ? d : []) });
  const { data: pricingPackages = [] } = useQuery<{
    id: number; name: string; price: number;
    printCost: number; operatingCost: number; salePercent: number;
    items?: PkgItem[]; addons?: Addon[]; products?: string[]; description?: string | null; notes?: string | null;
    serviceType?: string | null; photoCount?: number | null; includesMakeup?: boolean;
  }[]>({ queryKey: ["service-packages"], queryFn: () => authFetch(`${BASE}/api/service-packages`).then(r => r.ok ? r.json() : []).then((d: unknown) => Array.isArray(d) ? d : []) });
  const { data: allStaffRates = [] } = useQuery<StaffRate[]>({ queryKey: ["staff-rates"], queryFn: () => authFetch(`${BASE}/api/staff-rates`).then(r => r.ok ? r.json() : []).then((d: unknown) => Array.isArray(d) ? d : []) });
  const { data: allCastRates = [] } = useQuery<CastRatePkg[]>({ queryKey: ["staff-cast-all"], queryFn: () => authFetch(`${BASE}/api/staff-cast`).then(r => r.ok ? r.json() : []).then((d: unknown) => Array.isArray(d) ? d : []), staleTime: 60_000 });

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

  const subDraftsTotal = subDrafts.reduce((s, sub) => s + sub.items.reduce((si, l) => {
    const lineSurchTotal = (l.surcharges || []).reduce((ls, sc) => ls + (sc.amount || 0), 0);
    const lineDeductTotal = (l.deductions || []).reduce((ld, d) => ld + (d.amount || 0), 0);
    return si + Math.max(0, (l.price || 0) + lineSurchTotal - lineDeductTotal);
  }, 0), 0);
  const surchargesTotal = surcharges.reduce((s, i) => s + (i.amount || 0), 0);
  const totalAmount = subDraftsTotal + surchargesTotal;
  const depositNum = parseFloat(deposit) || 0;
  const discountNum = parseFloat(discount) || 0;
  const afterDiscount = Math.max(0, totalAmount - discountNum);
  const remaining = Math.max(0, afterDiscount - depositNum);

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
    if (!shootDate) { setError("Vui lòng chọn ngày hợp đồng"); return; }
    const isMulti = subDrafts.length >= 2;
    if (isEdit && isMulti && hasSiblingEdit) {
      setSaving(true);
      try {
        for (const sub of subDrafts) {
          if (!sub.siblingId) continue;
          const validItems = sub.items.filter(l => l.serviceName || l.serviceId);
          const subTotal = sub.items.reduce((s, l) => {
            const lineSurchTotal = (l.surcharges || []).reduce((ls, sc) => ls + (sc.amount || 0), 0);
            const lineDeductTotal = (l.deductions || []).reduce((ld, d) => ld + (d.amount || 0), 0);
            return s + Math.max(0, (l.price || 0) + lineSurchTotal - lineDeductTotal);
          }, 0);
          const pkgLine = validItems.find(l => (l.serviceKey ?? "").startsWith("pkg-"));
          const servicePackageId = pkgLine ? parseInt(pkgLine.serviceKey.replace("pkg-", "")) : null;
          const res = await authFetch(`${BASE}/api/bookings/${sub.siblingId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              serviceLabel: sub.serviceLabel || "",
              shootDate: sub.shootDate || shootDate,
              shootTime: sub.shootTime || "08:00",
              items: validItems.map(({ tempId: _t, ...rest }) => rest),
              totalAmount: subTotal,
              servicePackageId,
            }),
          });
          if (!res.ok) throw new Error("Lỗi lưu dịch vụ");
        }
        if (booking?.id) {
          await authFetch(`${BASE}/api/bookings/${booking.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              totalAmount: subDraftsTotal,
              depositAmount: depositNum,
              discountAmount: discountNum,
              packageType: subDrafts.map(s => s.serviceLabel || "Dịch vụ").join(" + "),
            }),
          });
        }
        qc.invalidateQueries({ queryKey: ["bookings"] });
        if (booking?.id) qc.invalidateQueries({ queryKey: ["booking-full", booking.id] });
        for (const sub of subDrafts) {
          if (sub.siblingId) qc.invalidateQueries({ queryKey: ["booking-full", sub.siblingId] });
        }
        onSaved();
        return;
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Lỗi lưu hợp đồng");
        setSaving(false);
        return;
      }
    }
    setSaving(true);
    try {
      // ── 1. Tạo / tìm khách hàng ──
      let cid = customerId;
      if (!cid) {
        if (phone.trim()) {
          const foundRaw = await authFetch(`${BASE}/api/customers?search=${encodeURIComponent(phone)}`, { headers: { "Content-Type": "application/json" } }).then(r => r.ok ? r.json() : []).catch(() => []);
          const found: Customer[] = Array.isArray(foundRaw) ? foundRaw : [];
          const existing = found.find(c => c.phone === phone);
          if (existing) {
            cid = existing.id;
            if (avatar && !existing.avatar) {
              await authFetch(`${BASE}/api/customers/${cid}`, {
                method: "PUT", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ avatar }),
              });
            }
          } else {
            const nc = await authFetch(`${BASE}/api/customers`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: customerName, phone, facebook: facebook || undefined, zalo: zalo || undefined, avatar: avatar || undefined, source: "walk-in" }),
            }).then(r => r.json()) as Customer;
            cid = nc.id;
          }
        } else {
          const nc = await authFetch(`${BASE}/api/customers`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: customerName, facebook: facebook || undefined, zalo: zalo || undefined, avatar: avatar || undefined, source: "walk-in" }),
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
          const subTotal = sub.items.reduce((s, l) => {
            const lineSurchTotal = (l.surcharges || []).reduce((ls, sc) => ls + (sc.amount || 0), 0);
            const lineDeductTotal = (l.deductions || []).reduce((ld, d) => ld + (d.amount || 0), 0);
            return s + Math.max(0, (l.price || 0) + lineSurchTotal - lineDeductTotal);
          }, 0);
          const subDeductions = validItems
            .flatMap(l => (l.deductions || []))
            .filter(d => d.label?.trim() && d.amount > 0)
            .map(({ label, amount }) => ({ label, amount }));
          const subAssigned: Record<string, unknown> = {};
          if (sub.photoId) { subAssigned.photo = sub.photoId; subAssigned.photoTask = sub.photoTask || "mac_dinh"; }
          if (sub.makeupId) { subAssigned.makeup = sub.makeupId; subAssigned.makeupTask = sub.makeupTask || "mac_dinh"; }
          return {
            serviceLabel: sub.serviceLabel || `Dịch vụ ${subDrafts.indexOf(sub) + 1}`,
            shootDate: sub.shootDate || shootDate,
            shootTime: sub.shootTime || "08:00",
            items: validItems.map(({ tempId: _t, ...rest }) => rest),
            deductions: subDeductions,
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
          discountAmount: discountNum,
          isParentContract: true,
          packageType: subDrafts.map(s => s.serviceLabel || "Dịch vụ").join(" + "),
          assignedStaff,
          notes: notes || null,
          location: location || null,
          subServices: subServicePayloads,
        };

        saved = await authFetch(`${BASE}/api/bookings`, {
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

      const cleanedDeductions = validLines
        .flatMap(l => (l.deductions || []))
        .filter(d => d.label?.trim() && d.amount > 0)
        .map(({ label, amount }) => ({ label, amount }));

      // Task #24: trích servicePackageId từ service line có serviceKey "pkg-{id}"
      // Khi sửa đơn: nếu không có dòng nào là package → giữ nguyên packageId cũ (tránh unlink)
      const pkgLine = validLines.find(l => (l.serviceKey ?? "").startsWith("pkg-"));
      const servicePackageId = pkgLine
        ? parseInt(pkgLine.serviceKey.replace("pkg-", ""))
        : (isEdit ? (booking?.servicePackageId ?? null) : null);

      const body: Record<string, unknown> = {
        customerId: cid, shootDate: effectiveShootDate, shootTime: sub0.shootTime || "08:00",
        serviceCategory: "wedding", packageType,
        location: location || null, status: finalStatus,
        totalAmount: finalTotal, depositAmount: finalDeposit,
        depositPaymentMethod: finalDeposit > 0 ? depositMethod : undefined,
        discountAmount: discountNum,
        items: hasServices ? validLines.map(({ tempId: _t, ...rest }) => rest) : [],
        surcharges: cleanedSurcharges,
        deductions: hasServices ? cleanedDeductions : [],
        assignedStaff, notes: notes || null,
        photoCount: photoCount !== "" ? parseInt(photoCount) : null,
      };
      body.servicePackageId = servicePackageId ?? null;

      if (isEdit && booking) {
        saved = await authFetch(`${BASE}/api/bookings/${booking.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        }).then(r => { if (!r.ok) throw new Error("Lỗi cập nhật"); return r.json(); });
      } else {
        saved = await authFetch(`${BASE}/api/bookings`, {
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
    mutationFn: () => authFetch(`${BASE}/api/bookings/${booking?.id}`, { method: "DELETE" }),
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
                          <OrderLineRow key={line.tempId} line={line} photographers={photographers} makeupArtists={makeupArtists} services={allServices} allStaffRates={allStaffRates} allCastRates={allCastRates} allStaff={allStaff}
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
                <span className="text-sm text-muted-foreground flex-shrink-0">Giảm giá:</span>
                <CurrencyInput className="h-8 text-sm text-right w-40" value={discount} placeholder="0" onChange={setDiscount} />
              </div>
              {discountNum > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Sau giảm giá:</span>
                  <span className="font-semibold text-emerald-600">{formatVND(afterDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between items-center gap-3">
                <span className="text-sm text-muted-foreground flex-shrink-0">Đặt cọc:</span>
                <CurrencyInput className="h-8 text-sm text-right w-40" value={deposit} placeholder="0" onChange={setDeposit} />
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
type DetailPackage = { id: number; code: string; name?: string; addons?: DetailAddon[]; products?: string[]; items?: PkgItem[]; description?: string | null; notes?: string | null };

// ─── Xuất hợp đồng PDF ────────────────────────────────────────────────────────
const STUDIO_INFO = {
  name: "Amazing Studio",
  desc: "Chụp ảnh cưới & cho thuê váy cưới chuyên nghiệp",
  address: "Số 80, Hẻm 71, CMT8, KP Hiệp Bình, P. Hiệp Ninh, Tây Ninh",
  phone: "0392817079",
};

function fmtVNDStr(n: number) {
  return n.toLocaleString("vi-VN") + " đ";
}

function formatShootDate(dateStr: string): string {
  try { const d = parseISO(dateStr); return isNaN(d.getTime()) ? dateStr : format(d, "dd/MM/yyyy"); } catch { return dateStr; }
}

async function buildContractImages(htmlContent: string): Promise<string[]> {
  const html2canvas = (await import("html2canvas")).default;

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  container.style.width = "820px";
  container.style.background = "#fff";
  container.style.zIndex = "-9999";
  container.innerHTML = htmlContent;
  document.body.appendChild(container);

  const pageDivs: HTMLElement[] = [];

  try {
    await new Promise(resolve => setTimeout(resolve, 600));

    const pageHeight = 1200;
    const totalHeight = container.scrollHeight;
    const pageCount = Math.max(1, Math.ceil(totalHeight / pageHeight));
    const dataUrls: string[] = [];

    for (let i = 0; i < pageCount; i++) {
      const pageDiv = document.createElement("div");
      pageDiv.style.position = "fixed";
      pageDiv.style.left = "-10000px";
      pageDiv.style.top = "0";
      pageDiv.style.width = "820px";
      pageDiv.style.height = pageHeight + "px";
      pageDiv.style.overflow = "hidden";
      pageDiv.style.background = "#fff";
      pageDiv.style.zIndex = "-9999";

      const cloned = container.cloneNode(true) as HTMLElement;
      cloned.style.marginTop = `-${i * pageHeight}px`;
      cloned.style.width = "820px";
      pageDiv.appendChild(cloned);
      document.body.appendChild(pageDiv);
      pageDivs.push(pageDiv);

      const canvas = await html2canvas(pageDiv, { scale: 2, useCORS: true, logging: false, backgroundColor: "#ffffff" });
      dataUrls.push(canvas.toDataURL("image/jpeg", 0.95));
    }

    return dataUrls;
  } finally {
    pageDivs.forEach(div => { if (div.parentNode) div.parentNode.removeChild(div); });
    if (container.parentNode) container.parentNode.removeChild(container);
  }
}

type ContractPayment = { amount?: number; paymentMethod?: string; collectorName?: string; paidDate?: string; paidAt?: string; notes?: string };

function generateContractHTML(
  booking: Booking,
  siblings: Booking[],
  allPackages: DetailPackage[],
  paymentSummary?: { totalAmount: number; paidAmount: number; discountAmount?: number; remainingAmount: number },
  forImageExport = false,
  paymentHistoryList: ContractPayment[] = [],
): string {
  const today = new Date();
  const todayStr = format(today, "dd/MM/yyyy");

  // Multi-service: use siblings list; single: just this booking
  const allServices = siblings.length > 0 ? siblings : [booking];
  const isMulti = allServices.length > 1;

  // Payment summary: use caller-supplied summary (from parentContract or booking) — same source as on-screen
  const totalAmount     = Number(paymentSummary?.totalAmount     ?? booking.totalAmount     ?? 0) || 0;
  const paidAmount      = Number(paymentSummary?.paidAmount      ?? booking.paidAmount      ?? 0) || 0;
  const discountAmount  = Number(paymentSummary?.discountAmount  ?? booking.discountAmount  ?? 0) || 0;
  const remainingAmount = Number(paymentSummary?.remainingAmount ?? booking.remainingAmount ?? Math.max(0, totalAmount - discountAmount - paidAmount)) || 0;
  const paymentRows = [...paymentHistoryList].sort((a, b) => {
    const ta = new Date(a.paidDate || a.paidAt || 0).getTime();
    const tb = new Date(b.paidDate || b.paidAt || 0).getTime();
    return ta - tb;
  });
  let runningPaid = 0;

  // ── Lịch chụp section ─────────────────────────────────────────────────────
  const scheduleSectionHTML = isMulti
    ? `<table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f8f0fa;">
            <th style="padding:9px 12px;text-align:left;color:#6c3483;font-size:12px;font-weight:700;border-bottom:2px solid #c39bd3;">Dịch vụ</th>
            <th style="padding:9px 12px;text-align:center;color:#6c3483;font-size:12px;font-weight:700;border-bottom:2px solid #c39bd3;">Ngày</th>
            <th style="padding:9px 12px;text-align:center;color:#6c3483;font-size:12px;font-weight:700;border-bottom:2px solid #c39bd3;">Giờ</th>
            <th style="padding:9px 12px;text-align:left;color:#6c3483;font-size:12px;font-weight:700;border-bottom:2px solid #c39bd3;">Địa điểm</th>
          </tr>
        </thead>
        <tbody>
          ${allServices.map((b, idx) => `
            <tr style="${idx % 2 === 1 ? "background:#fdf8ff;" : ""}">
              <td style="padding:8px 12px;border-bottom:1px solid #f0e8f0;font-weight:600;">${b.serviceLabel || b.packageType || `Dịch vụ ${idx + 1}`}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #f0e8f0;text-align:center;">${formatShootDate(b.shootDate)}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #f0e8f0;text-align:center;font-weight:700;color:#8B1A6B;">${b.shootTime?.slice(0,5) || "—"}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #f0e8f0;color:#555;">${b.location || "—"}</td>
            </tr>
          `).join("")}
        </tbody>
       </table>`
    : `<div style="display:flex;gap:32px;flex-wrap:wrap;">
        <div><span style="color:#888;font-size:12px;">Ngày chụp</span><br/><strong style="font-size:15px;">${formatShootDate(booking.shootDate)}</strong></div>
        <div><span style="color:#888;font-size:12px;">Giờ bắt đầu</span><br/><strong style="font-size:15px;color:#8B1A6B;">${booking.shootTime?.slice(0,5) || "—"}</strong></div>
        ${booking.location ? `<div><span style="color:#888;font-size:12px;">Địa điểm</span><br/><strong style="font-size:15px;">${booking.location}</strong></div>` : ""}
       </div>`;

  // ── Helper: render 1 dịch vụ (1 booking + chi tiết gói) ──────────────────
  function renderServiceBlock(b: Booking, idx: number): string {
    const orderLines = b.items || [];
    const surcharges = b.surcharges || [];
    const surchargesTotal = surcharges.reduce((s, i) => s + (i.amount || 0), 0);
    const serviceTotal = (b.totalAmount || 0);
    const serviceLabel = b.serviceLabel || b.packageType || `Dịch vụ ${idx + 1}`;

    // For each order line, look up the package for full details
    const linesHTML = orderLines.map((line) => {
      const pkgId = line.serviceKey?.startsWith("pkg-") ? parseInt(line.serviceKey.replace("pkg-", "")) : null;
      const pkg = pkgId ? allPackages.find(p => p.id === pkgId) : null;
      const pkgName = pkg?.name || line.serviceName || "—";

      // Bao gồm (items from pricing DB)
      const pkgItems = pkg?.items || [];
      const pkgProducts = pkg?.products || [];
      const pkgDescription = pkg?.description || "";

      const includesHTML = pkgItems.length > 0
        ? `<div style="margin-top:10px;">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#6c3483;margin-bottom:6px;">Bao gồm:</div>
            <ul style="margin:0;padding-left:18px;space-y:4px;">
              ${pkgItems.map(it => `<li style="font-size:13px;color:#444;padding:2px 0;">${it.quantity ? `<strong>${it.quantity}${it.unit ? " " + it.unit : ""}</strong> ` : ""}${it.name}</li>`).join("")}
            </ul>
           </div>`
        : "";

      const productsHTML = pkgProducts.length > 0
        ? `<div style="margin-top:10px;">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#27ae60;margin-bottom:6px;">Sản phẩm nhận:</div>
            <ul style="margin:0;padding-left:18px;">
              ${pkgProducts.map(p => `<li style="font-size:13px;color:#444;padding:2px 0;">✅ ${p}</li>`).join("")}
            </ul>
           </div>`
        : "";

      const _staffLines: string[] = [];
      if (line.photoName) _staffLines.push(`📷 Nhiếp ảnh: <strong>${line.photoName}</strong>`);
      if (line.makeupName) _staffLines.push(`💄 Makeup: <strong>${line.makeupName}</strong>`);
      // Additional roles from assignedStaff (assistant, support, video…)
      if (Array.isArray(line.assignedStaff)) {
        const _extraRoleLabel: Record<string, string> = {
          assistant: "🤝 Trợ lý", tro_ly: "🤝 Trợ lý",
          support: "🙋 Hỗ trợ", ho_tro: "🙋 Hỗ trợ",
          video: "🎥 Quay phim",
        };
        for (const _sa of line.assignedStaff as StaffAssignment[]) {
          const _label = _extraRoleLabel[_sa.role ?? ""];
          if (_label && _sa.staffName) _staffLines.push(`${_label}: <strong>${_sa.staffName}</strong>`);
        }
      }
      const staffHTML = _staffLines.length > 0
        ? `<div style="margin-top:8px;padding:6px 10px;background:#f0f4ff;border-radius:6px;font-size:12px;color:#555;">
            ${_staffLines.join("&nbsp;&nbsp;|&nbsp;&nbsp;")}
           </div>`
        : "";

      const lineSurcharges = (line.surcharges || []) as { name: string; amount: number }[];
      const lineSurchHTML = lineSurcharges.length > 0
        ? `<div style="margin-top:10px;padding:8px 12px;background:#fff5f5;border-radius:8px;border:1px solid #fce4e4;">
             <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#c0392b;margin-bottom:6px;">⚡ Phụ thu kèm gói:</div>
             ${lineSurcharges.map(s => `
               <div style="display:flex;justify-content:space-between;font-size:13px;padding:3px 0;">
                 <span style="color:#c0392b;">+ ${s.name}</span>
                 <span style="font-weight:600;color:#c0392b;">${fmtVNDStr(s.amount)}</span>
               </div>`).join("")}
           </div>`
        : "";

      const lineDeductions = (line.deductions || []) as { label: string; amount: number }[];
      const lineDeductHTML = lineDeductions.length > 0
        ? `<div style="margin-top:10px;padding:8px 12px;background:#fff5f5;border-radius:8px;border:1px solid #fce4e4;">
             <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#c0392b;margin-bottom:6px;">⬇ Giảm trừ dịch vụ:</div>
             ${lineDeductions.map(d => `
               <div style="display:flex;justify-content:space-between;font-size:13px;padding:3px 0;">
                 <span style="color:#c0392b;">− ${d.label}</span>
                 <span style="font-weight:600;color:#c0392b;">−${fmtVNDStr(d.amount)}</span>
               </div>`).join("")}
           </div>`
        : "";

      return `
        <div style="border:1px solid #e0d0e8;border-radius:10px;padding:16px;margin-bottom:12px;background:#fff;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;">
            <div style="flex:1;">
              <div style="font-weight:700;font-size:15px;color:#2c2c2c;">${pkgName}</div>
              ${pkgDescription ? `<div style="font-size:12px;color:#888;margin-top:3px;font-style:italic;">${pkgDescription}</div>` : ""}
            </div>
            <div style="font-size:16px;font-weight:800;color:#8B1A6B;white-space:nowrap;margin-left:16px;">${fmtVNDStr(line.price || 0)}</div>
          </div>
          ${staffHTML}
          ${includesHTML}
          ${productsHTML}
          ${lineSurchHTML}
          ${lineDeductHTML}
        </div>
      `;
    }).join("");

    const surchargesHTML = surcharges.length > 0
      ? `<div style="margin-top:4px;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#c0392b;margin-bottom:6px;">Phụ thu / Phát sinh:</div>
          ${surcharges.map(s => `
            <div style="display:flex;justify-content:space-between;padding:5px 10px;background:#fff5f5;border-radius:6px;margin-bottom:4px;font-size:13px;">
              <span style="color:#c0392b;">+ ${s.name}</span>
              <span style="font-weight:600;color:#c0392b;">${fmtVNDStr(s.amount)}</span>
            </div>
          `).join("")}
         </div>`
      : "";

    const serviceTotalHTML = isMulti
      ? `<div style="display:flex;justify-content:flex-end;margin-top:8px;">
          <div style="background:#f8f0fa;border-radius:8px;padding:8px 16px;font-size:13px;">
            Thành tiền: <strong style="color:#8B1A6B;font-size:15px;">${fmtVNDStr(serviceTotal)}</strong>
          </div>
         </div>`
      : "";

    const header = isMulti
      ? `<div style="background:linear-gradient(90deg,#f8f0fa,#fff);border-left:4px solid #9b59b6;padding:10px 16px;margin-bottom:14px;border-radius:0 8px 8px 0;">
          <div style="font-weight:700;font-size:14px;color:#6c3483;">📋 ${serviceLabel}</div>
          <div style="font-size:12px;color:#888;margin-top:2px;">${formatShootDate(b.shootDate)} &nbsp;·&nbsp; ${b.shootTime?.slice(0,5) || "—"}${b.location ? ` &nbsp;·&nbsp; ${b.location}` : ""}</div>
         </div>`
      : "";

    return `
      <div style="${isMulti ? "border:1px solid #e8d5e8;border-radius:12px;padding:16px;margin-bottom:20px;" : ""}">
        ${header}
        ${linesHTML || `<div style="color:#888;font-style:italic;font-size:13px;padding:10px 0;">(Chưa có dịch vụ cụ thể)</div>`}
        ${surchargesHTML}
        ${serviceTotalHTML}
      </div>
    `;
  }

  const servicesHTML = allServices.map((b, idx) => renderServiceBlock(b, idx)).join("");
  const contractCode = booking.orderCode || `HD-${String(booking.id).padStart(4, "0")}`;
  const notesHTML = allServices.flatMap(b => b.notes ? [b.notes] : []).join(" | ");

  // ── Tổng hợp tất cả phụ thu (per-line + booking-level) ────────────────────
  const allLineSurcharges = allServices.flatMap(b => (b.items || []).flatMap(l => (l.surcharges || []) as { name: string; amount: number }[]));
  const allBookingSurcharges = allServices.flatMap(b => (b.surcharges || []) as { name: string; amount: number }[]);
  const allSurchargesFlat = [...allLineSurcharges, ...allBookingSurcharges];
  const totalSurchargesAmount = allSurchargesFlat.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  // ── Tổng hợp tất cả giảm trừ (per-line) ────────────────────────────────────
  const allLineDeductions = allServices.flatMap(b => (b.items || []).flatMap(l => (l.deductions || []) as { label: string; amount: number }[]));
  const totalDeductionsAmount = allLineDeductions.reduce((s, d) => s + (Number(d.amount) || 0), 0);
  const baseServicesAmount = Math.max(0, totalAmount - totalSurchargesAmount + totalDeductionsAmount);

  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Hóa Đơn Dịch Vụ - ${contractCode}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Be Vietnam Pro',sans-serif; color:#2c2c2c; background:#fff; font-size:14px; line-height:1.5; }
  .page { max-width:820px; margin:0 auto; padding:40px; }
  ul li { margin-bottom:2px; }
  @media print {
    body { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .no-print { display:none !important; }
    .page { padding:24px; }
    #contract-body { outline:none !important; padding:0 !important; border-radius:0 !important; cursor:default !important; }
  }
</style>
</head>
<body>
<div class="page">

  ${!forImageExport ? `<!-- Nút in + Chỉnh sửa -->
  <div class="no-print" style="display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-bottom:24px;flex-wrap:wrap;">
    <span id="edit-hint" style="display:none;font-size:12px;color:#9b59b6;font-style:italic;margin-right:auto;">✏️ Đang chỉnh sửa — bấm vào bất kỳ chỗ nào để sửa nội dung</span>
    <button id="btn-edit" class="no-print" onclick="toggleEdit()" style="background:#7f8c8d;color:#fff;border:none;padding:11px 22px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;letter-spacing:0.3px;">
      ✏️ Chỉnh sửa bản này
    </button>
    <button class="no-print" onclick="window.print()" style="background:#8B1A6B;color:#fff;border:none;padding:11px 28px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;letter-spacing:0.3px;">
      🖨️ In / Lưu PDF
    </button>
  </div>` : ""}

  <div id="contract-body">

  <!-- Header Studio -->
  <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:28px;padding-bottom:20px;border-bottom:3px solid #8B1A6B;">
    <div>
      <div style="font-size:26px;font-weight:800;color:#8B1A6B;letter-spacing:-0.5px;">✨ ${STUDIO_INFO.name}</div>
      <div style="color:#777;font-size:12.5px;margin-top:5px;">${STUDIO_INFO.desc}</div>
      <div style="color:#666;font-size:12px;margin-top:4px;">📍 ${STUDIO_INFO.address}</div>
      <div style="color:#666;font-size:12px;margin-top:2px;">📞 ${STUDIO_INFO.phone}</div>
    </div>
    <div style="text-align:right;min-width:180px;">
      <div style="font-size:20px;font-weight:800;color:#8B1A6B;text-transform:uppercase;">Hóa Đơn Dịch Vụ</div>
      <div style="font-size:13px;color:#555;margin-top:8px;">Số HĐ: <strong style="color:#2c2c2c;">${contractCode}</strong></div>
      <div style="font-size:13px;color:#555;margin-top:3px;">Ngày lập: <strong style="color:#2c2c2c;">${todayStr}</strong></div>
    </div>
  </div>

  <!-- 2 bên -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;">
    <div style="background:#fdf8ff;border:1px solid #e0d0e8;border-radius:10px;padding:16px;">
      <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#9b59b6;margin-bottom:10px;">🏢 Bên A — Cung cấp dịch vụ</div>
      <div style="font-weight:700;font-size:14px;">${STUDIO_INFO.name}</div>
      <div style="color:#555;margin-top:5px;font-size:12.5px;">📍 ${STUDIO_INFO.address}</div>
      <div style="color:#555;margin-top:3px;font-size:12.5px;">📞 ${STUDIO_INFO.phone}</div>
    </div>
    <div style="background:#fdf8ff;border:1px solid #e0d0e8;border-radius:10px;padding:16px;">
      <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#9b59b6;margin-bottom:10px;">👤 Bên B — Khách hàng</div>
      <div style="font-weight:700;font-size:14px;">${booking.customerName}</div>
      <div style="color:#555;margin-top:5px;font-size:12.5px;">📞 ${booking.customerPhone || "—"}</div>
    </div>
  </div>

  <!-- Lịch chụp -->
  <div style="background:#fdf8ff;border:1px solid #e0d0e8;border-radius:10px;padding:16px 18px;margin-bottom:24px;">
    <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#9b59b6;margin-bottom:12px;">📅 Thông tin lịch chụp</div>
    ${scheduleSectionHTML}
  </div>

  <!-- Nội dung dịch vụ -->
  <div style="margin-bottom:24px;">
    <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#9b59b6;margin-bottom:14px;">🎁 Nội dung dịch vụ</div>
    ${servicesHTML}
  </div>

  <!-- Thanh toán -->
  <div style="background:linear-gradient(135deg,#8B1A6B 0%,#6c3483 100%);border-radius:12px;padding:20px 24px;margin-bottom:24px;color:#fff;">
    <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;opacity:0.8;margin-bottom:14px;">💰 Thanh toán</div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <span>Tổng giá trị hợp đồng</span>
      <span style="font-size:22px;font-weight:800;">${fmtVNDStr(totalAmount)}</span>
    </div>
    ${(totalSurchargesAmount > 0 || totalDeductionsAmount > 0) ? `
    <div style="height:1px;background:rgba(255,255,255,0.2);margin:4px 0 8px;"></div>
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.8px;opacity:0.65;margin-bottom:6px;">Chi tiết cấu thành:</div>
    <div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:13px;">
      <span style="opacity:0.85;">Giá dịch vụ gốc</span>
      <span>${fmtVNDStr(baseServicesAmount)}</span>
    </div>
    ${totalSurchargesAmount > 0 ? `
    <div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:13px;">
      <span style="color:#ffb3b3;">⚡ Phụ thu / Phát sinh</span>
      <span style="color:#ffb3b3;font-weight:700;">+${fmtVNDStr(totalSurchargesAmount)}</span>
    </div>
    ${allSurchargesFlat.map(s => `
    <div style="display:flex;justify-content:space-between;padding:1px 0 1px 12px;font-size:11.5px;opacity:0.8;">
      <span style="color:#ffd6d6;">· ${s.name}</span>
      <span style="color:#ffd6d6;">${fmtVNDStr(s.amount)}</span>
    </div>`).join("")}` : ""}
    ${totalDeductionsAmount > 0 ? `
    <div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:13px;">
      <span style="color:#ffb3b3;">⬇ Giảm trừ dịch vụ</span>
      <span style="color:#ffb3b3;font-weight:700;">−${fmtVNDStr(totalDeductionsAmount)}</span>
    </div>
    ${allLineDeductions.map(d => `
    <div style="display:flex;justify-content:space-between;padding:1px 0 1px 12px;font-size:11.5px;opacity:0.8;">
      <span style="color:#ffd6d6;">· ${d.label}</span>
      <span style="color:#ffd6d6;">−${fmtVNDStr(d.amount)}</span>
    </div>`).join("")}` : ""}` : ""}
    ${discountAmount > 0 ? `
    <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:13.5px;">
      <span style="opacity:0.9;">🎁 Khuyến mãi / Giảm giá</span>
      <span style="font-weight:600;color:#f9e4ff;">-${fmtVNDStr(discountAmount)}</span>
    </div>
    <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:13.5px;">
      <span style="opacity:0.9;">Sau khuyến mãi</span>
      <span style="font-weight:700;">${fmtVNDStr(Math.max(0, totalAmount - discountAmount))}</span>
    </div>` : ""}
    <div style="height:1px;background:rgba(255,255,255,0.25);margin:8px 0 12px;"></div>
    <div style="display:flex;justify-content:space-between;margin-bottom:7px;font-size:13.5px;">
      <span style="opacity:0.9;">✅ Tổng đã thu</span>
      <span style="font-weight:600;">${fmtVNDStr(paidAmount)}</span>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:14px;">
      <span style="opacity:0.9;">⏳ Còn lại cần thanh toán</span>
      <span style="font-weight:800;font-size:17px;">${fmtVNDStr(remainingAmount)}</span>
    </div>
  </div>

  ${paymentHistoryList.length > 0 ? `
  <!-- Lịch sử thanh toán -->
  <div style="margin-bottom:24px;page-break-inside:avoid;">
    <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#9b59b6;margin-bottom:10px;">🧾 Lịch sử thanh toán</div>
    <table style="width:100%;border-collapse:collapse;font-size:12.5px;">
      <thead>
        <tr style="background:#f8f0fa;">
          <th style="padding:8px 12px;text-align:left;color:#6c3483;font-weight:700;border-bottom:2px solid #c39bd3;">Ngày</th>
          <th style="padding:8px 12px;text-align:left;color:#6c3483;font-weight:700;border-bottom:2px solid #c39bd3;">Hình thức</th>
          <th style="padding:8px 12px;text-align:left;color:#6c3483;font-weight:700;border-bottom:2px solid #c39bd3;">Người thu</th>
          <th style="padding:8px 12px;text-align:right;color:#6c3483;font-weight:700;border-bottom:2px solid #c39bd3;">Số tiền</th>
          <th style="padding:8px 12px;text-align:right;color:#6c3483;font-weight:700;border-bottom:2px solid #c39bd3;">Còn lại</th>
        </tr>
      </thead>
      <tbody>
        ${paymentRows.map((p, idx) => {
          const dateVal = p.paidDate || p.paidAt || "";
          const dateDisp = dateVal ? new Date(dateVal).toLocaleDateString("vi-VN") : "—";
          const methodDisp = p.paymentMethod === "bank_transfer" ? "Chuyển khoản" : "Tiền mặt";
          const rowBg = idx % 2 === 1 ? "background:#fdf8ff;" : "";
          runningPaid += Number(p.amount) || 0;
          const rowRemaining = Math.max(0, totalAmount - discountAmount - runningPaid);
          return `<tr style="${rowBg}">
            <td style="padding:7px 12px;border-bottom:1px solid #f0e8f0;">${dateDisp}</td>
            <td style="padding:7px 12px;border-bottom:1px solid #f0e8f0;">${methodDisp}</td>
            <td style="padding:7px 12px;border-bottom:1px solid #f0e8f0;color:#555;">${p.collectorName || "—"}</td>
            <td style="padding:7px 12px;border-bottom:1px solid #f0e8f0;text-align:right;font-weight:700;color:#1a7a4b;">+${fmtVNDStr(p.amount ?? 0)}</td>
            <td style="padding:7px 12px;border-bottom:1px solid #f0e8f0;text-align:right;font-weight:700;color:#8B1A6B;">${fmtVNDStr(rowRemaining)}</td>
          </tr>`;
        }).join("")}
        <tr style="background:#f0fff4;">
          <td colspan="4" style="padding:8px 12px;font-weight:700;color:#1a7a4b;">Tổng đã thu</td>
          <td style="padding:8px 12px;text-align:right;font-weight:800;font-size:14px;color:#1a7a4b;">${fmtVNDStr(paidAmount)}</td>
        </tr>
      </tbody>
    </table>
  </div>
  ` : ""}

  ${notesHTML ? `
  <!-- Ghi chú -->
  <div style="background:#fff8e1;border:1px solid #ffe082;border-radius:10px;padding:14px 18px;margin-bottom:24px;">
    <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#f57f17;margin-bottom:7px;">📝 Ghi chú</div>
    <div style="color:#555;font-size:13px;line-height:1.7;">${notesHTML}</div>
  </div>
  ` : ""}

  <!-- Điều khoản -->
  <div style="margin-bottom:32px;page-break-inside:avoid;">
    <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#9b59b6;margin-bottom:10px;">📋 Điều khoản &amp; cam kết</div>
    <div style="background:#f9f9f9;border:1px solid #eee;border-radius:10px;padding:16px 20px;font-size:12.5px;color:#444;line-height:1.85;">
      <p style="margin-bottom:6px;">✅ Bên A cam kết thực hiện đầy đủ dịch vụ theo nội dung đã thống nhất.</p>
      <p style="margin-bottom:6px;">✅ Khách thanh toán 100% chi phí còn lại ngay sau buổi chụp để nhận file.</p>
      <p style="margin-bottom:10px;">✅ Chưa thanh toán đủ, studio có quyền giữ sản phẩm.</p>

      <p style="font-weight:700;color:#333;margin-bottom:4px;">📅 Dời / hủy lịch:</p>
      <ul style="margin:0 0 10px 18px;padding:0;">
        <li style="margin-bottom:3px;">Dời 1 lần miễn phí nếu báo trước ≥ 3 ngày.</li>
        <li style="margin-bottom:3px;">Báo trễ / dời nhiều lần: có thể phát sinh phí.</li>
        <li style="margin-bottom:3px;">Hủy lịch: <strong>không hoàn cọc.</strong></li>
      </ul>

      <p style="font-weight:700;color:#333;margin-bottom:4px;">👗 Trang phục:</p>
      <ul style="margin:0 0 10px 18px;padding:0;">
        <li style="margin-bottom:3px;">Khách giữ gìn váy, vest, phụ kiện trong suốt buổi chụp.</li>
        <li style="margin-bottom:3px;">Hư hỏng / dơ nặng → đền bù theo thực tế.</li>
      </ul>

      <p style="font-weight:700;color:#333;margin-bottom:4px;">📦 Giao sản phẩm:</p>
      <ul style="margin:0 0 10px 18px;padding:0;">
        <li style="margin-bottom:3px;">Studio giao đúng thời gian cam kết.</li>
        <li style="margin-bottom:3px;">Yêu cầu gấp → có thể tính phí.</li>
      </ul>

      <p style="font-weight:700;color:#333;margin-bottom:4px;">⚡ Phát sinh:</p>
      <ul style="margin:0 0 10px 18px;padding:0;">
        <li style="margin-bottom:3px;">Các yêu cầu ngoài gói sẽ tính phí riêng.</li>
      </ul>

      <p style="margin-top:6px;font-style:italic;color:#666;">Hai bên xác nhận và đồng ý toàn bộ nội dung hóa đơn dịch vụ này.</p>
    </div>
  </div>

  <!-- Chữ ký -->
  <div style="page-break-inside:avoid;">
    <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#9b59b6;margin-bottom:14px;">✍️ Xác nhận &amp; ký tên</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;">
      <div style="text-align:center;border:1px dashed #d0b8d0;border-radius:10px;padding:20px 16px;">
        <div style="font-weight:700;font-size:13px;color:#8B1A6B;margin-bottom:4px;">Bên A – Amazing Studio</div>
        <div style="font-size:11.5px;color:#888;margin-bottom:3px;">Đại diện ký tên</div>
        <div style="height:70px;border-bottom:1.5px solid #bbb;margin:12px 24px 8px;"></div>
        <div style="font-size:11.5px;color:#888;font-style:italic;">(Ký, ghi rõ họ tên)</div>
        <div style="margin-top:10px;font-size:12px;color:#666;">Ngày ___/___/______</div>
      </div>
      <div style="text-align:center;border:1px dashed #d0b8d0;border-radius:10px;padding:20px 16px;">
        <div style="font-weight:700;font-size:13px;color:#8B1A6B;margin-bottom:4px;">Bên B – Khách hàng</div>
        <div style="font-size:11.5px;color:#888;margin-bottom:3px;">${booking.customerName}</div>
        <div style="height:70px;border-bottom:1.5px solid #bbb;margin:12px 24px 8px;"></div>
        <div style="font-size:11.5px;color:#888;font-style:italic;">(Ký, ghi rõ họ tên)</div>
        <div style="margin-top:10px;font-size:12px;color:#666;">Ngày ___/___/______</div>
      </div>
    </div>
  </div>

  <div style="text-align:center;margin-top:36px;padding-top:16px;border-top:1px solid #f0e0f0;color:#ccc;font-size:11px;">
    Hóa đơn được tạo bởi Amazing Studio · ${todayStr}
  </div>

  </div><!-- end contract-body -->

</div>
${!forImageExport ? `<script>
  var editMode = false;
  function toggleEdit() {
    editMode = !editMode;
    var body = document.getElementById('contract-body');
    var btn = document.getElementById('btn-edit');
    var hint = document.getElementById('edit-hint');
    if (editMode) {
      body.contentEditable = 'true';
      body.style.outline = '2px dashed #9b59b6';
      body.style.borderRadius = '8px';
      body.style.padding = '8px';
      body.style.cursor = 'text';
      btn.textContent = '\u2705 Xong ch\u1ec9nh s\u1eeda';
      btn.style.background = '#27ae60';
      hint.style.display = 'inline';
      body.focus();
    } else {
      body.contentEditable = 'false';
      body.style.outline = 'none';
      body.style.padding = '';
      body.style.borderRadius = '';
      body.style.cursor = '';
      btn.textContent = '\u270f\ufe0f Ch\u1ec9nh s\u1eeda b\u1ea3n n\u00e0y';
      btn.style.background = '#7f8c8d';
      hint.style.display = 'none';
    }
  }
</script>` : ""}
</body>
</html>`;
}

function ShowDetailPanel({
  booking, onClose, onEdit, onDeleteDone, isAdmin, onNavigate, onEditAllSiblings,
}: {
  booking: Booking;
  onClose: () => void;
  onEdit: () => void;
  onDeleteDone: () => void;
  isAdmin: boolean;
  onNavigate?: (booking: Booking) => void;
  onEditAllSiblings?: (parent: Booking, siblings: Booking[]) => void;
}) {
  const qc = useQueryClient();
  const { data: allStaff = [] } = useQuery<Staff[]>({
    queryKey: ["staff"],
    queryFn: () => authFetch(`${BASE}/api/staff`).then(r => r.ok ? r.json() : []).then((d: unknown) => Array.isArray(d) ? d : []),
    staleTime: 60_000,
  });
  const { data: allPackages = [] } = useQuery<DetailPackage[]>({
    queryKey: ["service-packages"],
    queryFn: () => authFetch(`${BASE}/api/service-packages`).then(r => r.ok ? r.json() : []).then((d: unknown) => Array.isArray(d) ? d : []),
    staleTime: 60_000,
  });

  // ── Fetch full detail (always — needed for siblings/parentContract and fresh paidAmount) ──
  const { data: fullDetail } = useQuery<Booking & { siblings?: Booking[]; parentContract?: Booking; children?: Booking[] }>({
    queryKey: ["booking-full", booking.id],
    queryFn: () => authFetch(`${BASE}/api/bookings/${booking.id}`).then(r => r.json()),
    enabled: true,
    staleTime: 0,
  });
  const siblings: Booking[] = fullDetail?.siblings ?? [];
  const parentContract: (Booking & { remainingAmount: number; paidAmount: number }) | null = (fullDetail?.parentContract as (Booking & { remainingAmount: number; paidAmount: number })) ?? null;

  // ── Payment history for this booking ─────────────────────────────────────
  type BookingPayment = { id?: number; amount?: number; paymentMethod?: string; paymentType?: string; collectorName?: string; notes?: string; paidAt?: string; paidDate?: string };
  const paymentTargetId = fullDetail?.parentContract?.id ?? booking.parentId ?? booking.id;
  const { data: paymentHistory = [] } = useQuery<BookingPayment[]>({
    queryKey: ["payments", paymentTargetId],
    queryFn: () => authFetch(`${BASE}/api/payments?bookingId=${paymentTargetId}`).then(r => r.ok ? r.json() : []),
    staleTime: 0,
  });

  const [deleting, setDeleting] = useState(false);
  const [previewImg, setPreviewImg] = useState<string | null>(null);

  const [showContractImages, setShowContractImages] = useState(false);
  const [contractImageUrls, setContractImageUrls] = useState<string[]>([]);
  const [contractImagesLoading, setContractImagesLoading] = useState(false);

  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleForm, setRescheduleForm] = useState({ newDate: booking.shootDate, newTime: booking.shootTime || "", reason: "" });
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
  const [rescheduleConflicts, setRescheduleConflicts] = useState<{ customerName: string; date: string; time: string; staffNames?: string }[]>([]);
  const [rescheduling, setRescheduling] = useState(false);
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
      await authFetch(`${BASE}/api/bookings/${booking.id}`, { method: "DELETE" });
      qc.invalidateQueries({ queryKey: ["bookings"] });
      onDeleteDone();
    } finally { setDeleting(false); }
  };

  const handlePrintContract = () => {
    const parentDiscount = Number(parentContract?.discountAmount ?? 0) || 0;
    const parentPaid     = Number(parentContract?.paidAmount     ?? 0) || 0;
    const parentTotal    = Number(parentContract?.totalAmount    ?? 0) || 0;
    const bookingPaid    = paymentHistory.reduce((s, p) => s + (p.amount ?? 0), 0);
    const bookingDiscount = Number((fullDetail ?? booking).discountAmount ?? 0) || 0;
    const bookingTotal    = Number((fullDetail ?? booking).totalAmount    ?? 0) || 0;

    const paymentSummary = parentContract
      ? {
          totalAmount:     parentTotal,
          paidAmount:      parentPaid,
          discountAmount:  parentDiscount,
          remainingAmount: Math.max(0, parentTotal - parentDiscount - parentPaid),
        }
      : {
          totalAmount:     bookingTotal,
          paidAmount:      bookingPaid,
          discountAmount:  bookingDiscount,
          remainingAmount: Math.max(0, bookingTotal - bookingDiscount - bookingPaid),
        };
    const html = generateContractHTML(booking, siblings, allPackages, paymentSummary, false, paymentHistory);
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
        {booking.status === "confirmed" && (
          <button
            onClick={() => {
              setShowReschedule(true);
              setRescheduleForm({ newDate: booking.shootDate, newTime: booking.shootTime || "", reason: "" });
              setRescheduleError(null);
              setRescheduleConflicts([]);
            }}
            className="p-1.5 rounded-lg text-sky-500 hover:text-sky-700 hover:bg-sky-50 dark:hover:bg-sky-950/30 transition-colors flex-shrink-0"
            title="Đổi lịch chụp"
          >
            <CalendarDays className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={handlePrintContract}
          className="p-1.5 rounded-lg text-violet-500 hover:text-violet-700 hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors flex-shrink-0"
          title="Xuất hợp đồng PDF"
        >
          <FileText className="w-4 h-4" />
        </button>
        <button
          onClick={async () => {
            setContractImageUrls([]);
            setContractImagesLoading(true);
            setShowContractImages(true);
            try {
              const parentDiscount = Number(parentContract?.discountAmount ?? 0) || 0;
              const parentPaid     = Number(parentContract?.paidAmount     ?? 0) || 0;
              const parentTotal    = Number(parentContract?.totalAmount    ?? 0) || 0;
              const bookingPaid    = paymentHistory.reduce((s, p) => s + (p.amount ?? 0), 0);
              const bookingDiscount = Number((fullDetail ?? booking).discountAmount ?? 0) || 0;
              const bookingTotal    = Number((fullDetail ?? booking).totalAmount    ?? 0) || 0;

              const paymentSummary = parentContract
                ? {
                    totalAmount:     parentTotal,
                    paidAmount:      parentPaid,
                    discountAmount:  parentDiscount,
                    remainingAmount: Math.max(0, parentTotal - parentDiscount - parentPaid),
                  }
                : {
                    totalAmount:     bookingTotal,
                    paidAmount:      bookingPaid,
                    discountAmount:  bookingDiscount,
                    remainingAmount: Math.max(0, bookingTotal - bookingDiscount - bookingPaid),
                  };
              const html = generateContractHTML(booking, siblings, allPackages, paymentSummary, true, paymentHistory);
              const urls = await buildContractImages(html);
              setContractImageUrls(urls);
            } catch (err) {
              alert(`Lỗi tạo ảnh: ${err instanceof Error ? err.message : String(err)}`);
              setShowContractImages(false);
            } finally {
              setContractImagesLoading(false);
            }
          }}
          className="p-1.5 rounded-lg text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors flex-shrink-0"
          title="Xem hợp đồng dạng ảnh"
        >
          <Camera className="w-4 h-4" />
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
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
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
                  <div className="px-3 py-2 bg-violet-50 dark:bg-violet-950/30 border-b border-violet-200 dark:border-violet-800 flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">
                      📅 Tất cả dịch vụ trong hợp đồng ({siblings.length})
                    </p>
                    {isAdmin && onEditAllSiblings && parentContract && (
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); onEditAllSiblings(parentContract, siblings); }}
                        title="Mở form chỉnh sửa tất cả dịch vụ"
                        className="p-1 rounded-md transition-colors hover:bg-violet-200 dark:hover:bg-violet-800 text-violet-500 dark:text-violet-400"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {siblings.map((sib, idx) => {
                    const sibDate = (() => { try { const d = parseISO(sib.shootDate); return isNaN(d.getTime()) ? null : d; } catch { return null; } })();
                    const isCurrent = sib.id === booking.id;
                    const sibSt = STATUS[sib.status as keyof typeof STATUS] ?? STATUS.pending;
                    const borderCls = idx > 0 ? "border-t border-violet-100 dark:border-violet-900" : "";
                    const inner = (
                      <>
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
                        {!isCurrent && <ChevronRight className="w-3.5 h-3.5 text-violet-400 flex-shrink-0" />}
                      </>
                    );
                    return isCurrent ? (
                      <div key={sib.id} className={`flex items-center gap-3 px-3 py-2.5 bg-violet-50 dark:bg-violet-950/20 ${borderCls}`}>
                        {inner}
                      </div>
                    ) : (
                      <button
                        key={sib.id}
                        type="button"
                        onClick={() => onNavigate?.(sib)}
                        className={`w-full text-left flex items-center gap-3 px-3 py-2.5 hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors ${borderCls}`}
                      >
                        {inner}
                      </button>
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
                    {(parentContract.discountAmount ?? 0) > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Giảm giá</span>
                        <span className="font-semibold text-amber-600">-{fmtVND(parentContract.discountAmount ?? 0)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Đã thu</span>
                      <span className="font-semibold text-emerald-600">{fmtVND(parentContract.paidAmount ?? 0)}</span>
                    </div>
                    <div className="flex justify-between text-sm border-t border-border/40 pt-1.5">
                      <span className="font-semibold">Còn lại</span>
                      {(() => {
                        const calcRemaining = Math.max(0, (parentContract.totalAmount ?? 0) - (parentContract.discountAmount ?? 0) - (parentContract.paidAmount ?? 0));
                        return <span className={`font-bold ${calcRemaining > 0 ? "text-destructive" : "text-emerald-600"}`}>{fmtVND(calcRemaining)}</span>;
                      })()}
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
                    {(item.photoName || item.makeupName || (Array.isArray(item.assignedStaff) && (item.assignedStaff as StaffAssignment[]).some(sa => sa.staffName))) && (
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
                        {/* Additional roles: assistant, support, video… */}
                        {Array.isArray(item.assignedStaff) && (item.assignedStaff as StaffAssignment[])
                          .filter(sa => !["photographer", "photo", "makeup"].includes(sa.role ?? "") && sa.staffName)
                          .map((sa, idx) => {
                            const roleLabel =
                              sa.role === "assistant" || sa.role === "tro_ly" ? "Trợ lý" :
                              sa.role === "support" || sa.role === "ho_tro" ? "Hỗ trợ" :
                              sa.role === "video" ? "Quay phim" :
                              sa.role ?? "Khác";
                            return (
                              <div key={idx} className="flex items-center gap-2 text-xs">
                                <User className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />
                                <span className="text-muted-foreground">{roleLabel}:</span>
                                <span className="font-medium">{sa.staffName}</span>
                              </div>
                            );
                          })
                        }
                      </div>
                    )}

                    {/* Giảm trừ dịch vụ per line */}
                    {item.deductions && (item.deductions as { label: string; amount: number }[]).length > 0 && (
                      <div className="px-3 py-2 bg-red-50/40 dark:bg-red-950/10 border-t border-border/30">
                        <p className="text-[10px] font-bold text-red-600 dark:text-red-400 mb-1.5">⬇ Giảm trừ dịch vụ</p>
                        <div className="space-y-0.5">
                          {(item.deductions as { label: string; amount: number }[]).map((d, i) => (
                            <div key={i} className="flex justify-between text-xs text-red-600 dark:text-red-400">
                              <span>− {d.label}</span>
                              <span className="font-semibold">−{fmtVND(d.amount)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Per-item notes */}
                    {item.notes && (
                      <div className="px-3 py-2 bg-amber-50/40 dark:bg-amber-950/10 border-t border-border/30">
                        <p className="text-[10px] font-bold text-amber-700 dark:text-amber-300 mb-1">📝 Ghi chú dịch vụ</p>
                        <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed whitespace-pre-line">{item.notes}</p>
                      </div>
                    )}

                    {/* Concept images */}
                    {item.conceptImages && item.conceptImages.length > 0 && (
                      <div className="px-3 py-2 border-t border-border/30">
                        <p className="text-[10px] font-bold text-muted-foreground mb-2">🖼️ Ảnh concept ({item.conceptImages.length})</p>
                        <div className="grid grid-cols-3 gap-1.5">
                          {item.conceptImages.map((imgUrl: string, ci: number) => {
                            const src = getImageSrc(imgUrl);
                            return src ? (
                              <button
                                key={ci}
                                onClick={() => setPreviewImg(src)}
                                className="aspect-square rounded-lg overflow-hidden bg-muted hover:ring-2 hover:ring-primary transition-all"
                              >
                                <img src={src} alt={`concept ${ci + 1}`} className="w-full h-full object-cover" />
                              </button>
                            ) : null;
                          })}
                        </div>
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
                {(() => {
                  const totalPaid = paymentHistory.reduce((s, p) => s + (p.amount ?? 0), 0);
                  const discount   = booking.discountAmount ?? 0;
                  const remaining  = Math.max(0, booking.totalAmount - discount - totalPaid);
                  return (
                    <div className="rounded-xl border border-border/50 overflow-hidden divide-y divide-border/40">
                      <div className="flex justify-between items-center px-3 py-2.5">
                        <span className="text-sm text-muted-foreground">Tổng tiền</span>
                        <span className="font-bold text-base">{formatVND(booking.totalAmount)}</span>
                      </div>
                      {discount > 0 && (
                        <div className="flex justify-between items-center px-3 py-2.5">
                          <span className="text-sm text-muted-foreground">Giảm giá</span>
                          <span className="text-amber-600 font-medium">-{formatVND(discount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center px-3 py-2.5">
                        <span className="text-sm text-muted-foreground">Đã thu</span>
                        <span className="font-semibold text-emerald-600">{formatVND(totalPaid)}</span>
                      </div>
                      <div className={`flex justify-between items-center px-3 py-2.5 ${remaining > 0 ? "bg-destructive/5" : "bg-emerald-50/40"}`}>
                        <span className="text-sm font-semibold">Còn lại</span>
                        <span className={`font-bold text-base ${remaining > 0 ? "text-destructive" : "text-emerald-600"}`}>
                          {remaining > 0 && <span className="mr-1">⚠️</span>}
                          {formatVND(remaining)}
                        </span>
                      </div>
                      {paymentHistory.length > 0 && (
                        <div className="px-3 py-2 space-y-2 bg-muted/10">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Lịch sử thu tiền ({paymentHistory.length} lần)</p>
                          {paymentHistory.map((p, i) => {
                            const dateStr = p.paidDate
                              ? new Date(p.paidDate).toLocaleDateString("vi-VN")
                              : p.paidAt ? new Date(p.paidAt).toLocaleDateString("vi-VN") : "—";
                            const method = p.paymentMethod === "bank_transfer" ? "Chuyển khoản" : "Tiền mặt";
                            return (
                              <div key={p.id ?? i} className="rounded-lg bg-background/70 border border-border/40 px-2.5 py-1.5">
                                <div className="flex justify-between items-center">
                                  <span className="text-xs text-muted-foreground">{dateStr} · {method}</span>
                                  <span className="text-sm font-bold text-emerald-700">+{formatVND(p.amount ?? 0)}</span>
                                </div>
                                {p.collectorName && (
                                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">Người thu: {p.collectorName}</p>
                                )}
                                {p.notes && (
                                  <p className="text-[10px] text-muted-foreground/70 mt-0.5 italic">{p.notes}</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}
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

      {/* Modal xem hợp đồng dạng ảnh */}
      {showContractImages && (
        <div className="fixed inset-0 z-[300] bg-black/95 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
            <div>
              <p className="text-white font-semibold text-sm">Hợp đồng dạng ảnh</p>
              <p className="text-white/50 text-xs mt-0.5">Bấm giữ ảnh để lưu vào điện thoại</p>
            </div>
            <button
              onClick={() => { setShowContractImages(false); setContractImageUrls([]); }}
              className="text-white/70 hover:text-white p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            {contractImagesLoading ? (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                <p className="text-white/60 text-sm">Đang tạo ảnh hợp đồng...</p>
              </div>
            ) : contractImageUrls.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-white/50 text-sm">Không có dữ liệu</p>
              </div>
            ) : (
              <div className="p-4 space-y-6 max-w-2xl mx-auto">
                {contractImageUrls.map((url, idx) => (
                  <div key={idx}>
                    <p className="text-white/50 text-xs mb-2 text-center">Trang {idx + 1} / {contractImageUrls.length}</p>
                    <img
                      src={url}
                      alt={`Trang ${idx + 1}`}
                      className="w-full rounded-lg shadow-xl"
                      style={{ touchAction: "manipulation" }}
                    />
                  </div>
                ))}
                <p className="text-center text-white/40 text-xs pb-4">Bấm giữ ảnh để lưu vào thư viện điện thoại</p>
              </div>
            )}
          </div>
        </div>
      )}

      {previewImg && (
        <div
          className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setPreviewImg(null)}
        >
          <img
            src={previewImg}
            alt="Xem ảnh concept"
            className="max-w-full max-h-full object-contain rounded-xl"
            onClick={e => e.stopPropagation()}
          />
          <button
            onClick={() => setPreviewImg(null)}
            className="absolute top-4 right-4 text-white/70 hover:text-white p-2 rounded-full bg-black/40 hover:bg-black/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Đổi lịch Modal */}
      {showReschedule && (
        <div
          className="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center p-4"
          onClick={() => setShowReschedule(false)}
        >
          <div
            className="bg-background rounded-2xl shadow-2xl p-5 w-full max-w-sm space-y-3"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-1">
              <CalendarDays className="w-5 h-5 text-primary" />
              <h3 className="font-bold text-base">Đổi lịch chụp</h3>
            </div>
            <div>
              <label className="text-sm font-medium">Ngày mới *</label>
              <input
                type="date"
                className="w-full mt-1 h-9 px-3 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary/20"
                value={rescheduleForm.newDate}
                onChange={e => setRescheduleForm(f => ({ ...f, newDate: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Giờ mới</label>
              <input
                type="time"
                className="w-full mt-1 h-9 px-3 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary/20"
                value={rescheduleForm.newTime}
                onChange={e => setRescheduleForm(f => ({ ...f, newTime: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Lý do đổi lịch *</label>
              <textarea
                rows={2}
                placeholder="Nhập lý do đổi lịch (bắt buộc)..."
                className="w-full mt-1 px-3 py-2 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
                value={rescheduleForm.reason}
                onChange={e => setRescheduleForm(f => ({ ...f, reason: e.target.value }))}
              />
            </div>
            {rescheduleError && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm px-3 py-2">{rescheduleError}</div>
            )}
            {rescheduleConflicts.length > 0 && (
              <div className="rounded-lg bg-orange-50 border border-orange-200 text-sm px-3 py-2 space-y-1">
                <p className="font-semibold text-orange-800">⚠️ Xung đột lịch:</p>
                {rescheduleConflicts.map((c, i) => (
                  <p key={i} className="text-orange-700 text-xs">
                    • {c.customerName} — {c.date}{c.time ? " " + c.time.slice(0, 5) : ""}
                    {c.staffNames ? ` (${c.staffNames})` : ""}
                  </p>
                ))}
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <Button
                className="flex-1"
                disabled={!rescheduleForm.newDate || !rescheduleForm.reason.trim() || rescheduling}
                onClick={async () => {
                  if (!rescheduleForm.reason.trim()) { setRescheduleError("Vui lòng nhập lý do đổi lịch"); return; }
                  setRescheduleError(null);
                  setRescheduleConflicts([]);
                  setRescheduling(true);
                  try {
                    const res = await authFetch(`${BASE}/api/bookings/${booking.id}/reschedule`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(rescheduleForm),
                    });
                    const data = await res.json();
                    if (!res.ok) {
                      if (res.status === 409 && data.conflicts) {
                        setRescheduleConflicts(data.conflicts);
                        setRescheduleError(data.error || "Xung đột lịch với nhân viên đã phân công");
                      } else {
                        setRescheduleError(data.error || "Lỗi đổi lịch");
                      }
                    } else {
                      qc.invalidateQueries({ queryKey: ["bookings"] });
                      qc.invalidateQueries({ queryKey: ["booking-full", booking.id] });
                      setShowReschedule(false);
                    }
                  } catch {
                    setRescheduleError("Lỗi kết nối, vui lòng thử lại");
                  } finally {
                    setRescheduling(false);
                  }
                }}
              >
                {rescheduling ? "Đang lưu..." : "Xác nhận đổi lịch"}
              </Button>
              <Button variant="outline" onClick={() => setShowReschedule(false)}>Hủy</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Month day cell ────────────────────────────────────────────────────────────
const HOUR_PX = 64; // px per hour in day view
const MAX_VISIBLE = 4;

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

  return (
    <div
      className={[
        "group relative flex flex-col border-r border-b border-border/50 cursor-pointer select-none overflow-hidden",
        "transition-colors duration-100 min-h-[160px] sm:min-h-[180px]",
        isSelected ? "bg-primary/5" : isToday(date) ? "bg-orange-50/30 dark:bg-orange-950/10" : "hover:bg-muted/20",
        isOtherMonth ? "opacity-25" : "",
      ].join(" ")}
      onClick={() => onDayClick(date)}
    >
      {/* Day header */}
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
          <span className="text-[7px] text-red-500 font-semibold leading-none truncate max-w-[36px]">
            {(solarHoliday || lunarHoliday)?.slice(0, 7)}
          </span>
        )}
      </div>

      {/* Show cards */}
      <div className="flex-1 px-[2%] pb-1 space-y-[3px] overflow-hidden">
        {bookings
          .slice()
          .sort((a, b) => (a.shootTime ?? "").localeCompare(b.shootTime ?? ""))
          .slice(0, MAX_VISIBLE)
          .map(b => {
            const st = STATUS[b.status as keyof typeof STATUS] ?? STATUS.pending;
            const item = b.items?.[0];

            // Line 1: time + customer name
            const hourStr = b.shootTime
              ? b.shootTime.endsWith(":00") ? b.shootTime.slice(0, 2) + "h" : b.shootTime.slice(0, 5)
              : "";

            // Line 2: service name
            const serviceName = item?.serviceName || b.packageType?.split("(")[0].trim() || "";

            // Line 3: photographer last name
            const photoLast = item?.photoName?.trim().split(/\s+/).pop() ?? "";

            // Line 4: makeup last name
            const makeupLast = item?.makeupName?.trim().split(/\s+/).pop() ?? "";

            // Extra staff roles (assistant, support, video) from assignedStaff
            const extraRoleMap: Record<string, string[]> = {};
            if (Array.isArray(item?.assignedStaff)) {
              for (const sa of item.assignedStaff as { role: string; staffName: string }[]) {
                if (!sa.role || !sa.staffName) continue;
                const r = sa.role.toLowerCase();
                // Skip photographer and makeup roles (already shown)
                if (r === "photo" || r === "photographer" || r === "makeup" || r === "make_up") continue;
                const lastName = sa.staffName.trim().split(/\s+/).pop() ?? sa.staffName;
                if (!extraRoleMap[sa.role]) extraRoleMap[sa.role] = [];
                extraRoleMap[sa.role].push(lastName);
              }
            }

            // Role display abbreviation map
            const roleAbbr: Record<string, string> = {
              assistant: "A", tro_ly: "A", tro_li: "A",
              support: "HT", ho_tro: "HT",
              video: "V",
            };

            return (
              <button
                key={b.id}
                onClick={e => { e.stopPropagation(); onEventClick(b); }}
                className={`w-full text-left rounded px-1.5 py-1 ${st.bar} hover:brightness-95 transition-all`}
              >
                {/* Line 1: time + customer name */}
                <div className="flex items-baseline gap-1 leading-tight">
                  {hourStr && <span className="text-[11px] font-black flex-shrink-0">{hourStr}</span>}
                  <span className="text-[11px] font-bold truncate">{b.customerName}</span>
                </div>
                {/* Line 2: service name */}
                {serviceName && (
                  <div className="text-[10px] leading-tight opacity-90 truncate">{serviceName}</div>
                )}
                {/* Line 3: photographer */}
                {photoLast && (
                  <div className="text-[10px] leading-tight font-medium opacity-90">P: {photoLast}</div>
                )}
                {/* Line 4: makeup */}
                {makeupLast && (
                  <div className="text-[10px] leading-tight font-medium opacity-90">M: {makeupLast}</div>
                )}
                {/* Extra roles */}
                {Object.entries(extraRoleMap).map(([role, names]) => {
                  const abbr = roleAbbr[role.toLowerCase()] ?? role.slice(0, 2).toUpperCase();
                  const display = names.length === 1 ? names[0] : `${names[0]} +${names.length - 1}`;
                  return (
                    <div key={role} className="text-[10px] leading-tight opacity-85">{abbr}: {display}</div>
                  );
                })}
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
      ? Math.max(0, (parseInt(firstBooking.shootTime ?? "06") || 6) - 1)
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

// ─── Error boundary: catches render crashes in CalendarPage, logs stack ────────
interface EBState { hasError: boolean; error: Error | null }
class CalendarErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error): EBState {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("CalendarPage crash:", error, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
          <p className="text-destructive font-semibold text-base">Đã có lỗi xảy ra, vui lòng tải lại trang.</p>
          <button
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Thử lại
          </button>
          {import.meta.env.DEV && this.state.error && (
            <pre className="text-left text-xs text-muted-foreground bg-muted rounded p-3 max-w-full overflow-auto max-h-48">
              {this.state.error.message}
            </pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

function CalendarPageInner() {
  const [calView, setCalView] = useState<CalView>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTime, setSelectedTime] = useState("07:00");
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [editingSiblings, setEditingSiblings] = useState<Booking[]>([]);
  const [viewingBooking, setViewingBooking] = useState<Booking | null>(null);
  const [showLunar, setShowLunar] = useState(true);

  const { isAdmin, toggle: toggleAdminMode } = useViewMode();
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const { data: bookings = [], isLoading } = useQuery<Booking[]>({
    queryKey: ["bookings"],
    queryFn: () => authFetch(`${BASE}/api/bookings`).then(r => r.json()),
    staleTime: 30_000,
  });

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const firstDayOfMonth = (monthStart.getDay() + 6) % 7;

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
    setEditingSiblings([]);
    setSelectedTime(viewingBooking.shootTime ?? "07:00");
    setCalView("form");
  }, [viewingBooking]);

  const handleEditAllSiblings = useCallback((parent: Booking, sibs: Booking[]) => {
    setEditingBooking(parent);
    setEditingSiblings(sibs);
    setSelectedDate(new Date(parent.shootDate));
    setCurrentDate(new Date(parent.shootDate));
    setSelectedTime(parent.shootTime ?? "08:00");
    setCalView("form");
  }, []);

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
    setEditingSiblings([]);
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
          onNavigate={(sib) => setViewingBooking(sib)}
          onEditAllSiblings={handleEditAllSiblings}
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
          siblingBookings={editingSiblings}
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
    <div className="flex flex-col gap-3" style={{ minHeight: 0 }}>
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
      <div
        className="bg-card rounded-2xl border shadow-sm overflow-hidden flex flex-col"
        style={{ maxHeight: "calc(100svh - 160px)" }}
        onTouchStart={e => {
          const t = e.touches[0];
          touchStartRef.current = { x: t.clientX, y: t.clientY };
        }}
        onTouchEnd={e => {
          if (!touchStartRef.current) return;
          const t = e.changedTouches[0];
          const dx = t.clientX - touchStartRef.current.x;
          const dy = t.clientY - touchStartRef.current.y;
          touchStartRef.current = null;
          if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy)) {
            if (dx < 0) nextMonth();
            else prevMonth();
          }
        }}
      >
        {/* Month nav */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-card to-muted/10 flex-shrink-0">
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
        <div className="grid grid-cols-7 border-b border-border/50 flex-shrink-0">
          {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((d, i) => (
            <div key={d} className={`text-center text-xs font-bold py-2 border-r border-border/50 last:border-r-0 ${i === 5 ? "text-blue-600" : i === 6 ? "text-red-500" : "text-muted-foreground"}`}>{d}</div>
          ))}
        </div>

        {/* Grid — scrollable body (flex-1 fills the remaining card height) */}
        <div className="overflow-y-auto flex-1 min-h-0">
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

export default function CalendarPage() {
  return (
    <CalendarErrorBoundary>
      <CalendarPageInner />
    </CalendarErrorBoundary>
  );
}
