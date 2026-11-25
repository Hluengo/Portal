import type { CalendarEventItem, GoogleCalendarItem } from '../types/portal.ts';
import { INSTITUTIONAL_EMAIL_DOMAIN, isInstitutionalEmail } from '../lib/portalLogic.ts';

/**
 * Google OAuth directo mediante Google Identity Services.
 *
 * Firebase no participa en esta autenticación: Turso sigue gestionando las
 * cuentas del portal y Google entrega un token temporal para el calendario de
 * la cuenta que cada usuario elija.
 */
export const GOOGLE_CALENDAR_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar.readonly',
].join(' ');

const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();
const GOOGLE_SCRIPT_URL = 'https://accounts.google.com/gsi/client';

interface GoogleIdentity {
  email: string;
}

interface GoogleTokenClient {
  requestAccessToken: (options?: { prompt?: string }) => void;
}

interface GoogleIdentityServices {
  accounts: {
    oauth2: {
      initTokenClient: (options: {
        client_id: string;
        scope: string;
        callback: (response: {
          access_token?: string;
          error?: string;
          error_description?: string;
        }) => void;
        error_callback?: (error: { type?: string; message?: string }) => void;
      }) => GoogleTokenClient;
      revoke: (
        token: string,
        callback: (response: { error?: string }) => void
      ) => void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentityServices;
  }
}

let isSigningIn = false;
let cachedAccessToken: string | null = null;
let cachedGoogleUser: GoogleIdentity | null = null;
let googleScriptPromise: Promise<void> | null = null;

function loadGoogleIdentityScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (googleScriptPromise) return googleScriptPromise;

  googleScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GOOGLE_SCRIPT_URL}"]`
    );
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error('No se pudo cargar Google Identity Services.')),
        { once: true }
      );
      return;
    }

    const script = document.createElement('script');
    script.src = GOOGLE_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error('No se pudo cargar Google Identity Services.'));
    document.head.appendChild(script);
  });

  return googleScriptPromise;
}

async function fetchGoogleIdentity(accessToken: string): Promise<GoogleIdentity> {
  const response = await fetch(
    'https://www.googleapis.com/oauth2/v3/userinfo',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!response.ok) {
    throw new Error('No se pudo identificar la cuenta Google seleccionada.');
  }
  const data = (await response.json()) as { email?: string };
  if (!data.email) {
    throw new Error('Google no devolvió el correo de la cuenta seleccionada.');
  }
  if (!isInstitutionalEmail(data.email)) {
    throw new Error(
      `Solo pueden conectar Google Calendar las cuentas @${INSTITUTIONAL_EMAIL_DOMAIN}.`
    );
  }
  return { email: data.email };
}

export function initGoogleCalendarAuth(
  _onAuthSuccess?: (user: GoogleIdentity, token: string) => void,
  onAuthMissing?: () => void
): () => void {
  // El token se conserva únicamente mientras esta pestaña esté abierta.
  // No se restaura desde cookies, localStorage ni Firebase.
  if (!cachedAccessToken) {
    queueMicrotask(() => onAuthMissing?.());
  }
  return () => undefined;
}

export async function connectGoogleCalendar(): Promise<{
  user: GoogleIdentity;
  accessToken: string;
}> {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error(
      'Falta configurar VITE_GOOGLE_CLIENT_ID para conectar Google Calendar.'
    );
  }

  isSigningIn = true;
  try {
    await loadGoogleIdentityScript();
    if (!window.google?.accounts?.oauth2) {
      throw new Error('Google Identity Services no está disponible.');
    }

    const response = await new Promise<string>((resolve, reject) => {
      const client = window.google!.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: GOOGLE_CALENDAR_SCOPES,
        callback: (result) => {
          if (result.error || !result.access_token) {
            reject(
              new Error(
                result.error_description ||
                  'La autorización de Google Calendar fue cancelada.'
              )
            );
            return;
          }
          resolve(result.access_token);
        },
        error_callback: (error) => {
          reject(
            new Error(error.message || 'La autorización de Google fue cancelada.')
          );
        },
      });
      // Siempre solicita selección para no reutilizar accidentalmente la
      // cuenta Google del administrador u otra cuenta del navegador.
      client.requestAccessToken({ prompt: 'select_account' });
    });

    cachedAccessToken = response;
    cachedGoogleUser = await fetchGoogleIdentity(response);
    return { user: cachedGoogleUser, accessToken: response };
  } finally {
    isSigningIn = false;
  }
}

export async function disconnectGoogleCalendar(): Promise<void> {
  const token = cachedAccessToken;
  cachedAccessToken = null;
  cachedGoogleUser = null;
  if (token && window.google?.accounts?.oauth2) {
    await new Promise<void>((resolve) => {
      window.google!.accounts.oauth2.revoke(token, () => resolve());
    });
  }
}

export function getCachedGoogleToken(): string | null {
  return cachedAccessToken;
}

export function getCurrentGoogleUser(): GoogleIdentity | null {
  return cachedGoogleUser;
}

export class GoogleCalendarApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function fetchGoogleCalendars(
  accessToken: string
): Promise<GoogleCalendarItem[]> {
  const res = await fetch(
    'https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    if (res.status === 401) {
      cachedAccessToken = null;
      cachedGoogleUser = null;
    }
    throw new GoogleCalendarApiError(
      res.status,
      errBody?.error?.message || `Error ${res.status} al listar calendarios.`
    );
  }

  const data = (await res.json()) as { items?: GoogleCalendarItem[] };
  return data.items ?? [];
}

export async function fetchGoogleCalendarEvents(
  accessToken: string,
  calendarId: string,
  calendarSummary: string,
  calendarAccessRole: string,
  daysAhead = 14
): Promise<CalendarEventItem[]> {
  const now = new Date();
  const startOfDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0
  );
  const endRange = new Date(
    startOfDay.getTime() + daysAhead * 24 * 60 * 60 * 1000
  );

  const params = new URLSearchParams({
    singleEvents: 'true',
    orderBy: 'startTime',
    timeMin: startOfDay.toISOString(),
    timeMax: endRange.toISOString(),
    maxResults: '40',
  });

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      calendarId
    )}/events?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    if (res.status === 401) {
      cachedAccessToken = null;
      cachedGoogleUser = null;
    }
    throw new GoogleCalendarApiError(
      res.status,
      errBody?.error?.message || `Error ${res.status} al consultar eventos.`
    );
  }

  const data = (await res.json()) as {
    items?: Array<{
      id: string;
      summary?: string;
      description?: string;
      location?: string;
      htmlLink?: string;
      start?: { dateTime?: string; date?: string; timeZone?: string };
      end?: { dateTime?: string; date?: string; timeZone?: string };
      organizer?: { email?: string; displayName?: string };
      attendees?: unknown[];
    }>;
  };

  return (data.items ?? []).map((ev) => ({
    id: ev.id,
    summary: ev.summary || '(Evento sin título)',
    description: ev.description || '',
    location: ev.location || '',
    htmlLink: ev.htmlLink,
    start: ev.start || {},
    end: ev.end || {},
    organizer: ev.organizer,
    attendeesCount: Array.isArray(ev.attendees) ? ev.attendees.length : 0,
    calendarSummary,
    calendarAccessRole,
  }));
}
