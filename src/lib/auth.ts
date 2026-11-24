import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'
import type { Student } from '../types'
import { capitalize } from './date'

export const MONLYCEE_NAME = 'MonLycée.net'
export const MONLYCEE_LOGIN_URL = 'https://psn.monlycee.net/'
export const MONLYCEE_ISSUER = 'https://auth.monlycee.net/realms/TWIDF'
export const EDUC_CONNECT_LOGIN_URL = 'https://educonnect.education.gouv.fr/'

export interface AuthProvider {
  id: 'monlycee' | 'educonnect' | 'custom'
  name: string
  subtitle: string
  description: string
  loginUrl?: string
  monogram: string
  accent: string
  badge?: string
  supportsOidc: boolean
}

export const AUTH_PROVIDERS: AuthProvider[] = [
  {
    id: 'monlycee',
    name: 'MonLycée.net',
    subtitle: 'Île-de-France · Lycées franciliens',
    description:
      'Le portail de la Région Île-de-France, avec l’accès à PRONOTE, aux notes, à l’emploi du temps et aux services du lycée.',
    loginUrl: MONLYCEE_LOGIN_URL,
    monogram: 'ML',
    accent: '#3b82f6',
    badge: 'Principal',
    supportsOidc: true,
  },
  {
    id: 'educonnect',
    name: 'ÉduConnect',
    subtitle: 'Compte unique de l’Éducation nationale',
    description:
      'Le compte national des élèves et des responsables légaux. Utile lorsque ton établissement utilise ÉduConnect pour l’ENT.',
    loginUrl: EDUC_CONNECT_LOGIN_URL,
    monogram: 'ÉC',
    accent: '#6366f1',
    badge: 'National',
    supportsOidc: false,
  },
  {
    id: 'custom',
    name: 'Un autre ENT ou PRONOTE',
    subtitle: 'Mon Bureau Numérique, Atrium, Lycée Connecté…',
    description:
      'Saisis l’adresse de ton espace scolaire ou de ton établissement pour ouvrir directement son portail officiel.',
    monogram: 'ENT',
    accent: '#14b8a6',
    supportsOidc: false,
  },
]

export interface OidcConfig {
  clientId: string
  issuer: string
  label: string
}

export interface OidcDiscovery {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  jwks_uri: string
  userinfo_endpoint?: string
  end_session_endpoint?: string
}

interface PkceRequest {
  state: string
  nonce: string
  verifier: string
  redirectUri: string
  issuer: string
  createdAt: number
}

const OIDC_CONFIG_KEY = 'pr8note:oidc:monlycee'
const PKCE_KEY = 'pr8note:oidc:pkce'
let discoveryCache: { issuer: string; value: OidcDiscovery; at: number } | null = null

export function isWebAuthAvailable(): boolean {
  return window.location.protocol === 'https:' || window.location.protocol === 'http:'
}

export function getRedirectUri(): string {
  if (!isWebAuthAvailable()) return 'https://petipotam17.github.io/Pr8note_web/'
  return `${window.location.origin}${window.location.pathname}`
}

export function loadOidcConfig(): OidcConfig | null {
  try {
    const raw = localStorage.getItem(OIDC_CONFIG_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<OidcConfig>
    if (!parsed.clientId || typeof parsed.clientId !== 'string') return null
    return {
      clientId: parsed.clientId,
      issuer: parsed.issuer || MONLYCEE_ISSUER,
      label: parsed.label || MONLYCEE_NAME,
    }
  } catch {
    return null
  }
}

export function saveOidcConfig(config: OidcConfig): void {
  localStorage.setItem(OIDC_CONFIG_KEY, JSON.stringify(config))
}

export function clearOidcConfig(): void {
  localStorage.removeItem(OIDC_CONFIG_KEY)
}

export async function fetchOidcDiscovery(issuer = MONLYCEE_ISSUER, force = false): Promise<OidcDiscovery> {
  if (!force && discoveryCache && discoveryCache.issuer === issuer && Date.now() - discoveryCache.at < 5 * 60_000) {
    return discoveryCache.value
  }
  const normalized = issuer.replace(/\/+$/, '')
  const response = await fetch(`${normalized}/.well-known/openid-configuration`, {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    throw new Error(`Le serveur OIDC a répondu ${response.status}.`)
  }
  const data = (await response.json()) as Partial<OidcDiscovery>
  if (!data.authorization_endpoint || !data.token_endpoint || !data.jwks_uri) {
    throw new Error('La configuration OIDC est incomplète (endpoints manquants).')
  }
  const discovery: OidcDiscovery = {
    issuer: data.issuer || normalized,
    authorization_endpoint: data.authorization_endpoint,
    token_endpoint: data.token_endpoint,
    jwks_uri: data.jwks_uri,
    userinfo_endpoint: data.userinfo_endpoint,
    end_session_endpoint: data.end_session_endpoint,
  }
  discoveryCache = { issuer, value: discovery, at: Date.now() }
  return discovery
}

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function randomString(length = 32): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return base64Url(bytes)
}

async function createCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64Url(new Uint8Array(digest))
}

