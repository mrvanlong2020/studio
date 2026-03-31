import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatVND } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer,
} from "recharts";
import {
  ClipboardList, Wallet, AlertTriangle, TrendingUp,
  CalendarDays, ArrowRight, Receipt, BadgeAlert, Layers,
} from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui";

// ── Types ─────────────────────────────────────────────────────────────────────
interface DashboardSummary {
  bookedAmount: number;
  bookedCount: number;
  collectedAmount: number;
  collectedCount: number;
  owedTotal: number;
  owedCount: number;
  owedInPeriod: number;
  profit: number;
  linkedExpenses: number;
  generalExpenses: number;
  totalExpenses: number;
}

interface ChartPoint {
  date: string;
  amount: number;
  count: number;
}

interface ServiceRow {
  category: string;
  serviceKey?: string;
  label: string;
  bookedCount: number;
  bookedAmount: number;
  collectedAmount: number;
  owedAmount: number;
  bookedPercent: number;
  collectedPercent: number;
}

interface DebtRow {
  bookingId: number;
  bookingCode: string;
  customerName: string;
  customerPhone: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  shootDate: string;
  status: string;
}

interface UpcomingRow {
  id: number;
  customerName: string;
  customerPhone: string;
  shootDate: string;
  shootTime: string | null;
  packageType: string;
  serviceLabel: string | null;
  status: string;
}

interface DashboardV2 {
  period: { preset: string; from: string; to: string; bookingDateMode: string };
  summary: DashboardSummary;
  charts: { booked: ChartPoint[]; collected: ChartPoint[] };
  breakdown: { byService: ServiceRow[]; byCategory: ServiceRow[] };
  debts: { topDebtors: DebtRow[] };
  upcomingBookings: UpcomingRow[];
}

// ── Constants ─────────────────────────────────────────────────────────────────
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const fetchJson = (url: string) => fetch(`${BASE}${url}`).then(r => r.json());

type Period = "today" | "7days" | "month" | "year";

const PERIOD_TABS: { key: Period; label: string }[] = [
  { key: "today", label: "Hôm nay" },
  { key: "7days", label: "7 ngày" },
  { key: "month", label: "Tháng này" },
  { key: "year", label: "Năm nay" },
];

const STATUS_LABELS: Record<string, string> = {
  pending: "Chờ XN", confirmed: "Đã XN", in_progress: "Đang làm",
  completed: "Hoàn thành", cancelled: "Đã hủy",
};
const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  confirmed: "bg-blue-100 text-blue-700",
  in_progress: "bg-purple-100 text-purple-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

