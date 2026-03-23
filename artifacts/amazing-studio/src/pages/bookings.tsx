import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, Button, Input, Dialog, Label, Textarea, Select, Badge } from "@/components/ui-elements";
import { useBookings, useCreateBookingMutation, useUpdateBookingMutation, useDeleteBookingMutation } from "@/hooks/use-bookings";
import { useCustomers } from "@/hooks/use-customers";
import { formatVND, formatDate } from "@/lib/formatters";
import { Plus, Edit, Trash2, Calendar, Clock, DollarSign } from "lucide-react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import type { ListBookingsStatus, BookingStatus } from "@workspace/api-client-react/src/generated/api.schemas";

const statusMap: Record<BookingStatus, { label: string, color: any }> = {
  pending: { label: "Chờ xác nhận", color: "warning" },
  confirmed: { label: "Đã xác nhận", color: "success" },
  in_progress: { label: "Đang chụp", color: "primary" },
  completed: { label: "Hoàn thành", color: "default" },
  cancelled: { label: "Đã hủy", color: "destructive" }
};

const bookingSchema = z.object({
  customerId: z.coerce.number().min(1, "Vui lòng chọn khách hàng"),
  shootDate: z.string().min(1, "Chọn ngày chụp"),
  shootTime: z.string().optional(),
  packageType: z.string().min(1, "Nhập gói chụp"),
  totalAmount: z.coerce.number().min(0, "Số tiền không hợp lệ"),
  depositAmount: z.coerce.number().min(0, "Số tiền không hợp lệ"),
  status: z.enum(["pending", "confirmed", "in_progress", "completed", "cancelled"]).optional(),
  notes: z.string().optional(),
});

type BookingFormValues = z.infer<typeof bookingSchema>;

