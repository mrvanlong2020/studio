import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetAccountingSummary, useListStaff, useListTransactions } from "@workspace/api-client-react";
import { formatVND, formatDate } from "@/lib/utils";
import { Button, Input, Select, Textarea, Dialog, DialogContent, DialogHeader, DialogTitle, Badge, Tabs, TabsList, TabsTrigger, TabsContent, Card, CardContent } from "@/components/ui";
import { Plus, TrendingUp, TrendingDown, DollarSign, Briefcase, Receipt, Users, Wallet, Trash2, Edit, User, ExternalLink } from "lucide-react";
import { Link } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const fetchJson = (url: string, opts?: RequestInit) =>
  fetch(`${BASE}${url}`, { headers: { "Content-Type": "application/json" }, ...opts }).then(r => r.json());

const EXPENSE_CAT: Record<string, string> = {
  salary: "Lương nhân viên", equipment: "Thiết bị", transport: "Đi lại",
  marketing: "Marketing", venue: "Địa điểm chụp", supplies: "Vật tư", utilities: "Điện nước", other: "Khác",
};

const PAYROLL_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: "Chưa thanh toán", color: "text-yellow-700" },
  paid: { label: "Đã thanh toán", color: "text-green-700" },
  cancelled: { label: "Đã hủy", color: "text-red-700" },
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Quản lý", photographer: "Nhiếp ảnh gia", editor: "Chỉnh sửa ảnh",
  receptionist: "Lễ tân", assistant: "Trợ lý",
};

