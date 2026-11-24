import { useState, type CSSProperties } from 'react'
import {
  AlertCircle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coffee,
  MapPin,
  User,
} from 'lucide-react'
import { LESSONS, SUBJECTS } from '../data/seed'
import type { Lesson } from '../types'
import {
  addDays,
  formatDateShort,
  formatLongDate,
  isoDate,
  startOfWeek,
  timeToMinutes,
  weekdayIndex,
} from '../lib/date'
import { useNow } from '../lib/hooks'
import { Badge, Modal, PageHeader } from '../components/ui'

const START_MINUTES = 8 * 60
const END_MINUTES = 18 * 60
const PX_PER_HOUR = 68
const GRID_HEIGHT = ((END_MINUTES - START_MINUTES) / 60) * PX_PER_HOUR
const HOURS = Array.from({ length: 11 }, (_, index) => 8 + index)
const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi']

function isoWeekNumber(date: Date): number {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = target.getUTCDay() || 7
  target.setUTCDate(target.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1))
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
}

export function Timetable() {
  const now = useNow(30_000)
  const [weekOffset, setWeekOffset] = useState(0)
  const [selected, setSelected] = useState<{ lesson: Lesson; date: Date } | null>(null)

  const monday = addDays(startOfWeek(now), weekOffset * 7)
  const dates = Array.from({ length: 5 }, (_, index) => addDays(monday, index))
  const minutesNow = now.getHours() * 60 + now.getMinutes()
  const weekTotal = LESSONS.reduce(
    (sum, lesson) => sum + (timeToMinutes(lesson.end) - timeToMinutes(lesson.start)),
    0,
  )
  const canceledCount = LESSONS.filter((lesson) => lesson.status === 'canceled').length
  const modifiedCount = LESSONS.filter((lesson) => lesson.status === 'modified').length

  const weekLabel = `${formatDateShort(isoDate(dates[0]))} – ${formatDateShort(isoDate(dates[4]))}`
  const selectedSubject = selected ? SUBJECTS.find((subject) => subject.id === selected.lesson.subjectId) : null

  return (
    <div className="page">
      <PageHeader
        eyebrow={`Semaine ${isoWeekNumber(monday)} · ${weekLabel}`}
        title="Emploi du temps"
        description="Ta semaine en un regard. Clique sur un cours pour voir les détails."
        actions={
          <div className="week-nav">
            <button
              type="button"
              className="icon-btn"
              onClick={() => setWeekOffset((offset) => offset - 1)}
              aria-label="Semaine précédente"
            >
              <ChevronLeft size={18} />
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setWeekOffset(0)}>
              Cette semaine
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setWeekOffset((offset) => offset + 1)}
              aria-label="Semaine suivante"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        }
      />

      <div className="tt-summary">
        <span>
          <Clock size={15} /> {Math.round(weekTotal / 60)} h de cours
        </span>
        <span>
          <CalendarDays size={15} /> {LESSONS.length} cours
        </span>
        {canceledCount > 0 && (
          <span className="warn">
            <AlertCircle size={15} /> {canceledCount} annulé
          </span>
        )}
        {modifiedCount > 0 && <span className="muted">{modifiedCount} salle modifiée</span>}
      </div>

      <div className="card tt-card">
        <div className="tt-scroll">
          <div
            className="tt-grid"
            style={{ '--tt-hour': `${PX_PER_HOUR}px`, '--tt-height': `${GRID_HEIGHT}px` } as CSSProperties}
          >
            <div className="tt-corner" />
            {dates.map((date, index) => {
              const isToday = weekOffset === 0 && weekdayIndex(now) === index
              return (
                <div key={date.toISOString()} className={`tt-head-cell ${isToday ? 'is-today' : ''}`}>
                  <span>{DAY_NAMES[index]}</span>
                  <strong>{date.getDate()}</strong>
                  {isToday && <i>Aujourd’hui</i>}
                </div>
              )
            })}

            <div className="tt-time-rail">
              {HOURS.map((hour) => (
                <span key={hour} style={{ top: (hour - 8) * PX_PER_HOUR }}>
                  {hour}h
                </span>
              ))}
            </div>

            {dates.map((date, index) => {
              const lessons = LESSONS.filter((lesson) => lesson.weekday === index).sort((a, b) =>
                a.start.localeCompare(b.start),
              )
              const isToday = weekOffset === 0 && weekdayIndex(now) === index
              return (
                <div key={date.toISOString()} className={`tt-col ${isToday ? 'is-today' : ''}`}>
                  {isToday && minutesNow >= START_MINUTES && minutesNow <= END_MINUTES && (
                    <div
                      className="tt-now"
                      style={{ top: ((minutesNow - START_MINUTES) / 60) * PX_PER_HOUR }}
                      aria-hidden="true"
                    >
                      <span />
                    </div>
                  )}
                  {lessons.map((lesson) => {
                    const subject = SUBJECTS.find((item) => item.id === lesson.subjectId)
                    const start = timeToMinutes(lesson.start)
                    const end = timeToMinutes(lesson.end)
                    const top = ((start - START_MINUTES) / 60) * PX_PER_HOUR + 3
                    const height = ((end - start) / 60) * PX_PER_HOUR - 6
                    const short = end - start <= 60
                    return (
                      <button
                        type="button"
                        key={lesson.id}
                        className={`tt-lesson ${lesson.status} ${short ? 'short' : ''}`}
                        style={
                          {
                            top,
                            height,
                            '--subject': subject?.color ?? 'var(--accent)',
                          } as CSSProperties
                        }
                        onClick={() => setSelected({ lesson, date })}
                        aria-label={`${subject?.name}, ${lesson.start} à ${lesson.end}, salle ${lesson.room}`}
                      >
                        <span className="tt-lesson-time">
                          {lesson.start} · {lesson.end}
                        </span>
                        <strong>{subject?.short}</strong>
                        <span className="tt-room">
                          <MapPin size={10} /> {lesson.room}
                        </span>
                        {lesson.status !== 'normal' && (
                          <span className="tt-flag">{lesson.status === 'canceled' ? 'Annulé' : 'Salle modifiée'}</span>
                        )}
                      </button>
                    )
                  })}
                  {lessons.length === 0 && (
                    <div className="tt-free">
                      <Coffee size={16} />
                      <span>Libre</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="tt-legend">
          <span>
            <i className="legend-dot" style={{ background: 'var(--accent)' }} /> Cours
          </span>
          <span>
            <i className="legend-dot warn" /> Salle modifiée
          </span>
          <span>
            <i className="legend-dot bad" /> Annulé
          </span>
          <span className="tt-legend-time">
            <Clock size={13} /> 8 h — 18 h
          </span>
        </div>
      </div>

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selectedSubject?.name ?? 'Cours'}
        subtitle={selected ? `${formatLongDate(selected.date)} · ${selected.lesson.start} — ${selected.lesson.end}` : undefined}
      >
        {selected && selectedSubject && (
          <div className="lesson-detail">
            <div className="lesson-detail-top">
              <span className="lesson-detail-icon" style={{ background: `${selectedSubject.color}1f`, color: selectedSubject.color }}>
                <CalendarDays size={22} />
              </span>
              <div>
                <strong>{selectedSubject.name}</strong>
                <span>{DAY_NAMES[selected.lesson.weekday]} · {selected.lesson.start} — {selected.lesson.end}</span>
              </div>
              {selected.lesson.status !== 'normal' && (
                <Badge tone={selected.lesson.status === 'canceled' ? 'bad' : 'warn'}>
                  {selected.lesson.status === 'canceled' ? 'Annulé' : 'Modifié'}
                </Badge>
              )}
            </div>
            <div className="detail-rows">
              <div>
                <span>
                  <User size={15} /> Professeur
                </span>
                <strong>{selectedSubject.teacher}</strong>
              </div>
              <div>
                <span>
                  <MapPin size={15} /> Salle
                </span>
                <strong>{selected.lesson.room}</strong>
              </div>
              <div>
                <span>
                  <Clock size={15} /> Durée
                </span>
                <strong>
                  {Math.round(
                    ((timeToMinutes(selected.lesson.end) - timeToMinutes(selected.lesson.start)) / 60) * 10,
                  ) / 10}{' '}
                  h
                </strong>
              </div>
            </div>
            {selected.lesson.note && (
              <div className="notice">
                <AlertCircle size={18} />
                <div>
                  <strong>Information</strong>
                  <p>{selected.lesson.note}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
