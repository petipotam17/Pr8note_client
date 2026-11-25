import type { SchoolData, SchoolError, Student } from '../types'

const PRODUCTION_AUTH_API = 'https://pr8note-auth-tt9qid.freebuff.site'
const LOCAL_AUTH_API = 'http://127.0.0.1:8787'
const PRONOTE_URL_KEY = 'pr8note:pronote-url'

/**
 * Le serveur de connexion est séparé du site statique : GitHub Pages ne peut
 * pas ouvrir une session MonLycée à cause de CORS et du cookie du portail.
 */
export function getAuthApiUrl(): string {
  if (typeof window === 'undefined') return PRODUCTION_AUTH_API
  const host = window.location.hostname
  if (host === '127.0.0.1' || host === 'localhost') return LOCAL_AUTH_API
  return PRODUCTION_AUTH_API
}

export const AUTH_API_URL = getAuthApiUrl()

interface LoginPayload {
  student?: Partial<Student>
  school?: SchoolData | null
  schoolError?: SchoolError | null
  pronoteUrl?: string | null
  verifiedAt?: string
  error?: string
  message?: string
}

export interface MonlyceeSignInResult {
  student: Student
  school: SchoolData | null
  schoolError: SchoolError | null
  pronoteUrl: string | null
}

function isStudent(value: Partial<Student> | undefined): value is Student {
  return Boolean(
    value &&
      typeof value.firstName === 'string' &&
      typeof value.lastName === 'string' &&
      typeof value.className === 'string',
  )
}

function isSchool(value: unknown): value is SchoolData {
  if (!value || typeof value !== 'object') return false
  const school = value as Partial<SchoolData>
  return (
    Array.isArray(school.subjects) &&
    Array.isArray(school.grades) &&
    Array.isArray(school.lessons) &&
    Array.isArray(school.homework) &&
    Array.isArray(school.threads) &&
    Array.isArray(school.lifeEvents)
  )
}

export function loadSavedPronoteUrl(): string {
  try {
    return localStorage.getItem(PRONOTE_URL_KEY) ?? ''
  } catch {
    return ''
  }
}

export function savePronoteUrl(url: string): void {
  try {
    if (url.trim()) localStorage.setItem(PRONOTE_URL_KEY, url.trim())
  } catch {
    // Le stockage local peut être indisponible (navigation privée).
  }
}

export async function signInWithMonlyceePassword(
  username: string,
  password: string,
  pronoteUrl?: string,
): Promise<MonlyceeSignInResult> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 90_000)

  try {
    const response = await fetch(`${AUTH_API_URL}/api/monlycee/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ username, password, pronoteUrl: pronoteUrl?.trim() || undefined }),
      signal: controller.signal,
      cache: 'no-store',
      credentials: 'omit',
    })

    let payload: LoginPayload | null = null
    try {
      payload = (await response.json()) as LoginPayload
    } catch {
      payload = null
    }

    if (!response.ok) {
      throw new Error(
        payload?.message ||
          (response.status === 429
            ? 'Trop de tentatives. Attends quelques minutes avant de réessayer.'
            : 'La connexion MonLycée n’a pas abouti. Réessaie dans quelques instants.'),
      )
    }

    if (!payload || !isStudent(payload.student)) {
      throw new Error('Le serveur de connexion a renvoyé une réponse incomplète.')
    }

    const school = isSchool(payload.school) ? payload.school : null
    // Une adresse devinée n'est mémorisée que si elle a réellement ouvert
    // PRONOTE ; une adresse saisie à la main est conservée telle quelle.
    if (payload.pronoteUrl && (school || pronoteUrl?.trim())) {
      savePronoteUrl(payload.pronoteUrl)
    }

    return {
      student: {
        ...payload.student,
        authMethod: 'password',
        authLabel: 'MonLycée.net',
        subject: payload.student.subject || username,
      },
      school,
      schoolError:
        payload.schoolError && typeof payload.schoolError.message === 'string'
          ? payload.schoolError
          : null,
      pronoteUrl: payload.pronoteUrl ?? null,
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(
        'La synchronisation PRONOTE met trop de temps à répondre. Réessaie dans quelques instants.',
      )
    }
    if (error instanceof TypeError) {
      throw new Error(
        'Impossible de joindre le serveur de connexion Pr8note. Vérifie ta connexion internet.',
      )
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}
