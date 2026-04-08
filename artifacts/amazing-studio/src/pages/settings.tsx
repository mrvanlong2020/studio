import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, Input, Button, Textarea } from "@/components/ui";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Save, Store, Mail, Phone, MapPin, Building, Clock, Navigation, Loader2, LocateFixed, CheckCircle2, AlertCircle, Bot, MessageSquare } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

function GpsDetectButton({ onDetected }: { onDetected: (lat: number, lng: number) => void }) {
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [msg, setMsg] = useState("");

  const detect = () => {
    if (!navigator.geolocation) {
      setState("error");
      setMsg("Trình duyệt không hỗ trợ GPS");
      return;
    }
    setState("loading");
    setMsg("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Math.round(pos.coords.latitude * 1000000) / 1000000;
        const lng = Math.round(pos.coords.longitude * 1000000) / 1000000;
        onDetected(lat, lng);
        setState("success");
        setMsg(`Đã lấy vị trí: ${lat}, ${lng} (độ chính xác ~${Math.round(pos.coords.accuracy)}m)`);
        setTimeout(() => setState("idle"), 8000);
      },
      (err) => {
        setState("error");
        if (err.code === 1) setMsg("Bị từ chối quyền GPS. Hãy cho phép trình duyệt truy cập vị trí.");
        else if (err.code === 2) setMsg("Không lấy được vị trí. Hãy thử lại.");
        else setMsg("Hết thời gian chờ GPS. Hãy thử lại.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 rounded-xl border border-dashed bg-muted/30">
      <Button type="button" variant="outline" className="gap-2 shrink-0" onClick={detect} disabled={state === "loading"}>
        {state === "loading"
          ? <Loader2 className="w-4 h-4 animate-spin" />
          : <LocateFixed className="w-4 h-4 text-blue-500" />}
        {state === "loading" ? "Đang lấy vị trí..." : "Lấy vị trí hiện tại"}
      </Button>
      {state === "success" && (
        <span className="flex items-center gap-1.5 text-sm text-green-700">
          <CheckCircle2 className="w-4 h-4" /> {msg}
        </span>
      )}
      {state === "error" && (
        <span className="flex items-center gap-1.5 text-sm text-red-600">
          <AlertCircle className="w-4 h-4" /> {msg}
        </span>
      )}
      {state === "idle" && (
        <span className="text-sm text-muted-foreground">Bấm nút này khi đang đứng <strong>tại tiệm</strong> để tự động lấy tọa độ GPS</span>
      )}
    </div>
  );
}

function StudioMap({ lat, lng, radius }: { lat: number; lng: number; radius: number }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;
    if (!mapInstanceRef.current) {
      const map = L.map(mapRef.current, { zoomControl: true, attributionControl: false });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(map);
      mapInstanceRef.current = map;
    }
    const map = mapInstanceRef.current;
    const center: [number, number] = [lat || 11.3101, lng || 106.1074];
    map.setView(center, 17);
    if (markerRef.current) markerRef.current.remove();
    if (circleRef.current) circleRef.current.remove();
    const icon = L.divIcon({
      html: `<div style="background:#e11d48;width:20px;height:20px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.4)"></div>`,
      className: "",
      iconAnchor: [10, 10],
    });
    markerRef.current = L.marker(center, { icon }).addTo(map).bindPopup("📍 Studio").openPopup();
    circleRef.current = L.circle(center, {
      radius: radius || 300,
      color: "#7c3aed",
      fillColor: "#7c3aed",
      fillOpacity: 0.12,
      weight: 2,
    }).addTo(map);
    return () => {};
  }, [lat, lng, radius]);

  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  return <div ref={mapRef} style={{ height: 280, borderRadius: "0.75rem", zIndex: 0 }} />;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Settings = {
  studioName: string;
  phone: string;
  email: string;
  address: string;
  taxCode: string | null;
  bankAccount: string | null;
  bankName: string | null;
  logoUrl: string | null;
  workingHours: string;
  defaultDeposit: number;
  studio_lat: number;
  studio_lng: number;
  attendance_radius_m: number;
  aiPricingInfo: string | null;
};

type FbAiConfig = {
  hasPageAccessToken: boolean;
  hasOpenAiKey: boolean;
  hasVerifyToken: boolean;
  autoReplyEnabled: boolean;
};

const token = () => localStorage.getItem("amazingStudioToken_v2");
const authH = () => ({
  "Content-Type": "application/json",
  ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
});

export default function SettingsPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<Partial<Settings>>({});
  const [saved, setSaved] = useState(false);
  const [fbPageAccessToken, setFbPageAccessToken] = useState("");
  const [fbVerifyToken, setFbVerifyToken] = useState("");
  const [openAiApiKey, setOpenAiApiKey] = useState("");
  const [fbAutoReplyEnabled, setFbAutoReplyEnabled] = useState(false);
  const [fbSaved, setFbSaved] = useState(false);

  const { data: settings, isLoading } = useQuery<Settings>({
    queryKey: ["settings"],
    queryFn: () => fetch(`${BASE}/api/settings`, { headers: authH() }).then(r => { if (!r.ok) throw new Error("Lỗi tải cài đặt"); return r.json(); }),
  });

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  const { data: fbAiConfig } = useQuery<FbAiConfig>({
    queryKey: ["fb-ai-config"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/fb-ai/config`, { headers: authH() });
      if (!r.ok) throw new Error("Lỗi tải cấu hình Facebook AI");
      return r.json();
    },
  });

  useEffect(() => {
    if (fbAiConfig) setFbAutoReplyEnabled(fbAiConfig.autoReplyEnabled);
  }, [fbAiConfig]);

  const saveMut = useMutation({
    mutationFn: async (body: Partial<Settings>) => {
      const r = await fetch(`${BASE}/api/settings`, { method: "PUT", headers: authH(), body: JSON.stringify(body) });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error((d as { error?: string }).error || "Lưu cài đặt thất bại"); }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const saveFbMut = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}/api/fb-ai/config`, {
        method: "PUT",
        headers: authH(),
        body: JSON.stringify({
          pageAccessToken: fbPageAccessToken || undefined,
          verifyToken: fbVerifyToken || undefined,
          openaiApiKey: openAiApiKey || undefined,
          autoReplyEnabled: fbAutoReplyEnabled,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error || "Lưu cấu hình Facebook AI thất bại");
      }
      return r.json();
    },
    onSuccess: () => {
      setFbSaved(true);
      setTimeout(() => setFbSaved(false), 2500);
      qc.invalidateQueries({ queryKey: ["fb-ai-config"] });
      setFbPageAccessToken("");
      setFbVerifyToken("");
      setOpenAiApiKey("");
    },
  });

  const f = (key: keyof Settings) => ({
    value: form[key] !== undefined ? String(form[key] ?? "") : "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(p => ({ ...p, [key]: e.target.value })),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
      <Loader2 className="w-5 h-5 animate-spin mr-2" /> Đang tải...
    </div>
  );

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Cài đặt hệ thống</h1>
        <p className="text-muted-foreground mt-1">Cấu hình thông tin cơ bản cho studio của bạn</p>
      </div>

      {/* Studio Info */}
      <Card>
        <div className="p-6 border-b bg-muted/30">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Store className="w-5 h-5 text-primary" /> Thông tin Studio
          </h3>
        </div>
        <CardContent className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Tên Studio</label>
              <Input {...f("studioName")} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2"><Phone className="w-4 h-4 text-muted-foreground" /> Hotline</label>
              <Input {...f("phone")} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2"><Mail className="w-4 h-4 text-muted-foreground" /> Email</label>
              <Input {...f("email")} type="email" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2"><Clock className="w-4 h-4 text-muted-foreground" /> Giờ làm việc</label>
              <Input {...f("workingHours")} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium flex items-center gap-2"><MapPin className="w-4 h-4 text-muted-foreground" /> Địa chỉ</label>
              <Input {...f("address")} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Financial */}
      <Card>
        <div className="p-6 border-b bg-muted/30">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Building className="w-5 h-5 text-primary" /> Thông tin Tài chính & Thuế
          </h3>
        </div>
        <CardContent className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Mã số thuế</label>
              <Input {...f("taxCode")} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Mức cọc mặc định (%)</label>
              <CurrencyInput
                value={form.defaultDeposit !== undefined ? String(Math.round(form.defaultDeposit ?? 0) || "") : ""}
                onChange={raw => setForm(p => ({ ...p, defaultDeposit: parseFloat(raw) || 0 }))}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Tài khoản ngân hàng (Hiển thị trên báo giá)</label>
              <Textarea {...f("bankAccount")} rows={3} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Geofence / Attendance */}
      <Card>
        <div className="p-6 border-b bg-muted/30">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Navigation className="w-5 h-5 text-primary" /> Định vị chấm công (Geofence)
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Nhân viên chỉ được chấm công tại studio nếu GPS nằm trong bán kính cho phép.
          </p>
        </div>
        <CardContent className="p-6 space-y-6">
          {/* Auto-detect location button */}
          <GpsDetectButton
            onDetected={(lat, lng) => setForm(p => ({ ...p, studio_lat: lat, studio_lng: lng }))}
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Vĩ độ Studio (Latitude)</label>
              <Input type="number" step="0.000001" {...f("studio_lat")} placeholder="11.3101" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Kinh độ Studio (Longitude)</label>
              <Input type="number" step="0.000001" {...f("studio_lng")} placeholder="106.1074" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Bán kính cho phép (mét)</label>
              <Input type="number" {...f("attendance_radius_m")} placeholder="300" />
            </div>
          </div>
          {(form.studio_lat || form.studio_lng) && (
            <div>
              <label className="text-sm font-medium block mb-2 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary" /> Bản đồ vị trí Studio
              </label>
              <StudioMap
                lat={Number(form.studio_lat)}
                lng={Number(form.studio_lng)}
                radius={Number(form.attendance_radius_m) || 300}
              />
            </div>
          )}
          <div className="text-xs text-muted-foreground space-y-1">
            <p>💡 <strong>Cách đơn giản nhất:</strong> Mở trang này <em>tại tiệm</em>, bấm nút "Lấy vị trí hiện tại" → tọa độ tự động điền.</p>
            <p>📌 Hoặc mở Google Maps, nhấp chuột phải vào studio → chọn <em>"What's here?"</em> để thấy lat/lng.</p>
          </div>
        </CardContent>
      </Card>

      {/* AI Pricing Info */}
      <Card>
        <div className="p-6 border-b bg-muted/30">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Bot className="w-5 h-5 text-primary" /> Nội dung bảng giá / thông tin cho AI trả lời
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            AI sẽ đọc nội dung này để trả lời khách hàng qua Facebook Inbox. Paste nội dung từ trang báo giá của bạn vào đây.
          </p>
        </div>
        <CardContent className="p-6 space-y-4">
          <textarea
            className="w-full min-h-[280px] rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-y font-mono"
            placeholder={`Ví dụ:\n\nGÓI CHỤP ẢNH CƯỚI:\n- Gói Studio Cơ Bản: 5.500.000đ — Chụp tại studio, 1 bộ váy, makeup, 40 ảnh chỉnh sửa\n- Gói Ngoại Cảnh: 8.500.000đ — 2 địa điểm, 2 bộ váy, makeup, 80 ảnh\n- Gói Premium: 15.000.000đ — Trọn gói A-Z, album, ảnh phóng\n\nCHO THUÊ VÁY CƯỚI:\n- Váy ngắn từ 500.000đ/ngày\n- Váy dài từ 800.000đ/ngày\n- Váy cao cấp từ 2.000.000đ/ngày\n\nLIÊN HỆ: 0901 234 567`}
            {...f("aiPricingInfo")}
          />
          <p className="text-xs text-muted-foreground">
            Nội dung này sẽ được đưa vào prompt AI khi trả lời khách qua Facebook. Bạn có thể nhập bảng giá, chính sách đặt cọc, thời gian làm việc, địa chỉ và bất kỳ thông tin nào muốn AI biết.
          </p>
        </CardContent>
      </Card>

      {/* Facebook + ChatGPT */}
      <Card>
        <div className="p-6 border-b bg-muted/30">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Bot className="w-5 h-5 text-primary" /> Cấu hình Facebook Fanpage + ChatGPT
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Dành cho mô-đun Inbox Facebook AI. Có thể bàn giao cho khách tự thiết lập.
          </p>
        </div>
        <CardContent className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Facebook Page Access Token</label>
              <Input
                type="password"
                value={fbPageAccessToken}
                onChange={(e) => setFbPageAccessToken(e.target.value)}
                placeholder="Nhập token mới (để trống nếu giữ nguyên)"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Webhook Verify Token</label>
              <Input
                value={fbVerifyToken}
                onChange={(e) => setFbVerifyToken(e.target.value)}
                placeholder="Ví dụ: amazing-studio-verify-2026"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">OpenAI API Key</label>
              <Input
                type="password"
                value={openAiApiKey}
                onChange={(e) => setOpenAiApiKey(e.target.value)}
                placeholder="sk-..."
              />
            </div>
          </div>

          <label className="text-sm font-medium flex items-center gap-2">
            <input
              type="checkbox"
              checked={fbAutoReplyEnabled}
              onChange={(e) => setFbAutoReplyEnabled(e.target.checked)}
            />
            Bật tự động trả lời (AI chỉ tự gửi khi đúng kịch bản, ngoài phạm vi sẽ để nhân viên xử lý)
          </label>

          <div className="text-xs text-muted-foreground space-y-1 rounded-xl border p-3">
            <p>
              Trạng thái hiện tại: FB Token <strong>{fbAiConfig?.hasPageAccessToken ? "OK" : "Thiếu"}</strong> | Verify Token <strong>{fbAiConfig?.hasVerifyToken ? "OK" : "Thiếu"}</strong> | OpenAI <strong>{fbAiConfig?.hasOpenAiKey ? "OK" : "Thiếu"}</strong> | Auto <strong>{fbAiConfig?.autoReplyEnabled ? "Bật" : "Tắt"}</strong>
            </p>
          </div>

          <div className="rounded-xl border border-dashed p-4 text-sm space-y-2">
            <p className="font-semibold flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" /> Hướng dẫn bàn giao cho khách tự setup
            </p>
            <p><strong>Bước 1:</strong> Tạo Meta App, thêm Messenger, kết nối Fanpage cần dùng.</p>
            <p><strong>Bước 2:</strong> Lấy <em>Page Access Token</em> dán vào ô tương ứng ở trên.</p>
            <p><strong>Bước 3:</strong> Tạo chuỗi bí mật cho <em>Webhook Verify Token</em> (ví dụ `studio-verify-2026`) và lưu vào đây.</p>
            <p><strong>Bước 4:</strong> Trên Meta Developer, cấu hình Webhook URL: <code>{window.location.origin}{BASE}/api/webhook/facebook</code> và Verify Token giống bước 3.</p>
            <p><strong>Bước 5:</strong> Subscribe ít nhất các event: <code>messages</code>, <code>messaging_postbacks</code>.</p>
            <p><strong>Bước 6:</strong> Tạo OpenAI API key và dán vào ô OpenAI API Key.</p>
            <p><strong>Bước 7:</strong> Bật Auto Reply nếu muốn tự động trả lời, sau đó vào tab Inbox Facebook AI để theo dõi và xử lý ngoại lệ.</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3 items-center">
        {saved && <span className="text-sm text-green-600 font-medium">✓ Đã lưu thay đổi</span>}
        {fbSaved && <span className="text-sm text-green-600 font-medium">✓ Đã lưu cấu hình Facebook AI</span>}
        {saveFbMut.isError && <span className="text-sm text-red-600 font-medium">{(saveFbMut.error as Error).message}</span>}
        <Button size="lg" variant="outline" className="gap-2 px-8" onClick={() => saveFbMut.mutate()} disabled={saveFbMut.isPending}>
          {saveFbMut.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Bot className="w-5 h-5" />}
          Lưu Facebook + ChatGPT
        </Button>
        <Button size="lg" className="gap-2 px-8" onClick={() => saveMut.mutate(form)} disabled={saveMut.isPending}>
          {saveMut.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          Lưu thay đổi
        </Button>
      </div>
    </div>
  );
}
