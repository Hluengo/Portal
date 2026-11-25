import { useState } from 'react';
import { ArrowLeft, ExternalLink, RotateCw, X } from 'lucide-react';
import { isValidAppUrl } from '../lib/portalLogic.ts';
import type { PortalApp } from '../types/portal.ts';

interface KeepAliveWorkspaceProps {
  openedApps: PortalApp[];
  activeAppId: string | null;
  isVisible: boolean;
  onSelectApp: (appId: string) => void;
  onCloseApp: (appId: string) => void;
  onBackToCatalog: () => void;
}

export function KeepAliveWorkspace({
  openedApps,
  activeAppId,
  isVisible,
  onSelectApp,
  onCloseApp,
  onBackToCatalog,
}: KeepAliveWorkspaceProps) {
  const [reloadNonceById, setReloadNonceById] = useState<Record<string, number>>(
    {}
  );

  if (openedApps.length === 0) {
    return null;
  }

  const activeApp =
    openedApps.find((a) => a.id === activeAppId) ?? openedApps[0];

  return (
    <div
      className={
        isVisible
          ? 'flex flex-col h-[calc(100vh-8.5rem)] min-h-[540px] rounded-xl border border-slate-200 bg-white overflow-hidden'
          : 'hidden'
      }
      data-testid="keep-alive-workspace"
    >
      {/* Keep-Alive Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-2 min-w-0 overflow-x-auto">
          <button
            type="button"
            onClick={onBackToCatalog}
            className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Volver</span>
          </button>

          <div className="flex items-center gap-1 pl-2 border-l border-slate-200">
            {openedApps.map((app) => {
              const selected = app.id === activeApp.id;
              return (
                <div
                  key={app.id}
                  className={`inline-flex items-center rounded-lg border text-xs ${
                    selected
                      ? 'bg-white border-slate-300 text-slate-900 font-semibold'
                      : 'bg-transparent border-transparent text-slate-600 hover:bg-slate-200/60'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectApp(app.id)}
                    className="px-3 py-1.5 whitespace-nowrap"
                  >
                    {app.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => onCloseApp(app.id)}
                    aria-label={`Cerrar vista integrada de ${app.name}`}
                    className="pr-2 py-1.5 text-slate-400 hover:text-slate-700"
                  >
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {activeApp.preserveWorkspaceState && (
            <span className="hidden sm:inline text-xs text-slate-500">
              Estado conservado al cambiar de sección
            </span>
          )}
          <button
            type="button"
            onClick={() =>
              setReloadNonceById((prev) => ({
                ...prev,
                [activeApp.id]: (prev[activeApp.id] || 0) + 1,
              }))
            }
            className="px-3 py-1.5 rounded-lg border border-[#108981]/30 bg-[#108981]/10 hover:bg-[#108981]/15 text-xs font-medium text-[#0d736c] inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
          >
            <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Recargar vista</span>
          </button>
          <a
            href={isValidAppUrl(activeApp.url) ? activeApp.url : '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-lg bg-[#1e3a8a] hover:bg-blue-800 text-white text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
          >
            <span>Abrir en pestaña nueva</span>
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          </a>
        </div>
      </div>

      {/* Persistent Mounted Iframes (hidden via CSS instead of unmounted) */}
      <div className="relative flex-1 bg-white">
        {openedApps.map((app) => {
          const isCurrent = app.id === activeApp.id;
          const safeSrc = isValidAppUrl(app.url) ? app.url : 'about:blank';
          const nonce = reloadNonceById[app.id] || 0;
          return (
            <iframe
              key={`${app.id}-${nonce}`}
              src={safeSrc}
              title={app.name}
              className={
                isCurrent ? 'w-full h-full border-0 block' : 'hidden'
              }
              sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-popups"
            />
          );
        })}
      </div>
    </div>
  );
}
