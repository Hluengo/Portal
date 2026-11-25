import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar as CalendarIcon,
  Clock,
  ExternalLink,
  LogOut,
  MapPin,
  RefreshCw,
  Users,
} from 'lucide-react';
import { classifyGoogleCalendarError } from '../lib/portalLogic.ts';
import {
  connectGoogleCalendar,
  disconnectGoogleCalendar,
  fetchGoogleCalendarEvents,
  fetchGoogleCalendars,
  getCachedGoogleToken,
  getCurrentGoogleUser,
  GoogleCalendarApiError,
  initGoogleCalendarAuth,
} from '../services/googleCalendar.ts';
import type { CalendarEventItem, GoogleCalendarItem } from '../types/portal.ts';

function formatEventTime(ev: CalendarEventItem): string {
  if (ev.start.date) {
    const parsed = new Date(`${ev.start.date}T00:00:00`);
    return `${parsed.toLocaleDateString('es-CL', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })} · Todo el día`;
  }
  if (ev.start.dateTime) {
    const start = new Date(ev.start.dateTime);
    const end = ev.end.dateTime ? new Date(ev.end.dateTime) : null;
    const dateLabel = start.toLocaleDateString('es-CL', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    const startTime = start.toLocaleTimeString('es-CL', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const endTime = end
      ? end.toLocaleTimeString('es-CL', {
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';
    return endTime
      ? `${dateLabel} · ${startTime} – ${endTime}`
      : `${dateLabel} · ${startTime}`;
  }
  return 'Horario por confirmar';
}

export function CalendarView({ onBack }: { onBack?: () => void }) {
  const [authState, setAuthState] = useState<'needs_auth' | 'connected'>(() =>
    getCachedGoogleToken() ? 'connected' : 'needs_auth'
  );
  const [googleEmail, setGoogleEmail] = useState<string | null>(
    () => getCurrentGoogleUser()?.email ?? null
  );
  const [connecting, setConnecting] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [calendars, setCalendars] = useState<GoogleCalendarItem[]>([]);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>('all');
  const [daysAhead, setDaysAhead] = useState<number>(14);
  const [events, setEvents] = useState<CalendarEventItem[]>([]);
  const [errorInfo, setErrorInfo] = useState<{
    state: 'needs_auth' | 'permission_denied' | 'error';
    title: string;
    detail: string;
  } | null>(null);

  const loadCalendarData = useCallback(
    async (token: string, targetCalendarId: string, rangeDays: number) => {
      setLoadingEvents(true);
      setErrorInfo(null);
      try {
        const calList = await fetchGoogleCalendars(token);
        setCalendars(calList);

        const calendarsToQuery =
          targetCalendarId === 'all'
            ? calList.slice(0, 6)
            : calList.filter((c) => c.id === targetCalendarId);

        const effectiveList =
          calendarsToQuery.length > 0
            ? calendarsToQuery
            : [
                {
                  id: 'primary',
                  summary: 'Calendario principal',
                  accessRole: 'reader',
                },
              ];

        const settled = await Promise.all(
          effectiveList.map((cal) =>
            fetchGoogleCalendarEvents(
              token,
              cal.id,
              cal.summary,
              cal.accessRole,
              rangeDays
            )
          )
        );

        const merged = settled.flat().sort((a, b) => {
          const aVal = a.start.dateTime || a.start.date || '';
          const bVal = b.start.dateTime || b.start.date || '';
          return aVal.localeCompare(bVal);
        });

        setEvents(merged);
      } catch (err) {
        if (err instanceof GoogleCalendarApiError) {
          const classified = classifyGoogleCalendarError(err.status, err.message);
          setErrorInfo(classified);
          if (classified.state === 'needs_auth') {
            setAuthState('needs_auth');
          }
        } else {
          setErrorInfo({
            state: 'error',
            title: 'Error de conexión con Google Calendar',
            detail:
              err instanceof Error
                ? err.message
                : 'No se pudo conectar con la API de Google Calendar.',
          });
        }
      } finally {
        setLoadingEvents(false);
      }
    },
    []
  );

  useEffect(() => {
    const unsubscribe = initGoogleCalendarAuth(
      (user, token) => {
        setAuthState('connected');
        setGoogleEmail(user.email);
        void loadCalendarData(token, selectedCalendarId, daysAhead);
      },
      () => {
        setAuthState('needs_auth');
      }
    );
    return unsubscribe;
  }, [daysAhead, loadCalendarData, selectedCalendarId]);

  const handleGoogleConnect = async () => {
    setConnecting(true);
    setErrorInfo(null);
    try {
      const result = await connectGoogleCalendar();
      setAuthState('connected');
      setGoogleEmail(result.user.email);
      await loadCalendarData(result.accessToken, selectedCalendarId, daysAhead);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'No se completó la autorización con Google.';
      setErrorInfo({
        state: 'permission_denied',
        title: 'Conexión pendiente o cancelada',
        detail: message,
      });
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    await disconnectGoogleCalendar();
    setAuthState('needs_auth');
    setGoogleEmail(null);
    setCalendars([]);
    setEvents([]);
    setErrorInfo(null);
  };

  const handleRefresh = () => {
    const token = getCachedGoogleToken();
    if (!token) {
      setAuthState('needs_auth');
      return;
    }
    void loadCalendarData(token, selectedCalendarId, daysAhead);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-6 border-b border-slate-200">
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
              Calendario compartido institucional
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              Muestra tus calendarios y eventos compartidos con sus descripciones
              completas según los permisos otorgados en Google Workspace.
            </p>
          </div>
        </div>

        {authState === 'connected' && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {googleEmail && (
              <span className="text-xs text-slate-600 mr-2">
                Conectado como <strong className="text-slate-900">{googleEmail}</strong>
              </span>
            )}
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loadingEvents}
              className="px-3.5 py-2 rounded-lg border border-[#108981]/30 bg-[#108981]/10 hover:bg-[#108981]/15 text-xs font-medium text-[#0d736c] inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loadingEvents ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>Actualizar</span>
            </button>
            <button
              type="button"
              onClick={handleDisconnect}
              className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Desconectar Google</span>
            </button>
          </div>
        )}
      </div>

      {/* Pending Connection State */}
      {authState === 'needs_auth' && (
        <div
          data-testid="calendar-pending-state"
          className="rounded-xl border border-amber-200 bg-amber-50/60 p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6"
        >
          <div className="space-y-2 max-w-xl">
            <div className="flex items-center gap-2 text-amber-900 font-display font-semibold text-base">
              <CalendarIcon className="w-5 h-5 text-amber-700" aria-hidden="true" />
              <span>Conexión pendiente con Google Calendar</span>
            </div>
            <p className="text-sm text-amber-900/90 leading-relaxed">
              Para consultar eventos y descripciones compartidas según tus permisos
              de Google, autoriza el acceso de solo lectura con tu cuenta
              institucional de Google. El token se mantiene únicamente en memoria de
              sesión.
            </p>
          </div>

          <button
            type="button"
            onClick={handleGoogleConnect}
            disabled={connecting}
            className="gsi-material-button shrink-0"
          >
            <div className="gsi-material-button-content-wrapper">
              <div className="gsi-material-button-icon">
                <svg
                  version="1.1"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 48 48"
                  style={{ display: 'block' }}
                  aria-hidden="true"
                >
                  <path
                    fill="#EA4335"
                    d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                  />
                </svg>
              </div>
              <span className="gsi-material-button-contents">
                {connecting ? 'Conectando...' : 'Sign in with Google'}
              </span>
            </div>
          </button>
        </div>
      )}

      {/* Explicit Error Banner */}
      {errorInfo && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle
              className="w-5 h-5 text-red-700 shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div>
              <h2 className="font-display text-sm font-semibold text-red-900">
                {errorInfo.title}
              </h2>
              <p className="text-sm text-red-800 mt-0.5">{errorInfo.detail}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleGoogleConnect}
            className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-semibold whitespace-nowrap shrink-0"
          >
            Reconectar Google
          </button>
        </div>
      )}

      {/* Connected Filter Bar & Events */}
      {authState === 'connected' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex flex-wrap items-center gap-3">
              <label
                htmlFor="calendar-select"
                className="text-xs font-medium text-slate-700"
              >
                Calendario visible:
              </label>
              <select
                id="calendar-select"
                value={selectedCalendarId}
                onChange={(e) => setSelectedCalendarId(e.target.value)}
                className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#108981] focus:border-[#108981]"
              >
                <option value="all">
                  Todos los calendarios compartidos ({calendars.length})
                </option>
                {calendars.map((cal) => (
                  <option key={cal.id} value={cal.id}>
                    {cal.summary} ({cal.accessRole})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200">
              {[
                { days: 1, label: 'Hoy' },
                { days: 7, label: '7 días' },
                { days: 14, label: '14 días' },
                { days: 30, label: '30 días' },
              ].map((opt) => (
                <button
                  key={opt.days}
                  type="button"
                  onClick={() => setDaysAhead(opt.days)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    daysAhead === opt.days
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {loadingEvents ? (
            <div className="space-y-3" aria-busy="true">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-28 rounded-xl border border-slate-200 bg-white p-5 animate-pulse"
                />
              ))}
            </div>
          ) : events.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-10 text-center space-y-2">
              <p className="font-display text-base font-semibold text-slate-900">
                No hay eventos programados en este rango
              </p>
              <p className="text-sm text-slate-600">
                Amplía el rango de días o selecciona otro calendario compartido en
                el menú superior.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {events.map((ev) => (
                <article
                  key={`${ev.calendarSummary}-${ev.id}`}
                  className="rounded-xl border border-slate-200 bg-white p-5 space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1">
                      <h3 className="font-display text-base font-semibold text-slate-900">
                        {ev.summary}
                      </h3>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 tabular-nums">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                          <span>{formatEventTime(ev)}</span>
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>Calendario: {ev.calendarSummary}</span>
                        <span aria-hidden="true">·</span>
                        <span>Permiso Google: {ev.calendarAccessRole}</span>
                      </div>
                    </div>

                    {ev.htmlLink && (
                      <a
                        href={ev.htmlLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                      >
                        <span>Ver en Google</span>
                        <ExternalLink className="w-3 h-3" aria-hidden="true" />
                      </a>
                    )}
                  </div>

                  {ev.description ? (
                    <div className="pt-3 border-t border-slate-100">
                      <p className="text-xs font-medium text-slate-500 mb-1">
                        Descripción del evento
                      </p>
                      <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">
                        {ev.description}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 pt-2 border-t border-slate-100">
                      Sin descripción adicional en Google Calendar.
                    </p>
                  )}

                  {(ev.location || ev.attendeesCount > 0) && (
                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-1">
                      {ev.location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{ev.location}</span>
                        </span>
                      )}
                      {ev.attendeesCount > 0 && (
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <Users className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{ev.attendeesCount} participantes</span>
                        </span>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
