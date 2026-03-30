import * as React from "react";
import { Link, useLocation } from "wouter";
import { SmartSearch } from "./SmartSearch";
import { 
  LayoutDashboard, CalendarDays, CheckSquare, Users, 
  FileText, Shirt, Bot, Settings, 
  Moon, LogOut, Bell, Wallet, UserPlus, Menu,
  ClipboardList, ScrollText, TrendingUp, LayoutList, UserCog,
  CreditCard, Film, MessageSquare, ChevronDown, Shield, Eye,
  Camera, Palette, Layers, Banknote, Star, TrendingDown, User, Timer, Funnel
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useStaffAuth, type SimulateRole } from "@/contexts/StaffAuthContext";
import StaffAvatar from "./StaffAvatar";

// ─── Navigation Items ──────────────────────────────────────────────────────────
const ALL_NAV_ITEMS = [
  { href: "/",                label: "Tổng quan",           icon: LayoutDashboard, adminOnly: true  },
  { href: "/my-profile",      label: "Hồ sơ của tôi",       icon: User,            adminOnly: false },
  { href: "/calendar",        label: "Lịch chụp",            icon: CalendarDays,    adminOnly: false },
  { href: "/customers",       label: "Khách hàng",           icon: Users,           adminOnly: false },
  { href: "/crm-leads",       label: "CRM Leads",            icon: Funnel,          adminOnly: true  },
  { href: "/bookings",        label: "Đơn hàng",             icon: ClipboardList,   adminOnly: false },
  { href: "/payments",        label: "Thu tiền",             icon: CreditCard,      adminOnly: false },
  { href: "/expenses",        label: "Chi tiền",             icon: TrendingDown,    adminOnly: true  },
  { href: "/revenue",         label: "Doanh thu & Lợi nhuận", icon: TrendingUp,    adminOnly: true  },
  { href: "/pricing",         label: "Dịch vụ & Bảng giá",  icon: LayoutList,      adminOnly: true  },
  { href: "/staff",           label: "Nhân sự",              icon: UserCog,         adminOnly: true  },
  { href: "/tasks",           label: "Giao việc",            icon: CheckSquare,     adminOnly: false },
  { href: "/photoshop-jobs",  label: "Tiến độ hậu kỳ",       icon: Film,            adminOnly: false },
  { href: "/attendance",      label: "Chấm công",             icon: Timer,           adminOnly: false },
  { href: "/internal-comms",  label: "Trao đổi & Nhắc việc", icon: MessageSquare,   adminOnly: false },
  { href: "/contracts",       label: "Hóa đơn dịch vụ",      icon: ScrollText,      adminOnly: true  },
  { href: "/quotes",          label: "Báo giá",              icon: FileText,        adminOnly: true  },
];

const SECONDARY_NAV = [
  { href: "/wardrobe",      label: "Kho trang phục", icon: Shirt,      adminOnly: false },
  { href: "/reports",       label: "Báo cáo",        icon: TrendingUp, adminOnly: true  },
  { href: "/ai-assistant",  label: "Trợ lý AI",      icon: Bot,        adminOnly: false },
  { href: "/settings",      label: "Cài đặt",        icon: Settings,   adminOnly: true  },
];

const SIMULATE_ROLES: { key: SimulateRole; label: string; icon: React.ElementType; color: string }[] = [
  { key: "photographer", label: "Nhân viên Chụp ảnh", icon: Camera,    color: "text-blue-500" },
  { key: "makeup",       label: "Nhân viên Makeup",   icon: Palette,   color: "text-pink-500" },
  { key: "photoshop",    label: "Nhân viên Photoshop",icon: Layers,    color: "text-violet-500" },
  { key: "sale",         label: "Nhân viên Sale",     icon: Star,      color: "text-amber-500" },
  { key: "assistant",    label: "Nhân viên Hỗ trợ",  icon: UserCog,   color: "text-slate-500" },
];

