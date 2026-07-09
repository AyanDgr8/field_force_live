import React from 'react';
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  MapPin, Navigation, Clock, Activity, AlertTriangle, 
  Search, Nfc, Calendar, Building, User, ChevronDown, 
  X, Home
} from "lucide-react";

const employees = [
  { id: 'EMP-014', name: 'Priya Patel', code: 'EMP-014', status: 'stationary', locationName: 'Site Office (Okhla)', lastSeen: 'Just now' },
  { id: 'EMP-021', name: 'Arjun Sharma', code: 'EMP-021', status: 'moving', locationName: 'Near Connaught Place', lastSeen: 'Just now' },
  { id: 'EMP-088', name: 'Vikram Malhotra', code: 'EMP-088', status: 'moving', locationName: 'NH-48 Highway', lastSeen: '1m ago' },
  { id: 'EMP-045', name: 'Neha Reddy', code: 'EMP-045', status: 'alert', locationName: 'Unknown (Signal Lost)', lastSeen: '5m ago' },
  { id: 'EMP-102', name: 'Rahul Verma', code: 'EMP-102', status: 'offline', locationName: 'Sector 62, Noida', lastSeen: '2h ago' },
  { id: 'EMP-119', name: 'Sneha Gupta', code: 'EMP-119', status: 'moving', locationName: 'Cyber City, Gurugram', lastSeen: 'Just now' },
  { id: 'EMP-076', name: 'Amit Singh', code: 'EMP-076', status: 'stationary', locationName: 'Warehouse B', lastSeen: '12m ago' },
  { id: 'EMP-092', name: 'Manish Tiwari', code: 'EMP-092', status: 'offline', locationName: 'Home', lastSeen: '5h ago' },
  { id: 'EMP-034', name: 'Kavita Desai', code: 'EMP-034', status: 'moving', locationName: 'Ring Road, Delhi', lastSeen: 'Just now' },
];

const visits = [
  { id: 'V1', customer: 'ACME-014', address: 'Okhla Phase 1', priority: 'P2', status: 'Completed' },
  { id: 'V2', customer: 'GLBL-092', address: 'Nehru Place', priority: 'P1', status: 'Completed' },
  { id: 'V3', customer: 'TECH-115', address: 'Okhla Phase 2', priority: 'P2', status: 'Completed' },
  { id: 'V4', customer: 'ACME-088', address: 'Site Office (Okhla)', priority: 'P3', status: 'Completed' },
  { id: 'V5', customer: 'BLD-041', address: 'Jasola Vihar', priority: 'P1', status: 'En route' },
  { id: 'V6', customer: 'TECH-204', address: 'Lajpat Nagar', priority: 'P2', status: 'Pending' },
  { id: 'V7', customer: 'GLBL-133', address: 'South Ext.', priority: 'P3', status: 'Pending' },
  { id: 'V8', customer: 'ACME-019', address: 'Saket District', priority: 'P2', status: 'Pending' },
];

const mapMarkers = [
  { id: 'c1', isCluster: true, count: 12, top: '30%', left: '40%' },
  { id: 'c2', isCluster: true, count: 8, top: '65%', left: '75%' },
  { id: 'c3', isCluster: true, count: 5, top: '20%', left: '80%' },
  { id: 'm1', initials: 'PP', label: 'Priya Patel', status: 'stationary', top: '50%', left: '60%' },
  { id: 'm2', initials: 'AS', label: 'Arjun Sharma', status: 'moving', top: '45%', left: '55%' },
  { id: 'm3', initials: 'VM', label: 'Vikram Malhotra', status: 'moving', top: '70%', left: '30%' },
  { id: 'm4', initials: 'NR', label: 'Neha Reddy', status: 'alert', top: '25%', left: '50%' },
  { id: 'm5', initials: 'RV', label: 'Rahul Verma', status: 'offline', top: '80%', left: '85%' },
  { id: 'm6', initials: 'SG', label: 'Sneha Gupta', status: 'moving', top: '35%', left: '65%' },
  { id: 'm7', initials: 'AS', label: 'Amit Singh', status: 'stationary', top: '60%', left: '45%' },
  { id: 'm8', initials: 'MT', label: 'Manish Tiwari', status: 'offline', top: '15%', left: '25%' },
  { id: 'm9', initials: 'KD', label: 'Kavita Desai', status: 'moving', top: '55%', left: '35%' },
  { id: 'm10', initials: 'RK', label: 'Ravi Kumar', status: 'moving', top: '40%', left: '85%' },
  { id: 'm11', initials: 'SJ', label: 'Sanjay Joshi', status: 'moving', top: '85%', left: '55%' },
  { id: 'm12', initials: 'AP', label: 'Anita Prasad', status: 'stationary', top: '30%', left: '20%' },
];

