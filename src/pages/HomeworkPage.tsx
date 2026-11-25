import { useMemo, useState } from 'react'
import { ArrowRight, Check, CheckCircle2, Clock, Flame, Lightbulb, ListChecks, Target } from 'lucide-react'
import { useSchool } from '../lib/school'
import type { Homework as HomeworkItem } from '../types'
import { useStore } from '../lib/store'
import { homeworkStats, workloadForWeek } from '../lib/analytics'
import { daysUntil, formatMinutes, relativeDue } from '../lib/date'
import { Badge, EmptyState, PageHeader, ProgressRing, Segmented } from '../components/ui'

const TYPE_LABEL: Record<HomeworkItem['type'], string> = {
  exercices: 'Exercices',
  lecture: 'Lecture',
  dm: 'DM',
  revisions: 'Révisions',
  oral: 'Oral',
}

const GROUP_ORDER = ['En retard', 'Aujourd’hui', 'Demain', 'Cette semaine', 'Plus tard'] as const

function groupOf(item: HomeworkItem): (typeof GROUP_ORDER)[number] {
  const diff = daysUntil(item.due)
  if (diff < 0) return 'En retard'
  if (diff === 0) return 'Aujourd’hui'
  if (diff === 1) return 'Demain'
  if (diff <= 6) return 'Cette semaine'
  return 'Plus tard'
}

