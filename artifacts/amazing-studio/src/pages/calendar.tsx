import { useState, useMemo } from "react";
import { useListBookings } from "@workspace/api-client-react";
import {
  convertSolarToLunar,
  getCanChi,
  getLunarMonthName,
  getTietKhi,
  LUNAR_HOLIDAYS,
  SOLAR_HOLIDAYS,
} from "@/lib/lunar";
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isToday,
  getDay,
  addWeeks,
  subWeeks,
  startOfWeek,
  endOfWeek,
} from "date-fns";
import { vi } from "date-fns/locale";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Clock,
  Phone,
  Package2,
  FileText,
  Sun,
  Moon,
  AlertCircle,
  CalendarCheck,
} from "lucide-react";

type ViewMode = "month" | "week";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: "Chờ xác nhận", color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  confirmed: { label: "Đã xác nhận", color: "bg-blue-100 text-blue-800 border-blue-200" },
  in_progress: { label: "Đang chụp", color: "bg-purple-100 text-purple-800 border-purple-200" },
  completed: { label: "Hoàn thành", color: "bg-green-100 text-green-800 border-green-200" },
  cancelled: { label: "Đã hủy", color: "bg-red-100 text-red-800 border-red-200" },
};

const STATUS_DOT: Record<string, string> = {
  pending: "bg-yellow-400",
  confirmed: "bg-blue-500",
  in_progress: "bg-purple-500",
  completed: "bg-green-500",
  cancelled: "bg-red-400",
};

function useLunarDay(date: Date) {
  return useMemo(() => {
    const d = date.getDate();
    const m = date.getMonth() + 1;
    const y = date.getFullYear();
    const lunar = convertSolarToLunar(d, m, y);
    const tietKhi = getTietKhi(d, m, y);
    const solarKey = `${d}-${m}`;
    const lunarKey = `${lunar.day}-${lunar.month}`;
    const solarHoliday = SOLAR_HOLIDAYS[solarKey] ?? null;
    const lunarHoliday = LUNAR_HOLIDAYS[lunarKey] ?? null;
    return { lunar, tietKhi, solarHoliday, lunarHoliday };
  }, [date]);
}

function LunarDayCell({ date }: { date: Date }) {
  const { lunar, tietKhi, solarHoliday, lunarHoliday } = useLunarDay(date);
  const isNewMonth = lunar.day === 1;
  return (
    <span className={`text-[9px] leading-tight font-medium ${lunarHoliday ? "text-red-500" : isNewMonth ? "text-primary font-bold" : "text-muted-foreground"}`}>
      {isNewMonth
        ? `${lunar.day}/${lunar.month}${lunar.leap ? " N" : ""}`
        : lunar.day}
      {tietKhi && <span className="ml-0.5 text-[8px] text-orange-500">✦</span>}
    </span>
  );
}

