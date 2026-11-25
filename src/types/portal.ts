export type UserRole = 'admin' | 'direccion' | 'docente' | 'convivencia' | 'pie';

export type OpenMode = 'new_tab' | 'embedded_verified';

export type AccessMethod =
  | 'direct_open'
  | 'supabase_email_password'
  | 'google_workspace_oauth';

export type IntegrationStatus =
  | 'ready_direct'
  | 'external_auth_pending_sso'
  | 'restricted_new_tab_only'
  | 'requires_external_config';

export interface PortalUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  avatarUrl?: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface PortalApp {
  id: string;
  slug: string;
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
  isFavorite?: boolean;
  updatedAt: string;
}

export interface BootstrapStatus {
  needsAdminSetup: boolean;
  envPasscodeActive: boolean;
  adminEmailHint: string;
}

export interface GoogleCalendarItem {
  id: string;
  summary: string;
  description?: string;
  primary?: boolean;
  accessRole: string;
  backgroundColor?: string;
}

export interface CalendarEventItem {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  organizer?: {
    email?: string;
    displayName?: string;
  };
  attendeesCount: number;
  calendarSummary: string;
  calendarAccessRole: string;
}

export interface ExternalIntegrationStatus {
  id: string;
  name: string;
  category: string;
  requiresExternalConfig: boolean;
  status: 'connected' | 'pending_config' | 'restricted' | 'error' | 'ready';
  statusLabel: string;
  detail: string;
  url?: string;
  xFrameOptions?: string | null;
  httpReachable?: boolean | null;
}

export interface RepoAuditItem {
  appName: string;
  repoUrl: string;
  liveUrl: string;
  authStack: string;
  membershipMechanism: string;
  framingConstraint: string;
  existingIdentitiesNotes: string;
  requiredModifications: string[];
}

export type AccessEventType =
  | 'login_success'
  | 'login_failed'
  | 'register'
  | 'setup_admin'
  | 'logout'
  | 'app_open';

export interface AccessLogEntry {
  id: string;
  userId: string | null;
  email: string;
  fullName: string;
  userRole: UserRole | null;
  eventType: AccessEventType;
  appId: string | null;
  appName: string | null;
  ipAddress: string;
  userAgent: string;
  detail: string;
  createdAt: string;
}

export interface AdminMonitoredUser extends PortalUser {
  accessCount: number;
  lastAccessAt: string | null;
  lastEventType: AccessEventType | null;
  activeSessions: number;
}

export interface MonitoringSummary {
  totalUsers: number;
  activeUsers: number;
  activeSessions: number;
  loginsToday: number;
  appOpensToday: number;
  failedLoginsToday: number;
}

export interface AdminMonitoringResponse {
  summary: MonitoringSummary;
  users: AdminMonitoredUser[];
  logs: AccessLogEntry[];
  dbPath: string;
}
