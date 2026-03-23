import { useGetDashboardStats } from "@workspace/api-client-react";
import { formatVND, formatDate } from "@/lib/utils";
import { Card, CardContent, Badge, Button } from "@/components/ui";
import { 
  ArrowRight, Users, Camera, Shirt, Wallet, TrendingUp, AlertCircle
} from "lucide-react";
import { Link } from "wouter";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";

export default function Dashboard() {
  const { data: stats, isLoading } = useGetDashboardStats();

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Đang tải dữ liệu tổng quan...</div>;
  if (!stats) return <div className="p-8 text-center text-destructive">Lỗi tải dữ liệu</div>;

  const mockChartData = [
    { name: "T1", total: 40000000 },
    { name: "T2", total: 35000000 },
    { name: "T3", total: stats.revenueThisMonth || 15000000 },
    { name: "T4", total: 0 },
    { name: "T5", total: 0 },
    { name: "T6", total: 0 },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Tổng quan</h1>
        <p className="text-muted-foreground mt-1">Chào mừng trở lại Amazing Studio. Dưới đây là tình hình kinh doanh của bạn.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="bg-gradient-to-br from-white to-rose-50/50 dark:from-card dark:to-accent/10 border-accent/20">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Tổng doanh thu</p>
                <h3 className="text-2xl font-bold text-foreground">{formatVND(stats.totalRevenue)}</h3>
                <p className="text-sm text-green-600 mt-2 flex items-center gap-1 font-medium">
                  <TrendingUp className="w-4 h-4" />
                  +{formatVND(stats.revenueThisMonth)} tháng này
                </p>
              </div>
              <div className="p-3 bg-primary/10 text-primary rounded-xl">
                <Wallet className="w-5 h-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Lịch chụp tháng này</p>
                <h3 className="text-2xl font-bold text-foreground">{stats.bookingsThisMonth}</h3>
                <p className="text-sm text-muted-foreground mt-2 flex items-center gap-1">
                  <span className="text-orange-500 font-medium">{stats.pendingBookings}</span> chờ xác nhận
                </p>
              </div>
              <div className="p-3 bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 rounded-xl">
                <Camera className="w-5 h-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Váy cưới có sẵn</p>
                <h3 className="text-2xl font-bold text-foreground">{stats.availableDresses}<span className="text-lg text-muted-foreground font-normal">/{stats.totalDresses}</span></h3>
                <p className="text-sm text-muted-foreground mt-2 flex items-center gap-1">
                  <span className="text-primary font-medium">{stats.activeRentals}</span> đang cho thuê
                </p>
              </div>
              <div className="p-3 bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400 rounded-xl">
                <Shirt className="w-5 h-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Tổng khách hàng</p>
                <h3 className="text-2xl font-bold text-foreground">{stats.totalCustomers}</h3>
                <p className="text-sm text-muted-foreground mt-2">Tăng trưởng ổn định</p>
              </div>
              <div className="p-3 bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 rounded-xl">
                <Users className="w-5 h-5" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="col-span-1 lg:col-span-2 flex flex-col">
          <div className="p-6 pb-2">
            <h3 className="text-lg font-semibold">Biểu đồ doanh thu</h3>
          </div>
          <CardContent className="flex-1 p-6 pt-0 min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mockChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} tickFormatter={(val) => `${val/1000000}M`} />
                <RechartsTooltip 
                  cursor={{fill: 'hsl(var(--muted)/0.5)'}}
                  contentStyle={{ borderRadius: '12px', border: '1px solid hsl(var(--border))', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(val: number) => [formatVND(val), "Doanh thu"]}
                />
                <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={50} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <div className="p-6 pb-2 flex justify-between items-center border-b">
            <h3 className="text-lg font-semibold">Lịch chụp sắp tới</h3>
            <Link href="/calendar" className="text-muted-foreground hover:text-primary transition-colors">
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
          <CardContent className="flex-1 p-0 flex flex-col">
            {stats.upcomingBookings.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-muted-foreground">
                <CalendarDays className="w-12 h-12 mb-3 opacity-20" />
                <p>Không có lịch chụp sắp tới</p>
              </div>
            ) : (
              <div className="divide-y">
                {stats.upcomingBookings.map((booking) => (
                  <div key={booking.id} className="p-4 hover:bg-muted/50 transition-colors flex justify-between items-center group">
                    <div>
                      <p className="font-medium text-foreground group-hover:text-primary transition-colors">{booking.customerName}</p>
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <Camera className="w-3 h-3" /> {booking.packageType}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{formatDate(booking.shootDate)}</p>
                      <p className="text-xs text-muted-foreground mt-1">{booking.shootTime || "--:--"}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="p-4 mt-auto border-t">
              <Link href="/bookings">
                <Button variant="outline" className="w-full">Xem tất cả lịch đặt</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {stats.totalDebt > 0 && (
        <Card className="bg-destructive/5 border-destructive/20">
          <CardContent className="p-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-destructive/10 text-destructive rounded-full">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-semibold text-destructive">Cảnh báo công nợ</h3>
                <p className="text-sm text-muted-foreground">Tổng công nợ khách hàng hiện tại cần thu</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-destructive">{formatVND(stats.totalDebt)}</p>
              <Link href="/customers" className="text-sm font-medium text-destructive hover:underline mt-1 inline-block">Xem chi tiết</Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
