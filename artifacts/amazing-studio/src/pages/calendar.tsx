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
} from "lucide-react";
import { Button, Input } from "@/components/ui";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Types ────────────────────────────────────────────────────────────────────
type Booking = {
  id: number; orderCode: string; customerId: number; customerName: string;
  customerPhone: string; shootDate: string; shootTime: string;
  serviceCategory: string; packageType: string; location: string | null;
  status: string; items: OrderLine[]; totalAmount: number; depositAmount: number;
  paidAmount: number; remainingAmount: number; assignedStaff: number[];
  notes: string | null;
};
type Customer = {
  id: number; name: string; phone: string; email?: string;
  facebook?: string; zalo?: string; avatar?: string; customCode?: string; totalDebt?: number;
};
type Staff = { id: number; name: string; role: string; roles: string[]; isActive: boolean; staffType?: string };
type ServiceSplit = { role: string; amount: number; rateType: "fixed" | "percent" };
type Service = { id: number; name: string; price: number; category: string; code: string; splits?: ServiceSplit[] };
type ServiceOption = { key: string; name: string; price: number; splits?: ServiceSplit[]; printCost?: number; operatingCost?: number; salePercent?: number };
type OrderLine = {
  tempId: string; serviceName: string; serviceId: number | null; serviceKey: string; price: number;
  photoId: number | null; photoName: string; photoTask: string;
  makeupId: number | null; makeupName: string; makeupTask: string;
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

function OrderLineRow({ line, photographers, makeupArtists, services, onChange, onRemove }: {
  line: OrderLine;
  photographers: Staff[];
  makeupArtists: Staff[];
  services: ServiceOption[];
  onChange: (u: OrderLine) => void;
  onRemove: () => void;
}) {
  const [useCustom, setUseCustom] = useState(!line.serviceId && !!line.serviceName);

  // Find the selected service/package to show preview (use serviceKey to support both svc- and pkg- prefixes)
  const selectedSvc = line.serviceKey ? services.find(s => s.key === line.serviceKey) : null;
  const splits = selectedSvc?.splits || [];
  const photoSplit = splits.find(sp => sp.role === "photographer");
  const makeupSplit = splits.find(sp => sp.role === "makeup");
  const isPkg = selectedSvc?.key?.startsWith("pkg-");
  const pkgSaleAmt = isPkg ? Math.round(line.price * (selectedSvc?.salePercent || 0) / 100) : 0;
  const pkgFixedCost = isPkg ? ((selectedSvc?.printCost || 0) + (selectedSvc?.operatingCost || 0) + pkgSaleAmt) : 0;

  function calcSplit(sp: ServiceSplit | undefined): number {
    if (!sp) return 0;
    return sp.rateType === "percent" ? (line.price * sp.amount / 100) : sp.amount;
  }

  return (
    <div className="p-2.5 bg-muted/30 rounded-xl border border-border/50 space-y-2">
      <div className="flex gap-1.5 items-center">
        <select
          className="flex-1 h-9 border border-input rounded-lg px-2 text-sm bg-background"
          value={line.serviceKey && line.serviceKey !== "" ? line.serviceKey : useCustom ? "_custom" : ""}
          onChange={e => {
            if (e.target.value === "_custom") { setUseCustom(true); onChange({ ...line, serviceId: null, serviceKey: "", serviceName: "" }); return; }
            setUseCustom(false);
            const svc = services.find(s => s.key === e.target.value);
            const idNum = e.target.value.startsWith("svc-") ? parseInt(e.target.value.replace("svc-", "")) : null;
            onChange({ ...line, serviceId: idNum, serviceKey: e.target.value, serviceName: svc?.name ?? "", price: svc ? svc.price : line.price });
          }}
        >
          <option value="">— Chọn dịch vụ —</option>
          {services.map(s => <option key={s.key} value={s.key}>{s.name}</option>)}
          <option value="_custom">✏️ Tự nhập tên...</option>
        </select>
        <button onClick={onRemove} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors flex-shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
      {useCustom && (
        <Input className="h-9 text-sm" placeholder="Tên dịch vụ..." value={line.serviceName} onChange={e => onChange({ ...line, serviceName: e.target.value })} />
      )}
      <div className="grid grid-cols-2 gap-1.5">
        <div>
          <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1"><Camera className="w-3 h-3" /> Nhiếp ảnh</p>
          <select className="w-full h-8 border border-input rounded-lg px-2 text-xs bg-background" value={line.photoId ?? ""}
            onChange={e => { const s = photographers.find(x => x.id === parseInt(e.target.value)); onChange({ ...line, photoId: s?.id ?? null, photoName: s?.name ?? "" }); }}>
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
          {/* Photo earnings preview */}
          {line.photoId && photoSplit && calcSplit(photoSplit) > 0 && (
            <div className="mt-1 text-[10px] bg-blue-50 text-blue-700 rounded px-2 py-1 flex justify-between">
              <span>💰 Thù lao dự kiến</span>
              <span className="font-semibold">{fmtVND(calcSplit(photoSplit))}</span>
            </div>
          )}
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1"><Sparkles className="w-3 h-3" /> Makeup</p>
          <select className="w-full h-8 border border-input rounded-lg px-2 text-xs bg-background" value={line.makeupId ?? ""}
            onChange={e => { const s = makeupArtists.find(x => x.id === parseInt(e.target.value)); onChange({ ...line, makeupId: s?.id ?? null, makeupName: s?.name ?? "" }); }}>
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
          {/* Makeup earnings preview */}
          {line.makeupId && makeupSplit && calcSplit(makeupSplit) > 0 && (
            <div className="mt-1 text-[10px] bg-pink-50 text-pink-700 rounded px-2 py-1 flex justify-between">
              <span>💰 Thù lao dự kiến</span>
              <span className="font-semibold">{fmtVND(calcSplit(makeupSplit))}</span>
            </div>
          )}
        </div>
      </div>
      <div className="flex items-end gap-3">
        <div>
          <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1"><CreditCard className="w-3 h-3" /> Giá (đ)</p>
          <Input type="number" className="h-8 text-sm w-40" value={line.price || ""} placeholder="0" onChange={e => onChange({ ...line, price: parseFloat(e.target.value) || 0 })} />
        </div>
        {line.price > 0 && selectedSvc && splits.length > 0 && (
          <div className="text-[10px] text-muted-foreground pb-1">
            Studio giữ: <span className="font-semibold text-green-600">
              {fmtVND(line.price - splits.reduce((s, sp) => s + (sp.rateType === "percent" ? line.price * sp.amount / 100 : sp.amount), 0))}
            </span>
          </div>
        )}
      </div>

      {/* Package fixed cost breakdown */}
      {isPkg && line.price > 0 && selectedSvc && (
        <div className="text-[11px] bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 space-y-0.5">
          <p className="font-semibold text-amber-800 mb-1">Chi phí cố định</p>
          {(selectedSvc.printCost || 0) > 0 && (
            <div className="flex justify-between text-amber-700"><span>🖨️ In ấn</span><span>{fmtVND(selectedSvc.printCost || 0)}</span></div>
          )}
          {(selectedSvc.operatingCost || 0) > 0 && (
            <div className="flex justify-between text-amber-700"><span>⚡ Vận hành</span><span>{fmtVND(selectedSvc.operatingCost || 0)}</span></div>
          )}
          {(selectedSvc.salePercent || 0) > 0 && (
            <div className="flex justify-between text-amber-700"><span>💼 Sale {selectedSvc.salePercent}%</span><span>≈ {fmtVND(pkgSaleAmt)}</span></div>
          )}
          <div className="flex justify-between font-semibold text-green-700 border-t border-amber-200 pt-1 mt-1">
            <span>Còn lại (chưa trừ nhân sự)</span>
            <span>{fmtVND(line.price - pkgFixedCost)}</span>
          </div>
          <p className="text-[9px] text-amber-600 italic">* Chi phí photo & makeup tính từ bảng giá nhân sự</p>
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
  const [timeStart, setTimeStart] = useState(booking?.shootTime ?? initialTime);
  const [timeEnd, setTimeEnd] = useState(() => {
    const [h, m] = (booking?.shootTime ?? initialTime).split(":").map(Number);
    const endH = Math.min(h + 2, 23);
    return `${String(endH).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  });
  const [location, setLocation] = useState(booking?.location ?? "");
  const [status, setStatus] = useState(booking?.status ?? "confirmed");

  const handleShootDateChange = (newVal: string) => {
    setShootDateLocal(newVal);
    try {
      const parsed = parseISO(newVal);
      if (!isNaN(parsed.getTime())) onDateChange(parsed);
    } catch { /* ignore */ }
  };

  const [lines, setLines] = useState<OrderLine[]>(() => {
    if (booking?.items?.length) return booking.items.map(i => ({ photoTask: "", makeupTask: "", serviceKey: "", ...i, tempId: genId() }));
    return [{ tempId: genId(), serviceName: "", serviceId: null, serviceKey: "", price: 0, photoId: null, photoName: "", photoTask: "", makeupId: null, makeupName: "", makeupTask: "" }];
  });

  const [deposit, setDeposit] = useState(booking?.depositAmount?.toString() ?? "0");
  const [notes, setNotes] = useState(booking?.notes ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: allStaff = [] } = useQuery<Staff[]>({ queryKey: ["staff"], queryFn: () => fetch(`${BASE}/api/staff`).then(r => r.json()) });
  const { data: services = [] } = useQuery<Service[]>({ queryKey: ["services"], queryFn: () => fetch(`${BASE}/api/services`).then(r => r.json()) });
  const { data: pricingPackages = [] } = useQuery<{ id: number; name: string; price: number; printCost: number; operatingCost: number; salePercent: number }[]>({ queryKey: ["service-packages"], queryFn: () => fetch(`${BASE}/api/service-packages`).then(r => r.json()) });

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
    ...pricingPackages.map(p => ({ key: `pkg-${p.id}`, name: p.name, price: p.price, splits: [], printCost: p.printCost || 0, operatingCost: p.operatingCost || 0, salePercent: p.salePercent || 0 })),
  ];

  const totalAmount = lines.reduce((s, l) => s + (l.price || 0), 0);
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
    if (!shootDate) { setError("Vui lòng chọn ngày chụp"); return; }
    if (!timeStart) { setError("Vui lòng chọn giờ bắt đầu"); return; }
    setSaving(true);
    try {
      // ── 1. Tạo / tìm khách hàng ──
      let cid = customerId;
      if (!cid) {
        const found = await fetch(`${BASE}/api/customers?search=${encodeURIComponent(phone)}`).then(r => r.json()) as Customer[];
        const existing = found.find(c => c.phone === phone);
        if (existing) {
          cid = existing.id;
          // Update avatar nếu có ảnh mới
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

      // ── 2. Chuẩn bị dịch vụ (không bắt buộc) ──
      const validLines = lines.filter(l => l.serviceName || l.serviceId);
      const hasServices = validLines.length > 0;

      const packageType = hasServices
        ? (validLines.length === 1
            ? (validLines[0].serviceName || "Dịch vụ")
            : `${validLines[0].serviceName || "Dịch vụ"} (+${validLines.length - 1})`)
        : "Chưa chốt dịch vụ";

      const finalStatus = hasServices ? status : (status === "confirmed" || status === "in_progress" || status === "completed" ? status : "pending_service");
      const finalTotal = hasServices ? totalAmount : 0;
      const finalDeposit = hasServices ? depositNum : 0;

      // Build role-keyed assignedStaff object for payroll auto-compute
      // Include task keys so earnings compute can look up the right price
      const assignedStaff: Record<string, unknown> = {};
      if (saleId) { assignedStaff.sale = saleId; assignedStaff.saleTask = saleTask || "mac_dinh"; }
      if (photoshopId) { assignedStaff.photoshop = photoshopId; assignedStaff.photoshopTask = photoshopTask || "mac_dinh"; }

      const body = {
        customerId: cid, shootDate, shootTime: timeStart,
        serviceCategory: "wedding", packageType,
        location: location || null, status: finalStatus,
        totalAmount: finalTotal, depositAmount: finalDeposit,
        discountAmount: 0,
        items: hasServices ? validLines.map(({ tempId: _t, ...rest }) => rest) : [],
        assignedStaff, notes: notes || null,
      };

      let saved: Booking;
      if (isEdit && booking) {
        saved = await fetch(`${BASE}/api/bookings/${booking.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        }).then(r => { if (!r.ok) throw new Error("Lỗi cập nhật"); return r.json(); });
      } else {
        saved = await fetch(`${BASE}/api/bookings`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        }).then(r => { if (!r.ok) throw new Error("Lỗi tạo đơn"); return r.json(); });
      }

      // ── 3. Ghi thanh toán đặt cọc nếu có ──
      if (!isEdit && finalDeposit > 0) {
        await fetch(`${BASE}/api/payments`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookingId: saved.id, amount: finalDeposit, paymentMethod: "transfer", paymentType: "deposit", notes: `Đặt cọc – ${packageType}` }),
        });
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
            {format(shootDateObj, "EEEE, dd/MM/yyyy", { locale: vi })} · {timeStart}
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

          {/* B. Lịch chụp */}
          <section className="space-y-2">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" /> B. Lịch chụp
            </h4>
            <div className="grid grid-cols-[1fr_auto_1fr] gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 block">Ngày chụp *</label>
                <Input type="date" className="h-9 text-sm" value={shootDate} onChange={e => handleShootDateChange(e.target.value)} />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1"><Clock className="w-3 h-3" /> Giờ bắt đầu</label>
                <Input type="time" className="h-9 text-sm w-28" value={timeStart} onChange={e => setTimeStart(e.target.value)} />
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

          {/* C. Dịch vụ / Job chụp */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Package2 className="w-3.5 h-3.5" /> C. Dịch vụ / Job chụp
                <span className="normal-case text-[10px] font-normal text-muted-foreground/60">(tuỳ chọn)</span>
              </h4>
              <button
                onClick={() => setLines(p => [...p, { tempId: genId(), serviceName: "", serviceId: null, serviceKey: "", price: 0, photoId: null, photoName: "", photoTask: "", makeupId: null, makeupName: "", makeupTask: "" }])}
                className="flex items-center gap-1 text-xs text-primary hover:underline font-medium"
              >
                <Plus className="w-3 h-3" /> Thêm dòng
              </button>
            </div>
            <div className="space-y-2">
              {lines.map(line => (
                <OrderLineRow key={line.tempId} line={line} photographers={photographers} makeupArtists={makeupArtists} services={allServices}
                  onChange={updated => setLines(p => p.map(l => l.tempId === line.tempId ? updated : l))}
                  onRemove={() => setLines(p => p.filter(l => l.tempId !== line.tempId))}
                />
              ))}
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
              <div className="flex justify-between items-center border-t border-border/60 pt-2">
                <span className="text-sm font-semibold">Còn lại:</span>
                <span className={`font-bold text-base ${remaining > 0 ? "text-destructive" : "text-emerald-600"}`}>{formatVND(remaining)}</span>
              </div>
            </div>
          </section>

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
}: {
  date: Date; bookings: Booking[]; isLoading: boolean;
  onBack: () => void; onPrevDay: () => void; onNextDay: () => void;
  onTimeClick: (time: string) => void; onEventClick: (b: Booking) => void;
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
type CalView = "month" | "day" | "form";

export default function CalendarPage() {
  const [calView, setCalView] = useState<CalView>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTime, setSelectedTime] = useState("07:00");
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [showLunar, setShowLunar] = useState(true);

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
    (date: Date) => bookings.filter(b => isSameDay(new Date(b.shootDate), date)),
    [bookings]
  );

  const selectedBookings = getBookingsForDay(selectedDate);
  const monthBookings = bookings.filter(b => { const d = new Date(b.shootDate); return d >= monthStart && d <= monthEnd; });

  // Handlers — month view
  const handleDayClick = useCallback((date: Date) => {
    setSelectedDate(date);
    setCurrentDate(date);
    setCalView("day");
  }, []);

  const handleEventClickFromMonth = useCallback((b: Booking) => {
    setSelectedDate(new Date(b.shootDate));
    setCurrentDate(new Date(b.shootDate));
    setEditingBooking(b);
    setCalView("form");
  }, []);

  // Handlers — day view
  const handleTimeClick = useCallback((time: string) => {
    setSelectedTime(time);
    setEditingBooking(null);
    setCalView("form");
  }, []);

  const handleEventClickFromDay = useCallback((b: Booking) => {
    setEditingBooking(b);
    setSelectedTime(b.shootTime ?? "07:00");
    setCalView("form");
  }, []);

  const handleBackToMonth = useCallback(() => {
    setCalView("month");
    setEditingBooking(null);
  }, []);

  const handleBackToDay = useCallback(() => {
    setCalView("day");
    setEditingBooking(null);
  }, []);

  const handleFormSaved = useCallback(() => {
    setCalView("day");
    setEditingBooking(null);
  }, []);

  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevDay = () => { const d = subDays(selectedDate, 1); setSelectedDate(d); setCurrentDate(d); };
  const nextDay = () => { const d = addDays(selectedDate, 1); setSelectedDate(d); setCurrentDate(d); };

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
          onClose={handleBackToDay}
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
          <Button onClick={() => { setEditingBooking(null); setSelectedTime("07:00"); setCalView("form"); }} className="gap-2 h-9">
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
