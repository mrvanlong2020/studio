import { Card, CardContent, Input, Button, Textarea } from "@/components/ui";
import { Save, Store, Mail, Phone, MapPin, Building, Clock } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Cài đặt hệ thống</h1>
        <p className="text-muted-foreground mt-1">Cấu hình thông tin cơ bản cho studio của bạn</p>
      </div>

      <Card>
        <div className="p-6 border-b bg-muted/30">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Store className="w-5 h-5 text-primary" /> Thông tin Studio
          </h3>
        </div>
        <CardContent className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">Tên Studio</label>
              <Input defaultValue="Amazing Studio" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2"><Phone className="w-4 h-4 text-muted-foreground"/> Hotline</label>
              <Input defaultValue="0901234567" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2"><Mail className="w-4 h-4 text-muted-foreground"/> Email</label>
              <Input defaultValue="admin@amazing.vn" type="email" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2"><Clock className="w-4 h-4 text-muted-foreground"/> Giờ làm việc</label>
              <Input defaultValue="08:00 - 20:00 (Tất cả các ngày)" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium flex items-center gap-2"><MapPin className="w-4 h-4 text-muted-foreground"/> Địa chỉ</label>
              <Input defaultValue="123 Đường Lê Lợi, Quận 1, TP.HCM" />
            </div>
          </div>
        </CardContent>
      </Card>

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
              <Input defaultValue="0312345678" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Mức cọc mặc định (%)</label>
              <Input type="number" defaultValue="30" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Tài khoản ngân hàng (Hiển thị trên báo giá)</label>
              <Textarea defaultValue="Ngân hàng Vietcombank&#10;STK: 10123456789&#10;Chủ TK: AMAZING STUDIO CO LTD" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button size="lg" className="gap-2 px-8">
          <Save className="w-5 h-5" /> Lưu thay đổi
        </Button>
      </div>
    </div>
  );
}
