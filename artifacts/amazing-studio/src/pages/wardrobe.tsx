import { useState } from "react";
import { useListDresses, useListRentals } from "@workspace/api-client-react";
import { formatVND, formatDate } from "@/lib/utils";
import { Card, CardContent, Badge, Button, Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui";
import { Plus, Search, Shirt, Filter } from "lucide-react";

export default function WardrobePage() {
  const { data: dresses = [], isLoading: loadingDresses } = useListDresses({});
  const { data: rentals = [], isLoading: loadingRentals } = useListRentals({});

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Kho trang phục</h1>
          <p className="text-muted-foreground mt-1">Quản lý váy cưới và theo dõi thuê/trả</p>
        </div>
        <Button className="gap-2"><Plus className="w-4 h-4"/> Thêm váy mới</Button>
      </div>

      <Tabs defaultValue="inventory" className="w-full">
        <TabsList className="grid w-[300px] grid-cols-2 mb-6">
          <TabsTrigger value="inventory">Kho váy</TabsTrigger>
          <TabsTrigger value="rentals">Đang cho thuê</TabsTrigger>
        </TabsList>
        
        <TabsContent value="inventory" className="space-y-4">
          {loadingDresses ? <div className="text-center p-8">Đang tải...</div> : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
              {dresses.map(dress => (
                <Card key={dress.id} className="overflow-hidden hover:shadow-lg transition-all group cursor-pointer border-transparent hover:border-primary/30">
                  <div className="aspect-[3/4] bg-muted relative">
                    {dress.imageUrl ? (
                      <img src={dress.imageUrl} alt={dress.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground/30 group-hover:scale-105 transition-transform duration-500">
                        <Shirt className="w-16 h-16" />
                      </div>
                    )}
                    <div className="absolute top-3 left-3 flex gap-2">
                      <Badge variant="secondary" className="bg-white/90 text-foreground backdrop-blur-sm shadow-sm">{dress.code}</Badge>
                    </div>
                    <div className="absolute top-3 right-3">
                      {dress.isAvailable ? (
                        <Badge variant="success" className="shadow-sm">Sẵn sàng</Badge>
                      ) : (
                        <Badge variant="destructive" className="shadow-sm">Đang thuê</Badge>
                      )}
                    </div>
                  </div>
                  <CardContent className="p-4">
                    <h3 className="font-bold text-lg leading-tight mb-1 group-hover:text-primary transition-colors">{dress.name}</h3>
                    <p className="text-sm text-muted-foreground mb-3">{dress.color} • Size {dress.size} • {dress.style}</p>
                    <div className="flex justify-between items-end">
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Giá thuê</p>
                        <p className="font-bold text-primary">{formatVND(dress.rentalPrice)}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wider">{dress.condition}</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="rentals">
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-muted/50 text-muted-foreground uppercase text-xs font-semibold">
                  <tr>
                    <th className="px-6 py-4">Mã Váy</th>
                    <th className="px-6 py-4">Khách thuê</th>
                    <th className="px-6 py-4">Ngày thuê</th>
                    <th className="px-6 py-4">Hạn trả</th>
                    <th className="px-6 py-4 text-right">Giá thuê</th>
                    <th className="px-6 py-4 text-center">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loadingRentals ? (
                    <tr><td colSpan={6} className="text-center p-8">Đang tải...</td></tr>
                  ) : rentals.length === 0 ? (
                    <tr><td colSpan={6} className="text-center p-8">Chưa có giao dịch thuê váy</td></tr>
                  ) : (
                    rentals.map(rental => (
                      <tr key={rental.id} className="hover:bg-muted/30">
                        <td className="px-6 py-4 font-medium text-primary">{rental.dressCode}</td>
                        <td className="px-6 py-4">
                          <p className="font-medium">{rental.customerName}</p>
                          <p className="text-xs text-muted-foreground">{rental.customerPhone}</p>
                        </td>
                        <td className="px-6 py-4">{formatDate(rental.rentalDate)}</td>
                        <td className="px-6 py-4 font-medium">{formatDate(rental.returnDate)}</td>
                        <td className="px-6 py-4 text-right font-bold">{formatVND(rental.rentalPrice)}</td>
                        <td className="px-6 py-4 text-center">
                          <Badge variant={
                            rental.status === 'returned' ? 'success' : 
                            rental.status === 'overdue' ? 'destructive' : 'warning'
                          }>
                            {rental.status === 'returned' ? 'Đã trả' : rental.status === 'overdue' ? 'Quá hạn' : 'Đang thuê'}
                          </Badge>
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
