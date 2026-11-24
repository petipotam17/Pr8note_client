export type PeriodId = 'T1' | 'T2'
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

export interface PersistedState {
  version: 1
  session: Student | null
  settings: Settings
  homeworkDone: Record<string, boolean>
  readThreads: string[]
  starredThreads: string[]
  replies: Record<string, ThreadMessage[]>
  sentThreads: Thread[]
  favorites: string[]
  justified: string[]
}