export async function beginOidcLogin(): Promise<void> {
  if (!isWebAuthAvailable()) {
    throw new Error('La connexion OIDC nécessite la version web de Pr8note.')
  }
  if (!window.crypto?.subtle) {
    throw new Error('Le chiffrement du navigateur est indisponible. Essaie un navigateur récent en HTTPS.')
  }
  const config = loadOidcConfig()
  if (!config) {
    throw new Error('Aucun client OIDC n’est configuré. Ajoute le client ID fourni par ton ENT.')
  }

  const discovery = await fetchOidcDiscovery(config.issuer)
  const redirectUri = getRedirectUri()
  const verifier = randomString(48)
  const challenge = await createCodeChallenge(verifier)
  const state = randomString(24)
  const nonce = randomString(24)

  const request: PkceRequest = {
    state,
    nonce,
    verifier,
    redirectUri,
    issuer: discovery.issuer,
    createdAt: Date.now(),
  }
  sessionStorage.setItem(PKCE_KEY, JSON.stringify(request))

  const url = new URL(discovery.authorization_endpoint)
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'openid profile email')
  url.searchParams.set('state', state)
  url.searchParams.set('nonce', nonce)
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('code_challenge_method', 'S256')

  window.location.assign(url.toString())
}

export function isAuthCallback(): boolean {
  const params = new URLSearchParams(window.location.search)
  return params.has('code') || (params.has('error') && params.has('state'))
}

export function clearAuthQuery(): void {
  const url = new URL(window.location.href)
  ;['code', 'state', 'error', 'error_description', 'session_state', 'iss', 'error_uri'].forEach((key) =>
    url.searchParams.delete(key),
  )
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
}

function claimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function studentFromClaims(claims: JWTPayload & Record<string, unknown>): Student {
  const username = claimString(claims.preferred_username)
  const fullName = claimString(claims.name)
  let firstName = claimString(claims.given_name)
  let lastName = claimString(claims.family_name)

  if (!firstName && username) {
    const parts = username.split(/[._-]/).filter(Boolean)
    firstName = capitalize(parts[0] ?? username)
    lastName = parts.slice(1).map(capitalize).join(' ')
  }
  if (!firstName && fullName) {
    const parts = fullName.split(/\s+/).filter(Boolean)
    firstName = parts[0] ?? fullName
    lastName = parts.slice(1).join(' ')
  }
  if (!firstName) firstName = 'Élève'

  return {
    firstName,
    lastName,
    className: claimString(claims.className) || claimString(claims.division) || 'Espace personnel',
    level: claimString(claims.level) || 'Compte connecté',
    establishment: claimString(claims.establishment) || MONLYCEE_NAME,
    city: claimString(claims.city),
    email: claimString(claims.email),
    authMethod: 'oidc',
    authLabel: MONLYCEE_NAME,
    subject: claimString(claims.sub),
  }
}

interface TokenResponse {
  access_token?: string
  id_token?: string
  token_type?: string
  expires_in?: number
  refresh_token?: string
}

