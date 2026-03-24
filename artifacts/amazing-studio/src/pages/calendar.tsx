import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  convertSolarToLunar, getCanChi, getLunarMonthName, getTietKhi,
  LUNAR_HOLIDAYS, SOLAR_HOLIDAYS,
} from "@/lib/lunar";
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval,
  isSameDay, isToday, addWeeks, subWeeks, startOfWeek, endOfWeek, parseISO,
} from "date-fns";
import { vi } from "date-fns/locale";
import { formatVND } from "@/lib/utils";
import {
  ChevronLeft, ChevronRight, Calendar, Clock, Phone, Package2, Sun, Moon,
  AlertCircle, CalendarCheck, Plus, X, Check, Camera, User, Sparkles,
  ChevronDown, Trash2, Save, MapPin, CreditCard,
} from "lucide-react";
import { Button, Input } from "@/components/ui";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Types ───────────────────────────────────────────────────────────────────
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
type Staff = { id: number; name: string; role: string; isActive: boolean };
type Service = { id: number; name: string; price: number; category: string; code: string };
type ServiceOption = { key: string; name: string; price: number };
type OrderLine = {
  tempId: string; serviceName: string; serviceId: number | null; price: number;
  photoId: number | null; photoName: string; makeupId: number | null; makeupName: string;
};

const STATUS = {
  pending:     { label: "Chờ xác nhận", color: "bg-yellow-100 text-yellow-800 border-yellow-300", dot: "bg-yellow-400", bar: "bg-yellow-400" },
  confirmed:   { label: "Đã xác nhận",  color: "bg-blue-100 text-blue-800 border-blue-300",   dot: "bg-blue-500",   bar: "bg-blue-500" },
  in_progress: { label: "Đang chụp",    color: "bg-purple-100 text-purple-800 border-purple-300", dot: "bg-purple-500", bar: "bg-purple-500" },
  completed:   { label: "Hoàn thành",   color: "bg-green-100 text-green-800 border-green-300",  dot: "bg-green-500",  bar: "bg-green-500" },
  cancelled:   { label: "Đã hủy",       color: "bg-gray-100 text-gray-500 border-gray-300",    dot: "bg-gray-400",   bar: "bg-gray-400" },
} as const;

function genId() { return Math.random().toString(36).slice(2); }

// ─── Lunar helpers ────────────────────────────────────────────────────────────
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

