import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Timer, MapPin, CheckCircle2, LogIn, LogOut, Calendar,
  Users, AlertCircle, Clock, Plus, Settings, Loader2
} from "lucide-react";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { Button } from "@/components/ui";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const vnd = (n: number) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(n);

type LogEntry = {
  id: number;
  staffId: number;
  staffName?: string;
  type: "check_in" | "check_out";
  lat: number | null;
  lng: number | null;
  isOffsite: number;
  notes: string | null;
  createdAt: string;
};

type MyAttendance = {
  logs: LogEntry[];
  rule: { checkinStartTime: string; checkinEndTime: string; workStartTime: string; checkoutTime: string; weeklyBonusAmount: number } | null;
  bonusPenalty: { type: string; amount: number; description: string; date: string }[];
  adjustments: { id: number; type: string; amount: number; reason: string; date: string }[];
};

type AdminLog = LogEntry & { staffName: string };

export default function AttendancePage() {
  const qc = useQueryClient();
  const { effectiveIsAdmin, viewer } = useStaffAuth();
  const token = localStorage.getItem("amazingStudioToken_v2");
  const authH = { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };

  const [tab, setTab] = useState<"me" | "admin" | "rules">(effectiveIsAdmin ? "me" : "me");
  const [geoErr, setGeoErr] = useState<string | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [showAdjForm, setShowAdjForm] = useState(false);
  const [adjForm, setAdjForm] = useState({ staffId: "", type: "bonus", amount: "", reason: "", date: new Date().toISOString().slice(0, 10) });
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualForm, setManualForm] = useState({ staffId: "", type: "check_in", notes: "" });

  const fetchAuth = (url: string, opts?: RequestInit) =>
    fetch(`${BASE}${url}`, { headers: authH, ...opts }).then(r => r.json());

  const { data: myAtt } = useQuery<MyAttendance>({
    queryKey: ["attendance-me", month],
    queryFn: () => fetchAuth(`/api/attendance/me?month=${month}`),
    enabled: tab === "me",
  });

  const { data: adminLogs = [] } = useQuery<AdminLog[]>({
    queryKey: ["attendance-admin", month],
    queryFn: () => fetchAuth(`/api/attendance/admin?month=${month}`),
    enabled: tab === "admin" && effectiveIsAdmin,
  });

  type AttRules = { rule: Record<string, unknown> | null; lateRules: { id: number; minutesLateMin: number; minutesLateMax: number | null; penaltyAmount: number }[] };
  const { data: rules } = useQuery<AttRules>({
    queryKey: ["attendance-rules"],
    queryFn: () => fetchAuth(`/api/attendance/rules`),
    enabled: tab === "rules" && effectiveIsAdmin,
  });

  const checkin = useMutation({
    mutationFn: (coords: { lat: number; lng: number }) =>
      fetchAuth(`/api/attendance/check-in`, { method: "POST", body: JSON.stringify(coords) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attendance-me"] }),
  });

  const checkout = useMutation({
    mutationFn: (coords: { lat: number; lng: number }) =>
      fetchAuth(`/api/attendance/check-out`, { method: "POST", body: JSON.stringify(coords) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attendance-me"] }),
  });

  const addAdjustment = useMutation({
    mutationFn: (data: Record<string, unknown>) => fetchAuth(`/api/attendance/adjustments`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["attendance-me"] }); setShowAdjForm(false); },
  });

  const addManual = useMutation({
    mutationFn: (data: Record<string, unknown>) => fetchAuth(`/api/attendance/manual`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["attendance-admin"] }); setShowManualForm(false); },
  });

  async function doGPS(action: "checkin" | "checkout") {
    setGeoErr(null);
    setGeoLoading(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
      );
      const { latitude: lat, longitude: lng } = pos.coords;
      if (action === "checkin") await checkin.mutateAsync({ lat, lng });
      else await checkout.mutateAsync({ lat, lng });
    } catch (e: unknown) {
      setGeoErr((e as Error)?.message || "Không lấy được vị trí GPS");
    } finally {
      setGeoLoading(false);
    }
  }

  const todayLogs = (myAtt?.logs ?? []).filter(l => l.createdAt.slice(0, 10) === new Date().toISOString().slice(0, 10));
  const hasCheckedIn = todayLogs.some(l => l.type === "check_in");
  const hasCheckedOut = todayLogs.some(l => l.type === "check_out");

  const daysInMonth = (() => {
    const [y, m] = month.split("-").map(Number);
    const days = [];
    const total = new Date(y, m, 0).getDate();
    for (let d = 1; d <= total; d++) {
      const dateStr = `${month}-${String(d).padStart(2, "0")}`;
      const dayLogs = (myAtt?.logs ?? []).filter(l => l.createdAt.slice(0, 10) === dateStr);
      days.push({ date: dateStr, dayNum: d, logs: dayLogs });
    }
    return days;
  })();

  const netAdjust = (myAtt?.adjustments ?? []).reduce((s, a) => s + (a.type === "bonus" ? a.amount : -a.amount), 0);
  const netBP = (myAtt?.bonusPenalty ?? []).reduce((s, b) => s + (b.type === "bonus" ? b.amount : -b.amount), 0);

  return (
    <div className="min-h-full bg-background">
      {/* Header */}
      <div className="px-4 sm:px-6 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Timer className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Chấm công</h1>
              <p className="text-xs text-muted-foreground">Theo dõi giờ làm & chuyên cần</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-3">
          <button onClick={() => setTab("me")}
            className={`px-4 py-1.5 rounded-xl text-xs font-medium transition-colors ${tab === "me" ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground"}`}>
            Của tôi
          </button>
          {effectiveIsAdmin && (
            <button onClick={() => setTab("admin")}
              className={`px-4 py-1.5 rounded-xl text-xs font-medium transition-colors ${tab === "admin" ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground"}`}>
              <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />Toàn nhân sự</span>
            </button>
          )}
          {effectiveIsAdmin && (
            <button onClick={() => setTab("rules")}
              className={`px-4 py-1.5 rounded-xl text-xs font-medium transition-colors ${tab === "rules" ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground"}`}>
              <span className="flex items-center gap-1"><Settings className="w-3.5 h-3.5" />Quy tắc</span>
            </button>
          )}
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-4">
        {/* Month picker */}
        <div className="flex items-center gap-2">
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="border border-border rounded-xl px-3 py-1.5 text-sm bg-background focus:outline-none" />
        </div>

        {/* ── MY ATTENDANCE TAB ─────────────────────────────────────────── */}
        {tab === "me" && (
          <div className="space-y-4">
            {/* Check-in / Check-out buttons */}
            <div className="rounded-2xl border border-border bg-card p-4">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600" /> Hôm nay — {new Date().toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "numeric" })}
              </h3>
              {geoErr && (
                <div className="flex items-center gap-2 text-destructive text-xs p-2 bg-destructive/10 rounded-lg mb-3">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" /> {geoErr}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => doGPS("checkin")}
                  disabled={hasCheckedIn || geoLoading || checkin.isPending}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all font-semibold text-sm ${
                    hasCheckedIn
                      ? "border-green-300 bg-green-50 text-green-700 opacity-60"
                      : "border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-700"
                  }`}>
                  {geoLoading && !hasCheckedIn ? <Loader2 className="w-6 h-6 animate-spin" /> : <LogIn className="w-6 h-6" />}
                  {hasCheckedIn ? "✓ Đã chấm vào" : "Chấm vào"}
                </button>
                <button
                  onClick={() => doGPS("checkout")}
                  disabled={!hasCheckedIn || hasCheckedOut || geoLoading || checkout.isPending}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all font-semibold text-sm ${
                    hasCheckedOut
                      ? "border-green-300 bg-green-50 text-green-700 opacity-60"
                      : hasCheckedIn
                        ? "border-orange-300 bg-orange-50 hover:bg-orange-100 text-orange-700"
                        : "border-muted bg-muted/30 text-muted-foreground opacity-50"
                  }`}>
                  {geoLoading && hasCheckedIn && !hasCheckedOut ? <Loader2 className="w-6 h-6 animate-spin" /> : <LogOut className="w-6 h-6" />}
                  {hasCheckedOut ? "✓ Đã chấm ra" : "Chấm ra"}
                </button>
              </div>
              {todayLogs.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {todayLogs.map(l => (
                    <div key={l.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                      {l.type === "check_in" ? <LogIn className="w-3.5 h-3.5 text-blue-500" /> : <LogOut className="w-3.5 h-3.5 text-orange-500" />}
                      <span>{l.type === "check_in" ? "Vào" : "Ra"}: {new Date(l.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</span>
                      {l.isOffsite ? <span className="text-amber-600 font-medium">📍 Ngoài studio</span> : <span className="text-green-600">✓ Tại studio</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Summary */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-border bg-card p-3 text-center">
                <p className="text-2xl font-black text-blue-600">{daysInMonth.filter(d => d.logs.some(l => l.type === "check_in")).length}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Ngày công</p>
              </div>
              <div className={`rounded-xl border border-border bg-card p-3 text-center`}>
                <p className={`text-2xl font-black ${netBP + netAdjust >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {netBP + netAdjust >= 0 ? "+" : ""}{vnd(netBP + netAdjust)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Thưởng/Phạt</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-3 text-center">
                <p className="text-2xl font-black text-muted-foreground">{daysInMonth.filter(d => d.logs.some(l => l.isOffsite)).length}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Ngoài studio</p>
              </div>
            </div>

            {/* Calendar view */}
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="px-4 py-2.5 border-b flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-600" />
                <span className="font-semibold text-sm">Lịch chấm công tháng {month.slice(5)}/{month.slice(0, 4)}</span>
              </div>
              <div className="p-3">
                <div className="grid grid-cols-7 gap-1 mb-1">
                  {["CN", "T2", "T3", "T4", "T5", "T6", "T7"].map(d => (
                    <div key={d} className="text-center text-[10px] font-bold text-muted-foreground py-1">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {(() => {
                    const [y, m] = month.split("-").map(Number);
                    const firstDay = new Date(y, m - 1, 1).getDay();
                    const cells = [];
                    for (let i = 0; i < firstDay; i++) cells.push(<div key={`e${i}`} />);
                    daysInMonth.forEach(({ dayNum, logs }) => {
                      const hasIn = logs.some(l => l.type === "check_in");
                      const hasOut = logs.some(l => l.type === "check_out");
                      const isOffsite = logs.some(l => l.isOffsite);
                      cells.push(
                        <div key={dayNum} className={`aspect-square flex flex-col items-center justify-center rounded-lg text-xs font-semibold transition-colors ${
                          hasIn && hasOut ? isOffsite ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"
                            : hasIn ? "bg-blue-100 text-blue-700"
                            : "text-muted-foreground"
                        }`}>
                          <span>{dayNum}</span>
                          {hasIn && <div className="w-1 h-1 rounded-full bg-current mt-0.5" />}
                        </div>
                      );
                    });
                    return cells;
                  })()}
                </div>
                <div className="flex gap-3 mt-2 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-green-200" />Đầy đủ tại studio</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-200" />Ngoài studio</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-blue-200" />Vào chưa ra</span>
                </div>
              </div>
            </div>

            {/* Bonuses/Penalties */}
            {(myAtt?.bonusPenalty?.length ?? 0) > 0 && (
              <div className="rounded-2xl border border-border bg-card overflow-hidden">
                <div className="px-4 py-2.5 border-b font-semibold text-sm">Thưởng / Phạt trong tháng</div>
                <div className="divide-y divide-border">
                  {myAtt?.bonusPenalty?.map((bp, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <div>
                        <p className="font-medium">{bp.description}</p>
                        <p className="text-xs text-muted-foreground">{bp.date}</p>
                      </div>
                      <span className={`font-bold ${bp.type === "bonus" ? "text-green-600" : "text-red-600"}`}>
                        {bp.type === "bonus" ? "+" : "-"}{vnd(bp.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Admin adjustments section */}
            {effectiveIsAdmin && (
              <div className="rounded-2xl border border-border bg-card overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b">
                  <span className="font-semibold text-sm">Điều chỉnh thủ công</span>
                  <button onClick={() => setShowAdjForm(true)} className="text-xs text-primary hover:underline flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Thêm
                  </button>
                </div>
                {showAdjForm && (
                  <div className="p-4 space-y-3 bg-muted/20">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-muted-foreground">Nhân viên ID</label>
                        <input type="number" value={adjForm.staffId} onChange={e => setAdjForm(f => ({ ...f, staffId: e.target.value }))}
                          className="w-full border border-border rounded-lg px-2 py-1.5 text-sm bg-background focus:outline-none" placeholder="Staff ID" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Loại</label>
                        <select value={adjForm.type} onChange={e => setAdjForm(f => ({ ...f, type: e.target.value }))}
                          className="w-full border border-border rounded-lg px-2 py-1.5 text-sm bg-background focus:outline-none">
                          <option value="bonus">Thưởng</option>
                          <option value="penalty">Phạt</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Số tiền</label>
                        <input type="number" value={adjForm.amount} onChange={e => setAdjForm(f => ({ ...f, amount: e.target.value }))}
                          className="w-full border border-border rounded-lg px-2 py-1.5 text-sm bg-background focus:outline-none" placeholder="0" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Ngày</label>
                        <input type="date" value={adjForm.date} onChange={e => setAdjForm(f => ({ ...f, date: e.target.value }))}
                          className="w-full border border-border rounded-lg px-2 py-1.5 text-sm bg-background focus:outline-none" />
                      </div>
                    </div>
                    <input value={adjForm.reason} onChange={e => setAdjForm(f => ({ ...f, reason: e.target.value }))}
                      className="w-full border border-border rounded-lg px-2 py-1.5 text-sm bg-background focus:outline-none" placeholder="Lý do..." />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => addAdjustment.mutate({ staffId: parseInt(adjForm.staffId), type: adjForm.type, amount: parseFloat(adjForm.amount), reason: adjForm.reason, date: adjForm.date })}
                        disabled={!adjForm.staffId || !adjForm.amount || addAdjustment.isPending}>
                        {addAdjustment.isPending ? "Đang lưu..." : "Lưu"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setShowAdjForm(false)}>Hủy</Button>
                    </div>
                  </div>
                )}
                {(myAtt?.adjustments?.length ?? 0) === 0 && !showAdjForm && (
                  <div className="text-center py-4 text-xs text-muted-foreground">Chưa có điều chỉnh</div>
                )}
                {(myAtt?.adjustments ?? []).map(adj => (
                  <div key={adj.id} className="flex items-center justify-between px-4 py-2.5 text-sm border-t border-border">
                    <div>
                      <p className="font-medium">{adj.reason}</p>
                      <p className="text-xs text-muted-foreground">{adj.date}</p>
                    </div>
                    <span className={`font-bold ${adj.type === "bonus" ? "text-green-600" : "text-red-600"}`}>
                      {adj.type === "bonus" ? "+" : "-"}{vnd(adj.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── ADMIN TAB ────────────────────────────────────────────────── */}
        {tab === "admin" && effectiveIsAdmin && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="font-semibold text-sm">{adminLogs.length} lượt chấm công</p>
              <button onClick={() => setShowManualForm(true)} className="flex items-center gap-1 text-sm text-primary hover:underline">
                <Plus className="w-3.5 h-3.5" /> Chấm thủ công
              </button>
            </div>

            {showManualForm && (
              <div className="rounded-xl border border-border p-4 bg-muted/20 space-y-3">
                <h4 className="font-semibold text-sm">Chấm công thủ công</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Nhân viên ID *</label>
                    <input type="number" value={manualForm.staffId} onChange={e => setManualForm(f => ({ ...f, staffId: e.target.value }))}
                      className="w-full border border-border rounded-lg px-2 py-1.5 text-sm bg-background focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Loại *</label>
                    <select value={manualForm.type} onChange={e => setManualForm(f => ({ ...f, type: e.target.value }))}
                      className="w-full border border-border rounded-lg px-2 py-1.5 text-sm bg-background focus:outline-none">
                      <option value="check_in">Vào</option>
                      <option value="check_out">Ra</option>
                    </select>
                  </div>
                </div>
                <input value={manualForm.notes} onChange={e => setManualForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full border border-border rounded-lg px-2 py-1.5 text-sm bg-background focus:outline-none" placeholder="Ghi chú..." />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => addManual.mutate({ staffId: parseInt(manualForm.staffId), type: manualForm.type, notes: manualForm.notes })}
                    disabled={!manualForm.staffId || addManual.isPending}>
                    {addManual.isPending ? "Đang lưu..." : "Lưu"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowManualForm(false)}>Hủy</Button>
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30">
                    <tr>
                      <th className="text-left px-4 py-2 font-semibold text-xs text-muted-foreground">Nhân viên</th>
                      <th className="text-left px-4 py-2 font-semibold text-xs text-muted-foreground">Loại</th>
                      <th className="text-left px-4 py-2 font-semibold text-xs text-muted-foreground">Thời gian</th>
                      <th className="text-left px-4 py-2 font-semibold text-xs text-muted-foreground">Vị trí</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {adminLogs.length === 0 ? (
                      <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">Chưa có dữ liệu</td></tr>
                    ) : adminLogs.map(l => (
                      <tr key={l.id} className="hover:bg-muted/10">
                        <td className="px-4 py-2.5 font-medium">{l.staffName}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${l.type === "check_in" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"}`}>
                            {l.type === "check_in" ? <LogIn className="w-3 h-3" /> : <LogOut className="w-3 h-3" />}
                            {l.type === "check_in" ? "Vào" : "Ra"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground text-xs">
                          {new Date(l.createdAt).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="px-4 py-2.5">
                          {l.isOffsite ? (
                            <span className="flex items-center gap-1 text-xs text-amber-600"><MapPin className="w-3 h-3" />Ngoài</span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="w-3 h-3" />Studio</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── RULES TAB ────────────────────────────────────────────────── */}
        {tab === "rules" && effectiveIsAdmin && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <h3 className="font-semibold text-sm">Cấu hình quy tắc chấm công</h3>
              {rules ? (
                <div className="space-y-2 text-sm">
                  {rules.rule && (
                    <>
                      <div className="flex justify-between py-1.5 border-b border-border/50">
                        <span className="text-muted-foreground">Giờ chấm vào cho phép</span>
                        <span className="font-medium">{(rules.rule as Record<string, string>).checkinStartTime} – {(rules.rule as Record<string, string>).checkinEndTime}</span>
                      </div>
                      <div className="flex justify-between py-1.5 border-b border-border/50">
                        <span className="text-muted-foreground">Giờ bắt đầu làm</span>
                        <span className="font-medium">{(rules.rule as Record<string, string>).workStartTime}</span>
                      </div>
                      <div className="flex justify-between py-1.5 border-b border-border/50">
                        <span className="text-muted-foreground">Giờ chấm ra</span>
                        <span className="font-medium">{(rules.rule as Record<string, string>).checkoutTime}</span>
                      </div>
                      <div className="flex justify-between py-1.5">
                        <span className="text-muted-foreground">Thưởng chuyên cần tuần</span>
                        <span className="font-bold text-green-600">{vnd((rules.rule as Record<string, number>).weeklyBonusAmount ?? 0)}</span>
                      </div>
                    </>
                  )}
                  {rules.lateRules.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-3 mb-2">Quy tắc đi muộn</p>
                      <div className="space-y-1.5">
                        {rules.lateRules.map(lr => (
                          <div key={lr.id} className="flex justify-between text-sm py-1 px-2 bg-muted/20 rounded-lg">
                            <span>Muộn {lr.minutesLateMin}'{lr.minutesLateMax ? `–${lr.minutesLateMax}'` : "+"}</span>
                            <span className="font-bold text-red-600">-{vnd(lr.penaltyAmount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Chưa có cấu hình. Đang dùng giá trị mặc định.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