export async function completeOidcLogin(): Promise<{ student: Student; claims: JWTPayload }> {
  const params = new URLSearchParams(window.location.search)
  const providerError = params.get('error')
  if (providerError) {
    const description = params.get('error_description')
    throw new Error(`${providerError}${description ? `: ${description}` : ''}`)
  }

  const code = params.get('code')
  const state = params.get('state')
  if (!code || !state) throw new Error('La réponse du fournisseur est incomplète.')

  const rawRequest = sessionStorage.getItem(PKCE_KEY)
  if (!rawRequest) {
    throw new Error('La session de connexion a expiré. Relance la connexion depuis le fournisseur.')
  }

  let request: PkceRequest
  try {
    request = JSON.parse(rawRequest) as PkceRequest
  } catch {
    sessionStorage.removeItem(PKCE_KEY)
    throw new Error('La session de connexion est corrompue. Relance la connexion.')
  }

  if (request.state !== state) {
    sessionStorage.removeItem(PKCE_KEY)
    throw new Error('La vérification de sécurité (state) a échoué. Relance la connexion.')
  }
  if (Date.now() - request.createdAt > 15 * 60_000) {
    sessionStorage.removeItem(PKCE_KEY)
    throw new Error('La session de connexion a expiré. Relance la connexion.')
  }

  const config = loadOidcConfig()
  if (!config) {
    sessionStorage.removeItem(PKCE_KEY)
    throw new Error('La configuration OIDC a été supprimée. Reconfigure la connexion.')
  }

  sessionStorage.removeItem(PKCE_KEY)
  const discovery = await fetchOidcDiscovery(request.issuer || config.issuer)

  const tokenResponse = await fetch(discovery.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: request.redirectUri,
      client_id: config.clientId,
      code_verifier: request.verifier,
    }),
  })

  if (!tokenResponse.ok) {
    let detail = ''
    try {
      const body = (await tokenResponse.json()) as { error?: string; error_description?: string }
      detail = `${body.error ?? ''}${body.error_description ? `: ${body.error_description}` : ''}`.trim()
    } catch {
      detail = await tokenResponse.text()
    }
    throw new Error(detail || `Échange du code refusé (${tokenResponse.status}).`)
  }

  const tokens = (await tokenResponse.json()) as TokenResponse
  if (!tokens.id_token) throw new Error('Le fournisseur n’a pas renvoyé de jeton d’identité.')

  const jwks = createRemoteJWKSet(new URL(discovery.jwks_uri))
  const { payload } = await jwtVerify(tokens.id_token, jwks, {
    issuer: discovery.issuer,
    audience: config.clientId,
    clockTolerance: 30,
  })

  const nonce = typeof payload.nonce === 'string' ? payload.nonce : ''
  if (!nonce || nonce !== request.nonce) {
    throw new Error('La vérification du nonce a échoué. Relance la connexion.')
  }

  let claims: JWTPayload & Record<string, unknown> = { ...payload }
  if (tokens.access_token && discovery.userinfo_endpoint) {
    try {
      const userinfo = await fetch(discovery.userinfo_endpoint, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      })
      if (userinfo.ok) {
        const info = (await userinfo.json()) as Record<string, unknown>
        claims = { ...claims, ...info }
      }
    } catch {
      // Userinfo is optional — the verified ID token already carries the identity.
    }
  }

  return { student: studentFromClaims(claims), claims }
}

export function authErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  const lower = raw.toLowerCase()
  if (lower.includes('access_denied')) return 'La connexion a été annulée sur le portail.'
  if (lower.includes('invalid_client')) {
    return 'MonLycée.net n’a pas reconnu Pr8note. Le client OIDC n’est pas encore autorisé par ton ENT.'
  }
  if (lower.includes('redirect_uri')) {
    return 'L’URL de redirection n’est pas autorisée pour ce client. Vérifie-la avec ton administrateur ENT.'
  }
  if (lower.includes('invalid_grant')) {
    return 'Le code d’autorisation a expiré ou a déjà été utilisé. Relance la connexion.'
  }
  if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('cors')) {
    return 'Impossible de joindre le serveur de connexion. Vérifie ta connexion, et que l’origine du site est autorisée côté ENT.'
  }
  if (lower.includes('nonce') || lower.includes('jwt') || lower.includes('signature')) {
    return 'La réponse du fournisseur n’a pas pu être vérifiée. Relance la connexion.'
  }
  if (lower.includes('state') || lower.includes('expiré') || lower.includes('expired')) {
    return 'La session de connexion a expiré. Relance la connexion.'
  }
  return raw || 'La connexion n’a pas abouti.'
}
