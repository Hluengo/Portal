import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Pencil,
  Plus,
  Shield,
  Trash2,
  Users,
} from 'lucide-react';
import { AppIcon, AVAILABLE_ICON_OPTIONS } from './AppIcon.tsx';
import {
  getAccessMethodLabel,
  getIntegrationStatusLabel,
  ROLE_LABELS,
} from '../lib/portalLogic.ts';
import {
  createAdminApp,
  createAdminUser,
  deleteAdminApp,
  getAdminApps,
  getAdminUsers,
  updateAdminApp,
  updateAdminUser,
  type AdminAppPayload,
} from '../services/api.ts';
import type {
  AccessMethod,
  IntegrationStatus,
  OpenMode,
  PortalApp,
  PortalUser,
  UserRole,
} from '../types/portal.ts';

interface AdminPanelViewProps {
  currentUser: PortalUser;
  onCatalogUpdated: () => Promise<void>;
  onBack?: () => void;
}

const ALL_ROLES: UserRole[] = [
  'admin',
  'direccion',
  'docente',
  'convivencia',
  'pie',
];

function emptyAppForm(nextOrder: number): AdminAppPayload {
  return {
    name: '',
    description: '',
    url: 'https://',
    repositoryUrl: '',
    category: 'Herramientas docentes',
    icon: 'Globe',
    displayOrder: nextOrder,
    isActive: true,
    authorizedRoles: ['admin', 'direccion', 'docente'],
    authorizedEmails: [],
    openMode: 'new_tab',
    xFrameOptionsDenied: false,
    preserveWorkspaceState: false,
    accessMethod: 'direct_open',
    integrationStatus: 'ready_direct',
    integrationNotes: '',
  };
}