// ── Helper ────────────────────────────────────────────────────────────────────
function fmtChartLabel(date: string, preset: Period): string {
  if (preset === "year") {
    const m = parseInt(date.split("-")[1]);
    return `T${m}`;
  }
  const [, mm, dd] = date.split("-");
  return `${parseInt(dd)}/${parseInt(mm)}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────
interface KpiCardProps {
  icon: React.ElementType;
  label: string;
  value: string;
  sub: string;
  sub2?: string;
  color: string;
  bg: string;
}

function KpiCard({ icon: Icon, label, value, sub, sub2, color, bg }: KpiCardProps) {
  return (
    <div className={`rounded-2xl border bg-gradient-to-br ${bg} p-4 flex flex-col gap-2`}>
      <div className="flex items-start justify-between">
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <div className={`p-2 rounded-xl bg-white/60 ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className={`text-2xl font-bold tracking-tight ${color}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
      {sub2 && <p className="text-xs font-medium text-muted-foreground border-t pt-1.5 mt-0.5">{sub2}</p>}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border bg-muted/30 p-4 animate-pulse">
      <div className="h-3 w-20 bg-muted rounded mb-3" />
      <div className="h-7 w-32 bg-muted rounded mb-2" />
      <div className="h-3 w-24 bg-muted rounded" />
    </div>
  );
}

function SkeletonChart() {
  return (
    <div className="rounded-2xl border bg-card p-5 animate-pulse">
      <div className="h-4 w-40 bg-muted rounded mb-4" />
      <div className="h-40 bg-muted/40 rounded" />
    </div>
  );
}

interface ChartBarProps {
  data: { label: string; amount: number; count: number }[];
  color: string;
  label: string;
  emptyMsg: string;
  period: Period;
}

function ChartBar({ data, color, label: chartLabel, emptyMsg, period }: ChartBarProps) {
  const isEmpty = data.length === 0 || data.every(d => d.amount === 0);
  return (
    <>
      {isEmpty ? (
        <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">
          {emptyMsg}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              interval={period === "month" ? 4 : 0}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              tickFormatter={(v: number) =>
                v >= 1_000_000 ? `${(v / 1_000_000).toFixed(0)}M` : `${(v / 1_000).toFixed(0)}K`
              }
              width={48}
            />
            <RTooltip
              cursor={{ fill: "hsl(var(--muted)/0.5)" }}
              contentStyle={{ borderRadius: "12px", border: "1px solid hsl(var(--border))", fontSize: "12px" }}
              formatter={(v: number, _name: string, item: { payload: ChartPoint & { label: string } }) => [
                formatVND(v),
                `${chartLabel} (${item.payload.count})`,
              ]}
            />
            <Bar dataKey="amount" fill={color} radius={[4, 4, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [period, setPeriod] = useState<Period>("month");
  const [breakdownTab, setBreakdownTab] = useState<"service" | "category">("service");

  const { data, isLoading } = useQuery<DashboardV2>({
    queryKey: ["dashboard-v2", period],
    queryFn: () => fetchJson(`/api/dashboard/v2?period=${period}`),
    staleTime: 30_000,
  });

  const now = new Date();
  const dateLabel = now.toLocaleDateString("vi-VN", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const summary = data?.summary;
  const charts = data?.charts;
  const breakdown = data?.breakdown;
  const debts = data?.debts;
  const upcoming: UpcomingRow[] = data?.upcomingBookings ?? [];

  const bookedChartData = (charts?.booked ?? []).map(d => ({
    label: fmtChartLabel(d.date, period),
    amount: d.amount,
    count: d.count,
  }));
  const collectedChartData = (charts?.collected ?? []).map(d => ({
    label: fmtChartLabel(d.date, period),
    amount: d.amount,
    count: d.count,
  }));

  const activeBreakdown: ServiceRow[] =
    breakdownTab === "service"
      ? (breakdown?.byService ?? [])
      : (breakdown?.byCategory ?? []);

  const topDebtors: DebtRow[] = debts?.topDebtors ?? [];
  const profitPositive = (summary?.profit ?? 0) >= 0;

  return (
    <div className="space-y-5">
      {/* ── Header + Period tabs ─────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Tổng quan</h1>
          <p className="text-sm text-muted-foreground mt-0.5 capitalize">{dateLabel}</p>
        </div>
        <div className="flex gap-1 bg-muted rounded-xl p-1 self-start sm:self-auto">
          {PERIOD_TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setPeriod(t.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                period === t.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 4 KPI Cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <KpiCard
              icon={ClipboardList}
              label="Đã chốt"
              value={formatVND(summary?.bookedAmount ?? 0)}
              sub={`${summary?.bookedCount ?? 0} đơn trong kỳ`}
              sub2="Theo ngày ký hợp đồng"
              color="text-violet-600"
              bg="from-violet-50 to-card"
            />
            <KpiCard
              icon={Wallet}
              label="Đã thu"
              value={formatVND(summary?.collectedAmount ?? 0)}
              sub={`${summary?.collectedCount ?? 0} giao dịch`}
              sub2="Theo ngày nhận tiền thực tế"
              color="text-emerald-600"
              bg="from-emerald-50 to-card"
            />
            <KpiCard
              icon={AlertTriangle}
              label="Còn nợ (toàn bộ)"
              value={formatVND(summary?.owedTotal ?? 0)}
              sub={`${summary?.owedCount ?? 0} booking chưa thanh toán đủ`}
              sub2={
                (summary?.owedInPeriod ?? 0) > 0
                  ? `Phát sinh kỳ này: ${formatVND(summary!.owedInPeriod)}`
                  : "Kỳ này không phát sinh nợ mới"
              }
              color="text-amber-600"
              bg="from-amber-50 to-card"
            />
            <KpiCard
              icon={TrendingUp}
              label="Lợi nhuận"
              value={formatVND(summary?.profit ?? 0)}
              sub={`Sau ${formatVND(summary?.totalExpenses ?? 0)} chi phí`}
              sub2={profitPositive ? "Đang có lãi trong kỳ" : "Đang lỗ trong kỳ này"}
              color={profitPositive ? "text-blue-600" : "text-red-600"}
              bg={profitPositive ? "from-blue-50 to-card" : "from-red-50 to-card"}
            />
          </>
        )}
      </div>

      {/* ── Charts ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {isLoading ? (
          <>
            <SkeletonChart />
            <SkeletonChart />
          </>
        ) : (
          <>
            <div className="bg-card rounded-2xl border p-5">
              <h3 className="font-semibold text-sm mb-1 flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-violet-600" />
                Doanh số chốt
                <span className="text-xs font-normal text-muted-foreground ml-1">
                  (theo ngày ký HĐ)
                </span>
              </h3>
              <p className="text-xs text-muted-foreground mb-4">Tổng giá trị booking tạo mới</p>
              <ChartBar
                data={bookedChartData}
                color="#7c3aed"
                label="Đã chốt"
                emptyMsg="Không có dữ liệu trong kỳ này"
                period={period}
              />
            </div>

            <div className="bg-card rounded-2xl border p-5">
              <h3 className="font-semibold text-sm mb-1 flex items-center gap-2">
                <Wallet className="w-4 h-4 text-emerald-600" />
                Tiền đã thu
                <span className="text-xs font-normal text-muted-foreground ml-1">
                  (theo ngày nhận tiền)
                </span>
              </h3>
              <p className="text-xs text-muted-foreground mb-4">Tổng tiền thực nhận từ khách</p>
              <ChartBar
                data={collectedChartData}
                color="#059669"
                label="Đã thu"
                emptyMsg="Không có tiền thu trong kỳ này"
                period={period}
              />
            </div>
          </>
        )}
      </div>

      {/* ── Service Breakdown ────────────────────────────────── */}
      <div className="bg-card rounded-2xl border overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-semibold flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary" />
            Phân tích dịch vụ
          </h3>
          <div className="flex gap-1 bg-muted rounded-lg p-0.5">
            {(["service", "category"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setBreakdownTab(tab)}
                className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                  breakdownTab === tab ? "bg-background shadow-sm" : "text-muted-foreground"
                }`}
              >
                {tab === "service" ? "Theo dịch vụ" : "Theo nhóm"}
              </button>
            ))}
          </div>
        </div>
        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-8 bg-muted/40 rounded animate-pulse" />
            ))}
          </div>
        ) : activeBreakdown.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            Không có dữ liệu dịch vụ trong kỳ này
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Dịch vụ</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Đơn</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Đã chốt</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">%</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Đã thu</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">%</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Còn nợ</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {activeBreakdown.map((row, i) => (
                  <tr key={i} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium truncate max-w-[140px]">{row.label}</div>
                      {breakdownTab === "service" && row.category && (
                        <div className="text-xs text-muted-foreground capitalize">{row.category}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.bookedCount}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-violet-700">
                      {formatVND(row.bookedAmount)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground hidden sm:table-cell text-xs">
                      {row.bookedPercent}%
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-emerald-700">
                      {formatVND(row.collectedAmount)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground hidden sm:table-cell text-xs">
                      {row.collectedPercent}%
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-amber-700">
                      {row.owedAmount > 0
                        ? formatVND(row.owedAmount)
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              {activeBreakdown.length > 1 && (
                <tfoot>
                  <tr className="border-t bg-muted/20 font-semibold">
                    <td className="px-4 py-2.5 text-sm">Tổng</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-sm">
                      {activeBreakdown.reduce((s, r) => s + r.bookedCount, 0)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-sm text-violet-700">
                      {formatVND(activeBreakdown.reduce((s, r) => s + r.bookedAmount, 0))}
                    </td>
                    <td className="hidden sm:table-cell" />
                    <td className="px-4 py-2.5 text-right tabular-nums text-sm text-emerald-700">
                      {formatVND(activeBreakdown.reduce((s, r) => s + r.collectedAmount, 0))}
                    </td>
                    <td className="hidden sm:table-cell" />
                    <td className="px-4 py-2.5 text-right tabular-nums text-sm text-amber-700">
                      {formatVND(activeBreakdown.reduce((s, r) => s + r.owedAmount, 0))}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {/* ── Debt Section ─────────────────────────────────────── */}
      <div className="bg-card rounded-2xl border overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2">
            <BadgeAlert className="w-4 h-4 text-amber-500" />
            Công nợ phải thu
            {!isLoading && (summary?.owedTotal ?? 0) > 0 && (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                {formatVND(summary!.owedTotal)}
              </span>
            )}
          </h3>
          <Link href="/bookings" className="text-muted-foreground hover:text-primary">
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-8 bg-muted/40 rounded animate-pulse" />
            ))}
          </div>
        ) : topDebtors.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            Không có công nợ — tuyệt vời!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Mã HĐ</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Khách</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Tổng HĐ</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Đã trả</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Còn nợ</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Ngày chụp</th>
                  <th className="text-center px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">TT</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {topDebtors.map(d => (
                  <tr key={d.bookingId} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/calendar?id=${d.bookingId}`}
                        className="font-mono text-xs text-primary hover:underline"
                      >
                        {d.bookingCode}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-sm">{d.customerName}</div>
                      {d.customerPhone && (
                        <div className="text-xs text-muted-foreground">{d.customerPhone}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                      {formatVND(d.totalAmount)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground hidden md:table-cell">
                      {formatVND(d.paidAmount)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-bold text-red-600">
                      {formatVND(d.remainingAmount)}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground hidden sm:table-cell">
                      {d.shootDate
                        ? new Date(d.shootDate).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-center hidden sm:table-cell">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${STATUS_COLORS[d.status] ?? "bg-muted text-muted-foreground"}`}>
                        {STATUS_LABELS[d.status] ?? d.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Expense & Profit ─────────────────────────────────── */}
      {!isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-card rounded-2xl border p-5">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Receipt className="w-4 h-4 text-muted-foreground" />
              Chi phí trong kỳ
            </h3>
            <div className="space-y-2.5">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Chi gắn booking</span>
                <span className="font-medium tabular-nums">
                  {formatVND(summary?.linkedExpenses ?? 0)}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Chi tổng quát</span>
                <span className="font-medium tabular-nums">
                  {formatVND(summary?.generalExpenses ?? 0)}
                </span>
              </div>
              <div className="border-t pt-2.5 flex justify-between items-center">
                <span className="font-semibold">Tổng chi</span>
                <span className="font-bold tabular-nums text-red-600">
                  {formatVND(summary?.totalExpenses ?? 0)}
                </span>
              </div>
            </div>
          </div>

          <div className={`rounded-2xl border p-5 ${profitPositive ? "bg-emerald-50/60" : "bg-red-50/60"}`}>
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <TrendingUp className={`w-4 h-4 ${profitPositive ? "text-emerald-600" : "text-red-600"}`} />
              Lợi nhuận thực
            </h3>
            <div className="space-y-2.5">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Đã thu</span>
                <span className="font-medium text-emerald-700 tabular-nums">
                  +{formatVND(summary?.collectedAmount ?? 0)}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Tổng chi</span>
                <span className="font-medium text-red-600 tabular-nums">
                  −{formatVND(summary?.totalExpenses ?? 0)}
                </span>
              </div>
              <div className="border-t pt-2.5 flex justify-between items-center">
                <span className="font-semibold">Lợi nhuận</span>
                <div className="text-right">
                  <span className={`font-bold text-lg tabular-nums ${profitPositive ? "text-emerald-700" : "text-red-600"}`}>
                    {formatVND(summary?.profit ?? 0)}
                  </span>
                  <div className="text-xs mt-0.5">
                    <span className={`px-1.5 py-0.5 rounded font-medium ${profitPositive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                      {profitPositive ? "Có lãi" : "Bị lỗ"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Upcoming Bookings ────────────────────────────────── */}
      <div className="bg-card rounded-2xl border overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-primary" />
            Lịch chụp sắp tới
          </h3>
          <Link href="/calendar" className="text-muted-foreground hover:text-primary">
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        <div className="divide-y">
          {upcoming.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-muted-foreground text-sm gap-2">
              <CalendarDays className="w-10 h-10 opacity-20" />
              <p>Không có lịch chụp sắp tới</p>
            </div>
          ) : (
            upcoming.map(b => (
              <div key={b.id} className="px-4 py-3 flex justify-between items-center hover:bg-muted/20 transition-colors">
                <div>
                  <p className="font-medium text-sm">{b.customerName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {b.serviceLabel || b.packageType || "—"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">
                    {b.shootDate
                      ? new Date(b.shootDate).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })
                      : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">{b.shootTime ?? ""}</p>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="p-3 border-t">
          <Link href="/bookings">
            <Button variant="outline" size="sm" className="w-full">Xem tất cả đơn</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