function DayCell({
  date,
  bookings,
  isSelected,
  onClick,
  isOtherMonth,
}: {
  date: Date;
  bookings: { id: number; customerName: string; shootTime?: string | null; status: string }[];
  isSelected: boolean;
  onClick: () => void;
  isOtherMonth?: boolean;
}) {
  const { lunar, tietKhi, solarHoliday, lunarHoliday } = useLunarDay(date);
  const isSunday = date.getDay() === 0;
  const isSaturday = date.getDay() === 6;
  const isLunarNew = lunar.day === 1;
  const isRam = lunar.day === 15;
  const isHoliday = solarHoliday || lunarHoliday;

  return (
    <div
      onClick={onClick}
      className={`relative min-h-[80px] sm:min-h-[100px] p-1.5 rounded-xl border cursor-pointer transition-all group
        ${isSelected ? "border-primary bg-primary/5 ring-1 ring-primary shadow-sm" : "border-border hover:border-primary/40 hover:bg-muted/30"}
        ${isOtherMonth ? "opacity-40" : ""}
      `}
    >
      {/* Solar date */}
      <div className="flex items-start justify-between mb-0.5">
        <span
          className={`text-sm font-bold w-6 h-6 flex items-center justify-center rounded-full transition-all
            ${isToday(date) ? "bg-primary text-primary-foreground shadow" : ""}
            ${isSunday && !isToday(date) ? "text-red-500" : ""}
            ${isSaturday && !isToday(date) ? "text-blue-500" : ""}
          `}
        >
          {date.getDate()}
        </span>
        {bookings.length > 0 && (
          <span className="text-[10px] bg-primary/15 text-primary font-bold px-1 rounded-full">
            {bookings.length}
          </span>
        )}
      </div>

      {/* Lunar date */}
      <div className="flex items-center gap-1 mb-1">
        <LunarDayCell date={date} />
        {(isLunarNew || isRam) && (
          <span className={`text-[8px] px-0.5 rounded ${isRam ? "bg-yellow-100 text-yellow-700" : "bg-blue-100 text-blue-700"}`}>
            {isRam ? "Rằm" : "Mùng 1"}
          </span>
        )}
      </div>

      {/* Tiết khí */}
      {tietKhi && (
        <div className="text-[8px] text-orange-500 font-medium truncate mb-0.5">{tietKhi}</div>
      )}

      {/* Holiday */}
      {isHoliday && (
        <div className="text-[8px] text-red-500 font-semibold truncate leading-tight">
          {solarHoliday || lunarHoliday}
        </div>
      )}

      {/* Bookings */}
      <div className="space-y-0.5 overflow-hidden">
        {bookings.slice(0, 2).map((b) => (
          <div
            key={b.id}
            className="flex items-center gap-1 text-[9px] sm:text-[10px] truncate rounded px-1 py-0.5 bg-background border shadow-sm"
          >
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[b.status] ?? "bg-gray-400"}`} />
            <span className="truncate font-medium">{b.shootTime ? b.shootTime.slice(0, 5) + " " : ""}{b.customerName}</span>
          </div>
        ))}
        {bookings.length > 2 && (
          <div className="text-[9px] text-muted-foreground text-center">+{bookings.length - 2}</div>
        )}
      </div>
    </div>
  );
}

function WeekViewRow({
  date,
  bookings,
  isSelected,
  onClick,
}: {
  date: Date;
  bookings: { id: number; customerName: string; shootTime?: string | null; status: string; packageType: string; customerPhone: string }[];
  isSelected: boolean;
  onClick: () => void;
}) {
  const { lunar, solarHoliday, lunarHoliday, tietKhi } = useLunarDay(date);
  const isSunday = date.getDay() === 0;
  const isLunarNew = lunar.day === 1;
  const isRam = lunar.day === 15;

  return (
    <div
      onClick={onClick}
      className={`flex gap-3 p-3 rounded-xl border cursor-pointer transition-all hover:shadow-sm
        ${isSelected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-primary/30"}
        ${isToday(date) ? "bg-accent/20" : ""}
      `}
    >
      {/* Date column */}
      <div className="flex flex-col items-center justify-start min-w-[48px]">
        <span className={`text-xs font-medium ${isSunday ? "text-red-500" : "text-muted-foreground"}`}>
          {format(date, "EEE", { locale: vi }).toUpperCase()}
        </span>
        <span
          className={`text-xl font-bold w-9 h-9 flex items-center justify-center rounded-full mt-0.5
            ${isToday(date) ? "bg-primary text-primary-foreground" : isSunday ? "text-red-500" : "text-foreground"}
          `}
        >
          {date.getDate()}
        </span>
        {/* Lunar */}
        <span className={`text-[10px] mt-0.5 font-medium ${isLunarNew || isRam ? "text-primary font-bold" : "text-muted-foreground"}`}>
          ÂL {isLunarNew ? `1/${lunar.month}${lunar.leap ? "N" : ""}` : isRam ? `15/${lunar.month}` : lunar.day}
        </span>
        {tietKhi && <span className="text-[9px] text-orange-500 mt-0.5">{tietKhi}</span>}
        {(solarHoliday || lunarHoliday) && (
          <span className="text-[9px] text-red-500 text-center leading-tight mt-0.5">{solarHoliday || lunarHoliday}</span>
        )}
      </div>

      {/* Events */}
      <div className="flex-1 min-h-[64px]">
        {bookings.length === 0 ? (
          <p className="text-muted-foreground text-xs italic mt-2">Trống lịch</p>
        ) : (
          <div className="space-y-1.5">
            {bookings.map((b) => (
              <div key={b.id} className={`rounded-lg px-3 py-2 border text-xs ${STATUS_MAP[b.status]?.color ?? "bg-gray-100 text-gray-800 border-gray-200"}`}>
                <div className="flex items-center justify-between">
                  <span className="font-bold">{b.customerName}</span>
                  <span className="font-medium">{b.shootTime?.slice(0, 5)}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 opacity-80">
                  <Package2 className="w-3 h-3" />
                  <span>{b.packageType}</span>
                  <Phone className="w-3 h-3 ml-1" />
                  <span>{b.customerPhone}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [view, setView] = useState<ViewMode>("month");
  const [showLunar, setShowLunar] = useState(true);

  const { data: bookings = [], isLoading } = useListBookings({});

  // Month view days
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Week view days
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 });
  const daysInWeek = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const getBookingsForDay = (date: Date) =>
    bookings.filter((b) => isSameDay(new Date(b.shootDate), date));

  const selectedBookings = getBookingsForDay(selectedDate);
  const selectedLunar = useMemo(() => {
    const d = selectedDate.getDate();
    const m = selectedDate.getMonth() + 1;
    const y = selectedDate.getFullYear();
    return convertSolarToLunar(d, m, y);
  }, [selectedDate]);

  const prev = () => {
    if (view === "month") setCurrentDate(subMonths(currentDate, 1));
    else setCurrentDate(subWeeks(currentDate, 1));
  };
  const next = () => {
    if (view === "month") setCurrentDate(addMonths(currentDate, 1));
    else setCurrentDate(addWeeks(currentDate, 1));
  };

  const monthLunar = useMemo(() => {
    const d = 1;
    const m = currentDate.getMonth() + 1;
    const y = currentDate.getFullYear();
    return convertSolarToLunar(d, m, y);
  }, [currentDate]);

  const firstDayOfMonth = monthStart.getDay();

  // Stats for month
  const monthBookings = bookings.filter((b) =>
    isSameDay(new Date(b.shootDate), monthStart) ||
    (new Date(b.shootDate) >= monthStart && new Date(b.shootDate) <= monthEnd)
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Lịch Chụp</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Dương lịch & Âm lịch Việt Nam
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* View toggle */}
          <div className="flex items-center bg-muted rounded-lg p-0.5 text-sm">
            <button
              onClick={() => setView("month")}
              className={`px-3 py-1.5 rounded-md font-medium transition-all flex items-center gap-1.5
                ${view === "month" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Calendar className="w-3.5 h-3.5" /> Tháng
            </button>
            <button
              onClick={() => setView("week")}
              className={`px-3 py-1.5 rounded-md font-medium transition-all flex items-center gap-1.5
                ${view === "week" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <CalendarCheck className="w-3.5 h-3.5" /> Tuần
            </button>
          </div>

          {/* Lunar toggle */}
          <button
            onClick={() => setShowLunar(!showLunar)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all
              ${showLunar ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}
          >
            <Moon className="w-3.5 h-3.5" />
            Âm lịch
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Main Calendar */}
        <div className="xl:col-span-2 bg-card rounded-2xl border shadow-sm overflow-hidden">
          {/* Calendar Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b bg-gradient-to-r from-card to-muted/20">
            <div>
              <div className="flex items-center gap-2">
                <Sun className="w-4 h-4 text-orange-400" />
                <span className="text-lg font-bold capitalize">
                  {format(currentDate, view === "month" ? "MMMM yyyy" : "'Tuần của' dd/MM/yyyy", { locale: vi })}
                </span>
              </div>
              {showLunar && (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Moon className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-xs text-muted-foreground">
                    {getLunarMonthName(monthLunar.month, monthLunar.leap)} {getCanChi(monthLunar.year)} ({monthLunar.year})
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={prev} className="w-8 h-8 rounded-lg border bg-background hover:bg-muted flex items-center justify-center transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => { setCurrentDate(new Date()); setSelectedDate(new Date()); }}
                className="px-3 h-8 rounded-lg border bg-background hover:bg-muted text-sm font-medium transition-colors"
              >
                Hôm nay
              </button>
              <button onClick={next} className="w-8 h-8 rounded-lg border bg-background hover:bg-muted flex items-center justify-center transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Month View */}
          {view === "month" && (
            <div className="p-3">
              {/* Day headers */}
              <div className="grid grid-cols-7 text-center mb-2">
                {["CN", "T2", "T3", "T4", "T5", "T6", "T7"].map((d, i) => (
                  <div
                    key={d}
                    className={`text-xs font-bold py-1.5 ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-muted-foreground"}`}
                  >
                    {d}
                  </div>
                ))}
              </div>

              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-1">
                {/* Empty cells before first day */}
                {Array.from({ length: firstDayOfMonth }).map((_, i) => {
                  const prevDate = new Date(monthStart);
                  prevDate.setDate(prevDate.getDate() - (firstDayOfMonth - i));
                  return (
                    <DayCell
                      key={`prev-${i}`}
                      date={prevDate}
                      bookings={getBookingsForDay(prevDate) as { id: number; customerName: string; shootTime?: string | null; status: string }[]}
                      isSelected={isSameDay(prevDate, selectedDate)}
                      onClick={() => setSelectedDate(prevDate)}
                      isOtherMonth
                    />
                  );
                })}

                {daysInMonth.map((day) => (
                  <DayCell
                    key={day.toISOString()}
                    date={day}
                    bookings={getBookingsForDay(day) as { id: number; customerName: string; shootTime?: string | null; status: string }[]}
                    isSelected={isSameDay(day, selectedDate)}
                    onClick={() => setSelectedDate(day)}
                  />
                ))}

                {/* Fill remaining cells */}
                {Array.from({ length: (7 - ((firstDayOfMonth + daysInMonth.length) % 7)) % 7 }).map((_, i) => {
                  const nextDate = new Date(monthEnd);
                  nextDate.setDate(nextDate.getDate() + i + 1);
                  return (
                    <DayCell
                      key={`next-${i}`}
                      date={nextDate}
                      bookings={getBookingsForDay(nextDate) as { id: number; customerName: string; shootTime?: string | null; status: string }[]}
                      isSelected={isSameDay(nextDate, selectedDate)}
                      onClick={() => setSelectedDate(nextDate)}
                      isOtherMonth
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Week View */}
          {view === "week" && (
            <div className="p-3 space-y-2">
              {daysInWeek.map((day) => (
                <WeekViewRow
                  key={day.toISOString()}
                  date={day}
                  bookings={getBookingsForDay(day) as { id: number; customerName: string; shootTime?: string | null; status: string; packageType: string; customerPhone: string }[]}
                  isSelected={isSameDay(day, selectedDate)}
                  onClick={() => setSelectedDate(day)}
                />
              ))}
            </div>
          )}

          {/* Legend */}
          {showLunar && (
            <div className="px-4 py-2 border-t bg-muted/20 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><Moon className="w-3 h-3 text-indigo-400" /> = Âm lịch</span>
              <span className="flex items-center gap-1"><span className="text-orange-500">✦</span> = Tiết khí</span>
              <span className="flex items-center gap-1"><span className="text-primary font-bold">1/x</span> = Mùng 1</span>
              <span className="flex items-center gap-1"><span className="text-yellow-600 font-bold">Rằm</span> = 15 âm</span>
              <span className="flex items-center gap-1"><span className="text-red-500">●</span> = Ngày lễ</span>
            </div>
          )}
        </div>

        {/* Right Panel */}
        <div className="flex flex-col gap-3">
          {/* Selected day info */}
          <div className="bg-card rounded-2xl border shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-gradient-to-r from-primary/10 to-card border-b">
              <div className="flex items-center gap-2 mb-1">
                <Sun className="w-4 h-4 text-orange-400" />
                <span className="font-bold text-base">
                  {format(selectedDate, "EEEE, dd/MM/yyyy", { locale: vi })}
                </span>
              </div>
              {showLunar && (
                <div className="flex items-center gap-2">
                  <Moon className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-sm text-muted-foreground">
                    Ngày {selectedLunar.day} {getLunarMonthName(selectedLunar.month, selectedLunar.leap)}{" "}
                    {getCanChi(selectedLunar.year)}
                  </span>
                </div>
              )}
              {(() => {
                const d = selectedDate.getDate();
                const m = selectedDate.getMonth() + 1;
                const y = selectedDate.getFullYear();
                const tk = getTietKhi(d, m, y);
                const sh = SOLAR_HOLIDAYS[`${d}-${m}`];
                const lh = LUNAR_HOLIDAYS[`${selectedLunar.day}-${selectedLunar.month}`];
                return (
                  <>
                    {tk && (
                      <div className="mt-1 flex items-center gap-1 text-xs text-orange-600 font-medium">
                        <span>✦</span> Tiết: {tk}
                      </div>
                    )}
                    {(sh || lh) && (
                      <div className="mt-1 flex items-center gap-1 text-xs text-red-600 font-semibold">
                        <AlertCircle className="w-3 h-3" />
                        {sh || lh}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Bookings list */}
            <div className="p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-sm">
                  {selectedBookings.length > 0
                    ? `${selectedBookings.length} lịch chụp`
                    : "Không có lịch"}
                </h3>
              </div>

              {isLoading ? (
                <div className="text-center py-6 text-muted-foreground text-sm">Đang tải...</div>
              ) : selectedBookings.length === 0 ? (
                <div className="text-center py-8 flex flex-col items-center text-muted-foreground">
                  <Calendar className="w-10 h-10 mb-2 opacity-20" />
                  <p className="text-sm">Ngày này trống lịch</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                  {selectedBookings.map((booking) => {
                    const s = STATUS_MAP[booking.status] ?? STATUS_MAP.pending;
                    return (
                      <div key={booking.id} className="rounded-xl border bg-card p-3 hover:shadow-sm transition-all">
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${s.color}`}>
                            {s.label}
                          </span>
                          <span className="flex items-center gap-1 text-xs font-bold text-primary">
                            <Clock className="w-3 h-3" />
                            {booking.shootTime?.slice(0, 5) ?? "--:--"}
                          </span>
                        </div>
                        <p className="font-bold text-sm mb-1.5">{booking.customerName}</p>
                        <div className="space-y-1 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <Phone className="w-3 h-3" /> {booking.customerPhone}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Package2 className="w-3 h-3" /> {booking.packageType}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-foreground">
                              Còn lại: {(booking.remainingAmount ?? 0).toLocaleString("vi-VN")} đ
                            </span>
                          </div>
                          {booking.notes && (
                            <div className="flex items-start gap-1.5 mt-1.5 p-2 bg-muted/40 rounded-lg">
                              <FileText className="w-3 h-3 flex-shrink-0 mt-0.5" />
                              <span>{booking.notes}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Month Summary */}
          <div className="bg-card rounded-2xl border shadow-sm p-4">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              Tổng tháng {currentDate.getMonth() + 1}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(STATUS_MAP).slice(0, 4).map(([status, { label, color }]) => {
                const count = monthBookings.filter((b) => b.status === status).length;
                return (
                  <div key={status} className={`rounded-lg px-3 py-2 border text-center ${color}`}>
                    <div className="text-lg font-bold">{count}</div>
                    <div className="text-[10px] font-medium">{label}</div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 pt-3 border-t flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Tổng lịch</span>
              <span className="font-bold text-primary">{monthBookings.length} ca</span>
            </div>
          </div>

          {/* Upcoming holidays */}
          <div className="bg-card rounded-2xl border shadow-sm p-4">
            <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500" />
              Ngày lễ trong tháng
            </h3>
            <div className="space-y-1.5 text-xs">
              {daysInMonth
                .filter((d) => {
                  const sk = `${d.getDate()}-${d.getMonth() + 1}`;
                  const lunar = convertSolarToLunar(d.getDate(), d.getMonth() + 1, d.getFullYear());
                  const lk = `${lunar.day}-${lunar.month}`;
                  return SOLAR_HOLIDAYS[sk] || LUNAR_HOLIDAYS[lk];
                })
                .map((d) => {
                  const sk = `${d.getDate()}-${d.getMonth() + 1}`;
                  const lunar = convertSolarToLunar(d.getDate(), d.getMonth() + 1, d.getFullYear());
                  const lk = `${lunar.day}-${lunar.month}`;
                  const name = SOLAR_HOLIDAYS[sk] || LUNAR_HOLIDAYS[lk];
                  const isLunar = !!LUNAR_HOLIDAYS[lk];
                  return (
                    <div key={d.toISOString()} className="flex items-center justify-between rounded-lg bg-muted/30 px-2.5 py-1.5">
                      <div className="flex items-center gap-1.5">
                        {isLunar ? <Moon className="w-3 h-3 text-indigo-400" /> : <Sun className="w-3 h-3 text-orange-400" />}
                        <span className="text-red-600 font-medium">{name}</span>
                      </div>
                      <span className="text-muted-foreground">{d.getDate()}/{d.getMonth() + 1}</span>
                    </div>
                  );
                })}
              {daysInMonth.filter((d) => {
                const sk = `${d.getDate()}-${d.getMonth() + 1}`;
                const lunar = convertSolarToLunar(d.getDate(), d.getMonth() + 1, d.getFullYear());
                const lk = `${lunar.day}-${lunar.month}`;
                return SOLAR_HOLIDAYS[sk] || LUNAR_HOLIDAYS[lk];
              }).length === 0 && (
                <p className="text-muted-foreground text-center py-2">Không có ngày lễ</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
