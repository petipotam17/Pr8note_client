import { useMemo } from 'react'
import {
  DEFAULT_PERIOD,
  GRADES,
  HOMEWORK,
  LESSONS,
  LIFE_EVENTS,
  NEWS,
  PERIODS,
  RESOURCES,
  SUBJECTS,
  THREADS,
} from '../data/seed'
import type {
  Grade,
  Homework,
  Lesson,
  LifeEvent,
  NewsItem,
  Period,
  PeriodId,
  Resource,
  SchoolSubjectAverage,
  Subject,
  Thread,
} from '../types'
import { useStore } from './store'

export interface SchoolView {
  /** Vraies données PRONOTE (par opposition à la démonstration). */
  synced: boolean
  syncedAt: string | null
  periods: Period[]
  currentPeriodId: PeriodId
  previousPeriodId: PeriodId | null
  subjects: Subject[]
  grades: Grade[]
  averages: SchoolSubjectAverage[]
  generalAverage: number | null
  classGeneralAverage: number | null
  lessons: Lesson[]
  homework: Homework[]
  lifeEvents: LifeEvent[]
  threads: Thread[]
  news: NewsItem[]
  resources: Resource[]
}

const DEMO_VIEW: SchoolView = {
  synced: false,
  syncedAt: null,
  periods: PERIODS,
  currentPeriodId: DEFAULT_PERIOD,
  previousPeriodId: PERIODS[0]?.id ?? null,
  subjects: SUBJECTS,
  grades: GRADES,
  averages: [],
  generalAverage: null,
  classGeneralAverage: null,
  lessons: LESSONS,
  homework: HOMEWORK,
  lifeEvents: LIFE_EVENTS,
  threads: THREADS,
  news: NEWS,
  resources: RESOURCES,
}

const EMPTY_VIEW: SchoolView = {
  synced: false,
  syncedAt: null,
  periods: [],
  currentPeriodId: '',
  previousPeriodId: null,
  subjects: [],
  grades: [],
  averages: [],
  generalAverage: null,
  classGeneralAverage: null,
  lessons: [],
  homework: [],
  lifeEvents: [],
  threads: [],
  news: [],
  resources: [],
}

/**
 * Source unique des données d'école : les vraies données PRONOTE après une
 * connexion élève, ou le jeu de démonstration pour le compte de démo.
 */
export function useSchool(): SchoolView {
  const { state } = useStore()

  return useMemo(() => {
    if (!state.session || state.session.authMethod === 'demo') return DEMO_VIEW

    const school = state.school
    if (!school) return EMPTY_VIEW

    const periods: Period[] = school.periods.map((period) => ({
      id: period.id,
      label: period.name,
      range: period.range,
    }))
    const currentPeriodId =
      school.currentPeriodId ?? periods[periods.length - 1]?.id ?? periods[0]?.id ?? ''
    const currentIndex = periods.findIndex((period) => period.id === currentPeriodId)

    return {
      synced: true,
      syncedAt: school.syncedAt,
      periods,
      currentPeriodId,
      previousPeriodId: currentIndex > 0 ? periods[currentIndex - 1].id : null,
      subjects: school.subjects,
      grades: school.grades,
      averages: school.averages,
      generalAverage: school.generalAverage,
      classGeneralAverage: school.classGeneralAverage,
      lessons: school.lessons,
      homework: school.homework,
      lifeEvents: school.lifeEvents,
      threads: school.threads,
      news: school.news,
      resources: [],
    }
  }, [state.session, state.school])
}
