import { useGetPublicTrack, getGetPublicTrackQueryKey } from '@workspace/api-client-react';
import { Loader2, MapPin, Navigation, Clock, ShieldCheck } from 'lucide-react';
import { formatDistance, formatDuration } from '@/lib/utils';
import { Card } from '@/components/ui/card';

export default function PublicTrack({ params }: { params: { token: string } }) {
  const { data: track, isLoading, isError } = useGetPublicTrack(params.token, {
    query: { refetchInterval: 5000, retry: false, queryKey: getGetPublicTrackQueryKey(params.token) }
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl flex flex-col items-center w-full max-w-sm text-center">
          <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
          <h2 className="text-xl font-bold text-slate-900">Locating Agent...</h2>
          <p className="text-slate-500 mt-2 text-sm">Connecting to secure tracking server.</p>
        </div>
      </div>
    );
  }

  if (isError || !track) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl flex flex-col items-center w-full max-w-sm text-center">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4">
            <MapPin className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Link Expired</h2>
          <p className="text-slate-500 mt-2 text-sm">This tracking link is no longer active. If you are expecting a service visit, please contact support.</p>
        </div>
      </div>
    );
  }

  const isArrived = track.status === 'REACHED' || track.status === 'COMPLETED';

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      {/* Top Banner */}
      <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shadow-md z-10 relative">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <span className="font-semibold tracking-wide">SecureTrack™</span>
        </div>
        <div className="text-xs text-slate-400">Live Update</div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col md:flex-row relative">
        {/* Map Background (Placeholder) */}
        <div className="absolute inset-0 z-0 bg-slate-200 overflow-hidden">
          {/* Simulated map grid */}
          <div className="w-full h-full opacity-20" style={{ backgroundImage: 'radial-gradient(#94a3b8 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-white/80 backdrop-blur px-4 py-2 rounded-full text-sm font-medium text-slate-600 shadow-sm">
              Map Visualization Loading...
            </div>
          </div>
        </div>

        {/* Floating Info Panel */}
        <div className="relative z-10 w-full md:w-96 md:h-full md:p-6 flex flex-col justify-end md:justify-start mt-auto md:mt-0">
          <Card className="rounded-t-3xl md:rounded-2xl shadow-2xl border-0 overflow-hidden bg-white/95 backdrop-blur-xl">
            {/* Status Header */}
            <div className={`p-6 text-white ${isArrived ? 'bg-emerald-600' : 'bg-blue-600'}`}>
              <h1 className="text-2xl font-bold mb-1">
                {isArrived ? 'Agent Arrived' : 'Agent En Route'}
              </h1>
              <p className="text-white/80 text-sm">
                {track.agentFirstName} is assigned to your request.
              </p>
            </div>

            {/* Metrics */}
            {!isArrived && (
              <div className="p-6 grid grid-cols-2 gap-4 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                    <Clock className="w-4 h-4" />
                    <span className="text-xs font-medium uppercase tracking-wider">Est. Arrival</span>
                  </div>
                  <div className="text-2xl font-bold text-slate-900">
                    {formatDuration(track.etaSeconds)}
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                    <Navigation className="w-4 h-4" />
                    <span className="text-xs font-medium uppercase tracking-wider">Distance</span>
                  </div>
                  <div className="text-2xl font-bold text-slate-900">
                    {formatDistance(track.distanceMeters)}
                  </div>
                </div>
              </div>
            )}

            <div className="p-6 bg-slate-50 text-center">
              <p className="text-xs text-slate-500">
                For your security, this tracking link will expire automatically upon completion of the visit.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
