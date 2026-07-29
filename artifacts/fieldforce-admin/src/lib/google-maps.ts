import { useJsApiLoader } from '@react-google-maps/api';

/**
 * Single place where the Google Maps JS API is configured.
 * Every map in the admin must load through this hook: the loader keys off the
 * script id, so two different ids would inject the API twice.
 */
export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

export const GOOGLE_MAPS_SCRIPT_ID = 'fieldforce-google-map';

export function useGoogleMaps() {
  return useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY ?? '',
    id: GOOGLE_MAPS_SCRIPT_ID,
  });
}
