import {
  AdvancedMarker,
  APIProvider,
  APILoadingStatus,
  Circle,
  InfoWindow,
  Map as GoogleMap,
  useAdvancedMarkerRef,
  useApiLoadingStatus,
  useMap,
} from '@vis.gl/react-google-maps';
import { useEffect, useState } from 'react';
import type { DvfTransaction, GeocodedAddress } from '../lib/dvf';
import { formatDateFr, formatEuros, formatPricePerSqm, formatSurface } from '../utils/format';

interface DvfMapProps {
  apiKey: string;
  center: GeocodedAddress | null;
  radiusMeters: number;
  transactions: DvfTransaction[];
  selectedId: string | null;
  onSelectTransaction: (tx: DvfTransaction) => void;
  onInspectTransaction: (tx: DvfTransaction) => void;
  loading: boolean;
}

type MapStyleMode = 'roadmap' | 'hybrid';

function PerimeterCircle({
  center,
  radiusMeters,
}: {
  center: { lat: number; lng: number };
  radiusMeters: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    const latDelta = radiusMeters / 111320;
    const lngDelta = radiusMeters / (111320 * Math.cos((center.lat * Math.PI) / 180));
    map.fitBounds(
      {
        north: center.lat + latDelta,
        south: center.lat - latDelta,
        east: center.lng + lngDelta,
        west: center.lng - lngDelta,
      },
      28
    );
  }, [map, center.lat, center.lng, radiusMeters]);

  return (
    <Circle
      center={center}
      radius={radiusMeters}
      strokeColor="#1D4ED8"
      strokeOpacity={0.85}
      strokeWeight={2}
      fillColor="#1D4ED8"
      fillOpacity={0.08}
      clickable={false}
    />
  );
}

