import { cn } from '@/lib/utils';

/**
 * The two views the admin maps offer.
 * "Satellite" is Google's hybrid type on purpose — plain satellite drops all
 * street names, which makes it useless for locating a rider or a hub.
 */
export type MapView = 'roadmap' | 'hybrid';

const VIEWS: ReadonlyArray<{ id: MapView; label: string }> = [
  { id: 'roadmap', label: 'Map' },
  { id: 'hybrid', label: 'Satellite' },
];

export function MapTypeToggle({
  value,
  onChange,
  className,
}: {
  value: MapView;
  onChange: (view: MapView) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'inline-flex rounded-md border bg-background/95 backdrop-blur-sm shadow-md overflow-hidden',
        className,
      )}
      role="group"
      aria-label="Map view"
    >
      {VIEWS.map(view => (
        <button
          key={view.id}
          type="button"
          onClick={() => onChange(view.id)}
          aria-pressed={value === view.id}
          className={cn(
            'px-3 py-1.5 text-xs font-medium transition-colors',
            value === view.id
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted',
          )}
        >
          {view.label}
        </button>
      ))}
    </div>
  );
}
