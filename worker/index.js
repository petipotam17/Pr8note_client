/**
 * Pr8note — passerelle de connexion MonLycée.net.
 *
 * Ce Worker reproduit la connexion au portail officiel avec les identifiants
 * de l'élève, puis renvoie uniquement l'identité utile à Pr8note. Le mot de
 * passe ne quitte jamais la mémoire de la requête : il n'est ni stocké, ni
 * journalisé, ni renvoyé au navigateur.
 *
 * Flux :
 *   GET  psn.monlycee.net/oauth2/start
 *   ->   auth.monlycee.net (formulaire Keycloak)
 *   POST identifiants
 *   ->   psn.monlycee.net/oauth2/callback
 *   ->   session oauth2-proxy (cookie conservé en mémoire)
 *   ->   lecture de /oauth2/userinfo (ou /directory/user/me)
 */

import {
  RATE_LIMIT_RETRY_AFTER_SECONDS,
  consumeRateLimit,
  ensureRateLimitSchema,
  refundRateLimit,
} from './rateLimit.js'
import {
  PronoteError,
  describePronoteError,
  discoverPronoteCandidates,
  normalizePronoteUrl,
  openPronoteSession,
  readSchoolData,
} from './pronote.js'

const PORTAL_ORIGIN = 'https://psn.monlycee.net'
const START_URL = `${PORTAL_ORIGIN}/oauth2/start?rd=${encodeURIComponent(`${PORTAL_ORIGIN}/`)}`
const ALLOWED_HOSTS = new Set(['psn.monlycee.net', 'auth.monlycee.net'])
const ALLOWED_ORIGINS = new Set([
  'https://petipotam17.github.io',
  'http://127.0.0.1:4173',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
])

const REQUEST_TIMEOUT_MS = 18_000
const MAX_REDIRECTS = 12
const MAX_BODY_BYTES = 4096

const BROWSER_HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Pr8note/1.0',
}

export class LoginError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {number} status
   */
  constructor(code, message, status = 400) {
    super(message)
    this.name = 'LoginError'
    this.code = code
    this.status = status
  }
}

/** @param {string} value */
function decodeHtml(value) {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
}

/** @param {string} html */
function stripTags(html) {
  return decodeHtml(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

/** @param {string} html */
function hasCaptcha(html) {
  return /g-recaptcha|h-captcha|hcaptcha|cf-turnstile|recaptcha|class="[^"]*captcha|id="[^"]*captcha/i.test(
    html,
  )
}

/** @param {string} html */
function hasOtp(html) {
  return /name="otp"|name="totp"|login-otp|kc-otp|one-time|authenticator|webauthn|passkey/i.test(html)
}

/** @param {string} html */
function hasConsent(html) {
  return /kc-consent|id="kc-consent-form"|name="accept"|terms of service|conditions d.utilisation/i.test(
    html,
  )
}

/** @param {string} html */
function isLoginForm(html) {
  return /id="kc-form-login"|name="username"[\s\S]{0,1200}name="password"/i.test(html)
}

/** @param {string} html */
function portalLooksBlocked(html) {
  return /imperva|incapsula|request unsuccessful|access denied|blocked by|security check|captcha/i.test(
    html,
  )
}

/**
 * Extrait le formulaire Keycloak de la page de connexion.
 * @param {string} html
 * @param {string} pageUrl
 * @returns {{ action: string; fields: Record<string, string>; captcha: boolean; otp: boolean; consent: boolean } | null}
 */
