/**
 * Pr8note — lecture des données PRONOTE de l'élève.
 *
 * Ce module se place après la connexion MonLycée : le bocal de cookies contient
 * déjà la session du portail. On ouvre l'Espace élève PRONOTE avec cette
 * session, puis on interroge son API interne pour récupérer les notes, les
 * professeurs, l'emploi du temps, les devoirs, la messagerie et la vie scolaire.
 *
 * Rien n'est inventé : si PRONOTE refuse l'accès ou répond dans un format
 * inconnu, on remonte une erreur générique et aucune donnée de démonstration
 * n'est renvoyée à la place.
 */

const PRONOTE_TIMEOUT_MS = 15_000
const PRONOTE_SYNC_BUDGET_MS = 60_000
const PRONOTE_MAX_REDIRECTS = 8
const PRONOTE_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const MAX_MESSAGES = 6
const MAX_MESSAGES_PER_THREAD = 12

const SUBJECT_COLORS = [
  '#8b7bff',
  '#38d6c4',
  '#ff7eb6',
  '#f7b955',
  '#4aa8ff',
  '#4ade80',
  '#ff9f5a',
  '#b07dff',
  '#22d3ee',
  '#fb7185',
  '#a3e635',
  '#f472b6',
]

export class PronoteError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {number} [status]
   */
  constructor(code, message, status = 502) {
    super(message)
    this.name = 'PronoteError'
    this.code = code
    this.status = status
  }
}

/* ------------------------------------------------------------------ */
/* MD5 — Web Crypto ne fournit pas MD5, PRONOTE l'utilise pour ses clés. */
/* ------------------------------------------------------------------ */

const MD5_SHIFTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14,
  20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6,
  10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
]

const MD5_K = new Uint32Array(64)
for (let index = 0; index < 64; index += 1) {
  MD5_K[index] = Math.floor(Math.abs(Math.sin(index + 1)) * 2 ** 32) >>> 0
}

/** @param {Uint8Array} input */
function md5(input) {
  const length = input.length
  const padded = new Uint8Array((((length + 8) >> 6) + 1) * 64)
  padded.set(input)
  padded[length] = 0x80

  const view = new DataView(padded.buffer)
  const bits = BigInt(length) * 8n
  view.setUint32(padded.length - 8, Number(bits & 0xffffffffn), true)
  view.setUint32(padded.length - 4, Number(bits >> 32n), true)

  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476
  const block = new Uint32Array(16)

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let word = 0; word < 16; word += 1) {
      block[word] = view.getUint32(offset + word * 4, true)
    }

    let a = a0
    let b = b0
    let c = c0
    let d = d0

    for (let round = 0; round < 64; round += 1) {
      let f
      let g
      if (round < 16) {
        f = (b & c) | (~b & d)
        g = round
      } else if (round < 32) {
        f = (d & b) | (~d & c)
        g = (5 * round + 1) % 16
      } else if (round < 48) {
        f = b ^ c ^ d
        g = (3 * round + 5) % 16
      } else {
        f = c ^ (b | ~d)
        g = (7 * round) % 16
      }

      const sum = (f + a + MD5_K[round] + block[g]) >>> 0
      a = d
      d = c
      c = b
      const shift = MD5_SHIFTS[round]
      b = (b + ((sum << shift) | (sum >>> (32 - shift)))) >>> 0
    }

    a0 = (a0 + a) >>> 0
    b0 = (b0 + b) >>> 0
    c0 = (c0 + c) >>> 0
    d0 = (d0 + d) >>> 0
  }

  const output = new Uint8Array(16)
  const outputView = new DataView(output.buffer)
  outputView.setUint32(0, a0, true)
  outputView.setUint32(4, b0, true)
  outputView.setUint32(8, c0, true)
  outputView.setUint32(12, d0, true)
  return output
}

/** @param {string} value */
function md5OfString(value) {
  return md5(new TextEncoder().encode(value))
}

/** @param {string} value */
export function md5Hex(value) {
  return bytesToHex(md5OfString(value))
}

/* ------------------------------------------------------------------ */
/* Encodages                                                          */
/* ------------------------------------------------------------------ */

/** @param {Uint8Array} bytes */
function bytesToHex(bytes) {
  let output = ''
  for (const byte of bytes) output += byte.toString(16).padStart(2, '0')
  return output
}

/** @param {string} hex */
function hexToBytes(hex) {
  const clean = hex.trim()
  if (clean.length % 2 !== 0) throw new PronoteError('PRONOTE_FORMAT', 'Réponse PRONOTE illisible.')
  const output = new Uint8Array(clean.length / 2)
  for (let index = 0; index < output.length; index += 1) {
    const value = Number.parseInt(clean.slice(index * 2, index * 2 + 2), 16)
    if (!Number.isFinite(value)) throw new PronoteError('PRONOTE_FORMAT', 'Réponse PRONOTE illisible.')
    output[index] = value
  }
  return output
}

/** @param {Uint8Array} bytes */
function base64(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/** @param {Uint8Array} bytes */
function randomBytes(bytes) {
  const output = new Uint8Array(bytes)
  crypto.getRandomValues(output)
  return output
}

/* ------------------------------------------------------------------ */
/* AES-CBC (Web Crypto ajoute/retire le remplissage PKCS#7)            */
/* ------------------------------------------------------------------ */

/**
 * PRONOTE dérive ses clés par MD5. Une clé de 16 octets est déjà un digest.
 * @param {Uint8Array | string} key
 */
function aesKeyBytes(key) {
  if (typeof key === 'string') return md5OfString(key)
  return key.length === 16 ? key : md5(key)
}

/**
 * @param {Uint8Array | string} key
 * @param {Uint8Array} iv
 * @param {Uint8Array} data
 */
async function aesEncrypt(key, iv, data) {
  const keyBytes = aesKeyBytes(key)
  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, [
    'encrypt',
  ])
  const result = await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, cryptoKey, data)
  return new Uint8Array(result)
}

