import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  TrendingUp, TrendingDown, DollarSign, BarChart2,
  Users, Award, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { useStaffAuth } from "@/contexts/StaffAuthContext";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const vnd = (n: number) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(n);

const vndShort = (n: number) => {
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}tỷ`;
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}tr`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
};

const PIE_COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#ef4444",
  "#3b82f6", "#ec4899", "#14b8a6", "#f97316",
];

type Stats = {
  todayRevenue: number; todayProfit: number; todayExpenses: number; todayCount: number;
  weekRevenue: number; weekProfit: number; weekExpenses: number; weekCount: number;
  monthRevenue: number; monthProfit: number; monthExpenses: number; monthCount: number;
  yearRevenue: number; yearProfit: number; yearExpenses: number; yearCount: number;
};

type PeriodPoint = {
  label: string;
  revenue: number;
  expenses: number;
  profit: number;
};

type ServiceRow = {
  service: string;
  serviceKey: string;
  count: number;
  revenue: number;
  profit: number;
  revenuePercentage: number;
  countPercentage: number;
};

type SaleRow = {
  staffId: number;
  staffName: string;
  count: number;
  revenue: number;
  profit: number;
  contribution: number;
};


const PERIOD_MODES = [
  { key: "7days", label: "7 ngày" },
  { key: "4weeks", label: "4 tuần" },
  { key: "12months", label: "12 tháng" },
];

const CHART_TABS = [
  { key: "bar", label: "Dạng cột" },
  { key: "line", label: "Dạng đường" },
];

function StatCard({
  label, value, subLabel, color, icon: Icon, trend,
}: {
  label: string;
  value: number;
  subLabel?: string;
  color: string;
  icon: React.ElementType;
  trend?: "up" | "down" | "neutral";
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 sm:p-4">
      <div className="flex items-start justify-between gap-2">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
        {trend === "up" && <ArrowUpRight className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
        {trend === "down" && <ArrowDownRight className="w-4 h-4 text-red-400 flex-shrink-0" />}
      </div>
      <p className="text-[11px] text-muted-foreground mt-2 leading-tight">{label}</p>
      <p className="text-base sm:text-lg font-bold mt-0.5 leading-tight truncate">{vnd(value)}</p>
      {subLabel && <p className="text-[10px] text-muted-foreground mt-0.5">{subLabel}</p>}
    </div>
  );
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { value: number; name: string; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-xl p-3 shadow-lg text-xs">
      <p className="font-semibold mb-2 text-foreground">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium text-foreground">{vnd(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

function CustomPieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percentage, name }: {
  cx: number; cy: number; midAngle: number;
  innerRadius: number; outerRadius: number;
  percentage: number; name: string;
}) {
  if (percentage < 5) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight="600">
      {percentage}%
    </text>
  );
}