export function parseLoginForm(html, pageUrl) {
  const formMatch = html.match(/<form[^>]*id=["']kc-form-login["'][^>]*>/i)
  if (!formMatch) return null

  const tag = formMatch[0]
  const actionMatch = tag.match(/action=["']([^"']+)["']/i)
  if (!actionMatch) return null

  let action
  try {
    action = new URL(decodeHtml(actionMatch[1]), pageUrl).toString()
  } catch {
    return null
  }

  const formStart = html.indexOf(formMatch[0])
  const formEnd = html.indexOf('</form>', formStart)
  const formHtml = formEnd === -1 ? html.slice(formStart) : html.slice(formStart, formEnd)
  const fields = {}
  const inputPattern = /<input\b[^>]*>/gi
  let input
  while ((input = inputPattern.exec(formHtml))) {
    const nameMatch = input[0].match(/\bname=["']([^"']+)["']/i)
    if (!nameMatch) continue
    const valueMatch = input[0].match(/\bvalue=["']([^"']*)["']/i)
    fields[decodeHtml(nameMatch[1])] = valueMatch ? decodeHtml(valueMatch[1]) : ''
  }

  return {
    action,
    fields,
    captcha: hasCaptcha(formHtml),
    otp: hasOtp(formHtml),
    consent: hasConsent(formHtml),
  }
}

/**
 * Récupère un message d'erreur lisible dans une page Keycloak, sans exposer le HTML.
 * @param {string} html
 */
export function extractLoginError(html) {
  const candidates = [
    /id=["']kc-error-message["'][^>]*>([\s\S]*?)<\/(?:div|span|p)>/i,
    /class=["'][^"']*(?:pf-v5-c-alert__title|kc-feedback-text|input-error-message)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|span|p|h[1-6])>/i,
    /id=["']input-error-username["'][^>]*>([\s\S]*?)<\//i,
    /id=["']input-error-password["'][^>]*>([\s\S]*?)<\//i,
  ]
  for (const pattern of candidates) {
    const match = html.match(pattern)
    const text = match ? stripTags(match[1]) : ''
    if (text) return text
  }
  return ''
}

/**
 * @param {Headers} headers
 * @returns {string[]}
 */
function getSetCookies(headers) {
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie()
  }
  const raw = headers.get('set-cookie')
  if (!raw) return []
  // Repli pour les runtimes sans getSetCookie : les dates Expires contiennent
  // une virgule, on ne coupe donc qu'après elles.
  return raw.split(/,(?=\s*[^;,\s]+=)/g)
}

/**
 * Petit bocal de cookies, limité aux domaines MonLycée.
 */
export class CookieJar {
  constructor() {
    /** @type {Map<string, { name: string; value: string; domain: string; path: string; hostOnly: boolean; secure: boolean; expiresAt: number | null }>} */
    this.cookies = new Map()
    /** Hôtes supplémentaires autorisés (le PRONOTE de l'établissement). */
    this.extraHosts = new Set()
  }

  /** @param {string} host */
  allowHost(host) {
    const normalized = host.toLowerCase().replace(/^\./, '')
    if (normalized) this.extraHosts.add(normalized)
  }

  /** @param {string} host */
  allows(host) {
    const normalized = host.toLowerCase().replace(/^\./, '')
    if (isAllowedHost(normalized)) return true
    if (this.extraHosts.has(normalized)) return true
    for (const extra of this.extraHosts) {
      if (extra.endsWith(`.${normalized}`)) return true
    }
    return false
  }

  /** @param {string} url */
  static host(url) {
    return new URL(url).hostname.toLowerCase()
  }

  /**
   * @param {string} header
   * @param {string} requestUrl
   */
  addCookieHeader(header, requestUrl) {
    const parts = header.split(';')
    const first = parts.shift() || ''
    const equals = first.indexOf('=')
    if (equals <= 0) return
    const name = first.slice(0, equals).trim()
    const value = first.slice(equals + 1).trim()
    if (!name) return

    const host = CookieJar.host(requestUrl)
    let domain = host
    let path = '/'
    let hostOnly = true
    let secure = false
    let expiresAt = null

    for (const part of parts) {
      const index = part.indexOf('=')
      const key = (index === -1 ? part : part.slice(0, index)).trim().toLowerCase()
      const attr = index === -1 ? '' : part.slice(index + 1).trim()
      if (key === 'domain' && attr) {
        domain = attr.replace(/^\./, '').toLowerCase()
        hostOnly = false
      } else if (key === 'path' && attr.startsWith('/')) {
        path = attr
      } else if (key === 'secure') {
        secure = true
      } else if (key === 'max-age') {
        const seconds = Number.parseInt(attr, 10)
        if (Number.isFinite(seconds)) expiresAt = Date.now() + seconds * 1000
      } else if (key === 'expires' && expiresAt === null) {
        const parsed = Date.parse(attr)
        if (Number.isFinite(parsed)) expiresAt = parsed
      }
    }

    if (!domain || (!host.endsWith(domain) && host !== domain)) return
    if (!this.allows(domain)) return

    const key = `${domain}|${path}|${name}`
    if (expiresAt !== null && expiresAt <= Date.now()) {
      this.cookies.delete(key)
      return
    }
    this.cookies.set(key, { name, value, domain, path, hostOnly, secure, expiresAt })
    if (this.cookies.size > 80) {
      const oldest = this.cookies.keys().next().value
      if (oldest) this.cookies.delete(oldest)
    }
  }

  /** @param {Response} response @param {string} requestUrl */
  absorb(response, requestUrl) {
    for (const header of getSetCookies(response.headers)) {
      this.addCookieHeader(header, requestUrl)
    }
  }

  /** @param {string} url */
  headerFor(url) {
    const host = CookieJar.host(url)
    const path = new URL(url).pathname || '/'
    const secure = new URL(url).protocol === 'https:'
    const matching = []

    for (const cookie of this.cookies.values()) {
      if (cookie.expiresAt !== null && cookie.expiresAt <= Date.now()) continue
      if (cookie.secure && !secure) continue
      if (cookie.hostOnly ? host !== cookie.domain : host !== cookie.domain && !host.endsWith(`.${cookie.domain}`)) {
        continue
      }
      if (!path.startsWith(cookie.path)) continue
      matching.push(cookie)
    }

    matching.sort((a, b) => b.path.length - a.path.length)
    return matching.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')
  }

  /** @param {string} name */
  has(name) {
    for (const cookie of this.cookies.values()) {
      if (cookie.name === name) return true
    }
    return false
  }

  /** @param {string} prefix */
  hasPrefix(prefix) {
    for (const cookie of this.cookies.values()) {
      if (cookie.name.startsWith(prefix)) return true
    }
    return false
  }

  /** @param {string} name */
  get(name) {
    for (const cookie of this.cookies.values()) {
      if (cookie.name === name) return cookie.value
    }
    return ''
  }

  /** La session du portail est le cookie oauth2-proxy, pas le cookie Keycloak. */
  hasPortalSession() {
    for (const cookie of this.cookies.values()) {
      if (cookie.name === '_oauth2_proxy') return true
      if (cookie.name.startsWith('_oauth2_proxy_') && !cookie.name.endsWith('_csrf')) return true
    }
    return false
  }
}

/** @param {string} host */
function isAllowedHost(host) {
  const normalized = host.toLowerCase().replace(/^\./, '')
  return (
    ALLOWED_HOSTS.has(normalized) ||
    normalized === 'monlycee.net' ||
    normalized.endsWith('.monlycee.net')
  )
}

/** @param {string} value */
function redactUrl(value) {
  try {
    const url = new URL(value)
    for (const key of ['code', 'state', 'session_code', 'execution', 'tab_id']) {
      if (url.searchParams.has(key)) url.searchParams.set(key, '…')
    }
    return url.toString()
  } catch {
    return 'URL invalide'
  }
}

/**
 * Suit les redirections à la main pour conserver les cookies et rester dans
 * les domaines MonLycée. Aucune redirection vers un autre fournisseur n'est
 * suivie.
 *
 * @param {string} url
 * @param {RequestInit} init
 * @param {CookieJar} jar
 * @param {{ fetchImpl?: typeof fetch; maxRedirects?: number }} [options]
 */
// Diagnostic temporaire : signature technique d'un échec réseau, sans hôte,
// sans identifiant et sans jeton (seules les longueurs des segments).
const DIAG_KEY = 'p8d1-6a3f2c'
let diagSchemaReady = null

/**
 * @param {D1Database | undefined} db
 * @param {{ stage: string; method: string; url: string; body: unknown; error: unknown }} failure
 */
async function recordNetworkFailure(db, failure) {
  if (!db) return
  try {
    if (!diagSchemaReady) {
      diagSchemaReady = db
        .prepare(
          'CREATE TABLE IF NOT EXISTS diag_net (ts INTEGER PRIMARY KEY, stage TEXT, method TEXT, shape TEXT, query INTEGER, body INTEGER, name TEXT, message TEXT, code TEXT, cause TEXT)',
        )
        .run()
    }
    await diagSchemaReady
    const target = new URL(String(failure.url))
    const shape =
      target.pathname
        .split('/')
        .map((part) => (part ? `{${part.length}}` : ''))
        .join('/') || '/'
    const typed = /** @type {any} */ (failure.error)
    await db
      .prepare(
        'INSERT OR REPLACE INTO diag_net (ts, stage, method, shape, query, body, name, message, code, cause) VALUES (?,?,?,?,?,?,?,?,?,?)',
      )
      .bind(
        Date.now(),
        String(failure.stage).slice(0, 48),
        String(failure.method).slice(0, 8),
        shape.slice(0, 140),
        target.search.length,
        typeof failure.body === 'string' ? failure.body.length : -1,
        String(typed?.name ?? '').slice(0, 60),
        String(typed?.message ?? '').slice(0, 200),
        String(typed?.cause?.code ?? '').slice(0, 80),
        String(typed?.cause?.message ?? '').slice(0, 200),
      )
      .run()
  } catch {
    // Le diagnostic ne doit jamais gêner la connexion.
    diagSchemaReady = null
  }
}

async function fetchFollowing(url, init, jar, options = {}) {
  const fetchImpl = options.fetchImpl || fetch
  const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS
  let current = new URL(url)
  let method = (init.method || 'GET').toUpperCase()
  let body = init.body

  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    if (options.budget) {
      if (options.budget.used >= options.budget.max) {
        throw new LoginError(
          'STEP_LIMIT',
          'La connexion a demandé trop d’étapes. Réessaie dans quelques instants.',
          502,
        )
      }
      options.budget.used += 1
    }
    if (!isAllowedHost(current.hostname)) {
      throw new LoginError(
        'UNSUPPORTED_PROVIDER',
        'MonLycée redirige vers un autre fournisseur d’identité. Cette connexion n’est pas prise en charge.',
        422,
      )
    }

    const headers = new Headers(init.headers || {})
    const cookie = jar.headerFor(current.toString())
    if (cookie) headers.set('Cookie', cookie)
    if (method === 'GET' || method === 'HEAD') headers.delete('Content-Type')

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    let response
    try {
      response = await fetchImpl(current.toString(), {
        ...init,
        method,
        body,
        headers,
        redirect: 'manual',
        signal: controller.signal,
      })
    } catch (error) {
      if (error instanceof LoginError) throw error
      const aborted = error instanceof Error && error.name === 'AbortError'
      throw new LoginError(
        aborted ? 'TIMEOUT' : 'NETWORK',
        aborted
          ? 'MonLycée met trop de temps à répondre. Réessaie dans quelques instants.'
          : 'Impossible de joindre MonLycée pour le moment. Réessaie dans quelques instants.',
        502,
      )
    } finally {
      clearTimeout(timer)
    }

    jar.absorb(response, current.toString())

    const location = response.headers.get('location')
    if (response.status >= 300 && response.status < 400 && location) {
      let next
      try {
        next = new URL(location, current)
      } catch {
        throw new LoginError('UNEXPECTED', 'MonLycée a renvoyé une redirection invalide.', 502)
      }
      if (response.status === 303 || (response.status === 302 && method === 'POST')) {
        method = 'GET'
        body = undefined
      }
      current = next
      continue
    }

    return { response, finalUrl: current.toString() }
  }

  throw new LoginError(
    'TOO_MANY_REDIRECTS',
    'MonLycée a interrompu la connexion (trop de redirections). Réessaie dans quelques instants.',
    502,
  )
}

/**
 * @param {Record<string, unknown>} value
 * @param {string} key
 */
function readString(value, key) {
  const found = value?.[key]
  if (typeof found === 'string' && found.trim()) return found.trim()
  if (typeof found === 'number' && Number.isFinite(found)) return String(found)
  return ''
}

/** @param {unknown} value */
function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value)
    : null
}

/**
 * @param {Record<string, unknown>} source
 * @param {string[]} keys
 */
function pick(source, keys) {
  for (const key of keys) {
    const value = readString(source, key)
    if (value) return value
  }
  return ''
}

/** @param {string} value */
function capitalizePart(value) {
  if (!value) return ''
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
}

/**
 * @param {string} username
 * @param {Record<string, unknown>[]} sources
 */
export function studentFromPayload(username, sources) {
  let firstName = ''
  let lastName = ''
  let fullName = ''
  let className = ''
  let level = ''
  let establishment = ''
  let city = ''
  let email = ''
  let subject = ''

  for (const source of sources) {
    if (!source) continue
    firstName ||= pick(source, ['firstName', 'firstname', 'given_name', 'givenName', 'prenom', 'prénom'])
    lastName ||= pick(source, ['lastName', 'lastname', 'family_name', 'familyName', 'nom', 'surname'])
    fullName ||= pick(source, ['displayName', 'display_name', 'fullName', 'full_name', 'name'])
    className ||= pick(source, [
      'className',
      'class_name',
      'classe',
      'division',
      'class',
      'levelClass',
      'niveauClasse',
    ])
    level ||= pick(source, ['level', 'niveau', 'grade', 'profile', 'profil'])
    establishment ||= pick(source, [
      'establishment',
      'establishmentName',
      'etablissement',
      'établissement',
      'school',
      'schoolName',
      'structureName',
      'organization',
      'tenant',
    ])
    city ||= pick(source, ['city', 'ville', 'commune'])
    email ||= pick(source, ['email', 'mail', 'courriel'])
    subject ||= pick(source, ['sub', 'subject', 'id', 'userId', 'user_id', 'preferred_username', 'preferredUsername', 'login', 'username'])
  }

  if (!firstName && fullName) {
    const parts = fullName.split(/\s+/).filter(Boolean)
    firstName = parts.shift() || ''
    lastName = parts.join(' ')
  }
  if (!firstName && username) {
    const local = username.includes('@') ? username.split('@')[0] : username
    const parts = local.split(/[._-]/).filter(Boolean)
    firstName = capitalizePart(parts[0] || local)
    lastName = parts.slice(1).map(capitalizePart).join(' ')
  }
  if (!firstName) firstName = 'Élève'
  if (!subject && username) subject = username

  return {
    firstName,
    lastName,
    className: className || 'Espace personnel',
    level: level || 'Compte connecté',
    establishment: establishment || 'MonLycée.net',
    city: city || 'Île-de-France',
    email,
    authMethod: 'password',
    authLabel: 'MonLycée.net',
    subject,
  }
}

/**
 * @param {unknown} payload
 * @param {string} username
 */
export function parseIdentityPayload(payload, username) {
  const sources = []
  const add = (value) => {
    const record = asRecord(value)
    if (record && !sources.includes(record)) sources.push(record)
  }

  add(payload)
  const root = asRecord(payload)
  if (root) {
    const bases = [root, asRecord(root.data)].filter(Boolean)
    for (const base of bases) {
      for (const key of [
        'data',
        'user',
        'userInfo',
        'profile',
        'identity',
        'me',
        'account',
        'attributes',
        'result',
      ]) {
        add(base[key])
      }
      for (const key of ['classes', 'structures', 'etablissements']) {
        const list = base[key]
        if (Array.isArray(list)) add(asRecord(list[0]))
      }
    }
  }

  return studentFromPayload(username, sources)
}

/**
 * @param {CookieJar} jar
 * @param {string} username
 * @param {typeof fetch} [fetchImpl]
 */
async function readIdentity(jar, username, fetchImpl = fetch, budget = null) {
  const endpoints = [
    `${PORTAL_ORIGIN}/oauth2/userinfo`,
    `${PORTAL_ORIGIN}/directory/user/me`,
    `${PORTAL_ORIGIN}/directory/api/user/me`,
    `${PORTAL_ORIGIN}/user/me`,
  ]

  for (const endpoint of endpoints) {
    try {
      const { response } = await fetchFollowing(
        endpoint,
        { method: 'GET', headers: { Accept: 'application/json' } },
        jar,
        { fetchImpl, maxRedirects: 2, budget },
      )
      if (!response.ok) continue
      const text = (await response.text()).trim()
      if (!text || text.startsWith('<')) continue
      let payload
      try {
        payload = JSON.parse(text)
      } catch {
        continue
      }
      const student = parseIdentityPayload(payload, username)
      // Le RNE (code établissement) permet de retrouver l'adresse PRONOTE.
      const uai = /\b(\d{7}[A-Z])\b/.exec(text)?.[1] ?? ''
      if (student) return { student, uai }
    } catch {
      // Un endpoint d'identité indisponible ne doit pas annuler une session
      // pourtant ouverte : on tente le suivant, puis on renvoie l'identité
      // minimale basée sur l'identifiant MonLycée.
    }
  }

  return { student: studentFromPayload(username, []), uai: '' }
}

// Deux candidats au maximum : la tuile PRONOTE et l'adresse déduite du RNE.
const MAX_SCHOOL_ATTEMPTS = 2
// Budget total des essais d'adresses : au-delà, on rend la main à l'élève
// plutôt que de laisser la requête traîner.
const SCHOOL_ATTEMPTS_BUDGET_MS = 30_000
// L'hébergeur limite les requêtes sortantes d'une invocation (50). On garde
// une marge pour la réponse et on s'arrête nous-mêmes au lieu de laisser
// PRONOTE échouer sur un message interne incompréhensible.
const SUBREQUEST_BUDGET = 44

/**
 * Erreur PRONOTE telle qu'elle est renvoyée au client, avec son code d'étape
 * court (E1…E9, W1…W6), sans hôte, identifiant ni détail technique. Le nombre
 * d'adresses essayées dit si la découverte automatique a trouvé quelque chose.
 *
 * Une erreur inattendue (non reconnue comme une erreur PRONOTE) reçoit
 * elle aussi un code, E0 : sans lui, l'élève voyait un message générique
 * impossible à diagnostiquer.
 *
 * @param {unknown} error
 * @param {number} [attempts]
 */
export function schoolFailure(error, attempts = 0) {
  const suffix = attempts > 1 ? ` · ${attempts} adresses essayées` : ''
  if (error instanceof PronoteError) {
    return {
      code: error.code,
      stage: error.stage || null,
      message: `${describePronoteError(error)}${suffix}`,
    }
  }
  return {
    code: 'PRONOTE_UNAVAILABLE',
    stage: 'E0',
    message: `PRONOTE n’a pas pu être synchronisé. Réessaie dans quelques instants. · code E0${suffix}`,
  }
}

/**
 * @param {unknown} error
 * @param {number} [attempts]
 */
function logSchoolFailure(error, attempts = 0) {
  if (typeof console === 'undefined' || !console.error) return
  console.error('PRONOTE sync failed:', {
    code: error instanceof PronoteError ? error.code : 'UNKNOWN',
    stage: error instanceof PronoteError ? error.stage || null : null,
    attempts,
    name: error instanceof Error ? error.name : 'unknown',
    message: error instanceof Error ? error.message : String(error),
  })
}

/**
 * Une autre adresse peut fonctionner si l'échec dépend du point d'entrée.
 * Un échec réseau en fait partie : une adresse déduite d'un RNE erroné ne
 * résout pas, alors que la tuile du portail mène au bon hôte. Seuls le
 * blocage d'adresse et les limites sont réellement globaux.
 *
 * @param {unknown} error
 */
function mayTryAnotherAddress(error) {
  if (!(error instanceof PronoteError)) return false
  // L'adresse a ouvert l'Espace élève : elle est bonne, inutile d'en essayer
  // une autre (cela coûtait le budget de requêtes d'une session entière).
  if (error.addressConfirmed) return false
  return !['E8', 'W2', 'W3', 'W4'].includes(error.stage)
}

/**
 * Toutes les pannes ne se valent pas : un refus ou une page PRONOTE réelle
 * explique beaucoup plus qu'une adresse devinée qui ne résout pas. Sans ce
 * classement, l'échec de la seconde adresse (devinée) masquait celui de
 * l'adresse fournie par l'élève, qui était pourtant la bonne.
 *
 * @param {unknown} error
 */
function failureRank(error) {
  if (!(error instanceof PronoteError)) return 2
  // Une erreur survenue après ouverture de l'Espace élève décrit le compte
  // réel : elle prime sur tout échec d'adresse.
  if (error.addressConfirmed) return 3
  const stage = String(error.stage || '')
  return stage.startsWith('E3-') ? 0 : 1
}

/**
 * @param {string} username
 * @param {string} password
 * @param {{ fetchImpl?: typeof fetch; startUrl?: string; pronoteUrl?: string }} [options]
 */
export async function loginToMonlycee(username, password, options = {}) {
  const fetchImpl = options.fetchImpl || fetch
  const startUrl = options.startUrl || START_URL
  const jar = new CookieJar()
  // Compteur partagé par toute la connexion (MonLycée puis PRONOTE) : la
  // limite de l'hébergeur porte sur l'invocation, pas sur un service.
  const budget = { used: 0, max: SUBREQUEST_BUDGET }
  // Repères temporaires : nombre de requêtes consommées à chaque étape.
  const marks = []
  const mark = (phase) => marks.push(`${phase}:${budget.used}`)

  const started = await fetchFollowing(
    startUrl,
    { method: 'GET', headers: BROWSER_HEADERS },
    jar,
    { fetchImpl, budget },
  )

  const loginHtml = await started.response.text()
  const form = parseLoginForm(loginHtml, started.finalUrl)
  if (!form) {
    if (hasCaptcha(loginHtml) || portalLooksBlocked(loginHtml)) {
      throw new LoginError(
        'CAPTCHA_REQUIRED',
        'MonLycée demande une vérification anti-robot. Ouvre le portail officiel pour te connecter manuellement.',
        409,
      )
    }
    throw new LoginError(
      'LOGIN_PAGE',
      'La page de connexion MonLycée est inhabituelle. Réessaie plus tard ou ouvre le portail officiel.',
      502,
    )
  }
  if (form.captcha) {
    throw new LoginError(
      'CAPTCHA_REQUIRED',
      'MonLycée demande une vérification anti-robot. Ouvre le portail officiel pour te connecter manuellement.',
      409,
    )
  }
  if (form.otp) {
    throw new LoginError(
      'MFA_REQUIRED',
      'MonLycée demande une vérification en deux étapes, non prise en charge ici. Ouvre le portail officiel.',
      409,
    )
  }
  if (form.consent) {
    throw new LoginError(
      'CONSENT_REQUIRED',
      'MonLycée demande une autorisation supplémentaire. Ouvre le portail officiel pour l’accepter.',
      409,
    )
  }

  const fields = new URLSearchParams(form.fields)
  fields.set('username', username)
  fields.set('password', password)

  const posted = await fetchFollowing(
    form.action,
    {
      method: 'POST',
      headers: {
        ...BROWSER_HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: started.finalUrl,
      },
      body: fields,
    },
    jar,
    { fetchImpl, budget },
  )

  const resultHtml = await posted.response.text()
  if (isLoginForm(resultHtml)) {
    const detail = extractLoginError(resultHtml)
    const lower = detail.toLowerCase()
    if (hasOtp(resultHtml) || /otp|two.factor|deux étapes|vérification/i.test(lower)) {
      throw new LoginError(
        'MFA_REQUIRED',
        'MonLycée demande une vérification supplémentaire. Ouvre le portail officiel pour te connecter.',
        409,
      )
    }
    throw new LoginError(
      'INVALID_CREDENTIALS',
      'Identifiant ou mot de passe MonLycée refusé. Vérifie-les et réessaie.',
      401,
    )
  }

  if (hasConsent(resultHtml)) {
    throw new LoginError(
      'CONSENT_REQUIRED',
      'MonLycée demande une autorisation supplémentaire. Ouvre le portail officiel pour l’accepter.',
      409,
    )
  }

  if (!jar.hasPortalSession()) {
    // Ne jamais renvoyer le message brut de Keycloak : il peut contenir des
    // détails sur le compte ou la configuration du portail.
    throw new LoginError(
      'NO_SESSION',
      'MonLycée n’a pas ouvert de session. Vérifie tes identifiants ou ouvre le portail officiel.',
      401,
    )
  }

  mark('login')
  const identity = await readIdentity(jar, username, fetchImpl, budget)
  const student = identity.student
  const verifiedAt = new Date().toISOString()

  // PRONOTE est un service séparé : on ouvre son Espace élève avec la session
  // MonLycée qui vient d'être créée, puis on lit les données réelles. Un refus
  // PRONOTE ne doit pas annuler une connexion MonLycée pourtant réussie.
  // L'adresse saisie passe en premier ; si elle ne mène à rien, la découverte
  // automatique prend le relais avec plusieurs points d'entrée.
  const savedUrl = normalizePronoteUrl(options.pronoteUrl || '')
  const credentials = { username, password }
  const tried = new Set()
  const candidates = savedUrl ? [savedUrl] : []
  // L'adresse saisie garde la priorité, mais la découverte reste le filet de
  // sécurité si elle ne mène plus à rien (adresse périmée, lien expiré,
  // établissement changé).
  let discoveryPending = true
  let connection = null
  let pronoteUrl = savedUrl || ''
  let failure = null
  const attemptsStarted = Date.now()
  // Trace temporaire de la consommation de requêtes : sans elle, un
  // dépassement de limite reste invisible.
  const recordFlow = async () => {
    if (typeof options.recordFailure !== 'function') return
    try {
      const written = options.recordFailure({
        stage: 'FLOW',
        method: 'FLOW',
        url: 'https://flow.invalid/',
        body: '',
        error: {
          name: 'Flow',
          message: `budget ${budget.used}/${budget.max} · ${tried.size} adresse(s) · ${marks.join(' ')}`.slice(
            0,
            200,
          ),
        },
      })
      if (written && typeof written.then === 'function') await written
    } catch {
      // Le diagnostic ne doit jamais gêner la connexion.
    }
  }

  for (let attempt = 0; attempt < MAX_SCHOOL_ATTEMPTS; attempt += 1) {
    if (Date.now() - attemptsStarted > SCHOOL_ATTEMPTS_BUDGET_MS) break
    let candidate = null
    while (!candidate) {
      const next = candidates.find((value) => !tried.has(value))
      if (next) {
        candidate = next
        break
      }
      if (discoveryPending) {
        discoveryPending = false
        try {
          candidates.push(
            ...(await discoverPronoteCandidates(jar, fetchImpl, identity.uai, budget)),
          )
          mark('disc')
        } catch {
          // La découverte reste un confort : l'élève peut saisir l'adresse.
        }
        continue
      }
      break
    }
    if (!candidate) break

    tried.add(candidate)
    pronoteUrl = candidate
    // Renseigné dès que la page PRONOTE est ouverte : l'adresse est alors
    // acquise, même si l'API refuse ensuite.
    const progress = { addressConfirmed: false }
    try {
      connection = await openPronoteSession({
        url: candidate,
        jar,
        fetchImpl,
        credentials,
        recordFailure: options.recordFailure || null,
        budget,
        progress,
      })
      break
    } catch (error) {
      if (progress.addressConfirmed && error instanceof PronoteError) {
        error.addressConfirmed = true
      }
      mark(`a${tried.size}`)
      // On conserve l'échec le plus parlant, pas le dernier essayé : sinon
      // l'adresse devinée du RNE, souvent inexistante, masque la vraie
      // réponse de PRONOTE sur l'adresse de l'élève.
      if (!failure || failureRank(error) > failureRank(failure)) failure = error
      // Une adresse peut être mauvaise sans que le compte soit en cause :
      // on essaie la suivante tant que l'échec le permet.
      if (!mayTryAnotherAddress(error)) break
    }
  }

  if (!connection) {
    await recordFlow()
    if (!failure) {
      return {
        student,
        verifiedAt,
        school: null,
        schoolError: {
          code: 'PRONOTE_URL_REQUIRED',
          message:
            'Ajoute l’adresse PRONOTE de ton lycée pour afficher tes vraies notes, ton emploi du temps et ta messagerie.',
        },
      }
    }
    logSchoolFailure(failure, tried.size)
    return {
      student,
      verifiedAt,
      school: null,
      // On ne renvoie que l'adresse que l'élève avait lui-même fournie :
      // une adresse devinée qui a échoué ne doit pas être mémorisée.
      pronoteUrl: savedUrl || null,
      schoolError: schoolFailure(failure, tried.size),
    }
  }

  try {
    const school = await readSchoolData(connection, { fetchImpl })
    const enriched = {
      ...student,
      className: school.student.className || student.className,
      establishment: school.student.establishment || student.establishment,
    }
    return { student: enriched, verifiedAt, school, pronoteUrl }
  } catch (error) {
    await recordFlow()
    logSchoolFailure(error, tried.size)
    return {
      student,
      verifiedAt,
      school: null,
      pronoteUrl: savedUrl || pronoteUrl,
      schoolError: schoolFailure(error, tried.size),
    }
  }
}

/** @param {string | null} origin */
function corsHeaders(origin) {
  if (!origin || (origin !== 'null' && !ALLOWED_ORIGINS.has(origin))) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  }
}

/** @param {Record<string, string>} headers */
function jsonHeaders(headers = {}) {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    Pragma: 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  }
}

