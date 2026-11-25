import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowUpRight,
  Calendar as CalendarIcon,
  Layers,
  Lock,
  Mail,
  Search,
  Star,
} from 'lucide-react';
import { AppIcon } from './AppIcon.tsx';
import {
  isValidAppUrl,
  resolveLaunchBehavior,
  sortAndFilterApps,
} from '../lib/portalLogic.ts';
import { logAccessEvent } from '../services/api.ts';
import type { PortalApp } from '../types/portal.ts';

interface AppCatalogViewProps {
  apps: PortalApp[];
  favoriteIds: Set<string>;
  openedEmbeddedIds: Set<string>;
  googleConnected: boolean;
  loading: boolean;
  error: string | null;
  onToggleFavorite: (appId: string) => void;
  onOpenEmbedded: (app: PortalApp) => void;
  onOpenCalendar: () => void;
  onRetry: () => void;
}

function getCategoryAccentClasses(category: string): string {
  const lower = category.toLowerCase();
  if (lower.includes('académica') || lower.includes('academica')) {
    return 'bg-blue-50 text-[#1e3a8a] border-blue-200/80 group-hover:bg-blue-100/80';
  }
  if (lower.includes('docente')) {
    return 'bg-[#108981]/10 text-[#108981] border-[#108981]/25 group-hover:bg-[#108981]/15';
  }
  if (lower.includes('inclusión') || lower.includes('inclusion') || lower.includes('apoyo')) {
    return 'bg-[#108981]/10 text-[#108981] border-[#108981]/25 group-hover:bg-[#108981]/15';
  }
  if (lower.includes('convivencia')) {
    return 'bg-amber-50 text-amber-800 border-amber-200/80 group-hover:bg-amber-100/80';
  }
  return 'bg-slate-100 text-slate-700 border-slate-200 group-hover:bg-slate-200/70';
}

