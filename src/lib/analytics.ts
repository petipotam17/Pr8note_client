import type { Grade, Homework, PeriodId, Subject } from '../types'
import { daysUntil, dateAt } from './date'

export interface SubjectStats {
  subjectId: string
  average: number | null
  classAverage: number | null
  count: number
  evaluated: number
}

export function normalizedGrade(grade: Grade): number | null {
  if (grade.value === null) return null
  return (grade.value / grade.outOf) * 20
}

export function weightedAverage(values: { value: number; coef: number }[]): number | null {
  const total = values.reduce((sum, item) => sum + item.coef, 0)
  if (!total) return null
  return values.reduce((sum, item) => sum + item.value * item.coef, 0) / total
}

export function subjectStats(subjectId: string, grades: Grade[], period: PeriodId): SubjectStats {
  const list = grades.filter((grade) => grade.subjectId === subjectId && grade.period === period)
  const evaluated = list.filter((grade) => normalizedGrade(grade) !== null)
  const average = weightedAverage(
    evaluated.map((grade) => ({ value: normalizedGrade(grade) as number, coef: grade.coef })),
  )
  const classAverage = weightedAverage(
    evaluated
      .filter((grade) => grade.classAvg !== null)
      .map((grade) => ({ value: grade.classAvg as number, coef: grade.coef })),
  )
  return { subjectId, average, classAverage, count: list.length, evaluated: evaluated.length }
}

export function generalStats(subjects: Subject[], grades: Grade[], period: PeriodId) {
  const rows = subjects.map((subject) => ({ subject, ...subjectStats(subject.id, grades, period) }))
  const withAverage = rows.filter((row) => row.average !== null)
  const average = weightedAverage(
    withAverage.map((row) => ({ value: row.average as number, coef: row.subject.coef })),
  )
  const classAverage = weightedAverage(
    withAverage
      .filter((row) => row.classAverage !== null)
      .map((row) => ({ value: row.classAverage as number, coef: row.subject.coef })),
  )
  return { rows, average, classAverage }
}

export function rankedSubjects(subjects: Subject[], grades: Grade[], period: PeriodId): SubjectStats[] {
  return subjects
    .map((subject) => subjectStats(subject.id, grades, period))
    .filter((stats) => stats.average !== null)
    .sort((a, b) => (b.average as number) - (a.average as number))
}

/** Estimated place in a class of 32, from the general average — clearly labelled as an estimate in UI. */
export function estimatedRank(average: number | null, classSize = 32): number | null {
  if (average === null) return null
  return Math.min(classSize, Math.max(1, Math.round(classSize + 1 - ((average - 6) / 12) * classSize)))
}

export function gradeTrend(grades: Grade[], period: PeriodId): number[] {
  const chronological = grades
    .filter((grade) => grade.period === period && grade.value !== null)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
  const points: number[] = []
  let running = 0
  let coefSum = 0
  for (const grade of chronological) {
    const value = normalizedGrade(grade) as number
    running += value * grade.coef
    coefSum += grade.coef
    points.push(running / coefSum)
  }
  return points
}

export function averageDelta(average: number | null, reference: number | null): string | null {
  if (average === null || reference === null) return null
  const delta = average - reference
  return `${delta >= 0 ? '+' : '−'}${Math.abs(delta).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}`
}

export interface HomeworkStats {
  pending: Homework[]
  done: Homework[]
  late: Homework[]
  today: Homework[]
  totalMinutes: number
}

export function homeworkStats(homework: Homework[], doneMap: Record<string, boolean>): HomeworkStats {
  const pending = homework.filter((item) => !doneMap[item.id])
  const done = homework.filter((item) => doneMap[item.id])
  const late = pending.filter((item) => daysUntil(item.due) < 0)
  const today = pending.filter((item) => daysUntil(item.due) === 0)
  return {
    pending,
    done,
    late,
    today,
    totalMinutes: pending.reduce((sum, item) => sum + item.minutes, 0),
  }
}

export function workloadForWeek(homework: Homework[]): { day: string; minutes: number; date: string }[] {
  return Array.from({ length: 7 }, (_, index) => {
    const iso = dateAt(index)
    const minutes = homework
      .filter((item) => item.due === iso)
      .reduce((sum, item) => sum + item.minutes, 0)
    return {
      date: iso,
      day: new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + index)
        .toLocaleDateString('fr-FR', { weekday: 'short' })
        .replace('.', ''),
      minutes,
    }
  })
}

/** Compute projected subject and general averages if a new grade is added. */
export function simulateGrade(
  subjects: Subject[],
  grades: Grade[],
  period: PeriodId,
  subjectId: string,
  value: number,
  coef: number,
) {
  const current = generalStats(subjects, grades, period)
  const subject = subjects.find((item) => item.id === subjectId)
  if (!subject) return { currentGeneral: current.average, nextGeneral: current.average, currentSubject: null, nextSubject: null }

  const stats = subjectStats(subjectId, grades, period)
  const existingSubjectGrades = grades.filter(
    (grade) => grade.subjectId === subjectId && grade.period === period && grade.value !== null,
  )
  const weightedSum = existingSubjectGrades.reduce(
    (sum, grade) => sum + (normalizedGrade(grade) as number) * grade.coef,
    0,
  )
  const coefSum = existingSubjectGrades.reduce((sum, grade) => sum + grade.coef, 0)
  const nextSubject = (weightedSum + value * coef) / (coefSum + coef)

  const withProjection = subjects.map((item) => {
    if (item.id !== subjectId) return { subject: item, ...subjectStats(item.id, grades, period) }
    return { subject: item, ...stats, average: nextSubject }
  })
  const nextGeneral = weightedAverage(
    withProjection
      .filter((row) => row.average !== null)
      .map((row) => ({ value: row.average as number, coef: row.subject.coef })),
  )

  return {
    currentGeneral: current.average,
    nextGeneral,
    currentSubject: stats.average,
    nextSubject,
  }
}
