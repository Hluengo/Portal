import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import LibsqlDatabase from 'libsql';
import type {
  AccessEventType,
  AccessLogEntry,
  PortalApp,
  PortalUser,
  UserRole,
} from '../src/types/portal.ts';

/**
 * Conexión a la base de datos:
 * - Local (desarrollo): archivo SQLite en PORTAL_DB_PATH o en la raíz del proyecto.
 * - Vercel (producción): si LIBSQL_URL está definida, se usa la base remota de
 *   Turso, que conserva usuarios, sesiones y monitoreo entre peticiones.
 * `libsql` expone la misma API síncrona de better-sqlite3/node:sqlite,
 * por lo que el resto del código no cambia.
 */
const remoteUrl = (process.env.LIBSQL_URL || '').trim();
const remoteAuthToken = (process.env.LIBSQL_AUTH_TOKEN || '').trim();

const localDbPath =
  process.env.PORTAL_DB_PATH && process.env.PORTAL_DB_PATH.trim()
    ? path.resolve(process.env.PORTAL_DB_PATH.trim())
    : process.env.VERCEL && !remoteUrl
      ? // En Vercel el sistema de archivos es de solo lectura salvo /tmp.
        // Sin LIBSQL_URL los datos serían efímeros: se usa /tmp solo como
        // red de seguridad y se avisa en los logs.
        '/tmp/portal_institucional.db'
      : path.resolve(process.cwd(), 'portal_institucional.db');

if (process.env.VERCEL && !remoteUrl) {
  console.error(
    '[db] ADVERTENCIA: LIBSQL_URL no está configurada en Vercel. ' +
      'Los usuarios y el monitoreo NO persistirán entre peticiones.'
  );
}

interface SqlStatement {
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
}

interface SqlDatabase {
  prepare(sql: string): SqlStatement;
  exec(sql: string): void;
}

type LibsqlConstructor = new (
  filename: string,
  options?: { authToken?: string }
) => SqlDatabase;

const Libsql = LibsqlDatabase as unknown as LibsqlConstructor;

if (remoteUrl) {
  console.log('[db] Conectando a la base de datos remota (LIBSQL_URL).');
} else {
  fs.mkdirSync(path.dirname(localDbPath), { recursive: true });
}

export const db: SqlDatabase = remoteUrl
  ? new Libsql(remoteUrl, { authToken: remoteAuthToken })
  : new Libsql(localDbPath);

