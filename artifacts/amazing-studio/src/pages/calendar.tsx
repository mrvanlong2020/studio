import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  convertSolarToLunar, getCanChi, getLunarMonthName, getTietKhi, LUNAR_HOLIDAYS, SOLAR_HOLIDAYS,
} from "@/lib/lunar";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval,
  isSameDay, isToday, addWeeks, subWeeks, startOfWeek, endOfWeek } from "date-fns";
import { vi } from "date-fns/locale";
import { formatVND } from "@/lib/utils";
import {
  ChevronLeft, ChevronRight, Calendar, Clock, Phone, Package2, Sun, Moon, AlertCircle,
  CalendarCheck, Plus, X, Check, Search, Camera, User, Sparkles, ChevronDown,
  Trash2, Save, MapPin, CreditCard,
} from "lucide-react";
import { Button, Input } from "@/components/ui";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Types ──────────────────────────────────────────────────────────────────
type Booking = {
  id: number; orderCode: string; customerId: number; customerName: string; customerPhone: string;
  shootDate: string; shootTime: string; serviceCategory: string; packageType: string;
  location: string | null; status: string; items: OrderLine[]; totalAmount: number;
  depositAmount: number; paidAmount: number; remainingAmount: number; assignedStaff: number[];
  notes: string | null;
};
type Customer = { id: number; name: string; phone: string; email?: string; facebook?: string; zalo?: string; avatar?: string; customCode?: string; totalDebt?: number };
type Staff = { id: number; name: string; role: string; isActive: boolean };
type Service = { id: number; name: string; price: number; category: string; code: string };
type OrderLine = {
  tempId: string; serviceName: string; serviceId: number | null; price: number;
  photoId: number | null; photoName: string; makeupId: number | null; makeupName: string;
};

type FormMode = "view" | "create" | "edit";

// ─── Status ──────────────────────────────────────────────────────────────────
const STATUS_MAP: Record<string, { label: string; color: string; dot: string }> = {
  pending:     { label: "Chờ xác nhận", color: "bg-yellow-100 text-yellow-800 border-yellow-200", dot: "bg-yellow-400" },
  confirmed:   { label: "Đã xác nhận",  color: "bg-blue-100 text-blue-800 border-blue-200",   dot: "bg-blue-500" },
  in_progress: { label: "Đang chụp",    color: "bg-purple-100 text-purple-800 border-purple-200", dot: "bg-purple-500" },
  completed:   { label: "Hoàn thành",   color: "bg-green-100 text-green-800 border-green-200",  dot: "bg-green-500" },
  cancelled:   { label: "Đã hủy",       color: "bg-red-100 text-red-800 border-red-200",       dot: "bg-red-400" },
};

function genId() { return Math.random().toString(36).slice(2); }

// ─── Lunar helpers ───────────────────────────────────────────────────────────
function useLunarDay(date: Date) {
  return useMemo(() => {
    const d = date.getDate(), m = date.getMonth() + 1, y = date.getFullYear();
    const lunar = convertSolarToLunar(d, m, y);
    const tietKhi = getTietKhi(d, m, y);
    return { lunar, tietKhi, solarHoliday: SOLAR_HOLIDAYS[`${d}-${m}`] ?? null, lunarHoliday: LUNAR_HOLIDAYS[`${lunar.day}-${lunar.month}`] ?? null };
  }, [date]);
}

