import { useListQuotes } from "@workspace/api-client-react";
import { formatVND, formatDate } from "@/lib/utils";
import { Card, CardContent, Badge, Button } from "@/components/ui";
import { Plus, FileText, Download, Send } from "lucide-react";

export default function QuotesPage() {
  const { data: quotes = [], isLoading } = useListQuotes({});

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Báo giá</h1>
          <p className="text-muted-foreground mt-1">Quản lý các báo giá đã gửi cho khách hàng</p>
        </div>
        <Button className="gap-2"><Plus className="w-4 h-4"/> Tạo báo giá mới</Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-muted/50 text-muted-foreground uppercase text-xs font-semibold">
              <tr>
                <th className="px-6 py-4">Khách hàng</th>
                <th className="px-6 py-4">Tên báo giá</th>
                <th className="px-6 py-4">Ngày tạo</th>
                <th className="px-6 py-4 text-right">Tổng tiền</th>
                <th className="px-6 py-4 text-center">Trạng thái</th>
                <th className="px-6 py-4 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">Đang tải...</td></tr>
              ) : quotes.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-12 flex flex-col items-center">
                  <FileText className="w-12 h-12 text-muted-foreground/30 mb-4" />
                  <p className="text-muted-foreground">Chưa có báo giá nào</p>
                </td></tr>
              ) : (
                quotes.map(q => (
                  <tr key={q.id} className="hover:bg-muted/30">
                    <td className="px-6 py-4">
                      <p className="font-semibold">{q.customerName}</p>
                      <p className="text-xs text-muted-foreground">{q.customerPhone}</p>
                    </td>
                    <td className="px-6 py-4 font-medium">{q.title}</td>
                    <td className="px-6 py-4 text-muted-foreground">{formatDate(q.createdAt)}</td>
                    <td className="px-6 py-4 text-right font-bold text-primary">{formatVND(q.finalAmount)}</td>
                    <td className="px-6 py-4 text-center">
                      <Badge variant={q.status === 'accepted' ? 'success' : q.status === 'sent' ? 'default' : 'secondary'}>
                        {q.status === 'accepted' ? 'Đã chốt' : q.status === 'sent' ? 'Đã gửi' : 'Nháp'}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Button variant="ghost" size="icon" className="text-blue-500"><Send className="w-4 h-4"/></Button>
                      <Button variant="ghost" size="icon" className="text-emerald-500"><Download className="w-4 h-4"/></Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
