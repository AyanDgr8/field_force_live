import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter } from 'wouter';

// Layout
import Layout from '@/components/layout/Layout';

// Pages
import Login from '@/pages/login';
import { ResetPasswordRequest, ResetPasswordConfirm } from '@/pages/reset-password';
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
import MobileAppQrCode from '@/pages/qrcode';
import IotOperations from '@/pages/iot-operations';
import HubConfiguration from '@/pages/hub-configuration';
import SuperAdmins from '@/pages/super-admins';
import StateAdmins from '@/pages/state-admins';
import HubAdmins from '@/pages/hub-admins';
import Bikers from '@/pages/bikers';
import StateConfiguration from '@/pages/state-configuration';
import VehicleConfiguration from '@/pages/vehicle-configuration';
import BackgroundVerification from '@/pages/background-verification';
import DeliveryImports from '@/pages/delivery-imports';
import WhatsAppNotifications from '@/pages/whatsapp-notifications';

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
      <Route path="/reset-password" component={ResetPasswordRequest} />
      <Route path="/reset-password/:id/:token" component={ResetPasswordConfirm} />
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
            <Route path="/qrcode" component={MobileAppQrCode} />
            <Route path="/iot-operations" component={IotOperations} />
            <Route path="/hub-configuration" component={HubConfiguration} />
            <Route path="/super-admins" component={SuperAdmins} />
            <Route path="/state-admins" component={StateAdmins} />
            <Route path="/hub-admins" component={HubAdmins} />
            <Route path="/bikers" component={Bikers} />
            <Route path="/state-configuration" component={StateConfiguration} />
            <Route path="/vehicle-configuration" component={VehicleConfiguration} />
            <Route path="/background-verification" component={BackgroundVerification} />
            <Route path="/delivery-imports" component={DeliveryImports} />
            <Route path="/whatsapp-notifications" component={WhatsAppNotifications} />
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
