import { useEffect, useState } from 'react';
import { useLocation, Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useGetMe, useLogout } from '@workspace/api-client-react';
import { Loader2, Map, Users, AlertTriangle, Settings, LogOut, Activity, CalendarDays, Cpu, Link2, QrCode, RadioTower, Warehouse, Crown, MapPinned, UserCog, Bike, FileCheck2, PackageCheck, ChevronDown, MessageCircle, Smartphone, ArrowLeft, PanelLeftOpen, Car } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ToastAction } from '@/components/ui/toast';
import { useToast } from '@/hooks/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

type ActiveEmergencyAlert = {
  id: number;
  userId: number;
  firstName: string;
  lastName: string;
  employeeCode: string;
  message: string;
  direction: 'USER_TO_ADMIN' | 'ADMIN_TO_USER';
  triggeredAt: string;
};

async function fetchActiveAlerts(): Promise<ActiveEmergencyAlert[]> {
  const response = await fetch(`${BASE}/api/live/alerts`, { credentials: 'include', cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { data: user, isLoading, isError } = useGetMe();
  const logoutMutation = useLogout();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const configurationRoutes = ['/hub-configuration', '/vehicle-configuration', '/background-verification', '/iot-operations'];
  const configurationActive = configurationRoutes.some(route => location.startsWith(route));
  const [configurationOpen, setConfigurationOpen] = useState(configurationActive);
  const mobileAppRoutes = ['/qrcode', '/mobile-configuration'];
  const mobileAppActive = mobileAppRoutes.some(route => location.startsWith(route));
  const [mobileAppOpen, setMobileAppOpen] = useState(mobileAppActive);
  const fleetRoutes = ['/bikers', '/vehicles', '/users'];
  const fleetActive = fleetRoutes.some(route => location.startsWith(route));
  const [fleetOpen, setFleetOpen] = useState(fleetActive);
  const adminConfigurationRoutes = ['/super-admins', '/state-admins', '/hub-admins'];
  const adminConfigurationActive = adminConfigurationRoutes.some(route => location.startsWith(route));
  const [adminConfigurationOpen, setAdminConfigurationOpen] = useState(adminConfigurationActive);

  useEffect(() => {
    if (isError) {
      setLocation('/login');
    }
  }, [isError, setLocation]);

  useEffect(() => {
    if (configurationActive) setConfigurationOpen(true);
  }, [configurationActive]);

  useEffect(() => {
    if (mobileAppActive) setMobileAppOpen(true);
  }, [mobileAppActive]);

  useEffect(() => {
    if (fleetActive) setFleetOpen(true);
  }, [fleetActive]);

  useEffect(() => {
    if (adminConfigurationActive) setAdminConfigurationOpen(true);
  }, [adminConfigurationActive]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <EmergencyAlertNotifier adminId={user.id} />
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 z-10 bg-slate-950/45 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      {/* Sidebar */}
      <aside className={cn(
        "absolute inset-y-0 left-0 w-64 shrink-0 bg-sidebar bg-[radial-gradient(circle_at_20%_0%,rgba(99,102,241,.20),transparent_34%),linear-gradient(180deg,rgba(255,255,255,.025),transparent_45%)] border-r border-sidebar-border flex flex-col shadow-2xl shadow-indigo-950/20 z-20 transition-transform duration-200 md:relative",
        sidebarOpen ? "translate-x-0" : "-translate-x-full md:hidden",
      )}>
        <div className="h-[72px] flex items-center justify-between gap-2 px-4 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-gradient-to-br from-amber-300 to-orange-500 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/20 ring-1 ring-white/20">
              <Activity className="w-5 h-5 text-accent-foreground" />
            </div>
            <div>
              <span className="block font-bold text-sidebar-foreground tracking-tight">FieldForce Live</span>
              <span className="block text-[9px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/40">Command center</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
            title="Close sidebar"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-sidebar-border text-sidebar-foreground/70 transition hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-1 px-3">
          <p className="px-3 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40 mb-1 mt-1">Operations</p>
          <NavItem href="/" icon={<Map className="w-5 h-5" />} label="Live Map" />
          <button
            type="button"
            onClick={() => setFleetOpen(open => !open)}
            aria-expanded={fleetOpen}
            aria-controls="fleet-navigation"
            className={cn(
              "group flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-all duration-150",
              fleetActive
                ? "border-indigo-300/40 bg-sidebar-primary text-sidebar-primary-foreground shadow-lg shadow-indigo-950/25"
                : "border-transparent text-sidebar-foreground/70 hover:border-sidebar-border hover:bg-sidebar-accent hover:text-sidebar-foreground",
            )}
          >
            <Users className="h-5 w-5 shrink-0" />
            <span className="flex-1">Fleet</span>
            <ChevronDown className={cn("h-4 w-4 transition-transform", fleetOpen && "rotate-180")} />
          </button>
          {fleetOpen && (
            <div id="fleet-navigation" className="ml-4 flex flex-col gap-1 border-l border-sidebar-border pl-2">
              <NavItem href="/bikers" icon={<Bike className="w-4 h-4" />} label="Bikers" />
              <NavItem href="/vehicles" icon={<Car className="w-4 h-4" />} label="Vehicles" />
              <NavItem href="/users" icon={<Users className="w-4 h-4" />} label="Users" />
            </div>
          )}
          {['SUPER_ADMIN', 'STATE_ADMIN'].includes(user.role) && (
            <>
              <button
                type="button"
                onClick={() => setAdminConfigurationOpen(open => !open)}
                aria-expanded={adminConfigurationOpen}
                aria-controls="admin-configuration-navigation"
                className={cn(
                  "group flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-all duration-150",
                  adminConfigurationActive
                    ? "border-indigo-300/40 bg-sidebar-primary text-sidebar-primary-foreground shadow-lg shadow-indigo-950/25"
                    : "border-transparent text-sidebar-foreground/70 hover:border-sidebar-border hover:bg-sidebar-accent hover:text-sidebar-foreground",
                )}
              >
                <UserCog className="h-5 w-5 shrink-0" />
                <span className="flex-1">Admin Configuration</span>
                <ChevronDown className={cn("h-4 w-4 transition-transform", adminConfigurationOpen && "rotate-180")} />
              </button>
              {adminConfigurationOpen && (
                <div id="admin-configuration-navigation" className="ml-4 flex flex-col gap-1 border-l border-sidebar-border pl-2">
                  {user.role === 'SUPER_ADMIN' && <NavItem href="/super-admins" icon={<Crown className="w-4 h-4" />} label="Super Admins" />}
                  {user.role === 'SUPER_ADMIN' && <NavItem href="/state-admins" icon={<MapPinned className="w-4 h-4" />} label="State Admins" />}
                  <NavItem href="/hub-admins" icon={<UserCog className="w-4 h-4" />} label="Hub Admins" />
                </div>
              )}
            </>
          )}
          <NavItem href="/attendance" icon={<CalendarDays className="w-5 h-5" />} label="Attendance" />
          <NavItem href="/alerts" icon={<AlertTriangle className="w-5 h-5" />} label="Mobile Alerts" />
          <button
            type="button"
            onClick={() => setMobileAppOpen(open => !open)}
            aria-expanded={mobileAppOpen}
            aria-controls="mobile-app-navigation"
            className={cn(
              "group flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-all duration-150",
              mobileAppActive
                ? "border-indigo-300/40 bg-sidebar-primary text-sidebar-primary-foreground shadow-lg shadow-indigo-950/25"
                : "border-transparent text-sidebar-foreground/70 hover:border-sidebar-border hover:bg-sidebar-accent hover:text-sidebar-foreground",
            )}
          >
            <Smartphone className="h-5 w-5 shrink-0" />
            <span className="flex-1">Mobile App</span>
            <ChevronDown className={cn("h-4 w-4 transition-transform", mobileAppOpen && "rotate-180")} />
          </button>
          {mobileAppOpen && (
            <div id="mobile-app-navigation" className="ml-4 flex flex-col gap-1 border-l border-sidebar-border pl-2">
              <NavItem href="/qrcode" icon={<QrCode className="w-4 h-4" />} label="Mobile App QR" />
              <NavItem href="/mobile-configuration" icon={<Smartphone className="w-4 h-4" />} label="Mobile App Config" />
            </div>
          )}
          <button
            type="button"
            onClick={() => setConfigurationOpen(open => !open)}
            aria-expanded={configurationOpen}
            aria-controls="configuration-navigation"
            className={cn(
              "group flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-all duration-150",
              configurationActive
                ? "border-indigo-300/40 bg-sidebar-primary text-sidebar-primary-foreground shadow-lg shadow-indigo-950/25"
                : "border-transparent text-sidebar-foreground/70 hover:border-sidebar-border hover:bg-sidebar-accent hover:text-sidebar-foreground",
            )}
          >
            <Settings className="h-5 w-5 shrink-0" />
            <span className="flex-1">Configuration</span>
            <ChevronDown className={cn("h-4 w-4 transition-transform", configurationOpen && "rotate-180")} />
          </button>
          {configurationOpen && (
            <div id="configuration-navigation" className="ml-4 flex flex-col gap-1 border-l border-sidebar-border pl-2">
              <NavItem href="/hub-configuration" icon={<Warehouse className="w-4 h-4" />} label="Hub Configuration" />
              <NavItem href="/vehicle-configuration" icon={<Bike className="w-4 h-4" />} label="Vehicle Configuration" />
              <NavItem href="/background-verification" icon={<FileCheck2 className="w-4 h-4" />} label="Background Verification" />
              <NavItem href="/iot-operations" icon={<RadioTower className="w-4 h-4" />} label="IoT Operations" />
            </div>
          )}
          {user.role === 'SUPER_ADMIN' && <NavItem href="/state-configuration" icon={<MapPinned className="w-5 h-5" />} label="State Configuration" />}
          <NavItem href="/delivery-imports" icon={<PackageCheck className="w-5 h-5" />} label="Delivery Imports" />

          <p className="px-3 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40 mb-1 mt-3">GPS Devices</p>
          <NavItem href="/devices" icon={<Cpu className="w-5 h-5" />} label="Tracked Devices" />
          <NavItem href="/vendor-accounts" icon={<Link2 className="w-5 h-5" />} label="Vendor Accounts" />

          {user.role === 'SUPER_ADMIN' && (
            <>
              <p className="px-3 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40 mb-1 mt-3">Notifications</p>
              <NavItem href="/whatsapp-notifications" icon={<MessageCircle className="w-5 h-5" />} label="WhatsApp Setup" />
            </>
          )}
        </div>

      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-[72px] shrink-0 border-b border-white/70 bg-white/78 shadow-sm shadow-indigo-950/5 backdrop-blur-2xl flex items-center justify-between px-6 z-10">
          <div className="flex items-center gap-3">
            {!sidebarOpen && (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open sidebar"
                title="Open sidebar"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border bg-background/70 text-foreground shadow-sm transition hover:bg-card focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/15"
              >
                <PanelLeftOpen className="h-5 w-5" />
              </button>
            )}
            <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Operations workspace</p>
            <p className="text-sm font-semibold text-foreground mt-0.5">Live field intelligence</p>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-3 rounded-xl border border-border bg-background/70 px-3 py-2 text-left shadow-sm outline-none transition hover:border-foreground/45 hover:bg-card focus-visible:ring-4 focus-visible:ring-ring/15 data-[state=open]:border-foreground/45 data-[state=open]:bg-card"
              >
                <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                  {user.firstName?.[0]}{user.lastName?.[0]}
                </div>
                <div className="leading-tight">
                  <p className="text-sm font-semibold">{user.firstName} {user.lastName}</p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{user.role.replaceAll('_', ' ')}</p>
                </div>
                <span className="ml-1 h-2 w-2 rounded-full bg-emerald-500 ring-4 ring-emerald-500/10" title="Connected" />
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform data-[state=open]:rotate-180" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={8} className="w-64 rounded-xl border-popover-border p-2 shadow-xl">
              <DropdownMenuLabel className="px-3 py-2">
                <span className="block text-sm font-semibold">{user.firstName} {user.lastName}</span>
                <span className="mt-1 block text-xs font-normal text-muted-foreground">{user.customerName}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="cursor-pointer rounded-lg px-3 py-2.5">
                <Link href="/settings">
                  <Settings className="h-4 w-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer rounded-lg px-3 py-2.5 text-destructive focus:bg-destructive/10 focus:text-destructive"
                disabled={logoutMutation.isPending}
                onSelect={() => {
                  logoutMutation.mutate(undefined, {
                    onSuccess: () => setLocation('/login'),
                  });
                }}
              >
                <LogOut className="h-4 w-4" />
                {logoutMutation.isPending ? 'Signing out…' : 'Sign Out'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <div className="flex-1 overflow-y-auto p-6 lg:p-8">
          <div className="max-w-[1440px] mx-auto min-h-full">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

function EmergencyAlertNotifier({ adminId }: { adminId: number }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: alerts = [] } = useQuery({
    queryKey: ['dashboard-active-emergency-alerts'],
    queryFn: fetchActiveAlerts,
    refetchInterval: 3_000,
    staleTime: 0,
  });

  useEffect(() => {
    if (alerts.length === 0) return;
    const storageKey = `fieldforce-notified-alerts-${adminId}`;
    let seen = new Set<number>();
    try {
      const stored = JSON.parse(window.sessionStorage.getItem(storageKey) ?? '[]');
      if (Array.isArray(stored)) seen = new Set(stored.filter(Number.isInteger));
    } catch {
      // A malformed browser value should never suppress a real emergency.
    }
    const unseen = alerts.filter(alert => !seen.has(alert.id));
    if (unseen.length === 0) return;

    unseen.forEach(alert => seen.add(alert.id));
    window.sessionStorage.setItem(storageKey, JSON.stringify([...seen].slice(-200)));
    const latest = unseen[0];
    toast({
      variant: 'destructive',
      duration: 15_000,
      title: unseen.length > 1 ? `${unseen.length} new emergency alerts` : 'Emergency alert',
      description: `${latest.firstName} ${latest.lastName} (${latest.employeeCode}): ${latest.message}`,
      action: (
        <ToastAction altText="View emergency alerts" onClick={() => setLocation('/alerts')}>
          View alerts
        </ToastAction>
      ),
    });
  }, [adminId, alerts, setLocation, toast]);

  return null;
}

function NavItem({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  const [location] = useLocation();
  const isActive = location === href || (href !== '/' && location.startsWith(href));

  return (
    <Link href={href} className={cn(
      "group flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 text-sm font-medium border",
      isActive
        ? "bg-sidebar-primary text-sidebar-primary-foreground border-indigo-300/40 shadow-lg shadow-indigo-950/25"
        : "text-sidebar-foreground/70 border-transparent hover:bg-sidebar-accent hover:text-sidebar-foreground hover:border-sidebar-border hover:translate-x-0.5"
    )}>
      {icon}
      {label}
    </Link>
  );
}
