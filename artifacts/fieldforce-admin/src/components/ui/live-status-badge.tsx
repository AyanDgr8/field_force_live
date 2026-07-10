import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { LivePosition } from '@workspace/api-client-react';

export function LiveStatusBadge({ pos }: { pos: LivePosition }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (pos.liveStatus !== 'BUSY') return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [pos.liveStatus]);

  if (pos.emergencyActive) {
    return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive text-[10px] px-1.5 py-0 animate-pulse ring-2 ring-destructive/50 ring-offset-1">Emergency</Badge>;
  }

  if (pos.liveStatus === 'ON_SHIFT_IDLE') {
    return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] px-1.5 py-0">Idle</Badge>;
  }

  if (pos.liveStatus === 'BUSY') {
    let since = '';
    if (pos.liveStatusSince) {
      const diff = Math.max(0, Math.floor((now - new Date(pos.liveStatusSince).getTime()) / 1000));
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      since = h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` : `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return (
      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-[10px] px-1.5 py-0 flex items-center gap-1 whitespace-nowrap">
        Busy {since && <span className="font-mono">{since}</span>}
      </Badge>
    );
  }

  if (pos.status === 'MOVING') {
    return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] px-1.5 py-0">Moving</Badge>;
  }
  if (pos.status === 'STATIONARY') {
    return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] px-1.5 py-0">Stopped</Badge>;
  }
  return <Badge variant="outline" className="text-slate-500 text-[10px] px-1.5 py-0">Offline</Badge>;
}