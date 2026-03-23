import { useState } from "react";
import { useListBookings } from "@workspace/api-client-react";
import { formatVND, formatDate } from "@/lib/utils";
import { Card, CardContent, Badge, Button } from "@/components/ui";
import { Plus, Camera, Phone, MapPin, Clock } from "lucide-react";

export default function BookingsPage() {
  const { data: bookings = [], isLoading } = useListBookings({});

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Quản lý Lịch chụp</h1>
          <p className="text-muted-foreground mt-1">Danh sách tất cả hợp đồng và booking</p>
        </div>
        <Button className="gap-2"><Plus className="w-4 h-4"/> Tạo Booking mới</Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-muted/50 text-muted-foreground uppercase text-xs font-semibold">
              <tr>
                <th className="px-6 py-4">Khách hàng</th>
                <th className="px-6 py-4">Gói dịch vụ</th>
                <th className="px-6 py-4">Ngày chụp</th>
                <th className="px-6 py-4 text-right">Tổng tiền</th>
                <th className="px-6 py-4 text-right">Còn lại</th>
                <th className="px-6 py-4 text-center">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">Đang tải...</td></tr>
              ) : bookings.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">Chưa có lịch chụp nào</td></tr>
              ) : (
                bookings.map(b => (
                  <tr key={b.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-semibold text-foreground">{b.customerName}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Phone className="w-3 h-3"/> {b.customerPhone}</p>
                    </td>
                    <td className="px-6 py-4 font-medium text-primary">
                      {b.packageType}
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-medium">{formatDate(b.shootDate)}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Clock className="w-3 h-3"/> {b.shootTime || "--:--"}</p>
                    </td>
                    <td className="px-6 py-4 text-right font-medium">
                      {formatVND(b.totalAmount)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className={`font-bold ${b.remainingAmount > 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                        {formatVND(b.remainingAmount)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Badge variant={
                        b.status === 'completed' ? 'success' : 
                        b.status === 'confirmed' ? 'default' : 
                        b.status === 'in_progress' ? 'warning' : 'secondary'
                      }>
                        {b.status === 'completed' ? 'Hoàn thành' : 
                         b.status === 'confirmed' ? 'Đã xác nhận' : 
                         b.status === 'in_progress' ? 'Đang chụp' : 
                         b.status === 'cancelled' ? 'Đã hủy' : 'Chờ xác nhận'}
                      </Badge>
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
