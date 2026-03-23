import { useState } from "react";
import { useListBookings } from "@workspace/api-client-react";
import { formatVND, formatDate } from "@/lib/utils";
import { Card, CardContent, Badge, Button } from "@/components/ui";
import { ChevronLeft, ChevronRight, Camera, User, Phone, MapPin, Clock } from "lucide-react";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, isToday } from "date-fns";
import { vi } from "date-fns/locale";

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  
  const { data: bookings = [], isLoading } = useListBookings({});

  const daysInMonth = eachDayOfInterval({
    start: startOfMonth(currentDate),
    end: endOfMonth(currentDate)
  });

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

  const selectedBookings = bookings.filter(b => isSameDay(new Date(b.shootDate), selectedDate));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Lịch chụp</h1>
          <p className="text-muted-foreground mt-1">Quản lý và theo dõi lịch trình theo ngày</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold capitalize">
                {format(currentDate, 'MMMM yyyy', { locale: vi })}
              </h2>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={prevMonth}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="outline" onClick={() => setCurrentDate(new Date())}>
                  Hôm nay
                </Button>
                <Button variant="outline" size="icon" onClick={nextMonth}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center font-medium text-sm text-muted-foreground mb-2">
              {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map(day => (
                <div key={day} className="py-2">{day}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-2">
              {/* Padding for first day of month */}
              {Array.from({ length: startOfMonth(currentDate).getDay() }).map((_, i) => (
                <div key={`empty-${i}`} className="h-24 sm:h-32 rounded-xl bg-muted/20 border border-transparent" />
              ))}
              
              {daysInMonth.map(day => {
                const dayBookings = bookings.filter(b => isSameDay(new Date(b.shootDate), day));
                const isSelected = isSameDay(day, selectedDate);
                const isCurrentToday = isToday(day);
                
                return (
                  <div 
                    key={day.toISOString()}
                    onClick={() => setSelectedDate(day)}
                    className={`h-24 sm:h-32 p-2 rounded-xl border transition-all cursor-pointer flex flex-col relative overflow-hidden group
                      ${isSelected ? 'border-primary ring-1 ring-primary shadow-sm bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30'}
                      ${isCurrentToday && !isSelected ? 'bg-accent/30' : ''}
                    `}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className={`text-sm font-medium w-6 h-6 flex items-center justify-center rounded-full ${isCurrentToday ? 'bg-primary text-primary-foreground' : ''}`}>
                        {format(day, 'd')}
                      </span>
                      {dayBookings.length > 0 && (
                        <Badge variant="secondary" className="px-1.5 py-0 text-[10px] bg-primary/20 text-primary border-0">
                          {dayBookings.length}
                        </Badge>
                      )}
                    </div>
                    
                    <div className="flex-1 overflow-y-auto space-y-1 no-scrollbar pb-1">
                      {dayBookings.slice(0,3).map(b => (
                        <div key={b.id} className="text-[10px] sm:text-xs truncate bg-background border rounded px-1.5 py-1 shadow-sm font-medium text-foreground">
                          {b.shootTime} {b.customerName}
                        </div>
                      ))}
                      {dayBookings.length > 3 && (
                        <div className="text-[10px] text-muted-foreground text-center font-medium">
                          +{dayBookings.length - 3} nữa
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="flex flex-col h-full lg:max-h-[800px]">
          <div className="p-6 border-b bg-muted/30">
            <h3 className="text-lg font-bold">
              Lịch ngày {formatDate(selectedDate.toISOString())}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {selectedBookings.length} lịch chụp được xếp
            </p>
          </div>
          
          <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
            {isLoading ? (
              <div className="text-center p-8 text-muted-foreground">Đang tải...</div>
            ) : selectedBookings.length === 0 ? (
              <div className="text-center p-12 flex flex-col items-center">
                <CalendarDays className="w-12 h-12 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground">Trống lịch</p>
              </div>
            ) : (
              selectedBookings.map(booking => (
                <div key={booking.id} className="p-4 rounded-xl border bg-card hover:shadow-md transition-all">
                  <div className="flex justify-between items-start mb-3">
                    <Badge variant={
                      booking.status === 'completed' ? 'success' : 
                      booking.status === 'confirmed' ? 'default' : 
                      booking.status === 'in_progress' ? 'warning' : 'secondary'
                    }>
                      {booking.status === 'completed' ? 'Hoàn thành' : 
                       booking.status === 'confirmed' ? 'Đã xác nhận' : 
                       booking.status === 'in_progress' ? 'Đang chụp' : 
                       booking.status === 'cancelled' ? 'Đã hủy' : 'Chờ xác nhận'}
                    </Badge>
                    <span className="font-bold text-primary flex items-center gap-1">
                      <Clock className="w-4 h-4" /> {booking.shootTime || "--:--"}
                    </span>
                  </div>
                  
                  <h4 className="font-bold text-lg mb-2">{booking.customerName}</h4>
                  
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4" /> {booking.customerPhone}
                    </div>
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4" /> {booking.packageType}
                    </div>
                    {booking.notes && (
                      <div className="flex items-start gap-2 mt-2 p-2 bg-muted/50 rounded-lg text-xs">
                        <FileText className="w-4 h-4 flex-shrink-0" /> 
                        <p>{booking.notes}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
