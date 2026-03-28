import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Timer, MapPin, CheckCircle2, LogIn, LogOut, Calendar,
  Users, AlertCircle, Clock, Plus, Settings, Loader2, QrCode,
  X, CameraOff, Camera, Trash2, ChevronDown
} from "lucide-react";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { Button } from "@/components/ui";
import jsQR from "jsqr";
import QRCode from "qrcode";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const vnd = (n: number) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(n);

const authH = () => {
  const token = localStorage.getItem("amazingStudioToken_v2");
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
};

const fetchAuth = (url: string, opts?: RequestInit) =>
  fetch(`${BASE}${url}`, { headers: authH(), ...opts }).then(async r => {
    const d = await r.json();
    if (!r.ok) throw new Error(d?.error || "Lỗi kết nối");
    return d;
  });

type LogEntry = {
  id: number;
  staffId: number;
  staffName?: string;
  type: "check_in" | "check_out";
  method?: string;
  lat: number | null;
  lng: number | null;
  distanceM: number | null;
  isOffsite: boolean;
  notes: string | null;
  localTime?: string;
  localDate?: string;
  createdAt: string;
};

type MyAttendance = {
  logs: LogEntry[];
  bonusPenalty: { type: string; amount: number; description: string; date: string }[];
  adjustments: { id: number; type: string; amount: number; reason: string; date: string }[];
  totalDays: number;
  onTimeCount: number;
  onTimeRate: number;
  earnedBonus: number;
  penalty: number;
  net: number;
  checkInTo?: string;
};

type LateRule = {
  id?: number;
  lateFromTime: string;
  lateToTime: string | null;
  penaltyAmount: number | null;
};

type AttRules = {
  rule: {
    id?: number;
    name?: string;
    checkinStartTime: string;
    checkinEndTime: string;
    workStartTime?: string;
    checkoutTime?: string;
    weeklyBonusAmount: number;
    isActive?: number;
  } | null;
  lateRules: LateRule[];
};

type AdminLog = LogEntry & { staffName: string };

type StaffInfo = { id: number; name: string; role: string };

