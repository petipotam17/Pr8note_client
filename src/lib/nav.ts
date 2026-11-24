import {
  CalendarDays,
  GraduationCap,
  LayoutDashboard,
  Library,
  ListChecks,
  MessagesSquare,
  Settings2,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  short: string
  icon: LucideIcon
  description: string
  mobile: boolean
}

export const NAV: NavItem[] = [
  {
    to: '/',
    label: 'Tableau de bord',
    short: 'Accueil',
    icon: LayoutDashboard,
    description: 'Vue d’ensemble de ta journée',
    mobile: true,
  },
  {
    to: '/emploi-du-temps',
    label: 'Emploi du temps',
    short: 'EDT',
    icon: CalendarDays,
    description: 'Tes cours, semaine par semaine',
    mobile: true,
  },
  {
    to: '/devoirs',
    label: 'Devoirs',
    short: 'Devoirs',
    icon: ListChecks,
    description: 'À faire, en retard, terminé',
    mobile: true,
  },
  {
    to: '/notes',
    label: 'Notes',
    short: 'Notes',
    icon: GraduationCap,
    description: 'Moyennes, progrès et simulateur',
    mobile: true,
  },
  {
    to: '/messages',
    label: 'Messagerie',
    short: 'Messages',
    icon: MessagesSquare,
    description: 'Échanges avec l’équipe pédagogique',
    mobile: true,
  },
  {
    to: '/vie-scolaire',
    label: 'Vie scolaire',
    short: 'Vie sco.',
    icon: ShieldCheck,
    description: 'Absences, retards et suivi',
    mobile: false,
  },
  {
    to: '/ressources',
    label: 'Ressources',
    short: 'Ressources',
    icon: Library,
    description: 'Documents et liens utiles',
    mobile: false,
  },
  {
    to: '/reglages',
    label: 'Réglages',
    short: 'Réglages',
    icon: Settings2,
    description: 'Apparence, données et raccourcis',
    mobile: false,
  },
]

export function pageTitle(pathname: string): { title: string; description: string } {
  const item = NAV.find((entry) => (entry.to === '/' ? pathname === '/' : pathname.startsWith(entry.to)))
  return item
    ? { title: item.label, description: item.description }
    : { title: 'Pr8note', description: 'Ton espace scolaire' }
}
