import * as React from "react";
import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, CalendarDays, CheckSquare, Users, 
  FileText, Shirt, Package, Calculator, Bot, Settings, 
  Moon, LogOut, Bell, Wallet, UserPlus, Menu,
  ClipboardList, Receipt, ScrollText, TrendingUp, LayoutList
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/calendar", label: "Lịch chụp", icon: CalendarDays },
  { href: "/bookings", label: "Đơn hàng", icon: ClipboardList },
  { href: "/tasks", label: "Giao việc", icon: CheckSquare },
  { href: "/customers", label: "Khách Hàng", icon: Users },
  { href: "/quotes", label: "Báo giá", icon: FileText },
  { href: "/contracts", label: "Hợp đồng", icon: ScrollText },
  { href: "/wardrobe", label: "Kho trang phục", icon: Shirt },
  { href: "/pricing", label: "Bảng giá", icon: LayoutList },
  { href: "/services", label: "Dịch vụ & Gói", icon: Package },
  { href: "/accounting", label: "Kế toán & Nhân sự", icon: Calculator },
  { href: "/reports", label: "Báo cáo", icon: TrendingUp },
  { href: "/ai-assistant", label: "Trợ lý AI", icon: Bot },
  { href: "/settings", label: "Cài đặt", icon: Settings },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [isMobileOpen, setIsMobileOpen] = React.useState(false);

  React.useEffect(() => {
    setIsMobileOpen(false);
  }, [location]);

  const toggleDarkMode = () => {
    document.documentElement.classList.toggle('dark');
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Mobile overlay */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 lg:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed lg:static inset-y-0 left-0 z-50 w-72 bg-sidebar border-r border-sidebar-border flex flex-col transition-transform duration-300 ease-in-out transform lg:translate-x-0",
        isMobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
      )}>
        <div className="p-6 flex items-center gap-3">
          <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center">
            <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Logo" className="w-8 h-8 object-contain" />
          </div>
          <div>
            <h1 className="font-bold text-lg text-sidebar-foreground leading-tight">Amazing</h1>
            <p className="text-[10px] tracking-widest text-muted-foreground font-semibold uppercase">STUDIO</p>
          </div>
        </div>

        <div className="px-4 mb-4">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-accent/50 border border-accent/20">
            <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
              AS
            </div>
            <div>
              <p className="text-sm font-semibold text-sidebar-foreground">Quản Trị Viên</p>
              <p className="text-xs text-muted-foreground">admin@amazing.vn</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 group",
                  isActive 
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm" 
                    : "text-sidebar-foreground hover:bg-muted"
                )}
              >
                <item.icon className={cn("w-5 h-5 transition-transform duration-200 group-hover:scale-110", isActive ? "text-sidebar-accent-foreground" : "text-muted-foreground")} />
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="p-4 border-t border-sidebar-border space-y-1">
          <button 
            onClick={toggleDarkMode}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-sidebar-foreground hover:bg-muted w-full transition-colors"
          >
            <Moon className="w-5 h-5 text-muted-foreground" />
            Chế độ Tối
          </button>
          <button className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-destructive hover:bg-destructive/10 w-full transition-colors">
            <LogOut className="w-5 h-5" />
            Đăng xuất
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Header */}
        <header className="h-16 flex-shrink-0 bg-background/80 backdrop-blur-md border-b border-border flex items-center justify-between px-4 sm:px-6 lg:px-8 z-10">
          <div className="flex items-center gap-4">
            <button 
              className="lg:hidden p-2 text-muted-foreground hover:bg-muted rounded-lg"
              onClick={() => setIsMobileOpen(true)}
            >
              <Menu className="w-6 h-6" />
            </button>
            <h2 className="text-xl font-semibold hidden sm:block">Amazing Studio</h2>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4">
            <Link href="/customers" className="flex items-center gap-2 text-sm font-medium text-primary bg-primary/10 hover:bg-primary/20 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full transition-colors">
              <UserPlus className="w-4 h-4" />
              <span className="hidden sm:inline">Khách hàng mới</span>
            </Link>
            <Link href="/accounting" className="p-2 text-muted-foreground hover:bg-muted rounded-full transition-colors">
              <Wallet className="w-5 h-5" />
            </Link>
            <button className="p-2 text-muted-foreground hover:bg-muted rounded-full transition-colors relative">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-destructive rounded-full border border-background"></span>
            </button>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
