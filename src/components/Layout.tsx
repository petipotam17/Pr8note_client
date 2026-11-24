import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Bell,
  BookOpen,
  CalendarClock,
  ChevronRight,
  Download,
  GraduationCap,
  ListChecks,
  LogOut,
  Mail,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings2,
  Sun,
  type LucideIcon,
} from 'lucide-react'
import { GRADES, HOMEWORK, SUBJECTS, THREADS } from '../data/seed'
import { useStore } from '../lib/store'
import { NAV } from '../lib/nav'
import { daysUntil, formatTimeAgo, relativeDue } from '../lib/date'
import { Avatar } from './ui'
import { LogoMark, Wordmark } from './Logo'
import { CommandPalette } from './CommandPalette'

interface Notification {
  id: string
  title: string
  text: string
  to: string
  icon: LucideIcon
  accent: string
}

export function Layout() {
  const { state, signOut, updateSettings, exportData } = useStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)

  const student = state.session!
  const unreadMessages = THREADS.filter((thread) => !state.readThreads.includes(thread.id)).length

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    setNotificationsOpen(false)
    setAccountOpen(false)
    setPaletteOpen(false)
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [location.pathname])

  const notifications = useMemo<Notification[]>(() => {
    const list: Notification[] = []
    const urgentHomework = HOMEWORK.filter((item) => !state.homeworkDone[item.id] && daysUntil(item.due) <= 1).sort(
      (a, b) => a.due.localeCompare(b.due),
    )
    if (urgentHomework.length) {
      const next = urgentHomework[0]
      const subject = SUBJECTS.find((item) => item.id === next.subjectId)
      list.push({
        id: 'homework-urgent',
        title: `${urgentHomework.length} devoir${urgentHomework.length > 1 ? 's' : ''} à rendre bientôt`,
        text: `${subject?.short ?? ''} · ${next.title} — ${relativeDue(next.due)}`,
        to: '/devoirs',
        icon: ListChecks,
        accent: '#f7b955',
      })
    }

    const unread = THREADS.filter((thread) => !state.readThreads.includes(thread.id)).slice(0, 2)
    unread.forEach((thread) => {
      list.push({
        id: `thread-${thread.id}`,
        title: thread.subject,
        text: `${thread.from} · ${formatTimeAgo(thread.at)}`,
        to: '/messages',
        icon: Mail,
        accent: thread.color,
      })
    })

    const latest = GRADES.slice().sort((a, b) => b.date.localeCompare(a.date))[0]
    if (latest) {
      const subject = SUBJECTS.find((item) => item.id === latest.subjectId)
      list.push({
        id: 'latest-grade',
        title: `Nouvelle note en ${subject?.short ?? 'cours'}`,
        text: `${latest.title} — ${latest.value?.toLocaleString('fr-FR')}/${latest.outOf}`,
        to: '/notes',
        icon: GraduationCap,
        accent: subject?.color ?? '#8b7bff',
      })
    }

    const almostDue = HOMEWORK.find((item) => !state.homeworkDone[item.id] && daysUntil(item.due) === 2)
    if (almostDue) {
      const subject = SUBJECTS.find((item) => item.id === almostDue.subjectId)
      list.push({
        id: 'homework-soon',
        title: 'À planifier cette semaine',
        text: `${subject?.short ?? ''} · ${almostDue.title} — ${relativeDue(almostDue.due)}`,
        to: '/devoirs',
        icon: CalendarClock,
        accent: '#22d3ee',
      })
    }

    return list.slice(0, 4)
  }, [state])

  const toggleTheme = () => updateSettings({ theme: state.settings.theme === 'dark' ? 'light' : 'dark' })

  return (
    <div className="shell" data-collapsed={state.settings.sidebarCollapsed ? 'true' : 'false'}>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <LogoMark size={36} />
          <Wordmark className="sidebar-wordmark" />
        </div>

        <p className="sidebar-label">Mon espace</p>
        <nav className="sidebar-nav" aria-label="Navigation principale">
          {NAV.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                title={item.label}
              >
                <span className="nav-icon">
                  <Icon size={19} strokeWidth={1.9} />
                  {item.to === '/messages' && unreadMessages > 0 && <i className="nav-dot" />}
                </span>
                <span className="nav-text">{item.label}</span>
                {item.to === '/messages' && unreadMessages > 0 && <span className="nav-count">{unreadMessages}</span>}
              </NavLink>
            )
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <span className="sidebar-tip-keys">
              <kbd>⌘</kbd>
              <kbd>K</kbd>
            </span>
            <p>Recherche instantanée</p>
          </div>
          <button type="button" className="sidebar-profile" onClick={() => navigate('/reglages')}>
            <Avatar
              name={`${student.firstName} ${student.lastName}`}
              color="linear-gradient(135deg, var(--accent), var(--accent-2))"
              size={38}
            />
            <span className="sidebar-profile-copy">
              <strong>
                {student.firstName} {student.lastName}
              </strong>
              <span>{student.className}</span>
            </span>
            <ChevronRight size={16} className="sidebar-profile-arrow" />
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="icon-btn desktop-only"
              onClick={() => updateSettings({ sidebarCollapsed: !state.settings.sidebarCollapsed })}
              aria-label={state.settings.sidebarCollapsed ? 'Déplier la navigation' : 'Replier la navigation'}
              title={state.settings.sidebarCollapsed ? 'Déplier la navigation' : 'Replier la navigation'}
            >
              {state.settings.sidebarCollapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
            </button>

            <div className="mobile-brand">
              <LogoMark size={28} />
              <Wordmark />
            </div>

            <button type="button" className="search-trigger" onClick={() => setPaletteOpen(true)}>
              <Search size={16} />
              <span>Rechercher un cours, un devoir…</span>
              <kbd>⌘K</kbd>
            </button>
          </div>

          <div className="topbar-right">
            <button
              type="button"
              className="icon-btn"
              onClick={toggleTheme}
              aria-label="Basculer le thème"
              title="Basculer le thème"
            >
              {state.settings.theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            <div className="popover-wrap">
              <button
                type="button"
                className="icon-btn"
                onClick={() => {
                  setNotificationsOpen((open) => !open)
                  setAccountOpen(false)
                }}
                aria-label="Notifications"
                aria-expanded={notificationsOpen}
                title="Notifications"
              >
                <Bell size={18} />
                {notifications.length > 0 && <span className="icon-badge">{notifications.length}</span>}
              </button>
              {notificationsOpen && (
                <>
                  <button
                    type="button"
                    className="popover-backdrop"
                    aria-label="Fermer les notifications"
                    onClick={() => setNotificationsOpen(false)}
                  />
                  <div className="popover">
                    <header className="popover-head">
                      <h3>Notifications</h3>
                      <span>{notifications.length} nouvelles</span>
                    </header>
                    <div className="notif-list">
                      {notifications.map((item) => {
                        const Icon = item.icon
                        return (
                          <button
                            key={item.id}
                            type="button"
                            className="notif-item"
                            onClick={() => {
                              setNotificationsOpen(false)
                              navigate(item.to)
                            }}
                          >
                            <span className="notif-icon" style={{ color: item.accent, background: `${item.accent}1c` }}>
                              <Icon size={17} />
                            </span>
                            <span className="notif-copy">
                              <strong>{item.title}</strong>
                              <span>{item.text}</span>
                            </span>
                          </button>
                        )
                      })}
                    </div>
                    <button
                      type="button"
                      className="popover-footer"
                      onClick={() => {
                        setNotificationsOpen(false)
                        navigate('/devoirs')
                      }}
                    >
                      Voir ce qui m’attend <ChevronRight size={15} />
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="popover-wrap">
              <button
                type="button"
                className="avatar-btn"
                onClick={() => {
                  setAccountOpen((open) => !open)
                  setNotificationsOpen(false)
                }}
                aria-label="Mon compte"
                aria-expanded={accountOpen}
              >
                <Avatar
                  name={`${student.firstName} ${student.lastName}`}
                  color="linear-gradient(135deg, var(--accent), var(--accent-2))"
                  size={34}
                />
              </button>
              {accountOpen && (
                <>
                  <button
                    type="button"
                    className="popover-backdrop"
                    aria-label="Fermer le menu du compte"
                    onClick={() => setAccountOpen(false)}
                  />
                  <div className="popover account-pop">
                    <div className="account-head">
                      <Avatar
                        name={`${student.firstName} ${student.lastName}`}
                        color="linear-gradient(135deg, var(--accent), var(--accent-2))"
                        size={44}
                      />
                      <div>
                        <strong>
                          {student.firstName} {student.lastName}
                        </strong>
                        <span>
                          {student.className} · {student.establishment}
                        </span>
                      </div>
                    </div>
                    <div className="account-menu">
                      <button type="button" onClick={() => navigate('/reglages')}>
                        <Settings2 size={16} /> Réglages
                      </button>
                      <button type="button" onClick={exportData}>
                        <Download size={16} /> Exporter mes données
                      </button>
                      <button type="button" className="danger" onClick={signOut}>
                        <LogOut size={16} /> Se déconnecter
                      </button>
                    </div>
                    <p className="account-foot">Pr8note · espace de démonstration</p>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>

        <nav className="tabbar" aria-label="Navigation mobile">
          {NAV.filter((item) => item.mobile).map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => `tabbar-item ${isActive ? 'active' : ''}`}
              >
                <Icon size={21} strokeWidth={1.9} />
                <span>{item.short}</span>
              </NavLink>
            )
          })}
        </nav>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}
