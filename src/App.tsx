import { useCallback, useEffect, useMemo, useState } from 'react';
import { MotionConfig } from 'motion/react';
import {
  Activity,
  GitMerge,
  LayoutGrid,
  Layers,
  LogOut,
  Menu,
  Settings,
  UserCog,
  X,
} from 'lucide-react';
import { AdminPanelView } from './components/AdminPanelView.tsx';
import { AppCatalogView } from './components/AppCatalogView.tsx';
import { AuthView } from './components/AuthView.tsx';
import { CalendarView } from './components/CalendarView.tsx';
import { KeepAliveWorkspace } from './components/KeepAliveWorkspace.tsx';
import { MonitoringView } from './components/MonitoringView.tsx';
import { ProfileSettingsView } from './components/ProfileSettingsView.tsx';

import {
  getUserInitials,
  isSafeAvatarDataUrl,
  ROLE_LABELS,
} from './lib/portalLogic.ts';
import {
  getAuthSession,
  getBootstrapStatus,
  getCatalogApps,
  logAccessEvent,
  logoutInstitutionalUser,
  toggleAppFavorite,
} from './services/api.ts';
import {
  getCachedGoogleToken,
  initGoogleCalendarAuth,
} from './services/googleCalendar.ts';
import type { BootstrapStatus, PortalApp, PortalUser } from './types/portal.ts';

type PortalView =
  | 'catalog'
  | 'calendar'
  | 'profile'
  | 'sso'
  | 'monitoring'
  | 'admin'
  | 'workspace';

