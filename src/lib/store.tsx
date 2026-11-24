import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import type { PersistedState, Settings, Student, Thread } from '../types'
import { STUDENT, THREADS } from '../data/seed'
import { applyTheme, DEFAULT_SETTINGS } from './theme'

const STORAGE_KEY = 'pr8note:state:v1'

export type ToastTone = 'success' | 'info' | 'error'

export interface Toast {
  id: string
  message: string
  tone: ToastTone
}

interface StoreValue {
  state: PersistedState
  toasts: Toast[]
  signIn: (student?: Student) => void
  signOut: () => void
  toggleHomework: (id: string) => void
  markRead: (id: string) => void
  toggleStar: (id: string) => void
  addReply: (threadId: string, body: string) => void
  sendThread: (payload: { to: string; subject: string; body: string }) => void
  toggleFavorite: (id: string) => void
  justify: (id: string) => void
  updateSettings: (patch: Partial<Settings>) => void
  resetDemo: () => void
  exportData: () => void
  importData: (file: File) => Promise<void>
  dismissToast: (id: string) => void
  toast: (message: string, tone?: ToastTone) => void
}

const StoreContext = createContext<StoreValue | null>(null)

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function createInitialState(): PersistedState {
  return {
    version: 1,
    session: null,
    settings: { ...DEFAULT_SETTINGS },
    homeworkDone: {},
    readThreads: THREADS.filter((thread) => !thread.unread).map((thread) => thread.id),
    starredThreads: THREADS.filter((thread) => thread.starred).map((thread) => thread.id),
    replies: {},
    sentThreads: [],
    favorites: ['res-1', 'res-3'],
    justified: [],
  }
}

