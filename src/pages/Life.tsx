import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  CalendarX2,
  CheckCircle2,
  Clock4,
  Mail,
  MapPin,
  MessageSquare,
  ShieldCheck,
  StickyNote,
  UserCheck,
} from 'lucide-react'
import { useSchool } from '../lib/school'
import { useStore } from '../lib/store'
import { formatDateShort, formatMinutes } from '../lib/date'
import { Badge, PageHeader, ProgressRing } from '../components/ui'

const TYPE_META = {
  absence: { label: 'Absence', icon: CalendarX2, color: '#ff9f5a' },
  retard: { label: 'Retard', icon: Clock4, color: '#f7b955' },
  sanction: { label: 'Sanction', icon: AlertTriangle, color: '#fb7185' },
  note: { label: 'Observation', icon: StickyNote, color: '#4aa8ff' },
} as const

export function Life() {
  const { state } = useStore()
  const { lifeEvents: LIFE_EVENTS, subjects: SUBJECTS, synced } = useSchool()
  const events = LIFE_EVENTS.slice().sort((a, b) => b.date.localeCompare(a.date))
  const absences = events.filter((event) => event.type === 'absence')
  const late = events.filter((event) => event.type === 'retard')
  const sanctions = events.filter((event) => event.type === 'sanction')

  const justified = (eventId: string, base: boolean) => base || (!synced && state.justified.includes(eventId))
  const missingProof = events.filter((event) => !justified(event.id, event.justified) && event.type !== 'note')
  const absenceHours = absences.reduce((sum, event) => sum + (event.durationHours ?? 0), 0)
  const attendance = Math.round(Math.max(0, 100 - absenceHours * 0.7))
  const justifiedCount = events.filter((event) => justified(event.id, event.justified)).length
  const justifiedRate = Math.round((justifiedCount / events.length) * 100)

  return (
    <div className="page">
      <PageHeader
        eyebrow="Suivi & assiduité"
        title="Vie scolaire"
        description="Tes absences, tes retards et tes échanges avec la vie scolaire, sans zone d’ombre."
        actions={
          <Link to="/messages" className="btn btn-outline btn-sm">
            <Mail size={15} /> Contacter la vie scolaire
          </Link>
        }
      />

      <div className="life-stats">
        <div className="card life-stat">
          <span className="life-stat-icon orange">
            <CalendarX2 size={19} />
          </span>
          <div>
            <span>Absences</span>
            <strong>
              {formatMinutes(absenceHours * 60)} <small>· {absences.length} fois</small>
            </strong>
          </div>
        </div>
        <div className="card life-stat">
          <span className="life-stat-icon yellow">
            <Clock4 size={19} />
          </span>
          <div>
            <span>Retards</span>
            <strong>
              {late.length} <small>ce trimestre</small>
            </strong>
          </div>
        </div>
        <div className="card life-stat">
          <span className="life-stat-icon green">
            <UserCheck size={19} />
          </span>
          <div>
            <span>Justificatifs</span>
            <strong>
              {justifiedRate}% <small>à jour</small>
            </strong>
          </div>
        </div>
        <div className="card life-stat">
          <span className="life-stat-icon red">
            <AlertTriangle size={19} />
          </span>
          <div>
            <span>Sanctions</span>
            <strong>
              {sanctions.length} <small>cette année</small>
            </strong>
          </div>
        </div>
      </div>

      <div className="life-grid">
        <section className="card col-8">
          <div className="card-head">
            <div>
              <p className="eyebrow">Journal</p>
              <h2>Ton suivi</h2>
            </div>
            {missingProof.length > 0 ? (
              <Badge tone="warn">
                <Clock4 size={12} /> {missingProof.length} à justifier
              </Badge>
            ) : (
              <Badge tone="good">
                <CheckCircle2 size={12} /> Tout est à jour
              </Badge>
            )}
          </div>

          <div className="timeline">
            {events.map((event) => {
              const meta = TYPE_META[event.type]
              const Icon = meta.icon
              const isJustified = justified(event.id, event.justified)
              const subject = event.subjectId ? SUBJECTS.find((item) => item.id === event.subjectId) : null
              return (
                <article key={event.id} className="timeline-item">
                  <span className="timeline-icon" style={{ color: meta.color, background: `${meta.color}18` }}>
                    <Icon size={18} />
                  </span>
                  <div className="timeline-content">
                    <div className="timeline-head">
                      <strong>{meta.label}</strong>
                      <span>
                        {formatDateShort(event.date)}
                        {event.start ? ` · ${event.start}${event.end ? ` — ${event.end}` : ''}` : ''}
                      </span>
                    </div>
                    <p>{event.reason}</p>
                    <div className="timeline-meta">
                      {subject && <span className="mini-tag">{subject.short}</span>}
                      {event.durationHours ? <span className="mini-tag">{formatMinutes(event.durationHours * 60)}</span> : null}
                      <Badge tone={isJustified ? 'good' : 'warn'}>
                        {isJustified ? 'Justifié' : 'En attente de justificatif'}
                      </Badge>
                      {!isJustified && event.type !== 'note' && !synced && (
                        <span className="mini-tag">Justificatif à transmettre</span>
                      )}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </section>

        <aside className="life-side col-4">
          <section className="card attendance-card">
            <div className="card-head">
              <div>
                <p className="eyebrow">Assiduité</p>
                <h2>Ta présence</h2>
              </div>
              <ShieldCheck size={18} className="muted-icon" />
            </div>
            <ProgressRing value={attendance} max={100} size={144} label={`${attendance}%`} caption="assiduité" />
            <div className="attendance-rows">
              <div>
                <span>Heures manquées</span>
                <strong>{formatMinutes(absenceHours * 60)}</strong>
              </div>
              <div>
                <span>Justificatifs à fournir</span>
                <strong>{missingProof.length}</strong>
              </div>
              <div>
                <span>Retards</span>
                <strong>{late.length}</strong>
              </div>
            </div>
            <p className="attendance-note">
              {synced
                ? 'Ces absences et retards sont lus sur ton compte PRONOTE. Les justificatifs se transmettent auprès de la vie scolaire.'
                : 'Une absence justifiée sous 48 h n’a aucun impact sur ton dossier. Pense à transmettre tes certificats.'}
            </p>
          </section>

          <section className="card info-card">
            <h3>Tes repères</h3>
            <div className="info-row">
              <span className="info-icon">
                <Clock4 size={15} />
              </span>
              <div>
                <strong>Vie scolaire</strong>
                <p>Horaires et bureau disponibles auprès de ton établissement.</p>
              </div>
            </div>
            <div className="info-row">
              <span className="info-icon">
                <MapPin size={15} />
              </span>
              <div>
                <strong>Établissement</strong>
                <p>{state.session?.establishment || 'Non renseigné'}</p>
              </div>
            </div>
            <div className="info-row">
              <span className="info-icon">
                <MessageSquare size={15} />
              </span>
              <div>
                <strong>Une question ?</strong>
                <p>Écris directement à la vie scolaire depuis la messagerie.</p>
              </div>
            </div>
            <Link to="/messages" className="btn btn-ghost btn-block btn-sm">
              Ouvrir la messagerie
            </Link>
          </section>
        </aside>
      </div>
    </div>
  )
}