// ─── Phone Autocomplete ──────────────────────────────────────────────────────
function PhoneAutocomplete({ value, onChange, onSelect }: {
  value: string; onChange: (v: string) => void; onSelect: (c: Customer) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data: results = [] } = useQuery<Customer[]>({
    queryKey: ["customer-search", value],
    queryFn: () => fetch(`${BASE}/api/customers?search=${encodeURIComponent(value)}`).then(r => r.json()),
    enabled: value.length >= 3,
    staleTime: 5000,
  });

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          className="pl-9 h-10"
          placeholder="Nhập số điện thoại..."
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
              className="w-full text-left px-3 py-2.5 hover:bg-muted transition-colors border-b border-border/50 last:border-0"
              onClick={() => { onSelect(c); setOpen(false); }}
            >
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold flex-shrink-0">
                  {c.name.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-semibold">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.phone} · {c.customCode}</p>
                </div>
                {(c.totalDebt ?? 0) > 0 && (
                  <span className="ml-auto text-xs text-destructive font-medium">nợ {formatVND(c.totalDebt ?? 0)}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Order Line Row ──────────────────────────────────────────────────────────
function OrderLineRow({ line, photographers, makeupArtists, services, onChange, onRemove }: {
  line: OrderLine;
  photographers: Staff[];
  makeupArtists: Staff[];
  services: { key: string; name: string; price: number }[];
  onChange: (updated: OrderLine) => void;
  onRemove: () => void;
}) {
  const [customName, setCustomName] = useState(false);

  return (
    <div className="p-2 bg-muted/30 rounded-xl border border-border/50 space-y-1.5">
      {/* Row 1: Service dropdown */}
      <div className="flex gap-1.5 items-center">
        <select
          className="flex-1 h-8 border border-input rounded-lg px-2 text-sm bg-background"
          value={line.serviceId != null ? `svc-${line.serviceId}` : customName ? "_custom" : ""}
          onChange={e => {
            if (e.target.value === "_custom") { setCustomName(true); onChange({ ...line, serviceId: null, serviceName: "" }); return; }
            setCustomName(false);
            const svc = services.find(s => s.key === e.target.value);
            const idNum = e.target.value.startsWith("svc-") ? parseInt(e.target.value.replace("svc-", "")) : null;
            onChange({ ...line, serviceId: idNum, serviceName: svc?.name ?? "", price: svc?.price ?? line.price });
          }}
        >
          <option value="">-- Chọn dịch vụ --</option>
          {services.map(s => <option key={s.key} value={s.key}>{s.name}</option>)}
          <option value="_custom">✏️ Tự nhập...</option>
        </select>
        <button onClick={onRemove} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors flex-shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      {customName && (
        <Input className="h-8 text-sm" placeholder="Tên dịch vụ..." value={line.serviceName} onChange={e => onChange({ ...line, serviceName: e.target.value })} />
      )}

      {/* Row 2: Photo, Makeup, Price */}
      <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5">
        <div>
          <p className="text-[10px] text-muted-foreground mb-0.5 flex items-center gap-1"><Camera className="w-3 h-3" /> Nhiếp ảnh</p>
          <select
            className="w-full h-8 border border-input rounded-lg px-2 text-xs bg-background"
            value={line.photoId ?? ""}
            onChange={e => {
              const s = photographers.find(x => x.id === parseInt(e.target.value));
              onChange({ ...line, photoId: s?.id ?? null, photoName: s?.name ?? "" });
            }}
          >
            <option value="">-- Chọn --</option>
            {photographers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground mb-0.5 flex items-center gap-1"><Sparkles className="w-3 h-3" /> Makeup</p>
          <select
            className="w-full h-8 border border-input rounded-lg px-2 text-xs bg-background"
            value={line.makeupId ?? ""}
            onChange={e => {
              const s = makeupArtists.find(x => x.id === parseInt(e.target.value));
              onChange({ ...line, makeupId: s?.id ?? null, makeupName: s?.name ?? "" });
            }}
          >
            <option value="">-- Không --</option>
            {makeupArtists.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground mb-0.5 flex items-center gap-1"><CreditCard className="w-3 h-3" /> Giá (đ)</p>
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

// ─── Show Form Panel ─────────────────────────────────────────────────────────
function ShowFormPanel({
  date, booking, onClose, onSaved,
}: {
  date: Date;
  booking: Booking | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!booking;

  // Customer state
  const [phone, setPhone] = useState(booking?.customerPhone ?? "");
  const [customerName, setCustomerName] = useState(booking?.customerName ?? "");
  const [customerId, setCustomerId] = useState<number | null>(booking?.customerId ?? null);
  const [facebook, setFacebook] = useState("");
  const [zalo, setZalo] = useState(phone);
  const [showContactExtra, setShowContactExtra] = useState(false);

  // Schedule state
  const [shootDate, setShootDate] = useState(format(date, "yyyy-MM-dd"));
  const [timeStart, setTimeStart] = useState(booking?.shootTime ?? "07:00");
  const [timeEnd, setTimeEnd] = useState("17:00");
  const [location, setLocation] = useState(booking?.location ?? "");

  // Order lines
  const [lines, setLines] = useState<OrderLine[]>(() => {
    if (booking?.items?.length) return booking.items.map(i => ({ ...i, tempId: genId() }));
    return [{ tempId: genId(), serviceName: "", serviceId: null, price: 0, photoId: null, photoName: "", makeupId: null, makeupName: "" }];
  });

  // Payment
  const [deposit, setDeposit] = useState(booking?.depositAmount?.toString() ?? "0");
  const [status, setStatus] = useState(booking?.status ?? "confirmed");
  const [notes, setNotes] = useState(booking?.notes ?? "");

  // Errors
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
  const { data: pricingPackages = [] } = useQuery<{ id: number; name: string; price: number; groupId: number | null }[]>({
    queryKey: ["service-packages"],
    queryFn: () => fetch(`${BASE}/api/service-packages`).then(r => r.json()),
  });

  const photographers = allStaff.filter(s => s.role === "photographer" && s.isActive);
  const makeupArtists = allStaff.filter(s => s.role === "makeup" && s.isActive);

  // Merge services + pricing packages into a flat list for the dropdown
  // Use prefix "svc-" and "pkg-" to distinguish
  type ServiceOption = { key: string; name: string; price: number };
  const allServices: ServiceOption[] = [
    ...services.map(s => ({ key: `svc-${s.id}`, name: s.name, price: s.price })),
    ...pricingPackages.map(p => ({ key: `pkg-${p.id}`, name: p.name, price: p.price })),
  ];

  const totalAmount = lines.reduce((s, l) => s + (l.price || 0), 0);
  const depositNum = parseFloat(deposit) || 0;
  const remaining = Math.max(0, totalAmount - depositNum);

  const addLine = () => setLines(p => [...p, { tempId: genId(), serviceName: "", serviceId: null, price: 0, photoId: null, photoName: "", makeupId: null, makeupName: "" }]);
  const removeLine = (tid: string) => setLines(p => p.filter(l => l.tempId !== tid));
  const updateLine = (tid: string, updated: OrderLine) => setLines(p => p.map(l => l.tempId === tid ? updated : l));

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
        const search = await fetch(`${BASE}/api/customers?search=${encodeURIComponent(phone)}`).then(r => r.json()) as Customer[];
        const existing = search.find(c => c.phone === phone);
        if (existing) {
          cid = existing.id;
        } else {
          const newC = await fetch(`${BASE}/api/customers`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: customerName, phone, facebook, zalo, source: "walk-in" }),
          }).then(r => r.json()) as Customer;
          cid = newC.id;
        }
      }

      // 2. Build order data
      const mainService = validLines[0];
      const packageType = validLines.length === 1
        ? (mainService.serviceName || "Dịch vụ")
        : `${mainService.serviceName || "Dịch vụ"} (+${validLines.length - 1})`;

      const assignedStaff = Array.from(new Set([
        ...validLines.filter(l => l.photoId).map(l => l.photoId!),
        ...validLines.filter(l => l.makeupId).map(l => l.makeupId!),
      ]));

      const bookingBody = {
        customerId: cid,
        shootDate,
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

      let savedBooking: Booking;
      if (isEdit && booking) {
        savedBooking = await fetch(`${BASE}/api/bookings/${booking.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bookingBody),
        }).then(r => { if (!r.ok) throw new Error("Lỗi cập nhật đơn"); return r.json(); });
      } else {
        savedBooking = await fetch(`${BASE}/api/bookings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bookingBody),
        }).then(r => { if (!r.ok) throw new Error("Lỗi tạo đơn"); return r.json(); });
      }

      // 3. Create payment record if deposit > 0 and not edit
      if (!isEdit && depositNum > 0) {
        await fetch(`${BASE}/api/payments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bookingId: savedBooking.id,
            amount: depositNum,
            paymentMethod: "transfer",
            paymentType: "deposit",
            notes: `Đặt cọc ${packageType}`,
          }),
        });
      }

      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra, thử lại");
    } finally {
      setSaving(false);
    }
  };

  const deleteBookingMutation = useMutation({
    mutationFn: () => fetch(`${BASE}/api/bookings/${booking?.id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["bookings"] }); onSaved(); },
  });

  return (
    <div className="flex flex-col h-full overflow-hidden bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0 bg-gradient-to-r from-primary/5 to-card">
        <div>
          <h3 className="font-bold text-sm">
            {isEdit ? "✏️ Chỉnh sửa show" : "✨ Tạo show mới"}
          </h3>
          <p className="text-xs text-muted-foreground">
            {format(date, "EEEE, dd/MM/yyyy", { locale: vi })}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {isEdit && (
            <button
              onClick={() => { if (confirm("Xoá show này?")) deleteBookingMutation.mutate(); }}
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

      {/* Body — scrollable */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 rounded-xl text-destructive text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
            </div>
          )}

          {/* ── A. Khách hàng ── */}
          <section>
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" /> Khách hàng
            </h4>
            <div className="space-y-2">
              <PhoneAutocomplete value={phone} onChange={v => { setPhone(v); setCustomerId(null); }} onSelect={handleSelectCustomer} />
              <Input
                className="h-10"
                placeholder="Tên khách hàng *"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
              />
              {customerId && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 rounded-lg">
                  <Check className="w-3.5 h-3.5" /> Khách cũ · ID {customerId}
                </div>
              )}
              <button
                type="button"
                onClick={() => setShowContactExtra(!showContactExtra)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Plus className="w-3 h-3" />
                {showContactExtra ? "Ẩn" : "Thêm"} Facebook / Zalo
                <ChevronDown className={`w-3 h-3 transition-transform ${showContactExtra ? "rotate-180" : ""}`} />
              </button>
              {showContactExtra && (
                <div className="grid grid-cols-2 gap-2">
                  <Input className="h-9 text-sm" placeholder="Link Facebook" value={facebook} onChange={e => setFacebook(e.target.value)} />
                  <Input className="h-9 text-sm" placeholder="Zalo" value={zalo} onChange={e => setZalo(e.target.value)} />
                </div>
              )}
            </div>
          </section>

          {/* ── B. Lịch chụp ── */}
          <section>
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" /> Lịch chụp
            </h4>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 block">Ngày</label>
                <Input type="date" className="h-9 text-sm" value={shootDate} onChange={e => setShootDate(e.target.value)} />
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
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1"><Clock className="w-3 h-3" /> Giờ bắt đầu</label>
                <Input type="time" className="h-9 text-sm" value={timeStart} onChange={e => setTimeStart(e.target.value)} />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1"><Clock className="w-3 h-3" /> Giờ kết thúc</label>
                <Input type="time" className="h-9 text-sm" value={timeEnd} onChange={e => setTimeEnd(e.target.value)} />
              </div>
            </div>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9 h-9 text-sm" placeholder="Địa điểm (tuỳ chọn)" value={location} onChange={e => setLocation(e.target.value)} />
            </div>
          </section>

          {/* ── C. Dịch vụ ── */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Package2 className="w-3.5 h-3.5" /> Dịch vụ ({lines.length})
              </h4>
              <button onClick={addLine} className="flex items-center gap-1 text-xs text-primary hover:underline">
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
                  onChange={updated => updateLine(line.tempId, updated)}
                  onRemove={() => removeLine(line.tempId)}
                />
              ))}
            </div>
          </section>

          {/* ── D. Thanh toán ── */}
          <section>
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5" /> Thanh toán
            </h4>
            <div className="bg-muted/30 rounded-xl p-3 space-y-2 border border-border/50">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Tổng tiền:</span>
                <span className="font-bold text-base">{formatVND(totalAmount)}</span>
              </div>
              <div className="flex justify-between items-center gap-3">
                <span className="text-sm text-muted-foreground flex-shrink-0">Đặt cọc:</span>
                <Input
                  type="number"
                  className="h-8 text-sm text-right w-36"
                  value={deposit}
                  onChange={e => setDeposit(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="flex justify-between items-center border-t border-border/50 pt-2">
                <span className="text-sm font-semibold">Còn lại:</span>
                <span className={`font-bold text-base ${remaining > 0 ? "text-destructive" : "text-emerald-600"}`}>
                  {formatVND(remaining)}
                </span>
              </div>
            </div>
          </section>

          {/* Notes */}
          <section>
            <textarea
              className="w-full border border-input rounded-xl px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
              rows={2}
              placeholder="Ghi chú nội bộ (tuỳ chọn)..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </section>
        </div>
      </div>

      {/* Save button */}
      <div className="px-4 py-3 border-t border-border flex-shrink-0">
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

// ─── Day Cell ────────────────────────────────────────────────────────────────
function DayCell({
  date, bookings, isSelected, onClick, onCreateClick, isOtherMonth,
}: {
  date: Date;
  bookings: Booking[];
  isSelected: boolean;
  onClick: () => void;
  onCreateClick: (date: Date) => void;
  isOtherMonth?: boolean;
}) {
  const { lunar, tietKhi, solarHoliday, lunarHoliday } = useLunarDay(date);
  const isSunday = date.getDay() === 0;
  const isSaturday = date.getDay() === 6;
  const isLunarNew = lunar.day === 1;
  const isRam = lunar.day === 15;
  const isHoliday = solarHoliday || lunarHoliday;

  return (
    <div
      onClick={onClick}
      className={`group relative min-h-[80px] sm:min-h-[100px] p-1.5 rounded-xl border cursor-pointer transition-all
        ${isSelected ? "border-primary bg-primary/5 ring-1 ring-primary shadow-sm" : "border-border hover:border-primary/40 hover:bg-muted/30"}
        ${isOtherMonth ? "opacity-40" : ""}
      `}
    >
      {/* Solar date */}
      <div className="flex items-start justify-between mb-0.5">
        <span className={`text-sm font-bold w-6 h-6 flex items-center justify-center rounded-full transition-all
          ${isToday(date) ? "bg-primary text-primary-foreground shadow" : ""}
          ${isSunday && !isToday(date) ? "text-red-500" : ""}
          ${isSaturday && !isToday(date) ? "text-blue-500" : ""}
        `}>
          {date.getDate()}
        </span>
        <div className="flex items-center gap-0.5">
          {bookings.length > 0 && (
            <span className="text-[10px] bg-primary/15 text-primary font-bold px-1 rounded-full">{bookings.length}</span>
          )}
          <button
            onClick={e => { e.stopPropagation(); onCreateClick(date); }}
            className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center transition-all hover:scale-110"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Lunar */}
      <div className="flex items-center gap-1 mb-0.5">
        <span className={`text-[9px] leading-tight font-medium ${lunarHoliday ? "text-red-500" : isLunarNew ? "text-primary font-bold" : "text-muted-foreground"}`}>
          {isLunarNew ? `${lunar.day}/${lunar.month}${lunar.leap ? "N" : ""}` : lunar.day}
          {tietKhi && <span className="ml-0.5 text-[8px] text-orange-500">✦</span>}
        </span>
        {(isLunarNew || isRam) && (
          <span className={`text-[8px] px-0.5 rounded ${isRam ? "bg-yellow-100 text-yellow-700" : "bg-blue-100 text-blue-700"}`}>
            {isRam ? "Rằm" : "Mùng 1"}
          </span>
        )}
      </div>

      {tietKhi && <div className="text-[8px] text-orange-500 font-medium truncate mb-0.5">{tietKhi}</div>}
      {isHoliday && <div className="text-[8px] text-red-500 font-semibold truncate leading-tight">{solarHoliday || lunarHoliday}</div>}

      {/* Booking chips */}
      <div className="space-y-0.5 overflow-hidden">
        {bookings.slice(0, 2).map(b => {
          const mainPhoto = b.items?.[0]?.photoName;
          return (
            <div key={b.id} className={`text-[9px] sm:text-[10px] truncate rounded px-1 py-0.5 border shadow-sm flex items-center gap-1 ${STATUS_MAP[b.status]?.color ?? "bg-gray-100 text-gray-800 border-gray-200"}`}>
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_MAP[b.status]?.dot ?? "bg-gray-400"}`} />
              <span className="truncate font-medium">
                {b.shootTime?.slice(0, 5)} {b.customerName}
                {mainPhoto ? ` · ${mainPhoto.split(" ").pop()}` : ""}
              </span>
            </div>
          );
        })}
        {bookings.length > 2 && (
          <div className="text-[9px] text-muted-foreground text-center">+{bookings.length - 2}</div>
        )}
      </div>
    </div>
  );
}

// ─── Week View Row ────────────────────────────────────────────────────────────
function WeekViewRow({ date, bookings, isSelected, onClick, onBookingClick, onCreateClick }: {
  date: Date; bookings: Booking[]; isSelected: boolean;
  onClick: () => void; onBookingClick: (b: Booking) => void; onCreateClick: (date: Date) => void;
}) {
  const { lunar, solarHoliday, lunarHoliday, tietKhi } = useLunarDay(date);
  const isSunday = date.getDay() === 0;
  const isLunarNew = lunar.day === 1;
  const isRam = lunar.day === 15;

  return (
    <div
      onClick={onClick}
      className={`flex gap-3 p-3 rounded-xl border cursor-pointer transition-all hover:shadow-sm group
        ${isSelected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-primary/30"}
        ${isToday(date) ? "bg-accent/20" : ""}
      `}
    >
      <div className="flex flex-col items-center justify-start min-w-[48px]">
        <span className={`text-xs font-medium ${isSunday ? "text-red-500" : "text-muted-foreground"}`}>
          {format(date, "EEE", { locale: vi }).toUpperCase()}
        </span>
        <span className={`text-xl font-bold w-9 h-9 flex items-center justify-center rounded-full mt-0.5
          ${isToday(date) ? "bg-primary text-primary-foreground" : isSunday ? "text-red-500" : "text-foreground"}`}>
          {date.getDate()}
        </span>
        <span className={`text-[10px] mt-0.5 font-medium ${isLunarNew || isRam ? "text-primary font-bold" : "text-muted-foreground"}`}>
          ÂL {isLunarNew ? `1/${lunar.month}` : isRam ? `15/${lunar.month}` : lunar.day}
        </span>
        {tietKhi && <span className="text-[9px] text-orange-500 mt-0.5">{tietKhi}</span>}
        {(solarHoliday || lunarHoliday) && <span className="text-[9px] text-red-500 text-center leading-tight mt-0.5">{solarHoliday || lunarHoliday}</span>}
      </div>

      <div className="flex-1 min-h-[64px]">
        <div className="flex items-center justify-between mb-1">
          {bookings.length === 0 && <p className="text-muted-foreground text-xs italic mt-2">Trống lịch</p>}
          <button
            onClick={e => { e.stopPropagation(); onCreateClick(date); }}
            className="ml-auto opacity-0 group-hover:opacity-100 flex items-center gap-1 text-xs text-primary hover:underline transition-opacity"
          >
            <Plus className="w-3 h-3" /> Tạo show
          </button>
        </div>
        <div className="space-y-1.5">
          {bookings.map(b => {
            const mainPhoto = b.items?.[0]?.photoName;
            const mainMakeup = b.items?.[0]?.makeupName;
            return (
              <button
                key={b.id}
                onClick={e => { e.stopPropagation(); onBookingClick(b); }}
                className={`w-full text-left rounded-xl px-3 py-2 border text-xs hover:shadow-md transition-all ${STATUS_MAP[b.status]?.color ?? "bg-gray-100 text-gray-800 border-gray-200"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold">{b.customerName}</span>
                  <span className="font-medium flex items-center gap-1"><Clock className="w-3 h-3" />{b.shootTime?.slice(0, 5)}</span>
                </div>
                <div className="flex items-center gap-3 mt-0.5 opacity-80 flex-wrap">
                  <span className="flex items-center gap-1"><Package2 className="w-3 h-3" />{b.packageType}</span>
                  {mainPhoto && <span className="flex items-center gap-1"><Camera className="w-3 h-3" />{mainPhoto.split(" ").pop()}</span>}
                  {mainMakeup && <span className="flex items-center gap-1"><Sparkles className="w-3 h-3" />{mainMakeup.split(" ").pop()}</span>}
                  {b.remainingAmount > 0 && (
                    <span className="text-destructive font-semibold">nợ {formatVND(b.remainingAmount)}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main Calendar Page ───────────────────────────────────────────────────────
export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [view, setView] = useState<"month" | "week">("month");
  const [showLunar, setShowLunar] = useState(true);

  const [formMode, setFormMode] = useState<FormMode>("view");
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [formDate, setFormDate] = useState(new Date());

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

  const getBookingsForDay = useCallback((date: Date) =>
    bookings.filter(b => isSameDay(new Date(b.shootDate), date)), [bookings]);

  const selectedBookings = getBookingsForDay(selectedDate);

  const selectedLunar = useMemo(() => {
    const d = selectedDate.getDate(), m = selectedDate.getMonth() + 1, y = selectedDate.getFullYear();
    return convertSolarToLunar(d, m, y);
  }, [selectedDate]);

  const monthLunar = useMemo(() => {
    return convertSolarToLunar(1, currentDate.getMonth() + 1, currentDate.getFullYear());
  }, [currentDate]);

  const firstDayOfMonth = monthStart.getDay();

  const openCreate = (date: Date) => {
    setFormDate(date);
    setSelectedDate(date);
    setEditingBooking(null);
    setFormMode("create");
  };
  const openEdit = (booking: Booking) => {
    setFormDate(new Date(booking.shootDate));
    setSelectedDate(new Date(booking.shootDate));
    setEditingBooking(booking);
    setFormMode("edit");
  };
  const closeForm = () => { setFormMode("view"); setEditingBooking(null); };
  const onFormSaved = () => closeForm();

  const prev = () => view === "month" ? setCurrentDate(subMonths(currentDate, 1)) : setCurrentDate(subWeeks(currentDate, 1));
  const next = () => view === "month" ? setCurrentDate(addMonths(currentDate, 1)) : setCurrentDate(addWeeks(currentDate, 1));

  const monthBookings = bookings.filter(b => {
    const bd = new Date(b.shootDate);
    return bd >= monthStart && bd <= monthEnd;
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Lịch Chụp</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {monthBookings.length} show tháng này · Dương lịch & Âm lịch
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-muted rounded-lg p-0.5 text-sm">
            <button onClick={() => setView("month")} className={`px-3 py-1.5 rounded-md font-medium transition-all flex items-center gap-1.5 ${view === "month" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              <Calendar className="w-3.5 h-3.5" /> Tháng
            </button>
            <button onClick={() => setView("week")} className={`px-3 py-1.5 rounded-md font-medium transition-all flex items-center gap-1.5 ${view === "week" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              <CalendarCheck className="w-3.5 h-3.5" /> Tuần
            </button>
          </div>
          <button onClick={() => setShowLunar(!showLunar)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${showLunar ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>
            <Moon className="w-3.5 h-3.5" /> Âm lịch
          </button>
          <Button onClick={() => openCreate(new Date())} className="gap-2 h-9">
            <Plus className="w-4 h-4" /> Tạo show
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* ── Calendar Grid ── */}
        <div className="xl:col-span-2 bg-card rounded-2xl border shadow-sm overflow-hidden">
          {/* Calendar Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b bg-gradient-to-r from-card to-muted/20">
            <div>
              <div className="flex items-center gap-2">
                <Sun className="w-4 h-4 text-orange-400" />
                <span className="text-lg font-bold capitalize">
                  {format(currentDate, view === "month" ? "MMMM yyyy" : "'Tuần của' dd/MM/yyyy", { locale: vi })}
                </span>
              </div>
              {showLunar && (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Moon className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-xs text-muted-foreground">
                    {getLunarMonthName(monthLunar.month, monthLunar.leap)} {getCanChi(monthLunar.year)} ({monthLunar.year})
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={prev} className="w-8 h-8 rounded-lg border bg-background hover:bg-muted flex items-center justify-center"><ChevronLeft className="w-4 h-4" /></button>
              <button onClick={() => { setCurrentDate(new Date()); setSelectedDate(new Date()); }} className="px-3 h-8 rounded-lg border bg-background hover:bg-muted text-sm font-medium">Hôm nay</button>
              <button onClick={next} className="w-8 h-8 rounded-lg border bg-background hover:bg-muted flex items-center justify-center"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>

          {/* Month View */}
          {view === "month" && (
            <div className="p-3">
              <div className="grid grid-cols-7 text-center mb-2">
                {["CN", "T2", "T3", "T4", "T5", "T6", "T7"].map((d, i) => (
                  <div key={d} className={`text-xs font-bold py-1.5 ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-muted-foreground"}`}>{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: firstDayOfMonth }).map((_, i) => {
                  const d = new Date(monthStart); d.setDate(d.getDate() - (firstDayOfMonth - i));
                  return <DayCell key={`p${i}`} date={d} bookings={getBookingsForDay(d)} isSelected={isSameDay(d, selectedDate)} onClick={() => setSelectedDate(d)} onCreateClick={openCreate} isOtherMonth />;
                })}
                {daysInMonth.map(day => (
                  <DayCell key={day.toISOString()} date={day} bookings={getBookingsForDay(day)} isSelected={isSameDay(day, selectedDate)} onClick={() => { setSelectedDate(day); if (formMode === "view") setFormMode("view"); }} onCreateClick={openCreate} />
                ))}
                {Array.from({ length: (7 - ((firstDayOfMonth + daysInMonth.length) % 7)) % 7 }).map((_, i) => {
                  const d = new Date(monthEnd); d.setDate(d.getDate() + i + 1);
                  return <DayCell key={`n${i}`} date={d} bookings={getBookingsForDay(d)} isSelected={isSameDay(d, selectedDate)} onClick={() => setSelectedDate(d)} onCreateClick={openCreate} isOtherMonth />;
                })}
              </div>
            </div>
          )}

          {/* Week View */}
          {view === "week" && (
            <div className="p-3 space-y-2">
              {daysInWeek.map(day => (
                <WeekViewRow
                  key={day.toISOString()}
                  date={day}
                  bookings={getBookingsForDay(day)}
                  isSelected={isSameDay(day, selectedDate)}
                  onClick={() => setSelectedDate(day)}
                  onBookingClick={openEdit}
                  onCreateClick={openCreate}
                />
              ))}
            </div>
          )}

          {showLunar && (
            <div className="px-4 py-2 border-t bg-muted/20 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><Moon className="w-3 h-3 text-indigo-400" /> Âm lịch</span>
              <span className="flex items-center gap-1"><span className="text-orange-500">✦</span> Tiết khí</span>
              <span className="flex items-center gap-1"><span className="text-primary font-bold">1/x</span> Mùng 1</span>
              <span className="flex items-center gap-1"><span className="text-red-500">●</span> Ngày lễ</span>
              <span className="flex items-center gap-1 ml-auto"><Plus className="w-3 h-3 text-primary" /> hover ô để tạo nhanh</span>
            </div>
          )}
        </div>

        {/* ── Right Panel ── */}
        <div className="bg-card rounded-2xl border shadow-sm overflow-hidden flex flex-col" style={{ maxHeight: "calc(100vh - 160px)" }}>
          {formMode === "view" ? (
            /* Day view panel */
            <>
              <div className="px-4 py-3 bg-gradient-to-r from-primary/10 to-card border-b flex-shrink-0">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <Sun className="w-4 h-4 text-orange-400" />
                    <span className="font-bold text-sm">{format(selectedDate, "EEEE, dd/MM/yyyy", { locale: vi })}</span>
                  </div>
                  <Button size="sm" onClick={() => openCreate(selectedDate)} className="gap-1 h-7 text-xs">
                    <Plus className="w-3 h-3" /> Tạo show
                  </Button>
                </div>
                {showLunar && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Moon className="w-3.5 h-3.5 text-indigo-400" />
                    Ngày {selectedLunar.day} {getLunarMonthName(selectedLunar.month, selectedLunar.leap)} {getCanChi(selectedLunar.year)}
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-3">
                {isLoading ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">Đang tải...</div>
                ) : selectedBookings.length === 0 ? (
                  <div className="text-center py-10 flex flex-col items-center text-muted-foreground">
                    <Calendar className="w-12 h-12 mb-3 opacity-20" />
                    <p className="text-sm">Ngày này trống lịch</p>
                    <button onClick={() => openCreate(selectedDate)} className="mt-3 text-sm text-primary hover:underline flex items-center gap-1">
                      <Plus className="w-4 h-4" /> Tạo show cho ngày này
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedBookings
                      .sort((a, b) => (a.shootTime ?? "").localeCompare(b.shootTime ?? ""))
                      .map(booking => {
                        const s = STATUS_MAP[booking.status] ?? STATUS_MAP.pending;
                        const mainPhoto = booking.items?.[0]?.photoName;
                        const mainMakeup = booking.items?.[0]?.makeupName;
                        return (
                          <button
                            key={booking.id}
                            onClick={() => openEdit(booking)}
                            className="w-full text-left rounded-xl border bg-card p-3 hover:shadow-md hover:border-primary/30 transition-all group"
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${s.color}`}>{s.label}</span>
                              <span className="flex items-center gap-1 text-xs font-bold text-primary"><Clock className="w-3 h-3" />{booking.shootTime?.slice(0, 5) ?? "--:--"}</span>
                            </div>
                            <p className="font-bold text-sm mb-1">{booking.customerName}</p>
                            <div className="space-y-0.5 text-xs text-muted-foreground">
                              <div className="flex items-center gap-1.5"><Phone className="w-3 h-3" />{booking.customerPhone}</div>
                              <div className="flex items-center gap-1.5"><Package2 className="w-3 h-3" />{booking.packageType}</div>
                              {mainPhoto && <div className="flex items-center gap-1.5"><Camera className="w-3 h-3" />{mainPhoto}</div>}
                              {mainMakeup && <div className="flex items-center gap-1.5"><Sparkles className="w-3 h-3" />{mainMakeup}</div>}
                              {booking.remainingAmount > 0 && (
                                <div className="flex items-center gap-1.5 font-semibold text-destructive">
                                  <AlertCircle className="w-3 h-3" />Còn nợ {formatVND(booking.remainingAmount)}
                                </div>
                              )}
                            </div>
                            <p className="text-xs text-primary opacity-0 group-hover:opacity-100 mt-1.5 transition-opacity">Nhấn để chỉnh sửa →</p>
                          </button>
                        );
                      })}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Show Form */
            <ShowFormPanel
              date={formDate}
              booking={formMode === "edit" ? editingBooking : null}
              onClose={closeForm}
              onSaved={onFormSaved}
            />
          )}
        </div>
      </div>
    </div>
  );
}