// ─── QR Scanner component ────────────────────────────────────────────────────
function QrScanner({ onScan, onClose }: { onScan: (data: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraErr, setCameraErr] = useState<string | null>(null);

  const startScan = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch {
      setCameraErr("Không thể mở camera. Hãy cho phép truy cập camera trong trình duyệt.");
    }
  }, []);

  const stopScan = useCallback(() => {
    cancelAnimationFrame(animRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    startScan();
    return stopScan;
  }, [startScan, stopScan]);

  useEffect(() => {
    if (cameraErr) return;
    const tick = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) {
        animRef.current = requestAnimationFrame(tick);
        return;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
      if (code?.data) {
        onScan(code.data);
        stopScan();
        return;
      }
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [cameraErr, onScan, stopScan]);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm bg-background rounded-2xl overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="font-semibold text-sm flex items-center gap-2"><QrCode className="w-4 h-4" /> Quét mã QR</span>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="relative bg-black aspect-square overflow-hidden">
          {cameraErr ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center text-white">
              <CameraOff className="w-10 h-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{cameraErr}</p>
            </div>
          ) : (
            <>
              <video ref={videoRef} className="w-full h-full object-cover" playsInline muted autoPlay />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-52 h-52 border-4 border-white rounded-2xl opacity-60" />
              </div>
            </>
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>
        <div className="px-4 py-3 text-center">
          <p className="text-xs text-muted-foreground">Đặt mã QR vào khung hình để chấm công</p>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AttendancePage() {
  const qc = useQueryClient();
  const { effectiveIsAdmin } = useStaffAuth();

  const [tab, setTab] = useState<"me" | "admin" | "rules">("me");
  const [geoErr, setGeoErr] = useState<string | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [checkMsg, setCheckMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [month, setMonth] = useState(() => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 7));
  const [showQr, setShowQr] = useState(false);
  const [qrAction, setQrAction] = useState<"checkin" | "checkout">("checkin");

  // Admin adjustments form
  const [showAdjForm, setShowAdjForm] = useState(false);
  const [adjForm, setAdjForm] = useState({ staffId: "", type: "bonus", amount: "", reason: "", date: new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10) });
  const [adjViewStaffId, setAdjViewStaffId] = useState<string>("");

  // Admin manual check form
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualForm, setManualForm] = useState({ staffId: "", type: "check_in", notes: "" });

  // Rules edit state
  const [editingRules, setEditingRules] = useState(false);
  const [ruleForm, setRuleForm] = useState({ name: "Mặc định", checkInFrom: "07:30", checkInTo: "09:00", weeklyOnTimeBonus: "50000" });
  const [lateRules, setLateRules] = useState<LateRule[]>([]);

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: myAtt, isLoading: myLoading } = useQuery<MyAttendance>({
    queryKey: ["attendance-me", month],
    queryFn: () => fetchAuth(`/api/attendance/me?month=${month}`),
    enabled: tab === "me",
  });

  const { data: adminLogs = [] } = useQuery<AdminLog[]>({
    queryKey: ["attendance-admin", month],
    queryFn: () => fetchAuth(`/api/attendance/admin?month=${month}`),
    enabled: tab === "admin" && effectiveIsAdmin,
  });

  const { data: staffList = [] } = useQuery<StaffInfo[]>({
    queryKey: ["staff-list"],
    queryFn: () => fetchAuth(`/api/staff`),
    enabled: effectiveIsAdmin,
  });

  // Static QR URL - không phụ thuộc API
  const staticQrUrl = `${window.location.origin}${BASE}/attendance/check-in`;

  const { data: adminAdjustments = [] } = useQuery<{ id: number; type: string; amount: number; reason: string | null; date: string }[]>({
    queryKey: ["attendance-adjustments-admin", adjViewStaffId, month],
    queryFn: () => fetchAuth(`/api/attendance/adjustments?staffId=${adjViewStaffId}&month=${month}`),
    enabled: effectiveIsAdmin && !!adjViewStaffId,
  });

  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const [qrDownloading, setQrDownloading] = useState(false);

  // Render QR từ static URL
  useEffect(() => {
    if (!qrCanvasRef.current) return;
    QRCode.toCanvas(qrCanvasRef.current, staticQrUrl, {
      width: 200, margin: 2, color: { dark: "#1e1b4b", light: "#ffffff" },
    }).catch(() => {});
  }, [staticQrUrl]);

  const handleDownloadQr = async () => {
    if (!qrCanvasRef.current) return;
    setQrDownloading(true);
    try {
      const canvas = qrCanvasRef.current;
      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = `amazing-studio-qr-${new Date().toISOString().slice(0, 10)}.png`;
      link.click();
    } finally {
      setQrDownloading(false);
    }
  };

  const handleCopyQrLink = async () => {
    try {
      await navigator.clipboard.writeText(staticQrUrl);
      alert("Đã copy link QR!");
    } catch (err) {
      console.error("Copy error:", err);
    }
  };

  const { data: rules, isLoading: rulesLoading } = useQuery<AttRules>({
    queryKey: ["attendance-rules"],
    queryFn: () => fetchAuth(`/api/attendance/rules`),
    enabled: tab === "rules" && effectiveIsAdmin,
  });

  // Sync rules into local edit state when loaded
  useEffect(() => {
    if (rules) {
      if (rules.rule) {
        setRuleForm({
          name: (rules.rule.name as string) ?? "Mặc định",
          checkInFrom: rules.rule.checkinStartTime ?? "07:30",
          checkInTo: rules.rule.checkinEndTime ?? "09:00",
          weeklyOnTimeBonus: String(rules.rule.weeklyBonusAmount ?? 50000),
        });
      }
      setLateRules(rules.lateRules ?? []);
    }
  }, [rules]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const checkin = useMutation({
    mutationFn: (coords: { lat?: number; lng?: number; qrPayload?: string }) =>
      fetchAuth(`/api/attendance/check-in`, { method: "POST", body: JSON.stringify(coords) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance-me"] });
      setCheckMsg({ ok: true, text: "✓ Check-in thành công!" });
      setTimeout(() => setCheckMsg(null), 3000);
    },
    onError: (e: Error) => {
      setCheckMsg({ ok: false, text: e.message });
      setTimeout(() => setCheckMsg(null), 4000);
    },
  });

  const checkout = useMutation({
    mutationFn: (coords: { lat?: number; lng?: number }) =>
      fetchAuth(`/api/attendance/check-out`, { method: "POST", body: JSON.stringify(coords) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance-me"] });
      setCheckMsg({ ok: true, text: "✓ Check-out thành công!" });
      setTimeout(() => setCheckMsg(null), 3000);
    },
    onError: (e: Error) => {
      setCheckMsg({ ok: false, text: e.message });
      setTimeout(() => setCheckMsg(null), 4000);
    },
  });

  const saveRules = useMutation({
    mutationFn: (body: { name: string; checkInFrom: string; checkInTo: string; weeklyOnTimeBonus: string; lateRules: LateRule[] }) =>
      fetchAuth(`/api/attendance/rules`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance-rules"] });
      setEditingRules(false);
    },
  });

  const addAdjustment = useMutation({
    mutationFn: (data: Record<string, unknown>) => fetchAuth(`/api/attendance/adjustments`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance-me"] });
      qc.invalidateQueries({ queryKey: ["attendance-admin"] });
      setShowAdjForm(false);
      setAdjForm({ staffId: "", type: "bonus", amount: "", reason: "", date: new Date().toISOString().slice(0, 10) });
    },
  });

  const addManual = useMutation({
    mutationFn: (data: Record<string, unknown>) => fetchAuth(`/api/attendance/manual`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance-admin"] });
      setShowManualForm(false);
      setManualForm({ staffId: "", type: "check_in", notes: "" });
    },
  });

  // ── GPS actions ────────────────────────────────────────────────────────────
  async function doGPS(action: "checkin" | "checkout") {
    setGeoErr(null);
    setGeoLoading(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 12000, enableHighAccuracy: true })
      );
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      if (action === "checkin") await checkin.mutateAsync({ lat, lng });
      else await checkout.mutateAsync({ lat, lng });
      void accuracy;
    } catch (e: unknown) {
      setGeoErr((e as Error)?.message ?? "Không lấy được vị trí GPS");
    } finally {
      setGeoLoading(false);
    }
  }

  // ── QR scanned ─────────────────────────────────────────────────────────────
  async function handleQrScan(data: string) {
    setShowQr(false);
    setGeoLoading(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 12000, enableHighAccuracy: true })
      );
      const { latitude: lat, longitude: lng } = pos.coords;
      if (qrAction === "checkin") await checkin.mutateAsync({ lat, lng });
      else await checkout.mutateAsync({ lat, lng });
    } catch (e: unknown) {
      setGeoErr((e as Error)?.message ?? "Lỗi khi lấy GPS sau khi quét QR");
    } finally {
      setGeoLoading(false);
    }
  }

  // ── Derived data ───────────────────────────────────────────────────────────
  // Compute today in VN timezone (UTC+7) to correctly match localDate from server
  const todayStr = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  const todayLogs = (myAtt?.logs ?? []).filter(l => (l.localDate ?? l.createdAt.slice(0, 10)) === todayStr);
  const hasCheckedIn = todayLogs.some(l => l.type === "check_in");
  const hasCheckedOut = todayLogs.some(l => l.type === "check_out");

  const daysInMonth = (() => {
    const [y, m] = month.split("-").map(Number);
    const total = new Date(y, m, 0).getDate();
    return Array.from({ length: total }, (_, i) => {
      const d = i + 1;
      const dateStr = `${month}-${String(d).padStart(2, "0")}`;
      const dayLogs = (myAtt?.logs ?? []).filter(l => (l.localDate ?? l.createdAt.slice(0, 10)) === dateStr);
      return { date: dateStr, dayNum: d, logs: dayLogs };
    });
  })();

  // Per-staff summary for admin tab
  const staffSummary = (() => {
    const map = new Map<number, { name: string; checkIns: AdminLog[]; checkOuts: AdminLog[] }>();
    for (const l of adminLogs) {
      const sid = l.staffId;
      const name = l.staffName ?? `#${sid}`;
      if (!map.has(sid)) map.set(sid, { name, checkIns: [], checkOuts: [] });
      if (l.type === "check_in") map.get(sid)!.checkIns.push(l);
      else map.get(sid)!.checkOuts.push(l);
    }
    return Array.from(map.entries()).map(([id, v]) => ({ id, ...v }));
  })();

  const inputCls = "w-full border border-border rounded-lg px-2.5 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary";

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

        <div className="flex gap-1 mt-3">
          {(["me"] as const).map(t => (
            <button key={t} onClick={() => setTab("me")}
              className={`px-4 py-1.5 rounded-xl text-xs font-medium transition-colors ${tab === "me" ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground"}`}>
              Của tôi
            </button>
          ))}
          {effectiveIsAdmin && (
            <>
              <button onClick={() => setTab("admin")}
                className={`px-4 py-1.5 rounded-xl text-xs font-medium transition-colors ${tab === "admin" ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground"}`}>
                <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />Toàn nhân sự</span>
              </button>
              <button onClick={() => setTab("rules")}
                className={`px-4 py-1.5 rounded-xl text-xs font-medium transition-colors ${tab === "rules" ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground"}`}>
                <span className="flex items-center gap-1"><Settings className="w-3.5 h-3.5" />Quy tắc</span>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-4">
        {/* Month picker */}
        <div className="flex items-center gap-2">
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="border border-border rounded-xl px-3 py-1.5 text-sm bg-background focus:outline-none" />
        </div>

        {/* ── MY ATTENDANCE TAB ──────────────────────────────────────────── */}
        {tab === "me" && (
          <div className="space-y-4">
            {/* Check-in / Check-out panel */}
            <div className="rounded-2xl border border-border bg-card p-4">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600" />
                Hôm nay — {new Date().toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "numeric" })}
              </h3>

              {/* Messages */}
              {checkMsg && (
                <div className={`flex items-center gap-2 text-sm p-2.5 rounded-lg mb-3 ${checkMsg.ok ? "bg-green-50 text-green-700" : "bg-destructive/10 text-destructive"}`}>
                  {checkMsg.ok ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
                  {checkMsg.text}
                </div>
              )}
              {geoErr && !checkMsg && (
                <div className="flex items-center gap-2 text-destructive text-xs p-2 bg-destructive/10 rounded-lg mb-3">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" /> {geoErr}
                </div>
              )}

              {/* Buttons */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <button
                  onClick={() => { setQrAction("checkin"); setShowQr(true); }}
                  disabled={hasCheckedIn || geoLoading}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all font-semibold text-sm ${
                    hasCheckedIn
                      ? "border-green-300 bg-green-50 text-green-700 opacity-60 cursor-default"
                      : "border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-700 active:scale-95"
                  }`}>
                  {(checkin.isPending || (geoLoading && qrAction === "checkin")) ? <Loader2 className="w-6 h-6 animate-spin" /> : (hasCheckedIn ? <CheckCircle2 className="w-6 h-6" /> : <QrCode className="w-6 h-6" />)}
                  {hasCheckedIn ? "✓ Đã chấm vào" : "Chấm vào (QR)"}
                </button>
                <button
                  onClick={() => doGPS("checkout")}
                  disabled={!hasCheckedIn || hasCheckedOut || geoLoading || checkout.isPending}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all font-semibold text-sm ${
                    hasCheckedOut
                      ? "border-green-300 bg-green-50 text-green-700 opacity-60 cursor-default"
                      : hasCheckedIn
                        ? "border-orange-300 bg-orange-50 hover:bg-orange-100 text-orange-700 active:scale-95"
                        : "border-muted bg-muted/30 text-muted-foreground opacity-50 cursor-default"
                  }`}>
                  {(checkout.isPending || (geoLoading && qrAction === "checkout")) ? <Loader2 className="w-6 h-6 animate-spin" /> : (hasCheckedOut ? <CheckCircle2 className="w-6 h-6" /> : <LogOut className="w-6 h-6" />)}
                  {hasCheckedOut ? "✓ Đã chấm ra" : "Chấm ra"}
                </button>
              </div>

              {/* GPS fallback buttons — for offsite workers only */}
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground text-center">Ngoài studio? Dùng GPS (có lịch chụp ngoài hôm nay)</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => doGPS("checkin")}
                    disabled={hasCheckedIn || geoLoading || checkin.isPending}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-blue-300 text-xs text-blue-600 hover:bg-blue-50 disabled:opacity-40 disabled:cursor-default transition-colors">
                    <MapPin className="w-3.5 h-3.5" />
                    Vào ngoài studio
                  </button>
                  <button
                    onClick={() => doGPS("checkout")}
                    disabled={!hasCheckedIn || hasCheckedOut || geoLoading || checkout.isPending}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-orange-300 text-xs text-orange-600 hover:bg-orange-50 disabled:opacity-40 disabled:cursor-default transition-colors">
                    <MapPin className="w-3.5 h-3.5" />
                    Ra ngoài studio
                  </button>
                </div>
              </div>

              {/* Today's logs */}
              {todayLogs.length > 0 && (
                <div className="mt-3 space-y-1.5 border-t border-border pt-3">
                  {todayLogs.map(l => (
                    <div key={l.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                      {l.type === "check_in" ? <LogIn className="w-3.5 h-3.5 text-blue-500" /> : <LogOut className="w-3.5 h-3.5 text-orange-500" />}
                      <span className="font-medium">{l.type === "check_in" ? "Vào" : "Ra"}:</span>
                      <span>{new Date(l.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</span>
                      {l.isOffsite
                        ? <span className="text-amber-600">📍 Ngoài studio {l.distanceM ? `(${Math.round(Number(l.distanceM))}m)` : ""}</span>
                        : <span className="text-green-600">✓ Tại studio</span>}
                      {l.method === "manual" && <span className="text-violet-500 font-medium">[Thủ công]</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Summary cards */}
            {myLoading ? (
              <div className="flex items-center justify-center h-16 text-muted-foreground text-sm">
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> Đang tải...
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-border bg-card p-3 text-center">
                  <p className="text-2xl font-black text-blue-600">{myAtt?.totalDays ?? 0}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Ngày công</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-3 text-center">
                  <p className="text-2xl font-black text-emerald-600">{myAtt?.onTimeRate ?? 0}%</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Đúng giờ</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-3 text-center">
                  <p className={`text-lg font-black ${(myAtt?.net ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {(myAtt?.net ?? 0) >= 0 ? "+" : ""}{vnd(myAtt?.net ?? 0)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Thưởng/Phạt</p>
                </div>
              </div>
            )}

            {/* Calendar */}
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="px-4 py-2.5 border-b flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-600" />
                <span className="font-semibold text-sm">Tháng {month.slice(5)}/{month.slice(0, 4)}</span>
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
                          hasIn && hasOut ? (isOffsite ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700")
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
                <div className="flex flex-wrap gap-3 mt-2 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-green-200" />Đầy đủ</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-200" />Ngoài studio</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-blue-200" />Vào chưa ra</span>
                </div>
              </div>
            </div>

            {/* Per-day attendance table */}
            {(myAtt?.totalDays ?? 0) > 0 && (
              <div className="rounded-2xl border border-border bg-card overflow-hidden">
                <div className="px-4 py-2.5 border-b font-semibold text-sm flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary" /> Chi tiết từng ngày
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold">Ngày</th>
                        <th className="px-3 py-2 text-left font-semibold">Giờ vào</th>
                        <th className="px-3 py-2 text-left font-semibold">Giờ ra</th>
                        <th className="px-3 py-2 text-center font-semibold">Đúng giờ</th>
                        <th className="px-3 py-2 text-right font-semibold">Thưởng/Phạt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {daysInMonth.filter(d => d.logs.some(l => l.type === "check_in")).map(({ date, logs }) => {
                        const ci = logs.find(l => l.type === "check_in");
                        const co = logs.find(l => l.type === "check_out");
                        const checkInTo = myAtt?.checkInTo ?? "09:00";
                        const isOnTime = ci?.localTime ? ci.localTime <= checkInTo : true;
                        const dayBp = (myAtt?.bonusPenalty ?? []).filter(bp => bp.date === date);
                        const netBp = dayBp.reduce((s, bp) => s + (bp.type === "bonus" ? bp.amount : -bp.amount), 0);
                        const [, mm, dd] = date.split("-");
                        return (
                          <tr key={date} className="hover:bg-muted/20 transition-colors">
                            <td className="px-3 py-2 font-medium">{dd}/{mm}</td>
                            <td className="px-3 py-2 font-mono">{ci?.localTime ?? "—"}</td>
                            <td className="px-3 py-2 font-mono text-muted-foreground">{co?.localTime ?? "—"}</td>
                            <td className="px-3 py-2 text-center">
                              {isOnTime
                                ? <span className="text-green-600 font-bold">✓</span>
                                : <span className="text-red-500 text-[10px]">{ci?.localTime}</span>}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold">
                              {dayBp.length > 0 ? (
                                <span className={netBp >= 0 ? "text-green-600" : "text-red-600"}>
                                  {netBp >= 0 ? "+" : ""}{vnd(Math.abs(netBp))}
                                </span>
                              ) : <span className="text-muted-foreground">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Bonuses */}
            {(myAtt?.bonusPenalty?.length ?? 0) > 0 && (
              <div className="rounded-2xl border border-border bg-card overflow-hidden">
                <div className="px-4 py-2.5 border-b font-semibold text-sm">Thưởng / Phạt tháng</div>
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

            {/* Admin adjustments (visible in "me" tab for admin) */}
            {effectiveIsAdmin && (
              <div className="rounded-2xl border border-border bg-card overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">Điều chỉnh thủ công</span>
                    <select value={adjViewStaffId} onChange={e => setAdjViewStaffId(e.target.value)}
                      className="text-xs border border-border rounded px-1.5 py-0.5 bg-background">
                      <option value="">-- Xem theo NV --</option>
                      {staffList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <button onClick={() => setShowAdjForm(v => !v)}
                    className="text-xs text-primary hover:underline flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Thêm
                  </button>
                </div>
                {showAdjForm && (
                  <div className="p-4 space-y-3 bg-muted/20 border-b border-border">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Nhân viên *</label>
                        <select value={adjForm.staffId} onChange={e => { setAdjForm(f => ({ ...f, staffId: e.target.value })); setAdjViewStaffId(e.target.value); }}
                          className={inputCls}>
                          <option value="">-- Chọn --</option>
                          {staffList.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Loại</label>
                        <select value={adjForm.type} onChange={e => setAdjForm(f => ({ ...f, type: e.target.value }))}
                          className={inputCls}>
                          <option value="bonus">Thưởng</option>
                          <option value="penalty">Phạt</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Số tiền (đ)</label>
                        <input type="number" value={adjForm.amount} onChange={e => setAdjForm(f => ({ ...f, amount: e.target.value }))}
                          className={inputCls} placeholder="0" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Ngày</label>
                        <input type="date" value={adjForm.date} onChange={e => setAdjForm(f => ({ ...f, date: e.target.value }))}
                          className={inputCls} />
                      </div>
                    </div>
                    <input value={adjForm.reason} onChange={e => setAdjForm(f => ({ ...f, reason: e.target.value }))}
                      className={inputCls} placeholder="Lý do..." />
                    <div className="flex gap-2">
                      <Button size="sm"
                        onClick={() => addAdjustment.mutate({
                          staffId: parseInt(adjForm.staffId), type: adjForm.type,
                          amount: parseFloat(adjForm.amount), reason: adjForm.reason, date: adjForm.date,
                        })}
                        disabled={!adjForm.staffId || !adjForm.amount || addAdjustment.isPending}>
                        {addAdjustment.isPending ? "Đang lưu..." : "Lưu"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setShowAdjForm(false)}>Hủy</Button>
                    </div>
                  </div>
                )}
                {!adjViewStaffId ? (
                  <div className="text-center py-4 text-xs text-muted-foreground">Chọn nhân viên để xem điều chỉnh</div>
                ) : adminAdjustments.length === 0 && !showAdjForm ? (
                  <div className="text-center py-4 text-xs text-muted-foreground">Chưa có điều chỉnh tháng này</div>
                ) : (
                  adminAdjustments.map(adj => (
                    <div key={adj.id} className="flex items-center justify-between px-4 py-2.5 text-sm border-t border-border">
                      <div>
                        <p className="font-medium">{adj.reason || "(Không ghi chú)"}</p>
                        <p className="text-xs text-muted-foreground">{adj.date}</p>
                      </div>
                      <span className={`font-bold ${adj.type === "bonus" ? "text-green-600" : "text-red-600"}`}>
                        {adj.type === "bonus" ? "+" : "-"}{vnd(adj.amount)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* ── ADMIN TAB ──────────────────────────────────────────────────── */}
        {tab === "admin" && effectiveIsAdmin && (
          <div className="space-y-4">
            {/* Static QR Code card */}
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="px-4 py-2.5 border-b flex items-center gap-2">
                <QrCode className="w-4 h-4 text-violet-600" />
                <span className="font-semibold text-sm">Mã QR chấm công</span>
              </div>
              <div className="p-4 flex flex-col items-center gap-3">
                <canvas ref={qrCanvasRef} className="rounded-xl shadow-md" />
                <p className="text-xs text-muted-foreground text-center max-w-xs">
                  Nhân viên quét mã này để chấm công.
                </p>
                <div className="flex gap-2 w-full">
                  <button onClick={handleDownloadQr} disabled={qrDownloading}
                    className="flex-1 px-3 py-2 text-sm rounded-lg border border-border hover:bg-muted disabled:opacity-50 font-medium">
                    ⬇️ Tải QR
                  </button>
                  <button onClick={handleCopyQrLink}
                    className="flex-1 px-3 py-2 text-sm rounded-lg border border-border hover:bg-muted font-medium">
                    📋 Copy link
                  </button>
                </div>
              </div>
            </div>
            {/* Per-staff summary table */}
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b">
                <span className="font-semibold text-sm flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-600" />
                  Tổng hợp tháng {month.slice(5)}/{month.slice(0, 4)}
                </span>
                <button onClick={() => setShowManualForm(v => !v)}
                  className="flex items-center gap-1 text-xs text-primary hover:underline">
                  <Plus className="w-3.5 h-3.5" /> Chấm thủ công
                </button>
              </div>

              {showManualForm && (
                <div className="p-4 bg-muted/20 border-b border-border space-y-3">
                  <h4 className="font-semibold text-sm">Chấm công thủ công</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Nhân viên *</label>
                      <select value={manualForm.staffId} onChange={e => setManualForm(f => ({ ...f, staffId: e.target.value }))}
                        className={inputCls}>
                        <option value="">-- Chọn --</option>
                        {staffList.map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Loại *</label>
                      <select value={manualForm.type} onChange={e => setManualForm(f => ({ ...f, type: e.target.value }))}
                        className={inputCls}>
                        <option value="check_in">Vào</option>
                        <option value="check_out">Ra</option>
                      </select>
                    </div>
                  </div>
                  <input value={manualForm.notes} onChange={e => setManualForm(f => ({ ...f, notes: e.target.value }))}
                    className={inputCls} placeholder="Ghi chú..." />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => addManual.mutate({ staffId: parseInt(manualForm.staffId), type: manualForm.type, notes: manualForm.notes })}
                      disabled={!manualForm.staffId || addManual.isPending}>
                      {addManual.isPending ? "Đang lưu..." : "Lưu"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowManualForm(false)}>Hủy</Button>
                  </div>
                </div>
              )}

              {staffSummary.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">Chưa có dữ liệu chấm công tháng này</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-semibold text-xs text-muted-foreground">Nhân viên</th>
                        <th className="text-center px-3 py-2.5 font-semibold text-xs text-muted-foreground">Ngày công</th>
                        <th className="text-center px-3 py-2.5 font-semibold text-xs text-muted-foreground">Đủ giờ</th>
                        <th className="text-center px-3 py-2.5 font-semibold text-xs text-muted-foreground">Ngoài studio</th>
                        <th className="text-left px-3 py-2.5 font-semibold text-xs text-muted-foreground">Lần cuối</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {staffSummary.map(s => {
                        const fullDays = s.checkIns.filter(ci => {
                          const ciDate = ci.localDate ?? ci.createdAt.slice(0, 10);
                          return s.checkOuts.some(co => (co.localDate ?? co.createdAt.slice(0, 10)) === ciDate);
                        }).length;
                        const offsite = s.checkIns.filter(l => l.isOffsite).length;
                        const lastLog = [...s.checkIns, ...s.checkOuts].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
                        return (
                          <tr key={s.id} className="hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-2.5 font-medium">{s.name}</td>
                            <td className="px-3 py-2.5 text-center">
                              <span className="font-bold text-blue-600">{s.checkIns.length}</span>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <span className={`font-bold ${fullDays === s.checkIns.length ? "text-green-600" : "text-amber-600"}`}>
                                {fullDays}/{s.checkIns.length}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {offsite > 0
                                ? <span className="text-amber-600 font-medium">{offsite}</span>
                                : <span className="text-muted-foreground">0</span>}
                            </td>
                            <td className="px-3 py-2.5 text-xs text-muted-foreground">
                              {lastLog
                                ? `${new Date(lastLog.createdAt).toLocaleDateString("vi-VN")} ${new Date(lastLog.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`
                                : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Raw log (collapsible) */}
            <details className="rounded-2xl border border-border bg-card overflow-hidden">
              <summary className="flex items-center gap-2 px-4 py-2.5 cursor-pointer font-semibold text-sm select-none hover:bg-muted/20">
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
                Nhật ký chấm công ({adminLogs.length} lượt)
              </summary>
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
                    {adminLogs.map(l => (
                      <tr key={l.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2.5 font-medium">{l.staffName ?? `#${l.staffId}`}</td>
                        <td className="px-4 py-2.5">
                          {l.type === "check_in"
                            ? <span className="flex items-center gap-1 text-blue-600 font-medium"><LogIn className="w-3.5 h-3.5" />Vào</span>
                            : <span className="flex items-center gap-1 text-orange-600 font-medium"><LogOut className="w-3.5 h-3.5" />Ra</span>}
                        </td>
                        <td className="px-4 py-2.5 text-xs">
                          {new Date(l.createdAt).toLocaleDateString("vi-VN")} {new Date(l.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="px-4 py-2.5">
                          {l.isOffsite
                            ? <span className="flex items-center gap-1 text-xs text-amber-600"><MapPin className="w-3 h-3" />Ngoài</span>
                            : l.method === "manual"
                              ? <span className="text-xs text-violet-600">Thủ công</span>
                              : <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="w-3 h-3" />Studio</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        )}

        {/* ── RULES TAB ──────────────────────────────────────────────────── */}
        {tab === "rules" && effectiveIsAdmin && (
          <div className="space-y-4">
            {rulesLoading ? (
              <div className="flex items-center justify-center h-16 text-muted-foreground text-sm">
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> Đang tải...
              </div>
            ) : (
              <>
                {/* Main rule form */}
                <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm flex items-center gap-2">
                      <Clock className="w-4 h-4 text-blue-600" /> Quy tắc giờ vào chuẩn
                    </h3>
                    {!editingRules ? (
                      <Button size="sm" variant="outline" onClick={() => setEditingRules(true)}>Chỉnh sửa</Button>
                    ) : (
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => saveRules.mutate({ ...ruleForm, lateRules })}
                          disabled={saveRules.isPending}>
                          {saveRules.isPending ? "Đang lưu..." : "Lưu quy tắc"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => {
                          setEditingRules(false);
                          if (rules?.rule) {
                            setRuleForm({
                              name: (rules.rule.name as string) ?? "Mặc định",
                              checkInFrom: rules.rule.checkinStartTime,
                              checkInTo: rules.rule.checkinEndTime,
                              weeklyOnTimeBonus: String(rules.rule.weeklyBonusAmount),
                            });
                          }
                          setLateRules(rules?.lateRules ?? []);
                        }}>Hủy</Button>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Tên quy tắc</label>
                      {editingRules
                        ? <input value={ruleForm.name} onChange={e => setRuleForm(f => ({ ...f, name: e.target.value }))} className={inputCls} />
                        : <p className="text-sm font-medium py-1.5">{ruleForm.name}</p>}
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Giờ vào hợp lệ từ</label>
                      {editingRules
                        ? <input type="time" value={ruleForm.checkInFrom} onChange={e => setRuleForm(f => ({ ...f, checkInFrom: e.target.value }))} className={inputCls} />
                        : <p className="text-sm font-medium py-1.5">{ruleForm.checkInFrom}</p>}
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Giờ vào hợp lệ đến (muộn nhất)</label>
                      {editingRules
                        ? <input type="time" value={ruleForm.checkInTo} onChange={e => setRuleForm(f => ({ ...f, checkInTo: e.target.value }))} className={inputCls} />
                        : <p className="text-sm font-medium py-1.5">{ruleForm.checkInTo}</p>}
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Bonus tuần chuyên cần (đ/tuần)</label>
                      {editingRules
                        ? <input type="number" value={ruleForm.weeklyOnTimeBonus} onChange={e => setRuleForm(f => ({ ...f, weeklyOnTimeBonus: e.target.value }))} className={inputCls} />
                        : <p className="text-sm font-bold text-green-600 py-1.5">{vnd(parseFloat(ruleForm.weeklyOnTimeBonus || "0"))}</p>}
                    </div>
                  </div>
                </div>

                {/* Late penalty rules */}
                <div className="rounded-2xl border border-border bg-card overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b">
                    <h3 className="font-semibold text-sm flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-red-500" /> Quy tắc phạt đi muộn
                    </h3>
                    {editingRules && (
                      <button
                        onClick={() => setLateRules(r => [...r, { lateFromTime: "08:00", lateToTime: null, penaltyAmount: null }])}
                        className="flex items-center gap-1 text-xs text-primary hover:underline">
                        <Plus className="w-3.5 h-3.5" /> Thêm dòng
                      </button>
                    )}
                  </div>
                  {lateRules.length === 0 ? (
                    <div className="text-center py-6 text-sm text-muted-foreground">
                      {editingRules ? 'Chưa có quy tắc phạt. Nhấn "+ Thêm dòng" để thêm.' : "Chưa có quy tắc phạt."}
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {lateRules.map((lr, i) => (
                        <div key={i} className="px-4 py-3 grid grid-cols-[1fr_1fr_1fr_auto] gap-3 items-center text-sm">
                          <div>
                            <label className="text-xs text-muted-foreground block mb-1">Muộn từ (giờ)</label>
                            {editingRules
                              ? <input type="time" value={lr.lateFromTime ?? "08:00"} onChange={e => {
                                  const copy = [...lateRules];
                                  copy[i] = { ...copy[i], lateFromTime: e.target.value };
                                  setLateRules(copy);
                                }} className={inputCls} />
                              : <span className="font-medium">{lr.lateFromTime ?? "08:00"}</span>}
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground block mb-1">Muộn đến (giờ, trống=∞)</label>
                            {editingRules
                              ? <input type="time" value={lr.lateToTime ?? ""}
                                  onChange={e => {
                                    const copy = [...lateRules];
                                    copy[i] = { ...copy[i], lateToTime: e.target.value || null };
                                    setLateRules(copy);
                                  }} className={inputCls} />
                              : <span className="font-medium">{lr.lateToTime ?? "∞"}</span>}
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground block mb-1">Phạt (đ, trống=không phạt)</label>
                            {editingRules
                              ? <input type="number" value={lr.penaltyAmount ?? ""}
                                  onChange={e => {
                                    const copy = [...lateRules];
                                    copy[i] = { ...copy[i], penaltyAmount: e.target.value ? parseFloat(e.target.value) : null };
                                    setLateRules(copy);
                                  }} className={inputCls} placeholder="Không phạt" />
                              : <span className={`font-bold ${lr.penaltyAmount ? "text-red-600" : "text-muted-foreground"}`}>
                                  {lr.penaltyAmount ? `-${vnd(lr.penaltyAmount)}` : "Không phạt"}
                                </span>}
                          </div>
                          {editingRules && (
                            <button onClick={() => setLateRules(r => r.filter((_, j) => j !== i))}
                              className="p-1.5 text-destructive hover:bg-destructive/10 rounded-lg mt-4">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Save button at bottom when editing */}
                {editingRules && (
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditingRules(false)}>Hủy</Button>
                    <Button size="sm" onClick={() => saveRules.mutate({ ...ruleForm, lateRules })}
                      disabled={saveRules.isPending}>
                      {saveRules.isPending ? "Đang lưu..." : "Lưu tất cả"}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* QR Scanner overlay */}
      {showQr && (
        <QrScanner
          onScan={handleQrScan}
          onClose={() => setShowQr(false)}
        />
      )}
    </div>
  );
}
