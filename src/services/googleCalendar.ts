import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import type { CalendarEventItem, GoogleCalendarItem } from '../types/portal.ts';

export const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
];

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
for (const scope of GOOGLE_CALENDAR_SCOPES) {
  provider.addScope(scope);
}
provider.setCustomParameters({ prompt: 'select_account' });

let isSigningIn = false;
// Access token is strictly cached in JS memory (never localStorage/sessionStorage)
let cachedAccessToken: string | null = null;

export function initGoogleCalendarAuth(
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthMissing?: () => void
) {
  return onAuthStateChanged(auth, (user) => {
    if (user && cachedAccessToken) {
      onAuthSuccess?.(user, cachedAccessToken);
    } else if (!isSigningIn) {
      if (!user) cachedAccessToken = null;
      onAuthMissing?.();
    }
  });
}

export async function connectGoogleCalendar(): Promise<{
  user: User;
  accessToken: string;
}> {
  isSigningIn = true;
  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error(
        'No se recibió un token de acceso de Google Calendar. Verifica los permisos otorgados.'
      );
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
}

export async function disconnectGoogleCalendar(): Promise<void> {
  cachedAccessToken = null;
  await auth.signOut();
}

export function getCachedGoogleToken(): string | null {
  return cachedAccessToken;
}

export function getCurrentGoogleUser(): User | null {
  return auth.currentUser;
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
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    if (res.status === 401) cachedAccessToken = null;
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
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    if (res.status === 401) cachedAccessToken = null;
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