/** @param {unknown} error @param {Record<string, string>} headers */
function errorResponse(error, headers) {
  if (error instanceof LoginError) {
    return new Response(JSON.stringify({ error: error.code, message: error.message }), {
      status: error.status,
      headers: jsonHeaders(headers),
    })
  }
  return new Response(
    JSON.stringify({
      error: 'UNEXPECTED',
      message: 'La connexion a échoué de façon inattendue. Réessaie dans quelques instants.',
    }),
    { status: 500, headers: jsonHeaders(headers) },
  )
}

/**
 * @param {Request} request
 * @param {{ DB?: D1Database }} env
 * @param {(username: string, password: string) => Promise<{ student: object; verifiedAt: string }>} login
 */
async function handleRequest(request, env, login) {
  const url = new URL(request.url)
  const origin = request.headers.get('Origin')
  const headers = corsHeaders(origin)

  if (request.method === 'OPTIONS') {
    if (origin && !headers['Access-Control-Allow-Origin']) {
      return new Response(null, { status: 403 })
    }
    return new Response(null, { status: 204, headers })
  }

  if (url.pathname === '/health' && request.method === 'GET') {
    return new Response(JSON.stringify({ ok: true, service: 'pr8note-auth' }), {
      status: 200,
      headers: jsonHeaders(headers),
    })
  }

  // Sonde temporaire : la signature des échecs réseau récents.
  if (url.pathname === '/diag-last' && request.method === 'GET') {
    if (url.searchParams.get('k') !== DIAG_KEY || !env?.DB) {
      return new Response(JSON.stringify({ error: 'NOT_FOUND' }), {
        status: 404,
        headers: jsonHeaders(),
      })
    }
    let rows = []
    try {
      const result = await env.DB.prepare('SELECT * FROM diag_net ORDER BY ts DESC LIMIT 6').all()
      rows = result.results ?? []
    } catch {
      // Table pas encore créée : aucun échec enregistré.
      rows = []
    }
    return new Response(JSON.stringify({ rows }), {
      status: 200,
      headers: jsonHeaders(),
    })
  }

  if (url.pathname === '/diag-api' && request.method === 'GET') {
    const rne = (url.searchParams.get('rne') || '').toLowerCase()
    if (!/^\d{7}[a-z]$/.test(rne)) {
      return new Response(JSON.stringify({ error: 'BAD_RNE' }), { status: 400, headers: jsonHeaders() })
    }
    const target = `https://${rne}.index-education.net/pronote/appelfonction/1a2b3c4d5e6f7a8b9c0d/11111111/AbCdEf0123456789AbCd`
    const body = JSON.stringify({
      session: 1,
      no: 'AbCdEf0123456789AbCd',
      id: 'FonctionParametres',
      dataSec: '00',
    })
    try {
      const response = await fetch(target, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body,
      })
      const text = await response.text()
      return new Response(JSON.stringify({ stage: 'A_OK', status: response.status, body: text.slice(0, 80) }), {
        status: 200,
        headers: jsonHeaders(),
      })
    } catch (error) {
      const typed = /** @type {any} */ (error)
      return new Response(
        JSON.stringify({
          stage: 'A_NET',
          name: typed?.name ?? null,
          message: String(typed?.message ?? '').slice(0, 80),
          cause: String(typed?.cause?.code ?? typed?.cause?.message ?? '').slice(0, 80),
        }),
        { status: 200, headers: jsonHeaders() },
      )
    }
  }

  if (url.pathname !== '/api/monlycee/login') {
    return new Response(JSON.stringify({ error: 'NOT_FOUND', message: 'Route inconnue.' }), {
      status: 404,
      headers: jsonHeaders(headers),
    })
  }

  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'METHOD_NOT_ALLOWED', message: 'Méthode non autorisée.' }),
      { status: 405, headers: jsonHeaders(headers) },
    )
  }

  if (origin && origin !== 'null' && !ALLOWED_ORIGINS.has(origin)) {
    return new Response(
      JSON.stringify({ error: 'ORIGIN_NOT_ALLOWED', message: 'Origine non autorisée.' }),
      { status: 403, headers: jsonHeaders() },
    )
  }

  const address =
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'local'

  const contentType = request.headers.get('content-type') || ''
  if (!contentType.toLowerCase().includes('application/json')) {
    return new Response(
      JSON.stringify({ error: 'BAD_CONTENT_TYPE', message: 'Requête invalide.' }),
      { status: 415, headers: jsonHeaders(headers) },
    )
  }

  let raw
  try {
    raw = await request.text()
  } catch {
    return new Response(JSON.stringify({ error: 'BAD_REQUEST', message: 'Requête illisible.' }), {
      status: 400,
      headers: jsonHeaders(headers),
    })
  }
  if (raw.length > MAX_BODY_BYTES) {
    return new Response(
      JSON.stringify({ error: 'PAYLOAD_TOO_LARGE', message: 'Requête trop volumineuse.' }),
      { status: 413, headers: jsonHeaders(headers) },
    )
  }

  let body
  try {
    body = JSON.parse(raw)
  } catch {
    return new Response(JSON.stringify({ error: 'BAD_JSON', message: 'Requête invalide.' }), {
      status: 400,
      headers: jsonHeaders(headers),
    })
  }
  if (!body || typeof body !== 'object') {
    return new Response(JSON.stringify({ error: 'BAD_REQUEST', message: 'Requête invalide.' }), {
      status: 400,
      headers: jsonHeaders(headers),
    })
  }

  const username = typeof body.username === 'string' ? body.username.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const pronoteUrl = typeof body.pronoteUrl === 'string' ? body.pronoteUrl.trim().slice(0, 500) : ''
  if (!username || !password) {
    return new Response(
      JSON.stringify({
        error: 'MISSING_CREDENTIALS',
        message: 'Renseigne ton identifiant et ton mot de passe MonLycée.',
      }),
      { status: 400, headers: jsonHeaders(headers) },
    )
  }
  if (username.length > 254 || password.length > 512) {
    return new Response(
      JSON.stringify({ error: 'INVALID_CREDENTIALS', message: 'Identifiants invalides.' }),
      { status: 400, headers: jsonHeaders(headers) },
    )
  }

  let reservation
  try {
    await ensureRateLimitSchema(env?.DB)
    reservation = await consumeRateLimit(env.DB, { ip: address, username })
  } catch (error) {
    // Si la base partagée est indisponible, on refuse la connexion plutôt
    // que de laisser passer un flux illimité. Le détail reste dans les logs.
    if (typeof console !== 'undefined' && console.error) {
      console.error('Rate limit unavailable:', {
        name: error instanceof Error ? error.name : 'unknown',
        message: error instanceof Error ? error.message : String(error),
      })
    }
    return new Response(
      JSON.stringify({
        error: 'AUTH_UNAVAILABLE',
        message:
          'Le service de connexion est momentanément indisponible. Réessaie dans quelques minutes.',
      }),
      { status: 503, headers: jsonHeaders(headers) },
    )
  }

  if (!reservation.allowed) {
    return new Response(
      JSON.stringify({
        error: 'RATE_LIMITED',
        // Message volontairement identique pour l'IP et l'identifiant.
        message: 'Trop de tentatives de connexion. Attends quelques minutes avant de réessayer.',
      }),
      {
        status: 429,
        headers: { ...jsonHeaders(headers), 'Retry-After': String(RATE_LIMIT_RETRY_AFTER_SECONDS) },
      },
    )
  }

  try {
    const result = await login(username, password, {
      pronoteUrl,
      recordFailure: (failure) => recordNetworkFailure(env?.DB, failure),
    })
    try {
      await refundRateLimit(env.DB, reservation)
    } catch (error) {
      // Le remboursement ne doit pas annuler une connexion pourtant réussie.
      if (typeof console !== 'undefined' && console.error) {
        console.error('Rate limit refund failed:', {
          name: error instanceof Error ? error.name : 'unknown',
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }
    return new Response(
      JSON.stringify({
        student: result.student,
        verifiedAt: result.verifiedAt,
        school: result.school ?? null,
        schoolError: result.schoolError ?? null,
        pronoteUrl: result.pronoteUrl ?? null,
      }),
      { status: 200, headers: jsonHeaders(headers) },
    )
  } catch (error) {
    // Ne jamais journaliser les identifiants ni le corps de la requête.
    if (error instanceof LoginError) {
      return errorResponse(error, headers)
    }
    if (typeof console !== 'undefined' && console.error) {
      console.error('MonLycée login failed:', {
        name: error instanceof Error ? error.name : 'unknown',
        message: error instanceof Error ? error.message : String(error),
        url: redactUrl(url.toString()),
      })
    }
    return errorResponse(error, headers)
  }
}

export function createWorker(login = loginToMonlycee) {
  return {
    fetch: (request, env) => handleRequest(request, env, login),
  }
}

export default createWorker()
