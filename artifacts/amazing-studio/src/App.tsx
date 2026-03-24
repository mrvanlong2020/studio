import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import Dashboard from "@/pages/dashboard";
import CalendarPage from "@/pages/calendar";
import TasksPage from "@/pages/tasks";
import CustomersPage from "@/pages/customers";
import QuotesPage from "@/pages/quotes";
import WardrobePage from "@/pages/wardrobe";
import ServicesPage from "@/pages/services";
import PricingPage from "@/pages/pricing";
import AccountingHrPage from "@/pages/accounting-hr";
import AiAssistantPage from "@/pages/ai-assistant";
import SettingsPage from "@/pages/settings";
import BookingsPage from "@/pages/bookings";
import ContractsPage from "@/pages/contracts";
import ReportsPage from "@/pages/reports";
import NotFound from "@/pages/not-found";

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
        <Route path="/" component={Dashboard} />
        <Route path="/calendar" component={CalendarPage} />
        <Route path="/tasks" component={TasksPage} />
        <Route path="/customers" component={CustomersPage} />
        <Route path="/quotes" component={QuotesPage} />
        <Route path="/wardrobe" component={WardrobePage} />
        <Route path="/pricing" component={PricingPage} />
        <Route path="/services" component={ServicesPage} />
        <Route path="/accounting" component={AccountingHrPage} />
        <Route path="/ai-assistant" component={AiAssistantPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route path="/bookings" component={BookingsPage} />
        <Route path="/contracts" component={ContractsPage} />
        <Route path="/reports" component={ReportsPage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Router />
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
