import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  ArrowLeft,
  Camera,
  Check,
  Save,
  Star,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { AppIcon } from './AppIcon.tsx';
import {
  getUserInitials,
  isSafeAvatarDataUrl,
  ROLE_LABELS,
} from '../lib/portalLogic.ts';
import { updateUserProfile } from '../services/api.ts';
import type { PortalApp, PortalUser } from '../types/portal.ts';

interface ProfileSettingsViewProps {
  user: PortalUser;
  apps: PortalApp[];
  favoriteIds: Set<string>;
  onProfileSaved: (updatedUser: PortalUser, updatedFavoriteIds: string[]) => void;
  onBack: () => void;
}

const ACCEPTED_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

async function resizeImageFileToAvatarDataUrl(file: File): Promise<string> {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
    throw new Error('Selecciona una imagen en formato JPG, PNG o WEBP.');
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('La imagen supera el límite inicial de 10 MB.');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () =>
        reject(new Error('No se pudo leer el archivo de imagen seleccionado.'));
      el.src = objectUrl;
    });

    const targetSize = 280;
    const canvas = document.createElement('canvas');
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('El navegador no permite procesar imágenes en este momento.');
    }

    const minSide = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height);
    const sx = Math.max(0, ((img.naturalWidth || img.width) - minSide) / 2);
    const sy = Math.max(0, ((img.naturalHeight || img.height) - minSide) / 2);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetSize, targetSize);
    ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, targetSize, targetSize);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.86);
    if (!isSafeAvatarDataUrl(dataUrl)) {
      throw new Error('No se pudo generar una imagen válida para el perfil.');
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function ProfileSettingsView({
  user,
  apps,
  favoriteIds,
  onProfileSaved,
  onBack,
}: ProfileSettingsViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [fullName, setFullName] = useState(user.fullName);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    isSafeAvatarDataUrl(user.avatarUrl) ? (user.avatarUrl ?? null) : null
  );
  const [selectedFavorites, setSelectedFavorites] = useState<Set<string>>(
    () => new Set(favoriteIds)
  );
  const [saving, setSaving] = useState(false);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    setFullName(user.fullName);
    setAvatarUrl(
      isSafeAvatarDataUrl(user.avatarUrl) ? (user.avatarUrl ?? null) : null
    );
  }, [user]);

  useEffect(() => {
    setSelectedFavorites(new Set(favoriteIds));
  }, [favoriteIds]);

  const handlePhotoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setError(null);
    setSuccessMessage(null);
    setProcessingPhoto(true);
    try {
      const processed = await resizeImageFileToAvatarDataUrl(file);
      setAvatarUrl(processed);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo procesar la fotografía personal.'
      );
    } finally {
      setProcessingPhoto(false);
    }
  };

  const toggleAppPreference = (appId: string) => {
    setSuccessMessage(null);
    setSelectedFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(appId)) next.delete(appId);
      else next.add(appId);
      return next;
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setSaving(true);
    try {
      const res = await updateUserProfile({
        fullName: fullName.trim(),
        avatarUrl,
        favoriteAppIds: Array.from(selectedFavorites),
      });
      onProfileSaved(res.user, res.favoriteIds);
      setSuccessMessage(
        'Perfil y aplicaciones favoritas guardadas correctamente.'
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudieron guardar los cambios del perfil.'
      );
    } finally {
      setSaving(false);
    }
  };

  const safeAvatar = isSafeAvatarDataUrl(avatarUrl) ? avatarUrl : null;
  const initials = getUserInitials(fullName || user.fullName);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-slate-200">
        <div className="space-y-2 max-w-2xl">
          <button
            type="button"
            onClick={onBack}
            className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Volver</span>
          </button>
          <div className="space-y-1">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-[#1e3a8a]">
              Configuración de Perfil
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              Personaliza tu fotografía docente y elige qué plataformas aparecerán
              destacadas en tus accesos favoritos.
            </p>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving || processingPhoto}
          className="px-4 py-2.5 rounded-lg bg-[#1e3a8a] hover:bg-blue-800 disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 transition-colors"
        >
          <Save className="w-4 h-4" aria-hidden="true" />
          <span>{saving ? 'Guardando...' : 'Guardar preferencias'}</span>
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </div>
      )}

      {successMessage && (
        <div
          role="status"
          className="rounded-xl border border-[#108981]/30 bg-[#108981]/10 px-4 py-3 text-sm text-[#0d736c] flex items-center gap-2 font-medium"
        >
          <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{successMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Personal Photo & Account Details */}
        <section
          aria-labelledby="profile-photo-heading"
          className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-6 space-y-5"
        >
          <div className="space-y-1">
            <h2
              id="profile-photo-heading"
              className="font-display text-base font-semibold text-slate-900"
            >
              Foto personal y datos docentes
            </h2>
            <p className="text-xs text-slate-600">
              Tu foto se ajusta automáticamente en formato cuadrado y se muestra en
              la barra del portal.
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-24 h-24 rounded-xl border border-slate-200 bg-[#1e3a8a] text-white flex items-center justify-center overflow-hidden shrink-0">
              {safeAvatar ? (
                <img
                  src={safeAvatar}
                  alt={`Foto de ${fullName || user.fullName}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="font-display text-2xl font-semibold tracking-tight">
                  {initials}
                </span>
              )}
            </div>

            <div className="space-y-2 min-w-0">
              <input
                ref={fileInputRef}
                id="profile-photo-input"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => void handlePhotoChange(e)}
                className="sr-only"
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={processingPhoto}
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3.5 py-2 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-[#1e3a8a] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
                >
                  <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>
                    {processingPhoto
                      ? 'Procesando...'
                      : safeAvatar
                      ? 'Cambiar foto'
                      : 'Subir foto'}
                  </span>
                </button>

                {safeAvatar && (
                  <button
                    type="button"
                    onClick={() => {
                      setAvatarUrl(null);
                      setSuccessMessage(null);
                    }}
                    className="px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Quitar</span>
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                Formatos permitidos: JPG, PNG o WEBP.
              </p>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-slate-100">
            <div>
              <label
                htmlFor="profile-fullname"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Nombre completo
              </label>
              <div className="relative">
                <UserCheck
                  className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                  aria-hidden="true"
                />
                <input
                  id="profile-fullname"
                  type="text"
                  required
                  minLength={2}
                  maxLength={120}
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    setSuccessMessage(null);
                  }}
                  className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#108981] focus:border-[#108981]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg bg-[#f5f7fa] border border-slate-200/80 px-3 py-2.5">
                <p className="text-slate-500">Correo institucional</p>
                <p className="font-mono text-slate-800 truncate mt-0.5">
                  {user.email}
                </p>
              </div>
              <div className="rounded-lg bg-[#f5f7fa] border border-slate-200/80 px-3 py-2.5">
                <p className="text-slate-500">Perfil asignado</p>
                <p className="font-semibold text-[#108981] mt-0.5">
                  {ROLE_LABELS[user.role]}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Right Column: Favorite Applications Preferences Panel */}
        <section
          aria-labelledby="profile-favorites-heading"
          className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-6 space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <h2
                id="profile-favorites-heading"
                className="font-display text-base font-semibold text-slate-900"
              >
                Panel de preferencias · Aplicaciones favoritas
              </h2>
              <p className="text-xs text-slate-600 tabular-nums">
                {selectedFavorites.size} de {apps.length} plataformas fijadas en tu
                franja de accesos favoritos.
              </p>
            </div>

            {apps.length > 0 && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFavorites(new Set(apps.map((a) => a.id)));
                    setSuccessMessage(null);
                  }}
                  className="px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-[#1e3a8a] text-xs font-medium whitespace-nowrap transition-colors"
                >
                  Seleccionar todas
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFavorites(new Set());
                    setSuccessMessage(null);
                  }}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-medium whitespace-nowrap transition-colors"
                >
                  Limpiar
                </button>
              </div>
            )}
          </div>

          {apps.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-[#f5f7fa] p-6 text-center text-sm text-slate-600">
              No hay plataformas habilitadas para tu perfil actualmente.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {apps.map((app) => {
                const isSelected = selectedFavorites.has(app.id);
                return (
                  <button
                    key={app.id}
                    type="button"
                    role="switch"
                    aria-checked={isSelected}
                    onClick={() => toggleAppPreference(app.id)}
                    className={`text-left rounded-xl border p-3.5 flex items-start justify-between gap-3 transition-colors ${
                      isSelected
                        ? 'border-[#108981] bg-[#108981]/5'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${
                          isSelected
                            ? 'border-[#108981]/30 bg-[#108981]/15 text-[#0d736c]'
                            : 'border-slate-200 bg-slate-50 text-[#1e3a8a]'
                        }`}
                      >
                        <AppIcon name={app.icon} className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-display text-sm font-semibold text-slate-900 truncate">
                          {app.name}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate">
                          {app.category}
                        </p>
                        <p className="text-xs text-slate-600 line-clamp-2 mt-1 leading-snug">
                          {app.description}
                        </p>
                      </div>
                    </div>

                    <div
                      className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${
                        isSelected
                          ? 'border-[#108981] bg-[#108981] text-white'
                          : 'border-slate-200 bg-white text-slate-400'
                      }`}
                    >
                      <Star
                        className={`w-3.5 h-3.5 ${isSelected ? 'fill-white' : ''}`}
                        aria-hidden="true"
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </form>
  );
}
