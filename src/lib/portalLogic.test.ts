import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canUserViewApp,
  classifyGoogleCalendarError,
  isValidAppUrl,
  resolveLaunchBehavior,
  sortAndFilterApps,
} from './portalLogic.ts';
import type { PortalApp, PortalUser } from '../types/portal.ts';

const baseUser: PortalUser = {
  id: 'u1',
  email: 'docente@colegio.cl',
  fullName: 'María Docente',
  role: 'docente',
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
};

const adminUser: PortalUser = {
  ...baseUser,
  id: 'u-admin',
  email: 'admin@colegio.cl',
  role: 'admin',
};

const sampleApps: PortalApp[] = [
  {
    id: 'app-1',
    slug: 'registro-escolar',
    name: 'Registro Escolar',
    description: 'Consulta de inasistencias',
    url: 'https://registroinasistencia-iota.vercel.app/',
    repositoryUrl: 'https://github.com/Hluengo/registroinasistencia',
    category: 'Gestión académica',
    icon: 'GraduationCap',
    displayOrder: 2,
    isActive: true,
    authorizedRoles: ['direccion', 'docente'],
    authorizedEmails: [],
    openMode: 'new_tab',
    xFrameOptionsDenied: false,
    preserveWorkspaceState: false,
    accessMethod: 'supabase_email_password',
    integrationStatus: 'external_auth_pending_sso',
    integrationNotes: 'Supabase Auth',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'app-2',
    slug: 'tarjetas-flow',
    name: 'Tarjetas Flow',
    description: 'Creación de tarjetas',
    url: 'https://tarjetas-flow.vercel.app/',
    repositoryUrl: 'https://github.com/Hluengo/tarjetas-flow',
    category: 'Herramientas docentes',
    icon: 'CreditCard',
    displayOrder: 1,
    isActive: true,
    authorizedRoles: ['docente'],
    authorizedEmails: [],
    openMode: 'embedded_verified',
    xFrameOptionsDenied: false,
    preserveWorkspaceState: true,
    accessMethod: 'direct_open',
    integrationStatus: 'ready_direct',
    integrationNotes: 'Keep-alive',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'app-3',
    slug: 'gestion-casos',
    name: 'Gestión de Casos',
    description: 'Expedientes de convivencia',
    url: 'https://gestiondecasos.vercel.app/',
    repositoryUrl: 'https://github.com/Hluengo/sistema-integral-convivencia-escolar',
    category: 'Convivencia escolar',
    icon: 'ShieldAlert',
    displayOrder: 4,
    isActive: true,
    authorizedRoles: ['convivencia', 'direccion'],
    authorizedEmails: ['especialista@colegio.cl'],
    openMode: 'embedded_verified',
    xFrameOptionsDenied: true,
    preserveWorkspaceState: false,
    accessMethod: 'supabase_email_password',
    integrationStatus: 'restricted_new_tab_only',
    integrationNotes: 'X-Frame-Options: DENY',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

test('isValidAppUrl accepts http/https and rejects javascript/data schemes', () => {
  assert.equal(isValidAppUrl('https://tarjetas-flow.vercel.app/'), true);
  assert.equal(isValidAppUrl('http://localhost:3000'), true);
  assert.equal(isValidAppUrl('javascript:alert(1)'), false);
  assert.equal(isValidAppUrl('data:text/html,<script>'), false);
  assert.equal(isValidAppUrl('not-a-url'), false);
});

test('canUserViewApp enforces active state, role permissions, and explicit email grants', () => {
  assert.equal(canUserViewApp(sampleApps[0], baseUser), true);
  assert.equal(canUserViewApp(sampleApps[2], baseUser), false);
  assert.equal(canUserViewApp(sampleApps[2], adminUser), true);

  const invitedUser: PortalUser = {
    ...baseUser,
    email: ' Especialista@Colegio.CL ',
  };
  assert.equal(canUserViewApp(sampleApps[2], invitedUser), true);

  const inactiveApp: PortalApp = { ...sampleApps[0], isActive: false };
  assert.equal(canUserViewApp(inactiveApp, adminUser), false);
});

test('sortAndFilterApps orders by displayOrder and filters by favorites/category/search', () => {
  const favs = new Set(['app-1']);
  const ordered = sortAndFilterApps(sampleApps, {});
  assert.deepEqual(
    ordered.map((a) => a.id),
    ['app-2', 'app-1', 'app-3']
  );

  const onlyFavs = sortAndFilterApps(sampleApps, {
    onlyFavorites: true,
    favoriteIds: favs,
  });
  assert.deepEqual(
    onlyFavs.map((a) => a.id),
    ['app-1']
  );

  const bySearch = sortAndFilterApps(sampleApps, { search: 'tarjetas' });
  assert.deepEqual(
    bySearch.map((a) => a.id),
    ['app-2']
  );
});

test('resolveLaunchBehavior enforces new_tab when xFrameOptionsDenied is true', () => {
  assert.equal(resolveLaunchBehavior(sampleApps[1]).mode, 'embedded');
  assert.equal(resolveLaunchBehavior(sampleApps[2]).mode, 'new_tab');
});

test('classifyGoogleCalendarError distinguishes expired token, 403 permission denied, and general error', () => {
  assert.equal(classifyGoogleCalendarError(401).state, 'needs_auth');
  assert.equal(classifyGoogleCalendarError(403).state, 'permission_denied');
  assert.equal(classifyGoogleCalendarError(500).state, 'error');
});