function loadState(): PersistedState {
  const base = createInitialState()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return base
    const parsed = JSON.parse(raw) as Partial<PersistedState>
    if (!parsed || typeof parsed !== 'object') return base
    return {
      ...base,
      ...parsed,
      version: 1,
      settings: { ...base.settings, ...(parsed.settings ?? {}) },
      homeworkDone: { ...(parsed.homeworkDone ?? {}) },
      readThreads: Array.isArray(parsed.readThreads) ? parsed.readThreads : base.readThreads,
      starredThreads: Array.isArray(parsed.starredThreads) ? parsed.starredThreads : base.starredThreads,
      replies: { ...(parsed.replies ?? {}) },
      sentThreads: Array.isArray(parsed.sentThreads) ? parsed.sentThreads : [],
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites : base.favorites,
      justified: Array.isArray(parsed.justified) ? parsed.justified : [],
    }
  } catch {
    return base
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(loadState)
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // The app still works in-memory when storage is unavailable (e.g. some file:// contexts).
    }
  }, [state])

  useEffect(() => {
    applyTheme(state.settings)
  }, [state.settings])

  const dismissToast = useCallback((id: string) => {
    setToasts((list) => list.filter((item) => item.id !== id))
    const timer = timers.current.get(id)
    if (timer) window.clearTimeout(timer)
    timers.current.delete(id)
  }, [])

  const toast = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = uid()
    setToasts((list) => [...list.slice(-3), { id, message, tone }])
    const timer = window.setTimeout(() => {
      setToasts((list) => list.filter((item) => item.id !== id))
      timers.current.delete(id)
    }, 3800)
    timers.current.set(id, timer)
  }, [])

  useEffect(() => {
    const map = timers.current
    return () => map.forEach((timer) => window.clearTimeout(timer))
  }, [])

  const signIn = useCallback((student: Student = STUDENT) => {
    setState((prev) => ({ ...prev, session: student }))
  }, [])

  const signOut = useCallback(() => {
    setState((prev) => ({ ...prev, session: null }))
  }, [])

  const toggleHomework = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      homeworkDone: { ...prev.homeworkDone, [id]: !prev.homeworkDone[id] },
    }))
  }, [])

  const markRead = useCallback((id: string) => {
    setState((prev) =>
      prev.readThreads.includes(id) ? prev : { ...prev, readThreads: [...prev.readThreads, id] },
    )
  }, [])

  const toggleStar = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      starredThreads: prev.starredThreads.includes(id)
        ? prev.starredThreads.filter((item) => item !== id)
        : [...prev.starredThreads, id],
    }))
  }, [])

  const addReply = useCallback((threadId: string, body: string) => {
    const reply = { id: uid(), body, at: new Date().toISOString(), fromMe: true }
    setState((prev) => ({
      ...prev,
      replies: { ...prev.replies, [threadId]: [...(prev.replies[threadId] ?? []), reply] },
      readThreads: prev.readThreads.includes(threadId) ? prev.readThreads : [...prev.readThreads, threadId],
    }))
  }, [])

  const sendThread = useCallback(({ to, subject, body }: { to: string; subject: string; body: string }) => {
    const thread: Thread = {
      id: `sent-${uid()}`,
      from: 'Moi',
      role: `À : ${to}`,
      subject,
      preview: body.slice(0, 120),
      body: [body],
      at: new Date().toISOString(),
      unread: false,
      starred: false,
      color: '#8b7bff',
      replies: [],
      folder: 'sent',
    }
    setState((prev) => ({ ...prev, sentThreads: [thread, ...prev.sentThreads] }))
  }, [])

  const toggleFavorite = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      favorites: prev.favorites.includes(id)
        ? prev.favorites.filter((item) => item !== id)
        : [...prev.favorites, id],
    }))
  }, [])

  const justify = useCallback((id: string) => {
    setState((prev) =>
      prev.justified.includes(id) ? prev : { ...prev, justified: [...prev.justified, id] },
    )
  }, [])

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setState((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }))
  }, [])

  const resetDemo = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
    setState((prev) => ({ ...createInitialState(), session: prev.session }))
  }, [])

  const exportData = useCallback(() => {
    try {
      const payload = {
        app: 'Pr8note',
        exportedAt: new Date().toISOString(),
        ...state,
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `pr8note-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      toast('Ta sauvegarde a été exportée.', 'success')
    } catch {
      toast('Impossible d’exporter la sauvegarde.', 'error')
    }
  }, [state, toast])

  const importData = useCallback(
    async (file: File) => {
      const raw = await file.text()
      const parsed = JSON.parse(raw) as Partial<PersistedState> & { app?: string }
      if (!parsed || typeof parsed !== 'object') throw new Error('Fichier illisible')
      if (!parsed.settings && !parsed.session && !parsed.homeworkDone) {
        throw new Error('Ce fichier ne ressemble pas à une sauvegarde Pr8note.')
      }
      const base = createInitialState()
      setState((prev) => ({
        ...base,
        ...parsed,
        version: 1,
        settings: { ...base.settings, ...(parsed.settings ?? prev.settings) },
        session: parsed.session ?? prev.session,
        homeworkDone: { ...(parsed.homeworkDone ?? {}) },
        readThreads: Array.isArray(parsed.readThreads) ? parsed.readThreads : base.readThreads,
        starredThreads: Array.isArray(parsed.starredThreads) ? parsed.starredThreads : base.starredThreads,
        replies: { ...(parsed.replies ?? {}) },
        sentThreads: Array.isArray(parsed.sentThreads) ? parsed.sentThreads : [],
        favorites: Array.isArray(parsed.favorites) ? parsed.favorites : base.favorites,
        justified: Array.isArray(parsed.justified) ? parsed.justified : [],
      }))
      toast('Sauvegarde importée avec succès.', 'success')
    },
    [toast],
  )

  const value = useMemo<StoreValue>(
    () => ({
      state,
      toasts,
      signIn,
      signOut,
      toggleHomework,
      markRead,
      toggleStar,
      addReply,
      sendThread,
      toggleFavorite,
      justify,
      updateSettings,
      resetDemo,
      exportData,
      importData,
      dismissToast,
      toast,
    }),
    [
      state,
      toasts,
      signIn,
      signOut,
      toggleHomework,
      markRead,
      toggleStar,
      addReply,
      sendThread,
      toggleFavorite,
      justify,
      updateSettings,
      resetDemo,
      exportData,
      importData,
      dismissToast,
      toast,
    ],
  )

  return (
    <StoreContext.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite" aria-atomic="false">
        {toasts.map((item) => {
          const Icon = item.tone === 'success' ? CheckCircle2 : item.tone === 'error' ? AlertTriangle : Info
          return (
            <div key={item.id} className={`toast toast-${item.tone}`}>
              <span className="toast-icon">
                <Icon size={17} />
              </span>
              <p>{item.message}</p>
              <button className="toast-close" onClick={() => dismissToast(item.id)} aria-label="Fermer">
                <X size={14} />
              </button>
            </div>
          )
        })}
      </div>
    </StoreContext.Provider>
  )
}

export function useStore(): StoreValue {
  const context = useContext(StoreContext)
  if (!context) throw new Error('useStore must be used inside StoreProvider')
  return context
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}