export default function Bookings() {
  const [filterStatus, setFilterStatus] = useState<ListBookingsStatus | undefined>(undefined);
  const { data: bookings, isLoading } = useBookings(filterStatus);
  const { data: customers } = useCustomers();
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  const createMutation = useCreateBookingMutation();
  const updateMutation = useUpdateBookingMutation();
  const deleteMutation = useDeleteBookingMutation();
  const { toast } = useToast();

  const { register, handleSubmit, reset, control, watch, formState: { errors } } = useForm<BookingFormValues>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      totalAmount: 0,
      depositAmount: 0,
      status: "pending"
    }
  });

  const watchTotal = watch("totalAmount");
  const watchDeposit = watch("depositAmount");

  const openCreate = () => {
    setEditingId(null);
    reset({ customerId: 0, shootDate: "", shootTime: "", packageType: "Gói Cơ Bản", totalAmount: 5000000, depositAmount: 2000000, status: "pending", notes: "" });
    setIsFormOpen(true);
  };

  const openEdit = (booking: any) => {
    setEditingId(booking.id);
    reset({
      customerId: booking.customerId,
      shootDate: booking.shootDate,
      shootTime: booking.shootTime || "",
      packageType: booking.packageType,
      totalAmount: booking.totalAmount,
      depositAmount: booking.depositAmount,
      status: booking.status,
      notes: booking.notes || ""
    });
    setIsFormOpen(true);
  };

  const onSubmit = (data: BookingFormValues) => {
    if (editingId) {
      updateMutation.mutate({ 
        id: editingId, 
        data: {
          shootDate: data.shootDate,
          shootTime: data.shootTime || null,
          packageType: data.packageType,
          status: data.status as BookingStatus,
          totalAmount: data.totalAmount,
          depositAmount: data.depositAmount,
          notes: data.notes || null
        } 
      }, {
        onSuccess: () => {
          setIsFormOpen(false);
          toast({ title: "Thành công", description: "Cập nhật lịch chụp thành công." });
        }
      });
    } else {
      createMutation.mutate({
        ...data,
        shootTime: data.shootTime || null,
        notes: data.notes || null
      }, {
        onSuccess: () => {
          setIsFormOpen(false);
          toast({ title: "Thành công", description: "Đã tạo lịch chụp mới." });
        }
      });
    }
  };

  return (
    <Layout>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-4xl font-serif font-bold text-foreground">Lịch chụp ảnh</h1>
          <p className="text-muted-foreground mt-2">Quản lý lịch trình và các gói chụp</p>
        </div>
        <div className="flex gap-3">
          <Select 
            className="w-48 bg-card" 
            value={filterStatus || ""}
            onChange={(e) => setFilterStatus(e.target.value ? e.target.value as ListBookingsStatus : undefined)}
          >
            <option value="">Tất cả trạng thái</option>
            {Object.entries(statusMap).map(([key, {label}]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </Select>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="w-5 h-5" /> Thêm lịch chụp
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {isLoading ? (
          <div className="p-10 text-center">Đang tải lịch chụp...</div>
        ) : bookings?.length === 0 ? (
          <Card className="p-20 text-center"><p className="text-muted-foreground">Chưa có lịch chụp nào.</p></Card>
        ) : (
          bookings?.map((booking) => (
            <Card key={booking.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-0">
                <div className="flex flex-col md:flex-row md:items-center justify-between p-6 gap-6">
                  
                  <div className="flex items-start gap-4 flex-1">
                    <div className="w-14 h-14 rounded-2xl bg-primary/10 flex flex-col items-center justify-center text-primary shrink-0 border border-primary/20">
                      <span className="text-sm font-bold leading-none">{formatDate(booking.shootDate).split('/')[0]}</span>
                      <span className="text-[10px] uppercase mt-1 leading-none">Tháng {formatDate(booking.shootDate).split('/')[1]}</span>
                    </div>
                    <div>
                      <h3 className="font-serif text-xl font-bold text-foreground">{booking.customerName}</h3>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5"/> {booking.packageType}</span>
                        {booking.shootTime && <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5"/> {booking.shootTime}</span>}
                        <span className="flex items-center gap-1"><DollarSign className="w-3.5 h-3.5"/> Còn lại: {formatVND(booking.remainingAmount)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between md:justify-end gap-6 w-full md:w-auto border-t md:border-t-0 border-border/50 pt-4 md:pt-0">
                    <div className="text-left md:text-right">
                      <p className="text-sm text-muted-foreground mb-1">Trạng thái</p>
                      <Badge variant={statusMap[booking.status].color}>{statusMap[booking.status].label}</Badge>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(booking)} className="p-2 text-muted-foreground hover:text-primary bg-muted rounded-lg transition-colors">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button onClick={() => {
                        if(confirm("Hủy lịch chụp này?")) deleteMutation.mutate(booking.id);
                      }} className="p-2 text-muted-foreground hover:text-destructive bg-muted rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} title={editingId ? "Cập nhật lịch chụp" : "Tạo lịch chụp mới"}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          
          {!editingId && (
            <div className="space-y-2">
              <Label>Khách hàng <span className="text-destructive">*</span></Label>
              <Select {...register("customerId")}>
                <option value={0} disabled>Chọn khách hàng...</option>
                {customers?.map(c => <option key={c.id} value={c.id}>{c.name} - {c.phone}</option>)}
              </Select>
              {errors.customerId && <p className="text-xs text-destructive">{errors.customerId.message}</p>}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Ngày chụp <span className="text-destructive">*</span></Label>
              <Input type="date" {...register("shootDate")} />
              {errors.shootDate && <p className="text-xs text-destructive">{errors.shootDate.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Giờ chụp</Label>
              <Input type="time" {...register("shootTime")} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Gói chụp <span className="text-destructive">*</span></Label>
            <Select {...register("packageType")}>
              <option value="Gói Cơ Bản">Gói Cơ Bản</option>
              <option value="Gói Nâng Cao">Gói Nâng Cao</option>
              <option value="Gói VIP">Gói VIP</option>
              <option value="Gói Đặc Biệt">Gói Đặc Biệt</option>
              <option value="Tùy chỉnh">Tùy chỉnh...</option>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-xl border border-border">
            <div className="space-y-2">
              <Label>Tổng tiền (VNĐ)</Label>
              <Input type="number" {...register("totalAmount")} />
            </div>
            <div className="space-y-2">
              <Label>Đã cọc (VNĐ)</Label>
              <Input type="number" {...register("depositAmount")} />
            </div>
            <div className="col-span-2 pt-2 border-t border-border flex justify-between items-center">
              <span className="text-sm font-medium">Còn lại cần thu:</span>
              <span className="text-lg font-bold text-primary">
                {formatVND(Math.max(0, (watchTotal || 0) - (watchDeposit || 0)))}
              </span>
            </div>
          </div>

          {editingId && (
            <div className="space-y-2">
              <Label>Trạng thái</Label>
              <Select {...register("status")}>
                {Object.entries(statusMap).map(([key, {label}]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Ghi chú thêm</Label>
            <Textarea {...register("notes")} />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="ghost" onClick={() => setIsFormOpen(false)}>Hủy</Button>
            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
              Lưu lịch chụp
            </Button>
          </div>
        </form>
      </Dialog>
    </Layout>
  );
}