export function Homework() {
  const { state, toggleHomework } = useStore()
  const { homework: HOMEWORK, subjects: SUBJECTS, synced } = useSchool()
  const [tab, setTab] = useState<'pending' | 'done' | 'all'>('pending')
  const [subjectFilter, setSubjectFilter] = useState<'all' | string>('all')

  const stats = useMemo(() => homeworkStats(HOMEWORK, state.homeworkDone), [state.homeworkDone])
  const total = HOMEWORK.length
  const doneCount = stats.done.length

  const visible = useMemo(
    () =>
      HOMEWORK.filter((item) => (subjectFilter === 'all' ? true : item.subjectId === subjectFilter))
        .filter((item) => {
          if (tab === 'all') return true
          if (tab === 'done') return Boolean(state.homeworkDone[item.id] || item.done)
          return !(state.homeworkDone[item.id] || item.done)
        })
        .sort((a, b) => a.due.localeCompare(b.due)),
    [subjectFilter, tab, state.homeworkDone],
  )

  const groups = useMemo(() => {
    if (tab === 'done') return [{ title: 'Terminés', items: visible }]
    return GROUP_ORDER.map((title) => ({ title, items: visible.filter((item) => groupOf(item) === title) })).filter(
      (group) => group.items.length > 0,
    )
  }, [tab, visible])

  const workload = workloadForWeek(stats.pending)
  const maxLoad = Math.max(45, ...workload.map((day) => day.minutes))
  const subjectCount = new Set(stats.pending.map((item) => item.subjectId)).size
  const tip = stats.late.length
    ? `Attaque d’abord « ${stats.late[0].title} » : c’est en retard, et 20 minutes suffisent souvent à désamorcer la pression.`
    : stats.today.length
      ? 'Tu as des devoirs pour aujourd’hui. Commence par le plus court, puis enchaîne : l’élan fait le reste.'
      : stats.pending.length
        ? 'Rien d’urgent aujourd’hui. Avance sur le devoir le plus long, tu te libéreras du temps demain.'
        : 'Tout est terminé. Range tes affaires et prépare ta journée de demain — ton futur toi te remerciera.'

  return (
    <div className="page">
      <PageHeader
        eyebrow="Cahier de textes"
        title="Tes devoirs"
        description="Tout ce que tu as à faire, dans le bon ordre et sans mauvaise surprise."
        actions={
          <div className="homework-progress-pill">
            <CheckCircle2 size={16} />
            {doneCount} / {total} terminés
          </div>
        }
      />

      <div className="homework-grid">
        <div className="col-8">
          <div className="homework-toolbar">
            <Segmented
              options={[
                { value: 'pending', label: `À faire (${stats.pending.length})` },
                { value: 'done', label: `Terminés (${doneCount})` },
                { value: 'all', label: 'Tous' },
              ]}
              value={tab}
              onChange={(value) => setTab(value)}
              label="Filtrer les devoirs"
            />
            <div className="chip-scroll">
              <button
                type="button"
                className={`filter-chip ${subjectFilter === 'all' ? 'active' : ''}`}
                onClick={() => setSubjectFilter('all')}
              >
                Toutes les matières
              </button>
              {SUBJECTS.filter((subject) => HOMEWORK.some((item) => item.subjectId === subject.id)).map((subject) => (
                <button
                  type="button"
                  key={subject.id}
                  className={`filter-chip ${subjectFilter === subject.id ? 'active' : ''}`}
                  onClick={() => setSubjectFilter(subject.id)}
                >
                  <i style={{ background: subject.color }} />
                  {subject.short}
                </button>
              ))}
            </div>
          </div>

          <div className="homework-groups">
            {groups.map((group) => (
              <section key={group.title} className="homework-group">
                <header className={`group-head ${group.title === 'En retard' ? 'danger' : ''}`}>
                  <h2>{group.title}</h2>
                  <span>{group.items.length}</span>
                  <div className="group-line" />
                </header>
                {group.items.map((item) => {
                  const subject = SUBJECTS.find((entry) => entry.id === item.subjectId)
                  const isDone = Boolean(state.homeworkDone[item.id] || item.done)
                  const isLate = daysUntil(item.due) < 0 && !isDone
                  return (
                    <article key={item.id} className={`hw-card ${isDone ? 'done' : ''} ${isLate ? 'late' : ''}`}>
                      <button
                        type="button"
                        className="check"
                        onClick={() => toggleHomework(item.id)}
                        aria-label={isDone ? `Marquer ${item.title} comme à faire` : `Marquer ${item.title} comme fait`}
                        aria-pressed={isDone}
                      >
                        <Check size={13} />
                      </button>
                      <span className="hw-color" style={{ background: subject?.color }} />
                      <div className="hw-main">
                        <div className="hw-title">
                          <strong>{item.title}</strong>
                          {isLate && <Badge tone="bad">En retard</Badge>}
                          {!isDone && daysUntil(item.due) === 0 && <Badge tone="warn">Aujourd’hui</Badge>}
                        </div>
                        <p>{item.details}</p>
                        <div className="hw-meta">
                          <span className="hw-subject">{subject?.short}</span>
                          <span>
                            <Clock size={12} /> {relativeDue(item.due)}
                          </span>
                          <span>{formatMinutes(item.minutes)}</span>
                          <span className="hw-type">{TYPE_LABEL[item.type]}</span>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </section>
            ))}

            {visible.length === 0 && (
              <div className="card">
                <EmptyState
                  icon={<CheckCircle2 size={26} />}
                  title={tab === 'pending' ? 'Rien à faire. Bravo !' : 'Aucun devoir ici'}
                  description={
                    tab === 'pending'
                      ? 'Tous tes devoirs sont terminés. Tu peux souffler, ou prendre de l’avance.'
                      : 'Change de filtre pour voir tes autres devoirs.'
                  }
                />
              </div>
            )}
          </div>
        </div>

        <aside className="col-4 homework-side">
          <section className="card progress-card">
            <div className="card-head">
              <div>
                <p className="eyebrow">Avancement</p>
                <h2>Ta semaine</h2>
              </div>
              <Badge tone="accent">
                <Flame size={12} /> {doneCount} faits
              </Badge>
            </div>
            <ProgressRing
              value={doneCount}
              max={Math.max(1, total)}
              size={142}
              label={`${total ? Math.round((doneCount / total) * 100) : 0}%`}
              caption="terminé"
            />
            <div className="progress-stats">
              <div>
                <span>Reste</span>
                <strong>{stats.pending.length}</strong>
              </div>
              <div>
                <span>En retard</span>
                <strong className={stats.late.length ? 'danger-text' : ''}>{stats.late.length}</strong>
              </div>
              <div>
                <span>Temps</span>
                <strong>{formatMinutes(stats.totalMinutes)}</strong>
              </div>
            </div>
          </section>

          <section className="card load-card">
            <div className="card-head">
              <div>
                <p className="eyebrow">Estimation</p>
                <h2>Charge à venir</h2>
              </div>
              <ListChecks size={18} className="muted-icon" />
            </div>
            <div className="load-chart">
              {workload.map((day) => (
                <div className="load-col" key={day.date} title={`${day.day} · ${formatMinutes(day.minutes)}`}>
                  <span className="load-value">{day.minutes || ''}</span>
                  <div className="load-track">
                    <span style={{ height: `${Math.max(4, (day.minutes / maxLoad) * 100)}%` }} />
                  </div>
                  <span className="load-day">{day.day}</span>
                </div>
              ))}
            </div>
            <div className="load-legend">
              <span>
                <Clock size={13} /> {formatMinutes(stats.totalMinutes)} restantes
              </span>
              <span>{subjectCount} matières</span>
            </div>
          </section>

          <section className="card tip-card">
            <div className="tip-head">
              <span className="tip-icon">
                <Lightbulb size={18} />
              </span>
              <h3>Le conseil du jour</h3>
            </div>
            <p>{tip}</p>
            <div className="tip-foot">
              <Target size={14} /> Objectif : terminer avant 19 h
            </div>
          </section>

          <section className="card mini-cta">
            <CheckCircle2 size={18} />
            <div>
              <strong>{synced ? 'Devoirs PRONOTE' : 'Tout est synchronisé'}</strong>
              <p>
                {synced
                  ? 'Les devoirs viennent de PRONOTE ; tes cases cochées restent sur cet appareil.'
                  : 'Tes cases cochées sont enregistrées sur cet appareil.'}
              </p>
            </div>
            <ArrowRight size={16} />
          </section>
        </aside>
      </div>
    </div>
  )
}