export function AdminPanelView({
  currentUser,
  onCatalogUpdated,
  onBack,
}: AdminPanelViewProps) {
  const [tab, setTab] = useState<'apps' | 'users'>('apps');
  const [apps, setApps] = useState<PortalApp[]>([]);
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // App Form Modal / Drawer State
  const [editingAppId, setEditingAppId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formState, setFormState] = useState<AdminAppPayload>(() =>
    emptyAppForm(5)
  );
  const [emailsInput, setEmailsInput] = useState('');
  const [savingApp, setSavingApp] = useState(false);

  // Delete confirmation modal state
  const [appToDelete, setAppToDelete] = useState<PortalApp | null>(null);
  const [deletingApp, setDeletingApp] = useState(false);

  // Create User State
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('docente');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [savingUser, setSavingUser] = useState(false);

  const loadAdminData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [appsRes, usersRes] = await Promise.all([
        getAdminApps(),
        getAdminUsers(),
      ]);
      setApps(appsRes.apps);
      setUsers(usersRes.users);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo cargar el panel de administración.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAdminData();
  }, [loadAdminData]);

  const openCreateForm = () => {
    const maxOrder = apps.reduce(
      (max, item) => Math.max(max, item.displayOrder),
      0
    );
    setEditingAppId(null);
    setFormState(emptyAppForm(maxOrder + 1));
    setEmailsInput('');
    setIsFormOpen(true);
    setFeedback(null);
    setError(null);
  };

  const openEditForm = (app: PortalApp) => {
    setEditingAppId(app.id);
    setFormState({
      name: app.name,
      description: app.description,
      url: app.url,
      repositoryUrl: app.repositoryUrl || '',
      category: app.category,
      icon: app.icon,
      displayOrder: app.displayOrder,
      isActive: app.isActive,
      authorizedRoles: app.authorizedRoles,
      authorizedEmails: app.authorizedEmails,
      openMode: app.openMode,
      xFrameOptionsDenied: app.xFrameOptionsDenied,
      preserveWorkspaceState: app.preserveWorkspaceState,
      accessMethod: app.accessMethod,
      integrationStatus: app.integrationStatus,
      integrationNotes: app.integrationNotes,
    });
    setEmailsInput(app.authorizedEmails.join(', '));
    setIsFormOpen(true);
    setFeedback(null);
    setError(null);
  };

  const toggleRoleInForm = (role: UserRole) => {
    if (role === 'admin') return; // Admin always retains catalog visibility
    setFormState((prev) => {
      const exists = prev.authorizedRoles.includes(role);
      return {
        ...prev,
        authorizedRoles: exists
          ? prev.authorizedRoles.filter((r) => r !== role)
          : [...prev.authorizedRoles, role],
      };
    });
  };

  const handleSaveApp = async (e: FormEvent) => {
    e.preventDefault();
    setSavingApp(true);
    setError(null);
    setFeedback(null);

    const parsedEmails = emailsInput
      .split(/[,;\n]+/)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.includes('@'));

    const payload: AdminAppPayload = {
      ...formState,
      authorizedEmails: parsedEmails,
      openMode: formState.xFrameOptionsDenied ? 'new_tab' : formState.openMode,
      preserveWorkspaceState:
        !formState.xFrameOptionsDenied &&
        formState.openMode === 'embedded_verified' &&
        formState.preserveWorkspaceState,
    };

    try {
      if (editingAppId) {
        await updateAdminApp(editingAppId, payload);
        setFeedback(`Plataforma "${payload.name}" actualizada en la base de datos.`);
      } else {
        await createAdminApp(payload);
        setFeedback(`Plataforma "${payload.name}" agregada al catálogo.`);
      }
      setIsFormOpen(false);
      await loadAdminData();
      await onCatalogUpdated();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error al guardar la plataforma.'
      );
    } finally {
      setSavingApp(false);
    }
  };

  const handleToggleActive = async (app: PortalApp) => {
    setError(null);
    try {
      await updateAdminApp(app.id, {
        name: app.name,
        description: app.description,
        url: app.url,
        repositoryUrl: app.repositoryUrl,
        category: app.category,
        icon: app.icon,
        displayOrder: app.displayOrder,
        isActive: !app.isActive,
        authorizedRoles: app.authorizedRoles,
        authorizedEmails: app.authorizedEmails,
        openMode: app.openMode,
        xFrameOptionsDenied: app.xFrameOptionsDenied,
        preserveWorkspaceState: app.preserveWorkspaceState,
        accessMethod: app.accessMethod,
        integrationStatus: app.integrationStatus,
        integrationNotes: app.integrationNotes,
      });
      await loadAdminData();
      await onCatalogUpdated();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error cambiando estado activo.'
      );
    }
  };

  const handleMoveOrder = async (app: PortalApp, delta: -1 | 1) => {
    const newOrder = Math.max(1, app.displayOrder + delta);
    setError(null);
    try {
      await updateAdminApp(app.id, {
        name: app.name,
        description: app.description,
        url: app.url,
        repositoryUrl: app.repositoryUrl,
        category: app.category,
        icon: app.icon,
        displayOrder: newOrder,
        isActive: app.isActive,
        authorizedRoles: app.authorizedRoles,
        authorizedEmails: app.authorizedEmails,
        openMode: app.openMode,
        xFrameOptionsDenied: app.xFrameOptionsDenied,
        preserveWorkspaceState: app.preserveWorkspaceState,
        accessMethod: app.accessMethod,
        integrationStatus: app.integrationStatus,
        integrationNotes: app.integrationNotes,
      });
      await loadAdminData();
      await onCatalogUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al reordenar.');
    }
  };

  const handleConfirmDelete = async () => {
    if (!appToDelete) return;
    setDeletingApp(true);
    setError(null);
    try {
      await deleteAdminApp(appToDelete.id);
      setFeedback(`Plataforma "${appToDelete.name}" eliminada del catálogo.`);
      setAppToDelete(null);
      await loadAdminData();
      await onCatalogUpdated();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error al eliminar la plataforma.'
      );
    } finally {
      setDeletingApp(false);
    }
  };

  const handleCreateUser = async (e: FormEvent) => {
    e.preventDefault();
    setSavingUser(true);
    setError(null);
    setFeedback(null);
    try {
      await createAdminUser({
        fullName: newUserName,
        email: newUserEmail,
        role: newUserRole,
        password: newUserPassword,
      });
      setFeedback(`Usuario institucional "${newUserEmail}" creado correctamente.`);
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserRole('docente');
      await loadAdminData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error al crear el usuario.'
      );
    } finally {
      setSavingUser(false);
    }
  };

  const handleUpdateUser = async (
    user: PortalUser,
    nextRole: UserRole,
    nextActive: boolean
  ) => {
    setError(null);
    setFeedback(null);
    try {
      await updateAdminUser(user.id, { role: nextRole, isActive: nextActive });
      setFeedback(`Permisos de ${user.email} actualizados.`);
      await loadAdminData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error al actualizar el usuario.'
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-slate-200">
        <div className="space-y-2">
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
              Administración del catálogo y perfiles
            </h1>
            <p className="text-sm text-slate-600">
              Incorpora nuevas plataformas, ajusta orden, permisos de visibilidad y
              políticas de apertura sin modificar código. Todas las operaciones se
              validan en el servidor.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setTab('apps')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                tab === 'apps'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Catálogo ({apps.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('users')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                tab === 'users'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Usuarios ({users.length})
            </button>
          </div>

          {tab === 'apps' && (
            <button
              type="button"
              onClick={openCreateForm}
              className="px-4 py-2 rounded-lg bg-[#1e3a8a] hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Nueva plataforma</span>
            </button>
          )}
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

      {feedback && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
        >
          {feedback}
        </div>
      )}

      {/* Tab 1: Catalog Management */}
      {tab === 'apps' && (
        <>
          {isFormOpen && (
            <form
              onSubmit={handleSaveApp}
              className="rounded-xl border border-[#108981]/35 bg-white p-6 space-y-6"
              aria-label={
                editingAppId
                  ? 'Formulario de edición de plataforma'
                  : 'Formulario de nueva plataforma'
              }
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                <h2 className="font-display text-lg font-semibold text-slate-900">
                  {editingAppId
                    ? `Editar plataforma: ${formState.name}`
                    : 'Incorporar nueva plataforma al catálogo'}
                </h2>
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="text-xs font-medium text-slate-600 hover:text-slate-900"
                >
                  Cancelar
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="app-name"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Nombre de la aplicación
                  </label>
                  <input
                    id="app-name"
                    type="text"
                    required
                    value={formState.name}
                    onChange={(e) =>
                      setFormState((p) => ({ ...p, name: e.target.value }))
                    }
                    placeholder="Ej. Biblioteca Digital"
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm text-slate-900"
                  />
                </div>

                <div>
                  <label
                    htmlFor="app-url"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    URL de destino (https://)
                  </label>
                  <input
                    id="app-url"
                    type="url"
                    required
                    value={formState.url}
                    onChange={(e) =>
                      setFormState((p) => ({ ...p, url: e.target.value }))
                    }
                    placeholder="https://plataforma.vercel.app/"
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 font-mono text-xs text-slate-900"
                  />
                </div>

                <div className="md:col-span-2">
                  <label
                    htmlFor="app-description"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Descripción
                  </label>
                  <textarea
                    id="app-description"
                    required
                    rows={2}
                    value={formState.description}
                    onChange={(e) =>
                      setFormState((p) => ({
                        ...p,
                        description: e.target.value,
                      }))
                    }
                    placeholder="Describe brevemente el propósito de la plataforma para los usuarios."
                    className="w-full p-3 rounded-lg border border-slate-300 text-sm text-slate-900"
                  />
                </div>

                <div>
                  <label
                    htmlFor="app-category"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Categoría
                  </label>
                  <input
                    id="app-category"
                    type="text"
                    required
                    value={formState.category}
                    onChange={(e) =>
                      setFormState((p) => ({ ...p, category: e.target.value }))
                    }
                    placeholder="Ej. Gestión académica"
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm text-slate-900"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="app-icon"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      Icono
                    </label>
                    <select
                      id="app-icon"
                      value={formState.icon}
                      onChange={(e) =>
                        setFormState((p) => ({ ...p, icon: e.target.value }))
                      }
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm text-slate-900 bg-white"
                    >
                      {AVAILABLE_ICON_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="app-order"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      Orden
                    </label>
                    <input
                      id="app-order"
                      type="number"
                      min={1}
                      max={9999}
                      required
                      value={formState.displayOrder}
                      onChange={(e) =>
                        setFormState((p) => ({
                          ...p,
                          displayOrder: Number(e.target.value) || 1,
                        }))
                      }
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm text-slate-900 tabular-nums"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="app-open-mode"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Modo de apertura
                  </label>
                  <select
                    id="app-open-mode"
                    value={
                      formState.xFrameOptionsDenied
                        ? 'new_tab'
                        : formState.openMode
                    }
                    disabled={formState.xFrameOptionsDenied}
                    onChange={(e) =>
                      setFormState((p) => ({
                        ...p,
                        openMode: e.target.value as OpenMode,
                      }))
                    }
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm text-slate-900 bg-white disabled:bg-slate-100"
                  >
                    <option value="new_tab">Abrir en nueva pestaña</option>
                    <option value="embedded_verified">
                      Vista integrada en el portal (verificada)
                    </option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="app-access-method"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Método de acceso
                  </label>
                  <select
                    id="app-access-method"
                    value={formState.accessMethod}
                    onChange={(e) =>
                      setFormState((p) => ({
                        ...p,
                        accessMethod: e.target.value as AccessMethod,
                      }))
                    }
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm text-slate-900 bg-white"
                  >
                    <option value="direct_open">
                      Acceso directo sin inicio de sesión
                    </option>
                    <option value="supabase_email_password">
                      Supabase Auth (correo y contraseña)
                    </option>
                    <option value="google_workspace_oauth">
                      Google Workspace OAuth
                    </option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="app-integration-status"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Estado de integración
                  </label>
                  <select
                    id="app-integration-status"
                    value={formState.integrationStatus}
                    onChange={(e) =>
                      setFormState((p) => ({
                        ...p,
                        integrationStatus: e.target.value as IntegrationStatus,
                      }))
                    }
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm text-slate-900 bg-white"
                  >
                    <option value="ready_direct">
                      Operativa (acceso directo)
                    </option>
                    <option value="external_auth_pending_sso">
                      Auth externa · SSO pendiente
                    </option>
                    <option value="restricted_new_tab_only">
                      Solo pestaña nueva (X-Frame-Options: DENY)
                    </option>
                    <option value="requires_external_config">
                      Requiere configuración externa
                    </option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="app-repo-url"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Repositorio (opcional)
                  </label>
                  <input
                    id="app-repo-url"
                    type="url"
                    value={formState.repositoryUrl || ''}
                    onChange={(e) =>
                      setFormState((p) => ({
                        ...p,
                        repositoryUrl: e.target.value,
                      }))
                    }
                    placeholder="https://github.com/..."
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 font-mono text-xs text-slate-900"
                  />
                </div>

                <div className="md:col-span-2 space-y-2">
                  <span className="block text-xs font-medium text-slate-700">
                    Perfiles autorizados para ver el acceso en el portal
                  </span>
                  <div className="flex flex-wrap gap-3">
                    {ALL_ROLES.map((role) => {
                      const checked = formState.authorizedRoles.includes(role);
                      return (
                        <label
                          key={role}
                          className="inline-flex items-center gap-2 text-xs text-slate-800 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={role === 'admin'}
                            onChange={() => toggleRoleInForm(role)}
                            className="rounded border-slate-300 text-[#108981] focus:ring-[#108981]"
                          />
                          <span>{ROLE_LABELS[role]}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label
                    htmlFor="app-emails"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Correos autorizados adicionales (separados por coma)
                  </label>
                  <input
                    id="app-emails"
                    type="text"
                    value={emailsInput}
                    onChange={(e) => setEmailsInput(e.target.value)}
                    placeholder="docente.especialista@colegio.cl, utp@colegio.cl"
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm text-slate-900"
                  />
                </div>

                <div className="md:col-span-2">
                  <label
                    htmlFor="app-notes"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Notas técnicas y estado de permisos en destino
                  </label>
                  <input
                    id="app-notes"
                    type="text"
                    value={formState.integrationNotes}
                    onChange={(e) =>
                      setFormState((p) => ({
                        ...p,
                        integrationNotes: e.target.value,
                      }))
                    }
                    placeholder="Ej. Valida membresía en Supabase; respetar RLS de la app."
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm text-slate-900"
                  />
                </div>

                <div className="md:col-span-2 flex flex-wrap gap-6 pt-1">
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formState.isActive}
                      onChange={(e) =>
                        setFormState((p) => ({
                          ...p,
                          isActive: e.target.checked,
                        }))
                      }
                    />
                    <span>Plataforma activa (visible en catálogo)</span>
                  </label>

                  <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formState.xFrameOptionsDenied}
                      onChange={(e) =>
                        setFormState((p) => ({
                          ...p,
                          xFrameOptionsDenied: e.target.checked,
                          openMode: e.target.checked ? 'new_tab' : p.openMode,
                        }))
                      }
                    />
                    <span>Restricción X-Frame-Options: DENY (forzar pestaña nueva)</span>
                  </label>

                  <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formState.preserveWorkspaceState}
                      disabled={
                        formState.xFrameOptionsDenied ||
                        formState.openMode !== 'embedded_verified'
                      }
                      onChange={(e) =>
                        setFormState((p) => ({
                          ...p,
                          preserveWorkspaceState: e.target.checked,
                        }))
                      }
                    />
                    <span>Conservar vista integrada montada al cambiar de sección</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingApp}
                  className="px-5 py-2 rounded-lg bg-[#1e3a8a] hover:bg-blue-800 disabled:opacity-60 text-white text-xs font-semibold transition-colors"
                >
                  {savingApp
                    ? 'Guardando...'
                    : editingAppId
                    ? 'Guardar cambios'
                    : 'Crear plataforma'}
                </button>
              </div>
            </form>
          )}

          {/* Apps Table */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">Orden</th>
                    <th className="py-3 px-4">Plataforma</th>
                    <th className="py-3 px-4">Perfiles autorizados</th>
                    <th className="py-3 px-4">Apertura e integración</th>
                    <th className="py-3 px-4">Estado</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {loading ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="py-8 px-4 text-center text-slate-500"
                      >
                        Cargando catálogo administrativo...
                      </td>
                    </tr>
                  ) : (
                    apps.map((app) => (
                      <tr key={app.id} className="align-top hover:bg-slate-50/70">
                        <td className="py-3.5 px-4 tabular-nums">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs font-medium text-slate-700 w-6">
                              {app.displayOrder}
                            </span>
                            <button
                              type="button"
                              onClick={() => void handleMoveOrder(app, -1)}
                              aria-label={`Subir orden de ${app.name}`}
                              className="p-1 rounded hover:bg-slate-200 text-slate-500"
                            >
                              <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleMoveOrder(app, 1)}
                              aria-label={`Bajar orden de ${app.name}`}
                              className="p-1 rounded hover:bg-slate-200 text-slate-500"
                            >
                              <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-start gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#1e3a8a] flex items-center justify-center shrink-0 mt-0.5">
                              <AppIcon name={app.icon} className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-display font-semibold text-slate-900">
                                {app.name}
                              </p>
                              <p className="text-xs text-slate-500">
                                {app.category}
                              </p>
                              <p className="font-mono text-[11px] text-slate-400 truncate max-w-xs mt-0.5">
                                {app.url}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-xs text-slate-700">
                          <p>
                            {app.authorizedRoles
                              .map((r) => ROLE_LABELS[r])
                              .join(' · ')}
                          </p>
                          {app.authorizedEmails.length > 0 && (
                            <p className="text-slate-500 mt-1">
                              Correos: {app.authorizedEmails.join(', ')}
                            </p>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-xs text-slate-700 space-y-1">
                          <p className="font-medium text-slate-900">
                            {app.openMode === 'embedded_verified' &&
                            !app.xFrameOptionsDenied
                              ? 'Vista integrada verificada'
                              : 'Nueva pestaña'}
                          </p>
                          <p className="text-slate-500">
                            {getAccessMethodLabel(app.accessMethod)}
                          </p>
                          <p className="text-slate-500">
                            {getIntegrationStatusLabel(app.integrationStatus)}
                          </p>
                        </td>
                        <td className="py-3.5 px-4">
                          <button
                            type="button"
                            onClick={() => void handleToggleActive(app)}
                            className={`px-2.5 py-1 rounded-md border text-xs font-medium whitespace-nowrap ${
                              app.isActive
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                                : 'border-slate-300 bg-slate-100 text-slate-600'
                            }`}
                          >
                            {app.isActive ? 'Activa' : 'Inactiva'}
                          </button>
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEditForm(app)}
                              aria-label={`Editar ${app.name}`}
                              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700"
                            >
                              <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setAppToDelete(app)}
                              aria-label={`Eliminar ${app.name}`}
                              className="p-2 rounded-lg border border-slate-200 hover:bg-red-50 hover:border-red-200 text-red-700"
                            >
                              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Tab 2: Users & Roles Management */}
      {tab === 'users' && (
        <div className="space-y-6">
          <form
            onSubmit={handleCreateUser}
            className="rounded-xl border border-slate-200 bg-white p-6 space-y-4"
          >
            <div className="flex items-center gap-2 text-slate-900">
              <Users className="w-4 h-4 text-[#108981]" aria-hidden="true" />
              <h2 className="font-display text-base font-semibold">
                Crear usuario institucional
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label
                  htmlFor="new-user-name"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Nombre completo
                </label>
                <input
                  id="new-user-name"
                  type="text"
                  required
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="Ej. Luis Paredes"
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm"
                />
              </div>

              <div>
                <label
                  htmlFor="new-user-email"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Correo institucional
                </label>
                <input
                  id="new-user-email"
                  type="email"
                  required
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="luis@colegio.cl"
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm"
                />
              </div>

              <div>
                <label
                  htmlFor="new-user-role"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Perfil en el portal
                </label>
                <select
                  id="new-user-role"
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm bg-white"
                >
                  {ALL_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="new-user-password"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Contraseña inicial
                </label>
                <input
                  id="new-user-password"
                  type="password"
                  required
                  minLength={8}
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingUser}
                className="px-4 py-2 rounded-lg bg-[#1e3a8a] hover:bg-blue-800 disabled:opacity-60 text-white text-xs font-semibold transition-colors"
              >
                {savingUser ? 'Creando...' : 'Agregar usuario'}
              </button>
            </div>
          </form>

          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">Nombre</th>
                    <th className="py-3 px-4">Correo</th>
                    <th className="py-3 px-4">Perfil</th>
                    <th className="py-3 px-4">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {users.map((u) => {
                    const isSelf = u.id === currentUser.id;
                    return (
                      <tr key={u.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 font-medium text-slate-900">
                          {u.fullName}
                          {isSelf && (
                            <span className="text-xs text-[#108981] ml-2">
                              (Tu sesión)
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600 font-mono">
                          {u.email}
                        </td>
                        <td className="py-3 px-4">
                          <select
                            aria-label={`Perfil de ${u.email}`}
                            value={u.role}
                            disabled={isSelf}
                            onChange={(e) =>
                              void handleUpdateUser(
                                u,
                                e.target.value as UserRole,
                                u.isActive
                              )
                            }
                            className="h-8 px-2 rounded-md border border-slate-300 text-xs bg-white disabled:bg-slate-100"
                          >
                            {ALL_ROLES.map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABELS[r]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-3 px-4">
                          <button
                            type="button"
                            disabled={isSelf}
                            onClick={() =>
                              void handleUpdateUser(u, u.role, !u.isActive)
                            }
                            className={`px-2.5 py-1 rounded-md border text-xs font-medium disabled:opacity-50 ${
                              u.isActive
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                                : 'border-slate-300 bg-slate-100 text-slate-600'
                            }`}
                          >
                            {u.isActive ? 'Activo' : 'Inactivo'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Custom Delete Confirmation Modal */}
      {appToDelete && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
        >
          <div className="w-full max-w-md rounded-xl bg-white border border-slate-200 p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-50 text-red-700 flex items-center justify-center shrink-0">
                <Shield className="w-5 h-5" aria-hidden="true" />
              </div>
              <div>
                <h3
                  id="delete-modal-title"
                  className="font-display text-base font-semibold text-slate-900"
                >
                  Eliminar "{appToDelete.name}" del catálogo
                </h3>
                <p className="text-sm text-slate-600 mt-1">
                  Esta acción retirará el acceso de "{appToDelete.name}" del
                  portal para todos los perfiles. La aplicación externa seguirá
                  funcionando en su URL original.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setAppToDelete(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deletingApp}
                onClick={() => void handleConfirmDelete()}
                className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-800 disabled:opacity-60 text-white text-xs font-semibold"
              >
                {deletingApp ? 'Eliminando...' : 'Confirmar eliminación'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