export default function AccountingHrPage() {
  const qc = useQueryClient();
  const { data: summary, isLoading: loadingSummary } = useGetAccountingSummary();
  const { data: transactions = [] } = useListTransactions();
  const { data: staff = [] } = useListStaff();

  const { data: expenses = [] } = useQuery<any[]>({
    queryKey: ["expenses"],
    queryFn: () => fetchJson("/api/expenses"),
  });

  const { data: payrolls = [] } = useQuery<any[]>({
    queryKey: ["payrolls"],
    queryFn: () => fetchJson("/api/payrolls"),
  });

  // Expense form
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expForm, setExpForm] = useState({ description: "", amount: "", category: "other", type: "fixed", expenseDate: "", paymentMethod: "cash", bookingId: "", notes: "" });

  // Payroll form
  const [showPayrollForm, setShowPayrollForm] = useState(false);
  const [prForm, setPrForm] = useState({ staffId: "", month: String(new Date().getMonth() + 1), year: String(new Date().getFullYear()), baseSalary: "", bonus: "0", deduction: "0", notes: "" });

  const createExpense = useMutation({
    mutationFn: (data: Record<string, unknown>) => fetchJson("/api/expenses", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["expenses"] }); setShowExpenseForm(false); setExpForm({ description: "", amount: "", category: "other", type: "fixed", expenseDate: "", paymentMethod: "cash", bookingId: "", notes: "" }); },
  });

  const deleteExpense = useMutation({
    mutationFn: (id: number) => fetch(`${BASE}/api/expenses/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expenses"] }),
  });

  const createPayroll = useMutation({
    mutationFn: (data: Record<string, unknown>) => fetchJson("/api/payrolls", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["payrolls"] }); setShowPayrollForm(false); setPrForm({ staffId: "", month: String(new Date().getMonth() + 1), year: String(new Date().getFullYear()), baseSalary: "", bonus: "0", deduction: "0", notes: "" }); },
  });

  const updatePayroll = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) => fetchJson(`/api/payrolls/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payrolls"] }),
  });

  const totalExpenses = expenses.reduce((s: number, e: any) => s + parseFloat(e.amount || 0), 0);
  const totalPayrolls = payrolls.reduce((s: number, p: any) => s + parseFloat(p.netSalary || 0), 0);
  const pendingPayrolls = payrolls.filter((p: any) => p.status === "pending");

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold">Kế toán & Nhân sự</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Quản lý tài chính, chi phí và đội ngũ nhân viên</p>
        </div>
      </div>

      <div className="flex items-center justify-end mb-2">
        <Link href="/staff" className="flex items-center gap-1.5 text-sm text-primary hover:underline font-medium">
          <ExternalLink className="w-3.5 h-3.5" />Quản lý Nhân sự & Lương
        </Link>
      </div>

      <Tabs defaultValue="accounting" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="accounting">Kế toán</TabsTrigger>
          <TabsTrigger value="expenses">Chi phí</TabsTrigger>
          <TabsTrigger value="payroll">Bảng lương</TabsTrigger>
        </TabsList>

        {/* ACCOUNTING TAB */}
        <TabsContent value="accounting" className="space-y-4">
          {loadingSummary ? <div className="p-8 text-center text-muted-foreground">Đang tải...</div> : summary && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-xl border bg-gradient-to-br from-emerald-50 to-card border-emerald-200 p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-medium text-emerald-800">TỔNG THU THÁNG NÀY</p>
                    <h3 className="text-2xl font-bold text-emerald-700 mt-1">{formatVND(summary.totalIncome)}</h3>
                  </div>
                  <div className="p-2.5 bg-emerald-200 rounded-xl text-emerald-700"><TrendingUp className="w-5 h-5" /></div>
                </div>
              </div>
              <div className="rounded-xl border bg-gradient-to-br from-rose-50 to-card border-rose-200 p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-medium text-rose-800">TỔNG CHI THÁNG NÀY</p>
                    <h3 className="text-2xl font-bold text-rose-700 mt-1">{formatVND(summary.totalExpense)}</h3>
                  </div>
                  <div className="p-2.5 bg-rose-200 rounded-xl text-rose-700"><TrendingDown className="w-5 h-5" /></div>
                </div>
              </div>
              <div className="rounded-xl border bg-gradient-to-br from-blue-50 to-card border-blue-200 p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-medium text-blue-800">LỢI NHUẬN</p>
                    <h3 className="text-2xl font-bold text-blue-700 mt-1">{formatVND(summary.profit)}</h3>
                    <p className="text-xs font-bold text-blue-600 mt-1 bg-blue-100 inline-block px-2 py-0.5 rounded-full">Biên: {summary.profitPercent?.toFixed(1) ?? 0}%</p>
                  </div>
                  <div className="p-2.5 bg-blue-200 rounded-xl text-blue-700"><DollarSign className="w-5 h-5" /></div>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-xl border overflow-hidden">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="font-bold">Lịch sử giao dịch</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold">
                  <tr>
                    <th className="px-4 py-3 text-left">Ngày</th>
                    <th className="px-4 py-3 text-left">Mô tả</th>
                    <th className="px-4 py-3 text-left">Danh mục</th>
                    <th className="px-4 py-3 text-left">Hình thức</th>
                    <th className="px-4 py-3 text-right">Số tiền</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {transactions.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">Chưa có giao dịch</td></tr>}
                  {transactions.map((t: any) => (
                    <tr key={t.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(t.transactionDate)}</td>
                      <td className="px-4 py-3 font-medium">{t.description}</td>
                      <td className="px-4 py-3"><Badge variant="outline">{t.category}</Badge></td>
                      <td className="px-4 py-3 text-xs uppercase">{t.paymentMethod?.replace("_", " ")}</td>
                      <td className={`px-4 py-3 text-right font-bold ${t.type === "income" ? "text-emerald-600" : "text-destructive"}`}>
                        {t.type === "income" ? "+" : "-"}{formatVND(t.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* EXPENSES TAB */}
        <TabsContent value="expenses" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-3">
              <div className="rounded-xl border bg-red-50 border-red-200 p-3">
                <p className="text-xs text-red-700">Tổng chi phí</p>
                <p className="text-xl font-bold text-red-600">{formatVND(totalExpenses)}</p>
              </div>
              <div className="rounded-xl border bg-card p-3">
                <p className="text-xs text-muted-foreground">Số khoản</p>
                <p className="text-xl font-bold">{expenses.length}</p>
              </div>
            </div>
            <Button onClick={() => setShowExpenseForm(true)} className="gap-1.5">
              <Plus className="w-4 h-4" /> Thêm chi phí
            </Button>
          </div>

          {showExpenseForm && (
            <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
              <h4 className="font-semibold text-sm">Thêm khoản chi phí mới</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><label className="text-xs font-medium text-muted-foreground">Mô tả *</label><Input placeholder="VD: Mua đèn studio..." value={expForm.description} onChange={e => setExpForm(f => ({ ...f, description: e.target.value }))} /></div>
                <div><label className="text-xs font-medium text-muted-foreground">Số tiền *</label><Input type="number" placeholder="0" value={expForm.amount} onChange={e => setExpForm(f => ({ ...f, amount: e.target.value }))} /></div>
                <div><label className="text-xs font-medium text-muted-foreground">Danh mục</label>
                  <Select value={expForm.category} onChange={e => setExpForm(f => ({ ...f, category: e.target.value }))}>
                    {Object.entries(EXPENSE_CAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                </div>
                <div><label className="text-xs font-medium text-muted-foreground">Ngày chi</label><Input type="date" value={expForm.expenseDate} onChange={e => setExpForm(f => ({ ...f, expenseDate: e.target.value }))} /></div>
                <div><label className="text-xs font-medium text-muted-foreground">Hình thức thanh toán</label>
                  <Select value={expForm.paymentMethod} onChange={e => setExpForm(f => ({ ...f, paymentMethod: e.target.value }))}>
                    <option value="cash">Tiền mặt</option>
                    <option value="transfer">Chuyển khoản</option>
                    <option value="card">Thẻ</option>
                  </Select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => createExpense.mutate({ ...expForm, amount: parseFloat(expForm.amount) })} disabled={!expForm.description || !expForm.amount || createExpense.isPending}>
                  {createExpense.isPending ? "Đang lưu..." : "Lưu chi phí"}
                </Button>
                <Button variant="outline" onClick={() => setShowExpenseForm(false)}>Hủy</Button>
              </div>
            </div>
          )}

          <div className="rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3 text-left">Ngày</th>
                  <th className="px-4 py-3 text-left">Mô tả</th>
                  <th className="px-4 py-3 text-left">Danh mục</th>
                  <th className="px-4 py-3 text-left">Hình thức</th>
                  <th className="px-4 py-3 text-right">Số tiền</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {expenses.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-muted-foreground">Chưa có khoản chi phí nào</td></tr>}
                {expenses.map((e: any) => (
                  <tr key={e.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(e.expenseDate)}</td>
                    <td className="px-4 py-3 font-medium">{e.description}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{EXPENSE_CAT[e.category] ?? e.category}</td>
                    <td className="px-4 py-3 text-xs">{e.paymentMethod === "cash" ? "Tiền mặt" : e.paymentMethod === "transfer" ? "Chuyển khoản" : e.paymentMethod}</td>
                    <td className="px-4 py-3 text-right font-bold text-red-600">{formatVND(e.amount)}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => { if (confirm("Xóa chi phí?")) deleteExpense.mutate(e.id); }} className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* PAYROLL TAB */}
        <TabsContent value="payroll" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-3">
              <div className="rounded-xl border bg-blue-50 border-blue-200 p-3">
                <p className="text-xs text-blue-700">Tổng bảng lương</p>
                <p className="text-xl font-bold text-blue-600">{formatVND(totalPayrolls)}</p>
              </div>
              <div className="rounded-xl border bg-yellow-50 border-yellow-200 p-3">
                <p className="text-xs text-yellow-700">Chưa thanh toán</p>
                <p className="text-xl font-bold text-yellow-600">{pendingPayrolls.length} phiếu</p>
              </div>
            </div>
            <Button onClick={() => setShowPayrollForm(true)} className="gap-1.5">
              <Plus className="w-4 h-4" /> Tạo phiếu lương
            </Button>
          </div>

          {showPayrollForm && (
            <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
              <h4 className="font-semibold text-sm">Tạo phiếu lương mới</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Nhân viên *</label>
                  <Select value={prForm.staffId} onChange={e => {
                    const s = staff.find((x: any) => x.id === parseInt(e.target.value));
                    setPrForm(f => ({ ...f, staffId: e.target.value, baseSalary: s ? String(s.salary) : f.baseSalary }));
                  }}>
                    <option value="">-- Chọn nhân viên --</option>
                    {staff.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Tháng *</label>
                  <Select value={prForm.month} onChange={e => setPrForm(f => ({ ...f, month: e.target.value }))}>
                    {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={String(i + 1)}>Tháng {i + 1}</option>)}
                  </Select>
                </div>
                <div><label className="text-xs font-medium text-muted-foreground">Năm *</label><Input type="number" placeholder="2026" value={prForm.year} onChange={e => setPrForm(f => ({ ...f, year: e.target.value }))} /></div>
                <div><label className="text-xs font-medium text-muted-foreground">Lương cơ bản</label><Input type="number" placeholder="0" value={prForm.baseSalary} onChange={e => setPrForm(f => ({ ...f, baseSalary: e.target.value }))} /></div>
                <div><label className="text-xs font-medium text-muted-foreground">Thưởng</label><Input type="number" placeholder="0" value={prForm.bonus} onChange={e => setPrForm(f => ({ ...f, bonus: e.target.value }))} /></div>
                <div><label className="text-xs font-medium text-muted-foreground">Khấu trừ</label><Input type="number" placeholder="0" value={prForm.deduction} onChange={e => setPrForm(f => ({ ...f, deduction: e.target.value }))} /></div>
                <div><label className="text-xs font-medium text-muted-foreground">Lương thực nhận</label>
                  <div className="h-10 flex items-center px-3 rounded-xl border bg-primary/5 font-bold text-primary text-sm">
                    {formatVND((parseFloat(prForm.baseSalary || "0") + parseFloat(prForm.bonus || "0")) - parseFloat(prForm.deduction || "0"))}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => createPayroll.mutate({
                  staffId: parseInt(prForm.staffId), month: parseInt(prForm.month), year: parseInt(prForm.year),
                  baseSalary: parseFloat(prForm.baseSalary), bonus: parseFloat(prForm.bonus || "0"),
                  deductions: parseFloat(prForm.deduction || "0"),
                  netSalary: (parseFloat(prForm.baseSalary) + parseFloat(prForm.bonus || "0")) - parseFloat(prForm.deduction || "0"),
                })} disabled={!prForm.staffId || !prForm.month || !prForm.baseSalary || createPayroll.isPending}>
                  {createPayroll.isPending ? "Đang tạo..." : "Tạo phiếu lương"}
                </Button>
                <Button variant="outline" onClick={() => setShowPayrollForm(false)}>Hủy</Button>
              </div>
            </div>
          )}

          <div className="rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3 text-left">Nhân viên</th>
                  <th className="px-4 py-3 text-left">Kỳ lương</th>
                  <th className="px-4 py-3 text-right">Cơ bản</th>
                  <th className="px-4 py-3 text-right">Thưởng</th>
                  <th className="px-4 py-3 text-right">Khấu trừ</th>
                  <th className="px-4 py-3 text-right">Thực nhận</th>
                  <th className="px-4 py-3 text-center">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payrolls.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-muted-foreground">Chưa có phiếu lương nào</td></tr>}
                {payrolls.map((p: any) => {
                  const ps = PAYROLL_STATUS[p.status] ?? PAYROLL_STATUS.pending;
                  const staffMember = staff.find((s: any) => s.id === p.staffId);
                  return (
                    <tr key={p.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs">
                            {(p.staffName || staffMember?.name || "?").charAt(0)}
                          </div>
                          <span className="font-medium">{p.staffName || staffMember?.name || "—"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">T{p.month}/{p.year}</td>
                      <td className="px-4 py-3 text-right">{formatVND(p.baseSalary)}</td>
                      <td className="px-4 py-3 text-right text-green-600">{parseFloat(p.bonus || 0) > 0 ? `+${formatVND(p.bonus)}` : "—"}</td>
                      <td className="px-4 py-3 text-right text-red-600">{parseFloat(p.deductions || 0) > 0 ? `-${formatVND(p.deductions)}` : "—"}</td>
                      <td className="px-4 py-3 text-right font-bold text-primary">{formatVND(p.netSalary)}</td>
                      <td className="px-4 py-3 text-center">
                        <select
                          value={p.status}
                          onChange={e => updatePayroll.mutate({ id: p.id, data: { status: e.target.value } })}
                          className={`text-xs font-medium rounded-lg border px-2 py-1 bg-background ${ps.color} cursor-pointer`}
                        >
                          {Object.entries(PAYROLL_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