/**
 * @param {Uint8Array | string} key
 * @param {Uint8Array} iv
 * @param {Uint8Array} data
 */
async function aesDecrypt(key, iv, data) {
  const keyBytes = aesKeyBytes(key)
  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, [
    'decrypt',
  ])
  try {
    const result = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, cryptoKey, data)
    return new Uint8Array(result)
  } catch {
    throw new PronoteError('PRONOTE_CRYPTO', 'PRONOTE a refusé le chiffrement de la session.')
  }
}

/** @param {Uint8Array} data */
async function deflateRaw(data) {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** @param {Uint8Array} data */
async function inflateRaw(data) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/* ------------------------------------------------------------------ */
/* Entêtes PRONOTE                                                    */
/* ------------------------------------------------------------------ */

/** @param {string} value */
function normalizeHost(value) {
  return value.toLowerCase().replace(/^\./, '')
}

/**
 * Suit les redirections en conservant les cookies du portail MonLycée.
 * Seuls les hôtes explicitement autorisés sont contactés.
 *
 * @param {string} url
 * @param {RequestInit} init
 * @param {{ headerFor(url: string): string; absorb(response: Response, url: string): void }} jar
 * @param {{ fetchImpl?: typeof fetch; allowedHosts: Set<string> }} options
 */
async function fetchWithJar(url, init, jar, options) {
  const fetchImpl = options.fetchImpl || fetch
  const allowedHosts = options.allowedHosts
  let current = new URL(url)
  let method = (init.method || 'GET').toUpperCase()
  let body = init.body

  for (let redirect = 0; redirect <= PRONOTE_MAX_REDIRECTS; redirect += 1) {
    const host = normalizeHost(current.hostname)
    if (current.protocol !== 'https:') {
      throw new PronoteError('PRONOTE_URL', 'L’adresse PRONOTE doit utiliser HTTPS.')
    }
    if (!allowedHosts.has(host) && !host.endsWith('.monlycee.net') && host !== 'monlycee.net') {
      throw new PronoteError('PRONOTE_URL', 'PRONOTE a redirigé vers un service non autorisé.')
    }

    const headers = new Headers(init.headers || {})
    const cookie = jar.headerFor(current.toString())
    if (cookie) headers.set('Cookie', cookie)
    if (method === 'GET' || method === 'HEAD') headers.delete('Content-Type')

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), PRONOTE_TIMEOUT_MS)
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
      const aborted = error instanceof Error && error.name === 'AbortError'
      throw new PronoteError(
        aborted ? 'PRONOTE_TIMEOUT' : 'PRONOTE_NETWORK',
        aborted
          ? 'PRONOTE met trop de temps à répondre. Réessaie dans quelques instants.'
          : 'Impossible de joindre PRONOTE pour le moment. Réessaie dans quelques instants.',
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
        throw new PronoteError('PRONOTE_REDIRECT', 'PRONOTE a renvoyé une redirection invalide.')
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

  throw new PronoteError('PRONOTE_REDIRECT', 'PRONOTE a interrompu la connexion (trop de redirections).')
}

/* ------------------------------------------------------------------ */
/* URL PRONOTE                                                        */
/* ------------------------------------------------------------------ */

/**
 * Vérifie qu'une adresse PRONOTE est utilisable et complète le chemin.
 * @param {string} input
 * @returns {string | null}
 */
export function normalizePronoteUrl(input) {
  const raw = input.trim()
  if (!raw) return null

  let candidate = raw
  if (!/^https?:\/\//i.test(candidate)) candidate = `https://${candidate}`

  let url
  try {
    url = new URL(candidate)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.port || url.username || url.password) return null

  const host = normalizeHost(url.hostname)
  if (
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ||
    host.includes(':')
  ) {
    return null
  }

  url.searchParams.delete('login')
  if (!url.pathname.includes('/pronote')) return null
  if (url.pathname.endsWith('/')) url.pathname += 'eleve.html'
  if (!/\.html?$/i.test(url.pathname)) url.pathname = `${url.pathname.replace(/\/$/, '')}/eleve.html`

  url.hash = ''
  return url.toString()
}

/**
 * Cherche le lien PRONOTE dans le portail MonLycée déjà authentifié.
 * Le portail peut très bien ne pas l'exposer : on renvoie alors null.
 *
 * @param {{ headerFor(url: string): string; absorb(response: Response, url: string): void }} jar
 * @param {typeof fetch} fetchImpl
 */
export async function discoverPronoteUrl(jar, fetchImpl = fetch) {
  try {
    const { response } = await fetchWithJar(
      'https://psn.monlycee.net/',
      {
        method: 'GET',
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'fr-FR,fr;q=0.9',
          'User-Agent': PRONOTE_USER_AGENT,
        },
      },
      jar,
      { fetchImpl, allowedHosts: new Set(['psn.monlycee.net', 'auth.monlycee.net']) },
    )
    if (!response.ok) return null
    const html = await response.text()

    const absolute = html.match(/https?:\/\/[^\s"'<>]+/gi) || []
    for (const link of absolute) {
      let url
      try {
        url = new URL(link.replace(/&amp;/g, '&'))
      } catch {
        continue
      }
      const host = normalizeHost(url.hostname)
      if (!host.endsWith('index-education.net') && !host.endsWith('monlycee.net')) continue
      if (!url.pathname.toLowerCase().includes('pronote')) continue
      const normalized = normalizePronoteUrl(url.toString())
      if (normalized) return normalized
    }

    const relative = html.match(/["'](\/[^"']*pronote[^"']*)["']/gi) || []
    for (const link of relative) {
      const cleaned = link.slice(1, -1).replace(/&amp;/g, '&')
      const normalized = normalizePronoteUrl(new URL(cleaned, 'https://psn.monlycee.net/').toString())
      if (normalized) return normalized
    }
  } catch {
    // La découverte est un confort : l'élève peut fournir l'adresse lui-même.
  }
  return null
}

/* ------------------------------------------------------------------ */
/* Session PRONOTE                                                    */
/* ------------------------------------------------------------------ */

/**
 * @param {string} html
 */
export function parseStartAttributes(html) {
  const match = html.match(/Start\s*\(\s*\{([^}]*)\}\s*\)/)
  if (!match) return null
  const attributes = {}
  const pattern = /([A-Za-z0-9_]+)\s*:\s*(?:'([^']*)'|"([^"]*)"|([^,}]+))/g
  let entry
  while ((entry = pattern.exec(match[1]))) {
    const key = entry[1]
    const value = entry[2] ?? entry[3] ?? entry[4] ?? ''
    attributes[key] = value.trim()
  }
  return attributes.h ? attributes : null
}

/** @param {string} html */
function parseVersion(html) {
  const match = html.match(/>\s*PRONOTE\s+(\d+)\.(\d+)\.(\d+)/i)
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

/** @param {number[] | null} version @param {number[]} minimum */
function atLeast(version, minimum) {
  if (!version) return false
  for (let index = 0; index < minimum.length; index += 1) {
    if (version[index] > minimum[index]) return true
    if (version[index] < minimum[index]) return false
  }
  return true
}

class PronoteSession {
  /**
   * @param {object} config
   * @param {string} config.root
   * @param {Record<string, string>} config.attributes
   * @param {number[] | null} config.version
   * @param {typeof fetch} config.fetchImpl
   * @param {{ headerFor(url: string): string; absorb(response: Response, url: string): void }} config.jar
   * @param {Set<string>} config.allowedHosts
   */
  constructor(config) {
    this.root = config.root
    this.attributes = config.attributes
    this.version = config.version
    this.fetchImpl = config.fetchImpl
    this.jar = config.jar
    this.allowedHosts = config.allowedHosts
    this.order = 1
    this.deadline = Date.now() + PRONOTE_SYNC_BUDGET_MS
    this.aesKey = md5(new Uint8Array(0))
    this.aesIvTemp = randomBytes(16)
    this.aesIv = new Uint8Array(16)
    this.spread = atLeast(this.version, [2024, 3, 9])
    this.newEnvelope = atLeast(this.version, [2025, 1, 3])

    const crA = config.attributes.CrA
    const coA = config.attributes.CoA
    const flag = (value) => value === 'true' || value === '1'
    if (crA !== undefined || coA !== undefined) {
      this.skipEncryption = crA === undefined ? true : !flag(crA)
      this.skipCompression = coA === undefined ? true : !flag(coA)
    } else {
      this.skipEncryption = !flag(config.attributes.sCrA)
      this.skipCompression = !flag(config.attributes.sCoA)
    }
  }

  get sessionId() {
    return this.attributes.h
  }

  get espaceId() {
    return this.attributes.a
  }

  /** @param {Uint8Array} data */
  async encrypt(data) {
    return aesEncrypt(this.aesKey, this.aesIv, data)
  }

  /** @param {Uint8Array} data */
  async decrypt(data) {
    return aesDecrypt(this.aesKey, this.aesIv, data)
  }

  /** @returns {Promise<Uint8Array>} */
  async orderNumber() {
    const value = String(this.order)
    return aesEncrypt(this.aesKey, this.aesIv, new TextEncoder().encode(value))
  }

  /**
   * @param {string} name
   * @param {Record<string, unknown>} [data]
   * @param {number | null} [onglet]
   */
  async request(name, data = {}, onglet = null) {
    if (Date.now() > this.deadline) {
      throw new PronoteError(
        'PRONOTE_TIMEOUT',
        'La synchronisation PRONOTE a pris trop de temps. Réessaie dans quelques instants.',
      )
    }
    const signatureKey = this.spread ? 'Signature' : '_Signature_'
    const dataKey = this.spread ? 'data' : 'donnees'
    const payload = {}
    if (onglet) payload[signatureKey] = { onglet }
    payload[dataKey] = data

    let secure = payload
    if (!this.skipCompression) {
      const json = JSON.stringify(payload)
      const hex = new TextEncoder().encode(bytesToHex(new TextEncoder().encode(json)))
      secure = bytesToHex(await deflateRaw(hex)).toUpperCase()
    }
    if (!this.skipEncryption) {
      const bytes =
        typeof secure === 'string'
          ? hexToBytes(secure)
          : new TextEncoder().encode(JSON.stringify(secure))
      secure = bytesToHex(await this.encrypt(bytes)).toUpperCase()
    }

    const firstRequest = this.order === 1
    const order = bytesToHex(await this.orderNumber())
    const url = `${this.root}/appelfonction/${this.espaceId}/${this.sessionId}/${order}`
    const body = this.newEnvelope
      ? { session: Number(this.sessionId), no: order, id: name, dataSec: secure }
      : { session: Number(this.sessionId), numeroOrdre: order, nom: name, donneesSec: secure }

    const { response } = await fetchWithJar(
      url,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': PRONOTE_USER_AGENT,
        },
        body: JSON.stringify(body),
      },
      this.jar,
      { fetchImpl: this.fetchImpl, allowedHosts: this.allowedHosts },
    )

    this.order += 2

    // La première réponse est déjà chiffrée avec l'IV dérivé de l'IV aléatoire,
    // alors que la requête d'ouverture, elle, utilise l'IV nul.
    if (firstRequest) this.aesIv = md5(this.aesIvTemp)

    let raw
    try {
      raw = await response.text()
    } catch {
      throw new PronoteError('PRONOTE_FORMAT', 'PRONOTE a renvoyé une réponse illisible.')
    }

    let envelope
    try {
      envelope = JSON.parse(raw)
    } catch {
      if (/adresse IP/i.test(raw)) {
        throw new PronoteError('PRONOTE_BLOCKED', 'PRONOTE bloque temporairement cette adresse.')
      }
      throw new PronoteError('PRONOTE_FORMAT', 'PRONOTE a renvoyé une réponse inattendue.')
    }

    if (envelope?.Erreur) {
      const code = Number(envelope.Erreur.G)
      if (code === 22) {
        throw new PronoteError('PRONOTE_EXPIRED', 'La session PRONOTE a expiré. Reconnecte-toi.')
      }
      if (code === 25) {
        throw new PronoteError('PRONOTE_BUSY', 'PRONOTE limite temporairement les connexions.')
      }
      throw new PronoteError('PRONOTE_REFUSED', 'PRONOTE a refusé la demande.')
    }

    let secureData = envelope?.dataSec ?? envelope?.donneesSec
    if (typeof secureData === 'string') {
      let bytes = hexToBytes(secureData)
      if (!this.skipEncryption) bytes = await this.decrypt(bytes)
      if (!this.skipCompression) bytes = await inflateRaw(bytes)
      const text = new TextDecoder().decode(bytes)
      try {
        secureData = JSON.parse(text)
      } catch {
        // Certaines versions renvoient un JSON déjà décompressé et non chiffré.
        try {
          secureData = JSON.parse(new TextDecoder().decode(hexToBytes(text)))
        } catch {
          throw new PronoteError('PRONOTE_FORMAT', 'PRONOTE a renvoyé des données illisibles.')
        }
      }
    }

    if (!secureData || typeof secureData !== 'object') {
      throw new PronoteError('PRONOTE_FORMAT', 'PRONOTE n’a pas renvoyé les données attendues.')
    }
    if (secureData[signatureKey]?.Erreur) {
      throw new PronoteError('PRONOTE_REFUSED', 'PRONOTE a refusé la demande.')
    }
    return secureData
  }
}

/**
 * @param {object} config
 * @param {string} config.url
 * @param {{ headerFor(url: string): string; absorb(response: Response, url: string): void; allowHost?(host: string): void }} config.jar
 * @param {typeof fetch} [config.fetchImpl]
 */
export async function openPronoteSession({ url, jar, fetchImpl = fetch }) {
  const normalized = normalizePronoteUrl(url)
  if (!normalized) throw new PronoteError('PRONOTE_URL', 'L’adresse PRONOTE n’est pas valide.')

  const host = normalizeHost(new URL(normalized).hostname)
  if (typeof jar.allowHost === 'function') jar.allowHost(host)
  const allowedHosts = new Set([host])

  const { response, finalUrl } = await fetchWithJar(
    normalized,
    {
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9',
        'User-Agent': PRONOTE_USER_AGENT,
      },
    },
    jar,
    { fetchImpl, allowedHosts },
  )

  if (!response.ok) {
    throw new PronoteError('PRONOTE_ACCESS', 'PRONOTE n’a pas accepté la session MonLycée.')
  }

  const html = await response.text()
  const attributes = parseStartAttributes(html)
  if (!attributes) {
    if (/mot de passe|identifiant|connexion/i.test(html) && !/Start/i.test(html)) {
      throw new PronoteError(
        'PRONOTE_ACCESS',
        'PRONOTE demande une connexion séparée. Vérifie que l’accès PRONOTE est bien ouvert depuis ton ENT.',
      )
    }
    throw new PronoteError('PRONOTE_PAGE', 'La page PRONOTE est inhabituelle. Réessaie plus tard.')
  }
  if (!attributes.e || !attributes.f) {
    throw new PronoteError(
      'PRONOTE_ACCESS',
      'MonLycée n’a pas transmis la session PRONOTE. Ouvre PRONOTE depuis ton ENT puis réessaie.',
    )
  }

  const root = finalUrl.replace(/\/[^/]*$/, '')
  // Sans numéro de version dans la page, la présence des indicateurs CrA/CoA
  // signale une version récente (format id/dataSec).
  const version = parseVersion(html) ?? (attributes.CrA !== undefined ? [2025, 1, 3] : null)
  const session = new PronoteSession({
    root,
    attributes,
    version,
    fetchImpl,
    jar,
    allowedHosts,
  })

  const options = await session.request('FonctionParametres', {
    Uuid: base64(session.aesIvTemp),
    identifiantNav: null,
  })

  const identification = await session.request('Identification', {
    genreConnexion: 0,
    genreEspace: Number(session.espaceId),
    identifiant: attributes.e,
    pourENT: true,
    enConnexionAuto: false,
    demandeConnexionAuto: false,
    demandeConnexionAppliMobile: false,
    demandeConnexionAppliMobileJeton: false,
    enConnexionAppliMobile: false,
    uuidAppliMobile: '',
    loginTokenSAV: '',
  })

  const challenge = identification?.data?.challenge ?? identification?.donnees?.challenge
  if (!challenge) {
    throw new PronoteError('PRONOTE_LOGIN', 'PRONOTE n’a pas ouvert de session pour ce compte.')
  }

  const passwordDigest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(attributes.f)),
  )
  const loginKey = md5(
    new TextEncoder().encode(
      Array.from(passwordDigest)
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase(),
    ),
  )

  // Anciens serveurs : le challenge est chiffré et entrelacé avec un aléa.
  // Serveurs 2026 : il est renvoyé brut et doit être ré-chiffré tel quel.
  let answer
  try {
    const decoded = new TextDecoder().decode(
      await aesDecrypt(loginKey, session.aesIv, hexToBytes(String(challenge))),
    )
    let unscrambled = ''
    for (let index = 0; index < decoded.length; index += 2) unscrambled += decoded[index]
    answer = bytesToHex(
      await aesEncrypt(loginKey, session.aesIv, new TextEncoder().encode(unscrambled)),
    ).toUpperCase()
  } catch {
    answer = bytesToHex(
      await aesEncrypt(loginKey, session.aesIv, new TextEncoder().encode(String(challenge))),
    ).toUpperCase()
  }

  const authentication = await session.request('Authentification', {
    connexion: 0,
    challenge: answer,
    espace: Number(session.espaceId),
  })

  const authData = authentication?.data ?? authentication?.donnees ?? {}
  const access = Number(authData.Acces)
  if (Number.isFinite(access) && access !== 0) {
    throw new PronoteError('PRONOTE_LOGIN', 'PRONOTE a refusé la session de cet élève.')
  }
  const doubleAuth = authData.actionsDoubleAuth
  if (doubleAuth) {
    let actions = []
    try {
      actions = JSON.parse(doubleAuth.V ?? doubleAuth ?? '[]')
    } catch {
      actions = []
    }
    if (Array.isArray(actions) && (actions.includes(3) || actions.includes(5))) {
      throw new PronoteError(
        'PRONOTE_MFA',
        'PRONOTE demande une vérification en deux étapes. Ouvre PRONOTE pour l’accepter une fois.',
      )
    }
  }

  const key = authData.cle
  if (!key) {
    throw new PronoteError('PRONOTE_LOGIN', 'PRONOTE a refusé la session de cet élève.')
  }

  const cleBytes = await aesDecrypt(loginKey, session.aesIv, hexToBytes(String(key)))
  const cleText = new TextDecoder().decode(cleBytes).trim()
  if (!/^\d+(,\d+)*$/.test(cleText)) {
    throw new PronoteError('PRONOTE_LOGIN', 'PRONOTE a renvoyé une clé de session inattendue.')
  }
  // PRONOTE fournit les octets de la clé séparés par des virgules ; la clé
  // AES suivante est le MD5 de ces octets.
  session.aesKey = md5(Uint8Array.from(cleText.split(',').map((value) => Number.parseInt(value, 10))))

  const parameters = await session.request('ParametresUtilisateur', {})
  const parameterData = parameters?.data ?? parameters?.donnees ?? {}
  if (!parameterData.ressource) {
    throw new PronoteError('PRONOTE_LOGIN', 'PRONOTE n’a pas transmis le profil de l’élève.')
  }

  return {
    session,
    attributes,
    options,
    resource: parameterData.ressource,
    tabs: parameterData.listeOnglets ?? [],
    periodTabs: parameterData.listeOngletsPourPeriodes ?? [],
  }
}