// ─── Phone autocomplete ──────────────────────────────────────────────────────
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
              className="w-full text-left px-3 py-2 hover:bg-muted transition-colors border-b border-border/50 last:border-0 flex items-center gap-2"
              onClick={() => { onSelect(c); setOpen(false); }}
            >
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold flex-shrink-0">
                {c.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{c.name}</p>
                <p className="text-xs text-muted-foreground">{c.phone} · {c.customCode}</p>
              </div>
              {(c.totalDebt ?? 0) > 0 && (
                <span className="text-xs text-destructive font-medium flex-shrink-0">nợ {formatVND(c.totalDebt!)}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Order line row ───────────────────────────────────────────────────────────
function OrderLineRow({ line, photographers, makeupArtists, services, onChange, onRemove }: {
  line: OrderLine;
  photographers: Staff[];
  makeupArtists: Staff[];
  services: ServiceOption[];
  onChange: (u: OrderLine) => void;
  onRemove: () => void;
}) {
  const [useCustom, setUseCustom] = useState(!line.serviceId && !!line.serviceName);

  return (
    <div className="p-2.5 bg-muted/30 rounded-xl border border-border/50 space-y-2">
      {/* Service row */}
      <div className="flex gap-1.5 items-center">
        <select
          className="flex-1 h-9 border border-input rounded-lg px-2 text-sm bg-background"
          value={line.serviceId != null ? `svc-${line.serviceId}` : useCustom ? "_custom" : ""}
          onChange={e => {
            if (e.target.value === "_custom") {
              setUseCustom(true);
              onChange({ ...line, serviceId: null, serviceName: "" });
              return;
            }
            setUseCustom(false);
            const svc = services.find(s => s.key === e.target.value);
            const idNum = e.target.value.startsWith("svc-") ? parseInt(e.target.value.replace("svc-", "")) : null;
            onChange({ ...line, serviceId: idNum, serviceName: svc?.name ?? "", price: svc ? svc.price : line.price });
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
        <Input
          className="h-9 text-sm"
          placeholder="Tên dịch vụ..."
          value={line.serviceName}
          onChange={e => onChange({ ...line, serviceName: e.target.value })}
        />
      )}

      {/* Staff + price row */}
      <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5">
        <div>
          <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
            <Camera className="w-3 h-3" /> Nhiếp ảnh
          </p>
          <select
            className="w-full h-8 border border-input rounded-lg px-2 text-xs bg-background"
            value={line.photoId ?? ""}
            onChange={e => {
              const s = photographers.find(x => x.id === parseInt(e.target.value));
              onChange({ ...line, photoId: s?.id ?? null, photoName: s?.name ?? "" });
            }}
          >
            <option value="">— Chọn —</option>
            {photographers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> Makeup
          </p>
          <select
            className="w-full h-8 border border-input rounded-lg px-2 text-xs bg-background"
            value={line.makeupId ?? ""}
            onChange={e => {
              const s = makeupArtists.find(x => x.id === parseInt(e.target.value));
              onChange({ ...line, makeupId: s?.id ?? null, makeupName: s?.name ?? "" });
            }}
          >
            <option value="">— Không —</option>
            {makeupArtists.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
            <CreditCard className="w-3 h-3" /> Giá (đ)
          </p>
          <Input
            type="number"
            className="h-8 text-sm w-28"
            value={line.price || ""}
            placeholder="0"
            onChange={e => onChange({ ...line, price: parseFloat(e.target.value) || 0 })}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Show form panel ──────────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH: date comes from parent (selectedDate), form syncs via useEffect
function ShowFormPanel({
  date,
  onDateChange,
  booking,
  onClose,
  onSaved,
}: {
  date: Date;
  onDateChange: (d: Date) => void;
  booking: Booking | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!booking;

  // Customer
  const [phone, setPhone] = useState(booking?.customerPhone ?? "");
  const [customerName, setCustomerName] = useState(booking?.customerName ?? "");
  const [customerId, setCustomerId] = useState<number | null>(booking?.customerId ?? null);
  const [facebook, setFacebook] = useState("");
  const [zalo, setZalo] = useState("");
  const [showExtra, setShowExtra] = useState(false);

  // Schedule — initialized from parent `date` prop on mount (key changes ensure fresh mount per date)
  const [shootDate, setShootDateLocal] = useState(() => format(date, "yyyy-MM-dd"));
  // Derive a Date from the shootDate string for display purposes (header subtitle etc.)
  const shootDateObj = useMemo(() => {
    try { const d = parseISO(shootDate); return isNaN(d.getTime()) ? date : d; } catch { return date; }
  }, [shootDate, date]);
  const [timeStart, setTimeStart] = useState(booking?.shootTime ?? "07:00");
  const [timeEnd, setTimeEnd] = useState("17:00");
  const [location, setLocation] = useState(booking?.location ?? "");
  const [status, setStatus] = useState(booking?.status ?? "confirmed");

  // When user changes date IN the form, propagate UP to parent so calendar highlights correct day
  const handleShootDateChange = (newVal: string) => {
    setShootDateLocal(newVal);
    try {
      const parsed = parseISO(newVal);
      if (!isNaN(parsed.getTime())) onDateChange(parsed);
    } catch { /* ignore invalid input */ }
  };

  // Order lines
  const [lines, setLines] = useState<OrderLine[]>(() => {
    if (booking?.items?.length) return booking.items.map(i => ({ ...i, tempId: genId() }));
    return [{ tempId: genId(), serviceName: "", serviceId: null, price: 0, photoId: null, photoName: "", makeupId: null, makeupName: "" }];
  });

  // Payment
  const [deposit, setDeposit] = useState(booking?.depositAmount?.toString() ?? "0");
  const [notes, setNotes] = useState(booking?.notes ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: allStaff = [] } = useQuery<Staff[]>({
    queryKey: ["staff"],
    queryFn: () => fetch(`${BASE}/api/staff`).then(r => r.json()),
  });
  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ["services"],
    queryFn: () => fetch(`${BASE}/api/services`).then(r => r.json()),
  });
  const { data: pricingPackages = [] } = useQuery<{ id: number; name: string; price: number }[]>({
    queryKey: ["service-packages"],
    queryFn: () => fetch(`${BASE}/api/service-packages`).then(r => r.json()),
  });

  const photographers = allStaff.filter(s => s.role === "photographer" && s.isActive);
  const makeupArtists = allStaff.filter(s => s.role === "makeup" && s.isActive);
  const allServices: ServiceOption[] = [
    ...services.map(s => ({ key: `svc-${s.id}`, name: s.name, price: s.price })),
    ...pricingPackages.map(p => ({ key: `pkg-${p.id}`, name: p.name, price: p.price })),
  ];

  const totalAmount = lines.reduce((s, l) => s + (l.price || 0), 0);
  const depositNum = parseFloat(deposit) || 0;
  const remaining = Math.max(0, totalAmount - depositNum);

  const handleSelectCustomer = (c: Customer) => {
    setCustomerId(c.id);
    setCustomerName(c.name);
    setPhone(c.phone);
    setFacebook(c.facebook ?? "");
    setZalo(c.zalo ?? "");
  };

  const save = async () => {
    setError("");
    if (!customerName.trim()) { setError("Vui lòng nhập tên khách hàng"); return; }
    if (!phone.trim()) { setError("Vui lòng nhập số điện thoại"); return; }
    if (!shootDate) { setError("Vui lòng chọn ngày chụp"); return; }
    const validLines = lines.filter(l => l.serviceName || l.serviceId);
    if (validLines.length === 0) { setError("Vui lòng thêm ít nhất 1 dịch vụ"); return; }

    setSaving(true);
    try {
      // 1. Find or create customer
      let cid = customerId;
      if (!cid) {
        const found = await fetch(`${BASE}/api/customers?search=${encodeURIComponent(phone)}`).then(r => r.json()) as Customer[];
        const existing = found.find(c => c.phone === phone);
        if (existing) {
          cid = existing.id;
        } else {
          const nc = await fetch(`${BASE}/api/customers`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: customerName, phone, facebook, zalo, source: "walk-in" }),
          }).then(r => r.json()) as Customer;
          cid = nc.id;
        }
      }

      // 2. Build booking
      const mainSvc = validLines[0];
      const packageType = validLines.length === 1
        ? (mainSvc.serviceName || "Dịch vụ")
        : `${mainSvc.serviceName || "Dịch vụ"} (+${validLines.length - 1})`;

      const assignedStaff = Array.from(new Set([
        ...validLines.filter(l => l.photoId).map(l => l.photoId!),
        ...validLines.filter(l => l.makeupId).map(l => l.makeupId!),
      ]));

      const body = {
        customerId: cid,
        shootDate,     // ← uses the synced shootDate (single source of truth)
        shootTime: timeStart,
        serviceCategory: "wedding",
        packageType,
        location: location || null,
        status,
        totalAmount,
        depositAmount: depositNum,
        discountAmount: 0,
        items: validLines.map(({ tempId: _t, ...rest }) => rest),
        assignedStaff,
        notes: notes || null,
      };

      let saved: Booking;
      if (isEdit && booking) {
        saved = await fetch(`${BASE}/api/bookings/${booking.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).then(r => { if (!r.ok) throw new Error("Lỗi cập nhật"); return r.json(); });
      } else {
        saved = await fetch(`${BASE}/api/bookings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).then(r => { if (!r.ok) throw new Error("Lỗi tạo đơn"); return r.json(); });
      }

      // 3. Payment record
      if (!isEdit && depositNum > 0) {
        await fetch(`${BASE}/api/payments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bookingId: saved.id,
            amount: depositNum,
            paymentMethod: "transfer",
            paymentType: "deposit",
            notes: `Đặt cọc – ${packageType}`,
          }),
        });
      }

      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Có lỗi, thử lại");
    } finally {
      setSaving(false);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: () => fetch(`${BASE}/api/bookings/${booking?.id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["bookings"] }); onSaved(); },
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0 bg-gradient-to-r from-primary/5 to-transparent">
        <div>
          <p className="font-bold text-sm">{isEdit ? "✏️ Chỉnh sửa show" : "✨ Tạo show mới"}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {format(shootDateObj, "EEEE, dd/MM/yyyy", { locale: vi })}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {isEdit && (
            <button
              onClick={() => { if (confirm("Xoá show này?")) deleteMutation.mutate(); }}
              className="p-2 rounded-lg text-destructive/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-5">
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
            <PhoneAutocomplete
              value={phone}
              onChange={v => { setPhone(v); setCustomerId(null); }}
              onSelect={handleSelectCustomer}
            />
            <Input
              className="h-10"
              placeholder="Tên khách hàng *"
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
            />
            {customerId && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-1.5 rounded-lg">
                <Check className="w-3.5 h-3.5" /> Khách cũ đã tìm thấy (ID #{customerId})
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowExtra(!showExtra)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Plus className="w-3 h-3" />
              {showExtra ? "Ẩn" : "Thêm"} Facebook / Zalo
              <ChevronDown className={`w-3 h-3 transition-transform ${showExtra ? "rotate-180" : ""}`} />
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
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 block">Ngày chụp *</label>
                {/* This input is THE single source of truth for date — changes sync to parent */}
                <Input
                  type="date"
                  className="h-9 text-sm"
                  value={shootDate}
                  onChange={e => handleShootDateChange(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 block">Trạng thái</label>
                <select
                  className="w-full h-9 border border-input rounded-lg px-2 text-sm bg-background"
                  value={status}
                  onChange={e => setStatus(e.target.value)}
                >
                  <option value="pending">Chờ xác nhận</option>
                  <option value="confirmed">Đã xác nhận</option>
                  <option value="in_progress">Đang thực hiện</option>
                  <option value="completed">Hoàn thành</option>
                  <option value="cancelled">Đã hủy</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Bắt đầu
                </label>
                <Input type="time" className="h-9 text-sm" value={timeStart} onChange={e => setTimeStart(e.target.value)} />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Kết thúc
                </label>
                <Input type="time" className="h-9 text-sm" value={timeEnd} onChange={e => setTimeEnd(e.target.value)} />
              </div>
            </div>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9 h-9 text-sm" placeholder="Địa điểm (tuỳ chọn)" value={location} onChange={e => setLocation(e.target.value)} />
            </div>
          </section>

          {/* C. Dịch vụ */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Package2 className="w-3.5 h-3.5" /> C. Dịch vụ ({lines.length})
              </h4>
              <button
                onClick={() => setLines(p => [...p, { tempId: genId(), serviceName: "", serviceId: null, price: 0, photoId: null, photoName: "", makeupId: null, makeupName: "" }])}
                className="flex items-center gap-1 text-xs text-primary hover:underline font-medium"
              >
                <Plus className="w-3 h-3" /> Thêm dòng
              </button>
            </div>
            <div className="space-y-2">
              {lines.map(line => (
                <OrderLineRow
                  key={line.tempId}
                  line={line}
                  photographers={photographers}
                  makeupArtists={makeupArtists}
                  services={allServices}
                  onChange={updated => setLines(p => p.map(l => l.tempId === line.tempId ? updated : l))}
                  onRemove={() => setLines(p => p.filter(l => l.tempId !== line.tempId))}
                />
              ))}
            </div>
          </section>

          {/* D. Tiền */}
          <section className="space-y-2">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5" /> D. Tiền
            </h4>
            <div className="bg-muted/40 rounded-xl p-3 space-y-2.5 border border-border/50">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Tổng tiền:</span>
                <span className="font-bold text-base">{formatVND(totalAmount)}</span>
              </div>
              <div className="flex justify-between items-center gap-3">
                <span className="text-sm text-muted-foreground flex-shrink-0">Đặt cọc:</span>
                <Input
                  type="number"
                  className="h-8 text-sm text-right w-40"
                  value={deposit}
                  placeholder="0"
                  onChange={e => setDeposit(e.target.value)}
                />
              </div>
              <div className="flex justify-between items-center border-t border-border/60 pt-2">
                <span className="text-sm font-semibold">Còn lại:</span>
                <span className={`font-bold text-base ${remaining > 0 ? "text-destructive" : "text-emerald-600"}`}>
                  {formatVND(remaining)}
                </span>
              </div>
            </div>
          </section>

          {/* Notes */}
          <textarea
            className="w-full border border-input rounded-xl px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
            rows={2}
            placeholder="Ghi chú nội bộ..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t flex-shrink-0 bg-background/80">
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

// ─── Calendar day cell ────────────────────────────────────────────────────────
function DayCell({
  date, bookings, isSelected, isOtherMonth, onDayClick, onCreateClick,
}: {
  date: Date;
  bookings: Booking[];
  isSelected: boolean;
  isOtherMonth?: boolean;
  onDayClick: (date: Date) => void;
  onCreateClick: (date: Date) => void;
}) {
  const info = useMemo(() => getLunarInfo(date), [date]);
  const { lunar, tietKhi, solarHoliday, lunarHoliday } = info;
  const isSun = date.getDay() === 0;
  const isSat = date.getDay() === 6;
  const isLunarNew = lunar.day === 1;
  const isRam = lunar.day === 15;

  return (
    <div
      className={[
        "group relative min-h-[90px] p-1 cursor-pointer transition-all select-none",
        "border-r border-b border-border/60 last:border-r-0",
        isSelected ? "bg-primary/5" : "hover:bg-muted/40",
        isOtherMonth ? "opacity-35" : "",
      ].join(" ")}
      onClick={() => onDayClick(date)}
    >
      {/* Day number */}
      <div className="flex items-start justify-between mb-0.5">
        <div className="flex flex-col items-center">
          <span className={[
            "text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full",
            isToday(date) ? "bg-primary text-primary-foreground font-bold" : "",
            isSun && !isToday(date) ? "text-red-500" : "",
            isSat && !isToday(date) ? "text-blue-600" : "",
            isSelected && !isToday(date) ? "ring-2 ring-primary ring-offset-1" : "",
          ].join(" ")}>
            {date.getDate()}
          </span>
          <span className={[
            "text-[9px] leading-none mt-0.5",
            lunarHoliday ? "text-red-500 font-bold" : isLunarNew ? "text-primary font-semibold" : "text-muted-foreground",
          ].join(" ")}>
            {isLunarNew ? `${lunar.day}/${lunar.month}` : lunar.day}
          </span>
        </div>
        {/* Booking count badge + create button */}
        <div className="flex items-center gap-0.5 mt-0.5">
          {bookings.length > 0 && (
            <span className="text-[10px] bg-primary/15 text-primary font-bold px-1.5 rounded-full">{bookings.length}</span>
          )}
          <button
            onClick={e => { e.stopPropagation(); onCreateClick(date); }}
            className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:scale-110 transition-all"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Tiết khí / holiday */}
      {tietKhi && <div className="text-[8px] text-orange-500 truncate mb-0.5">✦ {tietKhi}</div>}
      {(solarHoliday || lunarHoliday) && (
        <div className="text-[8px] text-red-500 font-medium truncate mb-0.5">{solarHoliday || lunarHoliday}</div>
      )}
      {isRam && !lunarHoliday && <div className="text-[8px] text-amber-600 mb-0.5">Rằm</div>}

      {/* Event chips — Google Calendar style: colored full-width bars */}
      <div className="space-y-0.5 overflow-hidden">
        {bookings.slice(0, 3).map(b => {
          const st = STATUS[b.status as keyof typeof STATUS] ?? STATUS.pending;
          const mainPhoto = b.items?.[0]?.photoName;
          return (
            <button
              key={b.id}
              onClick={e => { e.stopPropagation(); onCreateClick(date); }}
              className={`w-full text-left text-[9px] sm:text-[10px] rounded px-1.5 py-0.5 truncate font-medium border ${st.color} hover:opacity-80 transition-opacity`}
            >
              {b.shootTime?.slice(0, 5)} {b.customerName}
              {mainPhoto ? ` · ${mainPhoto.split(" ").slice(-1)[0]}` : ""}
            </button>
          );
        })}
        {bookings.length > 3 && (
          <div className="text-[9px] text-muted-foreground pl-1">+{bookings.length - 3} nữa</div>
        )}
      </div>
    </div>
  );
}

// ─── Week view row ────────────────────────────────────────────────────────────
function WeekRow({ date, bookings, isSelected, onDayClick, onBookingClick, onCreateClick }: {
  date: Date;
  bookings: Booking[];
  isSelected: boolean;
  onDayClick: (d: Date) => void;
  onBookingClick: (b: Booking) => void;
  onCreateClick: (d: Date) => void;
}) {
  const info = useMemo(() => getLunarInfo(date), [date]);
  const { lunar, solarHoliday, lunarHoliday, tietKhi } = info;
  const isSun = date.getDay() === 0;
  const isLunarNew = lunar.day === 1;
  const isRam = lunar.day === 15;

  return (
    <div
      className={[
        "group flex gap-0 border-b border-border/60 min-h-[72px] cursor-pointer",
        isToday(date) ? "bg-primary/3" : isSelected ? "bg-primary/5" : "hover:bg-muted/30",
      ].join(" ")}
      onClick={() => onDayClick(date)}
    >
      {/* Date column */}
      <div className="flex flex-col items-center justify-start pt-2 px-2 min-w-[56px] border-r border-border/60">
        <span className={`text-xs font-semibold mb-0.5 ${isSun ? "text-red-500" : "text-muted-foreground"}`}>
          {format(date, "EEE", { locale: vi }).toUpperCase()}
        </span>
        <span className={[
          "text-lg font-bold w-9 h-9 flex items-center justify-center rounded-full",
          isToday(date) ? "bg-primary text-primary-foreground" : isSun ? "text-red-500" : "text-foreground",
          isSelected && !isToday(date) ? "ring-2 ring-primary" : "",
        ].join(" ")}>
          {date.getDate()}
        </span>
        <span className={`text-[9px] mt-0.5 ${isLunarNew || isRam ? "text-primary font-bold" : "text-muted-foreground"}`}>
          {isLunarNew ? `1/${lunar.month}` : isRam ? `15/${lunar.month}` : `AL ${lunar.day}`}
        </span>
        {tietKhi && <span className="text-[8px] text-orange-500 text-center">{tietKhi}</span>}
        {(solarHoliday || lunarHoliday) && <span className="text-[8px] text-red-500 text-center leading-tight">{solarHoliday || lunarHoliday}</span>}
      </div>

      {/* Events */}
      <div className="flex-1 py-1.5 px-2">
        {bookings.length === 0 ? (
          <button
            onClick={e => { e.stopPropagation(); onCreateClick(date); }}
            className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-xs text-primary hover:underline mt-1"
          >
            <Plus className="w-3 h-3" /> Tạo show
          </button>
        ) : (
          <div className="space-y-1">
            {bookings.map(b => {
              const st = STATUS[b.status as keyof typeof STATUS] ?? STATUS.pending;
              const mainPhoto = b.items?.[0]?.photoName;
              const mainMakeup = b.items?.[0]?.makeupName;
              return (
                <button
                  key={b.id}
                  onClick={e => { e.stopPropagation(); onBookingClick(b); }}
                  className={`w-full text-left rounded-lg px-3 py-1.5 border text-xs hover:shadow-sm transition-all ${st.color}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold">{b.customerName}</span>
                    <span className="flex items-center gap-1 font-mono"><Clock className="w-3 h-3" />{b.shootTime?.slice(0, 5)}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 opacity-80 text-[10px] flex-wrap">
                    <span className="flex items-center gap-1"><Package2 className="w-3 h-3" />{b.packageType}</span>
                    {mainPhoto && <span className="flex items-center gap-1"><Camera className="w-3 h-3" />{mainPhoto.split(" ").slice(-1)[0]}</span>}
                    {mainMakeup && <span className="flex items-center gap-1"><Sparkles className="w-3 h-3" />{mainMakeup.split(" ").slice(-1)[0]}</span>}
                    {b.remainingAmount > 0 && <span className="text-destructive font-semibold">nợ {formatVND(b.remainingAmount)}</span>}
                  </div>
                </button>
              );
            })}
            <button
              onClick={e => { e.stopPropagation(); onCreateClick(date); }}
              className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-xs text-primary hover:underline mt-0.5"
            >
              <Plus className="w-3 h-3" /> Thêm show
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Day agenda (right panel view mode) ──────────────────────────────────────
function DayAgenda({ date, bookings, isLoading, onCreateClick, onBookingClick }: {
  date: Date;
  bookings: Booking[];
  isLoading: boolean;
  onCreateClick: () => void;
  onBookingClick: (b: Booking) => void;
}) {
  const { lunar, tietKhi, solarHoliday, lunarHoliday } = useMemo(() => getLunarInfo(date), [date]);

  return (
    <>
      <div className="px-4 py-3 border-b flex-shrink-0 bg-gradient-to-r from-primary/5 to-transparent">
        <div className="flex items-center justify-between mb-1">
          <div>
            <div className="flex items-center gap-2">
              <Sun className="w-4 h-4 text-orange-400" />
              <span className="font-bold text-sm capitalize">{format(date, "EEEE, dd/MM/yyyy", { locale: vi })}</span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Moon className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-xs text-muted-foreground">
                Ngày {lunar.day} {getLunarMonthName(lunar.month, lunar.leap)} {getCanChi(lunar.year)}
              </span>
            </div>
            {tietKhi && <p className="text-xs text-orange-600 mt-0.5">✦ Tiết: {tietKhi}</p>}
            {(solarHoliday || lunarHoliday) && (
              <p className="text-xs text-red-600 font-semibold mt-0.5">
                <AlertCircle className="w-3 h-3 inline mr-1" />{solarHoliday || lunarHoliday}
              </p>
            )}
          </div>
          <Button size="sm" onClick={onCreateClick} className="gap-1 h-8 text-xs">
            <Plus className="w-3 h-3" /> Tạo show
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Đang tải...</div>
        ) : bookings.length === 0 ? (
          <div className="flex flex-col items-center text-muted-foreground py-10">
            <Calendar className="w-12 h-12 opacity-20 mb-3" />
            <p className="text-sm">Ngày này trống lịch</p>
            <button onClick={onCreateClick} className="mt-3 text-sm text-primary hover:underline flex items-center gap-1">
              <Plus className="w-4 h-4" /> Tạo show cho ngày này
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {[...bookings].sort((a, b) => (a.shootTime ?? "").localeCompare(b.shootTime ?? "")).map(b => {
              const st = STATUS[b.status as keyof typeof STATUS] ?? STATUS.pending;
              const mainPhoto = b.items?.[0]?.photoName;
              const mainMakeup = b.items?.[0]?.makeupName;
              return (
                <button
                  key={b.id}
                  onClick={() => onBookingClick(b)}
                  className="w-full text-left rounded-xl border bg-card p-3 hover:shadow-md hover:border-primary/30 transition-all group"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${st.color}`}>{st.label}</span>
                    <span className="flex items-center gap-1 text-xs font-bold text-primary">
                      <Clock className="w-3 h-3" />{b.shootTime?.slice(0, 5) ?? "--:--"}
                    </span>
                  </div>
                  <p className="font-bold text-sm mb-1">{b.customerName}</p>
                  <div className="space-y-0.5 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5"><Phone className="w-3 h-3" />{b.customerPhone}</div>
                    <div className="flex items-center gap-1.5"><Package2 className="w-3 h-3" />{b.packageType}</div>
                    {mainPhoto && <div className="flex items-center gap-1.5"><Camera className="w-3 h-3" />{mainPhoto}</div>}
                    {mainMakeup && <div className="flex items-center gap-1.5"><Sparkles className="w-3 h-3" />{mainMakeup}</div>}
                    {b.remainingAmount > 0 && (
                      <div className="flex items-center gap-1.5 font-semibold text-destructive">
                        <AlertCircle className="w-3 h-3" /> Còn nợ {formatVND(b.remainingAmount)}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-primary opacity-0 group-hover:opacity-100 mt-1.5">Nhấn để chỉnh sửa →</p>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

// ─── Main Calendar Page ───────────────────────────────────────────────────────
type FormMode = "view" | "create" | "edit";

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<"month" | "week">("month");
  const [showLunar, setShowLunar] = useState(true);

  // *** SINGLE SOURCE OF TRUTH FOR DATE ***
  // selectedDate drives: right panel header, form date input, submitted booking date
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [formMode, setFormMode] = useState<FormMode>("view");
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);

  const { data: bookings = [], isLoading } = useQuery<Booking[]>({
    queryKey: ["bookings"],
    queryFn: () => fetch(`${BASE}/api/bookings`).then(r => r.json()),
    staleTime: 30_000,
  });

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 });
  const daysInWeek = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const getBookingsForDay = useCallback(
    (date: Date) => bookings.filter(b => isSameDay(new Date(b.shootDate), date)),
    [bookings]
  );

  const selectedBookings = getBookingsForDay(selectedDate);

  const monthLunar = useMemo(() =>
    convertSolarToLunar(1, currentDate.getMonth() + 1, currentDate.getFullYear()),
    [currentDate]
  );
  const monthBookings = bookings.filter(b => {
    const d = new Date(b.shootDate);
    return d >= monthStart && d <= monthEnd;
  });

  const firstDayOfMonth = monthStart.getDay();

  // ── Actions ──
  // selectDay: click on a calendar day → update selectedDate (syncs form date via useEffect)
  const selectDay = useCallback((date: Date) => {
    setSelectedDate(date);
    setCurrentDate(date); // keep calendar month in sync if needed
  }, []);

  // openCreate: click empty area OR "+" button → open form for that date
  const openCreate = useCallback((date: Date) => {
    setSelectedDate(date);         // single source — form will pick this up
    setEditingBooking(null);
    setFormMode("create");
  }, []);

  // openEdit: click existing booking event
  const openEdit = useCallback((booking: Booking) => {
    setSelectedDate(new Date(booking.shootDate));
    setEditingBooking(booking);
    setFormMode("edit");
  }, []);

  const closeForm = useCallback(() => {
    setFormMode("view");
    setEditingBooking(null);
  }, []);

  const prev = () => view === "month"
    ? setCurrentDate(subMonths(currentDate, 1))
    : setCurrentDate(subWeeks(currentDate, 1));
  const next = () => view === "month"
    ? setCurrentDate(addMonths(currentDate, 1))
    : setCurrentDate(addWeeks(currentDate, 1));

  return (
    <div className="flex flex-col gap-4">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Lịch Chụp</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {monthBookings.length} show tháng này · Dương lịch & Âm lịch
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* View switch */}
          <div className="flex bg-muted rounded-lg p-0.5 text-sm">
            <button
              onClick={() => setView("month")}
              className={`px-3 py-1.5 rounded-md font-medium transition-all flex items-center gap-1.5 ${view === "month" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Calendar className="w-3.5 h-3.5" /> Tháng
            </button>
            <button
              onClick={() => setView("week")}
              className={`px-3 py-1.5 rounded-md font-medium transition-all flex items-center gap-1.5 ${view === "week" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <CalendarCheck className="w-3.5 h-3.5" /> Tuần
            </button>
          </div>
          {/* Lunar toggle */}
          <button
            onClick={() => setShowLunar(!showLunar)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${showLunar ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}
          >
            <Moon className="w-3.5 h-3.5" /> Âm lịch
          </button>
          <Button onClick={() => openCreate(selectedDate)} className="gap-2 h-9">
            <Plus className="w-4 h-4" /> Tạo show
          </Button>
        </div>
      </div>

      {/* ── Main layout ── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4">
        {/* ── Calendar grid ── */}
        <div className="bg-card rounded-2xl border shadow-sm overflow-hidden">
          {/* Month/Week nav */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-card to-muted/10">
            <div>
              <div className="flex items-center gap-2">
                <Sun className="w-4 h-4 text-orange-400" />
                <span className="text-base font-bold capitalize">
                  {format(currentDate, view === "month" ? "MMMM yyyy" : "'Tuần của' dd/MM/yyyy", { locale: vi })}
                </span>
              </div>
              {showLunar && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Moon className="w-3 h-3 text-indigo-400" />
                  {getLunarMonthName(monthLunar.month, monthLunar.leap)} {getCanChi(monthLunar.year)} ({monthLunar.year})
                </p>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={prev} className="w-8 h-8 rounded-lg border bg-background hover:bg-muted flex items-center justify-center transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => { const t = new Date(); setCurrentDate(t); setSelectedDate(t); }}
                className="px-3 h-8 rounded-lg border bg-background hover:bg-muted text-sm font-medium transition-colors"
              >
                Hôm nay
              </button>
              <button onClick={next} className="w-8 h-8 rounded-lg border bg-background hover:bg-muted flex items-center justify-center transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Month view */}
          {view === "month" && (
            <div>
              {/* Day headers */}
              <div className="grid grid-cols-7 border-b border-border/60">
                {["CN", "T2", "T3", "T4", "T5", "T6", "T7"].map((d, i) => (
                  <div key={d} className={`text-center text-xs font-bold py-2 border-r border-border/60 last:border-r-0 ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-600" : "text-muted-foreground"}`}>{d}</div>
                ))}
              </div>
              {/* Grid */}
              <div className="grid grid-cols-7">
                {Array.from({ length: firstDayOfMonth }).map((_, i) => {
                  const d = new Date(monthStart); d.setDate(d.getDate() - (firstDayOfMonth - i));
                  return (
                    <DayCell key={`p${i}`} date={d} bookings={getBookingsForDay(d)}
                      isSelected={isSameDay(d, selectedDate)} isOtherMonth
                      onDayClick={selectDay} onCreateClick={openCreate} />
                  );
                })}
                {daysInMonth.map(day => (
                  <DayCell key={day.toISOString()} date={day} bookings={getBookingsForDay(day)}
                    isSelected={isSameDay(day, selectedDate)}
                    onDayClick={date => { selectDay(date); if (formMode !== "create" && formMode !== "edit") setFormMode("view"); }}
                    onCreateClick={openCreate} />
                ))}
                {Array.from({ length: (7 - ((firstDayOfMonth + daysInMonth.length) % 7)) % 7 }).map((_, i) => {
                  const d = new Date(monthEnd); d.setDate(d.getDate() + i + 1);
                  return (
                    <DayCell key={`n${i}`} date={d} bookings={getBookingsForDay(d)}
                      isSelected={isSameDay(d, selectedDate)} isOtherMonth
                      onDayClick={selectDay} onCreateClick={openCreate} />
                  );
                })}
              </div>
            </div>
          )}

          {/* Week view */}
          {view === "week" && (
            <div>
              {daysInWeek.map(day => (
                <WeekRow
                  key={day.toISOString()}
                  date={day}
                  bookings={getBookingsForDay(day)}
                  isSelected={isSameDay(day, selectedDate)}
                  onDayClick={selectDay}
                  onBookingClick={openEdit}
                  onCreateClick={openCreate}
                />
              ))}
            </div>
          )}

          {/* Legend */}
          {showLunar && (
            <div className="px-4 py-2 border-t bg-muted/20 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><Moon className="w-3 h-3 text-indigo-400" /> Âm lịch</span>
              <span className="flex items-center gap-1">✦ Tiết khí</span>
              <span className="flex items-center gap-1"><span className="text-primary font-bold">1/x</span> Mùng 1</span>
              <span className="flex items-center gap-1 text-red-500">● Ngày lễ</span>
              <span className="flex items-center gap-1 ml-auto text-primary">Hover ô → nút + để tạo show</span>
            </div>
          )}
        </div>

        {/* ── Right panel ── */}
        <div
          className="bg-card rounded-2xl border shadow-sm overflow-hidden flex flex-col"
          style={{ height: "calc(100vh - 200px)", minHeight: "500px" }}
        >
          {formMode === "view" ? (
            <DayAgenda
              date={selectedDate}           // ← single source of truth
              bookings={selectedBookings}
              isLoading={isLoading}
              onCreateClick={() => openCreate(selectedDate)}
              onBookingClick={openEdit}
            />
          ) : (
            <ShowFormPanel
              key={`${formMode}-${format(selectedDate, "yyyy-MM-dd")}-${editingBooking?.id ?? "new"}`}
              date={selectedDate}
              onDateChange={setSelectedDate}
              booking={formMode === "edit" ? editingBooking : null}
              onClose={closeForm}
              onSaved={closeForm}
            />
          )}
        </div>
      </div>
    </div>
  );
}
