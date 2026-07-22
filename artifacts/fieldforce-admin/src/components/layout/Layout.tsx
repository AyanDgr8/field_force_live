import { useEffect } from 'react';
import { useLocation, Link } from 'wouter';
import { useGetMe, useLogout } from '@workspace/api-client-react';
import { Loader2, Map, Users, AlertTriangle, Settings, LogOut, Activity, CalendarDays, Cpu, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export default function Layout({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const { data: user, isLoading, isError } = useGetMe();
  const logoutMutation = useLogout();

  useEffect(() => {
    if (isError) {
      setLocation('/login');
    }
  }, [isError, setLocation]);

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
      {/* Sidebar */}
      <aside className="w-64 bg-sidebar border-r border-sidebar-border flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-accent rounded-md flex items-center justify-center">
              <Activity className="w-5 h-5 text-accent-foreground" />
            </div>
            <span className="font-bold text-sidebar-foreground tracking-tight">FieldForce Live</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-1 px-3">
          <p className="px-3 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40 mb-1 mt-1">Operations</p>
          <NavItem href="/" icon={<Map className="w-5 h-5" />} label="Live Map" />
          <NavItem href="/users" icon={<Users className="w-5 h-5" />} label="Fleet & Users" />
          <NavItem href="/attendance" icon={<CalendarDays className="w-5 h-5" />} label="Attendance" />
          <NavItem href="/alerts" icon={<AlertTriangle className="w-5 h-5" />} label="Alerts" />

          <p className="px-3 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40 mb-1 mt-3">GPS Devices</p>
          <NavItem href="/devices" icon={<Cpu className="w-5 h-5" />} label="Tracked Devices" />
          <NavItem href="/vendor-accounts" icon={<Link2 className="w-5 h-5" />} label="Vendor Accounts" />
        </div>

        <div className="p-4 border-t border-sidebar-border space-y-2">
          <div className="px-3 mb-2 flex flex-col">
            <span className="text-sm font-medium text-sidebar-foreground truncate">{user.firstName} {user.lastName}</span>
            <span className="text-xs text-sidebar-foreground/60 truncate">{user.customerName}</span>
          </div>
          <NavItem href="/settings" icon={<Settings className="w-5 h-5" />} label="Settings" />
          <Button
            variant="ghost"
            className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={() => {
              logoutMutation.mutate(undefined, {
                onSuccess: () => setLocation('/login')
              });
            }}
          >
            <LogOut className="w-5 h-5 mr-3" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <div className="flex-1 overflow-y-auto bg-background p-6">
          <div className="max-w-7xl mx-auto h-full">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

function NavItem({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  const [location] = useLocation();
  const isActive = location === href || (href !== '/' && location.startsWith(href));

  return (
    <Link href={href} className={cn(
      "flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm font-medium",
      isActive
        ? "bg-sidebar-primary text-sidebar-primary-foreground"
        : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
    )}>
      {icon}
      {label}
    </Link>
  );
}
