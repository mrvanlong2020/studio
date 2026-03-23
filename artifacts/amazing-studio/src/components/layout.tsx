import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Users, 
  Camera, 
  Shirt, 
  CalendarDays, 
  CreditCard,
  Menu,
  X,
  Sparkles
} from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const navItems = [
  { href: "/", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/customers", label: "Khách hàng", icon: Users },
  { href: "/bookings", label: "Lịch chụp", icon: Camera },
  { href: "/dresses", label: "Váy cưới", icon: Shirt },
  { href: "/rentals", label: "Cho thuê váy", icon: CalendarDays },
  { href: "/payments", label: "Thanh toán", icon: CreditCard },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const NavLinks = ({ onClick }: { onClick?: () => void }) => (
    <>
      {navItems.map((item) => {
        const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
        return (
          <Link 
            key={item.href} 
            href={item.href}
            onClick={onClick}
            className={`
              flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200
              ${isActive 
                ? "bg-primary/10 text-primary font-medium shadow-sm shadow-primary/5" 
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }
            `}
          >
            <item.icon className={`w-5 h-5 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
            {item.label}
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 bg-card border-b border-border/50 sticky top-0 z-50">
        <div className="flex items-center gap-2 text-primary">
          <Sparkles className="w-6 h-6" />
          <span className="font-serif font-bold text-xl">Amazing Studio</span>
        </div>
        <button 
          onClick={() => setIsMobileOpen(true)}
          className="p-2 text-foreground bg-muted/50 rounded-lg"
        >
          <Menu className="w-6 h-6" />
        </button>
      </div>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {isMobileOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 md:hidden"
              onClick={() => setIsMobileOpen(false)}
            />
            <motion.div 
              initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}
              transition={{ type: "spring", bounce: 0, duration: 0.3 }}
              className="fixed inset-y-0 left-0 w-3/4 max-w-sm bg-card z-50 p-6 flex flex-col shadow-2xl border-r border-border"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-2 text-primary">
                  <Sparkles className="w-6 h-6" />
                  <span className="font-serif font-bold text-2xl">Amazing</span>
                </div>
                <button onClick={() => setIsMobileOpen(false)} className="p-2 bg-muted rounded-full">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="flex flex-col gap-2">
                <NavLinks onClick={() => setIsMobileOpen(false)} />
              </nav>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-card border-r border-border/50 h-screen sticky top-0">
        <div className="p-6">
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="w-7 h-7" />
            <div>
              <h1 className="font-serif font-bold text-2xl leading-none">Amazing</h1>
              <p className="text-xs uppercase tracking-widest text-muted-foreground mt-1">Studio</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-4 py-2 flex flex-col gap-2">
          <NavLinks />
        </nav>
        <div className="p-4 border-t border-border/50">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-br from-primary/5 to-rose-400/5 border border-primary/10">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
              AS
            </div>
            <div>
              <p className="text-sm font-medium">Quản trị viên</p>
              <p className="text-xs text-muted-foreground">amazing@studio.vn</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 lg:p-10 w-full max-w-[1600px] mx-auto overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}
