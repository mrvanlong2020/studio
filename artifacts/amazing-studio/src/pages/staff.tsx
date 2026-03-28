import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Users, Plus, Pencil, Banknote, DollarSign, Briefcase, ClipboardList, ChevronDown, ChevronUp, AlertCircle, UserCircle, LogOut, ChevronRight, KeyRound, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useStaffAuth, type ViewerUser } from "@/contexts/StaffAuthContext";
import StaffAvatar from "@/components/StaffAvatar";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("amazingStudioToken_v2");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchJson(url: string, opts?: RequestInit) {
  const headers = {
    ...getAuthHeaders(),
    ...(opts?.headers as Record<string, string> | undefined),
  };
  const res = await fetch(url, { ...opts, headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ─── Role definitions ─────────────────────────────────────────────────────────
const ROLES = [
  { key: "admin",        label: "Quản lý",    icon: "👑" },
  { key: "photographer", label: "Nhiếp ảnh",  icon: "📷" },
  { key: "makeup",       label: "Trang điểm", icon: "💄" },
  { key: "sale",         label: "Kinh doanh",  icon: "💼" },
  { key: "photoshop",    label: "Chỉnh sửa",  icon: "🖥️" },
  { key: "assistant",    label: "Hỗ trợ",     icon: "🤝" },
  { key: "marketing",    label: "Marketing",  icon: "📣" },
];

// ─── Per-role task templates ───────────────────────────────────────────────────
export const ROLE_TASKS: Record<string, Array<{ key: string; label: string }>> = {
  photographer: [
    { key: "chup_cong",              label: "Chụp cổng" },
    { key: "chup_album",             label: "Chụp album" },
    { key: "chup_tiec_truyen_thong", label: "Chụp tiệc truyền thống" },
    { key: "chup_tiec_phong_su",     label: "Chụp tiệc phóng sự" },
    { key: "chup_beauty",            label: "Chụp beauty" },
    { key: "chup_nang_tho",          label: "Chụp nàng thơ" },
    { key: "chup_gia_dinh",          label: "Chụp gia đình" },
    { key: "chup_em_be",             label: "Chụp em bé" },
    { key: "chup_ngoai_canh",        label: "Chụp ngoại cảnh" },
    { key: "chup_prewedding",        label: "Chụp prewedding" },
    { key: "chup_concept",           label: "Chụp concept" },
    { key: "chup_san_pham",          label: "Chụp sản phẩm" },
    { key: "ho_tro_chup",            label: "Hỗ trợ chụp / phụ chụp" },
    { key: "mac_dinh",               label: "Mặc định" },
  ],
  makeup: [
    { key: "makeup_chup_cong",   label: "Makeup chụp cổng" },
    { key: "makeup_chup_album",  label: "Makeup chụp album" },
    { key: "makeup_chup_tiec",   label: "Makeup chụp tiệc" },
    { key: "makeup_nang_tho",    label: "Makeup nàng thơ" },
    { key: "makeup_beauty",      label: "Makeup beauty" },
    { key: "makeup_ngoai_canh",  label: "Makeup ngoại cảnh" },
    { key: "makeup_co_dau",      label: "Makeup cô dâu ngày cưới" },
    { key: "makeup_me",          label: "Makeup mẹ / người thân" },
    { key: "makeup_phu",         label: "Makeup phụ" },
    { key: "mac_dinh",           label: "Mặc định" },
  ],
  sale: [
    { key: "sale_chup_cong",   label: "Sale chụp cổng" },
    { key: "sale_chup_album",  label: "Sale chụp album" },
    { key: "sale_chup_tiec",   label: "Sale chụp tiệc" },
    { key: "sale_beauty",      label: "Sale beauty" },
    { key: "sale_prewedding",  label: "Sale prewedding" },
    { key: "sale_combo_cuoi",  label: "Sale combo cưới" },
    { key: "sale_tron_goi",    label: "Sale trọn gói" },
    { key: "sale_phat_sinh",   label: "Sale phát sinh" },
    { key: "mac_dinh",         label: "Mặc định" },
  ],
  photoshop: [
    { key: "chinh_album",    label: "Chỉnh album" },
    { key: "chinh_anh_le",   label: "Chỉnh ảnh lẻ" },
    { key: "chinh_anh_beauty", label: "Chỉnh ảnh beauty" },
    { key: "chinh_anh_cuoi", label: "Chỉnh ảnh cưới" },
    { key: "blend_mau",      label: "Blend màu" },
    { key: "retouch_da",     label: "Retouch da" },
    { key: "thiet_ke_album", label: "Thiết kế album" },
    { key: "xuat_file",      label: "Xuất file / hoàn thiện file" },
    { key: "mac_dinh",       label: "Mặc định" },
  ],
  marketing: [
    { key: "viet_bai",          label: "Viết bài" },
    { key: "dang_bai",          label: "Đăng bài" },
    { key: "thiet_ke_bai_dang", label: "Thiết kế bài đăng" },
    { key: "chay_quang_cao",    label: "Chạy quảng cáo" },
    { key: "quay_video",        label: "Quay video" },
    { key: "dung_video",        label: "Dựng video" },
    { key: "livestream",        label: "Livestream" },
    { key: "ho_tro_content",    label: "Hỗ trợ content" },
    { key: "mac_dinh",          label: "Mặc định" },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getRoles(s: { roles?: unknown; role?: unknown }): string[] {
  if (Array.isArray(s.roles) && s.roles.length > 0) return s.roles as string[];
  if (s.role) return [String(s.role)];
  return [];
}

function fmt(n: number) {
  return n.toLocaleString("vi-VN") + "đ";
}

const STATUS_MAP: Record<string, string> = {
  active: "Đang làm",
  inactive: "Nghỉ",
  probation: "Tạm nghỉ",
};

type PriceEntry = { rate: string; rateType: "fixed" | "percent" };
type RolePriceMap = Record<string, Record<string, PriceEntry>>;

// ─── Price block component ─────────────────────────────────────────────────────
interface PriceBlockProps {
  role: string;
  prices: Record<string, PriceEntry>;
  onChange: (taskKey: string, rate: string, rateType: "fixed" | "percent") => void;
}
function PriceBlock({ role, prices, onChange }: PriceBlockProps) {
  const [open, setOpen] = useState(true);
  const roleDef = ROLES.find(r => r.key === role);
  const tasks = ROLE_TASKS[role] || [];
  const isSale = role === "sale";

  return (
    <div className="border rounded-lg overflow-hidden mb-3">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/50 hover:bg-muted text-left"
        onClick={() => setOpen(o => !o)}
      >
        <span className="font-medium text-sm">
          {roleDef?.icon} Bảng giá {roleDef?.label}
        </span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {open && (
        <div className="p-3 space-y-2">
          {tasks.map(task => {
            const entry = prices[task.key] || { rate: "", rateType: "fixed" as const };
            return (
              <div key={task.key} className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground flex-1 min-w-0 truncate">{task.label}</span>
                {isSale && (
                  <select
                    className="text-xs border rounded px-1.5 py-1.5 bg-background h-9 shrink-0"
                    value={entry.rateType}
                    onChange={e => onChange(task.key, entry.rate, e.target.value as "fixed" | "percent")}
                  >
                    <option value="fixed">VNĐ</option>
                    <option value="percent">%</option>
                  </select>
                )}
                <Input
                  type="number"
                  min="0"
                  placeholder={isSale && entry.rateType === "percent" ? "vd: 5" : "Để trống nếu chưa có"}
                  className="w-40 text-right shrink-0 h-9"
                  value={entry.rate}
                  onChange={e => onChange(task.key, e.target.value, entry.rateType)}
                />
                {isSale && (
                  <span className="text-xs text-muted-foreground w-4 shrink-0">
                    {entry.rateType === "percent" ? "%" : "đ"}
                  </span>
                )}
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground pt-1">
            💡 Để trống những nhiệm vụ nhân viên chưa có giá.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Staff Info Form (Add / Edit) ─────────────────────────────────────────────
type StaffFormData = {
  name: string; phone: string; email: string; address: string;
  status: string; staffType: string; joinDate: string; notes: string;
  baseSalaryAmount: string; allowance: string; salaryNotes: string;
  avatar?: string | null; banner?: string | null;
};
const EMPTY_FORM: StaffFormData = {
  name: "", phone: "", email: "", address: "",
  status: "active", staffType: "official", joinDate: "", notes: "",
  baseSalaryAmount: "", allowance: "", salaryNotes: "",
  avatar: null, banner: null,
};

interface StaffFormSheetProps {
  open: boolean;
  onClose: () => void;
  editStaff?: Record<string, unknown> | null;
}
function StaffFormSheet({ open, onClose, editStaff }: StaffFormSheetProps) {
  const qc = useQueryClient();
  const isEdit = !!editStaff;

  const [form, setForm] = useState<StaffFormData>(EMPTY_FORM);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [rolePrices, setRolePrices] = useState<RolePriceMap>({});
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  // Init form values when sheet opens
  useEffect(() => {
    if (!open) return;
    if (editStaff) {
      setForm({
        name: String(editStaff.name || ""),
        phone: String(editStaff.phone || ""),
        email: String(editStaff.email || ""),
        address: String(editStaff.address || ""),
        status: String(editStaff.status || "active"),
        staffType: String(editStaff.staffType || "official"),
        joinDate: String(editStaff.joinDate || ""),
        notes: String(editStaff.notes || ""),
        baseSalaryAmount: editStaff.baseSalaryAmount ? String(editStaff.baseSalaryAmount) : "",
        allowance: editStaff.allowance ? String(editStaff.allowance) : "",
        salaryNotes: String(editStaff.salaryNotes || ""),
        avatar: (editStaff.avatar as string | null) || null,
        banner: (editStaff.banner as string | null) || null,
      });
      setSelectedRoles(getRoles(editStaff as { roles?: unknown; role?: unknown }));
    } else {
      setForm(EMPTY_FORM);
      setSelectedRoles([]);
      setRolePrices({});
    }
    setErr("");
  }, [open, editStaff?.id]);

  // Load existing rates for edit mode
  const { data: existingRates } = useQuery<Array<{ role: string; taskKey: string; rate: number | null; rateType: string }>>({
    queryKey: ["staff-rates", editStaff?.id],
    queryFn: () => fetchJson(`${BASE}/api/staff-rates?staffId=${editStaff!.id}`),
    enabled: isEdit && open && !!editStaff?.id,
  });

  useEffect(() => {
    if (!existingRates) return;
    const map: RolePriceMap = {};
    for (const r of existingRates) {
      if (!map[r.role]) map[r.role] = {};
      map[r.role][r.taskKey] = {
        rate: r.rate !== null ? String(r.rate) : "",
        rateType: (r.rateType || "fixed") as "fixed" | "percent",
      };
    }
    setRolePrices(map);
  }, [existingRates]);

  function setField(k: keyof StaffFormData, v: string) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function toggleRole(role: string) {
    setSelectedRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  }

  function handlePriceChange(role: string, taskKey: string, rate: string, rateType: "fixed" | "percent") {
    setRolePrices(prev => ({
      ...prev,
      [role]: { ...(prev[role] || {}), [taskKey]: { rate, rateType } },
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setErr("Vui lòng nhập họ tên"); return; }
    setSaving(true); setErr("");
    try {
      const body = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        address: form.address.trim(),
        status: form.status,
        staffType: form.staffType || "official",
        joinDate: form.joinDate || null,
        notes: form.notes.trim(),
        baseSalaryAmount: form.baseSalaryAmount ? parseFloat(form.baseSalaryAmount) : null,
        allowance: form.allowance ? parseFloat(form.allowance) : null,
        salaryNotes: form.salaryNotes.trim(),
        avatar: form.avatar || null,
        banner: form.banner || null,
        roles: selectedRoles,
        role: selectedRoles[0] || null,
      };

      let staffId: number;
      if (isEdit) {
        await fetchJson(`${BASE}/api/staff/${editStaff!.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
        staffId = editStaff!.id as number;
      } else {
        const created = await fetchJson(`${BASE}/api/staff`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
        staffId = created.id;
      }

      // Bulk-save all price entries for all selected roles
      const rates: Array<{ role: string; taskKey: string; taskName: string; rate: number | null; rateType: string }> = [];
      for (const role of selectedRoles) {
        for (const task of (ROLE_TASKS[role] || [])) {
          const entry = rolePrices[role]?.[task.key];
          rates.push({
            role,
            taskKey: task.key,
            taskName: task.label,
            rate: entry?.rate && entry.rate !== "" ? parseFloat(entry.rate) : null,
            rateType: entry?.rateType || "fixed",
          });
        }
      }
      if (rates.length > 0) {
        await fetchJson(`${BASE}/api/staff-rates/bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ staffId, rates }),
        });
      }

      await qc.invalidateQueries({ queryKey: ["staff"] });
      await qc.invalidateQueries({ queryKey: ["staff-rates"] });
      await qc.invalidateQueries({ queryKey: ["job-earnings-all"] });
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Lỗi lưu dữ liệu");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
        <form onSubmit={handleSubmit} className="flex flex-col h-full">
          <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <SheetTitle>{isEdit ? "Sửa thông tin nhân viên" : "Thêm nhân viên mới"}</SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
            {err && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" /> {err}
              </div>
            )}

            {/* A. Thông tin cơ bản */}
            <section>
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-1.5 text-muted-foreground uppercase tracking-wide">
                <Users className="w-4 h-4" /> A. Thông tin cơ bản
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <Label>Họ tên <span className="text-destructive">*</span></Label>
                  <Input value={form.name} onChange={e => setField("name", e.target.value)}
                    placeholder="Nguyễn Thị Hoa" className="mt-1" />
                </div>
                <div>
                  <Label>Số điện thoại</Label>
                  <Input value={form.phone} onChange={e => setField("phone", e.target.value)}
                    placeholder="0901234567" className="mt-1" />
                  {!isEdit && form.phone && (
                    <p className="text-xs text-muted-foreground mt-1">
                      🔑 Tài khoản đăng nhập: <span className="font-mono font-medium">{form.phone}</span> / mật khẩu mặc định: <span className="font-mono font-medium">{form.phone}</span>
                    </p>
                  )}
                  {!isEdit && !form.phone && (
                    <p className="text-xs text-muted-foreground mt-1">💡 Số điện thoại sẽ là tên đăng nhập</p>
                  )}
                </div>
                <div>
                  <Label>Email</Label>
                  <Input value={form.email} onChange={e => setField("email", e.target.value)}
                    placeholder="hoa@studio.vn" className="mt-1" />
                </div>
                <div>
                  <Label>Ngày vào làm</Label>
                  <Input type="date" value={form.joinDate} onChange={e => setField("joinDate", e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>Trạng thái</Label>
                  <Select value={form.status} onValueChange={v => setField("status", v)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Đang làm</SelectItem>
                      <SelectItem value="inactive">Nghỉ</SelectItem>
                      <SelectItem value="probation">Tạm nghỉ</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Loại nhân viên</Label>
                  <Select value={form.staffType} onValueChange={v => setField("staffType", v)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="official">Chính thức</SelectItem>
                      <SelectItem value="freelancer">Cộng tác viên (CTV)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Label>Địa chỉ</Label>
                  <Input value={form.address} onChange={e => setField("address", e.target.value)}
                    placeholder="Số nhà, đường, quận..." className="mt-1" />
                </div>
                <div className="sm:col-span-2">
                  <Label>Ghi chú</Label>
                  <Textarea value={form.notes} onChange={e => setField("notes", e.target.value)}
                    placeholder="Ghi chú thêm..." rows={2} className="mt-1" />
                </div>
                <div className="sm:col-span-2">
                  <Label>Ảnh đại diện</Label>
                  <input type="file" accept="image/*" onChange={async (e) => {
                    const file = e.currentTarget.files?.[0]; if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => setField("avatar", String(reader.result));
                    reader.readAsDataURL(file);
                  }} className="block w-full text-sm border border-border rounded-lg p-2 mt-1 cursor-pointer" />
                  {form.avatar && <div className="mt-2 text-xs text-muted-foreground">✓ Ảnh đã chọn (sẽ lưu khi nhấn "Thêm nhân viên")</div>}
                </div>
                <div className="sm:col-span-2">
                  <Label>Ảnh bìa</Label>
                  <input type="file" accept="image/*" onChange={async (e) => {
                    const file = e.currentTarget.files?.[0]; if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => setField("banner", String(reader.result));
                    reader.readAsDataURL(file);
                  }} className="block w-full text-sm border border-border rounded-lg p-2 mt-1 cursor-pointer" />
                  {form.banner && <div className="mt-2 text-xs text-muted-foreground">✓ Ảnh đã chọn (sẽ lưu khi nhấn "Thêm nhân viên")</div>}
                </div>
              </div>
            </section>

            <Separator />

            {/* B. Lương cơ bản */}
            <section>
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-1.5 text-muted-foreground uppercase tracking-wide">
                <Banknote className="w-4 h-4" /> B. Lương cơ bản
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Lương cứng (đ/tháng)</Label>
                  <Input type="number" value={form.baseSalaryAmount}
                    onChange={e => setField("baseSalaryAmount", e.target.value)}
                    placeholder="vd: 5000000" className="mt-1" />
                </div>
                <div>
                  <Label>Phụ cấp (đ/tháng)</Label>
                  <Input type="number" value={form.allowance}
                    onChange={e => setField("allowance", e.target.value)}
                    placeholder="vd: 500000" className="mt-1" />
                </div>
                <div className="sm:col-span-2">
                  <Label>Ghi chú lương</Label>
                  <Input value={form.salaryNotes} onChange={e => setField("salaryNotes", e.target.value)}
                    placeholder="Ghi chú về lương..." className="mt-1" />
                </div>
              </div>
            </section>

            <Separator />

            {/* C. Chức vụ */}
            <section>
              <h3 className="font-semibold text-sm mb-1 flex items-center gap-1.5 text-muted-foreground uppercase tracking-wide">
                <Briefcase className="w-4 h-4" /> C. Chức vụ
              </h3>
              <p className="text-xs text-muted-foreground mb-3">
                Chọn một hoặc nhiều chức vụ. Hệ thống sẽ tạo bảng nhập giá riêng cho từng chức vụ bên dưới.
              </p>
              <div className="flex flex-wrap gap-2">
                {ROLES.map(r => (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => toggleRole(r.key)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      selectedRoles.includes(r.key)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border hover:bg-muted"
                    }`}
                  >
                    <span>{r.icon}</span> {r.label}
                  </button>
                ))}
              </div>
            </section>

            {/* D. Bảng giá theo từng chức vụ */}
            {selectedRoles.length > 0 && (
              <>
                <Separator />
                <section>
                  <h3 className="font-semibold text-sm mb-1 flex items-center gap-1.5 text-muted-foreground uppercase tracking-wide">
                    <ClipboardList className="w-4 h-4" /> D. Đơn giá riêng theo từng nhiệm vụ
                  </h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    Đây là bảng giá cá nhân của nhân viên này. Mỗi người có mức giá khác nhau, không liên quan đến người khác.
                    Để trống những nhiệm vụ chưa xác định giá.
                  </p>
                  {selectedRoles.map(role => (
                    <PriceBlock
                      key={role}
                      role={role}
                      prices={rolePrices[role] || {}}
                      onChange={(taskKey, rate, rateType) => handlePriceChange(role, taskKey, rate, rateType)}
                    />
                  ))}
                </section>
              </>
            )}
          </div>

          <div className="px-6 py-4 border-t shrink-0 flex gap-3">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Huỷ</Button>
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? "Đang lưu..." : isEdit ? "Lưu thay đổi" : "Thêm nhân viên"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ─── Price Edit Dialog (per-staff) ────────────────────────────────────────────
interface PriceEditDialogProps {
  staff: Record<string, unknown> | null;
  onClose: () => void;
}
function PriceEditDialog({ staff, onClose }: PriceEditDialogProps) {
  const qc = useQueryClient();
  const [rolePrices, setRolePrices] = useState<RolePriceMap>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState(false);

  const roles = staff ? getRoles(staff) : [];

  const { data: existingRates, isLoading } = useQuery<Array<{ role: string; taskKey: string; rate: number | null; rateType: string }>>({
    queryKey: ["staff-rates", staff?.id],
    queryFn: () => fetchJson(`${BASE}/api/staff-rates?staffId=${staff!.id}`),
    enabled: !!staff,
  });

  useEffect(() => {
    if (!existingRates) return;
    const map: RolePriceMap = {};
    for (const r of existingRates) {
      if (!map[r.role]) map[r.role] = {};
      map[r.role][r.taskKey] = {
        rate: r.rate !== null ? String(r.rate) : "",
        rateType: (r.rateType || "fixed") as "fixed" | "percent",
      };
    }
    setRolePrices(map);
    setSuccess(false); setErr("");
  }, [existingRates]);

  function handlePriceChange(role: string, taskKey: string, rate: string, rateType: "fixed" | "percent") {
    setRolePrices(prev => ({
      ...prev,
      [role]: { ...(prev[role] || {}), [taskKey]: { rate, rateType } },
    }));
  }

  async function handleSave() {
    if (!staff) return;
    setSaving(true); setErr(""); setSuccess(false);
    try {
      const rates: Array<{ role: string; taskKey: string; taskName: string; rate: number | null; rateType: string }> = [];
      for (const role of roles) {
        for (const task of (ROLE_TASKS[role] || [])) {
          const entry = rolePrices[role]?.[task.key];
          rates.push({
            role, taskKey: task.key, taskName: task.label,
            rate: entry?.rate && entry.rate !== "" ? parseFloat(entry.rate) : null,
            rateType: entry?.rateType || "fixed",
          });
        }
      }
      await fetchJson(`${BASE}/api/staff-rates/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId: staff.id, rates }),
      });
      await qc.invalidateQueries({ queryKey: ["staff-rates", staff.id] });
      setSuccess(true);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Lỗi lưu giá");
    } finally {
      setSaving(false);
    }
  }

  if (!staff) return null;

  return (
    <Dialog open={!!staff} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bảng giá riêng — {String(staff.name)}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">Đang tải...</div>
        ) : roles.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground space-y-2">
            <AlertCircle className="w-8 h-8 mx-auto opacity-40" />
            <p>Nhân viên này chưa có chức vụ.</p>
            <p className="text-sm">Hãy sửa thông tin để chọn chức vụ trước, sau đó mới nhập bảng giá.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Đây là bảng giá cá nhân của <strong>{String(staff.name)}</strong>.
              Nhập đơn giá cho từng nhiệm vụ. Để trống = chưa có giá, hệ thống sẽ cảnh báo khi tạo job.
            </p>
            {err && (
              <div className="flex items-center gap-2 p-3 rounded bg-destructive/10 text-destructive text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" /> {err}
              </div>
            )}
            {success && (
              <div className="p-3 rounded bg-green-50 text-green-700 text-sm border border-green-200">
                ✓ Đã lưu bảng giá thành công!
              </div>
            )}
            {roles.map(role => (
              <PriceBlock
                key={role}
                role={role}
                prices={rolePrices[role] || {}}
                onChange={(tk, r, rt) => handlePriceChange(role, tk, r, rt)}
              />
            ))}
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={onClose}>Đóng</Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving}>
                {saving ? "Đang lưu..." : "Lưu bảng giá"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Staff Card ───────────────────────────────────────────────────────────────
interface StaffCardProps {
  staff: Record<string, unknown>;
  earnings: Array<{ staffId: number; rate: number; earnedDate: string }>;
  onEdit: (s: Record<string, unknown>) => void;
  onEditPrice: (s: Record<string, unknown>) => void;
  onSetPassword: (s: Record<string, unknown>) => void;
  isAdmin: boolean;
}
function StaffCard({ staff, earnings, onEdit, onEditPrice, onSetPassword, isAdmin }: StaffCardProps) {
  const [, navigate] = useLocation();
  const roles = getRoles(staff);
  const todayStr = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const thisMonth = now.getMonth() + 1;
  const thisYear = now.getFullYear();
  const isFreelancer = staff.staffType === "freelancer";

  const mine = earnings.filter(e => e.staffId === (staff.id as number));
  const todayTotal = mine.filter(e => e.earnedDate.slice(0, 10) === todayStr).reduce((s, e) => s + e.rate, 0);
  const monthTotal = mine.filter(e => {
    const d = new Date(e.earnedDate);
    return d.getMonth() + 1 === thisMonth && d.getFullYear() === thisYear;
  }).reduce((s, e) => s + e.rate, 0);
  const jobCount = mine.length;

  const statusClass = ({
    active: "bg-green-100 text-green-700",
    inactive: "bg-red-100 text-red-700",
    probation: "bg-yellow-100 text-yellow-700",
  } as Record<string, string>)[String(staff.status || "active")] || "bg-gray-100 text-gray-700";

  return (
    <div className={`border rounded-xl p-4 bg-card hover:shadow-sm transition-shadow flex flex-col gap-3 ${isFreelancer ? "border-purple-200 bg-purple-50/30" : ""}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <StaffAvatar
            name={String(staff.name || "?")}
            avatar={(staff as Record<string, unknown>).avatar as string | undefined}
            role={String(roles[0] || "assistant")}
            status={String(staff.status || "active")}
            isActive={Boolean(staff.isActive)}
            size="lg"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold truncate">{String(staff.name)}</span>
              {isFreelancer && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium shrink-0">CTV</span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">{String(staff.phone || "—")}</div>
          </div>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${statusClass}`}>
          {STATUS_MAP[String(staff.status || "active")] || "Đang làm"}
        </span>
      </div>

      <div className="flex flex-wrap gap-1">
        {roles.length === 0 ? (
          <span className="text-xs text-muted-foreground">Chưa có chức vụ</span>
        ) : roles.map(r => {
          const rd = ROLES.find(x => x.key === r);
          return (
            <Badge key={r} variant="secondary" className="text-xs">
              {rd?.icon} {rd?.label || r}
            </Badge>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-muted/50 rounded-lg p-2">
          <div className="text-xs text-muted-foreground leading-tight">Hôm nay</div>
          <div className="font-semibold text-sm text-green-600">{fmt(todayTotal)}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-2">
          <div className="text-xs text-muted-foreground leading-tight">Tháng này</div>
          <div className="font-semibold text-sm text-blue-600">{fmt(monthTotal)}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-2">
          <div className="text-xs text-muted-foreground leading-tight">Số job</div>
          <div className="font-semibold text-sm">{jobCount}</div>
        </div>
      </div>

      {(staff.baseSalaryAmount || staff.allowance) && (
        <div className="text-xs text-muted-foreground">
          {staff.baseSalaryAmount && <>Lương cứng: <span className="font-medium text-foreground">{fmt(parseFloat(String(staff.baseSalaryAmount)))}</span></>}
          {staff.allowance && <> · Phụ cấp: <span className="font-medium text-foreground">{fmt(parseFloat(String(staff.allowance)))}</span></>}
        </div>
      )}

      <button
        onClick={() => navigate(`/staff/${String(staff.id)}`)}
        className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg bg-primary/5 border border-primary/20 text-primary text-sm font-medium hover:bg-primary/10 transition-colors"
      >
        <UserCircle className="w-4 h-4" /> Xem hồ sơ chi tiết <ChevronRight className="w-3.5 h-3.5" />
      </button>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => onEdit(staff)}>
          <Pencil className="w-3.5 h-3.5" /> Sửa thông tin
        </Button>
        <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => onEditPrice(staff)}>
          <DollarSign className="w-3.5 h-3.5" /> Sửa bảng giá
        </Button>
      </div>
      {isAdmin && (
        <Button size="sm" variant="ghost" className="w-full gap-1.5 text-muted-foreground hover:text-foreground border border-dashed" onClick={() => onSetPassword(staff)}>
          <KeyRound className="w-3.5 h-3.5" /> Quản lý tài khoản đăng nhập
        </Button>
      )}
    </div>
  );
}

// ─── Account Management Dialog ────────────────────────────────────────────────
function SetPasswordDialog({ staff, onClose }: { staff: Record<string, unknown> | null; onClose: () => void }) {
  const { token } = useStaffAuth();
  const [username, setUsername] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  const staffName = String(staff?.name || "");
  const staffPhone = String(staff?.phone || "");

  useEffect(() => {
    if (!staff) return;
    setUsername((staff.username as string) || "");
    setNewPw(""); setConfirm(""); setErr(""); setDone(false);
  }, [staff?.id]);

  async function handleSave() {
    if (!staff) return;
    if (newPw && newPw.length < 4) { setErr("Mật khẩu phải có ít nhất 4 ký tự"); return; }
    if (newPw && newPw !== confirm) { setErr("Mật khẩu xác nhận không khớp"); return; }
    if (!username.trim() && !staffPhone) { setErr("Cần có tên đăng nhập hoặc số điện thoại"); return; }
    setSaving(true); setErr("");
    try {
      const body: Record<string, unknown> = { targetId: staff.id, username: username.trim() };
      if (newPw) body.newPassword = newPw;
      const res = await fetch(`${BASE}/api/auth/update-account`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { success?: boolean; error?: string };
      if (!res.ok) { setErr(data.error ?? "Lỗi cập nhật tài khoản"); return; }
      setDone(true);
    } catch { setErr("Lỗi kết nối máy chủ"); }
    finally { setSaving(false); }
  }

  const effectiveLogin = username.trim() || staffPhone || "—";

  return (
    <Dialog open={!!staff} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-primary" /> Quản lý tài khoản
          </DialogTitle>
        </DialogHeader>

        {done ? (
          <div className="py-6 text-center space-y-3">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-100 mx-auto">
              <ShieldCheck className="w-7 h-7 text-emerald-600" />
            </div>
            <p className="font-semibold text-emerald-700">Cập nhật thành công!</p>
            <p className="text-sm text-muted-foreground">
              Tài khoản <strong>{staffName}</strong> đã được cập nhật.
            </p>
            <div className="bg-muted/50 rounded-lg px-4 py-2 text-sm text-left space-y-1">
              <p><span className="text-muted-foreground">Đăng nhập bằng:</span> <span className="font-mono font-semibold">{effectiveLogin}</span></p>
              {newPw && <p className="text-muted-foreground">Mật khẩu đã được đổi</p>}
            </div>
            <Button className="w-full mt-1" onClick={onClose}>Đóng</Button>
          </div>
        ) : (
          <div className="space-y-4 py-1">
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm space-y-0.5">
              <p className="font-medium text-blue-800">{staffName}</p>
              {staffPhone && <p className="text-blue-600 text-xs">SĐT: {staffPhone}</p>}
              <p className="text-blue-600 text-xs">Đăng nhập hiện tại: <span className="font-mono font-semibold">{effectiveLogin}</span></p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Tên đăng nhập</Label>
              <Input
                placeholder={staffPhone || "Nhập tên đăng nhập tùy chọn"}
                value={username}
                onChange={e => setUsername(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {username.trim()
                  ? <>Đăng nhập bằng: <span className="font-mono font-medium">{username.trim()}</span></>
                  : staffPhone
                    ? <>Để trống → dùng SĐT <span className="font-mono font-medium">{staffPhone}</span></>
                    : "Cần nhập tên đăng nhập hoặc thêm SĐT"}
              </p>
            </div>

            <Separator />

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Mật khẩu mới <span className="text-muted-foreground font-normal">(để trống = không đổi)</span></Label>
              <div className="relative">
                <Input
                  type={showPw ? "text" : "password"}
                  placeholder="Ít nhất 4 ký tự"
                  value={newPw}
                  onChange={e => setNewPw(e.target.value)}
                  className="pr-10"
                />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {newPw && (
              <div className="space-y-1.5">
                <Label className="text-sm">Xác nhận mật khẩu</Label>
                <Input
                  type="password"
                  placeholder="Nhập lại mật khẩu"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                />
              </div>
            )}

            {err && <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{err}</p>}

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={onClose}>Hủy</Button>
              <Button className="flex-1 gap-1.5" onClick={handleSave} disabled={saving}>
                {saving ? "Đang lưu..." : <><ShieldCheck className="w-4 h-4" /> Lưu tài khoản</>}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Earnings Tab ─────────────────────────────────────────────────────────────
function EarningsTab({ staffList }: { staffList: Array<Record<string, unknown>> }) {
  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [staffId, setStaffId] = useState("all");
  const qc = useQueryClient();

  const { data: earnings = [] } = useQuery<Array<{
    id: number; staffId: number; staffName: string; role: string;
    serviceName: string; rate: number; earnedDate: string;
    month: number; year: number; status: string; bookingCode: string;
  }>>({
    queryKey: ["job-earnings", month, year, staffId],
    queryFn: () => {
      const params = new URLSearchParams({ month, year });
      if (staffId !== "all") params.set("staffId", staffId);
      return fetchJson(`${BASE}/api/job-earnings?${params}`);
    },
  });

  const markPaid = useMutation({
    mutationFn: (id: number) => fetchJson(`${BASE}/api/job-earnings/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "paid" }),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["job-earnings"] }),
  });

  const total = earnings.reduce((s, e) => s + e.rate, 0);
  const paid  = earnings.filter(e => e.status === "paid").reduce((s, e) => s + e.rate, 0);

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4">
        <Select value={staffId} onValueChange={setStaffId}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Tất cả nhân viên" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả nhân viên</SelectItem>
            {staffList.map(s => (
              <SelectItem key={String(s.id)} value={String(s.id)}>{String(s.name)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Array.from({ length: 12 }, (_, i) => (
              <SelectItem key={i + 1} value={String(i + 1)}>Tháng {i + 1}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[2024, 2025, 2026, 2027].map(y => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {earnings.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="border rounded-lg p-3 text-center">
            <div className="text-xs text-muted-foreground">Tổng thu nhập</div>
            <div className="font-bold">{fmt(total)}</div>
          </div>
          <div className="border rounded-lg p-3 text-center">
            <div className="text-xs text-muted-foreground">Đã thanh toán</div>
            <div className="font-bold text-green-600">{fmt(paid)}</div>
          </div>
          <div className="border rounded-lg p-3 text-center">
            <div className="text-xs text-muted-foreground">Chưa thanh toán</div>
            <div className="font-bold text-orange-600">{fmt(total - paid)}</div>
          </div>
        </div>
      )}

      {earnings.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <DollarSign className="w-12 h-12 mx-auto mb-2 opacity-30" />
          <p>Chưa có thu nhập trong kỳ này</p>
          <p className="text-xs mt-1">Thu nhập tự động ghi nhận khi job chuyển sang "Hoàn thành"</p>
        </div>
      ) : (
        <div className="space-y-2">
          {earnings.map(e => {
            const rd = ROLES.find(r => r.key === e.role);
            return (
              <div key={e.id} className="border rounded-lg p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{e.staffName}</div>
                  <div className="text-xs text-muted-foreground">
                    {rd?.icon} {rd?.label || e.role} · {e.serviceName}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {e.earnedDate.slice(0, 10)}{e.bookingCode ? ` · ${e.bookingCode}` : ""}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-semibold text-green-600">{fmt(e.rate)}</div>
                  {e.status === "paid" ? (
                    <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Đã trả</span>
                  ) : (
                    <button
                      className="text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full hover:bg-orange-100 transition-colors"
                      onClick={() => markPaid.mutate(e.id)}
                    >
                      Đánh dấu đã trả
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function StaffPage() {
  const [showForm, setShowForm] = useState(false);
  const [editStaff, setEditStaff] = useState<Record<string, unknown> | null>(null);
  const [priceStaff, setPriceStaff] = useState<Record<string, unknown> | null>(null);
  const [passwordStaff, setPasswordStaff] = useState<Record<string, unknown> | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "official" | "freelancer">("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [viewerSheet, setViewerSheet] = useState(false);
  const { viewer, setViewer, logout, isAdmin } = useStaffAuth();

  const { data: staffList = [] } = useQuery<Array<Record<string, unknown>>>({
    queryKey: ["staff"],
    queryFn: () => fetchJson(`${BASE}/api/staff`),
  });

  const { data: allEarnings = [] } = useQuery<Array<{ staffId: number; rate: number; earnedDate: string }>>({
    queryKey: ["job-earnings-all"],
    queryFn: () => fetchJson(`${BASE}/api/job-earnings`),
  });

  const filtered = staffList.filter(s => {
    if (typeFilter === "official" && s.staffType !== "official" && s.staffType !== null && s.staffType !== undefined && s.staffType !== "") return false;
    if (typeFilter === "freelancer" && s.staffType !== "freelancer") return false;
    if (roleFilter !== "all" && !getRoles(s).includes(roleFilter)) return false;
    if (search && !String(s.name || "").toLowerCase().includes(search.toLowerCase()) && !String(s.phone || "").includes(search)) return false;
    return true;
  });

  const officialCount = staffList.filter(s => s.staffType !== "freelancer").length;
  const freelancerCount = staffList.filter(s => s.staffType === "freelancer").length;
  const now = new Date();
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayTotal = allEarnings.filter(e => e.earnedDate.slice(0, 10) === todayStr).reduce((s, e) => s + e.rate, 0);
  const monthTotal = allEarnings.filter(e => {
    const d = new Date(e.earnedDate);
    return d.getMonth() + 1 === now.getMonth() + 1 && d.getFullYear() === now.getFullYear();
  }).reduce((s, e) => s + e.rate, 0);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="w-6 h-6" /> Nhân sự & Lương
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Mỗi nhân viên có bảng giá cá nhân riêng</p>
        </div>
        <Button onClick={() => { setEditStaff(null); setShowForm(true); }} className="gap-1.5">
          <Plus className="w-4 h-4" /> Thêm nhân viên
        </Button>
      </div>

      {/* ── Viewer selector ─────────────────────────────────────── */}
      <div className={`flex items-center gap-3 p-3 rounded-xl border mb-5 ${viewer ? "bg-emerald-50/50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
        {viewer ? (() => {
          const vs = staffList.find(s => s.id === viewer.id);
          return (
            <StaffAvatar
              name={viewer.name}
              avatar={(vs as Record<string, unknown> | undefined)?.avatar as string | undefined}
              role={viewer.role}
              status="active"
              size="md"
            />
          );
        })() : (
          <UserCircle className="w-8 h-8 flex-shrink-0 text-amber-500" />
        )}
        <div className="flex-1 min-w-0">
          {viewer ? (
            <>
              <p className="text-sm font-semibold truncate">{viewer.name}</p>
              <p className="text-xs text-muted-foreground">{viewer.isAdmin ? "👑 Quản lý — xem được tất cả hồ sơ" : "Đang xem hồ sơ của chính mình"}</p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-amber-700">Bạn là ai?</p>
              <p className="text-xs text-muted-foreground">Chọn tài khoản để xem hồ sơ cá nhân</p>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => setViewerSheet(true)} className="text-xs px-3 py-1.5 rounded-lg bg-white border border-border font-medium hover:bg-muted transition-colors">
            {viewer ? "Đổi" : "Chọn tài khoản"}
          </button>
          {viewer && (
            <button onClick={logout} className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors" title="Đăng xuất">
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="border rounded-lg p-3 text-center">
          <div className="text-2xl font-bold">{officialCount}</div>
          <div className="text-xs text-muted-foreground">Nhân viên chính thức</div>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-purple-600">{freelancerCount}</div>
          <div className="text-xs text-muted-foreground">Cộng tác viên (CTV)</div>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <div className="text-sm font-bold text-blue-600">{fmt(monthTotal)}</div>
          <div className="text-xs text-muted-foreground">Thu nhập tháng này</div>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <div className="text-sm font-bold text-orange-600">{fmt(todayTotal)}</div>
          <div className="text-xs text-muted-foreground">Thu nhập hôm nay</div>
        </div>
      </div>

      <Tabs defaultValue="staff">
        <TabsList className="mb-4">
          <TabsTrigger value="staff">Danh sách nhân viên</TabsTrigger>
          <TabsTrigger value="earnings">Thu nhập theo tháng</TabsTrigger>
        </TabsList>

        <TabsContent value="staff">
          {/* Filters */}
          <div className="flex flex-wrap gap-2 mb-4">
            <Input
              placeholder="Tìm theo tên, số điện thoại..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <div className="flex gap-1 bg-muted rounded-lg p-1">
              {(["all","official","freelancer"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${typeFilter === t ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {t === "all" ? "Tất cả" : t === "official" ? "Chính thức" : "CTV"}
                </button>
              ))}
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-44 h-9 text-sm">
                <SelectValue placeholder="Lọc theo vai trò" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả vai trò</SelectItem>
                {ROLES.map(r => (
                  <SelectItem key={r.key} value={r.key}>{r.icon} {r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Không tìm thấy nhân viên</p>
              <p className="text-sm mt-1">Thử thay đổi bộ lọc hoặc bấm "Thêm nhân viên"</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(s => (
                <StaffCard
                  key={String(s.id)}
                  staff={s}
                  earnings={allEarnings}
                  onEdit={s => { setEditStaff(s); setShowForm(true); }}
                  onEditPrice={setPriceStaff}
                  onSetPassword={setPasswordStaff}
                  isAdmin={!!isAdmin}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="earnings">
          <EarningsTab staffList={staffList} />
        </TabsContent>
      </Tabs>

      <StaffFormSheet
        open={showForm}
        onClose={() => { setShowForm(false); setEditStaff(null); }}
        editStaff={editStaff}
      />

      <PriceEditDialog
        staff={priceStaff}
        onClose={() => setPriceStaff(null)}
      />

      <SetPasswordDialog
        staff={passwordStaff}
        onClose={() => setPasswordStaff(null)}
      />

      {/* ── Chọn tài khoản ─────────────────────────────────────── */}
      <Sheet open={viewerSheet} onOpenChange={setViewerSheet}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[80vh] overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              <UserCircle className="w-5 h-5 text-primary" /> Chọn tài khoản của bạn
            </SheetTitle>
          </SheetHeader>
          <p className="text-sm text-muted-foreground mb-4">
            Chọn tên của bạn để đăng nhập và xem hồ sơ cá nhân. Admin có thể xem tất cả hồ sơ.
          </p>
          <div className="space-y-2">
            {staffList.map(s => {
              const roles = getRoles(s);
              const isAdm = roles.includes("admin");
              const isMe = viewer?.id === (s.id as number);
              return (
                <button
                  key={String(s.id)}
                  onClick={() => {
                    const v: ViewerUser = {
                      id: s.id as number,
                      name: String(s.name),
                      role: String(s.role || "assistant"),
                      roles: getRoles(s),
                      isAdmin: isAdm,
                    };
                    setViewer(v);
                    setViewerSheet(false);
                  }}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${isMe ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"}`}
                >
                  <StaffAvatar
                    name={String(s.name || "?")}
                    avatar={(s as Record<string, unknown>).avatar as string | undefined}
                    role={String(s.role || "assistant")}
                    status={String(s.status || "active")}
                    isActive={Boolean(s.isActive)}
                    size="md"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{String(s.name)}</p>
                    <p className="text-xs text-muted-foreground">
                      {roles.map(r => ({ admin: "Quản lý", photographer: "Nhiếp ảnh", makeup: "Trang điểm", sale: "Kinh doanh", photoshop: "Chỉnh sửa", assistant: "Hỗ trợ", marketing: "Marketing" }[r] || r)).join(", ")}
                    </p>
                  </div>
                  {isMe && <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">Đang dùng</span>}
                  {isAdm && !isMe && <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Admin</span>}
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
