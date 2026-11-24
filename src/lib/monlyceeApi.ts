import type { Student } from '../types'

const PRODUCTION_AUTH_API = 'https://pr8note-auth-tt9qid.freebuff.site'
const LOCAL_AUTH_API = 'http://127.0.0.1:8787'

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
  verifiedAt?: string
  error?: string
  message?: string
}

function isStudent(value: Partial<Student> | undefined): value is Student {
  return Boolean(
    value &&
      typeof value.firstName === 'string' &&
      typeof value.lastName === 'string' &&
      typeof value.className === 'string',
  )
}

export async function signInWithMonlyceePassword(
  username: string,
  password: string,
): Promise<Student> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 35_000)

  try {
    const response = await fetch(`${AUTH_API_URL}/api/monlycee/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ username, password }),
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

    return {
      ...payload.student,
      authMethod: 'password',
      authLabel: 'MonLycée.net',
      subject: payload.student.subject || username,
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Le serveur de connexion met trop de temps à répondre. Réessaie.')
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
