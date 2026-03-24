import { useQuery } from "@tanstack/react-query";
import { useGetDashboardStats } from "@workspace/api-client-react";
import { formatVND, formatDate } from "@/lib/utils";
import { Card, CardContent, Badge, Button } from "@/components/ui";
import { 
  ArrowRight, Users, Camera, Shirt, Wallet, TrendingUp, AlertCircle,
  CalendarDays, CheckSquare, DollarSign, ReceiptText, Clock, CheckCircle2
} from "lucide-react";
import { Link } from "wouter";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const fetchJson = (url: string) => fetch(`${BASE}${url}`).then(r => r.json());

const STATUS_COLORS: Record<string, string> = {
  pending: "#eab308", confirmed: "#3b82f6", in_progress: "#8b5cf6", completed: "#22c55e", cancelled: "#ef4444",
};
const STATUS_LABELS: Record<string, string> = {
  pending: "Chờ xác nhận", confirmed: "Đã xác nhận", in_progress: "Đang làm", completed: "Hoàn thành", cancelled: "Đã hủy",
};

export default function Dashboard() {
  const { data: stats, isLoading } = useGetDashboardStats();
  const { data: bookings = [] } = useQuery<any[]>({
    queryKey: ["bookings-dash"],
    queryFn: () => fetchJson("/api/bookings"),
  });
  const { data: tasks = [] } = useQuery<any[]>({
    queryKey: ["tasks-dash"],
    queryFn: () => fetchJson("/api/tasks"),
  });

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Đang tải dữ liệu tổng quan...</div>;
  if (!stats) return <div className="p-8 text-center text-destructive">Lỗi tải dữ liệu</div>;

  const now = new Date();
  const monthlyData = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const month = d.getMonth(); const year = d.getFullYear();
    const label = `T${month + 1}`;
    const monthBookings = bookings.filter(b => {
      const bd = new Date(b.shootDate || b.createdAt);
      return bd.getMonth() === month && bd.getFullYear() === year;
    });
    return { label, total: monthBookings.reduce((s: number, b: any) => s + parseFloat(b.totalAmount || 0), 0) };
  });

  // Status distribution for pie chart
  const statusDist = Object.entries(STATUS_LABELS).map(([k, v]) => ({
    name: v, value: bookings.filter(b => b.status === k).length, color: STATUS_COLORS[k],
  })).filter(d => d.value > 0);

  const todayTasks = tasks.filter((t: any) => t.status !== "done");
  const urgentTasks = todayTasks.filter((t: any) => t.priority === "high");
  const totalDebt = bookings.reduce((s: number, b: any) => s + parseFloat(b.remainingAmount || 0), 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Tổng quan</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Chào mừng trở lại Amazing Studio. Ngày {now.toLocaleDateString("vi-VN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Tổng doanh thu", value: formatVND(stats.totalRevenue), sub: `+${formatVND(stats.revenueThisMonth)} tháng này`, icon: Wallet, color: "text-primary", bg: "from-primary/10 to-card" },
          { label: "Lịch chụp tháng này", value: stats.bookingsThisMonth, sub: `${stats.pendingBookings} chờ xác nhận`, icon: Camera, color: "text-blue-600", bg: "from-blue-50 to-card" },
          { label: "Công nợ chưa thu", value: formatVND(totalDebt), sub: "Cần theo dõi", icon: ReceiptText, color: "text-red-600", bg: "from-red-50 to-card" },
          { label: "Tổng khách hàng", value: stats.totalCustomers, sub: "Đã đăng ký", icon: Users, color: "text-emerald-600", bg: "from-emerald-50 to-card" },
        ].map(c => (
          <div key={c.label} className={`rounded-xl border bg-gradient-to-br ${c.bg} p-4`}>
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className={`text-xl font-bold mt-0.5 ${c.color}`}>{c.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{c.sub}</p>
              </div>
              <div className={`p-2 rounded-xl bg-background/80 ${c.color}`}><c.icon className="w-4 h-4" /></div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts & Upcoming */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Revenue Chart */}
        <div className="lg:col-span-2 bg-card rounded-2xl border p-5">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary" />Doanh thu 6 tháng gần đây</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthlyData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickFormatter={v => `${v / 1000000}M`} />
              <RechartsTooltip
                cursor={{ fill: "hsl(var(--muted)/0.5)" }}
                contentStyle={{ borderRadius: "12px", border: "1px solid hsl(var(--border))", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                formatter={(v: number) => [formatVND(v), "Doanh thu"]}
              />
              <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Upcoming Bookings */}
        <div className="bg-card rounded-2xl border flex flex-col overflow-hidden">
          <div className="p-4 border-b flex justify-between items-center">
            <h3 className="font-semibold flex items-center gap-2"><CalendarDays className="w-4 h-4 text-primary" />Lịch chụp sắp tới</h3>
            <Link href="/calendar" className="text-muted-foreground hover:text-primary"><ArrowRight className="w-4 h-4" /></Link>
          </div>
          <div className="flex-1 overflow-y-auto divide-y max-h-60">
            {stats.upcomingBookings.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-muted-foreground text-sm">
                <CalendarDays className="w-10 h-10 mb-2 opacity-20" />
                <p>Không có lịch sắp tới</p>
              </div>
            ) : stats.upcomingBookings.map(b => (
              <div key={b.id} className="px-4 py-3 hover:bg-muted/30 transition-colors flex justify-between items-center">
                <div>
                  <p className="font-medium text-sm">{b.customerName}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Camera className="w-3 h-3" />{b.packageType}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">{formatDate(b.shootDate)}</p>
                  <p className="text-xs text-muted-foreground">{b.shootTime || "--:--"}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="p-3 border-t">
            <Link href="/bookings"><Button variant="outline" size="sm" className="w-full">Xem tất cả đơn</Button></Link>
          </div>
        </div>
      </div>

      {/* Bottom row: Status Distribution + Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Status Pie */}
        <div className="bg-card rounded-2xl border p-5">
          <h3 className="font-semibold mb-4">Phân bổ trạng thái đơn hàng</h3>
          {statusDist.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">Chưa có dữ liệu</div>
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie data={statusDist} dataKey="value" cx="50%" cy="50%" innerRadius={40} outerRadius={65}>
                    {statusDist.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 flex-1">
                {statusDist.map(d => (
                  <div key={d.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                      <span className="text-muted-foreground text-xs">{d.name}</span>
                    </div>
                    <span className="font-semibold text-xs">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Tasks overview */}
        <div className="bg-card rounded-2xl border flex flex-col overflow-hidden">
          <div className="p-4 border-b flex justify-between items-center">
            <h3 className="font-semibold flex items-center gap-2"><CheckSquare className="w-4 h-4 text-primary" />Công việc cần làm</h3>
            <Link href="/tasks" className="text-muted-foreground hover:text-primary"><ArrowRight className="w-4 h-4" /></Link>
          </div>
          <div className="flex-1 divide-y overflow-y-auto max-h-52">
            {todayTasks.length === 0 ? (
              <div className="flex items-center justify-center p-8 text-muted-foreground text-sm">
                <CheckCircle2 className="w-10 h-10 mb-2 opacity-20" />
              </div>
            ) : todayTasks.slice(0, 6).map((t: any) => (
              <div key={t.id} className="px-4 py-3 hover:bg-muted/30 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{t.title}</p>
                  {t.assigneeName && <p className="text-xs text-muted-foreground mt-0.5">{t.assigneeName}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {t.priority === "high" && <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-700 rounded font-medium">Cao</span>}
                  {t.status === "in_progress" && <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">Đang làm</span>}
                  {t.status === "todo" && <span className="text-[10px] px-1.5 py-0.5 bg-muted text-muted-foreground rounded">Chờ</span>}
                </div>
              </div>
            ))}
          </div>
          <div className="p-3 border-t">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{urgentTasks.length} việc khẩn · {todayTasks.length} chưa xong</span>
              <Link href="/tasks" className="text-primary font-medium hover:underline">Xem tất cả</Link>
            </div>
          </div>
        </div>
      </div>

      {/* Debt Alert */}
      {totalDebt > 0 && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-destructive/10 text-destructive rounded-full"><AlertCircle className="w-5 h-5" /></div>
            <div>
              <h3 className="font-semibold text-destructive">Cảnh báo công nợ</h3>
              <p className="text-sm text-muted-foreground">Tổng công nợ khách hàng chưa thu</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold text-destructive">{formatVND(totalDebt)}</p>
            <Link href="/bookings" className="text-sm font-medium text-destructive hover:underline">Xem chi tiết</Link>
          </div>
        </div>
      )}
    </div>
  );
}
