import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import Dashboard from "@/pages/dashboard";
import CalendarPage from "@/pages/calendar";
import TasksPage from "@/pages/tasks";
import CustomersPage from "@/pages/customers";
import QuotesPage from "@/pages/quotes";
import WardrobePage from "@/pages/wardrobe";
import ServicesPage from "@/pages/services";
import ServiceDetailPage from "@/pages/service-detail";
import PricingPage from "@/pages/pricing";
import AccountingHrPage from "@/pages/accounting-hr";
import StaffPage from "@/pages/staff";
import StaffProfilePage from "@/pages/staff-profile";
import AiAssistantPage from "@/pages/ai-assistant";
import SettingsPage from "@/pages/settings";
import BookingsPage from "@/pages/bookings";
import ContractsPage from "@/pages/contracts";
import ReportsPage from "@/pages/reports";
import PaymentsPage from "@/pages/payments";
import ExpensesPage from "@/pages/expenses";
import RevenuePage from "@/pages/revenue";
import PhotoshopJobsPage from "@/pages/photoshop-jobs";
import InternalCommsPage from "@/pages/internal-comms";
import AttendancePage from "@/pages/attendance";
import AttendanceCheckinPage from "@/pages/attendance-checkin";
import MyProfilePage from "@/pages/my-profile";
import CrmLeadsPage from "@/pages/crm-leads";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import { StaffAuthProvider, useStaffAuth } from "@/contexts/StaffAuthContext";
import { Camera } from "lucide-react";

function AdminRoute({ component: Component }: { component: React.ComponentType }) {
  const { effectiveIsAdmin } = useStaffAuth();
  if (!effectiveIsAdmin) return <Redirect to="/calendar" />;
  return <Component />;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={() => <Redirect to="/calendar" />} />
        <Route path="/dashboard" component={() => <AdminRoute component={Dashboard} />} />
        <Route path="/calendar" component={CalendarPage} />
        <Route path="/tasks" component={TasksPage} />
        <Route path="/customers" component={CustomersPage} />
        <Route path="/quotes" component={() => <AdminRoute component={QuotesPage} />} />
        <Route path="/wardrobe" component={WardrobePage} />
        <Route path="/pricing" component={() => <AdminRoute component={PricingPage} />} />
        <Route path="/services/:id" component={ServiceDetailPage} />
        <Route path="/services" component={ServicesPage} />
        <Route path="/staff/:id" component={StaffProfilePage} />
        <Route path="/staff" component={() => <AdminRoute component={StaffPage} />} />
        <Route path="/accounting" component={AccountingHrPage} />
        <Route path="/ai-assistant" component={AiAssistantPage} />
        <Route path="/settings" component={() => <AdminRoute component={SettingsPage} />} />
        <Route path="/bookings" component={BookingsPage} />
        <Route path="/payments" component={PaymentsPage} />
        <Route path="/expenses" component={() => <AdminRoute component={ExpensesPage} />} />
        <Route path="/revenue" component={() => <AdminRoute component={RevenuePage} />} />
        <Route path="/contracts" component={() => <AdminRoute component={ContractsPage} />} />
        <Route path="/reports" component={() => <AdminRoute component={ReportsPage} />} />
        <Route path="/my-profile" component={MyProfilePage} />
        <Route path="/photoshop-jobs" component={PhotoshopJobsPage} />
        <Route path="/attendance/check-in" component={AttendanceCheckinPage} />
        <Route path="/attendance" component={AttendancePage} />
        <Route path="/internal-comms" component={InternalCommsPage} />
        <Route path="/crm-leads" component={() => <AdminRoute component={CrmLeadsPage} />} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function AppContent() {
  const { viewer, authChecked, login } = useStaffAuth();

  if (!authChecked) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 dark:from-slate-950 dark:via-slate-900 dark:to-purple-950">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-rose-400 to-purple-600 rounded-3xl shadow-2xl shadow-rose-200/50 mb-5 animate-pulse">
          <Camera className="w-10 h-10 text-white" />
        </div>
        <p className="text-muted-foreground text-sm mt-2">Đang tải...</p>
      </div>
    );
  }

  if (!viewer) {
    return <LoginPage onLogin={login} />;
  }

  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <Router />
    </WouterRouter>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <StaffAuthProvider>
        <AppContent />
      </StaffAuthProvider>
    </QueryClientProvider>
  );
}

export default App;