export function initDatabase(): void {
  // Los PRAGMA solo aplican a SQLite local; en la base remota de Turso se omiten.
  try {
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
  } catch (err) {
    console.warn('[db] PRAGMA omitidos:', (err as Error).message);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'direccion', 'docente', 'convivencia', 'pie')),
      avatar_url TEXT,
      password_hash TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS apps (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      url TEXT NOT NULL,
      repository_url TEXT,
      category TEXT NOT NULL,
      icon TEXT NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 100,
      is_active INTEGER NOT NULL DEFAULT 1,
      authorized_roles TEXT NOT NULL,
      authorized_emails TEXT NOT NULL,
      open_mode TEXT NOT NULL CHECK(open_mode IN ('new_tab', 'embedded_verified')),
      x_frame_options_denied INTEGER NOT NULL DEFAULT 0,
      preserve_workspace_state INTEGER NOT NULL DEFAULT 0,
      access_method TEXT NOT NULL CHECK(access_method IN ('direct_open', 'supabase_email_password', 'google_workspace_oauth')),
      integration_status TEXT NOT NULL CHECK(integration_status IN ('ready_direct', 'external_auth_pending_sso', 'restricted_new_tab_only', 'requires_external_config')),
      integration_notes TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_favorites (
      user_id TEXT NOT NULL,
      app_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, app_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS access_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      email TEXT NOT NULL,
      full_name TEXT NOT NULL,
      user_role TEXT,
      event_type TEXT NOT NULL CHECK(event_type IN ('login_success', 'login_failed', 'register', 'setup_admin', 'logout', 'app_open')),
      app_id TEXT,
      app_name TEXT,
      ip_address TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      detail TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_access_logs_created_at ON access_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_access_logs_user_id ON access_logs(user_id);
  `);

  ensureUsersAvatarColumn();
  seedDefaultApps();
  migrateTarjetasFlowDirectAccess();
}

function ensureUsersAvatarColumn(): void {
  if (usersHasColumn('avatar_url')) return;
  db.exec('ALTER TABLE users ADD COLUMN avatar_url TEXT');
}

function usersHasColumn(column: string): boolean {
  try {
    const columns = db
      .prepare('PRAGMA table_info(users)')
      .all() as Array<{ name: string }>;
    return columns.some((col) => col.name === column);
  } catch {
    // La base remota puede no admitir PRAGMA: se detecta la columna por sondeo.
    try {
      db.prepare(`SELECT ${column} FROM users LIMIT 0`).all();
      return true;
    } catch {
      return false;
    }
  }
}

function migrateTarjetasFlowDirectAccess(): void {
  db.prepare(
    `UPDATE apps
     SET open_mode = 'new_tab',
         preserve_workspace_state = 0,
         integration_notes = 'Abre directamente sin autenticación propia en nueva pestaña para editar tarjetas, cargar nóminas Excel y exportar a PDF.'
     WHERE id = 'app-tarjetas-flow'
       AND open_mode = 'embedded_verified'
       AND integration_notes LIKE '%vista montada en memoria%'`
  ).run();
}

function seedDefaultApps(): void {
  const existingCount = db
    .prepare('SELECT COUNT(*) as cnt FROM apps')
    .get() as { cnt: number };

  if (existingCount.cnt > 0) return;

  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT INTO apps (
      id, slug, name, description, url, repository_url, category, icon,
      display_order, is_active, authorized_roles, authorized_emails,
      open_mode, x_frame_options_denied, preserve_workspace_state,
      access_method, integration_status, integration_notes, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const defaults = [
    {
      id: 'app-registro-escolar',
      slug: 'registro-escolar',
      name: 'Registro Escolar',
      description:
        'Consulta de inasistencias, justificaciones, evaluaciones afectadas, pruebas atrasadas y mensajes al equipo docente.',
      url: 'https://registroinasistencia-iota.vercel.app/',
      repositoryUrl: 'https://github.com/Hluengo/registroinasistencia',
      category: 'Gestión académica',
      icon: 'GraduationCap',
      displayOrder: 1,
      isActive: 1,
      authorizedRoles: JSON.stringify([
        'admin',
        'direccion',
        'docente',
        'convivencia',
        'pie',
      ]),
      authorizedEmails: JSON.stringify([]),
      openMode: 'new_tab',
      xFrameOptionsDenied: 0,
      preserveWorkspaceState: 0,
      accessMethod: 'supabase_email_password',
      integrationStatus: 'external_auth_pending_sso',
      integrationNotes:
        'Utiliza Supabase Auth (correo y contraseña) con controles de membresía por aplicación (membershipService) y storageKey dedicado. La autorización efectiva de lectura/edición se valida en Supabase.',
    },
    {
      id: 'app-tarjetas-flow',
      slug: 'tarjetas-flow',
      name: 'Tarjetas Flow',
      description:
        'Creación de tarjetas de estudiantes, carga de nóminas desde Excel y exportación a PDF.',
      url: 'https://tarjetas-flow.vercel.app/',
      repositoryUrl: 'https://github.com/Hluengo/tarjetas-flow',
      category: 'Herramientas docentes',
      icon: 'CreditCard',
      displayOrder: 2,
      isActive: 1,
      authorizedRoles: JSON.stringify(['admin', 'direccion', 'docente', 'pie']),
      authorizedEmails: JSON.stringify([]),
      openMode: 'new_tab',
      xFrameOptionsDenied: 0,
      preserveWorkspaceState: 0,
      accessMethod: 'direct_open',
      integrationStatus: 'ready_direct',
      integrationNotes:
        'Abre directamente sin autenticación propia en nueva pestaña para editar tarjetas, cargar nóminas Excel y exportar a PDF.',
    },
    {
      id: 'app-neurodiversidad',
      slug: 'neurodiversidad-apoyo',
      name: 'Neurodiversidad y apoyo pedagógico',
      description:
        'Consulta y gestión de apoyos pedagógicos, adecuaciones curriculares y antecedentes de estudiantes.',
      url: 'https://neurodiversidad.vercel.app/',
      repositoryUrl: 'https://github.com/Hluengo/neurodiversidad',
      category: 'Inclusión y apoyo pedagógico',
      icon: 'Brain',
      displayOrder: 3,
      isActive: 1,
      authorizedRoles: JSON.stringify(['admin', 'direccion', 'pie']),
      authorizedEmails: JSON.stringify([]),
      openMode: 'new_tab',
      xFrameOptionsDenied: 0,
      preserveWorkspaceState: 0,
      accessMethod: 'supabase_email_password',
      integrationStatus: 'external_auth_pending_sso',
      integrationNotes:
        'Utiliza Supabase Auth (correo y contraseña). El portal restringe la visibilidad a perfiles autorizados (PIE, Dirección), y los datos reales dependen de las políticas RLS en Supabase.',
    },
    {
      id: 'app-gestion-casos',
      slug: 'gestion-de-casos',
      name: 'Gestión de Casos',
      description:
        'Registro de anotaciones, gestión de expedientes de convivencia escolar, seguimiento y elaboración de documentos.',
      url: 'https://gestiondecasos.vercel.app/',
      repositoryUrl:
        'https://github.com/Hluengo/sistema-integral-convivencia-escolar',
      category: 'Convivencia escolar',
      icon: 'ShieldAlert',
      displayOrder: 4,
      isActive: 1,
      authorizedRoles: JSON.stringify(['admin', 'direccion', 'convivencia']),
      authorizedEmails: JSON.stringify([]),
      openMode: 'new_tab',
      xFrameOptionsDenied: 1,
      preserveWorkspaceState: 0,
      accessMethod: 'supabase_email_password',
      integrationStatus: 'restricted_new_tab_only',
      integrationNotes:
        'Incluye cabecera X-Frame-Options: DENY y CSP estricta, por lo que abre exclusivamente en pestaña nueva. Utiliza Supabase Auth, perfiles compartidos (A01) y membresías por aplicación (ADR-0009).',
    },
  ];

  for (const app of defaults) {
    insert.run(
      app.id,
      app.slug,
      app.name,
      app.description,
      app.url,
      app.repositoryUrl,
      app.category,
      app.icon,
      app.displayOrder,
      app.isActive,
      app.authorizedRoles,
      app.authorizedEmails,
      app.openMode,
      app.xFrameOptionsDenied,
      app.preserveWorkspaceState,
      app.accessMethod,
      app.integrationStatus,
      app.integrationNotes,
      now
    );
  }
}

export function mapRowToApp(row: Record<string, unknown>): PortalApp {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    description: String(row.description),
    url: String(row.url),
    repositoryUrl: row.repository_url ? String(row.repository_url) : null,
    category: String(row.category),
    icon: String(row.icon),
    displayOrder: Number(row.display_order),
    isActive: Number(row.is_active) === 1,
    authorizedRoles: safeParseArray<UserRole>(String(row.authorized_roles)),
    authorizedEmails: safeParseArray<string>(String(row.authorized_emails)),
    openMode: row.open_mode === 'embedded_verified' ? 'embedded_verified' : 'new_tab',
    xFrameOptionsDenied: Number(row.x_frame_options_denied) === 1,
    preserveWorkspaceState: Number(row.preserve_workspace_state) === 1,
    accessMethod: row.access_method as PortalApp['accessMethod'],
    integrationStatus: row.integration_status as PortalApp['integrationStatus'],
    integrationNotes: String(row.integration_notes || ''),
    updatedAt: String(row.updated_at),
  };
}

export const activeDbPath = remoteUrl ? 'base remota (Turso)' : localDbPath;

export function mapRowToUser(row: Record<string, unknown>): PortalUser {
  return {
    id: String(row.id),
    email: String(row.email),
    fullName: String(row.full_name),
    role: row.role as UserRole,
    avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
    isActive: Number(row.is_active) === 1,
    createdAt: String(row.created_at),
  };
}

export function mapRowToAccessLog(row: Record<string, unknown>): AccessLogEntry {
  return {
    id: String(row.id),
    userId: row.user_id ? String(row.user_id) : null,
    email: String(row.email),
    fullName: String(row.full_name),
    userRole: row.user_role ? (String(row.user_role) as UserRole) : null,
    eventType: String(row.event_type) as AccessEventType,
    appId: row.app_id ? String(row.app_id) : null,
    appName: row.app_name ? String(row.app_name) : null,
    ipAddress: String(row.ip_address || ''),
    userAgent: String(row.user_agent || ''),
    detail: String(row.detail || ''),
    createdAt: String(row.created_at),
  };
}

export function recordAccessLog(entry: {
  id: string;
  userId?: string | null;
  email: string;
  fullName: string;
  userRole?: UserRole | null;
  eventType: AccessEventType;
  appId?: string | null;
  appName?: string | null;
  ipAddress?: string;
  userAgent?: string;
  detail?: string;
}): void {
  db.prepare(
    `INSERT INTO access_logs (
      id, user_id, email, full_name, user_role, event_type,
      app_id, app_name, ip_address, user_agent, detail, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    entry.id,
    entry.userId ?? null,
    entry.email.slice(0, 160),
    entry.fullName.slice(0, 120),
    entry.userRole ?? null,
    entry.eventType,
    entry.appId ?? null,
    entry.appName ? entry.appName.slice(0, 120) : null,
    (entry.ipAddress || '').slice(0, 120),
    (entry.userAgent || '').slice(0, 260),
    (entry.detail || '').slice(0, 300),
    new Date().toISOString()
  );
}

function safeParseArray<T>(raw: string): T[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
