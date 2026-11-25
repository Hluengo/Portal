import {
  BookOpen,
  Brain,
  Calendar,
  ClipboardCheck,
  CreditCard,
  FileText,
  FolderKanban,
  Globe,
  GraduationCap,
  Mail,
  ShieldAlert,
  Users,
} from 'lucide-react';

export const AVAILABLE_ICON_OPTIONS = [
  { value: 'GraduationCap', label: 'Académico' },
  { value: 'CreditCard', label: 'Tarjetas / Nóminas' },
  { value: 'Brain', label: 'Neurodiversidad / PIE' },
  { value: 'ShieldAlert', label: 'Convivencia / Casos' },
  { value: 'BookOpen', label: 'Biblioteca / Guías' },
  { value: 'Users', label: 'Equipos / Personas' },
  { value: 'FileText', label: 'Documentos' },
  { value: 'ClipboardCheck', label: 'Evaluación / Registro' },
  { value: 'FolderKanban', label: 'Gestión / Proyectos' },
  { value: 'Calendar', label: 'Agenda' },
  { value: 'Mail', label: 'Correo' },
  { value: 'Globe', label: 'Plataforma Web' },
];

export function AppIcon({
  name,
  className = 'w-5 h-5',
}: {
  name: string;
  className?: string;
}) {
  switch (name) {
    case 'GraduationCap':
      return <GraduationCap className={className} aria-hidden="true" />;
    case 'CreditCard':
      return <CreditCard className={className} aria-hidden="true" />;
    case 'Brain':
      return <Brain className={className} aria-hidden="true" />;
    case 'ShieldAlert':
      return <ShieldAlert className={className} aria-hidden="true" />;
    case 'BookOpen':
      return <BookOpen className={className} aria-hidden="true" />;
    case 'Users':
      return <Users className={className} aria-hidden="true" />;
    case 'FileText':
      return <FileText className={className} aria-hidden="true" />;
    case 'ClipboardCheck':
      return <ClipboardCheck className={className} aria-hidden="true" />;
    case 'FolderKanban':
      return <FolderKanban className={className} aria-hidden="true" />;
    case 'Calendar':
      return <Calendar className={className} aria-hidden="true" />;
    case 'Mail':
      return <Mail className={className} aria-hidden="true" />;
    default:
      return <Globe className={className} aria-hidden="true" />;
  }
}