export default function App() {
  const [initializing, setInitializing] = useState(true);
  const [bootstrap, setBootstrap] = useState<BootstrapStatus>({
    needsAdminSetup: false,
    envPasscodeActive: false,
    adminEmailHint: 'hluengo.ro@gmail.com',
  });
  const [user, setUser] = useState<PortalUser | null>(null);

  const [activeView, setActiveView] = useState<PortalView>('catalog');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [apps, setApps] = useState<PortalApp[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  // Embedded Keep-Alive Workspace state (preserves Tarjetas Flow while navigating)
  const [openedEmbeddedApps, setOpenedEmbeddedApps] = useState<PortalApp[]>([]);
  const [activeEmbeddedId, setActiveEmbeddedId] = useState<string | null>(null);

  const [googleConnected, setGoogleConnected] = useState<boolean>(() =>
    Boolean(getCachedGoogleToken())
  );

  useEffect(() => {
    return initGoogleCalendarAuth(
      () => setGoogleConnected(true),
      () => setGoogleConnected(false)
    );
  }, []);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const res = await getCatalogApps();
      setApps(res.apps);
      setFavoriteIds(new Set(res.favoriteIds));
    } catch (err) {
      setCatalogError(
        err instanceof Error ? err.message : 'Error cargando el catálogo.'
      );
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const boot = await getBootstrapStatus();
        if (!active) return;
        setBootstrap(boot);

        const session = await getAuthSession();
        if (!active) return;
        setUser(session.authenticated ? session.user : null);
      } finally {
        if (active) setInitializing(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (user) {
      void loadCatalog();
    } else {
      setApps([]);
      setFavoriteIds(new Set());
      setOpenedEmbeddedApps([]);
      setActiveEmbeddedId(null);
    }
  }, [user, loadCatalog]);

  const handleToggleFavorite = async (appId: string) => {
    // Optimistic update + authoritative DB sync
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(appId)) next.delete(appId);
      else next.add(appId);
      return next;
    });
    try {
      const res = await toggleAppFavorite(appId);
      setFavoriteIds(new Set(res.favoriteIds));
    } catch {
      void loadCatalog();
    }
  };

  const handleOpenEmbedded = (app: PortalApp) => {
    void logAccessEvent({ appId: app.id, launchMode: 'embedded' });
    setOpenedEmbeddedApps((prev) => {
      const exists = prev.some((item) => item.id === app.id);
      return exists ? prev : [...prev, app];
    });
    setActiveEmbeddedId(app.id);
    setActiveView('workspace');
    setMobileMenuOpen(false);
  };

  const handleCloseEmbedded = (appId: string) => {
    setOpenedEmbeddedApps((prev) => {
      const next = prev.filter((item) => item.id !== appId);
      if (next.length === 0) {
        setActiveEmbeddedId(null);
        if (activeView === 'workspace') {
          setActiveView('catalog');
        }
      } else if (activeEmbeddedId === appId) {
        setActiveEmbeddedId(next[0].id);
      }
      return next;
    });
  };

  const handleLogout = async () => {
    await logoutInstitutionalUser();
    setUser(null);
    setActiveView('catalog');
    const boot = await getBootstrapStatus().catch(() => bootstrap);
    setBootstrap(boot);
  };

  const openedEmbeddedIds = useMemo(
    () => new Set(openedEmbeddedApps.map((a) => a.id)),
    [openedEmbeddedApps]
  );

  if (initializing) {
    return (
      <div className="min-h-screen bg-[#f5f7fa] flex items-center justify-center p-6">
        <div className="text-center space-y-2.5">
          <img
            src="/logo.svg"
            alt="Insignia Colegio Carmela Romero de Espinosa"
            className="institutional-logo h-12 w-auto mx-auto"
          />
          <p className="font-display text-sm font-medium text-slate-700">
            Cargando Portal Interno Escolar...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <AuthView
        bootstrap={bootstrap}
        onAuthenticated={(loggedUser) => {
          setUser(loggedUser);
          setActiveView('catalog');
        }}
      />
    );
  }

  const isAdmin = user.role === 'admin';
  const safeAvatar = isSafeAvatarDataUrl(user.avatarUrl) ? user.avatarUrl : null;
  const userInitials = getUserInitials(user.fullName);

  const viewTitle =
    activeView === 'catalog'
      ? 'Centro de Acceso Rápido'
      : activeView === 'calendar'
      ? 'Calendario'
      : activeView === 'profile'
      ? 'Configuración de Perfil'
      : activeView === 'sso'
      ? 'Integraciones y SSO'
      : activeView === 'monitoring'
      ? 'Monitoreo y Accesos'
      : activeView === 'admin'
      ? 'Administración'
      : openedEmbeddedApps.find((a) => a.id === activeEmbeddedId)?.name ||
        'Espacio integrado';

  const navItems: Array<{
    id: PortalView;
    label: string;
    icon: typeof LayoutGrid;
    visible: boolean;
  }> = [
    { id: 'catalog', label: 'Acceso Rápido', icon: LayoutGrid, visible: true },
    {
      id: 'workspace',
      label: `Abiertas (${openedEmbeddedApps.length})`,
      icon: Layers,
      visible: openedEmbeddedApps.length > 0,
    },
    {
      id: 'profile',
      label: 'Configuración de Perfil',
      icon: UserCog,
      visible: true,
    },
    { id: 'monitoring', label: 'Monitoreo', icon: Activity, visible: isAdmin },
    { id: 'admin', label: 'Administración', icon: Settings, visible: isAdmin },
  ];

  return (
    <MotionConfig reducedMotion="user">
    <div className="min-h-screen bg-[#f5f7fa] flex">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-white border-r border-slate-200 z-20">
        <div className="h-16 px-4 flex items-center gap-2.5 border-b border-slate-200">
          <img
            src="/logo.svg"
            alt="Insignia Colegio Carmela Romero de Espinosa"
            className="institutional-logo h-9 w-auto shrink-0"
          />
          <span className="font-display text-sm font-semibold tracking-tight text-[#1e3a8a] whitespace-nowrap truncate">
            Portal Interno Escolar
          </span>
        </div>

        <nav
          aria-label="Navegación principal"
          className="flex-1 px-3 py-4 space-y-1 overflow-y-auto"
        >
          {navItems
            .filter((item) => item.visible)
            .map((item) => {
              const Icon = item.icon;
              const isCurrent = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveView(item.id)}
                  aria-current={isCurrent ? 'page' : undefined}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    isCurrent
                      ? 'bg-[#1e3a8a] text-white'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-[#1e3a8a]'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isCurrent ? 'text-emerald-300' : 'text-slate-400'
                    }`}
                    aria-hidden="true"
                  />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
        </nav>

        <div className="p-4 border-t border-slate-200 space-y-3">
          <button
            type="button"
            onClick={() => setActiveView('profile')}
            className="w-full flex items-center gap-2.5 text-left rounded-lg p-1.5 -m-1.5 hover:bg-slate-50 transition-colors"
            title="Configurar perfil y foto personal"
          >
            <div className="w-9 h-9 rounded-lg bg-[#1e3a8a] text-white flex items-center justify-center overflow-hidden shrink-0">
              {safeAvatar ? (
                <img
                  src={safeAvatar}
                  alt={user.fullName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="font-display text-xs font-semibold">
                  {userInitials}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display text-xs font-semibold text-slate-900 truncate">
                {user.fullName}
              </p>
              <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
              <p className="text-[11px] text-[#108981] font-semibold">
                {ROLE_LABELS[user.role]}
              </p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 inline-flex items-center justify-center gap-1.5 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden flex">
          <div
            className="fixed inset-0 bg-[#1e3a8a]/35"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative w-72 max-w-[85vw] bg-white h-full flex flex-col justify-between border-r border-slate-200 z-50">
            <div>
              <div className="h-16 px-4 flex items-center justify-between border-b border-slate-200">
                <div className="flex items-center gap-2.5 min-w-0">
                  <img
                    src="/logo.svg"
                    alt="Insignia Colegio Carmela Romero de Espinosa"
                    className="institutional-logo h-8 w-auto shrink-0"
                  />
                  <span className="font-display text-sm font-semibold text-[#1e3a8a] truncate">
                    Portal Interno Escolar
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Cerrar menú"
                  className="p-2 rounded-lg text-slate-600 hover:bg-slate-100"
                >
                  <X className="w-5 h-5" aria-hidden="true" />
                </button>
              </div>
              <nav className="p-3 space-y-1" aria-label="Navegación móvil">
                {navItems
                  .filter((item) => item.visible)
                  .map((item) => {
                    const Icon = item.icon;
                    const isCurrent = activeView === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setActiveView(item.id);
                          setMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                          isCurrent
                            ? 'bg-[#1e3a8a] text-white'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <Icon
                          className={`w-4 h-4 ${
                            isCurrent ? 'text-emerald-300' : 'text-slate-400'
                          }`}
                          aria-hidden="true"
                        />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
              </nav>
            </div>
            <div className="p-4 border-t border-slate-200 space-y-3">
              <div>
                <p className="font-display text-xs font-semibold text-slate-900">
                  {user.fullName}
                </p>
                <p className="text-xs text-[#108981] font-semibold">
                  {ROLE_LABELS[user.role]}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-medium text-slate-700"
              >
                Cerrar sesión
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Frame */}
      <div className="flex-1 md:pl-64 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-16 bg-white/90 backdrop-blur-sm border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between gap-8 sticky top-0 z-10">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Abrir menú de navegación"
              className="md:hidden p-2 -ml-2 rounded-lg text-slate-700 hover:bg-slate-100"
            >
              <Menu className="w-5 h-5" aria-hidden="true" />
            </button>
            <div className="flex items-center gap-2 text-sm text-slate-600 min-w-0">
              <span className="hidden sm:inline text-slate-400">
                Portal Interno Escolar
              </span>
              <span className="hidden sm:inline text-slate-300">/</span>
              <span className="font-display font-semibold text-[#1e3a8a] truncate">
                {viewTitle}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setActiveView('profile')}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 transition-colors"
              title="Configuración de Perfil"
            >
              <span className="w-6 h-6 rounded-md bg-[#1e3a8a] text-white flex items-center justify-center overflow-hidden shrink-0">
                {safeAvatar ? (
                  <img
                    src={safeAvatar}
                    alt={user.fullName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="font-display text-[10px] font-semibold">
                    {userInitials}
                  </span>
                )}
              </span>
              <span className="hidden sm:inline max-w-[140px] truncate">
                {user.fullName}
              </span>
            </button>
          </div>
        </header>

        {/* Active View Content */}
        <main className="flex-1 p-4 sm:p-8 max-w-6xl w-full mx-auto">
          {activeView === 'catalog' && (
            <AppCatalogView
              apps={apps}
              favoriteIds={favoriteIds}
              openedEmbeddedIds={openedEmbeddedIds}
              googleConnected={googleConnected}
              loading={catalogLoading}
              error={catalogError}
              onToggleFavorite={(id) => void handleToggleFavorite(id)}
              onOpenEmbedded={handleOpenEmbedded}
              onOpenCalendar={() => {
                void logAccessEvent({
                  appId: 'ext-google-calendar',
                  launchMode: 'embedded',
                });
                setActiveView('calendar');
              }}
              onRetry={() => void loadCatalog()}
            />
          )}

          {activeView === 'calendar' && (
            <CalendarView onBack={() => setActiveView('catalog')} />
          )}

          {activeView === 'profile' && (
            <ProfileSettingsView
              user={user}
              apps={apps}
              favoriteIds={favoriteIds}
              onProfileSaved={(updatedUser, updatedFavoriteIds) => {
                setUser(updatedUser);
                setFavoriteIds(new Set(updatedFavoriteIds));
              }}
              onBack={() => setActiveView('catalog')}
            />
          )}

          {activeView === 'monitoring' && isAdmin && (
            <MonitoringView onBack={() => setActiveView('catalog')} />
          )}

          {activeView === 'admin' && isAdmin && (
            <AdminPanelView
              currentUser={user}
              onCatalogUpdated={loadCatalog}
              onBack={() => setActiveView('catalog')}
            />
          )}

          {/* Keep-Alive Mounted Iframes (Always mounted while open so Tarjetas Flow never loses React state) */}
          <KeepAliveWorkspace
            openedApps={openedEmbeddedApps}
            activeAppId={activeEmbeddedId}
            isVisible={activeView === 'workspace'}
            onSelectApp={(id) => setActiveEmbeddedId(id)}
            onCloseApp={handleCloseEmbedded}
            onBackToCatalog={() => setActiveView('catalog')}
          />
        </main>
      </div>
    </div>
    </MotionConfig>
  );
}
