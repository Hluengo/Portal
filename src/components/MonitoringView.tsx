import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  Download,
  RefreshCw,
  Search,
  ShieldAlert,
  UserCheck,
  Users,
} from 'lucide-react';
import { ROLE_LABELS } from '../lib/portalLogic.ts';
import { getAdminMonitoring } from '../services/api.ts';
import type {
  AccessEventType,
  AccessLogEntry,
  AdminMonitoredUser,
  MonitoringSummary,
} from '../types/portal.ts';

interface MonitoringViewProps {
  onBack?: () => void;
}

const EVENT_TYPE_LABELS: Record<AccessEventType, string> = {
  login_success: 'Ingreso al portal',
  login_failed: 'Intento fallido',
  register: 'Nuevo registro',
  setup_admin: 'Activación admin',
  logout: 'Cierre de sesión',
  app_open: 'Apertura de plataforma',
};

function formatDateDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('es-CL', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function summarizeDevice(userAgent: string): string {
  if (!userAgent) return 'Sin detalle';
  const ua = userAgent.toLowerCase();
  const browser = ua.includes('edg/')
    ? 'Edge'
    : ua.includes('chrome/')
    ? 'Chrome'
    : ua.includes('firefox/')
    ? 'Firefox'
    : ua.includes('safari/')
    ? 'Safari'
    : 'Navegador';
  const os = ua.includes('windows')
    ? 'Windows'
    : ua.includes('mac os') || ua.includes('macintosh')
    ? 'macOS'
    : ua.includes('android')
    ? 'Android'
    : ua.includes('iphone') || ua.includes('ipad')
    ? 'iOS'
    : ua.includes('linux')
    ? 'Linux'
    : 'Equipo';
  return `${browser} · ${os}`;
}

export function MonitoringView({ onBack }: MonitoringViewProps) {
  const [tab, setTab] = useState<'logs' | 'users'>('logs');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [summary, setSummary] = useState<MonitoringSummary>({
    totalUsers: 0,
    activeUsers: 0,
    activeSessions: 0,
    loginsToday: 0,
    appOpensToday: 0,
    failedLoginsToday: 0,
  });
  const [users, setUsers] = useState<AdminMonitoredUser[]>([]);
  const [logs, setLogs] = useState<AccessLogEntry[]>([]);
  const [dbPath, setDbPath] = useState<string>('');

  const [eventTypeFilter, setEventTypeFilter] = useState<AccessEventType | ''>(
    ''
  );
  const [userIdFilter, setUserIdFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const loadMonitoring = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAdminMonitoring({
        eventType: eventTypeFilter,
        userId: userIdFilter,
        search: searchQuery.trim(),
        limit: 200,
      });
      setSummary(data.summary);
      setUsers(data.users);
      setLogs(data.logs);
      setDbPath(data.dbPath);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo cargar el monitoreo de accesos.'
      );
    } finally {
      setLoading(false);
    }
  }, [eventTypeFilter, userIdFilter, searchQuery]);

  useEffect(() => {
    void loadMonitoring();
  }, [loadMonitoring]);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.fullName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        ROLE_LABELS[u.role].toLowerCase().includes(q)
    );
  }, [users, searchQuery]);

  const handleExportCsv = () => {
    const headers = [
      'Fecha',
      'Hora',
      'Nombre',
      'Correo',
      'Perfil',
      'Evento',
      'Plataforma',
      'Detalle',
      'IP',
      'Dispositivo',
    ];
    const escapeCell = (val: string) =>
      `"${String(val || '').replace(/"/g, '""')}"`;

    const rows = logs.map((log) => [
      formatDateDay(log.createdAt),
      formatDateTime(log.createdAt),
      log.fullName,
      log.email,
      log.userRole ? ROLE_LABELS[log.userRole] : '—',
      EVENT_TYPE_LABELS[log.eventType] || log.eventType,
      log.appName || 'Portal Interno Escolar',
      log.detail,
      log.ipAddress || '—',
      summarizeDevice(log.userAgent),
    ]);

    const csv = [
      headers.map(escapeCell).join(','),
      ...rows.map((r) => r.map(escapeCell).join(',')),
    ].join('\n');

    const blob = new Blob([`\uFEFF${csv}`], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `monitoreo-accesos-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-slate-200">
        <div className="space-y-2 max-w-2xl">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Volver</span>
            </button>
          )}
          <div className="space-y-1.5">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
              Monitoreo de accesos y usuarios registrados
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              Control administrativo de cuentas registradas, día y hora de cada
              ingreso, plataformas abiertas, dirección IP y sesiones activas.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void loadMonitoring()}
            disabled={loading}
            className="px-3.5 py-2 rounded-lg border border-[#108981]/30 bg-[#108981]/10 hover:bg-[#108981]/15 text-xs font-medium text-[#0d736c] inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>Actualizar</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={logs.length === 0}
            className="px-3.5 py-2 rounded-lg bg-[#1e3a8a] hover:bg-blue-800 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Exportar CSV</span>
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </div>
      )}

      {/* Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Usuarios registrados</span>
            <Users className="w-4 h-4 text-[#1e3a8a]" aria-hidden="true" />
          </div>
          <p className="font-display text-2xl font-semibold text-slate-900 tabular-nums">
            {summary.totalUsers}
          </p>
          <p className="text-[11px] text-slate-500 tabular-nums">
            {summary.activeUsers} activos · {summary.activeSessions} sesiones vigentes
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Ingresos hoy</span>
            <UserCheck className="w-4 h-4 text-[#108981]" aria-hidden="true" />
          </div>
          <p className="font-display text-2xl font-semibold text-slate-900 tabular-nums">
            {summary.loginsToday}
          </p>
          <p className="text-[11px] text-slate-500">
            Inicios de sesión exitosos
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Accesos a plataformas hoy</span>
            <Activity className="w-4 h-4 text-[#108981]" aria-hidden="true" />
          </div>
          <p className="font-display text-2xl font-semibold text-slate-900 tabular-nums">
            {summary.appOpensToday}
          </p>
          <p className="text-[11px] text-slate-500">
            Aperturas desde Acceso Rápido
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Intentos fallidos hoy</span>
            <ShieldAlert className="w-4 h-4 text-amber-700" aria-hidden="true" />
          </div>
          <p className="font-display text-2xl font-semibold text-[#0f172a] tabular-nums">
            {summary.failedLoginsToday}
          </p>
          <p className="text-[11px] text-slate-500">
            Credenciales inválidas o inactivas
          </p>
        </div>
      </div>

      {/* Tabs & Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200 self-start">
          <button
            type="button"
            onClick={() => setTab('logs')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              tab === 'logs'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Bitácora de accesos ({logs.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('users')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              tab === 'users'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Usuarios registrados ({users.length})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[220px] flex-1 sm:flex-initial">
            <Search
              className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label="Filtrar por usuario, correo, plataforma o IP"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar usuario, plataforma o IP..."
              className="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#108981] focus:border-[#108981]"
            />
          </div>

          {tab === 'logs' && (
            <>
              <select
                aria-label="Filtrar por tipo de evento"
                value={eventTypeFilter}
                onChange={(e) =>
                  setEventTypeFilter(e.target.value as AccessEventType | '')
                }
                className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs text-slate-900"
              >
                <option value="">Todos los eventos</option>
                <option value="login_success">Ingresos al portal</option>
                <option value="app_open">Aperturas de plataformas</option>
                <option value="register">Nuevos registros</option>
                <option value="login_failed">Intentos fallidos</option>
                <option value="logout">Cierres de sesión</option>
                <option value="setup_admin">Activación admin</option>
              </select>

              <select
                aria-label="Filtrar por usuario"
                value={userIdFilter}
                onChange={(e) => setUserIdFilter(e.target.value)}
                className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 max-w-[220px]"
              >
                <option value="">Todos los usuarios</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} ({u.email})
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      </div>

      {/* Tab 1: Chronological Access Log */}
      {tab === 'logs' && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Día y hora</th>
                  <th className="py-3 px-4">Usuario</th>
                  <th className="py-3 px-4">Evento</th>
                  <th className="py-3 px-4">Plataforma / Detalle</th>
                  <th className="py-3 px-4">IP y equipo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {loading && logs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-10 px-4 text-center text-slate-500"
                    >
                      Cargando bitácora de accesos...
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-10 px-4 text-center text-slate-500"
                    >
                      No hay registros de acceso que coincidan con el filtro
                      seleccionado.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => {
                    const isFailed = log.eventType === 'login_failed';
                    const isRegister =
                      log.eventType === 'register' ||
                      log.eventType === 'setup_admin';
                    return (
                      <tr key={log.id} className="align-top hover:bg-slate-50/70">
                        <td className="py-3 px-4 whitespace-nowrap tabular-nums">
                          <p className="font-medium text-slate-900">
                            {formatDateDay(log.createdAt)}
                          </p>
                          <p className="font-mono text-[11px] text-slate-500">
                            {formatDateTime(log.createdAt)}
                          </p>
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-medium text-slate-900">
                            {log.fullName}
                          </p>
                          <p className="font-mono text-[11px] text-slate-500">
                            {log.email}
                          </p>
                          {log.userRole && (
                            <p className="text-[11px] text-[#108981] font-medium mt-0.5">
                              {ROLE_LABELS[log.userRole]}
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={`inline-block px-2 py-0.5 rounded border text-[11px] font-medium ${
                              isFailed
                                ? 'border-red-200 bg-red-50 text-red-800'
                                : isRegister
                                ? 'border-[#108981]/30 bg-[#108981]/10 text-[#0d736c]'
                                : log.eventType === 'app_open'
                                ? 'border-blue-200 bg-blue-50 text-[#1e3a8a]'
                                : 'border-[#108981]/30 bg-[#108981]/10 text-[#0d736c]'
                            }`}
                          >
                            {EVENT_TYPE_LABELS[log.eventType] || log.eventType}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-medium text-slate-900">
                            {log.appName || 'Portal Interno Escolar'}
                          </p>
                          <p className="text-slate-600 mt-0.5">{log.detail}</p>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <p className="font-mono text-[11px] text-slate-700">
                            {log.ipAddress || '—'}
                          </p>
                          <p
                            title={log.userAgent}
                            className="text-[11px] text-slate-500 mt-0.5"
                          >
                            {summarizeDevice(log.userAgent)}
                          </p>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Registered Users Overview */}
      {tab === 'users' && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Usuario registrado</th>
                  <th className="py-3 px-4">Perfil</th>
                  <th className="py-3 px-4">Fecha de registro</th>
                  <th className="py-3 px-4">Último acceso</th>
                  <th className="py-3 px-4">Actividad</th>
                  <th className="py-3 px-4 text-right">Historial</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-10 px-4 text-center text-slate-500"
                    >
                      No hay usuarios registrados que coincidan con la búsqueda.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => (
                    <tr key={u.id} className="align-top hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <p className="font-medium text-slate-900 text-sm">
                          {u.fullName}
                        </p>
                        <p className="font-mono text-[11px] text-slate-500">
                          {u.email}
                        </p>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <p className="font-medium text-slate-800">
                          {ROLE_LABELS[u.role]}
                        </p>
                        <p
                          className={`text-[11px] mt-0.5 ${
                            u.isActive ? 'text-emerald-700' : 'text-slate-500'
                          }`}
                        >
                          {u.isActive ? 'Cuenta activa' : 'Cuenta inactiva'}
                        </p>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap tabular-nums">
                        <p className="text-slate-900">
                          {formatDateDay(u.createdAt)}
                        </p>
                        <p className="font-mono text-[11px] text-slate-500">
                          {formatDateTime(u.createdAt)}
                        </p>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap tabular-nums">
                        {u.lastAccessAt ? (
                          <>
                            <p className="text-slate-900">
                              {formatDateDay(u.lastAccessAt)}
                            </p>
                            <p className="font-mono text-[11px] text-slate-500">
                              {formatDateTime(u.lastAccessAt)}
                            </p>
                          </>
                        ) : (
                          <span className="text-slate-400">Sin registros</span>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap tabular-nums">
                        <p className="font-medium text-slate-900">
                          {u.accessCount} eventos
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {u.activeSessions}{' '}
                          {u.activeSessions === 1
                            ? 'sesión activa'
                            : 'sesiones activas'}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            setUserIdFilter(u.id);
                            setTab('logs');
                          }}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700"
                        >
                          Ver accesos
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {dbPath && (
        <p className="text-[11px] text-slate-500 font-mono">
          Archivo SQLite activo: {dbPath}
        </p>
      )}
    </div>
  );
}
