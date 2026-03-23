import { useGetAccountingSummary, useListStaff, useListTransactions } from "@workspace/api-client-react";
import { formatVND, formatDate } from "@/lib/utils";
import { Card, CardContent, Badge, Button, Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui";
import { Plus, TrendingUp, TrendingDown, DollarSign, Briefcase } from "lucide-react";

export default function AccountingHrPage() {
  const { data: summary, isLoading: loadingSummary } = useGetAccountingSummary();
  const { data: transactions = [], isLoading: loadingTrans } = useListTransactions();
  const { data: staff = [], isLoading: loadingStaff } = useListStaff();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Kế toán & Nhân sự</h1>
          <p className="text-muted-foreground mt-1">Quản lý tài chính và đội ngũ nhân viên</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2 text-destructive"><TrendingDown className="w-4 h-4"/> Thêm Phiếu Chi</Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"><TrendingUp className="w-4 h-4"/> Thêm Phiếu Thu</Button>
        </div>
      </div>

      <Tabs defaultValue="accounting" className="w-full">
        <TabsList className="grid w-[300px] grid-cols-2 mb-6">
          <TabsTrigger value="accounting">Kế toán</TabsTrigger>
          <TabsTrigger value="hr">Nhân sự</TabsTrigger>
        </TabsList>

        <TabsContent value="accounting" className="space-y-6">
          {loadingSummary ? <div className="p-8 text-center">Đang tải...</div> : summary && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800">
                <CardContent className="p-6">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-medium text-emerald-800 dark:text-emerald-400 mb-1">TỔNG THU THÁNG NÀY</p>
                      <h3 className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{formatVND(summary.totalIncome)}</h3>
                    </div>
                    <div className="p-3 bg-emerald-200 dark:bg-emerald-800 rounded-xl text-emerald-700 dark:text-emerald-300">
                      <TrendingUp className="w-5 h-5" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-rose-50 dark:bg-rose-900/10 border-rose-200 dark:border-rose-800">
                <CardContent className="p-6">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-medium text-rose-800 dark:text-rose-400 mb-1">TỔNG CHI THÁNG NÀY</p>
                      <h3 className="text-2xl font-bold text-rose-700 dark:text-rose-300">{formatVND(summary.totalExpense)}</h3>
                    </div>
                    <div className="p-3 bg-rose-200 dark:bg-rose-800 rounded-xl text-rose-700 dark:text-rose-300">
                      <TrendingDown className="w-5 h-5" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800">
                <CardContent className="p-6">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-medium text-blue-800 dark:text-blue-400 mb-1">LỢI NHUẬN</p>
                      <h3 className="text-2xl font-bold text-blue-700 dark:text-blue-300">{formatVND(summary.profit)}</h3>
                      <p className="text-sm font-bold text-blue-600 mt-2 bg-blue-200/50 inline-block px-2 py-0.5 rounded-full">Biên: {summary.profitPercent.toFixed(1)}%</p>
                    </div>
                    <div className="p-3 bg-blue-200 dark:bg-blue-800 rounded-xl text-blue-700 dark:text-blue-300">
                      <DollarSign className="w-5 h-5" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <Card>
            <div className="p-6 border-b">
              <h3 className="text-lg font-bold">Lịch sử giao dịch</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-muted/50 text-muted-foreground uppercase text-xs font-semibold">
                  <tr>
                    <th className="px-6 py-4">Ngày</th>
                    <th className="px-6 py-4">Mô tả</th>
                    <th className="px-6 py-4">Phân loại</th>
                    <th className="px-6 py-4">Hình thức</th>
                    <th className="px-6 py-4 text-right">Số tiền</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loadingTrans ? (
                    <tr><td colSpan={5} className="text-center p-8">Đang tải...</td></tr>
                  ) : (
                    transactions.map(t => (
                      <tr key={t.id} className="hover:bg-muted/30">
                        <td className="px-6 py-4 text-muted-foreground">{formatDate(t.transactionDate)}</td>
                        <td className="px-6 py-4 font-medium">{t.description}</td>
                        <td className="px-6 py-4">
                          <Badge variant="outline">{t.category}</Badge>
                        </td>
                        <td className="px-6 py-4 uppercase text-xs">{t.paymentMethod.replace('_', ' ')}</td>
                        <td className={`px-6 py-4 text-right font-bold ${t.type === 'income' ? 'text-emerald-600' : 'text-destructive'}`}>
                          {t.type === 'income' ? '+' : '-'}{formatVND(t.amount)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="hr">
          <Card>
            <div className="p-6 border-b flex justify-between items-center">
              <h3 className="text-lg font-bold">Danh sách nhân sự</h3>
              <Button size="sm" className="gap-2"><Plus className="w-4 h-4" /> Thêm nhân viên</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-muted/50 text-muted-foreground uppercase text-xs font-semibold">
                  <tr>
                    <th className="px-6 py-4">Nhân viên</th>
                    <th className="px-6 py-4">Chức vụ</th>
                    <th className="px-6 py-4">Ngày vào làm</th>
                    <th className="px-6 py-4 text-right">Mức lương</th>
                    <th className="px-6 py-4 text-center">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loadingStaff ? (
                    <tr><td colSpan={5} className="text-center p-8">Đang tải...</td></tr>
                  ) : (
                    staff.map(s => (
                      <tr key={s.id} className="hover:bg-muted/30">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-secondary-foreground font-bold">
                              {s.name.charAt(0)}
                            </div>
                            <div>
                              <p className="font-medium text-foreground">{s.name}</p>
                              <p className="text-xs text-muted-foreground">{s.phone}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant="secondary" className="capitalize">
                            {s.role === 'admin' ? 'Quản lý' : 
                             s.role === 'photographer' ? 'Nhiếp ảnh gia' : 
                             s.role === 'receptionist' ? 'Lễ tân' : 'Trợ lý'}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-muted-foreground">{formatDate(s.joinDate)}</td>
                        <td className="px-6 py-4 text-right font-medium">{formatVND(s.salary)}</td>
                        <td className="px-6 py-4 text-center">
                          {s.isActive ? <Badge variant="success">Đang làm</Badge> : <Badge variant="destructive">Đã nghỉ</Badge>}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