function TransactionPin({
  tx,
  position,
  isSelected,
  isActiveInfo,
  onClick,
  onCloseInfo,
  onInspect,
}: {
  tx: DvfTransaction;
  position: { lat: number; lng: number };
  isSelected: boolean;
  isActiveInfo: boolean;
  onClick: () => void;
  onCloseInfo: () => void;
  onInspect: () => void;
}) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const isStudio = tx.rooms === 1;
  const bg = isStudio ? '#0F766E' : '#1D4ED8';

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={position}
        zIndex={isSelected || isActiveInfo ? 50 : 10}
        onClick={onClick}
        title={`${tx.address} — ${formatPricePerSqm(tx.pricePerSqm)}`}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: isSelected || isActiveInfo ? 20 : 14,
            height: isSelected || isActiveInfo ? 20 : 14,
            borderRadius: '9999px',
            backgroundColor: bg,
            border: isSelected || isActiveInfo ? '3px solid #0F172A' : '2px solid #FFFFFF',
            boxShadow: '0 2px 6px rgba(15, 23, 42, 0.35)',
            cursor: 'pointer',
            transition: 'transform 150ms ease',
            transform: isSelected || isActiveInfo ? 'scale(1.1)' : 'scale(1)',
          }}
        />
      </AdvancedMarker>

      {isActiveInfo && marker && (
        <InfoWindow anchor={marker} onCloseClick={onCloseInfo} maxWidth={270}>
          <div className="text-slate-900 font-sans p-0.5 space-y-1.5">
            <div className="font-semibold text-xs leading-snug">{tx.address}</div>
            <div className="text-[11px] text-slate-600 font-mono tabular-nums">
              {tx.roomLabel} · {formatSurface(tx.surfaceBati)} · {formatDateFr(tx.dateMutation)}
            </div>
            <div className="flex items-baseline justify-between gap-3 pt-1 border-t border-slate-100">
              <span className="font-bold text-sm font-mono tabular-nums text-slate-900">
                {formatEuros(tx.valeurFonciere)}
              </span>
              <span className="font-semibold text-xs font-mono tabular-nums text-[#1D4ED8]">
                {formatPricePerSqm(tx.pricePerSqm)}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 font-mono tabular-nums">
              À {tx.distanceMeters} m du point de référence
            </div>
            <button
              type="button"
              onClick={onInspect}
              className="w-full mt-1 py-1.5 px-2.5 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded transition-colors cursor-pointer"
            >
              Ouvrir la fiche technique (9 sources)
            </button>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

function MapStatusGuard({ onQuotaError }: { onQuotaError: () => void }) {
  const status = useApiLoadingStatus();

  useEffect(() => {
    if (status === APILoadingStatus.AUTH_FAILURE || status === APILoadingStatus.FAILED) {
      onQuotaError();
    }
  }, [status, onQuotaError]);

  return null;
}

export function DvfMap({
  apiKey,
  center,
  radiusMeters,
  transactions,
  selectedId,
  onSelectTransaction,
  onInspectTransaction,
  loading,
}: DvfMapProps) {
  const [mapType, setMapType] = useState<MapStyleMode>('roadmap');
  const [infoTxId, setInfoTxId] = useState<string | null>(null);
  const [mapAuthError, setMapAuthError] = useState(false);

  const centerCoords = center
    ? { lat: center.latitude, lng: center.longitude }
    : { lat: 48.833676, lng: 2.294779 };

  // Compute small deterministic offsets for apartments in the exact same building
  // Note: Use plain Record<string, number> instead of global Map constructor (avoiding JSX Map shadowing)
  const coordCounts: Record<string, number> = {};
  const positionedTxs = transactions.map((tx) => {
    const key = `${tx.latitude.toFixed(6)},${tx.longitude.toFixed(6)}`;
    const idx = coordCounts[key] ?? 0;
    coordCounts[key] = idx + 1;

    let lat = tx.latitude;
    let lng = tx.longitude;
    if (idx > 0) {
      const angle = idx * 2.1;
      const offsetMeters = 4 + Math.floor(idx / 6) * 3;
      lat += (Math.sin(angle) * offsetMeters) / 111320;
      lng += (Math.cos(angle) * offsetMeters) / (111320 * Math.cos((tx.latitude * Math.PI) / 180));
    }
    return { tx, position: { lat, lng } };
  });

  return (
    <section
      id="carte"
      className="h-full flex flex-col bg-white border border-slate-200 rounded-lg overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-200">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Carte Google Maps & périmètre ({radiusMeters} m)
          </h2>
          <p className="text-xs text-slate-500">
            Cliquez sur un bien pour voir le prix ou ouvrir son dossier 9 sources
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <span className="w-2.5 h-2.5 rounded-full bg-[#1D4ED8] inline-block" aria-hidden="true" />
              2 pièces
            </span>
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <span className="w-2.5 h-2.5 rounded-full bg-[#0F766E] inline-block" aria-hidden="true" />
              Studio (1P)
            </span>
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <span className="w-2.5 h-2.5 rounded-full bg-[#0F172A] inline-block" aria-hidden="true" />
              Référence
            </span>
          </div>

          <div
            className="flex items-center gap-0.5 p-0.5 bg-slate-100 rounded-md"
            role="group"
            aria-label="Fond de carte"
          >
            <button
              type="button"
              onClick={() => setMapType('roadmap')}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                mapType === 'roadmap'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Plan
            </button>
            <button
              type="button"
              onClick={() => setMapType('hybrid')}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                mapType === 'hybrid'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Satellite
            </button>
          </div>
        </div>
      </div>

      <div className="relative flex-1 min-h-[380px]" data-testid="dvf-map-container">
        {!apiKey || mapAuthError ? (
          <div className="w-full h-full min-h-[380px] bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
            <p className="text-sm font-semibold text-slate-800">
              {mapAuthError
                ? 'Erreur de chargement Google Maps Platform'
                : 'Initialisation de la clé Google Maps…'}
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">
              {mapAuthError
                ? 'Vérifiez le quota ou les restrictions de votre clé API Google Maps.'
                : 'En attente de la configuration Google Maps Platform.'}
            </p>
          </div>
        ) : (
          <APIProvider
            apiKey={apiKey}
            language="fr"
            region="FR"
          >
            <MapStatusGuard
              onQuotaError={() => {
                setMapAuthError(true);
                window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
              }}
            />
            <GoogleMap
              mapId="DEMO_MAP_ID"
              mapTypeId={mapType}
              defaultCenter={centerCoords}
              defaultZoom={17}
              gestureHandling="greedy"
              mapTypeControl={false}
              streetViewControl={true}
              fullscreenControl={true}
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              style={{ width: '100%', height: '100%', minHeight: '380px' }}
            >
              <PerimeterCircle center={centerCoords} radiusMeters={radiusMeters} />

              {/* Reference address pin */}
              <AdvancedMarker
                position={centerCoords}
                zIndex={100}
                title={center?.label ?? 'Point de référence'}
              >
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: '9999px',
                    backgroundColor: '#0F172A',
                    border: '3px solid #FFFFFF',
                    boxShadow: '0 2px 8px rgba(15, 23, 42, 0.45)',
                  }}
                />
              </AdvancedMarker>

              {/* DVF Transaction Markers */}
              {positionedTxs.map(({ tx, position }) => (
                <TransactionPin
                  key={tx.id}
                  tx={tx}
                  position={position}
                  isSelected={tx.id === selectedId}
                  isActiveInfo={tx.id === infoTxId}
                  onClick={() => {
                    onSelectTransaction(tx);
                    setInfoTxId(tx.id);
                  }}
                  onCloseInfo={() => setInfoTxId(null)}
                  onInspect={() => {
                    setInfoTxId(null);
                    onInspectTransaction(tx);
                  }}
                />
              ))}
            </GoogleMap>
          </APIProvider>
        )}

        {loading && (
          <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px] flex items-center justify-center z-20">
            <span className="text-xs font-medium text-slate-700 bg-white border border-slate-200 px-3 py-1.5 rounded-md">
              Chargement des parcelles DVF…
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
