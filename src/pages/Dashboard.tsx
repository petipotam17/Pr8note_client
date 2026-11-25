import { Link } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  Clock,
  GraduationCap,
  ListChecks,
  MapPin,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import { useSchool } from '../lib/school'
import { useStore } from '../lib/store'
import { useNow } from '../lib/hooks'
import { generalStats, averageDelta, homeworkStats, workloadForWeek } from '../lib/analytics'
import {
  addDays,
  daysUntil,
  formatDateShort,
  formatGrade,
  formatLongDate,
  formatMinutes,
  isoDate,
  relativeDue,
  timeToMinutes,
  weekdayIndex,
} from '../lib/date'
import type { Lesson } from '../types'
import { Badge, ProgressRing } from '../components/ui'

function isoWeekNumber(date: Date): number {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = target.getUTCDay() || 7
  target.setUTCDate(target.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1))
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
}

interface Upcoming {
  lesson: Lesson
  date: Date
  startAbs: number
  offset: number
}

export function Dashboard() {
  const { state, toggleHomework } = useStore()
  const {
    subjects: SUBJECTS,
    grades: GRADES,
    homework: HOMEWORK,
    lessons: LESSONS,
    news: NEWS,
    lifeEvents: LIFE_EVENTS,
    currentPeriodId,
    previousPeriodId,
    generalAverage,
  } = useSchool()
  const now = useNow(15_000)
  const student = state.session!
  const minutesNow = now.getHours() * 60 + now.getMinutes()
  const todayIndex = weekdayIndex(now)
  const today = isoDate(now)

  const todayLessons = LESSONS.filter((lesson) =>
    lesson.date ? lesson.date === today : lesson.weekday === todayIndex,
  ).sort((a, b) => a.start.localeCompare(b.start))
  const activeLessons = todayLessons.filter((lesson) => lesson.status !== 'canceled')
  const current = activeLessons.find((lesson) => {
    const start = timeToMinutes(lesson.start)
    const end = timeToMinutes(lesson.end)
    return minutesNow >= start && minutesNow < end
  })

  let upcoming: Upcoming | null = null
  for (let offset = 0; offset < 8 && !upcoming; offset += 1) {
    const date = addDays(now, offset)
    const day = weekdayIndex(date)
    const lessons = LESSONS.filter((lesson) =>
      lesson.date
        ? lesson.date === isoDate(date) && lesson.status !== 'canceled'
        : lesson.weekday === day && lesson.status !== 'canceled',
    ).sort((a, b) => a.start.localeCompare(b.start))
    for (const lesson of lessons) {
      const startAbs = offset * 1440 + timeToMinutes(lesson.start)
      if (startAbs > minutesNow) {
        upcoming = { lesson, date, startAbs, offset }
        break
      }
    }
  }

  const displayLesson = current ?? upcoming?.lesson ?? null
  const displaySubject = displayLesson ? SUBJECTS.find((subject) => subject.id === displayLesson.subjectId) : null
  const isCurrent = Boolean(current)
  const targetMinutes = current ? timeToMinutes(current.end) : upcoming?.startAbs ?? null
  const timeLeft = targetMinutes !== null ? targetMinutes - minutesNow : null
  const progress = current
    ? Math.min(
        1,
        Math.max(
          0,
          (minutesNow - timeToMinutes(current.start)) / (timeToMinutes(current.end) - timeToMinutes(current.start)),
        ),
      )
    : 0

  const general = generalStats(SUBJECTS, GRADES, currentPeriodId)
  const previous = previousPeriodId
    ? generalStats(SUBJECTS, GRADES, previousPeriodId)
    : { average: null as number | null }
  const displayedAverage = generalAverage ?? general.average
  const gradeDelta = averageDelta(displayedAverage, previous.average)
  const homework = homeworkStats(HOMEWORK, state.homeworkDone)
  const pendingSorted = homework.pending.slice().sort((a, b) => a.due.localeCompare(b.due))
  const dueToday = HOMEWORK.filter(
    (item) => !state.homeworkDone[item.id] && !item.done && daysUntil(item.due) === 0,
  ).length
  const late = homework.late.length
  const doneCount = HOMEWORK.length - homework.pending.length
  const donePercent = HOMEWORK.length ? Math.round((doneCount / HOMEWORK.length) * 100) : 0
  const todayHours = Math.round(
    activeLessons.reduce((sum, lesson) => sum + (timeToMinutes(lesson.end) - timeToMinutes(lesson.start)), 0) / 60,
  )
  const latestGrades = GRADES.filter((grade) => grade.value !== null)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3)
  const weekWorkload = workloadForWeek(homework.pending)
  const maxWorkload = Math.max(60, ...weekWorkload.map((day) => day.minutes))
  const absenceHours = LIFE_EVENTS.filter((event) => event.type === 'absence').reduce(
    (sum, event) => sum + (event.durationHours ?? 0),
    0,
  )

  const subtitle = [
    activeLessons.length ? `${activeLessons.length} cours aujourd’hui` : 'Pas de cours aujourd’hui',
    pendingSorted.length ? `${pendingSorted.length} devoir${pendingSorted.length > 1 ? 's' : ''} en attente` : 'tout est à jour',
  ].join(' · ')

  return (
    <div className="page">
      <div className="dash-grid">
        <section className="card hero col-8">
          <span className="hero-orb" />
          <span className="hero-orb hero-orb-2" />
          <div className="hero-top">
            <div>
              <p className="eyebrow">
                {formatLongDate(now)} · Semaine {isoWeekNumber(now)}
              </p>
              <h1 className="hero-title">
                Bonjour {student.firstName} <span className="wave">👋</span>
              </h1>
              <p className="hero-sub">{subtitle}</p>
            </div>
            <Link to="/emploi-du-temps" className="btn btn-outline btn-sm hero-link">
              Mon planning <ArrowUpRight size={15} />
            </Link>
          </div>

          {displayLesson && displaySubject ? (
            <div className="next-block">
              <span className="next-badge" style={{ background: `${displaySubject.color}1f`, color: displaySubject.color }}>
                <BookOpen size={22} />
              </span>
              <div className="next-copy">
                <span className="next-kicker">
                  {isCurrent ? 'En cours' : 'Prochain cours'} · {displayLesson.start} — {displayLesson.end}
                </span>
                <strong>{displaySubject.name}</strong>
                <span className="next-meta">
                  <MapPin size={12} /> Salle {displayLesson.room} · {displaySubject.teacher}
                </span>
                {isCurrent && (
                  <div className="next-progress">
                    <span style={{ width: `${Math.round(progress * 100)}%` }} />
                  </div>
                )}
              </div>
              <div className="next-time">
                <span>
                  {isCurrent ? 'Se termine dans' : upcoming?.offset === 0 ? 'Commence dans' : 'Prochain cours'}
                </span>
                <strong>
                  {isCurrent
                    ? timeLeft !== null
                      ? formatMinutes(timeLeft)
                      : '—'
                    : upcoming
                      ? upcoming.offset === 0
                        ? formatMinutes(Math.max(0, (timeLeft ?? 0)))
                        : relativeDue(isoDate(upcoming.date))
                      : '—'}
                </strong>
                {!isCurrent && upcoming && (
                  <span className="next-time-sub">
                    {upcoming.lesson.start} · {upcoming.lesson.room}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="next-block next-empty">
              <span className="next-badge">
                <Sparkles size={22} />
              </span>
              <div className="next-copy">
                <span className="next-kicker">Journée libre</span>
                <strong>Aucun cours à venir</strong>
                <span className="next-meta">Profite de ce temps pour avancer sur tes devoirs.</span>
              </div>
            </div>
          )}

          <div className="hero-metrics">
            <div>
              <span>Moyenne générale</span>
              <strong>
                {displayedAverage !== null ? formatGrade(displayedAverage) : '—'}
                <small>/20</small>
              </strong>
            </div>
            <div>
              <span>Devoirs à faire</span>
              <strong>{pendingSorted.length}</strong>
            </div>
            <div>
              <span>Heures aujourd’hui</span>
              <strong>
                {todayHours}
                <small>h</small>
              </strong>
            </div>
            <div>
              <span>Heures d’absence</span>
              <strong>
                {absenceHours.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
                <small>h</small>
              </strong>
            </div>
          </div>
        </section>

        <section className="card week-card col-4">
          <div className="card-head">
            <div>
              <p className="eyebrow">Cette semaine</p>
              <h2>Ta progression</h2>
            </div>
            {gradeDelta !== null && (
              <Badge tone={gradeDelta.startsWith('+') ? 'good' : 'warn'}>
                <TrendingUp size={12} /> {gradeDelta} pts
              </Badge>
            )}
          </div>
          <div className="week-ring">
            <ProgressRing
              value={doneCount}
              max={HOMEWORK.length}
              size={148}
              label={`${donePercent}%`}
              caption="devoirs faits"
            />
            <div className="week-ring-copy">
              <strong>
                {doneCount} sur {HOMEWORK.length}
              </strong>
              <p>devoirs terminés cette semaine.</p>
              {late > 0 ? (
                <span className="week-warn">
                  <Clock size={13} /> {late} en retard
                </span>
              ) : (
                <span className="week-good">
                  <Check size={13} /> Rien en retard
                </span>
              )}
            </div>
          </div>
          <div className="week-stats">
            <div>
              <span>Aujourd’hui</span>
              <strong>{dueToday}</strong>
            </div>
            <div>
              <span>Temps restant</span>
              <strong>{formatMinutes(homework.totalMinutes)}</strong>
            </div>
            <div>
              <span>Matières</span>
              <strong>{new Set(pendingSorted.map((item) => item.subjectId)).size}</strong>
            </div>
          </div>
        </section>

        <section className="card col-5">
          <div className="card-head">
            <div>
              <p className="eyebrow">Aujourd’hui</p>
              <h2>Ton emploi du temps</h2>
            </div>
            <Link to="/emploi-du-temps" className="card-link">
              Semaine <ArrowRight size={14} />
            </Link>
          </div>
          {todayLessons.length ? (
            <div className="today-list">
              {todayLessons.map((lesson) => {
                const subject = SUBJECTS.find((item) => item.id === lesson.subjectId)
                const isActive = current?.id === lesson.id
                const isPast = timeToMinutes(lesson.end) < minutesNow
                return (
                  <div
                    key={lesson.id}
                    className={`today-row ${isActive ? 'active' : ''} ${isPast ? 'past' : ''} ${
                      lesson.status === 'canceled' ? 'canceled' : ''
                    }`}
                  >
                    <div className="today-time">
                      <strong>{lesson.start}</strong>
                      <span>{lesson.end}</span>
                    </div>
                    <span className="today-bar" style={{ background: subject?.color }} />
                    <div className="today-copy">
                      <strong>{subject?.short}</strong>
                      <span>
                        {lesson.room} · {subject?.teacher}
                      </span>
                    </div>
                    {lesson.status !== 'normal' ? (
                      <Badge tone={lesson.status === 'canceled' ? 'bad' : 'warn'}>
                        {lesson.status === 'canceled' ? 'Annulé' : 'Modifié'}
                      </Badge>
                    ) : isActive ? (
                      <Badge tone="accent">En cours</Badge>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="soft-empty">
              <CalendarDays size={22} />
              <p>Pas de cours aujourd’hui. Une journée pour souffler.</p>
            </div>
          )}
        </section>

        <section className="card col-4">
          <div className="card-head">
            <div>
              <p className="eyebrow">À faire</p>
              <h2>Devoirs</h2>
            </div>
            <Link to="/devoirs" className="card-link">
              Tout voir <ArrowRight size={14} />
            </Link>
          </div>
          <div className="mini-hw-list">
            {pendingSorted.slice(0, 4).map((item) => {
              const subject = SUBJECTS.find((entry) => entry.id === item.subjectId)
              const isLate = daysUntil(item.due) < 0
              return (
                <div key={item.id} className="mini-hw">
                  <button
                    type="button"
                    className="check check-sm"
                    onClick={() => toggleHomework(item.id)}
                    aria-label={`Marquer ${item.title} comme fait`}
                  >
                    <Check size={12} />
                  </button>
                  <div className="mini-hw-copy">
                    <strong>{item.title}</strong>
                    <span>
                      <i style={{ background: subject?.color }} /> {subject?.short} ·{' '}
                      <em className={isLate ? 'late-text' : ''}>{relativeDue(item.due)}</em>
                    </span>
                  </div>
                  <span className="mini-hw-time">{item.minutes}′</span>
                </div>
              )
            })}
            {pendingSorted.length === 0 && (
              <div className="soft-empty">
                <Check size={22} />
                <p>Tout est fait. Savoure ce moment.</p>
              </div>
            )}
          </div>
          {pendingSorted.length > 4 && (
            <Link to="/devoirs" className="more-link">
              +{pendingSorted.length - 4} autres devoirs <ArrowRight size={14} />
            </Link>
          )}
        </section>

        <section className="card col-3">
          <div className="card-head">
            <div>
              <p className="eyebrow">Bulletin</p>
              <h2>Dernières notes</h2>
            </div>
            <Link to="/notes" className="card-link" aria-label="Voir les notes">
              <ArrowRight size={14} />
            </Link>
          </div>
          <div className="latest-grade-list">
            {latestGrades.map((grade) => {
              const subject = SUBJECTS.find((entry) => entry.id === grade.subjectId)
              const normalized = grade.value !== null ? (grade.value / grade.outOf) * 20 : null
              const tone = normalized === null ? 'mid' : normalized >= 15 ? 'good' : normalized >= 10 ? 'mid' : 'bad'
              const diff = grade.classAvg !== null && grade.value !== null ? grade.value - grade.classAvg : null
              return (
                <div key={grade.id} className="latest-grade">
                  <span className="latest-dot" style={{ background: subject?.color }} />
                  <div className="latest-copy">
                    <strong>{subject?.short}</strong>
                    <span>{grade.title}</span>
                  </div>
                  <div className={`latest-value ${tone}`}>
                    {grade.value !== null ? formatGrade(grade.value) : '—'}
                    <small>/{grade.outOf}</small>
                    {diff !== null && (
                      <em>
                        {diff >= 0 ? '+' : '−'}
                        {Math.abs(diff).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
                      </em>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <section className="card col-8">
          <div className="card-head">
            <div>
              <p className="eyebrow">Vie du lycée</p>
              <h2>Actualités</h2>
            </div>
            <Badge tone="neutral">
              <GraduationCap size={12} /> {student.establishment}
            </Badge>
          </div>
          <div className="news-list">
            {NEWS.length === 0 && (
              <div className="soft-empty">
                <GraduationCap size={22} />
                <p>Aucune actualité publiée pour le moment.</p>
              </div>
            )}
            {NEWS.map((item) => (
              <article key={item.id} className="news-item">
                <span className="news-emoji" style={{ background: `${item.color}1a`, color: item.color }}>
                  {item.emoji}
                </span>
                <div className="news-copy">
                  <span className="news-meta">
                    {item.category} · {formatDateShort(item.date)}
                  </span>
                  <h3>{item.title}</h3>
                  <p>{item.excerpt}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="card col-4">
          <div className="card-head">
            <div>
              <p className="eyebrow">Planification</p>
              <h2>Charge de la semaine</h2>
            </div>
            <Badge tone="neutral">{formatMinutes(homework.totalMinutes)}</Badge>
          </div>
          <div className="load-chart" role="img" aria-label="Temps de devoirs estimé par jour">
            {weekWorkload.map((day) => (
              <div key={day.date} className="load-col" title={`${day.day} · ${formatMinutes(day.minutes)}`}>
                <span className="load-value">{day.minutes ? day.minutes : ''}</span>
                <div className="load-track">
                  <span style={{ height: `${Math.max(4, (day.minutes / maxWorkload) * 100)}%` }} />
                </div>
                <span className="load-day">{day.day}</span>
              </div>
            ))}
          </div>
          <div className="load-note">
            <ListChecks size={15} />
            <p>
              {late > 0
                ? `Commence par tes ${late} devoir${late > 1 ? 's' : ''} en retard, puis garde 20 min pour demain.`
                : 'Rien en retard : un bon rythme. Garde une marge pour les imprévus.'}
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
