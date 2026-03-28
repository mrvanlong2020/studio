import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, Input, Button, Textarea } from "@/components/ui";
import { Save, Store, Mail, Phone, MapPin, Building, Clock, Navigation, Loader2 } from "lucide-react";

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

  const { data: settings, isLoading } = useQuery<Settings>({
    queryKey: ["settings"],
    queryFn: () => fetch(`${BASE}/api/settings`, { headers: authH() }).then(r => r.json()),
  });

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  const saveMut = useMutation({
    mutationFn: (body: Partial<Settings>) =>
      fetch(`${BASE}/api/settings`, { method: "PUT", headers: authH(), body: JSON.stringify(body) }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
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
              <Input type="number" {...f("defaultDeposit")} />
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Vĩ độ Studio (Latitude)</label>
              <Input type="number" step="0.0001" {...f("studio_lat")} placeholder="11.3101" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Kinh độ Studio (Longitude)</label>
              <Input type="number" step="0.0001" {...f("studio_lng")} placeholder="106.1074" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Bán kính cho phép (mét)</label>
              <Input type="number" {...f("attendance_radius_m")} placeholder="300" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Để lấy tọa độ: mở Google Maps, nhấp chuột phải vào studio → chọn "What's here?" để thấy lat/lng.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3 items-center">
        {saved && <span className="text-sm text-green-600 font-medium">✓ Đã lưu thay đổi</span>}
        <Button size="lg" className="gap-2 px-8" onClick={() => saveMut.mutate(form)} disabled={saveMut.isPending}>
          {saveMut.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          Lưu thay đổi
        </Button>
      </div>
    </div>
  );
}
