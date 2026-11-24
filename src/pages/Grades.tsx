import { useMemo, useState } from 'react'
import {
  ArrowRight,
  Calculator,
  ChevronDown,
  Sparkles,
  TrendingUp,
  Trophy,
  Target,
} from 'lucide-react'
import { DEFAULT_PERIOD, GRADES, PERIODS, SUBJECTS } from '../data/seed'
import type { PeriodId } from '../types'
import {
  averageDelta,
  estimatedRank,
  generalStats,
  gradeTrend,
  normalizedGrade,
  simulateGrade,
} from '../lib/analytics'
import { formatDateShort, formatGrade } from '../lib/date'
import { Badge, PageHeader, ProgressRing, Segmented, Sparkline } from '../components/ui'

const KIND_LABEL: Record<string, string> = {
  devoir: 'Devoir',
  controle: 'Contrôle',
  oral: 'Oral',
  dm: 'DM',
}

export function Grades() {
  const [period, setPeriod] = useState<PeriodId>(DEFAULT_PERIOD)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [simSubject, setSimSubject] = useState('maths')
  const [simValue, setSimValue] = useState(16)
  const [simCoef, setSimCoef] = useState(2)

  const stats = useMemo(() => generalStats(SUBJECTS, GRADES, period), [period])
  const otherPeriod = period === 'T2' ? 'T1' : 'T2'
  const reference = useMemo(() => generalStats(SUBJECTS, GRADES, otherPeriod), [otherPeriod])
  const trend = useMemo(() => gradeTrend(GRADES, period), [period])
  const rank = estimatedRank(stats.average)
  const classDelta = averageDelta(stats.average, stats.classAverage)
  const periodDelta = averageDelta(stats.average, reference.average)
  const weightedNotes = GRADES.filter((grade) => grade.period === period && grade.value !== null)

  const ranked = stats.rows
    .filter((row) => row.average !== null)
    .slice()
    .sort((a, b) => (b.average as number) - (a.average as number))
  const best = ranked[0]
  const weakest = ranked[ranked.length - 1]
  const bestSubject = best ? SUBJECTS.find((subject) => subject.id === best.subjectId) : null
  const weakestSubject = weakest ? SUBJECTS.find((subject) => subject.id === weakest.subjectId) : null
  const simSubjectData = SUBJECTS.find((subject) => subject.id === simSubject) ?? SUBJECTS[0]
  const simulation = simulateGrade(SUBJECTS, GRADES, period, simSubject, simValue, simCoef)
  const simDelta =
    simulation.nextGeneral !== null && simulation.currentGeneral !== null
      ? simulation.nextGeneral - simulation.currentGeneral
      : null
  const selectedPeriod = PERIODS.find((item) => item.id === period)

  return (
    <div className="page">
      <PageHeader
        eyebrow="Bulletin & progression"
        title="Tes notes"
        description="Chaque note raconte une histoire. Voici la tienne, sans le stress du bulletin."
        actions={
          <Segmented
            options={PERIODS.map((item) => ({ value: item.id, label: item.label }))}
            value={period}
            onChange={(value) => setPeriod(value)}
            label="Période"
          />
        }
      />

      <div className="grades-grid">
        <section className="card grades-hero col-8">
          <span className="grades-glow" />
          <div className="grades-hero-main">
            <ProgressRing
              value={stats.average ?? 0}
              max={20}
              size={158}
              stroke={12}
              label={stats.average !== null ? formatGrade(stats.average) : '—'}
              caption="/ 20"
            />
            <div className="grades-summary">
              <p className="eyebrow">
                Moyenne générale · {selectedPeriod?.label} {periodDelta && <span className="delta">{periodDelta} pts</span>}
              </p>
              <h2>
                {stats.average !== null && stats.average >= 16
                  ? 'Excellent trimestre.'
                  : stats.average !== null && stats.average >= 14
                    ? 'Une belle dynamique.'
                    : 'Chaque point compte.'}
              </h2>
              <div className="chip-row">
                <span className="chip">
                  Classe {stats.classAverage !== null ? formatGrade(stats.classAverage) : '—'}
                </span>
                <span className={`chip ${(stats.average ?? 0) >= (stats.classAverage ?? 0) ? 'chip-good' : 'chip-bad'}`}>
                  {classDelta && classDelta.startsWith('+') ? '+' : ''}
                  {classDelta} pts vs classe
                </span>
                <span className="chip">
                  <Trophy size={12} /> Rang estimé {rank ?? '—'}e / 32
                </span>
              </div>
              <div className="grade-spark">
                <span className="grade-spark-label">Évolution sur le trimestre</span>
                <Sparkline values={trend} height={64} />
              </div>
            </div>
          </div>
          <div className="grades-hero-side">
            <div className="grade-highlight">
              <span>Meilleure matière</span>
              <strong>
                {bestSubject?.short} {best ? formatGrade(best.average as number) : '—'}
              </strong>
              <em>{best?.count ?? 0} notes</em>
            </div>
            <div className="grade-highlight">
              <span>À consolider</span>
              <strong>
                {weakestSubject?.short} {weakest ? formatGrade(weakest.average as number) : '—'}
              </strong>
              <em>{weakest?.count ?? 0} notes</em>
            </div>
            <div className="grade-highlight">
              <span>Notes ce trimestre</span>
              <strong>{weightedNotes.length}</strong>
              <em>{SUBJECTS.length} matières suivies</em>
            </div>
          </div>
        </section>

        <section className="card simulator col-4">
          <div className="card-head">
            <div>
              <p className="eyebrow">
                <Calculator size={13} /> Simulateur
              </p>
              <h2>Et si tu avais…</h2>
            </div>
            <Sparkles size={18} className="muted-icon" />
          </div>

          <div className="field">
            <label htmlFor="sim-subject">Matière</label>
            <select id="sim-subject" value={simSubject} onChange={(event) => setSimSubject(event.target.value)}>
              {SUBJECTS.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="sim-value">
              Note imaginée <strong>{formatGrade(simValue)}/20</strong>
            </label>
            <input
              id="sim-value"
              type="range"
              min={0}
              max={20}
              step={0.5}
              value={simValue}
              onChange={(event) => setSimValue(Number(event.target.value))}
              style={{ accentColor: 'var(--accent)' }}
            />
          </div>

          <div className="field">
            <label htmlFor="sim-coef">
              Coefficient <strong>{simCoef}</strong>
            </label>
            <input
              id="sim-coef"
              type="range"
              min={1}
              max={5}
              step={1}
              value={simCoef}
              onChange={(event) => setSimCoef(Number(event.target.value))}
              style={{ accentColor: 'var(--accent)' }}
            />
          </div>

          <div className="sim-result">
            <div className="sim-row">
              <span>{simSubjectData.short}</span>
              <strong>{simulation.currentSubject !== null ? formatGrade(simulation.currentSubject) : '—'}</strong>
              <ArrowRight size={14} />
              <strong className="sim-next">
                {simulation.nextSubject !== null ? formatGrade(simulation.nextSubject) : '—'}
              </strong>
            </div>
            <div className="sim-row sim-general">
              <span>Moyenne générale</span>
              <strong>{simulation.currentGeneral !== null ? formatGrade(simulation.currentGeneral) : '—'}</strong>
              <ArrowRight size={14} />
              <strong className="sim-next">
                {simulation.nextGeneral !== null ? formatGrade(simulation.nextGeneral) : '—'}
              </strong>
            </div>
            {simDelta !== null && (
              <Badge tone={simDelta >= 0 ? 'good' : 'bad'}>
                <TrendingUp size={12} />
                {simDelta >= 0 ? '+' : '−'}
                {Math.abs(simDelta).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} pt
                {Math.abs(simDelta) >= 2 ? 's' : ''}
              </Badge>
            )}
          </div>
          <p className="sim-note">
            <Target size={13} /> Une estimation à titre indicatif. Seuls tes vrais devoirs comptent.
          </p>
        </section>
      </div>

      <section className="card subjects-card">
        <div className="card-head">
          <div>
            <p className="eyebrow">Détail par matière</p>
            <h2>Ton bulletin interactif</h2>
          </div>
          <div className="legend-inline">
            <span>
              <i className="dot me" /> Toi
            </span>
            <span>
              <i className="dot class" /> Moyenne de classe
            </span>
          </div>
        </div>

        <div className="subject-list">
          {stats.rows.map((row) => {
            const subject = SUBJECTS.find((item) => item.id === row.subjectId)
            if (!subject) return null
            const open = expanded === subject.id
            const delta = averageDelta(row.average, row.classAverage)
            const subjectGrades = GRADES.filter(
              (grade) => grade.subjectId === subject.id && grade.period === period,
            ).sort((a, b) => b.date.localeCompare(a.date))
            return (
              <div key={subject.id} className={`subject-item ${open ? 'open' : ''}`}>
                <button
                  type="button"
                  className="subject-row"
                  onClick={() => setExpanded(open ? null : subject.id)}
                  aria-expanded={open}
                >
                  <span className="subject-identity">
                    <span className="subject-dot" style={{ background: subject.color }} />
                    <span>
                      <strong>{subject.name}</strong>
                      <em>
                        {subject.teacher} · coef {subject.coef}
                      </em>
                    </span>
                  </span>
                  <span className="subject-bar">
                    <span className="subject-bar-fill" style={{ width: `${((row.average ?? 0) / 20) * 100}%`, background: subject.color }} />
                    {row.classAverage !== null && (
                      <span className="subject-bar-marker" style={{ left: `${(row.classAverage / 20) * 100}%` }} />
                    )}
                  </span>
                  <span className={`subject-average ${delta?.startsWith('+') ? 'good' : delta ? 'bad' : ''}`}>
                    {row.average !== null ? formatGrade(row.average) : '—'}
                    <small>/20</small>
                  </span>
                  <span className="subject-count">{row.evaluated}</span>
                  <ChevronDown size={17} className={`subject-chevron ${open ? 'rotated' : ''}`} />
                </button>

                {open && (
                  <div className="subject-detail">
                    <div className="grade-table">
                      <div className="grade-table-head">
                        <span>Évaluation</span>
                        <span>Date</span>
                        <span>Coef</span>
                        <span>Classe</span>
                        <span>Note</span>
                      </div>
                      {subjectGrades.map((grade) => {
                        const normalized = normalizedGrade(grade)
                        const tone = normalized === null ? 'mid' : normalized >= 15 ? 'good' : normalized >= 10 ? 'mid' : 'bad'
                        return (
                          <div key={grade.id} className="grade-line">
                            <div className="grade-line-title">
                              <strong>{grade.title}</strong>
                              <span>{KIND_LABEL[grade.kind] ?? grade.kind}</span>
                              {grade.comment && <p>« {grade.comment} »</p>}
                            </div>
                            <span>{formatDateShort(grade.date)}</span>
                            <span>×{grade.coef}</span>
                            <span>{grade.classAvg !== null ? formatGrade(grade.classAvg) : '—'}</span>
                            <span className={`grade-pill ${tone}`}>
                              {grade.value !== null ? formatGrade(grade.value) : 'Abs.'}
                              <small>/{grade.outOf}</small>
                            </span>
                          </div>
                        )
                      })}
                    </div>
                    {row.average === null && <p className="subject-empty">Aucune note pour cette période.</p>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <p className="card-footnote">Moyennes pondérées par coefficient et par matière. Données de démonstration.</p>
      </section>
    </div>
  )
}
