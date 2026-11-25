import crypto from 'node:crypto';
import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import express from 'express';
import dotenv from 'dotenv';
import {
  activeDbPath,
  db,
  initDatabase,
  mapRowToAccessLog,
  mapRowToApp,
  mapRowToUser,
  recordAccessLog,
} from './server/db.ts';
import {
  clearSessionCookie,
  createSession,
  extractTokenFromRequest,
  hasClaimedAdmin,
  hashPassword,
  requireAdmin,
  requireAuth,
  revokeSession,
  setSessionCookie,
  verifyEnvAdminPasscode,
  verifyPassword,
  type AuthenticatedRequest,
} from './server/auth.ts';
import { probeAppHeadersSafe, REPOSITORY_AUDIT_REPORT } from './server/repoAudit.ts';
import {
  canUserViewApp,
  isInstitutionalEmail,
  isSafeAvatarDataUrl,
  isValidAppUrl,
  normalizeEmail,
} from './src/lib/portalLogic.ts';
import type {
  AccessEventType,
  AccessMethod,
  AdminMonitoredUser,
  ExternalIntegrationStatus,
  IntegrationStatus,
  OpenMode,
  UserRole,
} from './src/types/portal.ts';

dotenv.config();

const VALID_ROLES: ReadonlySet<UserRole> = new Set([
  'admin',
  'direccion',
  'docente',
  'convivencia',
  'pie',
]);
const VALID_OPEN_MODES: ReadonlySet<OpenMode> = new Set([
  'new_tab',
  'embedded_verified',
]);
const VALID_ACCESS_METHODS: ReadonlySet<AccessMethod> = new Set([
  'direct_open',
  'supabase_email_password',
  'google_workspace_oauth',
]);
const VALID_INTEGRATION_STATUSES: ReadonlySet<IntegrationStatus> = new Set([
  'ready_direct',
  'external_auth_pending_sso',
  'restricted_new_tab_only',
  'requires_external_config',
]);

function readFirebaseClientConfigured(): boolean {
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (!fs.existsSync(configPath)) return false;
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<
      string,
      unknown
    >;
    return Boolean(raw.apiKey && raw.projectId && raw.oAuthClientId);
  } catch {
    return false;
  }
}

function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function getRequestMetadata(req: express.Request): {
  ipAddress: string;
  userAgent: string;
} {
  const forwarded = req.headers['x-forwarded-for'];
  const rawIp = Array.isArray(forwarded)
    ? forwarded[0]
    : typeof forwarded === 'string'
    ? forwarded.split(',')[0]
    : req.ip || req.socket.remoteAddress || '';
  const ipAddress = String(rawIp).trim().slice(0, 120);
  const userAgent = String(req.headers['user-agent'] || '').trim().slice(0, 260);
  return { ipAddress, userAgent };
}

const VALID_ACCESS_EVENT_TYPES: ReadonlySet<AccessEventType> = new Set([
  'login_success',
  'login_failed',
  'register',
  'setup_admin',
  'logout',
  'app_open',
]);

