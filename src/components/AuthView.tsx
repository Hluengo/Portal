import { useState, type FormEvent } from 'react';
import { ArrowLeft, Lock, Mail, ShieldCheck, UserCheck } from 'lucide-react';
import {
  loginInstitutionalUser,
  registerInstitutionalUser,
  setupInitialAdmin,
} from '../services/api.ts';
import type { BootstrapStatus, PortalUser } from '../types/portal.ts';

interface AuthViewProps {
  bootstrap: BootstrapStatus;
  onAuthenticated: (user: PortalUser) => void;
}

export function AuthView({ bootstrap, onAuthenticated }: AuthViewProps) {
  const [mode, setMode] = useState<'login' | 'register' | 'setup_admin'>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode !== 'login' && password !== confirmPassword) {
      setError('Las contraseñas ingresadas no coinciden.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'setup_admin') {
        const res = await setupInitialAdmin({ fullName, email, password });
        onAuthenticated(res.user);
      } else if (mode === 'register') {
        const res = await registerInstitutionalUser({ fullName, email, password });
        onAuthenticated(res.user);
      } else {
        const res = await loginInstitutionalUser({ email, password });
        onAuthenticated(res.user);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudo iniciar sesión.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f7fa] grid lg:grid-cols-12 items-stretch">
      {/* Left Institutional Architectural Panel */}
      <div className="relative hidden lg:flex lg:col-span-6 xl:col-span-7 bg-[#1e3a8a] overflow-hidden flex-col justify-between p-12 text-white">
        {!imageFailed ? (
          <img
            src="/src/assets/images/colegio_carmela_romero.jpg"
            alt="Colegio Carmela Romero de Espinosa, Concepción"
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#1e3a8a] via-blue-950 to-slate-900" />
        )}
        <div
          className="absolute inset-0 bg-gradient-to-t from-[#1e3a8a]/95 via-[#1e3a8a]/65 to-[#1e3a8a]/35"
          aria-hidden="true"
        />

        <div className="relative z-10 flex items-center gap-3.5">
          <img
            src="/logo.svg"
            alt="Insignia Colegio Carmela Romero de Espinosa"
            className="institutional-logo institutional-logo--on-dark h-12 w-auto shrink-0"
          />
          <div className="min-w-0">
            <span className="font-display text-lg font-semibold tracking-tight text-white block leading-tight">
              Portal Interno Escolar
            </span>
            <span className="text-xs text-blue-100 block">
              Colegio Carmela Romero de Espinosa
            </span>
          </div>
        </div>

        <div className="relative z-10 max-w-xl space-y-6">
          <h1 className="font-display text-4xl font-semibold tracking-tight leading-tight text-white text-balance">
            Todas tus plataformas institucionales en una sola visual.
          </h1>
          <p className="text-base text-slate-100 leading-relaxed">
            Acceso inmediato a Registro Escolar, Tarjetas Flow, Neurodiversidad y
            Gestión de Casos, junto con Gmail y el Calendario compartido de Google
            Workspace.
          </p>

          <div className="pt-4 border-t border-white/15 grid grid-cols-2 gap-6 text-sm">
            <div>
              <p className="font-display font-semibold text-white">
                Permisos por perfil
              </p>
              <p className="text-blue-100 mt-1">
                Visibilidad administrada en el portal y validación efectiva en cada
                servicio destino.
              </p>
            </div>
            <div>
              <p className="font-display font-semibold text-white">
                Trabajo sin interrupciones
              </p>
              <p className="text-blue-100 mt-1">
                Conserva abiertas tus herramientas docentes integradas mientras
                consultas tu agenda.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Auth Form Column */}
      <main className="lg:col-span-6 xl:col-span-5 flex flex-col justify-center px-6 py-10 sm:px-12 lg:px-16 bg-white border-l border-slate-200">
        <div className="w-full max-w-md mx-auto space-y-8">
          <div className="space-y-2">
            <div className="lg:hidden flex items-center gap-2.5 text-[#1e3a8a] mb-4">
              <img
                src="/logo.svg"
                alt="Insignia Colegio Carmela Romero de Espinosa"
                className="institutional-logo h-10 w-auto shrink-0"
              />
              <span className="font-display text-base font-semibold">
                Portal Interno Escolar
              </span>
            </div>

            {mode === 'setup_admin' && (
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                  setFullName('');
                  setEmail('');
                  setPassword('');
                  setConfirmPassword('');
                }}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 mb-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Volver al ingreso</span>
              </button>
            )}

            <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
              {mode === 'setup_admin'
                ? 'Activar administración inicial'
                : mode === 'register'
                ? 'Registro de usuario'
                : 'Ingreso Docente'}
            </h2>
            <p className="text-sm text-slate-600">
              {mode === 'setup_admin'
                ? 'Define la contraseña de administración inicial para el correo autorizado del establecimiento.'
                : mode === 'register'
                ? 'Regístrate con tu correo institucional. Todas las cuentas nuevas se registran como usuario estándar.'
                : 'Inicia sesión con tu cuenta docente o del establecimiento.'}
            </p>
          </div>

          {/* Standard Mode Tabs (Login & User Registration only) */}
          {mode !== 'setup_admin' && (
            <div
              className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200"
              role="tablist"
              aria-label="Opciones de acceso"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'login'}
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
                className={`flex-1 px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  mode === 'login'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Iniciar sesión
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'register'}
                onClick={() => {
                  setMode('register');
                  setError(null);
                  setFullName('');
                  setEmail('');
                }}
                className={`flex-1 px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  mode === 'register'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Registrarse
              </button>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              {error}
            </div>
          )}

          {mode === 'setup_admin' && (
            <div className="rounded-lg border border-[#108981]/30 bg-[#108981]/10 px-4 py-3 text-xs text-slate-900 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-[#108981] shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                Activación única reservada para {bootstrap.adminEmailHint}. Se
                bloquea automáticamente tras definir la contraseña.
              </span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode !== 'login' && (
              <div>
                <label
                  htmlFor="auth-fullname"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Nombre completo
                </label>
                <div className="relative">
                  <UserCheck
                    className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                    aria-hidden="true"
                  />
                  <input
                    id="auth-fullname"
                    type="text"
                    required
                    minLength={2}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Ej. Carolina Méndez"
                    className="w-full h-11 pl-9 pr-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#108981] focus:border-[#108981]"
                  />
                </div>
              </div>
            )}

            <div>
              <label
                htmlFor="auth-email"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Correo institucional
              </label>
              <div className="relative">
                <Mail
                  className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                  aria-hidden="true"
                />
                <input
                  id="auth-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nombre@colegio.cl"
                  className="w-full h-11 pl-9 pr-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#108981] focus:border-[#108981]"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="auth-password"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Contraseña
              </label>
              <div className="relative">
                <Lock
                  className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                  aria-hidden="true"
                />
                <input
                  id="auth-password"
                  type="password"
                  required
                  minLength={mode === 'login' ? 1 : 8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={
                    mode === 'login'
                      ? 'Ingresa tu contraseña'
                      : 'Mínimo 8 caracteres'
                  }
                  className="w-full h-11 pl-9 pr-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#108981] focus:border-[#108981]"
                />
              </div>
            </div>

            {mode !== 'login' && (
              <div>
                <label
                  htmlFor="auth-password-confirm"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Confirmar contraseña
                </label>
                <div className="relative">
                  <Lock
                    className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                    aria-hidden="true"
                  />
                  <input
                    id="auth-password-confirm"
                    type="password"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repite la contraseña"
                    className="w-full h-11 pl-9 pr-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#108981] focus:border-[#108981]"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-11 px-4 rounded-lg bg-[#1e3a8a] hover:bg-blue-950 disabled:opacity-60 text-white font-display text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#108981]"
            >
              {submitting
                ? 'Validando acceso...'
                : mode === 'setup_admin'
                ? 'Guardar contraseña y entrar como Administrador'
                : mode === 'register'
                ? 'Registrarse como usuario'
                : 'Entrar al portal'}
            </button>
          </form>

          {bootstrap.needsAdminSetup && mode !== 'setup_admin' && (
            <div className="pt-4 border-t border-slate-200 text-center">
              <button
                type="button"
                onClick={() => {
                  setMode('setup_admin');
                  setError(null);
                  setFullName('Administrador Institucional');
                  setEmail(bootstrap.adminEmailHint);
                  setPassword('');
                  setConfirmPassword('');
                }}
                className="text-xs font-medium text-slate-500 hover:text-[#108981] transition-colors"
              >
                ¿Primera configuración? Activar cuenta de administración inicial
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
