import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import { useState, type FormEvent } from 'react';

export interface ExtractionFormState {
  address: string;
  radiusMeters: string;
  minSurface: string;
  maxSurface: string;
  rooms: number[];
  years: number[];
  includeBlockSales: boolean;
}

interface FilterSidebarProps {
  form: ExtractionFormState;
  onChange: (next: ExtractionFormState) => void;
  onSubmit: (state: ExtractionFormState) => void;
  onReset: () => void;
  loading: boolean;
  excludedBlockSalesCount: number;
}

const ALL_YEARS = [2021, 2022, 2023, 2024, 2025];
const RADIUS_PRESETS = [100, 200, 350, 500];
const ROOM_OPTIONS = [
  { value: 1, label: 'Studio (1 pièce)' },
  { value: 2, label: '2 pièces' },
  { value: 3, label: '3 pièces' },
];

export function FilterSidebar({
  form,
  onChange,
  onSubmit,
  onReset,
  loading,
  excludedBlockSalesCount,
}: FilterSidebarProps) {
  const [validationError, setValidationError] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  function toggleRoom(roomVal: number) {
    const exists = form.rooms.includes(roomVal);
    const nextRooms = exists
      ? form.rooms.filter((r) => r !== roomVal)
      : [...form.rooms, roomVal].sort((a, b) => a - b);
    onChange({ ...form, rooms: nextRooms });
  }

  function toggleYear(yr: number) {
    const exists = form.years.includes(yr);
    const nextYears = exists
      ? form.years.filter((y) => y !== yr)
      : [...form.years, yr].sort((a, b) => a - b);
    onChange({ ...form, years: nextYears });
  }

  function handleFormSubmit(e: FormEvent) {
    e.preventDefault();
    const addr = form.address.trim();
    if (!addr) {
      setValidationError('Veuillez saisir une adresse de référence.');
      return;
    }

    const radius = Number(form.radiusMeters);
    if (!Number.isFinite(radius) || radius < 20 || radius > 2000) {
      setValidationError('Le rayon doit être compris entre 20 m et 2 000 m.');
      return;
    }

    const minS = Number(form.minSurface);
    const maxS = Number(form.maxSurface);
    if (!Number.isFinite(minS) || !Number.isFinite(maxS) || minS < 5 || minS > maxS) {
      setValidationError('La surface minimale doit être inférieure ou égale à la maximale.');
      return;
    }

    if (form.rooms.length === 0) {
      setValidationError('Sélectionnez au moins une typologie d’appartement.');
      return;
    }

    if (form.years.length === 0) {
      setValidationError('Sélectionnez au moins un millésime DVF.');
      return;
    }

    setValidationError(null);
    onSubmit(form);
    setMobileOpen(false);
  }

  const formContent = (
    <form onSubmit={handleFormSubmit} className="space-y-5" noValidate>
      {/* Address */}
      <div>
        <label htmlFor="dvf-address" className="block text-xs font-semibold text-slate-700 mb-1.5">
          Adresse de référence
        </label>
        <input
          id="dvf-address"
          type="text"
          value={form.address}
          onChange={(e) => onChange({ ...form, address: e.target.value })}
          placeholder="Ex. 70 Rue Olivier de Serres, 75015 Paris"
          className="w-full px-3 py-2 text-[13px] bg-slate-50 border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#1D4ED8] focus:bg-white transition-colors"
        />
      </div>

      {/* Radius */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label htmlFor="dvf-radius" className="text-xs font-semibold text-slate-700">
            Rayon de recherche (m)
          </label>
          <span className="text-xs font-mono tabular-nums text-slate-500">
            {form.radiusMeters || 0} m
          </span>
        </div>
        <input
          id="dvf-radius"
          type="number"
          min={20}
          max={2000}
          step={10}
          value={form.radiusMeters}
          onChange={(e) => onChange({ ...form, radiusMeters: e.target.value })}
          className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:border-[#1D4ED8] focus:bg-white transition-colors"
        />
        <div className="grid grid-cols-4 gap-1.5 mt-2">
          {RADIUS_PRESETS.map((preset) => {
            const active = Number(form.radiusMeters) === preset;
            return (
              <button
                key={preset}
                type="button"
                onClick={() => onChange({ ...form, radiusMeters: String(preset) })}
                className={`py-1.5 text-xs font-mono tabular-nums rounded border transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[#1D4ED8] text-white border-[#1D4ED8]'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:text-slate-900'
                }`}
              >
                {preset}m
              </button>
            );
          })}
        </div>
      </div>

      {/* Surface range */}
      <div>
        <span className="block text-xs font-semibold text-slate-700 mb-1.5">
          Surface réelle bâtie (m²)
        </span>
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label htmlFor="dvf-min-surface" className="block text-[11px] text-slate-500 mb-1">
              Min (m²)
            </label>
            <input
              id="dvf-min-surface"
              type="number"
              min={5}
              max={500}
              value={form.minSurface}
              onChange={(e) => onChange({ ...form, minSurface: e.target.value })}
              className="w-full px-3 py-1.5 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:border-[#1D4ED8] focus:bg-white transition-colors"
            />
          </div>
          <div>
            <label htmlFor="dvf-max-surface" className="block text-[11px] text-slate-500 mb-1">
              Max (m²)
            </label>
            <input
              id="dvf-max-surface"
              type="number"
              min={5}
              max={500}
              value={form.maxSurface}
              onChange={(e) => onChange({ ...form, maxSurface: e.target.value })}
              className="w-full px-3 py-1.5 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:border-[#1D4ED8] focus:bg-white transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Rooms */}
      <fieldset>
        <legend className="text-xs font-semibold text-slate-700 mb-2">
          Typologie (Appartements)
        </legend>
        <div className="space-y-1.5">
          {ROOM_OPTIONS.map((opt) => {
            const checked = form.rooms.includes(opt.value);
            return (
              <label
                key={opt.value}
                className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer py-1"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleRoom(opt.value)}
                  className="w-4 h-4 rounded border-slate-300 text-[#1D4ED8] focus:ring-[#1D4ED8]"
                />
                <span>{opt.label}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* Years */}
      <fieldset>
        <legend className="text-xs font-semibold text-slate-700 mb-2">
          Millésimes DVF
        </legend>
        <div className="grid grid-cols-5 gap-1">
          {ALL_YEARS.map((yr) => {
            const active = form.years.includes(yr);
            return (
              <button
                key={yr}
                type="button"
                aria-pressed={active}
                onClick={() => toggleYear(yr)}
                className={`py-1.5 text-xs font-mono tabular-nums rounded border transition-colors ${
                  active
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {yr}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Block sales toggle */}
      <div className="pt-2 border-t border-slate-100">
        <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={form.includeBlockSales}
            onChange={(e) => onChange({ ...form, includeBlockSales: e.target.checked })}
            className="w-4 h-4 mt-0.5 rounded border-slate-300 text-[#1D4ED8] focus:ring-[#1D4ED8]"
          />
          <span>
            <span className="font-medium text-slate-800 block">
              Inclure les ventes en bloc
            </span>
            <span className="text-slate-500">
              {excludedBlockSalesCount > 0
                ? `${excludedBlockSalesCount} lot${excludedBlockSalesCount > 1 ? 's' : ''} en bloc écarté${excludedBlockSalesCount > 1 ? 's' : ''} des médianes.`
                : 'Exclut par défaut les actes multi-logements.'}
            </span>
          </span>
        </label>
      </div>

      {validationError && (
        <div
          role="alert"
          className="p-2.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md"
        >
          {validationError}
        </div>
      )}

      <div className="flex flex-col gap-2 pt-1">
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 px-4 text-sm font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-60 rounded-md transition-colors whitespace-nowrap"
        >
          {loading ? 'Extraction en cours…' : 'Extraire DVF'}
        </button>
        <button
          type="button"
          onClick={() => {
            setValidationError(null);
            onReset();
          }}
          className="w-full py-2 px-4 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
        >
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          Réinitialiser la requête
        </button>
      </div>
    </form>
  );

  return (
    <>
      {/* Mobile toggle bar */}
      <div className="lg:hidden bg-white border-b border-slate-200 px-4 py-2.5">
        <button
          type="button"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((prev) => !prev)}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800"
        >
          <SlidersHorizontal className="w-4 h-4 text-[#1D4ED8]" aria-hidden="true" />
          {mobileOpen ? 'Masquer les paramètres' : 'Paramètres d’extraction DVF'}
        </button>
        {mobileOpen && <div className="mt-4 pb-2">{formContent}</div>}
      </div>

      {/* Desktop persistent sidebar */}
      <aside
        aria-label="Paramètres d'extraction DVF"
        className="hidden lg:block w-[308px] shrink-0 border-r border-slate-200 bg-white p-5"
      >
        <h2 className="text-sm font-semibold text-slate-900 mb-4">
          Paramètres d’extraction
        </h2>
        {formContent}
      </aside>
    </>
  );
}
