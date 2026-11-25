export type PeriodId = string
export type ThemeMode = 'dark' | 'light'
export type AccentId = 'violet' | 'cyan' | 'emerald' | 'sunset' | 'rose'
export type Density = 'comfortable' | 'compact'

export interface Settings {
  theme: ThemeMode
  accent: AccentId
  density: Density
  motion: boolean
  sidebarCollapsed: boolean
}

export interface Student {
  firstName: string
  lastName: string
  className: string
  level: string
  establishment: string
  city: string
  email: string
  authMethod?: 'demo' | 'oidc' | 'password'
  authLabel?: string
  subject?: string
}

export interface Subject {
  id: string
  name: string
  short: string
  color: string
  teacher: string
  coef: number
}

export interface Grade {
  id: string
  subjectId: string
  title: string
  value: number | null
  outOf: number
  coef: number
  date: string
  classAvg: number | null
  comment?: string
  period: PeriodId
  kind: 'devoir' | 'controle' | 'oral' | 'dm'
}

export interface Lesson {
  id: string
  subjectId: string
  weekday: number
  /** Date réelle du cours (YYYY-MM-DD), absente pour les données de démonstration. */
  date?: string
  start: string
  end: string
  room: string
  status: 'normal' | 'canceled' | 'modified'
  note?: string
}

export interface Homework {
  id: string
  subjectId: string
  title: string
  details: string
  due: string
  minutes: number
  type: 'exercices' | 'lecture' | 'dm' | 'revisions' | 'oral'
  /** Déjà marqué fait dans PRONOTE. */
  done?: boolean
}

export interface LifeEvent {
  id: string
  type: 'absence' | 'retard' | 'sanction' | 'note'
  date: string
  start?: string
  end?: string
  reason: string
  justified: boolean
  subjectId?: string
  durationHours?: number
}

export interface Attachment {
  name: string
  size: string
}

export interface ThreadMessage {
  id: string
  body: string
  at: string
  fromMe: boolean
}

export interface Thread {
  id: string
  from: string
  role: string
  subject: string
  preview: string
  body: string[]
  at: string
  unread: boolean
  starred: boolean
  color: string
  attachment?: Attachment
  replies: ThreadMessage[]
  folder: 'inbox' | 'sent'
}

export interface Resource {
  id: string
  subjectId: string
  title: string
  type: 'pdf' | 'lien' | 'video' | 'exercice'
  meta: string
  description: string
}

export interface NewsItem {
  id: string
  title: string
  excerpt: string
  category: string
  date: string
  emoji: string
  color: string
}

export interface Period {
  id: PeriodId
  label: string
  range: string
}

export interface SchoolPeriod {
  id: PeriodId
  pronoteId?: string
  name: string
  start: string
  end: string
  range: string
}

export interface SchoolSubjectAverage {
  period: PeriodId
  subjectId: string
  student: number | null
  classAverage: number | null
  outOf: number
  min: number | null
  max: number | null
}

/** Données lues sur le compte PRONOTE de l'élève, sans donnée inventée. */
export interface SchoolData {
  source: 'pronote'
  syncedAt: string
  periods: SchoolPeriod[]
  currentPeriodId: PeriodId | null
  generalAverage: number | null
  classGeneralAverage: number | null
  subjects: Subject[]
  grades: Grade[]
  averages: SchoolSubjectAverage[]
  lessons: Lesson[]
  homework: Homework[]
  lifeEvents: LifeEvent[]
  threads: Thread[]
  news: NewsItem[]
  student: {
    name: string
    className: string
    establishment: string
  }
}

export interface SchoolError {
  code: string
  message: string
}

export interface PersistedState {
  version: 1
  session: Student | null
  school: SchoolData | null
  schoolError: SchoolError | null
  settings: Settings
  homeworkDone: Record<string, boolean>
  readThreads: string[]
  starredThreads: string[]
  replies: Record<string, ThreadMessage[]>
  sentThreads: Thread[]
  favorites: string[]
  justified: string[]
}
