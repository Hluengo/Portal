import type { PortalApp, PortalUser, UserRole } from '../types/portal.ts';

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  direccion: 'Dirección / UTP',
  docente: 'Docente',
  convivencia: 'Convivencia Escolar',
  pie: 'PIE / Neurodiversidad',
};

export function isValidAppUrl(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  try {
    const parsed = new URL(rawUrl.trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const SAFE_AVATAR_DATA_URL_RE =
  /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

export function isSafeAvatarDataUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  if (url.length > 480_000) return false;
  return SAFE_AVATAR_DATA_URL_RE.test(url);
}

export function getUserInitials(fullName: string): string {
  const parts = fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function canUserViewApp(app: PortalApp, user: PortalUser | null): boolean {
  if (!user || !user.isActive) return false;
  if (!app.isActive) return false;
  if (user.role === 'admin') return true;

  const userEmail = normalizeEmail(user.email);
  const hasExplicitEmail = app.authorizedEmails.some(
    (allowed) => normalizeEmail(allowed) === userEmail
  );
  if (hasExplicitEmail) return true;

  return app.authorizedRoles.includes(user.role);
}

export interface AppFilterOptions {
  category?: string;
  search?: string;
  onlyFavorites?: boolean;
  favoriteIds?: Set<string>;
}

export function sortAndFilterApps(
  apps: PortalApp[],
  options: AppFilterOptions
): PortalApp[] {
  const category = options.category?.trim() || 'Todas';
  const search = options.search?.trim().toLowerCase() || '';
  const onlyFavorites = Boolean(options.onlyFavorites);
  const favoriteIds = options.favoriteIds ?? new Set<string>();

  return [...apps]
    .filter((app) => {
      if (category !== 'Todas' && app.category !== category) return false;
      if (onlyFavorites && !favoriteIds.has(app.id)) return false;
      if (search) {
        const haystack =
          `${app.name} ${app.description} ${app.category}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (a.displayOrder !== b.displayOrder) {
        return a.displayOrder - b.displayOrder;
      }
      return a.name.localeCompare(b.name, 'es');
    });
}

export function resolveLaunchBehavior(app: PortalApp): {
  mode: 'new_tab' | 'embedded';
  reason: string;
} {
  if (app.xFrameOptionsDenied || app.openMode === 'new_tab') {
    return {
      mode: 'new_tab',
      reason: app.xFrameOptionsDenied
        ? 'Restricción X-Frame-Options: DENY en destino; apertura obligatoria en pestaña nueva.'
        : 'Configurada para abrir en pestaña nueva.',
    };
  }
  return {
    mode: 'embedded',
    reason: app.preserveWorkspaceState
      ? 'Vista integrada verificada con conservación de estado mientras trabajas.'
      : 'Vista integrada verificada dentro del portal.',
  };
}

export function classifyGoogleCalendarError(
  status: number,
  rawMessage?: string
): {
  state: 'needs_auth' | 'permission_denied' | 'error';
  title: string;
  detail: string;
} {
  if (status === 401) {
    return {
      state: 'needs_auth',
      title: 'Sesión de Google expirada o pendiente',
      detail:
        'Tu autorización temporal de Google Calendar caducó o aún no se inicia. Vuelve a conectar tu cuenta de Google para consultar eventos.',
    };
  }
  if (status === 403) {
    return {
      state: 'permission_denied',
      title: 'Permisos insuficientes en Google Calendar',
      detail:
        rawMessage ||
        'Tu cuenta de Google no tiene acceso a este calendario o rechazaste el permiso de lectura de calendarios.',
    };
  }
  return {
    state: 'error',
    title: 'Error al consultar Google Calendar',
    detail:
      rawMessage ||
      'No se pudo obtener la agenda desde Google Calendar en este momento. Revisa tu conexión e inténtalo nuevamente.',
  };
}

export function getAccessMethodLabel(method: PortalApp['accessMethod']): string {
  switch (method) {
    case 'direct_open':
      return 'Acceso directo sin inicio de sesión';
    case 'supabase_email_password':
      return 'Supabase Auth (correo y contraseña propios)';
    case 'google_workspace_oauth':
      return 'Google Workspace OAuth';
  }
}

export function getIntegrationStatusLabel(
  status: PortalApp['integrationStatus']
): string {
  switch (status) {
    case 'ready_direct':
      return 'Operativa (acceso directo)';
    case 'external_auth_pending_sso':
      return 'Auth externa · SSO pendiente';
    case 'restricted_new_tab_only':
      return 'Solo pestaña nueva (X-Frame-Options: DENY)';
    case 'requires_external_config':
      return 'Requiere configuración externa';
  }
}
