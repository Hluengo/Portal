import { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  GitBranch,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { getIntegrationsStatus, getSsoAudit } from '../services/api.ts';
import type {
  ExternalIntegrationStatus,
  RepoAuditItem,
} from '../types/portal.ts';

function renderStatusIcon(status: ExternalIntegrationStatus['status']) {
  switch (status) {
    case 'ready':
    case 'connected':
      return <CheckCircle2 className="w-4 h-4 text-emerald-700" aria-hidden="true" />;
    case 'pending_config':
      return <Clock className="w-4 h-4 text-amber-700" aria-hidden="true" />;
    case 'restricted':
      return <ShieldAlert className="w-4 h-4 text-amber-700" aria-hidden="true" />;
    case 'error':
      return <AlertCircle className="w-4 h-4 text-red-700" aria-hidden="true" />;
  }
}

export function SsoAuditView({
  googleCalendarConnected,
  onBack,
}: {
  googleCalendarConnected: boolean;
  onBack?: () => void;
}) {
  const [integrations, setIntegrations] = useState<ExternalIntegrationStatus[]>(
    []
  );
  const [audit, setAudit] = useState<RepoAuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusRes, auditRes] = await Promise.all([
        getIntegrationsStatus(),
        getSsoAudit(),
      ]);
      setIntegrations(statusRes.integrations);
      setAudit(auditRes.audit);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo cargar el estado de integraciones.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  return (
    <div className="space-y-8">
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
              Integraciones externas y preparación de ingreso único (SSO)
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              Estado real de cada integración externa y diagnóstico técnico verificado
              sobre los cuatro repositorios para habilitar autenticación unificada sin
              exponer credenciales en URLs ni eludir las reglas de membresía.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void loadData()}
          disabled={loading}
          className="px-3.5 py-2 rounded-lg border border-[#108981]/30 bg-[#108981]/10 hover:bg-[#108981]/15 text-xs font-medium text-[#0d736c] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          <span>Comprobar estado</span>
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </div>
      )}

      {/* Real-time External Integrations Status Table */}
      <section aria-labelledby="ext-status-heading" className="space-y-3">
        <h2
          id="ext-status-heading"
          className="font-display text-base font-semibold text-slate-900"
        >
          Estado real de servicios e integraciones externas
        </h2>

        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Servicio / Plataforma</th>
                  <th className="py-3 px-4">Configuración externa</th>
                  <th className="py-3 px-4">Estado actual</th>
                  <th className="py-3 px-4">Detalle operativo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {loading && integrations.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 px-4 text-center text-slate-500">
                      Verificando integraciones y cabeceras HTTP...
                    </td>
                  </tr>
                ) : (
                  integrations.map((item) => {
                    const effectiveStatus =
                      item.id === 'ext-google-calendar' && googleCalendarConnected
                        ? 'connected'
                        : item.status;
                    const effectiveLabel =
                      item.id === 'ext-google-calendar' && googleCalendarConnected
                        ? 'Conectado en sesión actual'
                        : item.statusLabel;

                    return (
                      <tr key={item.id} className="align-top hover:bg-slate-50/70">
                        <td className="py-3.5 px-4">
                          <p className="font-display font-semibold text-slate-900">
                            {item.name}
                          </p>
                          <p className="text-xs text-slate-500">{item.category}</p>
                        </td>
                        <td className="py-3.5 px-4 text-xs text-slate-700 whitespace-nowrap">
                          {item.requiresExternalConfig
                            ? 'Sí (servicio externo)'
                            : 'No requiere configuración adicional'}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-800 whitespace-nowrap">
                            {renderStatusIcon(effectiveStatus)}
                            <span>{effectiveLabel}</span>
                          </div>
                          {item.xFrameOptions && (
                            <p className="font-mono text-[11px] text-slate-500 mt-1">
                              X-Frame-Options: {item.xFrameOptions}
                            </p>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-xs text-slate-600 max-w-md leading-relaxed">
                          {item.detail}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Repository Inspection & SSO Preparation Document */}
      <section aria-labelledby="repo-audit-heading" className="space-y-4">
        <div className="space-y-1">
          <h2
            id="repo-audit-heading"
            className="font-display text-base font-semibold text-slate-900"
          >
            Inspección de repositorios y plan de cambios para ingreso único (SSO)
          </h2>
          <p className="text-xs text-slate-600">
            Revisión técnica sobre los repositorios reales en GitHub. Antes de
            activar un proveedor único, verifica el proyecto Supabase compartido,
            identidades existentes, proveedores habilitados y membresías por
            aplicación.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {audit.map((repo) => (
            <article
              key={repo.repoUrl}
              className="rounded-xl border border-slate-200 bg-white p-6 space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="font-display text-base font-semibold text-slate-900">
                    {repo.appName}
                  </h3>
                  <p className="font-mono text-xs text-slate-500 mt-0.5">
                    {repo.liveUrl}
                  </p>
                </div>
                <a
                  href={repo.repoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50/80 hover:bg-blue-100 text-xs font-medium text-[#1e3a8a] inline-flex items-center gap-1.5 whitespace-nowrap self-start sm:self-auto transition-colors"
                >
                  <GitBranch className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Ver repositorio</span>
                  <ExternalLink className="w-3 h-3" aria-hidden="true" />
                </a>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <p className="font-semibold text-slate-800 mb-1">
                    Autenticación detectada
                  </p>
                  <p className="text-slate-600 leading-relaxed">{repo.authStack}</p>
                </div>
                <div>
                  <p className="font-semibold text-slate-800 mb-1">
                    Control de membresía y permisos
                  </p>
                  <p className="text-slate-600 leading-relaxed">
                    {repo.membershipMechanism}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-slate-800 mb-1">
                    Restricciones de marco (iframe / CSP)
                  </p>
                  <p className="text-slate-600 leading-relaxed">
                    {repo.framingConstraint}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-slate-800 mb-1">
                    Identidades y proyecto compartido
                  </p>
                  <p className="text-slate-600 leading-relaxed">
                    {repo.existingIdentitiesNotes}
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-800 mb-2">
                  Modificaciones requeridas antes de habilitar SSO:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-xs text-slate-600">
                  {repo.requiredModifications.map((step, i) => (
                    <li key={i} className="leading-relaxed">
                      {step}
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
