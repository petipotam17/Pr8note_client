import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BookOpen,
  Download,
  FileText,
  GraduationCap,
  ListChecks,
  Mail,
  Moon,
  Search,
  Sun,
  type LucideIcon,
} from 'lucide-react'
import { GRADES, HOMEWORK, RESOURCES, SUBJECTS, THREADS } from '../data/seed'
import { navEntry } from '../lib/paletteData'
import { useStore } from '../lib/store'
import { useEscape } from '../lib/hooks'

interface PaletteEntry {
  id: string
  label: string
  hint: string
  group: 'Navigation' | 'Actions' | 'Contenu'
  icon: LucideIcon
  to?: string
  run?: () => void
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const { state, updateSettings, exportData } = useStore()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  useEscape(onClose, open)

  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
    }
  }, [open])

  const entries = useMemo<PaletteEntry[]>(() => {
    const navigation: PaletteEntry[] = navEntry.map((item) => ({
      id: `nav-${item.to}`,
      label: item.label,
      hint: item.description,
      group: 'Navigation',
      icon: item.icon,
      to: item.to,
    }))

    const actions: PaletteEntry[] = [
      {
        id: 'action-theme',
        label: state.settings.theme === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre',
        hint: 'Apparence',
        group: 'Actions',
        icon: state.settings.theme === 'dark' ? Sun : Moon,
        run: () => updateSettings({ theme: state.settings.theme === 'dark' ? 'light' : 'dark' }),
      },
      {
        id: 'action-export',
        label: 'Exporter mes données',
        hint: 'Sauvegarde locale au format JSON',
        group: 'Actions',
        icon: Download,
        run: exportData,
      },
    ]

    const content: PaletteEntry[] = []
    HOMEWORK.forEach((item) => {
      const subject = SUBJECTS.find((entry) => entry.id === item.subjectId)
      content.push({
        id: `hw-${item.id}`,
        label: item.title,
        hint: `Devoir · ${subject?.short ?? 'Matière'}`,
        group: 'Contenu',
        icon: ListChecks,
        to: '/devoirs',
      })
    })
    THREADS.forEach((thread) => {
      content.push({
        id: `thread-${thread.id}`,
        label: thread.subject,
        hint: `Message · ${thread.from}`,
        group: 'Contenu',
        icon: Mail,
        to: '/messages',
      })
    })
    SUBJECTS.forEach((subject) => {
      const count = GRADES.filter((grade) => grade.subjectId === subject.id).length
      content.push({
        id: `subject-${subject.id}`,
        label: `Notes de ${subject.name.toLowerCase()}`,
        hint: `${count} notes · ${subject.teacher}`,
        group: 'Contenu',
        icon: GraduationCap,
        to: '/notes',
      })
    })
    RESOURCES.forEach((resource) => {
      content.push({
        id: `res-${resource.id}`,
        label: resource.title,
        hint: `Ressource · ${resource.meta}`,
        group: 'Contenu',
        icon: FileText,
        to: '/ressources',
      })
    })

    const normalized = query.trim().toLowerCase()
    const all = [...navigation, ...actions, ...content]
    if (!normalized) return [...navigation, ...actions]
    return all
      .filter(
        (item) =>
          item.label.toLowerCase().includes(normalized) ||
          item.hint.toLowerCase().includes(normalized) ||
          item.group.toLowerCase().includes(normalized),
      )
      .slice(0, 12)
  }, [query, state.settings.theme, updateSettings, exportData])

  useEffect(() => {
    setActive(0)
  }, [query])

  useEffect(() => {
    if (!open) return
    const element = document.querySelector('.palette-item[data-active="true"]')
    element?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  if (!open) return null

  const runEntry = (entry: PaletteEntry) => {
    onClose()
    if (entry.run) entry.run()
    if (entry.to) navigate(entry.to)
  }

  const groups: { name: PaletteEntry['group']; entries: PaletteEntry[] }[] = ['Navigation', 'Actions', 'Contenu'].map(
    (name) => ({
      name: name as PaletteEntry['group'],
      entries: entries.filter((entry) => entry.group === name),
    }),
  )

  let flatIndex = -1

  return (
    <div
      className="palette-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="palette" role="dialog" aria-modal="true" aria-label="Recherche globale">
        <div className="palette-search">
          <Search size={19} />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher un cours, un devoir, une page…"
            aria-label="Rechercher"
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setActive((index) => (entries.length ? (index + 1) % entries.length : 0))
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault()
                setActive((index) => (entries.length ? (index - 1 + entries.length) % entries.length : 0))
              }
              if (event.key === 'Enter' && entries[active]) {
                event.preventDefault()
                runEntry(entries[active])
              }
            }}
          />
          <kbd>esc</kbd>
        </div>

        <div className="palette-results">
          {groups.map((group) => {
            if (!group.entries.length) return null
            return (
              <div key={group.name} className="palette-group">
                <p className="palette-group-title">{group.name}</p>
                {group.entries.map((entry) => {
                  flatIndex += 1
                  const index = flatIndex
                  const Icon = entry.icon
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      className="palette-item"
                      data-active={index === active ? 'true' : 'false'}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => runEntry(entry)}
                    >
                      <span className="palette-icon">
                        <Icon size={16} />
                      </span>
                      <span className="palette-copy">
                        <strong>{entry.label}</strong>
                        <span>{entry.hint}</span>
                      </span>
                      <span className="palette-enter">↵</span>
                    </button>
                  )
                })}
              </div>
            )
          })}
          {entries.length === 0 && (
            <div className="palette-empty">
              <BookOpen size={22} />
              <p>Aucun résultat pour « {query} »</p>
            </div>
          )}
        </div>

        <footer className="palette-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> naviguer
          </span>
          <span>
            <kbd>↵</kbd> ouvrir
          </span>
          <span className="palette-brand">Pr8note</span>
        </footer>
      </div>
    </div>
  )
}
