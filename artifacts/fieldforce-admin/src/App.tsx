import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter } from 'wouter';

// Layout
import Layout from '@/components/layout/Layout';

// Pages
import Login from '@/pages/login';
import Dashboard from '@/pages/dashboard';
import UsersList from '@/pages/users/list';
import UserCreate from '@/pages/users/create';
import UserDetail from '@/pages/users/detail';
import UserDayPlan from '@/pages/users/day-plan';
import AlertsList from '@/pages/alerts';
import Settings from '@/pages/settings';
import Attendance from '@/pages/attendance';
import PublicTrack from '@/pages/public/track';
import PublicOnboarding from '@/pages/public/onboarding';
import Devices from '@/pages/devices';
import VendorAccounts from '@/pages/vendor-accounts';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AppRoutes() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/track/:token" component={PublicTrack} />
      <Route path="/onboarding/:token" component={PublicOnboarding} />
      
      {/* Authenticated Routes wrapped in Layout */}
      <Route>
        <Layout>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/users" component={UsersList} />
            <Route path="/users/new" component={UserCreate} />
            <Route path="/users/:id" component={UserDetail} />
            <Route path="/users/:id/day-plan" component={UserDayPlan} />
            <Route path="/alerts" component={AlertsList} />
            <Route path="/attendance" component={Attendance} />
            <Route path="/settings" component={Settings} />
            <Route path="/devices" component={Devices} />
            <Route path="/vendor-accounts" component={VendorAccounts} />
            <Route component={NotFound} />
          </Switch>
        </Layout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <AppRoutes />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