/* ------------------------------------------------------------------ */
/* Normalisation                                                      */
/* ------------------------------------------------------------------ */

/** @param {unknown} value */
function text(value) {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (value && typeof value === 'object') {
    if ('V' in value) return text(value.V)
    if ('L' in value) return text(value.L)
  }
  return ''
}

/** @param {string} html */
function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** @param {unknown} value */
function parseNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value && typeof value === 'object' && 'V' in value) return parseNumber(value.V)
  if (typeof value !== 'string') return null
  const cleaned = value.replace(',', '.').replace(/[^\d.+-]/g, '')
  if (!cleaned) return null
  const parsed = Number.parseFloat(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

/** PRONOTE utilise -1 pour signaler une moyenne absente. */
function parseAverage(value) {
  const number = parseNumber(value)
  return number !== null && number >= 0 ? number : null
}

/** @param {string} value */
function parsePronoteDate(value) {
  const match = String(value || '').match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2}))?/)
  if (!match) return null
  const [, day, month, year, hours = '00', minutes = '00'] = match
  return {
    date: `${year}-${month}-${day}`,
    time: `${hours}:${minutes}`,
    iso: `${year}-${month}-${day}T${hours}:${minutes}:00`,
  }
}

/** @param {string} value */
function subjectColor(value) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return SUBJECT_COLORS[hash % SUBJECT_COLORS.length]
}

