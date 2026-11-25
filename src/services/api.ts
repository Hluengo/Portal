import type {
  AccessEventType,
  AdminMonitoringResponse,
  BootstrapStatus,
  ExternalIntegrationStatus,
  PortalApp,
  PortalUser,
  RepoAuditItem,
  UserRole,
} from '../types/portal.ts';

let memorySessionToken: string | null = null;

export function setMemorySessionToken(token: string | null): void {
  memorySessionToken = token;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('X-Requested-With', 'XMLHttpRequest');
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (memorySessionToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${memorySessionToken}`);
  }

  const res = await fetch(path, {
    ...init,
    headers,
    credentials: 'include',
  });

  const text = await res.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      data = { error: text };
    }
  }

  if (!res.ok) {
    throw new ApiError(
      res.status,
      typeof data.error === 'string'
        ? data.error
        : `Error HTTP ${res.status}`
    );
  }

  return data as T;
}

export async function getBootstrapStatus(): Promise<BootstrapStatus> {
  return request<BootstrapStatus>('/api/auth/bootstrap-status');
}

export async function setupInitialAdmin(payload: {
  fullName: string;
  email: string;
  password: string;
}): Promise<{ user: PortalUser; token: string }> {
  const result = await request<{ user: PortalUser; token: string }>(
    '/api/auth/setup-admin',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
  setMemorySessionToken(result.token);
  return result;
}

export async function registerInstitutionalUser(payload: {
  fullName: string;
  email: string;
  password: string;
}): Promise<{ user: PortalUser; token: string }> {
  const result = await request<{ user: PortalUser; token: string }>(
    '/api/auth/register',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
  setMemorySessionToken(result.token);
  return result;
}

export async function loginInstitutionalUser(payload: {
  email: string;
  password: string;
}): Promise<{ user: PortalUser; token: string }> {
  const result = await request<{ user: PortalUser; token: string }>(
    '/api/auth/login',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
  setMemorySessionToken(result.token);
  return result;
}

export async function logoutInstitutionalUser(): Promise<void> {
  try {
    await request('/api/auth/logout', { method: 'POST' });
  } finally {
    setMemorySessionToken(null);
  }
}

export async function getCurrentUser(): Promise<{ user: PortalUser }> {
  return request<{ user: PortalUser }>('/api/auth/me');
}

export async function updateUserProfile(payload: {
  fullName: string;
  avatarUrl: string | null;
  favoriteAppIds: string[];
}): Promise<{ user: PortalUser; favoriteIds: string[] }> {
  return request<{ user: PortalUser; favoriteIds: string[] }>('/api/profile', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function getAuthSession(): Promise<{
  authenticated: boolean;
  user: PortalUser | null;
}> {
  return request<{ authenticated: boolean; user: PortalUser | null }>(
    '/api/auth/session'
  );
}

export async function getCatalogApps(): Promise<{
  apps: PortalApp[];
  favoriteIds: string[];
}> {
  return request<{ apps: PortalApp[]; favoriteIds: string[] }>('/api/apps');
}

export async function toggleAppFavorite(appId: string): Promise<{
  appId: string;
  isFavorite: boolean;
  favoriteIds: string[];
}> {
  return request('/api/favorites/toggle', {
    method: 'POST',
    body: JSON.stringify({ appId }),
  });
}

export async function getSsoAudit(): Promise<{ audit: RepoAuditItem[] }> {
  return request<{ audit: RepoAuditItem[] }>('/api/sso-audit');
}

export async function getIntegrationsStatus(): Promise<{
  integrations: ExternalIntegrationStatus[];
}> {
  return request<{ integrations: ExternalIntegrationStatus[] }>(
    '/api/integrations/status'
  );
}

// Admin API
export async function getAdminApps(): Promise<{ apps: PortalApp[] }> {
  return request<{ apps: PortalApp[] }>('/api/admin/apps');
}

export type AdminAppPayload = Omit<
  PortalApp,
  'id' | 'slug' | 'isFavorite' | 'updatedAt'
>;

export async function createAdminApp(
  payload: AdminAppPayload
): Promise<{ app: PortalApp }> {
  return request<{ app: PortalApp }>('/api/admin/apps', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateAdminApp(
  id: string,
  payload: AdminAppPayload
): Promise<{ app: PortalApp }> {
  return request<{ app: PortalApp }>(`/api/admin/apps/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteAdminApp(id: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/admin/apps/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function getAdminUsers(): Promise<{ users: PortalUser[] }> {
  return request<{ users: PortalUser[] }>('/api/admin/users');
}

export async function createAdminUser(payload: {
  fullName: string;
  email: string;
  role: UserRole;
  password: string;
}): Promise<{ user: PortalUser }> {
  return request<{ user: PortalUser }>('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateAdminUser(
  id: string,
  payload: { role: UserRole; isActive: boolean }
): Promise<{ user: PortalUser }> {
  return request<{ user: PortalUser }>(
    `/api/admin/users/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    }
  );
}

export async function logAccessEvent(payload: {
  appId: string;
  launchMode?: 'embedded' | 'new_tab';
}): Promise<void> {
  try {
    await request('/api/access-events', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch {
    // Non-blocking audit telemetry
  }
}

export async function getAdminMonitoring(filters?: {
  eventType?: AccessEventType | '';
  userId?: string;
  search?: string;
  limit?: number;
}): Promise<AdminMonitoringResponse> {
  const params = new URLSearchParams();
  if (filters?.eventType) params.set('eventType', filters.eventType);
  if (filters?.userId) params.set('userId', filters.userId);
  if (filters?.search) params.set('search', filters.search);
  if (filters?.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();
  return request<AdminMonitoringResponse>(
    `/api/admin/monitoring${qs ? `?${qs}` : ''}`
  );
}
