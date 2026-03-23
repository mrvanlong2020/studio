import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, Button, Input, Dialog, Label, Textarea } from "@/components/ui-elements";
import { useCustomers, useCreateCustomerMutation, useUpdateCustomerMutation, useDeleteCustomerMutation } from "@/hooks/use-customers";
import { formatDate } from "@/lib/formatters";
import { Search, Plus, User, Phone, MapPin, MoreVertical, Trash2, Edit } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";

const customerSchema = z.object({
  name: z.string().min(2, "Tên phải có ít nhất 2 ký tự"),
  phone: z.string().min(10, "Số điện thoại không hợp lệ"),
  email: z.string().email("Email không hợp lệ").optional().or(z.literal('')),
  address: z.string().optional(),
  notes: z.string().optional(),
});

type CustomerFormValues = z.infer<typeof customerSchema>;

export default function Customers() {
  const [search, setSearch] = useState("");
  const { data: customers, isLoading } = useCustomers(search);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  const createMutation = useCreateCustomerMutation();
  const updateMutation = useUpdateCustomerMutation();
  const deleteMutation = useDeleteCustomerMutation();
  const { toast } = useToast();

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema)
  });

  const openCreate = () => {
    setEditingId(null);
    reset({ name: "", phone: "", email: "", address: "", notes: "" });
    setIsFormOpen(true);
  };

  const openEdit = (customer: any) => {
    setEditingId(customer.id);
    reset({
      name: customer.name,
      phone: customer.phone,
      email: customer.email || "",
      address: customer.address || "",
      notes: customer.notes || ""
    });
    setIsFormOpen(true);
  };

  const onSubmit = (data: CustomerFormValues) => {
    // Convert empty strings to null for optional fields to match schema if needed, though API usually handles empty strings
    const payload = {
      ...data,
      email: data.email || null,
      address: data.address || null,
      notes: data.notes || null,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload }, {
        onSuccess: () => {
          setIsFormOpen(false);
          toast({ title: "Thành công", description: "Đã cập nhật khách hàng." });
        }
      });
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => {
          setIsFormOpen(false);
          toast({ title: "Thành công", description: "Đã thêm khách hàng mới." });
        }
      });
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Bạn có chắc chắn muốn xóa khách hàng này?")) {
      deleteMutation.mutate(id, {
        onSuccess: () => toast({ title: "Đã xóa", description: "Xóa khách hàng thành công." })
      });
    }
  };

  return (
    <Layout>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-4xl font-serif font-bold text-foreground">Khách hàng</h1>
          <p className="text-muted-foreground mt-2">Quản lý thông tin cô dâu chú rể</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-5 h-5" /> Thêm khách hàng
        </Button>
      </div>

      <Card className="mb-8">
        <CardContent className="p-4 flex gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input 
              placeholder="Tìm kiếm theo tên hoặc SĐT..." 
              className="pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground font-medium border-b border-border">
              <tr>
                <th className="px-6 py-4 rounded-tl-xl">Khách hàng</th>
                <th className="px-6 py-4">Liên hệ</th>
                <th className="px-6 py-4">Địa chỉ</th>
                <th className="px-6 py-4">Ngày tham gia</th>
                <th className="px-6 py-4 text-right rounded-tr-xl">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="text-center py-10">Đang tải...</td></tr>
              ) : customers?.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-10 text-muted-foreground">Không tìm thấy khách hàng nào.</td></tr>
              ) : (
                customers?.map((customer) => (
                  <tr key={customer.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                          {customer.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-medium text-foreground">{customer.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <span className="flex items-center gap-2 text-muted-foreground"><Phone className="w-3 h-3"/> {customer.phone}</span>
                        {customer.email && <span className="flex items-center gap-2 text-muted-foreground"><User className="w-3 h-3"/> {customer.email}</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4 max-w-[200px] truncate text-muted-foreground">
                      {customer.address || "—"}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {formatDate(customer.createdAt)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEdit(customer)} className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(customer.id)} className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} title={editingId ? "Sửa khách hàng" : "Thêm khách hàng mới"}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Tên khách hàng <span className="text-destructive">*</span></Label>
            <Input {...register("name")} placeholder="VD: Nguyễn Văn A & Trần Thị B" />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Số điện thoại <span className="text-destructive">*</span></Label>
              <Input {...register("phone")} placeholder="09..." />
              {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input {...register("email")} placeholder="email@example.com" />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Địa chỉ</Label>
            <Input {...register("address")} placeholder="Số nhà, đường, quận/huyện..." />
          </div>

          <div className="space-y-2">
            <Label>Ghi chú</Label>
            <Textarea {...register("notes")} placeholder="Thông tin thêm về sở thích, yêu cầu..." />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border mt-6">
            <Button type="button" variant="ghost" onClick={() => setIsFormOpen(false)}>Hủy</Button>
            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
              {createMutation.isPending || updateMutation.isPending ? "Đang lưu..." : "Lưu thông tin"}
            </Button>
          </div>
        </form>
      </Dialog>
    </Layout>
  );
}