/** @param {string} name */
function shortSubject(name) {
  const cleaned = name.replace(/\(.*?\)/g, '').trim()
  if (cleaned.length <= 12) return cleaned
  const words = cleaned.split(/\s+/)
  if (words.length > 1) return words.map((word) => word[0]).join('').slice(0, 4).toUpperCase()
  return cleaned.slice(0, 10)
}

/** @param {unknown} data */
function list(value) {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object' && Array.isArray(value.V)) return value.V
  return []
}

/** @param {string} key */
function periodKey(name, index) {
  const normalized = name.toLowerCase()
  const trimestre = normalized.match(/trimestre\s*(\d+)/)
  if (trimestre) return `T${trimestre[1]}`
  const semestre = normalized.match(/semestre\s*(\d+)/)
  if (semestre) return `S${semestre[1]}`
  return `P${index + 1}`
}

/**
 * @param {Awaited<ReturnType<typeof openPronoteSession>>} connection
 * @param {{ fetchImpl?: typeof fetch }} [options]
 */
export async function readSchoolData(connection, options = {}) {
  const { session, options: generalOptions, resource } = connection
  const fetchImpl = options.fetchImpl || fetch

  const general = generalOptions?.data?.General ?? generalOptions?.donnees?.General ?? {}
  const periodsRaw = general.ListePeriodes ?? []
  const periods = periodsRaw.map((period, index) => {
    const start = parsePronoteDate(text(period.dateDebut))
    const end = parsePronoteDate(text(period.dateFin))
    const key = periodKey(text(period.L), index)
    return {
      id: key,
      pronoteId: String(period.N),
      name: text(period.L) || `Période ${index + 1}`,
      start: start?.date ?? '',
      end: end?.date ?? '',
      range:
        start && end
          ? `${new Date(`${start.date}T00:00:00`).toLocaleDateString('fr-FR', {
              month: 'short',
            })} — ${new Date(`${end.date}T00:00:00`).toLocaleDateString('fr-FR', {
              month: 'short',
            })}`
          : '',
    }
  })

  const today = new Date()
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate(),
  ).padStart(2, '0')}`
  const currentPeriod =
    periods.find((period) => period.start && period.end && period.start <= todayIso && todayIso <= period.end) ??
    periods[periods.length - 1] ??
    null

  const subjects = new Map()
  const teachersBySubject = new Map()
  const grades = []
  const averages = []
  let generalAverage = null
  let classGeneralAverage = null

  for (const period of periods) {
    let response
    try {
      response = await session.request(
        'DernieresNotes',
        { Periode: { N: period.pronoteId, L: period.name } },
        198,
      )
    } catch (error) {
      if (error instanceof PronoteError && error.code === 'PRONOTE_REFUSED') continue
      throw error
    }

    const payload = response?.data ?? response?.donnees ?? {}
    if (period.id === currentPeriod?.id) {
      generalAverage = parseAverage(payload.moyGenerale)
      classGeneralAverage = parseAverage(payload.moyGeneraleClasse)
    }
    for (const grade of list(payload.listeDevoirs)) {
      const subjectRaw = grade.service ?? {}
      const subjectId = String(subjectRaw.N ?? subjectRaw.V?.N ?? grade.service?.N ?? '')
      const subjectName = text(subjectRaw.L ?? subjectRaw.V?.L ?? subjectRaw) || 'Matière'
      if (subjectId && !subjects.has(subjectId)) {
        subjects.set(subjectId, {
          id: subjectId,
          name: subjectName,
          short: shortSubject(subjectName),
          color: subjectColor(subjectName),
          teacher: '',
          coef: 1,
        })
      }

      const date = parsePronoteDate(text(grade.date))
      const value = parseAverage(grade.note)
      const outOf = parseNumber(grade.bareme) ?? 20
      const coefficient = parseNumber(grade.coefficient) ?? 1
      const classAverage = parseNumber(grade.moyenne)

      let kind = 'devoir'
      const title = text(grade.commentaireSurNote) || text(grade.commentaire) || 'Évaluation'
      if (/oral/i.test(title)) kind = 'oral'
      else if (/dm|devoir maison/i.test(title)) kind = 'dm'
      else if (/contr[oô]le|ds\b|devoir surveill/i.test(title)) kind = 'controle'

      grades.push({
        id: `${period.id}-${String(grade.N ?? grades.length)}`,
        subjectId: subjectId || `subject-${subjectName}`,
        title,
        value,
        outOf,
        coef: coefficient,
        date: date?.date ?? '',
        classAvg: classAverage,
        comment: text(grade.commentaire) || undefined,
        period: period.id,
        kind,
      })
    }

    for (const average of list(payload.listeServices)) {
      const subjectRaw = average ?? {}
      const subjectId = String(subjectRaw.N ?? subjectRaw.V?.N ?? '')
      const subjectName = text(subjectRaw.L ?? subjectRaw.V?.L ?? subjectRaw) || 'Matière'
      if (!subjectId) continue
      const coefficient = parseNumber(subjectRaw.coefficient)
      const knownSubject = subjects.get(subjectId)
      if (knownSubject) {
        if (coefficient) knownSubject.coef = coefficient
      } else {
        subjects.set(subjectId, {
          id: subjectId,
          name: subjectName,
          short: shortSubject(subjectName),
          color: subjectColor(subjectName),
          teacher: '',
          coef: coefficient ?? 1,
        })
      }
      averages.push({
        period: period.id,
        subjectId,
        student: parseAverage(average.moyEleve),
        classAverage: parseAverage(average.moyClasse),
        outOf: parseNumber(average.baremeMoyEleve) ?? 20,
        min: parseNumber(average.moyMin),
        max: parseNumber(average.moyMax),
      })
    }
  }

  const firstMonday = parsePronoteDate(text(general.PremierLundi))
  const weekNumber = (() => {
    if (!firstMonday?.date) return null
    const start = new Date(`${firstMonday.date}T00:00:00`)
    const diff = Math.floor((today.getTime() - start.getTime()) / 86_400_000)
    return 1 + Math.floor(diff / 7)
  })()

  const lessons = []
  if (weekNumber !== null) {
    const weeks = [weekNumber, weekNumber + 1, weekNumber + 2].filter((week) => week > 0)
    for (const week of weeks) {
      let response
      try {
        response = await session.request(
          'PageEmploiDuTemps',
          {
            ressource: resource,
            Ressource: resource,
            numeroSemaine: week,
            NumeroSemaine: week,
            edt: { G: 16, L: 'Emploi du temps' },
            avecAbsencesEleve: false,
            avecConseilDeClasse: true,
            estEDTPermanence: false,
            avecAbsencesRessource: true,
            avecDisponibilites: true,
            avecInfosPrefsGrille: true,
            avecCoursSortiePeda: true,
            avecRetenuesEleve: true,
          },
          16,
        )
      } catch (error) {
        if (error instanceof PronoteError && error.code === 'PRONOTE_REFUSED') continue
        throw error
      }

      const payload = response?.data ?? response?.donnees ?? {}
      for (const lesson of list(payload.ListeCours)) {
        const start = parsePronoteDate(text(lesson.DateDuCours))
        if (!start) continue
        const end = parsePronoteDate(text(lesson.DateDuCoursFin))
        const contents = list(lesson.ListeContenus)
        let subjectId = ''
        let subjectName = ''
        let teacher = ''
        let room = ''
        for (const content of contents) {
          const kind = Number(content.G)
          if (kind === 16) {
            subjectId = String(content.N ?? '')
            subjectName = text(content.L)
          } else if (kind === 3 && !teacher) {
            teacher = text(content.L)
          } else if (kind === 17 && !room) {
            room = text(content.L)
          }
        }
        if (subjectId && !subjects.has(subjectId) && subjectName) {
          subjects.set(subjectId, {
            id: subjectId,
            name: subjectName,
            short: shortSubject(subjectName),
            color: subjectColor(subjectName),
            teacher: teacher || '',
            coef: 1,
          })
        }
        if (subjectId && teacher) {
          const known = teachersBySubject.get(subjectId) ?? new Set()
          known.add(teacher)
          teachersBySubject.set(subjectId, known)
        }
        if (!subjectId) continue

        const canceled = lesson.estAnnule === true
        const status = canceled ? 'canceled' : lesson.Statut ? 'modified' : 'normal'
        const day = new Date(`${start.date}T00:00:00`)
        const duration = parseNumber(lesson.duree)
        let endTime = end?.time
        if (!endTime) {
          const [hours, minutes] = start.time.split(':').map(Number)
          const total = hours * 60 + minutes + (duration ? duration * 60 : 55)
          endTime = `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
        }

        lessons.push({
          id: `${week}-${String(lesson.N ?? lessons.length)}`,
          subjectId,
          weekday: (day.getDay() + 6) % 7,
          date: start.date,
          start: start.time,
          end: endTime,
          room: room || '—',
          status,
          note: text(lesson.memo) || undefined,
        })
      }
    }
  }

  const homework = []
  if (weekNumber !== null) {
    const lastWeek = weekNumber + 2
    try {
      const response = await session.request(
        'PageCahierDeTexte',
        { domaine: { _T: 8, V: `[${weekNumber}..${lastWeek}]` } },
        88,
      )
      const payload = response?.data ?? response?.donnees ?? {}
      for (const item of list(payload.ListeTravauxAFaire)) {
        const subjectRaw = item.Matiere ?? {}
        const subjectId = String(subjectRaw.N ?? '')
        const subjectName = text(subjectRaw.L)
        if (subjectId && !subjects.has(subjectId) && subjectName) {
          subjects.set(subjectId, {
            id: subjectId,
            name: subjectName,
            short: shortSubject(subjectName),
            color: subjectColor(subjectName),
            teacher: '',
            coef: 1,
          })
        }
        if (!subjectId) continue
        const due = parsePronoteDate(text(item.PourLe))
        const description = stripHtml(text(item.descriptif))
        homework.push({
          id: String(item.N ?? `hw-${homework.length}`),
          subjectId,
          title: description.split('\n')[0].slice(0, 90) || 'Travail à faire',
          details: description,
          due: due?.date ?? todayIso,
          minutes: parseNumber(item.duree) ?? 0,
          type: 'exercices',
          done: item.TAFFait === true,
        })
      }
    } catch (error) {
      if (!(error instanceof PronoteError && error.code === 'PRONOTE_REFUSED')) throw error
    }
  }

  const lifeEvents = []
  if (currentPeriod) {
    try {
      const response = await session.request(
        'PagePresence',
        {
          periode: { N: currentPeriod.pronoteId, L: currentPeriod.name, G: 2 },
          DateDebut: { _T: 7, V: `${currentPeriod.start.split('-').reverse().join('/')} 00:00:00` },
          DateFin: { _T: 7, V: `${currentPeriod.end.split('-').reverse().join('/')} 23:59:59` },
        },
        19,
      )
      const payload = response?.data ?? response?.donnees ?? {}
      for (const item of list(payload.listeAbsences)) {
        const kind = Number(item.G)
        if (kind === 13) {
          const start = parsePronoteDate(text(item.dateDebut))
          const end = parsePronoteDate(text(item.dateFin))
          const hoursText = text(item.NbrHeures)
          const hours = hoursText.includes('h')
            ? Number.parseInt(hoursText.split('h')[0], 10) + Number.parseInt(hoursText.split('h')[1] || '0', 10) / 60
            : parseNumber(hoursText)
          lifeEvents.push({
            id: String(item.N ?? `absence-${lifeEvents.length}`),
            type: 'absence',
            date: start?.date ?? todayIso,
            start: start?.time,
            end: end?.time,
            reason: text(item.listeMotifs?.[0]?.L) || text(item.listeMotifs?.V?.[0]?.L) || 'Absence',
            justified: item.justifie === true,
            durationHours: hours ?? undefined,
          })
        } else if (kind === 14) {
          const date = parsePronoteDate(text(item.date))
          const minutes = parseNumber(item.duree)
          lifeEvents.push({
            id: String(item.N ?? `delay-${lifeEvents.length}`),
            type: 'retard',
            date: date?.date ?? todayIso,
            start: date?.time,
            reason:
              text(item.justification) ||
              text(item.listeMotifs?.[0]?.L) ||
              (minutes ? `Retard de ${minutes} minutes` : 'Retard'),
            justified: item.justifie === true,
            durationHours: 0,
          })
        } else if (kind === 41) {
          const date = parsePronoteDate(text(item.dateDemande))
          const reasons = list(item.listeMotifs)
            .map((reason) => text(reason.L))
            .filter(Boolean)
          lifeEvents.push({
            id: String(item.N ?? `sanction-${lifeEvents.length}`),
            type: 'sanction',
            date: date?.date ?? todayIso,
            reason: reasons.join(' — ') || text(item.nature) || 'Sanction',
            justified: true,
            durationHours: parseNumber(item.duree) ? parseNumber(item.duree) / 60 : undefined,
          })
        }
      }
    } catch (error) {
      if (!(error instanceof PronoteError && error.code === 'PRONOTE_REFUSED')) throw error
    }
  }

  const threads = []
  try {
    const response = await session.request(
      'ListeMessagerie',
      { avecMessage: true, avecLu: true, possessionMessageDiscussionUnique: null },
      131,
    )
    const payload = response?.data ?? response?.donnees ?? {}
    const discussions = list(payload.listeMessagerie)
      .filter((discussion) => discussion.estUneDiscussion !== false && Number(discussion.profondeur ?? 0) === 0)
      .slice(0, MAX_MESSAGES)

    for (const discussion of discussions) {
      const possessions = list(discussion.listePossessionsMessages).map((possession) => ({
        N: possession.N,
      }))
      if (!possessions.length) continue

      let messages = []
      try {
        const messageResponse = await session.request(
          'ListeMessages',
          { listePossessionsMessages: possessions, marquerCommeLu: false, nbMessagesVus: 0 },
          131,
        )
        messages = list((messageResponse?.data ?? messageResponse?.donnees ?? {}).listeMessages)
          .slice(-MAX_MESSAGES_PER_THREAD)
          .map((message) => ({
            id: String(message.N ?? ''),
            author: message.emetteur === true ? '' : text(message.public_gauche) || text(message.public_droite),
            body: stripHtml(text(message.contenu)),
            date: parsePronoteDate(text(message.date)),
            mine: message.emetteur === true,
          }))
          .filter((message) => message.body)
      } catch (error) {
        if (!(error instanceof PronoteError && error.code === 'PRONOTE_REFUSED')) throw error
      }
      if (!messages.length) continue

      const sorted = messages.slice().sort((a, b) => (a.date?.iso ?? '').localeCompare(b.date?.iso ?? ''))
      const last = sorted[sorted.length - 1]
      const incoming = sorted.find((message) => !message.mine)
      const from = incoming?.author || text(discussion.public_gauche) || 'Messagerie PRONOTE'
      const subject = text(discussion.objet) || '(Sans objet)'
      const color = subjectColor(subject)
      const folder = sorted.every((message) => message.mine) ? 'sent' : 'inbox'

      threads.push({
        id: String(discussion.N ?? `thread-${threads.length}`),
        from: folder === 'sent' ? 'Moi' : from,
        role:
          folder === 'sent'
            ? `À : ${incoming?.author || 'PRONOTE'}`
            : discussion.ferme === true
              ? 'Discussion fermée'
              : text(discussion.initiateur) || 'Messagerie PRONOTE',
        subject,
        preview: last.body.slice(0, 160),
        body: [sorted[0].body],
        at: last.date?.iso ?? new Date().toISOString(),
        unread: Number(discussion.nbNonLus ?? 0) > 0,
        starred: false,
        color,
        replies: sorted.slice(1).map((message) => ({
          id: message.id,
          body: message.body,
          at: message.date?.iso ?? new Date().toISOString(),
          fromMe: message.mine,
        })),
        folder,
      })
    }
  } catch (error) {
    if (!(error instanceof PronoteError && error.code === 'PRONOTE_REFUSED')) throw error
  }

  const news = []
  try {
    const response = await session.request(
      'PageActualites',
      { modesAffActus: { _T: 26, V: '[0]' } },
      8,
    )
    const payload = response?.data ?? response?.donnees ?? {}
    const mode = list(payload.listeModesAff)[0]
    for (const item of list(mode?.listeActualites).slice(0, 6)) {
      const created = parsePronoteDate(text(item.dateCreation))
      const title = text(item.L)
      if (!title) continue
      news.push({
        id: String(item.N ?? `news-${news.length}`),
        title,
        excerpt: text(item.auteur) ? `Publié par ${text(item.auteur)}` : 'Information du lycée',
        category: text(item.nature) || 'Vie du lycée',
        date: created?.date ?? '',
        emoji: '🏫',
        color: subjectColor(title),
      })
    }
  } catch (error) {
    if (!(error instanceof PronoteError && error.code === 'PRONOTE_REFUSED')) throw error
  }

  for (const [subjectId, teachers] of teachersBySubject) {
    const subject = subjects.get(subjectId)
    if (subject) subject.teacher = Array.from(teachers).join(', ')
  }

  return {
    source: 'pronote',
    syncedAt: new Date().toISOString(),
    periods,
    currentPeriodId: currentPeriod?.id ?? null,
    generalAverage,
    classGeneralAverage,
    subjects: Array.from(subjects.values()).map((subject) => ({
      ...subject,
      coef: subject.coef || 1,
      teacher: subject.teacher,
    })),
    grades,
    // Toutes les périodes : l'onglet Notes bascule de l'une à l'autre.
    averages,
    lessons,
    homework,
    lifeEvents,
    threads,
    news,
    student: {
      name: text(resource.L),
      className: text(resource.classeDEleve),
      establishment: text(resource.Etablissement?.V ?? resource.Etablissement),
    },
  }
}

/**
 * Ouvre PRONOTE et lit toutes les données de l'élève en une seule session.
 *
 * @param {{ url: string; jar: unknown; fetchImpl?: typeof fetch }} input
 */
export async function fetchSchoolData({ url, jar, fetchImpl = fetch }) {
  const connection = await openPronoteSession({ url, jar, fetchImpl })
  return readSchoolData(connection, { fetchImpl })
}
