import { useListServices } from "@workspace/api-client-react";
import { formatVND } from "@/lib/utils";
import { Card, CardContent, Badge, Button } from "@/components/ui";
import { Plus, Check, Edit2 } from "lucide-react";

export default function ServicesPage() {
  const { data: services = [], isLoading } = useListServices();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dịch vụ & Gói</h1>
          <p className="text-muted-foreground mt-1">Cấu hình các gói dịch vụ studio cung cấp</p>
        </div>
        <Button className="gap-2"><Plus className="w-4 h-4"/> Thêm gói dịch vụ</Button>
      </div>

      {isLoading ? (
        <div className="text-center p-12 text-muted-foreground">Đang tải...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map(service => (
            <Card key={service.id} className={`relative overflow-hidden transition-all hover:shadow-lg ${!service.isActive ? 'opacity-60' : 'border-primary/20'}`}>
              {!service.isActive && (
                <div className="absolute top-4 right-4 z-10">
                  <Badge variant="secondary">Tạm ẩn</Badge>
                </div>
              )}
              {service.type === 'package' && service.isActive && (
                <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-[10px] font-bold px-3 py-1 uppercase rounded-bl-lg tracking-wider z-10 shadow-sm">
                  Gói phổ biến
                </div>
              )}
              <CardContent className="p-6">
                <h3 className="text-2xl font-bold text-foreground mb-2 pr-12">{service.name}</h3>
                <p className="text-3xl font-extrabold text-primary mb-4">{formatVND(service.price)}</p>
                <p className="text-sm text-muted-foreground mb-6 line-clamp-2">{service.description}</p>
                
                <div className="space-y-3 mb-6">
                  {service.includes.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-sm">
                      <Check className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
                
                <Button variant={service.isActive ? "outline" : "secondary"} className="w-full gap-2">
                  <Edit2 className="w-4 h-4" /> Chỉnh sửa gói
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