const TopBar = () => (
  <header className="h-14 border-b border-border bg-card/90 backdrop-blur-sm flex items-center px-4 justify-between shrink-0 z-20">
    <div className="flex items-center gap-6">
      <div className="flex items-center gap-2 text-primary font-bold text-lg tracking-tight">
        <div className="w-8 h-8 bg-primary/20 rounded-md flex items-center justify-center border border-primary/30">
          <Nfc className="w-5 h-5 text-primary" />
        </div>
        <span>FieldForce Live</span>
      </div>
      
      <div className="h-5 w-px bg-border" />
      
      <div className="flex items-center gap-5 text-sm">
        <div className="flex items-center gap-2 group cursor-pointer">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] group-hover:scale-125 transition-transform" />
          <span className="font-medium text-foreground">124 Moving</span>
        </div>
        <div className="flex items-center gap-2 group cursor-pointer">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)] group-hover:scale-125 transition-transform" />
          <span className="font-medium text-muted-foreground">42 Stationary</span>
        </div>
        <div className="flex items-center gap-2 group cursor-pointer">
          <div className="w-2.5 h-2.5 rounded-full bg-slate-500 group-hover:scale-125 transition-transform" />
          <span className="font-medium text-muted-foreground">18 Offline</span>
        </div>
        <div className="flex items-center gap-2 group cursor-pointer">
          <div className="w-2.5 h-2.5 rounded-full bg-destructive shadow-[0_0_8px_rgba(225,29,72,0.8)] group-hover:scale-125 transition-transform animate-pulse" />
          <span className="font-medium text-destructive">2 Alerts</span>
        </div>
      </div>
    </div>

    <div className="flex items-center gap-3">
      <Button variant="outline" size="sm" className="h-8 border-border bg-background/50 hover:bg-muted text-foreground">
        <Calendar className="w-4 h-4 mr-2 text-muted-foreground" />
        Today
      </Button>
      <Button variant="outline" size="sm" className="h-8 border-border bg-background/50 hover:bg-muted text-foreground">
        <Building className="w-4 h-4 mr-2 text-muted-foreground" />
        Acme Logistics NCR
        <ChevronDown className="w-3 h-3 ml-2 opacity-50" />
      </Button>
      <div className="h-5 w-px bg-border mx-1" />
      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full bg-muted border border-border hover:bg-primary/20 hover:text-primary transition-colors text-foreground">
        <User className="w-4 h-4" />
      </Button>
    </div>
  </header>
);