// ─── Layout ──────────────────────────────────────────────────────────────────
export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [isMobileOpen, setIsMobileOpen] = React.useState(false);
  const [showRoleMenu, setShowRoleMenu] = React.useState(false);
  const roleMenuRef = React.useRef<HTMLDivElement>(null);
  const { isAdmin, viewMode, setViewMode, simulateRole, setSimulateRole, effectiveIsAdmin, logout, viewer } = useStaffAuth();

  React.useEffect(() => {
    setIsMobileOpen(false);
    setShowRoleMenu(false);
  }, [location]);

  // Close role menu on outside click
  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (roleMenuRef.current && !roleMenuRef.current.contains(e.target as Node)) {
        setShowRoleMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggleDarkMode = () => {
    document.documentElement.classList.toggle("dark");
  };

  // Filter nav items based on effective role
  const visibleMain = ALL_NAV_ITEMS.filter(item =>
    effectiveIsAdmin || !item.adminOnly
  );
  const visibleSecondary = SECONDARY_NAV.filter(item =>
    effectiveIsAdmin || !item.adminOnly
  );

  // Current mode label
  const modeLabel = simulateRole
    ? SIMULATE_ROLES.find(r => r.key === simulateRole)?.label ?? "Nhân viên"
    : viewMode === "admin" ? "Quản trị viên" : "Nhân viên";

  const modeBadgeColor = simulateRole
    ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
    : viewMode === "admin"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
      : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Mobile overlay */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden backdrop-blur-sm"
          onClick={() => setIsMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed lg:static inset-y-0 left-0 z-50 w-72 bg-sidebar border-r border-sidebar-border flex flex-col transition-transform duration-300 ease-in-out transform lg:translate-x-0",
        isMobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
      )}>
        {/* Logo */}
        <div className="p-6 flex items-center gap-3">
          <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center">
            <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Logo" className="w-8 h-8 object-contain" />
          </div>
          <div>
            <h1 className="font-bold text-lg text-sidebar-foreground leading-tight">Amazing</h1>
            <p className="text-[10px] tracking-widest text-muted-foreground font-semibold uppercase">STUDIO</p>
          </div>
        </div>

        {/* Account card with role switcher */}
        <div className="px-4 mb-4" ref={roleMenuRef}>
          <button
            onClick={() => setShowRoleMenu(v => !v)}
            className="w-full flex items-center gap-3 p-3 rounded-xl bg-accent/50 border border-accent/20 hover:bg-accent/80 transition-colors group">
            <div className="flex-shrink-0">
              {viewer ? (
                <StaffAvatar
                  name={viewer.name ?? "?"}
                  avatar={(viewer as Record<string, unknown>).avatar as string | undefined}
                  role={viewer.role ?? "assistant"}
                  status="active"
                  size="lg"
                />
              ) : (
                <div className="h-11 w-11 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                  {simulateRole
                    ? (() => { const r = SIMULATE_ROLES.find(x => x.key === simulateRole); return r ? <r.icon className={cn("w-5 h-5", r.color)} /> : "NV"; })()
                    : viewMode === "admin" ? <Shield className="w-5 h-5 text-emerald-600" /> : <Eye className="w-5 h-5 text-blue-600" />
                  }
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-xs font-semibold text-sidebar-foreground truncate">{viewer?.name ?? modeLabel}</p>
              <p className="text-[10px] text-muted-foreground truncate">{modeLabel}</p>
            </div>
            <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform flex-shrink-0", showRoleMenu && "rotate-180")} />
          </button>

          {/* Role dropdown */}
          {showRoleMenu && (
            <div className="mt-1 bg-popover border border-border rounded-xl shadow-lg overflow-hidden z-50">
              {/* Admin mode */}
              {isAdmin && (
                <button
                  onClick={() => { setViewMode("admin"); setSimulateRole(null); setShowRoleMenu(false); }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left hover:bg-muted transition-colors",
                    viewMode === "admin" && !simulateRole && "bg-emerald-50 dark:bg-emerald-950/20"
                  )}>
                  <Shield className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span>Quản trị viên</span>
                  {viewMode === "admin" && !simulateRole && <span className="ml-auto text-xs text-emerald-600 font-medium">Đang dùng</span>}
                </button>
              )}
              {/* Staff mode */}
              <button
                onClick={() => { setViewMode("staff"); setSimulateRole(null); setShowRoleMenu(false); }}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left hover:bg-muted transition-colors",
                  viewMode === "staff" && !simulateRole && "bg-blue-50 dark:bg-blue-950/20"
                )}>
                <Eye className="w-4 h-4 text-blue-600 flex-shrink-0" />
                <span>Chế độ nhân viên</span>
                {viewMode === "staff" && !simulateRole && <span className="ml-auto text-xs text-blue-600 font-medium">Đang dùng</span>}
              </button>

              {/* Simulate roles (admin only) */}
              {isAdmin && (
                <>
                  <div className="px-3 py-1.5 border-t border-border">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Xem thử vai trò</p>
                  </div>
                  {SIMULATE_ROLES.map(r => (
                    <button key={r.key}
                      onClick={() => { setSimulateRole(r.key); setShowRoleMenu(false); }}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted transition-colors",
                        simulateRole === r.key && "bg-violet-50 dark:bg-violet-950/20"
                      )}>
                      <r.icon className={cn("w-3.5 h-3.5 flex-shrink-0", r.color)} />
                      <span>{r.label}</span>
                      {simulateRole === r.key && <span className="ml-auto text-xs text-violet-600 font-medium">Đang xem</span>}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto px-4 py-2">
          <div className="space-y-0.5">
            {visibleMain.map(item => {
              const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
              return (
                <Link key={item.href} href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                      : "text-sidebar-foreground hover:bg-muted"
                  )}>
                  <item.icon className={cn("w-4.5 h-4.5 transition-transform duration-200 group-hover:scale-110",
                    isActive ? "text-sidebar-accent-foreground" : "text-muted-foreground")} />
                  {item.label}
                </Link>
              );
            })}
          </div>

          <div className="mt-3 pt-3 border-t border-sidebar-border space-y-0.5">
            <p className="px-4 mb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Công cụ</p>
            {visibleSecondary.map(item => {
              const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
              return (
                <Link key={item.href} href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                      : "text-sidebar-foreground hover:bg-muted"
                  )}>
                  <item.icon className={cn("w-4.5 h-4.5 transition-transform duration-200 group-hover:scale-110",
                    isActive ? "text-sidebar-accent-foreground" : "text-muted-foreground")} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Footer buttons */}
        <div className="p-4 border-t border-sidebar-border space-y-1">
          <button onClick={toggleDarkMode}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-sidebar-foreground hover:bg-muted w-full transition-colors">
            <Moon className="w-5 h-5 text-muted-foreground" />
            Chế độ Tối
          </button>
          <button
            onClick={logout}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-destructive hover:bg-destructive/10 w-full transition-colors">
            <LogOut className="w-5 h-5" />
            Đăng xuất
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Header */}
        <header className="h-16 flex-shrink-0 bg-background/80 backdrop-blur-md border-b border-border flex items-center justify-between px-4 sm:px-6 lg:px-8 z-10">
          <div className="flex items-center gap-3">
            <button className="lg:hidden p-2 text-muted-foreground hover:bg-muted rounded-lg"
              onClick={() => setIsMobileOpen(true)}>
              <Menu className="w-6 h-6" />
            </button>
            <h2 className="text-xl font-semibold hidden sm:block">Amazing Studio</h2>
            {/* View mode badge */}
            {(!effectiveIsAdmin) && (
              <span className={cn("hidden sm:flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full", modeBadgeColor)}>
                {simulateRole
                  ? `Đang xem thử: ${SIMULATE_ROLES.find(r => r.key === simulateRole)?.label}`
                  : "Chế độ nhân viên"}
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4">
            <SmartSearch />
            <Link href="/customers"
              className="flex items-center gap-2 text-sm font-medium text-primary bg-primary/10 hover:bg-primary/20 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full transition-colors">
              <UserPlus className="w-4 h-4" />
              <span className="hidden sm:inline">Khách hàng mới</span>
            </Link>
            {effectiveIsAdmin && (
              <Link href="/payments" className="p-2 text-muted-foreground hover:bg-muted rounded-full transition-colors hidden sm:flex">
                <Wallet className="w-5 h-5" />
              </Link>
            )}
            <Link href="/internal-comms" className="p-2 text-muted-foreground hover:bg-muted rounded-full transition-colors relative hidden sm:flex">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-destructive rounded-full border border-background"></span>
            </Link>
            {/* Logout — always visible in header */}
            <button
              onClick={logout}
              title="Đăng xuất"
              className="p-2 text-destructive hover:bg-destructive/10 rounded-full transition-colors">
              <LogOut className="w-5 h-5" />
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
