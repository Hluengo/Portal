import type { PortalApp, RepoAuditItem } from '../src/types/portal.ts';

export const REPOSITORY_AUDIT_REPORT: RepoAuditItem[] = [
  {
    appName: 'Registro Escolar',
    repoUrl: 'https://github.com/Hluengo/registroinasistencia',
    liveUrl: 'https://registroinasistencia-iota.vercel.app/',
    authStack:
      'React + Vite + Supabase Auth (signInWithPassword, storageKey: "registroinasistencia-auth-token")',
    membershipMechanism:
      'Servicio membershipService.ts (getMyMembership(applicationCode) controlado por VITE_APP_MEMBERSHIPS_ENABLED en modos legacy, transition y active), además de tenantId y role/appRole.',
    framingConstraint:
      'Sin cabecera X-Frame-Options: DENY en Vercel; sin embargo, la sesión de Supabase se almacena en el origen de la app y el ingreso único requiere unificar proveedor.',
    existingIdentitiesNotes:
      'Comparte la tabla profiles (migración A01) y definiciones de tenant con el proyecto de Convivencia Escolar. Antes de habilitar SSO, verificar qué correos institucionales coinciden entre ambas apps y el proveedor Google.',
    requiredModifications: [
      'Habilitar Google OAuth / OIDC institucional en el proyecto Supabase compartido y agregar botón de ingreso con Google o token exchange oficial en src/hooks/useAuth.ts.',
      'Mantener la verificación de membresía activa en membershipService.ts (VITE_APP_MEMBERSHIPS_ENABLED=true) sin depender del rol del portal para autorizar consultas o mutaciones.',
      'Conservar la compatibilidad de la tabla profiles (A01) coordinadamente con Gestión de Casos.',
    ],
  },
  {
    appName: 'Tarjetas Flow',
    repoUrl: 'https://github.com/Hluengo/tarjetas-flow',
    liveUrl: 'https://tarjetas-flow.vercel.app/',
    authStack:
      'SPA React + Vite sin autenticación actual; estado completo en memoria de React (DEFAULT_STUDENTS, DEFAULT_TEACHERS, SchoolConfig, PageConfig).',
    membershipMechanism:
      'Sin control de membresía ni base de datos propia; orientada a edición inmediata, carga de Excel y exportación PDF.',
    framingConstraint:
      'Sin restricciones de marco; configurada para apertura por acceso directo en pestaña dedicada para edición continua sin recargas del portal.',
    existingIdentitiesNotes:
      'No gestiona identidades ni credenciales actualmente. Opera como herramienta de acceso directo para usuarios autenticados en el portal.',
    requiredModifications: [
      'Opcionalmente, si en el futuro se desea restringir su acceso directo por URL pública, incorporar validación de sesión institucional o despliegue privado.',
      'Mantener persistencia local o sincronización opcional de plantillas por docente si se agrega backend.',
    ],
  },
  {
    appName: 'Neurodiversidad y apoyo pedagógico',
    repoUrl: 'https://github.com/Hluengo/neurodiversidad',
    liveUrl: 'https://neurodiversidad.vercel.app/',
    authStack:
      'React + Vite + Supabase Auth (src/supabase.ts usando VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY).',
    membershipMechanism:
      'Verificación de administrador mediante comparación literal de correo en frontend ("hluengo.ro@gmail.com") y respaldo local cuando falta configuración Supabase; datos sensibles en tabla students protegidos por RLS.',
    framingConstraint:
      'Permite marco embebido a nivel HTTP, aunque la autenticación Supabase propia se gestiona mejor en pestaña nueva hasta unificar el proveedor OAuth.',
    existingIdentitiesNotes:
      'Contiene antecedentes sensibles de estudiantes y diagnósticos PIE. No debe exponer datos ni asumir permisos por el solo hecho de mostrar el enlace en el portal.',
    requiredModifications: [
      'Reemplazar la verificación literal de correo administrador en src/App.tsx por roles/membresías explícitas en Supabase (tabla de membresías por aplicación y políticas RLS).',
      'Habilitar proveedor Google Workspace en su proyecto Supabase para permitir ingreso único respetando las cuentas autorizadas del equipo PIE y Dirección.',
      'Garantizar que cualquier consulta de antecedentes desde el portal o API externa utilice la sesión autenticada del usuario y sus políticas RLS.',
    ],
  },
  {
    appName: 'Gestión de Casos',
    repoUrl: 'https://github.com/Hluengo/sistema-integral-convivencia-escolar',
    liveUrl: 'https://gestiondecasos.vercel.app/',
    authStack:
      'React + API dual Express/Vercel + Supabase Auth (JWT HS256/ES256 validado en middleware requireAuth e inyección de tenant_id desde profiles).',
    membershipMechanism:
      'ADR-0009: Autorización estricta por membresía activa de "convivencia" (current_convivencia_role()), aplicación activa y perfil activo del mismo establecimiento.',
    framingConstraint:
      'Configura X-Frame-Options: DENY y Content-Security-Policy estricta. Debe abrirse exclusivamente en una pestaña nueva del navegador.',
    existingIdentitiesNotes:
      'Comparte proyecto/esquema de perfiles (A01) con Registro Escolar; un usuario docente puede tener permisos distintos en Convivencia respecto de Inasistencias.',
    requiredModifications: [
      'Habilitar el mismo proveedor OAuth/OIDC en Supabase Auth manteniendo intacta la validación de membresía de ADR-0009 (no sustituir current_convivencia_role() por permisos del portal).',
      'Mantener X-Frame-Options: DENY por seguridad de expedientes de convivencia escolar.',
      'Validar antes del despliegue de SSO que la migración compartida A01 y las membresías activas de cada perfil estén sincronizadas.',
    ],
  },
];

function isPrivateOrLocalHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (
    lower === 'localhost' ||
    lower === '127.0.0.1' ||
    lower === '::1' ||
    lower.endsWith('.local')
  ) {
    return true;
  }
  const ipv4Match = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(lower);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

export async function probeAppHeadersSafe(app: PortalApp): Promise<{
  reachable: boolean;
  httpStatus: number | null;
  xFrameOptions: string | null;
  error: string | null;
}> {
  try {
    const parsed = new URL(app.url);
    if (parsed.protocol !== 'https:' || isPrivateOrLocalHostname(parsed.hostname)) {
      return {
        reachable: false,
        httpStatus: null,
        xFrameOptions: null,
        error: 'URL omitida en verificación automática (solo HTTPS público).',
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    try {
      const response = await fetch(parsed.toString(), {
        method: 'HEAD',
        redirect: 'manual',
        signal: controller.signal,
      });
      const xfo = response.headers.get('x-frame-options');
      return {
        reachable: response.status >= 200 && response.status < 400,
        httpStatus: response.status,
        xFrameOptions: xfo,
        error: null,
      };
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    return {
      reachable: false,
      httpStatus: null,
      xFrameOptions: null,
      error: err instanceof Error ? err.message : 'Error de red',
    };
  }
}