const LeftSidebar = () => {
  const getStatusIndicator = (status: string) => {
    switch(status) {
      case 'moving': return <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />;
      case 'stationary': return <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)]" />;
      case 'offline': return <div className="w-2 h-2 rounded-full bg-slate-500" />;
      case 'alert': return <div className="w-2 h-2 rounded-full bg-destructive shadow-[0_0_8px_rgba(225,29,72,0.8)] animate-pulse" />;
      default: return null;
    }
  }

  return (
    <aside className="w-80 border-r border-border bg-card/80 backdrop-blur-md flex flex-col z-10 shrink-0">
      <div className="p-4 border-b border-border space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
          <Input placeholder="Search employee, ID, or zone..." className="pl-9 bg-background/80 border-border h-9 text-sm focus-visible:ring-primary" />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          <Badge variant="secondary" className="bg-primary/20 text-primary hover:bg-primary/30 border-transparent cursor-pointer whitespace-nowrap">All (186)</Badge>
          <Badge variant="outline" className="cursor-pointer border-border hover:bg-muted whitespace-nowrap text-muted-foreground">Moving (124)</Badge>
          <Badge variant="outline" className="cursor-pointer border-border hover:bg-muted whitespace-nowrap text-muted-foreground">Station (42)</Badge>
          <Badge variant="outline" className="cursor-pointer border-destructive/50 text-destructive bg-destructive/10 whitespace-nowrap">Alerts (2)</Badge>
        </div>
      </div>
      
      <div className="px-4 py-2 flex items-center justify-between text-xs font-medium text-muted-foreground border-b border-border bg-muted/20">
        <span>EMPLOYEE</span>
        <span>STATUS</span>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col">
          {employees.map(emp => (
            <div key={emp.id} className={`p-3 border-b border-border/40 hover:bg-muted/40 cursor-pointer transition-colors ${emp.id === 'EMP-014' ? 'bg-primary/10 border-l-2 border-l-primary' : 'border-l-2 border-l-transparent'}`}>
                <div className="flex items-start justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className={`font-semibold text-sm ${emp.id === 'EMP-014' ? 'text-primary' : 'text-foreground'}`}>{emp.name}</span>
                    <span className="text-[10px] text-muted-foreground font-mono bg-background border border-border px-1 rounded">{emp.code}</span>
                  </div>
                  {getStatusIndicator(emp.status)}
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="truncate pr-2">{emp.locationName}</span>
                  <span className="shrink-0">{emp.lastSeen}</span>
                </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </aside>
  );
};

const RightDrawer = () => (
  <div className="absolute top-4 right-4 bottom-4 w-[420px] rounded-xl border border-border bg-card/90 backdrop-blur-xl flex flex-col z-20 shadow-[0_8px_32px_rgba(0,0,0,0.4)] overflow-hidden">
    {/* Header */}
    <div className="p-4 border-b border-border flex items-start justify-between bg-muted/20">
      <div className="flex items-center gap-3">
         <Avatar className="w-12 h-12 border-2 border-border">
            <AvatarFallback className="bg-primary/20 text-primary font-bold text-lg">PP</AvatarFallback>
         </Avatar>
         <div>
           <h2 className="font-bold text-lg leading-tight text-foreground">Priya Patel</h2>
           <div className="flex items-center gap-2 text-sm text-muted-foreground font-mono mt-1">
             <Badge variant="outline" className="h-5 px-1.5 text-[10px] bg-background text-foreground">EMP-014</Badge>
             <span className="w-1 h-1 rounded-full bg-border" />
             <span>North Zone</span>
           </div>
         </div>
      </div>
      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
        <X className="w-4 h-4" />
      </Button>
    </div>

    <ScrollArea className="flex-1">
      <div className="p-5 space-y-6">
       
       {/* Telemetry Grid */}
       <div className="grid grid-cols-2 gap-4">
         <Card className="p-3 bg-background/50 border-border border shadow-none flex flex-col justify-between">
           <div className="text-xs text-muted-foreground mb-2 flex items-center justify-between">
             Current Speed
             <Activity className="w-3.5 h-3.5 text-amber-500" />
           </div>
           <div>
             <div className="flex items-baseline gap-1">
               <span className="text-3xl font-bold font-mono tracking-tighter text-foreground">0</span>
               <span className="text-xs text-muted-foreground font-medium">km/h</span>
             </div>
             <div className="mt-3 h-6 flex items-end gap-[2px] opacity-60">
                {[4, 6, 12, 18, 24, 20, 15, 8, 2, 0, 0, 0, 0, 0, 0].map((v, i) => (
                  <div key={i} className="flex-1 bg-primary rounded-t-[1px]" style={{ height: `${Math.max((v/30)*100, 5)}%` }} />
                ))}
             </div>
           </div>
         </Card>
         <Card className="p-3 bg-background/50 border-border border shadow-none flex flex-col justify-between">
           <div className="text-xs text-muted-foreground mb-2 flex items-center justify-between">
             Next Stop ETA
             <Navigation className="w-3.5 h-3.5 text-primary" />
           </div>
           <div>
             <div className="flex items-baseline gap-1">
               <span className="text-3xl font-bold font-mono tracking-tighter text-foreground">14</span>
               <span className="text-xs text-muted-foreground font-medium">min</span>
             </div>
             <div className="mt-3 text-xs font-medium text-primary bg-primary/10 w-fit px-2 py-0.5 rounded border border-primary/20">
                3.2 km away
             </div>
           </div>
         </Card>
       </div>

       {/* Status Section */}
       <div className="space-y-3">
         <div className="flex items-center justify-between">
           <h3 className="text-sm font-semibold text-foreground tracking-tight">Current Status</h3>
           <Badge variant="outline" className="border-amber-500/30 text-amber-500 bg-amber-500/10 hover:bg-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.1)]">Stationary</Badge>
         </div>
         <Card className="p-3 border-border bg-background/50 flex flex-col gap-2 shadow-none relative overflow-hidden">
           <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500" />
           <div className="flex items-center gap-3 pl-2">
             <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
               <Clock className="w-4 h-4 text-amber-500" />
             </div>
             <div>
               <div className="text-sm font-medium text-foreground">At Site Office for 00:42</div>
               <div className="text-xs text-muted-foreground mt-0.5">Arrived at 10:14 AM</div>
             </div>
           </div>
         </Card>
       </div>

       {/* Proximity */}
       <div className="space-y-3">
         <h3 className="text-sm font-semibold text-foreground tracking-tight">Proximity (Marked Places)</h3>
         <div className="space-y-2">
           <div className="flex items-center justify-between p-2.5 rounded-lg bg-background/50 border border-primary/30 text-sm shadow-[0_0_10px_rgba(79,70,229,0.05)]">
             <div className="flex items-center gap-3">
               <div className="p-1.5 rounded-md bg-primary/20">
                 <MapPin className="w-4 h-4 text-primary" />
               </div>
               <span className="font-medium text-foreground">Site Office (Okhla)</span>
             </div>
             <span className="font-mono text-xs text-primary font-bold">0.0 km</span>
           </div>
           <div className="flex items-center justify-between p-2.5 rounded-lg bg-background/30 border border-border/50 text-sm">
             <div className="flex items-center gap-3">
               <div className="p-1.5 rounded-md bg-muted">
                 <Building className="w-4 h-4 text-muted-foreground" />
               </div>
               <span className="text-muted-foreground">Warehouse B</span>
             </div>
             <span className="font-mono text-xs text-muted-foreground">4.2 km</span>
           </div>
           <div className="flex items-center justify-between p-2.5 rounded-lg bg-background/30 border border-border/50 text-sm">
             <div className="flex items-center gap-3">
               <div className="p-1.5 rounded-md bg-muted">
                 <Home className="w-4 h-4 text-muted-foreground" />
               </div>
               <span className="text-muted-foreground">Home</span>
             </div>
             <span className="font-mono text-xs text-muted-foreground">12.5 km</span>
           </div>
         </div>
       </div>

       {/* Visit List */}
       <div className="space-y-3">
         <div className="flex items-center justify-between">
           <h3 className="text-sm font-semibold text-foreground tracking-tight">Today's Route Plan</h3>
           <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">4/8 DONE</span>
         </div>
         <div className="relative border-l-2 border-border ml-3 pl-5 space-y-5 py-2">
           {visits.map((visit) => (
             <div key={visit.id} className="relative group">
               {/* Timeline Dot */}
               <div className={`absolute -left-[27px] w-3 h-3 rounded-full border-2 top-1.5 transition-colors ${
                 visit.status === 'Completed' ? 'bg-primary border-primary' : 
                 visit.status === 'En route' ? 'bg-background border-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]' : 
                 'bg-background border-border group-hover:border-muted-foreground'
               }`} />
               
               {/* Content */}
               <div className={`flex items-start justify-between ${visit.status === 'Completed' ? 'opacity-60' : ''}`}>
                 <div>
                   <div className="flex items-center gap-2">
                     <span className="text-sm font-semibold text-foreground">{visit.customer}</span>
                     {visit.priority === 'P1' && <Badge variant="outline" className="h-4 px-1 text-[8px] uppercase border-destructive/50 text-destructive bg-destructive/10">Urgent</Badge>}
                   </div>
                   <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                     <MapPin className="w-3 h-3" />
                     {visit.address}
                   </div>
                 </div>
                 <div className="flex flex-col items-end gap-1.5">
                   {visit.status === 'Completed' && <span className="text-[10px] uppercase font-bold text-primary">Done</span>}
                   {visit.status === 'En route' && <span className="text-[10px] uppercase font-bold text-amber-500 animate-pulse">En Route</span>}
                   {visit.status === 'Pending' && <span className="text-[10px] uppercase font-bold text-muted-foreground">Pending</span>}
                 </div>
               </div>
             </div>
           ))}
         </div>
       </div>
      </div>
    </ScrollArea>

    <div className="p-4 border-t border-border bg-background">
      <Button className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-[0_0_20px_rgba(225,29,72,0.3)] border border-destructive/50">
        <AlertTriangle className="w-4 h-4 mr-2" />
        Trigger Emergency Protocol
      </Button>
    </div>
  </div>
);

const MapBackground = () => (
  <div className="absolute inset-0 bg-[#06080d] overflow-hidden">
    {/* Map Grid */}
    <svg width="100%" height="100%" className="absolute inset-0 z-0 opacity-10 pointer-events-none text-primary">
      <defs>
        <pattern id="grid" width="80" height="80" patternUnits="userSpaceOnUse">
          <path d="M 80 0 L 0 0 0 80" fill="none" stroke="currentColor" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />
      
      {/* Fake Roads */}
      <path d="M -100 200 Q 300 150 400 400 T 800 500 T 1200 300" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.4" />
      <path d="M 200 -100 L 250 800" fill="none" stroke="currentColor" strokeWidth="6" opacity="0.2" />
      <path d="M 400 400 L 600 800" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.3" />
      <path d="M 800 500 Q 900 700 1200 800" fill="none" stroke="currentColor" strokeWidth="4" opacity="0.25" />
      
      {/* Rivers/Water bodies */}
      <path d="M -50 600 Q 200 650 300 850" fill="none" stroke="#3b82f6" strokeWidth="12" opacity="0.1" />
    </svg>
    
    {/* Subtle Vignette */}
    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,#06080d_100%)] pointer-events-none z-0" />
  </div>
);

const MapMarkers = () => {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
      {/* Route line */}
      <div className="absolute" style={{ top: '45%', left: '60%', width: '150px', height: '100px' }}>
        <svg width="100%" height="100%" viewBox="0 0 150 100" className="overflow-visible">
          <path 
            d="M 0 50 L 30 20 L 70 80 L 130 0" 
            fill="none" 
            strokeWidth="3" 
            strokeDasharray="8 6"
            className="stroke-primary opacity-70 animate-[dash_20s_linear_infinite]"
          />
          <circle cx="130" cy="0" r="6" className="fill-primary animate-ping opacity-50" />
          <circle cx="130" cy="0" r="4" className="fill-primary" />
        </svg>
      </div>
      <style>{`
        @keyframes dash {
          to { stroke-dashoffset: -100; }
        }
      `}</style>

      {mapMarkers.map(m => (
        <div 
          key={m.id} 
          className="absolute transform -translate-x-1/2 -translate-y-1/2 pointer-events-auto cursor-pointer group"
          style={{ top: m.top, left: m.left }}
        >
          {m.isCluster ? (
             <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center backdrop-blur-sm border border-primary/30 hover:bg-primary/30 transition-colors">
               <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm shadow-[0_0_20px_rgba(79,70,229,0.6)]">
                 {m.count}
               </div>
             </div>
          ) : (
            <div className="flex flex-col items-center">
              <div className={`w-9 h-9 rounded-full border-2 border-background flex items-center justify-center text-[11px] font-bold text-white shadow-lg z-10 transition-transform duration-200 group-hover:scale-110 group-hover:-translate-y-1 ${
                m.status === 'moving' ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)]' :
                m.status === 'stationary' ? 'bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.5)]' :
                m.status === 'alert' ? 'bg-destructive shadow-[0_0_20px_rgba(225,29,72,0.8)] animate-pulse' :
                'bg-slate-500'
              } ${m.id === 'm1' ? 'ring-4 ring-primary/30 border-primary' : ''}`}>
                {m.initials}
              </div>
              <div className={`mt-1.5 px-2.5 py-1 rounded text-[10px] font-semibold tracking-wide bg-card/90 backdrop-blur-md border border-border text-foreground whitespace-nowrap shadow-xl transition-all duration-200 absolute top-full ${
                m.id === 'm1' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0'
              }`}>
                {m.label}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
};

export default function LiveMap() {
  return (
    <div 
      className="flex flex-col h-[100dvh] w-full overflow-hidden antialiased bg-background text-foreground"
      style={{
        '--background': '224 71% 4%',
        '--foreground': '213 31% 91%',
        '--card': '224 71% 6%',
        '--card-foreground': '213 31% 91%',
        '--popover': '224 71% 6%',
        '--popover-foreground': '213 31% 91%',
        '--primary': '235 86% 65%',
        '--primary-foreground': '210 40% 98%',
        '--secondary': '222.2 47.4% 11.2%',
        '--secondary-foreground': '210 40% 98%',
        '--muted': '223 47% 11%',
        '--muted-foreground': '215.4 16.3% 56.9%',
        '--accent': '223 47% 11%',
        '--accent-foreground': '210 40% 98%',
        '--destructive': '350 80% 55%',
        '--destructive-foreground': '210 40% 98%',
        '--border': '216 34% 17%',
        '--input': '216 34% 17%',
        '--ring': '235 86% 65%',
        '--radius': '0.5rem',
      } as React.CSSProperties}
    >
      <TopBar />
      <div className="flex flex-1 overflow-hidden relative">
        <LeftSidebar />
        <main className="flex-1 relative">
           <MapBackground />
           <MapMarkers />
           <RightDrawer />
        </main>
      </div>
    </div>
  );
}