export default function RevenuePage() {
  const { effectiveIsAdmin } = useStaffAuth();
  const [onlyConfirmed, setOnlyConfirmed] = useState(false);
  const [onlyPaid, setOnlyPaid] = useState(false);
  const [periodMode, setPeriodMode] = useState("12months");
  const [chartTab, setChartTab] = useState("bar");

  function buildFilterParams() {
    const p = new URLSearchParams();
    if (onlyConfirmed) p.set("onlyConfirmed", "true");
    if (onlyPaid) p.set("onlyPaid", "true");
    return p.toString();
  }

  const filterKey = `${onlyConfirmed}-${onlyPaid}`;

  const { data: stats, isLoading: statsLoading } = useQuery<Stats>({
    queryKey: ["revenue-stats", filterKey],
    queryFn: () => fetch(`${BASE}/api/revenue/stats?${buildFilterParams()}`).then(r => r.json()),
    refetchInterval: 60000,
  });

  const { data: periodData = [], isLoading: periodLoading } = useQuery<PeriodPoint[]>({
    queryKey: ["revenue-by-period", filterKey, periodMode],
    queryFn: () => fetch(`${BASE}/api/revenue/by-period?${buildFilterParams()}&mode=${periodMode}`).then(r => r.ok ? r.json() : []).catch(() => []).then(d => Array.isArray(d) ? d : []),
    refetchInterval: 60000,
  });

  const { data: serviceData = [], isLoading: serviceLoading } = useQuery<ServiceRow[]>({
    queryKey: ["revenue-by-service", filterKey],
    queryFn: () => fetch(`${BASE}/api/revenue/by-service?${buildFilterParams()}`).then(r => r.ok ? r.json() : []).catch(() => []).then(d => Array.isArray(d) ? d : []),
    refetchInterval: 60000,
  });

  const { data: saleData = [], isLoading: saleLoading } = useQuery<SaleRow[]>({
    queryKey: ["revenue-by-sale", filterKey],
    queryFn: () => fetch(`${BASE}/api/revenue/by-sale?${buildFilterParams()}`).then(r => r.ok ? r.json() : []).catch(() => []).then(d => Array.isArray(d) ? d : []),
    refetchInterval: 60000,
  });

  if (!effectiveIsAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <TrendingUp className="w-12 h-12 mb-3 opacity-20" />
        <p className="font-medium">Không có quyền truy cập</p>
        <p className="text-sm mt-1">Chức năng này chỉ dành cho quản trị viên</p>
      </div>
    );
  }

  const s = stats;

  const statsCards = s ? [
    {
      group: "Doanh thu",
      color: "bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400",
      icon: TrendingUp,
      items: [
        { label: "Hôm nay", value: s.todayRevenue, sub: `${s.todayCount} đơn`, trend: "neutral" as const },
        { label: "Tuần này", value: s.weekRevenue, sub: `${s.weekCount} đơn`, trend: "neutral" as const },
        { label: "Tháng này", value: s.monthRevenue, sub: `${s.monthCount} đơn`, trend: "up" as const },
        { label: "Năm nay", value: s.yearRevenue, sub: `${s.yearCount} đơn`, trend: "up" as const },
      ],
    },
    {
      group: "Lợi nhuận",
      color: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
      icon: DollarSign,
      items: [
        { label: "Hôm nay", value: s.todayProfit, sub: `Chi: ${vndShort(s.todayExpenses)}`, trend: "neutral" as const },
        { label: "Tuần này", value: s.weekProfit, sub: `Chi: ${vndShort(s.weekExpenses)}`, trend: "neutral" as const },
        { label: "Tháng này", value: s.monthProfit, sub: `Chi: ${vndShort(s.monthExpenses)}`, trend: s.monthProfit >= 0 ? "up" as const : "down" as const },
        { label: "Năm nay", value: s.yearProfit, sub: `Chi: ${vndShort(s.yearExpenses)}`, trend: s.yearProfit >= 0 ? "up" as const : "down" as const },
      ],
    },
  ] : [];

  return (
    <div className="min-h-full bg-background">
      {/* Header */}
      <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-border">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Doanh thu & Lợi nhuận</h1>
              <p className="text-xs text-muted-foreground">Thống kê tổng hợp doanh thu và hiệu suất</p>
            </div>
          </div>

          {/* Status filter checkboxes */}
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onlyConfirmed}
                onChange={e => setOnlyConfirmed(e.target.checked)}
                className="w-4 h-4 rounded accent-violet-600"
              />
              <span className="text-xs font-medium text-foreground">Chỉ đã xác nhận</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onlyPaid}
                onChange={e => setOnlyPaid(e.target.checked)}
                className="w-4 h-4 rounded accent-violet-600"
              />
              <span className="text-xs font-medium text-foreground">Chỉ đã thu tiền</span>
            </label>
          </div>
        </div>

        {/* 8 Stats Cards */}
        {statsLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="rounded-2xl border border-border bg-card p-3 sm:p-4 h-20 animate-pulse bg-muted" />
            ))}
          </div>
        ) : (
          <>
            {statsCards.map(group => (
              <div key={group.group} className="mt-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                  <group.icon className="w-3 h-3" />
                  {group.group}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                  {group.items.map((item) => (
                    <StatCard
                      key={item.label}
                      label={item.label}
                      value={item.value}
                      subLabel={item.sub}
                      color={group.color}
                      icon={group.icon}
                      trend={item.trend}
                    />
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Main content */}
      <div className="p-4 sm:p-6 space-y-6">

        {/* Time Period Chart */}
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <h2 className="font-bold text-base flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-violet-600" />
                Biểu đồ doanh thu theo thời gian
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">Doanh thu, chi phí và lợi nhuận</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <div className="flex gap-1 bg-muted rounded-xl p-1">
                {PERIOD_MODES.map(m => (
                  <button key={m.key} onClick={() => setPeriodMode(m.key)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${periodMode === m.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                    {m.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-1 bg-muted rounded-xl p-1">
                {CHART_TABS.map(t => (
                  <button key={t.key} onClick={() => setChartTab(t.key)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${chartTab === t.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {periodLoading ? (
            <div className="h-56 animate-pulse bg-muted rounded-xl" />
          ) : (
            <div className="h-56 sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                {chartTab === "bar" ? (
                  <BarChart data={periodData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={vndShort} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={50} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend formatter={(v) => v === "revenue" ? "Doanh thu" : v === "expenses" ? "Chi phí" : "Lợi nhuận"} iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="revenue" name="revenue" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expenses" name="expenses" fill="#f87171" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="profit" name="profit" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                ) : (
                  <LineChart data={periodData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={vndShort} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={50} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend formatter={(v) => v === "revenue" ? "Doanh thu" : v === "expenses" ? "Chi phí" : "Lợi nhuận"} iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    <Line dataKey="revenue" name="revenue" stroke="#6366f1" strokeWidth={2} dot={{ r: 3, fill: "#6366f1" }} />
                    <Line dataKey="expenses" name="expenses" stroke="#f87171" strokeWidth={2} dot={{ r: 3, fill: "#f87171" }} />
                    <Line dataKey="profit" name="profit" stroke="#10b981" strokeWidth={2} dot={{ r: 3, fill: "#10b981" }} />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Service Donut + Top Sale side by side on desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Donut Chart */}
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
            <h2 className="font-bold text-base flex items-center gap-2 mb-4">
              <Award className="w-4 h-4 text-amber-500" />
              Dịch vụ theo doanh thu
            </h2>
            {serviceLoading ? (
              <div className="h-56 animate-pulse bg-muted rounded-xl" />
            ) : serviceData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm">
                <BarChart2 className="w-8 h-8 mb-2 opacity-20" />
                Chưa có dữ liệu
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <div className="w-full sm:w-48 h-48 flex-shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={serviceData}
                        dataKey="count"
                        nameKey="service"
                        cx="50%" cy="50%"
                        innerRadius="45%" outerRadius="70%"
                        labelLine={false}
                        label={(props) => <CustomPieLabel {...props} percentage={props.payload?.countPercentage ?? 0} />}
                      >
                        {serviceData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(val: number, _name: string, entry: { payload?: ServiceRow }) => [`${val} show (${vnd(entry.payload?.revenue ?? 0)})`, "Số show"]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-1.5 w-full">
                  {serviceData.map((s, i) => (
                    <div key={s.serviceKey} className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="text-foreground font-medium truncate">{s.service}</span>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className="font-bold text-foreground">{s.countPercentage}%</span>
                        <span className="text-muted-foreground ml-1">({s.count} show)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Top Sale Table */}
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
            <h2 className="font-bold text-base flex items-center gap-2 mb-4">
              <Users className="w-4 h-4 text-blue-500" />
              Bảng xếp hạng Sale
            </h2>
            {saleLoading ? (
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => <div key={i} className="h-10 animate-pulse bg-muted rounded-xl" />)}
              </div>
            ) : saleData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm">
                <Users className="w-8 h-8 mb-2 opacity-20" />
                Chưa có dữ liệu
              </div>
            ) : (
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left text-muted-foreground font-semibold pb-2 pl-4 sm:pl-0">#</th>
                      <th className="text-left text-muted-foreground font-semibold pb-2">Tên Sale</th>
                      <th className="text-right text-muted-foreground font-semibold pb-2">Đơn</th>
                      <th className="text-right text-muted-foreground font-semibold pb-2">Doanh thu</th>
                      <th className="text-right text-muted-foreground font-semibold pb-2">Lợi nhuận</th>
                      <th className="text-right text-muted-foreground font-semibold pb-2 pr-4 sm:pr-0">% đóng góp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {saleData.map((row, i) => (
                      <tr key={row.staffId} className="hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 pl-4 sm:pl-0">
                          {i === 0 ? <span className="text-amber-500 font-bold">🥇</span>
                            : i === 1 ? <span className="text-slate-400 font-bold">🥈</span>
                            : i === 2 ? <span className="text-amber-700 font-bold">🥉</span>
                            : <span className="text-muted-foreground">{i + 1}</span>}
                        </td>
                        <td className="py-2.5">
                          <span className="font-medium text-foreground">{row.staffName}</span>
                        </td>
                        <td className="py-2.5 text-right text-muted-foreground">{row.count}</td>
                        <td className="py-2.5 text-right font-medium text-violet-600">{vndShort(row.revenue)}</td>
                        <td className={`py-2.5 text-right font-medium ${row.profit >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                          {vndShort(row.profit)}
                        </td>
                        <td className="py-2.5 text-right pr-4 sm:pr-0">
                          <div className="flex items-center justify-end gap-1.5">
                            <div className="w-12 bg-muted rounded-full h-1.5 overflow-hidden hidden sm:block">
                              <div className="h-full bg-violet-500 rounded-full" style={{ width: `${Math.min(100, row.contribution)}%` }} />
                            </div>
                            <span className="font-bold text-foreground">{row.contribution}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Top Service Table */}
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          <h2 className="font-bold text-base flex items-center gap-2 mb-4">
            <Award className="w-4 h-4 text-violet-500" />
            Chi tiết theo dịch vụ
          </h2>
          {serviceLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <div key={i} className="h-10 animate-pulse bg-muted rounded-xl" />)}
            </div>
          ) : serviceData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground text-sm">
              Chưa có dữ liệu dịch vụ
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left text-muted-foreground font-semibold pb-2 pl-4 sm:pl-0">Dịch vụ</th>
                    <th className="text-right text-muted-foreground font-semibold pb-2">Số show</th>
                    <th className="text-right text-muted-foreground font-semibold pb-2">Doanh thu</th>
                    <th className="text-right text-muted-foreground font-semibold pb-2">Lợi nhuận</th>
                    <th className="text-right text-muted-foreground font-semibold pb-2 pr-4 sm:pr-0">Tỷ trọng</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {serviceData.map((row, i) => (
                    <tr key={row.serviceKey} className="hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 pl-4 sm:pl-0">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                          <span className="font-medium text-foreground">{row.service}</span>
                        </div>
                      </td>
                      <td className="py-2.5 text-right text-muted-foreground">{row.count}</td>
                      <td className="py-2.5 text-right font-medium text-violet-600">{vnd(row.revenue)}</td>
                      <td className={`py-2.5 text-right font-medium ${row.profit >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                        {vnd(row.profit)}
                      </td>
                      <td className="py-2.5 text-right pr-4 sm:pr-0">
                        <div className="flex items-center justify-end gap-1.5">
                          <div className="w-16 bg-muted rounded-full h-1.5 overflow-hidden hidden sm:block">
                            <div className="h-full rounded-full" style={{ width: `${Math.min(100, row.revenuePercentage)}%`, background: PIE_COLORS[i % PIE_COLORS.length] }} />
                          </div>
                          <span className="font-bold text-foreground">{row.revenuePercentage}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border">
                    <td className="py-2.5 pl-4 sm:pl-0 font-bold text-foreground">Tổng cộng</td>
                    <td className="py-2.5 text-right font-bold">{serviceData.reduce((s, r) => s + r.count, 0)}</td>
                    <td className="py-2.5 text-right font-bold text-violet-600">{vnd(serviceData.reduce((s, r) => s + r.revenue, 0))}</td>
                    <td className="py-2.5 text-right font-bold text-emerald-600">{vnd(serviceData.reduce((s, r) => s + r.profit, 0))}</td>
                    <td className="py-2.5 text-right pr-4 sm:pr-0 font-bold">100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
