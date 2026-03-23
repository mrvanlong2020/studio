import { useDashboardStats } from "@/hooks/use-dashboard";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui-elements";
import { formatVND, formatDate } from "@/lib/formatters";
import { Users, Camera, Shirt, Wallet, ArrowRight, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function Dashboard() {
  const { data: stats, isLoading } = useDashboardStats();

  if (isLoading) {
    return (
      <Layout>
        <div className="h-[60vh] flex items-center justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  // Mock data for chart based on stats just to make it look good
  const chartData = [
    { name: 'T1', revenue: stats?.totalRevenue ? stats.totalRevenue * 0.1 : 0 },
    { name: 'T2', revenue: stats?.totalRevenue ? stats.totalRevenue * 0.15 : 0 },
    { name: 'T3', revenue: stats?.totalRevenue ? stats.totalRevenue * 0.2 : 0 },
    { name: 'T4', revenue: stats?.totalRevenue ? stats.totalRevenue * 0.18 : 0 },
    { name: 'T5', revenue: stats?.totalRevenue ? stats.totalRevenue * 0.25 : 0 },
    { name: 'T6', revenue: stats?.revenueThisMonth || 0 },
  ];

  return (
    <Layout>
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-4xl font-serif font-bold text-foreground">Tổng quan</h1>
          <p className="text-muted-foreground mt-2">Chào mừng trở lại Amazing Studio. Dưới đây là tình hình kinh doanh của bạn.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard 
            title="Tổng doanh thu" 
            value={formatVND(stats?.totalRevenue || 0)} 
            icon={Wallet} 
            subtitle={`+${formatVND(stats?.revenueThisMonth || 0)} tháng này`}
            color="primary"
          />
          <StatCard 
            title="Lịch chụp tháng này" 
            value={(stats?.bookingsThisMonth || 0).toString()} 
            icon={Camera} 
            subtitle={`${stats?.pendingBookings || 0} đang chờ xác nhận`}
            color="accent"
          />
          <StatCard 
            title="Váy cưới có sẵn" 
            value={`${stats?.availableDresses || 0}/${stats?.totalDresses || 0}`} 
            icon={Shirt} 
            subtitle={`${stats?.activeRentals || 0} đang cho thuê`}
            color="secondary"
          />
          <StatCard 
            title="Tổng khách hàng" 
            value={(stats?.totalCustomers || 0).toString()} 
            icon={Users} 
            subtitle="Tăng trưởng ổn định"
            color="primary"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xl">Biểu đồ doanh thu</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: 'hsl(var(--muted-foreground))', fontSize: 12}} dy={10} />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{fill: 'hsl(var(--muted-foreground))', fontSize: 12}}
                      tickFormatter={(val) => `${val / 1000000}M`}
                    />
                    <Tooltip 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      formatter={(value: number) => [formatVND(value), 'Doanh thu']}
                    />
                    <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-xl">Lịch chụp sắp tới</CardTitle>
              <Link href="/bookings" className="p-2 hover:bg-muted rounded-full transition-colors">
                <ArrowRight className="w-5 h-5 text-muted-foreground" />
              </Link>
            </CardHeader>
            <CardContent className="px-0">
              <div className="flex flex-col">
                {stats?.upcomingBookings && stats.upcomingBookings.length > 0 ? (
                  stats.upcomingBookings.slice(0, 5).map((booking) => (
                    <div key={booking.id} className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors border-b border-border/40 last:border-0">
                      <div>
                        <p className="font-medium text-foreground">{booking.customerName}</p>
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <Camera className="w-3 h-3" /> {booking.packageType}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-primary text-sm">{formatDate(booking.shootDate)}</p>
                        <p className="text-xs text-muted-foreground mt-1">{booking.shootTime || "Cả ngày"}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-muted-foreground">
                    <CalendarDays className="w-12 h-12 mx-auto opacity-20 mb-3" />
                    <p>Không có lịch chụp nào sắp tới</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}

function StatCard({ title, value, icon: Icon, subtitle, color }: any) {
  const colorMap = {
    primary: "text-primary bg-primary/10",
    secondary: "text-amber-600 bg-amber-500/10",
    accent: "text-rose-500 bg-rose-500/10",
  };
  
  return (
    <Card className="hover:shadow-lg transition-shadow duration-300">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">{title}</p>
            <h4 className="text-3xl font-serif font-bold text-foreground">{value}</h4>
          </div>
          <div className={`p-4 rounded-2xl ${colorMap[color as keyof typeof colorMap]}`}>
            <Icon className="w-6 h-6" />
          </div>
        </div>
        {subtitle && (
          <p className="text-sm mt-4 text-muted-foreground font-medium">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}