async function createAppServer(): Promise<express.Express> {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));
  initDatabase();

  const ADMIN_OWNER_EMAIL = 'hluengo.ro@gmail.com';

  // Auth & Bootstrap
  app.get('/api/auth/bootstrap-status', (_req, res) => {
    const envPasscodeActive = Boolean(process.env.PORTAL_ADMIN_PASSCODE?.trim());
    const needsAdminSetup = !envPasscodeActive && !hasClaimedAdmin();
    res.json({
      needsAdminSetup,
      envPasscodeActive,
      adminEmailHint: ADMIN_OWNER_EMAIL,
    });
  });

  app.post('/api/auth/setup-admin', (req, res) => {
    const envPasscodeActive = Boolean(process.env.PORTAL_ADMIN_PASSCODE?.trim());
    if (envPasscodeActive || hasClaimedAdmin()) {
      res.status(409).json({
        error:
          'La cuenta de administración inicial ya fue configurada. Inicia sesión con tus credenciales.',
      });
      return;
    }

    const email = normalizeEmail(String(req.body?.email || ''));
    const fullName = String(req.body?.fullName || '').trim();
    const password = String(req.body?.password || '');

    if (email !== ADMIN_OWNER_EMAIL) {
      res.status(403).json({
        error:
          'Solo el correo institucional de administración inicial puede activar esta cuenta. Los demás integrantes deben registrarse como usuarios estándar.',
      });
      return;
    }

    if (fullName.length < 2 || password.length < 8) {
      res.status(400).json({
        error:
          'Ingresa un nombre válido y contraseña de al menos 8 caracteres.',
      });
      return;
    }

    const existing = db
      .prepare('SELECT id FROM users WHERE email = ?')
      .get(email) as { id: string } | undefined;

    const userId = existing?.id || `usr-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const passwordHash = hashPassword(password);

    if (existing) {
      db.prepare(
        `UPDATE users SET full_name = ?, role = 'admin', password_hash = ?, is_active = 1 WHERE id = ?`
      ).run(fullName, passwordHash, userId);
    } else {
      db.prepare(
        `INSERT INTO users (id, email, full_name, role, password_hash, is_active, created_at)
         VALUES (?, ?, ?, 'admin', ?, 1, ?)`
      ).run(userId, email, fullName, passwordHash, now);
    }

    const userRow = db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(userId) as Record<string, unknown>;
    const user = mapRowToUser(userRow);
    const { token } = createSession(user.id);
    setSessionCookie(req, res, token);

    const meta = getRequestMetadata(req);
    recordAccessLog({
      id: `log-${crypto.randomUUID()}`,
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      userRole: user.role,
      eventType: 'setup_admin',
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      detail: 'Activación inicial de cuenta administradora',
    });

    res.status(201).json({ user, token });
  });

  app.post('/api/auth/register', (req, res) => {
    const email = normalizeEmail(String(req.body?.email || ''));
    const fullName = String(req.body?.fullName || '').trim();
    const password = String(req.body?.password || '');
    const requestedRole = req.body?.role ? String(req.body.role) : null;

    if (requestedRole && requestedRole !== 'docente') {
      res.status(403).json({
        error:
          'El registro público solo permite crear cuentas de usuario estándar.',
      });
      return;
    }

    if (!email || !email.includes('@') || fullName.length < 2 || password.length < 8) {
      res.status(400).json({
        error:
          'Ingresa tu nombre completo, correo institucional válido y contraseña (mínimo 8 caracteres).',
      });
      return;
    }
    if (!isInstitutionalEmail(email)) {
      res.status(400).json({
        error:
          'El registro está limitado a correos institucionales @mmddconcepcion.cl.',
      });
      return;
    }

    const existing = db
      .prepare('SELECT id FROM users WHERE email = ?')
      .get(email) as { id: string } | undefined;
    if (existing) {
      res.status(409).json({
        error: 'Ya existe una cuenta registrada con ese correo institucional.',
      });
      return;
    }

    const userId = `usr-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const passwordHash = hashPassword(password);
    // Public self-registration always assigns standard 'docente' user role (never admin)
    db.prepare(
      `INSERT INTO users (id, email, full_name, role, password_hash, is_active, created_at)
       VALUES (?, ?, ?, 'docente', ?, 1, ?)`
    ).run(userId, email, fullName, passwordHash, now);

    const userRow = db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(userId) as Record<string, unknown>;
    const user = mapRowToUser(userRow);
    const { token } = createSession(user.id);
    setSessionCookie(req, res, token);

    const meta = getRequestMetadata(req);
    recordAccessLog({
      id: `log-${crypto.randomUUID()}`,
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      userRole: user.role,
      eventType: 'register',
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      detail: 'Registro público de nuevo usuario',
    });

    res.status(201).json({ user, token });
  });

  app.post('/api/auth/login', (req, res) => {
    const email = normalizeEmail(String(req.body?.email || ''));
    const password = String(req.body?.password || '');
    const meta = getRequestMetadata(req);

    if (!email || !password) {
      res.status(400).json({ error: 'Ingresa tu correo y contraseña.' });
      return;
    }

    const row = db
      .prepare('SELECT * FROM users WHERE email = ?')
      .get(email) as Record<string, unknown> | undefined;

    // Support env-configured PORTAL_ADMIN_PASSCODE override for admin account
    if (verifyEnvAdminPasscode(password)) {
      if (row && row.role === 'admin') {
        if (Number(row.is_active) !== 1) {
          recordAccessLog({
            id: `log-${crypto.randomUUID()}`,
            userId: String(row.id),
            email,
            fullName: String(row.full_name || email),
            userRole: String(row.role) as UserRole,
            eventType: 'login_failed',
            ipAddress: meta.ipAddress,
            userAgent: meta.userAgent,
            detail: 'Cuenta administrativa inactiva',
          });
          res.status(403).json({ error: 'Cuenta desactivada.' });
          return;
        }
        const user = mapRowToUser(row);
        const { token } = createSession(user.id);
        setSessionCookie(req, res, token);
        recordAccessLog({
          id: `log-${crypto.randomUUID()}`,
          userId: user.id,
          email: user.email,
          fullName: user.fullName,
          userRole: user.role,
          eventType: 'login_success',
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          detail: 'Inicio de sesión administrativo (clave de entorno)',
        });
        res.json({ user, token });
        return;
      }
      if (!row && email === ADMIN_OWNER_EMAIL) {
        const userId = `usr-${crypto.randomUUID()}`;
        const now = new Date().toISOString();
        db.prepare(
          `INSERT INTO users (id, email, full_name, role, password_hash, is_active, created_at)
           VALUES (?, ?, 'Administrador Institucional', 'admin', NULL, 1, ?)`
        ).run(userId, email, now);
        const created = db
          .prepare('SELECT * FROM users WHERE id = ?')
          .get(userId) as Record<string, unknown>;
        const user = mapRowToUser(created);
        const { token } = createSession(user.id);
        setSessionCookie(req, res, token);
        recordAccessLog({
          id: `log-${crypto.randomUUID()}`,
          userId: user.id,
          email: user.email,
          fullName: user.fullName,
          userRole: user.role,
          eventType: 'login_success',
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          detail: 'Inicio de sesión administrativo inicial',
        });
        res.json({ user, token });
        return;
      }
    }

    if (!row || !row.password_hash) {
      recordAccessLog({
        id: `log-${crypto.randomUUID()}`,
        userId: row ? String(row.id) : null,
        email,
        fullName: row ? String(row.full_name || email) : 'Usuario no registrado',
        userRole: row ? (String(row.role) as UserRole) : null,
        eventType: 'login_failed',
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        detail: 'Correo no registrado o sin contraseña configurada',
      });
      res.status(401).json({ error: 'Credenciales institucionales inválidas.' });
      return;
    }

    const valid = verifyPassword(password, String(row.password_hash));
    if (!valid) {
      recordAccessLog({
        id: `log-${crypto.randomUUID()}`,
        userId: String(row.id),
        email,
        fullName: String(row.full_name || email),
        userRole: String(row.role) as UserRole,
        eventType: 'login_failed',
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        detail: 'Contraseña incorrecta',
      });
      res.status(401).json({ error: 'Credenciales institucionales inválidas.' });
      return;
    }

    if (Number(row.is_active) !== 1) {
      recordAccessLog({
        id: `log-${crypto.randomUUID()}`,
        userId: String(row.id),
        email,
        fullName: String(row.full_name || email),
        userRole: String(row.role) as UserRole,
        eventType: 'login_failed',
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        detail: 'Intento de acceso con cuenta inactiva',
      });
      res.status(403).json({ error: 'Tu cuenta institucional está inactiva.' });
      return;
    }

    const user = mapRowToUser(row);
    const { token } = createSession(user.id);
    setSessionCookie(req, res, token);

    recordAccessLog({
      id: `log-${crypto.randomUUID()}`,
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      userRole: user.role,
      eventType: 'login_success',
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      detail: 'Ingreso institucional al portal',
    });

    res.json({ user, token });
  });

  app.post('/api/auth/logout', (req, res) => {
    const { token } = extractTokenFromRequest(req);
    if (token) {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const userRow = db
        .prepare(
          `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`
        )
        .get(tokenHash) as Record<string, unknown> | undefined;
      if (userRow) {
        const meta = getRequestMetadata(req);
        const user = mapRowToUser(userRow);
        recordAccessLog({
          id: `log-${crypto.randomUUID()}`,
          userId: user.id,
          email: user.email,
          fullName: user.fullName,
          userRole: user.role,
          eventType: 'logout',
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          detail: 'Cierre de sesión en el portal',
        });
      }
      revokeSession(token);
    }
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    res.json({ user: req.portalUser });
  });

  app.put('/api/profile', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = req.portalUser!;
    const fullName =
      typeof req.body?.fullName === 'string'
        ? req.body.fullName.trim()
        : user.fullName;

    if (fullName.length < 2 || fullName.length > 120) {
      res.status(400).json({
        error: 'El nombre completo debe tener entre 2 y 120 caracteres.',
      });
      return;
    }

    let nextAvatarUrl: string | null = user.avatarUrl ?? null;
    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'avatarUrl')) {
      const rawAvatar = req.body.avatarUrl;
      if (rawAvatar === null || rawAvatar === '') {
        nextAvatarUrl = null;
      } else if (typeof rawAvatar === 'string' && isSafeAvatarDataUrl(rawAvatar)) {
        nextAvatarUrl = rawAvatar;
      } else {
        res.status(400).json({
          error:
            'La imagen de perfil debe ser PNG, JPG o WEBP válida y pesar menos de 350 KB.',
        });
        return;
      }
    }

    let nextFavoriteIds: string[] | null = null;
    if (Array.isArray(req.body?.favoriteAppIds)) {
      const candidateIds: string[] = Array.from(
        new Set<string>(
          req.body.favoriteAppIds
            .map((id: unknown) => String(id || '').trim())
            .filter((id: string) => id.length > 0)
        )
      );
      const appRows = db
        .prepare('SELECT * FROM apps')
        .all() as Record<string, unknown>[];
      const allowedAppMap = new Map<string, ReturnType<typeof mapRowToApp>>();
      for (const row of appRows) {
        const mapped = mapRowToApp(row);
        if (canUserViewApp(mapped, user)) {
          allowedAppMap.set(mapped.id, mapped);
        }
      }
      for (const appId of candidateIds) {
        if (!allowedAppMap.has(appId)) {
          res.status(403).json({
            error:
              'Una de las aplicaciones seleccionadas no existe o no está autorizada para tu perfil.',
          });
          return;
        }
      }
      nextFavoriteIds = candidateIds;
    }

    const now = new Date().toISOString();
    db.exec('BEGIN');
    try {
      db.prepare('UPDATE users SET full_name = ?, avatar_url = ? WHERE id = ?').run(
        fullName,
        nextAvatarUrl,
        user.id
      );

      if (nextFavoriteIds !== null) {
        db.prepare('DELETE FROM user_favorites WHERE user_id = ?').run(user.id);
        const insertFav = db.prepare(
          'INSERT INTO user_favorites (user_id, app_id, created_at) VALUES (?, ?, ?)'
        );
        for (const appId of nextFavoriteIds) {
          insertFav.run(user.id, appId, now);
        }
      }

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    const updatedRow = db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(user.id) as Record<string, unknown>;
    const favRows = db
      .prepare('SELECT app_id FROM user_favorites WHERE user_id = ?')
      .all(user.id) as { app_id: string }[];

    res.json({
      user: mapRowToUser(updatedRow),
      favoriteIds: favRows.map((r) => r.app_id),
    });
  });

  app.get('/api/auth/session', (req, res) => {
    const { token } = extractTokenFromRequest(req);
    if (!token) {
      res.json({ authenticated: false, user: null });
      return;
    }
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const row = db
      .prepare(
        `SELECT u.*, s.expires_at
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ?`
      )
      .get(tokenHash) as Record<string, unknown> | undefined;

    if (!row) {
      res.json({ authenticated: false, user: null });
      return;
    }
    const expiresAt = Date.parse(String(row.expires_at));
    if (Number.isNaN(expiresAt) || expiresAt < Date.now() || Number(row.is_active) !== 1) {
      res.json({ authenticated: false, user: null });
      return;
    }
    res.json({ authenticated: true, user: mapRowToUser(row) });
  });

  // Catalog & Favorites (Authenticated users)
  app.get('/api/apps', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = req.portalUser!;
    const rows = db
      .prepare('SELECT * FROM apps ORDER BY display_order ASC, name ASC')
      .all() as Record<string, unknown>[];

    const favRows = db
      .prepare('SELECT app_id FROM user_favorites WHERE user_id = ?')
      .all(user.id) as { app_id: string }[];
    const favSet = new Set(favRows.map((r) => r.app_id));

    const visibleApps = rows
      .map(mapRowToApp)
      .filter((item) => canUserViewApp(item, user))
      .map((item) => ({
        ...item,
        isFavorite: favSet.has(item.id),
      }));

    res.json({
      apps: visibleApps,
      favoriteIds: Array.from(favSet),
    });
  });

  app.post('/api/favorites/toggle', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = req.portalUser!;
    const appId = String(req.body?.appId || '').trim();
    if (!appId) {
      res.status(400).json({ error: 'Identificador de aplicación requerido.' });
      return;
    }

    const appRow = db
      .prepare('SELECT * FROM apps WHERE id = ?')
      .get(appId) as Record<string, unknown> | undefined;
    if (!appRow) {
      res.status(404).json({ error: 'Aplicación no encontrada.' });
      return;
    }

    const portalApp = mapRowToApp(appRow);
    if (!canUserViewApp(portalApp, user)) {
      res.status(403).json({
        error: 'No tienes autorización para agregar esta aplicación a favoritos.',
      });
      return;
    }

    const existing = db
      .prepare('SELECT 1 FROM user_favorites WHERE user_id = ? AND app_id = ?')
      .get(user.id, appId);

    let isFavorite = false;
    if (existing) {
      db.prepare('DELETE FROM user_favorites WHERE user_id = ? AND app_id = ?').run(
        user.id,
        appId
      );
      isFavorite = false;
    } else {
      db.prepare(
        'INSERT INTO user_favorites (user_id, app_id, created_at) VALUES (?, ?, ?)'
      ).run(user.id, appId, new Date().toISOString());
      isFavorite = true;
    }

    const favRows = db
      .prepare('SELECT app_id FROM user_favorites WHERE user_id = ?')
      .all(user.id) as { app_id: string }[];

    res.json({
      appId,
      isFavorite,
      favoriteIds: favRows.map((r) => r.app_id),
    });
  });

  // SSO Audit & Real External Integration Status
  app.get('/api/sso-audit', requireAuth, (_req, res) => {
    res.json({ audit: REPOSITORY_AUDIT_REPORT });
  });

  app.get('/api/integrations/status', requireAuth, async (_req, res) => {
    const oauthConfigured = readFirebaseClientConfigured();
    const appRows = db
      .prepare('SELECT * FROM apps ORDER BY display_order ASC')
      .all() as Record<string, unknown>[];
    const apps = appRows.map(mapRowToApp);

    const probeResults = await Promise.all(
      apps.map(async (item) => ({
        app: item,
        probe: await probeAppHeadersSafe(item),
      }))
    );

    const integrations: ExternalIntegrationStatus[] = [
      {
        id: 'ext-google-calendar',
        name: 'Google Calendar (Agenda compartida)',
        category: 'Google Workspace',
        requiresExternalConfig: true,
        status: oauthConfigured ? 'pending_config' : 'error',
        statusLabel: oauthConfigured
          ? 'OAuth habilitado · Requiere conexión por usuario'
          : 'Configuración externa faltante',
        detail: oauthConfigured
          ? 'La configuración OAuth del proyecto está lista (scope calendar.readonly). Cada usuario debe autorizar su cuenta con Google en la pestaña Calendario para visualizar sus eventos y descripciones.'
          : 'Falta configuración de Firebase/OAuth para Google Calendar.',
      },
      {
        id: 'ext-gmail',
        name: 'Gmail Institucional (Correo)',
        category: 'Google Workspace',
        requiresExternalConfig: false,
        status: 'ready',
        statusLabel: 'Acceso directo a Gmail',
        detail:
          'El acceso rápido de correo dirige directamente a https://mail.google.com/ en pestaña nueva, respetando la sesión Google activa del usuario.',
        url: 'https://mail.google.com/',
      },
      ...probeResults.map(({ app: item, probe }): ExternalIntegrationStatus => {
        const hasDenyHeader =
          Boolean(probe.xFrameOptions?.toUpperCase().includes('DENY')) ||
          item.xFrameOptionsDenied;

        let status: ExternalIntegrationStatus['status'] = 'ready';
        let statusLabel = 'Operativa';
        if (probe.httpStatus && !probe.reachable) {
          status = 'error';
          statusLabel = `Respuesta HTTP ${probe.httpStatus}`;
        } else if (hasDenyHeader) {
          status = 'restricted';
          statusLabel = 'Solo pestaña nueva (X-Frame-Options: DENY)';
        } else if (item.accessMethod === 'supabase_email_password') {
          status = 'pending_config';
          statusLabel = 'Auth Supabase propia · SSO pendiente';
        } else if (item.integrationStatus === 'requires_external_config') {
          status = 'pending_config';
          statusLabel = 'Requiere configuración externa';
        }

        return {
          id: item.id,
          name: item.name,
          category: item.category,
          requiresExternalConfig: item.accessMethod !== 'direct_open',
          status,
          statusLabel,
          detail: item.integrationNotes,
          url: item.url,
          xFrameOptions: probe.xFrameOptions,
          httpReachable: probe.reachable,
        };
      }),
    ];

    res.json({ integrations });
  });

  // Admin Catalog CRUD (Protected both in UI and strictly on Server)
  app.get('/api/admin/apps', requireAuth, requireAdmin, (_req, res) => {
    const rows = db
      .prepare('SELECT * FROM apps ORDER BY display_order ASC, name ASC')
      .all() as Record<string, unknown>[];
    res.json({ apps: rows.map(mapRowToApp) });
  });

  app.post('/api/admin/apps', requireAuth, requireAdmin, (req, res) => {
    const payload = parseAndValidateAppInput(req.body);
    if ('error' in payload) {
      res.status(400).json({ error: payload.error });
      return;
    }

    const id = `app-${crypto.randomUUID()}`;
    const baseSlug = slugify(payload.name) || 'plataforma';
    const slug = `${baseSlug}-${crypto.randomBytes(2).toString('hex')}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO apps (
        id, slug, name, description, url, repository_url, category, icon,
        display_order, is_active, authorized_roles, authorized_emails,
        open_mode, x_frame_options_denied, preserve_workspace_state,
        access_method, integration_status, integration_notes, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      slug,
      payload.name,
      payload.description,
      payload.url,
      payload.repositoryUrl,
      payload.category,
      payload.icon,
      payload.displayOrder,
      payload.isActive ? 1 : 0,
      JSON.stringify(payload.authorizedRoles),
      JSON.stringify(payload.authorizedEmails),
      payload.openMode,
      payload.xFrameOptionsDenied ? 1 : 0,
      payload.preserveWorkspaceState ? 1 : 0,
      payload.accessMethod,
      payload.integrationStatus,
      payload.integrationNotes,
      now
    );

    const created = db
      .prepare('SELECT * FROM apps WHERE id = ?')
      .get(id) as Record<string, unknown>;
    res.status(201).json({ app: mapRowToApp(created) });
  });

  app.put('/api/admin/apps/:id', requireAuth, requireAdmin, (req, res) => {
    const appId = String(req.params.id || '').trim();
    const existing = db
      .prepare('SELECT * FROM apps WHERE id = ?')
      .get(appId) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Aplicación no encontrada.' });
      return;
    }

    const payload = parseAndValidateAppInput(req.body);
    if ('error' in payload) {
      res.status(400).json({ error: payload.error });
      return;
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE apps SET
        name = ?,
        description = ?,
        url = ?,
        repository_url = ?,
        category = ?,
        icon = ?,
        display_order = ?,
        is_active = ?,
        authorized_roles = ?,
        authorized_emails = ?,
        open_mode = ?,
        x_frame_options_denied = ?,
        preserve_workspace_state = ?,
        access_method = ?,
        integration_status = ?,
        integration_notes = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      payload.name,
      payload.description,
      payload.url,
      payload.repositoryUrl,
      payload.category,
      payload.icon,
      payload.displayOrder,
      payload.isActive ? 1 : 0,
      JSON.stringify(payload.authorizedRoles),
      JSON.stringify(payload.authorizedEmails),
      payload.openMode,
      payload.xFrameOptionsDenied ? 1 : 0,
      payload.preserveWorkspaceState ? 1 : 0,
      payload.accessMethod,
      payload.integrationStatus,
      payload.integrationNotes,
      now,
      appId
    );

    const updated = db
      .prepare('SELECT * FROM apps WHERE id = ?')
      .get(appId) as Record<string, unknown>;
    res.json({ app: mapRowToApp(updated) });
  });

  app.delete('/api/admin/apps/:id', requireAuth, requireAdmin, (req, res) => {
    const appId = String(req.params.id || '').trim();
    const result = db.prepare('DELETE FROM apps WHERE id = ?').run(appId);
    if (result.changes === 0) {
      res.status(404).json({ error: 'Aplicación no encontrada.' });
      return;
    }
    res.json({ ok: true });
  });

  // Authenticated platform launch tracking
  app.post('/api/access-events', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = req.portalUser!;
    const rawAppId = String(req.body?.appId || '').trim();
    const launchMode = String(req.body?.launchMode || '').trim();
    const meta = getRequestMetadata(req);

    let resolvedAppId: string | null = null;
    let resolvedAppName = '';
    let detail = '';

    if (rawAppId === 'ext-gmail') {
      resolvedAppId = 'ext-gmail';
      resolvedAppName = 'Correo institucional (Gmail)';
      detail = 'Apertura en nueva pestaña';
    } else if (rawAppId === 'ext-google-calendar') {
      resolvedAppId = 'ext-google-calendar';
      resolvedAppName = 'Calendario compartido';
      detail = 'Ingreso a agenda de Google Workspace';
    } else if (rawAppId) {
      const appRow = db
        .prepare('SELECT * FROM apps WHERE id = ?')
        .get(rawAppId) as Record<string, unknown> | undefined;
      if (!appRow) {
        res.status(404).json({ error: 'Aplicación no encontrada.' });
        return;
      }
      const portalApp = mapRowToApp(appRow);
      if (!canUserViewApp(portalApp, user)) {
        res.status(403).json({ error: 'Acceso no autorizado a esta plataforma.' });
        return;
      }
      resolvedAppId = portalApp.id;
      resolvedAppName = portalApp.name;
      detail =
        launchMode === 'embedded'
          ? 'Apertura en vista integrada'
          : 'Apertura en nueva pestaña';
    } else {
      res.status(400).json({ error: 'Identificador de plataforma requerido.' });
      return;
    }

    recordAccessLog({
      id: `log-${crypto.randomUUID()}`,
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      userRole: user.role,
      eventType: 'app_open',
      appId: resolvedAppId,
      appName: resolvedAppName,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      detail,
    });

    res.status(201).json({ ok: true });
  });

  // Admin Monitoring & Registered Users Overview (Protected on UI and Server)
  app.get('/api/admin/monitoring', requireAuth, requireAdmin, (req, res) => {
    const eventTypeFilter = String(req.query.eventType || '').trim();
    const userIdFilter = String(req.query.userId || '').trim();
    const searchFilter = String(req.query.search || '').trim().toLowerCase();
    const limit = Math.max(
      10,
      Math.min(250, Number(req.query.limit) || 150)
    );

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayIso = startOfToday.toISOString();
    const nowIso = new Date().toISOString();

    const userStatsRows = db
      .prepare(
        `SELECT
          u.*,
          (SELECT COUNT(*) FROM access_logs l WHERE l.user_id = u.id) AS access_count,
          (SELECT MAX(l.created_at) FROM access_logs l WHERE l.user_id = u.id) AS last_access_at,
          (SELECT l.event_type FROM access_logs l WHERE l.user_id = u.id ORDER BY l.created_at DESC LIMIT 1) AS last_event_type,
          (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > ?) AS active_sessions
        FROM users u
        ORDER BY u.created_at DESC`
      )
      .all(nowIso) as Record<string, unknown>[];

    const users: AdminMonitoredUser[] = userStatsRows.map((row) => ({
      ...mapRowToUser(row),
      accessCount: Number(row.access_count || 0),
      lastAccessAt: row.last_access_at ? String(row.last_access_at) : null,
      lastEventType: row.last_event_type
        ? (String(row.last_event_type) as AccessEventType)
        : null,
      activeSessions: Number(row.active_sessions || 0),
    }));

    const whereClauses: string[] = [];
    const params: Array<string | number> = [];

    if (
      eventTypeFilter &&
      VALID_ACCESS_EVENT_TYPES.has(eventTypeFilter as AccessEventType)
    ) {
      whereClauses.push('event_type = ?');
      params.push(eventTypeFilter);
    }

    if (userIdFilter) {
      whereClauses.push('user_id = ?');
      params.push(userIdFilter);
    }

    if (searchFilter) {
      whereClauses.push(
        `(LOWER(email) LIKE ? OR LOWER(full_name) LIKE ? OR LOWER(COALESCE(app_name, '')) LIKE ? OR LOWER(ip_address) LIKE ? OR LOWER(detail) LIKE ?)`
      );
      const pattern = `%${searchFilter}%`;
      params.push(pattern, pattern, pattern, pattern, pattern);
    }

    const whereSql =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const logRows = db
      .prepare(
        `SELECT * FROM access_logs ${whereSql} ORDER BY created_at DESC LIMIT ?`
      )
      .all(...params, limit) as Record<string, unknown>[];

    const todayCounts = db
      .prepare(
        `SELECT
          SUM(CASE WHEN event_type = 'login_success' THEN 1 ELSE 0 END) AS logins_today,
          SUM(CASE WHEN event_type = 'app_open' THEN 1 ELSE 0 END) AS app_opens_today,
          SUM(CASE WHEN event_type = 'login_failed' THEN 1 ELSE 0 END) AS failed_logins_today
        FROM access_logs
        WHERE created_at >= ?`
      )
      .get(todayIso) as Record<string, unknown>;

    const activeSessionsRow = db
      .prepare(`SELECT COUNT(*) AS cnt FROM sessions WHERE expires_at > ?`)
      .get(nowIso) as { cnt: number };

    res.json({
      summary: {
        totalUsers: users.length,
        activeUsers: users.filter((u) => u.isActive).length,
        activeSessions: Number(activeSessionsRow?.cnt || 0),
        loginsToday: Number(todayCounts?.logins_today || 0),
        appOpensToday: Number(todayCounts?.app_opens_today || 0),
        failedLoginsToday: Number(todayCounts?.failed_logins_today || 0),
      },
      users,
      logs: logRows.map(mapRowToAccessLog),
      dbPath: activeDbPath,
    });
  });

  // Admin Users & Roles CRUD
  app.get('/api/admin/users', requireAuth, requireAdmin, (_req, res) => {
    const rows = db
      .prepare('SELECT * FROM users ORDER BY created_at ASC')
      .all() as Record<string, unknown>[];
    res.json({ users: rows.map(mapRowToUser) });
  });

  app.post('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
    const email = normalizeEmail(String(req.body?.email || ''));
    const fullName = String(req.body?.fullName || '').trim();
    const role = String(req.body?.role || 'docente') as UserRole;
    const password = String(req.body?.password || '');

    if (
      !email ||
      !email.includes('@') ||
      fullName.length < 2 ||
      !VALID_ROLES.has(role) ||
      password.length < 8
    ) {
      res.status(400).json({
        error:
          'Datos inválidos: requiere nombre, correo válido, rol permitido y contraseña de al menos 8 caracteres.',
      });
      return;
    }
    if (!isInstitutionalEmail(email) && role !== 'admin') {
      res.status(400).json({
        error:
          'Los usuarios institucionales deben usar un correo @mmddconcepcion.cl.',
      });
      return;
    }

    const existing = db
      .prepare('SELECT id FROM users WHERE email = ?')
      .get(email);
    if (existing) {
      res.status(409).json({ error: 'Ya existe un usuario con ese correo.' });
      return;
    }

    const id = `usr-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const passwordHash = hashPassword(password);
    db.prepare(
      `INSERT INTO users (id, email, full_name, role, password_hash, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?)`
    ).run(id, email, fullName, role, passwordHash, now);

    const created = db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(id) as Record<string, unknown>;
    res.status(201).json({ user: mapRowToUser(created) });
  });

  app.put('/api/admin/users/:id', requireAuth, requireAdmin, (req: AuthenticatedRequest, res) => {
    const userId = String(req.params.id || '').trim();
    const existing = db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(userId) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Usuario no encontrado.' });
      return;
    }

    const role = String(req.body?.role || existing.role) as UserRole;
    const isActive =
      typeof req.body?.isActive === 'boolean'
        ? req.body.isActive
        : Number(existing.is_active) === 1;

    if (!VALID_ROLES.has(role)) {
      res.status(400).json({ error: 'Rol inválido.' });
      return;
    }

    if (req.portalUser!.id === userId && (!isActive || role !== 'admin')) {
      res.status(400).json({
        error: 'No puedes desactivar o quitar el rol de administrador a tu propia sesión.',
      });
      return;
    }

    db.prepare('UPDATE users SET role = ?, is_active = ? WHERE id = ?').run(
      role,
      isActive ? 1 : 0,
      userId
    );

    const updated = db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(userId) as Record<string, unknown>;
    res.json({ user: mapRowToUser(updated) });
  });

  // Frontend serving (Vite dev middleware or static dist/)
  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    const indexHtml = path.join(distDir, 'index.html');
    if (fs.existsSync(indexHtml)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(indexHtml);
      });
    } else {
      // En Vercel los archivos estáticos los sirve el CDN desde outputDirectory.
      app.get('*', (_req, res) => {
        res.status(404).json({ error: 'Ruta no encontrada.' });
      });
    }
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  // Manejador de errores explícito (recomendado para Vercel Functions).
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      console.error('Error no controlado en el portal:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error interno del servidor.' });
      }
    }
  );

  return app;
}

