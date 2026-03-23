import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, Button, Input, Dialog, Label, Textarea, Select, Badge } from "@/components/ui-elements";
import { usePayments, useCreatePaymentMutation } from "@/hooks/use-payments";
import { useBookings } from "@/hooks/use-bookings";
import { useRentals } from "@/hooks/use-rentals";
import { formatVND, formatDateTime } from "@/lib/formatters";
import { Plus, Receipt, ArrowDownRight } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";

const paymentMethodMap = {
  cash: "Tiền mặt",
  bank_transfer: "Chuyển khoản",
  momo: "MoMo",
  zalo_pay: "ZaloPay"
};

const paymentTypeMap = {
  deposit: { label: "Đặt cọc", color: "warning" },
  final_payment: { label: "Thanh toán cuối", color: "success" },
  rental_fee: { label: "Phí thuê váy", color: "primary" },
  refund: { label: "Hoàn tiền", color: "destructive" },
};

const createPaymentSchema = z.object({
  linkType: z.enum(["booking", "rental", "none"]),
  bookingId: z.coerce.number().optional(),
  rentalId: z.coerce.number().optional(),
  amount: z.coerce.number().min(1000, "Số tiền phải lớn hơn 1,000"),
  paymentMethod: z.enum(["cash", "bank_transfer", "momo", "zalo_pay"]),
  paymentType: z.enum(["deposit", "final_payment", "rental_fee", "refund"]),
  notes: z.string().optional(),
}).refine(data => {
  if (data.linkType === 'booking' && !data.bookingId) return false;
  if (data.linkType === 'rental' && !data.rentalId) return false;
  return true;
}, { message: "Vui lòng chọn mã tương ứng", path: ["linkType"] });

type CreatePaymentFormValues = z.infer<typeof createPaymentSchema>;

export default function Payments() {
  const { data: payments, isLoading } = usePayments();
  const { data: bookings } = useBookings();
  const { data: rentals } = useRentals();
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const createMutation = useCreatePaymentMutation();
  const { toast } = useToast();

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<CreatePaymentFormValues>({
    resolver: zodResolver(createPaymentSchema),
    defaultValues: { linkType: "none", paymentMethod: "bank_transfer", paymentType: "final_payment", amount: 0 }
  });

  const linkType = watch("linkType");

  const openCreate = () => {
    reset({ linkType: "none", amount: 0, paymentMethod: "bank_transfer", paymentType: "final_payment", notes: "" });
    setIsFormOpen(true);
  };

  const onSubmit = (data: CreatePaymentFormValues) => {
    const payload = {
      amount: data.amount,
      paymentMethod: data.paymentMethod,
      paymentType: data.paymentType,
      bookingId: data.linkType === 'booking' ? data.bookingId : null,
      rentalId: data.linkType === 'rental' ? data.rentalId : null,
      notes: data.notes || null,
    };

    createMutation.mutate(payload, {
      onSuccess: () => {
        setIsFormOpen(false);
        toast({ title: "Thành công", description: "Đã lưu giao dịch thanh toán." });
      }
    });
  };

  return (
    <Layout>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-4xl font-serif font-bold text-foreground">Thanh toán & Thu chi</h1>
          <p className="text-muted-foreground mt-2">Lịch sử giao dịch của cửa hàng</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-5 h-5" /> Ghi nhận thanh toán
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground font-medium border-b border-border">
              <tr>
                <th className="px-6 py-4 rounded-tl-xl">Thời gian</th>
                <th className="px-6 py-4">Loại giao dịch</th>
                <th className="px-6 py-4">Tham chiếu</th>
                <th className="px-6 py-4">Phương thức</th>
                <th className="px-6 py-4 text-right rounded-tr-xl">Số tiền</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="text-center py-10">Đang tải...</td></tr>
              ) : payments?.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-10 text-muted-foreground">Chưa có giao dịch nào.</td></tr>
              ) : (
                payments?.map((payment) => (
                  <tr key={payment.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 text-muted-foreground">
                      {formatDateTime(payment.paidAt)}
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={paymentTypeMap[payment.paymentType].color as any}>
                        {paymentTypeMap[payment.paymentType].label}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {payment.bookingId ? `Lịch chụp #${payment.bookingId}` : 
                       payment.rentalId ? `Phiếu thuê #${payment.rentalId}` : "Khác"}
                    </td>
                    <td className="px-6 py-4">
                      {paymentMethodMap[payment.paymentMethod]}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className={`font-bold ${payment.paymentType === 'refund' ? 'text-destructive' : 'text-primary'}`}>
                        {payment.paymentType === 'refund' ? '-' : '+'}{formatVND(payment.amount)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} title="Ghi nhận thanh toán mới">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          
          <div className="space-y-2">
            <Label>Loại giao dịch</Label>
            <div className="grid grid-cols-2 gap-4">
              <Select {...register("paymentType")}>
                {Object.entries(paymentTypeMap).map(([key, {label}]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </Select>
              <Select {...register("paymentMethod")}>
                {Object.entries(paymentMethodMap).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Số tiền (VNĐ) <span className="text-destructive">*</span></Label>
            <Input type="number" className="text-lg font-bold text-primary" {...register("amount")} />
            {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
          </div>

          <div className="p-4 bg-muted/30 rounded-xl border border-border space-y-4">
            <div className="space-y-2">
              <Label>Liên kết với</Label>
              <Select {...register("linkType")}>
                <option value="none">Không liên kết (Khác)</option>
                <option value="booking">Lịch chụp ảnh</option>
                <option value="rental">Phiếu thuê váy</option>
              </Select>
            </div>

            {linkType === 'booking' && (
              <div className="space-y-2">
                <Label>Chọn lịch chụp</Label>
                <Select {...register("bookingId")}>
                  <option value={0} disabled>Chọn...</option>
                  {bookings?.map(b => <option key={b.id} value={b.id}>#{b.id} - {b.customerName} ({formatVND(b.totalAmount)})</option>)}
                </Select>
              </div>
            )}

            {linkType === 'rental' && (
              <div className="space-y-2">
                <Label>Chọn phiếu thuê</Label>
                <Select {...register("rentalId")}>
                  <option value={0} disabled>Chọn...</option>
                  {rentals?.map(r => <option key={r.id} value={r.id}>#{r.id} - {r.customerName} ({r.dressName})</option>)}
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Ghi chú (Tùy chọn)</Label>
            <Textarea {...register("notes")} placeholder="Mã giao dịch ngân hàng, người nộp..." />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border mt-6">
            <Button type="button" variant="ghost" onClick={() => setIsFormOpen(false)}>Hủy</Button>
            <Button type="submit" disabled={createMutation.isPending}>Hoàn tất</Button>
          </div>
        </form>
      </Dialog>
    </Layout>
  );
}