export function AppCatalogView({
  apps,
  favoriteIds,
  openedEmbeddedIds,
  googleConnected,
  loading,
  error,
  onToggleFavorite,
  onOpenEmbedded,
  onOpenCalendar,
  onRetry,
}: AppCatalogViewProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyFavorites, setOnlyFavorites] = useState(false);

  const categories = useMemo(() => {
    const unique = Array.from(new Set(apps.map((a) => a.category))).sort((a, b) =>
      a.localeCompare(b, 'es')
    );
    return ['Todas', ...unique];
  }, [apps]);

  const favoriteApps = useMemo(
    () =>
      sortAndFilterApps(apps, {
        onlyFavorites: true,
        favoriteIds,
      }),
    [apps, favoriteIds]
  );

  const filteredApps = useMemo(
    () =>
      sortAndFilterApps(apps, {
        category: selectedCategory,
        search: searchQuery,
        onlyFavorites,
        favoriteIds,
      }),
    [apps, selectedCategory, searchQuery, onlyFavorites, favoriteIds]
  );

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Cargando accesos">
        <div className="h-10 w-72 bg-slate-200 rounded-lg animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((idx) => (
            <div
              key={idx}
              className="h-44 rounded-xl border border-slate-200 bg-white p-4 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-red-200 bg-red-50 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div>
          <h2 className="font-display text-base font-semibold text-red-900">
            No se pudo cargar el Centro de Acceso Rápido
          </h2>
          <p className="text-sm text-red-800 mt-1">{error}</p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-800 text-white text-sm font-medium whitespace-nowrap shrink-0"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Executive Single-Visual Hero Header */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-slate-200"
      >
        <div className="space-y-1 max-w-2xl">
          <h1 className="font-display text-2xl sm:text-[28px] font-semibold tracking-tight text-[#1e3a8a] text-balance">
            Centro de Acceso Rápido
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Todas tus plataformas institucionales en una sola visual. Los permisos
            efectivos de consulta y edición se validan en cada servicio.
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-600 shrink-0 tabular-nums">
          <span>
            <strong className="font-semibold text-[#1e3a8a]">{apps.length}</strong>{' '}
            plataformas
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <strong className="font-semibold text-[#1e3a8a]">2</strong>{' '}
            Google Workspace
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <strong className="font-semibold text-[#1e3a8a]">
              {favoriteApps.length}
            </strong>{' '}
            favoritas
          </span>
        </div>
      </motion.div>

      {/* Google Workspace Direct Access (Gmail & Shared Calendar) */}
      <section
        aria-labelledby="workspace-quick-heading"
        className="space-y-2.5"
      >
        <h2
          id="workspace-quick-heading"
          className="font-display text-xs font-semibold tracking-wide text-slate-500"
        >
          Google Workspace · Correo y agenda
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {/* Gmail Card */}
          <motion.article
            data-testid="quick-card-gmail"
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            whileHover={{ scale: 1.015, y: -2 }}
            whileTap={{ scale: 0.99 }}
            className="group rounded-xl border border-slate-200 bg-white p-4 flex items-center justify-between gap-4 hover:border-[#1e3a8a]/50 hover:shadow-md transition-shadow duration-200"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-lg border border-blue-200 bg-blue-50 text-[#1e3a8a] group-hover:bg-blue-100/80 flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105">
                <Mail className="w-5 h-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h3 className="font-display text-sm font-semibold text-slate-900 leading-snug">
                  Correo institucional (Gmail)
                </h3>
                <p className="text-xs text-slate-600 truncate mt-0.5">
                  Bandeja directa en Gmail · Mensajería institucional
                </p>
              </div>
            </div>
            <a
              href="https://mail.google.com/"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() =>
                void logAccessEvent({
                  appId: 'ext-gmail',
                  launchMode: 'new_tab',
                })
              }
              className="px-3.5 py-2 rounded-lg bg-[#1e3a8a] hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              <span>Abrir Gmail</span>
              <ArrowUpRight
                className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                aria-hidden="true"
              />
            </a>
          </motion.article>

          {/* Shared Calendar Card */}
          <motion.article
            data-testid="quick-card-calendar"
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.22, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
            whileHover={{ scale: 1.015, y: -2 }}
            whileTap={{ scale: 0.99 }}
            className="group rounded-xl border border-slate-200 bg-white p-4 flex items-center justify-between gap-4 hover:border-[#108981] hover:shadow-md transition-shadow duration-200"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-lg border border-[#108981]/25 bg-[#108981]/10 text-[#108981] group-hover:bg-[#108981]/15 flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105">
                <CalendarIcon className="w-5 h-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h3 className="font-display text-sm font-semibold text-slate-900 leading-snug">
                  Calendario compartido
                </h3>
                <p className="text-xs text-slate-600 truncate mt-0.5">
                  {googleConnected
                    ? 'Google Calendar conectado · Eventos y descripciones'
                    : 'Conexión pendiente · Consultar agenda según permisos'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenCalendar}
              className="px-3.5 py-2 rounded-lg bg-[#108981] hover:bg-[#0d736c] text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              <span>{googleConnected ? 'Ver agenda' : 'Abrir calendario'}</span>
            </button>
          </motion.article>
        </div>
      </section>

      {/* Pinned Favorites Strip */}
      <AnimatePresence initial={false}>
        {favoriteApps.length > 0 &&
          !onlyFavorites &&
          !searchQuery &&
          selectedCategory === 'Todas' && (
            <motion.section
              key="favorites-strip"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              aria-labelledby="favorites-heading"
              className="space-y-2.5"
            >
              <h2
                id="favorites-heading"
                className="font-display text-xs font-semibold tracking-wide text-slate-500"
              >
                Accesos favoritos
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {favoriteApps.map((app, index) => {
                  const launch = resolveLaunchBehavior(app);
                  const safeHref = isValidAppUrl(app.url) ? app.url : '#';
                  const iconTone = getCategoryAccentClasses(app.category);
                  return (
                    <motion.div
                      key={`fav-${app.id}`}
                      layout
                      initial={{ opacity: 0, y: 8, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      whileHover={{ scale: 1.02, y: -2 }}
                      whileTap={{ scale: 0.99 }}
                      transition={{
                        duration: 0.2,
                        delay: Math.min(index * 0.04, 0.2),
                        ease: [0.16, 1, 0.3, 1],
                      }}
                      className="group rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 flex items-center justify-between gap-2.5 hover:border-[#108981] hover:shadow-sm transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${iconTone}`}
                        >
                          <AppIcon name={app.icon} className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-display text-xs font-semibold text-slate-900 truncate">
                            {app.name}
                          </p>
                          <p className="text-[11px] text-slate-500 truncate">
                            {app.category}
                          </p>
                        </div>
                      </div>
                      {launch.mode === 'embedded' ? (
                        <button
                          type="button"
                          onClick={() => onOpenEmbedded(app)}
                          className="px-2.5 py-1.5 rounded-md bg-[#108981] hover:bg-[#0d736c] text-white text-xs font-medium whitespace-nowrap shrink-0 transition-colors"
                        >
                          Abrir
                        </button>
                      ) : (
                        <a
                          href={safeHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() =>
                            void logAccessEvent({
                              appId: app.id,
                              launchMode: 'new_tab',
                            })
                          }
                          className="px-2.5 py-1.5 rounded-md bg-[#1e3a8a] hover:bg-blue-800 text-white text-xs font-medium whitespace-nowrap shrink-0 inline-flex items-center gap-1 transition-colors"
                        >
                          <span>Abrir</span>
                          <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
                        </a>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </motion.section>
          )}
      </AnimatePresence>

      {/* Search & Category Controls */}
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="relative flex-1 max-w-md">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label="Buscar plataforma"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar plataforma en una sola visual..."
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#108981] focus:border-[#108981]"
            />
          </div>

          <button
            type="button"
            aria-pressed={onlyFavorites}
            onClick={() => setOnlyFavorites((prev) => !prev)}
            className={`h-9 px-3.5 rounded-lg border text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              onlyFavorites
                ? 'border-[#108981] bg-[#108981] text-white'
                : 'border-[#108981]/30 bg-[#108981]/10 text-[#0d736c] hover:bg-[#108981]/15 hover:border-[#108981]/50'
            }`}
          >
            <Star
              className={`w-3.5 h-3.5 ${
                onlyFavorites ? 'fill-white text-white' : 'text-[#108981]'
              }`}
              aria-hidden="true"
            />
            <span>Solo favoritos</span>
          </button>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-200/70 border border-slate-200 rounded-lg overflow-x-auto flex-nowrap">
          {categories.map((cat) => {
            const active = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`relative px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  active ? 'text-[#1e3a8a]' : 'text-slate-600 hover:text-[#1e3a8a]'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="activeCategoryPill"
                    transition={{ type: 'spring', stiffness: 460, damping: 36 }}
                    className="absolute inset-0 bg-white rounded-md shadow-xs"
                    aria-hidden="true"
                  />
                )}
                <span className="relative z-10">{cat}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Compact 3-4 Column Interactive Grid */}
      {filteredApps.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center space-y-3">
          <p className="font-display text-base font-semibold text-slate-900">
            No hay plataformas que coincidan con tu filtro
          </p>
          <p className="text-sm text-slate-600">
            Limpia la búsqueda o cambia la categoría seleccionada.
          </p>
          <button
            type="button"
            onClick={() => {
              setSelectedCategory('Todas');
              setSearchQuery('');
              setOnlyFavorites(false);
            }}
            className="px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-sm font-medium text-slate-800"
          >
            Ver todas las plataformas
          </button>
        </div>
      ) : (
        <motion.div
          layout
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
        >
          <AnimatePresence mode="popLayout">
            {filteredApps.map((app, index) => {
              const isFav = favoriteIds.has(app.id);
              const launch = resolveLaunchBehavior(app);
              const safeHref = isValidAppUrl(app.url) ? app.url : '#';
              const isMountedAlive = openedEmbeddedIds.has(app.id);
              const iconTone = getCategoryAccentClasses(app.category);

              return (
                <motion.article
                  key={app.id}
                  layout
                  data-testid={`app-card-${app.slug}`}
                  initial={{ opacity: 0, y: 12, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{
                    duration: 0.24,
                    delay: Math.min(index * 0.045, 0.25),
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  whileHover={{ scale: 1.02, y: -3 }}
                  whileTap={{ scale: 0.99 }}
                  className="group h-full rounded-xl border border-slate-200 bg-white p-4 flex flex-col justify-between gap-3.5 hover:border-[#108981] hover:shadow-md transition-shadow duration-200"
                >
                  <div className="space-y-2.5">
                    {/* Top Row: Compact Icon + Favorite Star */}
                    <div className="flex items-start justify-between gap-2">
                      <div
                        className={`w-10 h-10 rounded-lg border flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105 ${iconTone}`}
                      >
                        <AppIcon name={app.icon} className="w-5 h-5" />
                      </div>

                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.85 }}
                        onClick={() => onToggleFavorite(app.id)}
                        aria-label={
                          isFav
                            ? `Quitar de favoritos: ${app.name}`
                            : `Agregar a favoritos: ${app.name}`
                        }
                        aria-pressed={isFav}
                        className="w-8 h-8 rounded-lg border border-slate-200/80 hover:border-slate-300 hover:bg-slate-50 flex items-center justify-center shrink-0 transition-colors"
                      >
                        <Star
                          className={`w-4 h-4 transition-colors ${
                            isFav
                              ? 'fill-amber-500 text-amber-500'
                              : 'text-slate-400 group-hover:text-slate-600'
                          }`}
                          aria-hidden="true"
                        />
                      </motion.button>
                    </div>

                    {/* Title + Unboxed Category + Brief Clamped Summary */}
                    <div className="space-y-1">
                      <h2 className="font-display text-base font-semibold text-slate-900 leading-snug line-clamp-2">
                        {app.name}
                      </h2>
                      <p className="text-[11px] font-medium text-slate-500 truncate">
                        {app.category}
                      </p>
                      <p
                        title={app.description}
                        className="text-[13px] text-slate-600 leading-snug line-clamp-2 pt-0.5"
                      >
                        {app.description}
                      </p>
                    </div>
                  </div>

                  {/* Compact Footer Action */}
                  <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-500 truncate flex items-center gap-1">
                      {app.xFrameOptionsDenied ? (
                        <>
                          <Lock className="w-3 h-3 text-amber-600 shrink-0" aria-hidden="true" />
                          <span>Pestaña segura</span>
                        </>
                      ) : isMountedAlive ? (
                        <span className="text-[#108981] font-medium">
                          Abierta en sesión
                        </span>
                      ) : launch.mode === 'embedded' ? (
                        <span>Vista integrada</span>
                      ) : (
                        <span>Acceso directo</span>
                      )}
                    </span>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {launch.mode === 'embedded' ? (
                        <>
                          <a
                            href={safeHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() =>
                              void logAccessEvent({
                                appId: app.id,
                                launchMode: 'new_tab',
                              })
                            }
                            aria-label={`Abrir ${app.name} en pestaña nueva`}
                            title="Abrir en pestaña nueva"
                            className="w-8 h-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 text-slate-600 inline-flex items-center justify-center transition-colors"
                          >
                            <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                          </a>
                          <button
                            type="button"
                            onClick={() => onOpenEmbedded(app)}
                            className="px-3 py-1.5 rounded-lg bg-[#108981] hover:bg-[#0d736c] text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
                          >
                            <Layers className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>{isMountedAlive ? 'Ver abierta' : 'Abrir'}</span>
                          </button>
                        </>
                      ) : (
                        <a
                          href={safeHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() =>
                            void logAccessEvent({
                              appId: app.id,
                              launchMode: 'new_tab',
                            })
                          }
                          className="px-3 py-1.5 rounded-lg bg-[#1e3a8a] hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center gap-1 whitespace-nowrap transition-colors"
                        >
                          <span>Abrir</span>
                          <ArrowUpRight
                            className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                            aria-hidden="true"
                          />
                        </a>
                      )}
                    </div>
                  </div>
                </motion.article>
              );
            })}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
