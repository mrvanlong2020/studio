import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus, X, Funnel, UserCheck } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function authFetch(url: string, opts: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem("amazingStudioToken_v2");
  const headers = { ...(opts.headers as Record<string, string> ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  return fetch(url, { ...opts, headers });
}

type CrmLead = {
  id: number;
  name: string;
  phone: string;
  message: string | null;
  source: string | null;
  status: string | null;
  createdAt: string;
};

const STATUS_OPTIONS = [
  { value: "new",      label: "Mới",       color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  { value: "chatting", label: "Đang trao đổi", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  { value: "hot",      label: "Hot",       color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  { value: "lost",     label: "Mất",       color: "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500" },
];

function statusMeta(status: string | null) {
  return STATUS_OPTIONS.find(s => s.value === status) ?? STATUS_OPTIONS[0];
}

const SOURCE_OPTIONS = [
  "facebook", "zalo", "instagram", "website", "giới thiệu", "khác"
];

const EMPTY_FORM = { name: "", phone: "", message: "", source: "facebook" };

export default function CrmLeadsPage() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");

  const { data: leads = [], isLoading } = useQuery<CrmLead[]>({
    queryKey: ["crm-leads"],
    queryFn: () => authFetch(`${BASE}/api/crm-leads`).then(r => { if (!r.ok) throw new Error("Lỗi tải dữ liệu"); return r.json(); }),
  });

  const patchStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      authFetch(`${BASE}/api/crm-leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm-leads"] }),
  });

  const createLead = useMutation({
    mutationFn: (data: typeof EMPTY_FORM) =>
      authFetch(`${BASE}/api/crm-leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(async r => {
        if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Lỗi"); }
        return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-leads"] });
      setShowModal(false);
      setForm(EMPTY_FORM);
      setFormError("");
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const convertLead = useMutation({
    mutationFn: (leadId: number) =>
      authFetch(`${BASE}/api/crm-leads/${leadId}/convert-to-customer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }).then(async r => {
        if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Lỗi"); }
        return r.json();
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm-leads"] }),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!form.name.trim()) { setFormError("Vui lòng nhập tên khách"); return; }
    if (!form.phone.trim()) { setFormError("Vui lòng nhập số điện thoại"); return; }
    createLead.mutate(form);
  }

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
            <Funnel className="w-5 h-5 text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">CRM Leads</h1>
            <p className="text-sm text-muted-foreground">Khách tiềm năng</p>
          </div>
        </div>
        <button
          onClick={() => { setShowModal(true); setForm(EMPTY_FORM); setFormError(""); }}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors">
          <UserPlus className="w-4 h-4" />
          Thêm lead
        </button>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Đang tải...</div>
        ) : leads.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">
            Chưa có khách tiềm năng nào. Nhấn "+ Thêm lead" để bắt đầu.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Tên</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">SĐT</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Nội dung</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Nguồn</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Trạng thái</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Ngày tạo</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Hành động</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead, i) => {
                  const meta = statusMeta(lead.status);
                  return (
                    <tr key={lead.id} className={`border-b border-border last:border-0 hover:bg-muted/20 transition-colors ${i % 2 === 0 ? "" : "bg-muted/10"}`}>
                      <td className="px-4 py-3 font-medium text-foreground">{lead.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{lead.phone}</td>
                      <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">{lead.message ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground capitalize">{lead.source ?? "—"}</td>
                      <td className="px-4 py-3">
                        <div className="relative inline-block">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${meta.color}`}>
                            {meta.label}
                          </span>
                          <select
                            value={lead.status ?? "new"}
                            onChange={e => patchStatus.mutate({ id: lead.id, status: e.target.value })}
                            className="absolute inset-0 opacity-0 cursor-pointer w-full"
                            title="Đổi trạng thái">
                            {STATUS_OPTIONS.map(s => (
                              <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{formatDate(lead.createdAt)}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => convertLead.mutate(lead.id)}
                          disabled={convertLead.isPending}
                          title="Chuyển lead này thành khách hàng"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap">
                          <UserCheck className="w-3.5 h-3.5" />
                          {convertLead.isPending ? "Đang..." : "Chuyển"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Lead Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="text-lg font-semibold">Thêm khách tiềm năng</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Tên khách <span className="text-destructive">*</span></label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Nguyễn Văn A"
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Số điện thoại <span className="text-destructive">*</span></label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="0901 234 567"
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Nội dung / Ghi chú</label>
                <textarea
                  value={form.message}
                  onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                  placeholder="Khách hỏi về gói chụp cưới..."
                  rows={3}
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Nguồn</label>
                <select
                  value={form.source}
                  onChange={e => setForm(f => ({ ...f, source: e.target.value }))}
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30">
                  {SOURCE_OPTIONS.map(s => (
                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                  ))}
                </select>
              </div>
              {formError && (
                <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{formError}</p>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 border border-border px-4 py-2 rounded-xl text-sm font-medium hover:bg-muted transition-colors">
                  Hủy
                </button>
                <button type="submit" disabled={createLead.isPending}
                  className="flex-1 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
                  {createLead.isPending ? "Đang lưu..." : "Thêm lead"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
