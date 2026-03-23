import { useState } from "react";
import { useListCustomers, useCreateCustomer, useUpdateCustomer, useDeleteCustomer } from "@workspace/api-client-react";
import { formatVND, formatDate } from "@/lib/utils";
import { Card, CardContent, Button, Input, Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, Textarea } from "@/components/ui";
import { Search, Plus, User, Phone, MapPin, Edit, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function CustomersPage() {
  const [search, setSearch] = useState("");
  const { data: customers = [], isLoading } = useListCustomers({ search: search.length > 2 ? search : undefined });
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const deleteCustomer = useDeleteCustomer();
  const queryClient = useQueryClient();

  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ name: "", phone: "", email: "", address: "", notes: "" });

  const handleOpenEdit = (c: any) => {
    setFormData({ name: c.name, phone: c.phone, email: c.email||"", address: c.address||"", notes: c.notes||"" });
    setEditingId(c.id);
    setIsOpen(true);
  };

  const handleOpenCreate = () => {
    setFormData({ name: "", phone: "", email: "", address: "", notes: "" });
    setEditingId(null);
    setIsOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const action = editingId 
      ? updateCustomer.mutateAsync({ id: editingId, data: formData })
      : createCustomer.mutateAsync({ data: formData });
      
    action.then(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setIsOpen(false);
    });
  };

  const handleDelete = (id: number) => {
    if(confirm("Bạn có chắc muốn xóa khách hàng này?")) {
      deleteCustomer.mutate({ id }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/customers"] })
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Khách hàng</h1>
          <p className="text-muted-foreground mt-1">Quản lý thông tin và công nợ khách hàng</p>
        </div>
        
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Tìm tên, số điện thoại..." 
              className="pl-9"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button onClick={handleOpenCreate} className="gap-2"><Plus className="w-4 h-4"/> Thêm mới</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingId ? "Sửa khách hàng" : "Thêm khách hàng mới"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Họ và tên *</label>
                    <Input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Nguyễn Văn A" />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Số điện thoại *</label>
                    <Input required value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} placeholder="09..." />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Email</label>
                  <Input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} placeholder="email@example.com" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Địa chỉ</label>
                  <Input value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} placeholder="Địa chỉ chi tiết" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Ghi chú</label>
                  <Textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} placeholder="Ghi chú thêm..." />
                </div>
                <Button type="submit" className="w-full" disabled={createCustomer.isPending || updateCustomer.isPending}>
                  Lưu thông tin
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-muted/50 text-muted-foreground uppercase text-xs font-semibold">
              <tr>
                <th className="px-6 py-4 rounded-tl-2xl">Khách hàng</th>
                <th className="px-6 py-4">Liên hệ</th>
                <th className="px-6 py-4">Địa chỉ</th>
                <th className="px-6 py-4 text-center">Số booking</th>
                <th className="px-6 py-4 text-right">Công nợ</th>
                <th className="px-6 py-4 text-center rounded-tr-2xl">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">Đang tải...</td></tr>
              ) : customers.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">Không tìm thấy khách hàng</td></tr>
              ) : (
                customers.map(customer => (
                  <tr key={customer.id} className="hover:bg-muted/30 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                          {customer.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-foreground">{customer.name}</p>
                          <p className="text-xs text-muted-foreground">Tham gia: {formatDate(customer.createdAt)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-muted-foreground"/> {customer.phone}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 max-w-[200px] truncate">
                      {customer.address || <span className="text-muted-foreground italic">Trống</span>}
                    </td>
                    <td className="px-6 py-4 text-center font-medium">
                      {customer.totalBookings}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className={`font-bold ${customer.totalDebt > 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                        {formatVND(customer.totalDebt)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(customer)}>
                          <Edit className="w-4 h-4 text-blue-500" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(customer.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
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