function parseAndValidateAppInput(body: Record<string, unknown>):
  | {
      name: string;
      description: string;
      url: string;
      repositoryUrl: string | null;
      category: string;
      icon: string;
      displayOrder: number;
      isActive: boolean;
      authorizedRoles: UserRole[];
      authorizedEmails: string[];
      openMode: OpenMode;
      xFrameOptionsDenied: boolean;
      preserveWorkspaceState: boolean;
      accessMethod: AccessMethod;
      integrationStatus: IntegrationStatus;
      integrationNotes: string;
    }
  | { error: string } {
  const name = String(body?.name || '').trim();
  const description = String(body?.description || '').trim();
  const url = String(body?.url || '').trim();
  const rawRepo = String(body?.repositoryUrl || '').trim();
  const category = String(body?.category || '').trim();
  const icon = String(body?.icon || 'Globe').trim();
  const displayOrder = Number.isFinite(Number(body?.displayOrder))
    ? Math.max(0, Math.min(9999, Math.round(Number(body?.displayOrder))))
    : 100;
  const isActive = body?.isActive !== false;

  if (name.length < 2 || name.length > 120) {
    return { error: 'El nombre de la plataforma debe tener entre 2 y 120 caracteres.' };
  }
  if (description.length < 4 || description.length > 500) {
    return { error: 'La descripción debe tener entre 4 y 500 caracteres.' };
  }
  if (!isValidAppUrl(url)) {
    return { error: 'La URL debe ser válida y comenzar con https:// o http://.' };
  }
  if (rawRepo && !isValidAppUrl(rawRepo)) {
    return { error: 'La URL del repositorio debe comenzar con https:// o http://.' };
  }
  if (category.length < 2 || category.length > 80) {
    return { error: 'La categoría es obligatoria.' };
  }

  const rawRoles = Array.isArray(body?.authorizedRoles) ? body.authorizedRoles : [];
  const authorizedRoles = rawRoles.filter((r): r is UserRole =>
    VALID_ROLES.has(String(r) as UserRole)
  );
  if (!authorizedRoles.includes('admin')) {
    authorizedRoles.unshift('admin');
  }

  const rawEmails = Array.isArray(body?.authorizedEmails)
    ? body.authorizedEmails
    : [];
  const authorizedEmails = Array.from(
    new Set(
      rawEmails
        .map((e) => normalizeEmail(String(e)))
        .filter((e) => e.includes('@'))
    )
  );

  const xFrameOptionsDenied = Boolean(body?.xFrameOptionsDenied);
  let openMode = String(body?.openMode || 'new_tab') as OpenMode;
  if (!VALID_OPEN_MODES.has(openMode)) openMode = 'new_tab';
  if (xFrameOptionsDenied) openMode = 'new_tab';

  const preserveWorkspaceState =
    openMode === 'embedded_verified' && Boolean(body?.preserveWorkspaceState);

  const accessMethod = String(body?.accessMethod || 'direct_open') as AccessMethod;
  if (!VALID_ACCESS_METHODS.has(accessMethod)) {
    return { error: 'Método de acceso inválido.' };
  }

  let integrationStatus = String(
    body?.integrationStatus || 'ready_direct'
  ) as IntegrationStatus;
  if (!VALID_INTEGRATION_STATUSES.has(integrationStatus)) {
    return { error: 'Estado de integración inválido.' };
  }
  if (xFrameOptionsDenied) {
    integrationStatus = 'restricted_new_tab_only';
  }

  const integrationNotes = String(body?.integrationNotes || '').trim().slice(0, 600);

  return {
    name,
    description,
    url,
    repositoryUrl: rawRepo || null,
    category,
    icon: icon || 'Globe',
    displayOrder,
    isActive,
    authorizedRoles,
    authorizedEmails,
    openMode,
    xFrameOptionsDenied,
    preserveWorkspaceState,
    accessMethod,
    integrationStatus,
    integrationNotes,
  };
}

let appPromise: Promise<express.Express> | null = null;

function getPortalApp(): Promise<express.Express> {
  if (!appPromise) {
    appPromise = createAppServer();
  }
  return appPromise;
}

// En Vercel la app se exporta como función serverless (se invoca por petición);
// en local se levanta el servidor Express tradicional en el puerto indicado.
async function requestHandler(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const app = await getPortalApp();
  (app as unknown as (req: IncomingMessage, res: ServerResponse) => void)(
    req,
    res
  );
}

if (!process.env.VERCEL) {
  getPortalApp()
    .then((app) => {
      const port = Number(process.env.PORT || 3000);
      app.listen(port, '0.0.0.0', () => {
        console.log(
          `Portal Institucional Escolar escuchando en http://0.0.0.0:${port}`
        );
      });
    })
    .catch((err) => {
      console.error('Error iniciando el servidor del portal:', err);
      process.exit(1);
    });
}

export default requestHandler;
