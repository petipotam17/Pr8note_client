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
const HTML_HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9',
  'User-Agent': PRONOTE_USER_AGENT,
}
const MAX_ENTRY_HOPS = 4
// Domaines de l'ENT et de PRONOTE. Seuls eux peuvent être contactés ou
// suivre une redirection, y compris quand l'établissement utilise un alias
// (www.index-education.net) ou une page servie par le portail.
const TRUSTED_HOST_SUFFIXES = ['monlycee.net', 'index-education.net', 'index-education.com']

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
   * @param {string} [stage] Code d'étape court, affiché à l'élève.
   */
  constructor(code, message, status = 502, stage = '') {
    super(message)
    this.name = 'PronoteError'
    this.code = code
    this.status = status
    this.stage = stage
  }
}

/**
 * Message affiché à l'élève : le code d'étape est ajouté à la fin pour qu'il
 * puisse être recopié tel quel.
 *
 * @param {PronoteError} error
 */
export function describePronoteError(error) {
  return error.stage ? `${error.message} · code ${error.stage}` : error.message
}

/*
 * Codes d'étape renvoyés avec l'erreur. Ils sont courts et ne contiennent ni
 * hôte, ni identifiant, ni adresse IP, ni détail de configuration :
 *
 *   E0 erreur interne inattendue (aucune étape PRONOTE reconnue)
 *   E1 adresse fournie invalide
 *   E2 redirection hors ENT/PRONOTE
 *   E3-D domaine PRONOTE introuvable (aucun serveur à cette adresse)
 *   E3-N hôte PRONOTE injoignable (TLS, connexion refusée)
 *   E3-T délai dépassé en attendant PRONOTE
 *   E4 trop de redirections
 *   E5 PRONOTE a refusé la session
 *   E6 MonLycée n'a pas transmis la session PRONOTE
 *   E7 PRONOTE demande sa propre connexion
 *   E8 PRONOTE bloque les connexions
 *   E9 page PRONOTE sans bloc Start
 *   W1 PRONOTE refuse ce compte
 *   W2 vérification en deux étapes demandée
 *   W3 session PRONOTE expirée
 *   W4 PRONOTE limite les connexions
 *   W5 réponse PRONOTE illisible ou trop lente
 *   W6 lecture des données refusée
 */

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
  if (clean.length % 2 !== 0)
    throw new PronoteError('PRONOTE_FORMAT', 'Réponse PRONOTE illisible.', 502, 'W5')
  const output = new Uint8Array(clean.length / 2)
  for (let index = 0; index < output.length; index += 1) {
    const value = Number.parseInt(clean.slice(index * 2, index * 2 + 2), 16)
    if (!Number.isFinite(value))
      throw new PronoteError('PRONOTE_FORMAT', 'Réponse PRONOTE illisible.', 502, 'W5')
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
    throw new PronoteError(
      'PRONOTE_CRYPTO',
      'PRONOTE a refusé le chiffrement de la session.',
      502,
      'W5',
    )
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
 * @param {string} host
 * @param {Set<string>} allowed
 */
function isTrustedHost(host, allowed) {
  if (allowed.has(host)) return true
  return TRUSTED_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))
}

/** @param {string} value */
function isEntHostname(value) {
  const host = normalizeHost(value)
  return host === 'monlycee.net' || host.endsWith('.monlycee.net')
}

/** @param {string} url */
function isEntHost(url) {
  try {
    return isEntHostname(new URL(url).hostname)
  } catch {
    return false
  }
}

/**
 * Distingue « ce nom de domaine n’existe pas » d’une panne réseau
 * quelconque. Cloudflare Workers renvoie un TypeError « fetch failed » dont
 * la cause porte le code DNS ; on ne classe en E3-D que sur ces marqueurs,
 * jamais d’après le nom d’hôte (qui ne doit pas parvenir à l’élève).
 *
 * @param {unknown} error
 */
function isDnsFailure(error) {
  if (!(error instanceof Error)) return false
  const cause = /** @type {{ code?: unknown; message?: unknown } | undefined} */ (error.cause)
  const detail = `${String(cause?.code ?? '')} ${String(cause?.message ?? '')} ${error.message}`
  return /ENOTFOUND|EAI_AGAIN|ENODATA|DNS|name resolution|resolve host/i.test(detail)
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
    if (current.protocol === 'http:') {
      current = new URL(`https://${current.host}${current.pathname}${current.search}`)
    }
    const host = normalizeHost(current.hostname)
    if (current.protocol !== 'https:') {
      throw new PronoteError('PRONOTE_URL', 'L’adresse PRONOTE doit utiliser HTTPS.', 502, 'E2')
    }
    if (!isTrustedHost(host, allowedHosts)) {
      throw new PronoteError(
        'PRONOTE_URL',
        'PRONOTE a redirigé vers un service non autorisé.',
        502,
        'E2',
      )
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
      const dns = !aborted && isDnsFailure(error)
      // Trois causes très différentes : un domaine qui n'existe pas (E3-D)
      // ne se corrige pas en réessayant, un hôte injoignable (E3-N) peut se
      // débloquer, et un PRONOTE lent (E3-T) demande juste du temps.
      throw new PronoteError(
        aborted ? 'PRONOTE_TIMEOUT' : dns ? 'PRONOTE_DNS' : 'PRONOTE_NETWORK',
        aborted
          ? 'PRONOTE met trop de temps à répondre. Réessaie dans quelques instants.'
          : dns
            ? 'L’adresse PRONOTE ne mène à aucun serveur (domaine introuvable). Ouvre PRONOTE depuis ton ENT, copie l’adresse de la page et colle-la dans le champ « Adresse PRONOTE de ton lycée ».'
            : 'Impossible de joindre PRONOTE à cette adresse. Ouvre PRONOTE depuis ton ENT, copie l’adresse de la page et colle-la dans le champ « Adresse PRONOTE de ton lycée », puis réessaie.',
        502,
        aborted ? 'E3-T' : dns ? 'E3-D' : 'E3-N',
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
        throw new PronoteError(
          'PRONOTE_REDIRECT',
          'PRONOTE a renvoyé une redirection invalide.',
          502,
          'E4',
        )
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

  throw new PronoteError(
    'PRONOTE_REDIRECT',
    'PRONOTE a interrompu la connexion (trop de redirections).',
    502,
    'E4',
  )
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
  const raw = String(input || '').trim()
  if (!raw) return null

  let candidate = raw
  if (!/^https?:\/\//i.test(candidate)) candidate = `https://${candidate}`

  let url
  try {
    url = new URL(candidate)
  } catch {
    return null
  }
  // Une adresse collée depuis la barre du navigateur peut garder « :443 ».
  if (url.username || url.password) return null
  if (url.port && url.port !== '443') return null
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null

  const host = normalizeHost(url.hostname)
  if (
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ||
    host.includes(':') ||
    !host.includes('.')
  ) {
    return null
  }

  url.protocol = 'https:'
  url.port = ''
  url.searchParams.delete('login')

  // L'élève peut coller l'adresse exacte de son Espace élève, celle du
  // portail de son lycée, une adresse avec un jeton d'accès ou simplement le
  // domaine PRONOTE : toutes ces formes sont valables. On ne complète le
  // chemin que lorsqu'il désigne clairement le dossier PRONOTE, pour ne pas
  // casser une adresse personnalisée ni un lien signé.
  if (/\/pronote\/?$/i.test(url.pathname)) {
    if (!url.pathname.endsWith('/')) url.pathname += '/'
    url.pathname += 'eleve.html'
  }

  url.hash = ''
  return url.toString()
}

/* ------------------------------------------------------------------ */
/* Découverte de l'adresse PRONOTE dans l'ENT                          */
/* ------------------------------------------------------------------ */

const PORTAL_HOME = 'https://psn.monlycee.net/'

/**
 * @param {string} value
 * @param {string} baseUrl
 */
function resolvePortalUrl(value, baseUrl) {
  const cleaned = String(value || '')
    .trim()
    .replace(/&amp;/gi, '&')
    // Un portail peut échapper les barres obliques de son JSON (\/), voire
    // davantage : on les remet dans l'ordre avant de lire l'adresse.
    .replace(/\\+\//g, '/')
  if (!cleaned || /^(?:javascript:|mailto:|tel:|data:|#)/i.test(cleaned)) return null
  try {
    return new URL(cleaned, baseUrl)
  } catch {
    return null
  }
}

/**
 * Adresses PRONOTE citées par le tableau de bord : liens vers un hôte Index
 * Éducation, chemins contenant « pronote », et tuiles PRONOTE du portail
 * (même réduites à une image, même si elles passent par un lanceur).
 *
 * @param {string} body
 * @param {string} baseUrl
 */
function pronoteLinks(body, baseUrl) {
  const text = body.replace(/&amp;/gi, '&').replace(/\\+\//g, '/')
  const origin = new URL(baseUrl).origin
  const found = new Set()

  const add = (value, allowPortal = false) => {
    const url = resolvePortalUrl(value, baseUrl)
    if (!url || url.protocol !== 'https:') return
    if (/\.(?:css|js|mjs|png|jpe?g|gif|svg|ico|webp|woff2?|ttf|pdf|zip)(?:[?#]|$)/i.test(url.pathname)) {
      return
    }
    const host = normalizeHost(url.hostname)
    const pronoteHost = host.endsWith('index-education.net') || host.endsWith('index-education.com')
    if (pronoteHost || /pronote/i.test(url.pathname) || (allowPortal && url.origin === origin)) {
      found.add(url.toString())
    }
  }

  for (const match of text.match(/https?:\/\/[^\s"'<>\\]+/gi) ?? []) add(match)
  for (const match of text.match(/["'](\/[^"'\s<>\\]{2,})["']/g) ?? []) add(match.slice(1, -1))

  // Le libellé d'une tuile peut être une image : on lit tout le lien.
  for (const anchor of text.match(/<a\b[^>]*>[\s\S]{0,300}?<\/a>/gi) ?? []) {
    if (!/pronote/i.test(anchor)) continue
    const href = /href=["']([^"']+)["']/i.exec(anchor)?.[1]
    if (href) add(href, true)
  }
  // Certaines tuiles ouvrent PRONOTE par un formulaire auto-posté.
  for (const action of text.match(/action=["']([^"']+)["']/gi) ?? []) add(action.slice(8, -1), true)

  return Array.from(found)
}

/**
 * Adresses PRONOTE possibles pour cet élève, dans l'ordre :
 *   1. le lien de la tuile PRONOTE du tableau de bord MonLycée ;
 *   2. l'adresse déduite du code établissement (RNE), toujours conservée : les lycées hébergés
 *      chez Index Éducation suivent toujours le modèle
 *      https://RNE.index-education.net/pronote/.
 *
 * Une seule page est lue, et on ne devine rien d'autre : sans tuile ni RNE,
 * il vaut mieux demander l'adresse que d'essayer des chemins au hasard.
 *
 * @param {{ headerFor(url: string): string; absorb(response: Response, url: string): void }} jar
 * @param {typeof fetch} [fetchImpl]
 * @param {string} [hint] RNE connu par ailleurs (identité MonLycée).
 */
export async function discoverPronoteCandidates(jar, fetchImpl = fetch, hint = '') {
  let uai = /^\d{7}[A-Z]$/.test(hint) ? hint : ''
  const links = []
  try {
    const { response, finalUrl } = await fetchWithJar(
      PORTAL_HOME,
      { method: 'GET', headers: HTML_HEADERS },
      jar,
      { fetchImpl, allowedHosts: new Set(['psn.monlycee.net', 'auth.monlycee.net']) },
    )
    if (response.ok) {
      const body = await response.text()
      for (const link of pronoteLinks(body, finalUrl)) {
        const normalized = normalizePronoteUrl(link)
        if (normalized && !links.includes(normalized)) links.push(normalized)
      }
      uai ||= /\b(\d{7}[A-Z])\b/.exec(body)?.[1] ?? ''
    }
  } catch {
    // La découverte est un confort : l'élève peut fournir l'adresse lui-même.
  }

  // La tuile d'abord, puis l'adresse déduite du RNE : elle reste en seconde
  // position même si le tableau de bord expose plusieurs liens PRONOTE, car
  // c'est la seule adresse qui ne dépend pas du contenu de la page.
  const candidates = links.slice(0, 1)
  if (/^\d{7}[A-Z]$/.test(uai)) {
    const fromRne = normalizePronoteUrl(
      `https://${uai.toLowerCase()}.index-education.net/pronote/eleve.html`,
    )
    if (fromRne) candidates.push(fromRne)
  }

  return candidates.filter((url, index) => candidates.indexOf(url) === index)
}

/**
 * Compatibilité : première adresse trouvée, ou null.
 *
 * @param {{ headerFor(url: string): string; absorb(response: Response, url: string): void }} jar
 * @param {typeof fetch} [fetchImpl]
 */
export async function discoverPronoteUrl(jar, fetchImpl = fetch) {
  const [first] = await discoverPronoteCandidates(jar, fetchImpl)
  return first ?? null
}

/* ------------------------------------------------------------------ */
/* Session PRONOTE                                                    */
/* ------------------------------------------------------------------ */

/**
 * @param {string} html
 */
export function parseStartAttributes(html) {
  const marker = /Start\s*\(\s*\{/.exec(html)
  if (!marker) return null

  // Les valeurs peuvent contenir des accolades (mot de passe, libellés) : on
  // équilibre les accolades en ignorant celles des chaînes au lieu de
  // s'arrêter à la première fermante.
  const start = marker.index + marker[0].length - 1
  let depth = 0
  let quote = ''
  let end = -1
  for (let index = start; index < html.length; index += 1) {
    const character = html[index]
    if (quote) {
      if (character === '\\') index += 1
      else if (character === quote) quote = ''
      continue
    }
    if (character === "'" || character === '"') quote = character
    else if (character === '{') depth += 1
    else if (character === '}') {
      depth -= 1
      if (depth === 0) {
        end = index
        break
      }
    }
  }
  if (end === -1) return null

  const attributes = {}
  const pattern =
    /(['"]?)([A-Za-z0-9_]+)\1\s*:\s*(?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"|([^,}]+))/g
  let entry
  while ((entry = pattern.exec(html.slice(start + 1, end)))) {
    const value = entry[3] ?? entry[4] ?? entry[5] ?? ''
    attributes[entry[2]] = value.trim()
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
    // « login » pendant l'ouverture de session, « data » ensuite : le même
    // refus de PRONOTE ne signifie pas la même chose aux deux étapes.
    this.phase = 'login'

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
        502,
        'W5',
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
      throw new PronoteError('PRONOTE_FORMAT', 'PRONOTE a renvoyé une réponse illisible.', 502, 'W5')
    }

    let envelope
    try {
      envelope = JSON.parse(raw)
    } catch {
      if (/adresse IP/i.test(raw)) {
        throw new PronoteError(
          'PRONOTE_BLOCKED',
          'PRONOTE bloque temporairement cette adresse.',
          502,
          'E8',
        )
      }
      throw new PronoteError('PRONOTE_FORMAT', 'PRONOTE a renvoyé une réponse inattendue.', 502, 'W5')
    }

    if (envelope?.Erreur) {
      const code = Number(envelope.Erreur.G)
      if (code === 22) {
        throw new PronoteError(
          'PRONOTE_EXPIRED',
          'La session PRONOTE a expiré. Reconnecte-toi.',
          502,
          'W3',
        )
      }
      if (code === 25) {
        throw new PronoteError(
          'PRONOTE_BUSY',
          'PRONOTE limite temporairement les connexions.',
          502,
          'W4',
        )
      }
      throw new PronoteError(
        'PRONOTE_REFUSED',
        'PRONOTE a refusé la demande.',
        502,
        this.phase === 'data' ? 'W6' : 'W1',
      )
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
          throw new PronoteError(
            'PRONOTE_FORMAT',
            'PRONOTE a renvoyé des données illisibles.',
            502,
            'W5',
          )
        }
      }
    }

    if (!secureData || typeof secureData !== 'object') {
      throw new PronoteError(
        'PRONOTE_FORMAT',
        'PRONOTE n’a pas renvoyé les données attendues.',
        502,
        'W5',
      )
    }
    if (secureData[signatureKey]?.Erreur) {
      throw new PronoteError(
        'PRONOTE_REFUSED',
        'PRONOTE a refusé la demande.',
        502,
        this.phase === 'data' ? 'W6' : 'W1',
      )
    }
    return secureData
  }
}

/**
 * Page suivante indiquée par la page elle-même. Les ENT et PRONOTE redirigent
 * souvent en JavaScript (meta refresh, location, iframe), ce que fetch ne suit
 * pas.
 *
 * @param {string} html
 * @param {string} baseUrl
 */
function clientRedirect(html, baseUrl) {
  const patterns = [
    /<meta[^>]+http-equiv=["']?refresh["']?[^>]*content=["'][^"']*url=([^"';]+)/i,
    /(?:window\.|top\.|parent\.|document\.)?location\.(?:replace|assign)\s*\(\s*["']([^"']+)["']/i,
    /(?:window\.|top\.|parent\.|document\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/i,
    /window\.open\s*\(\s*["']([^"']+)["']/i,
    /<(?:iframe|frame)[^>]+src=["']([^"']+)["']/i,
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(html)
    if (!match) continue
    const target = match[1].trim().replace(/&amp;/gi, '&').replace(/\\+\//g, '/')
    if (!target || /^(?:javascript:|about:blank|#)/i.test(target)) continue
    try {
      return new URL(target, baseUrl).toString()
    } catch {
      continue
    }
  }
  return null
}

/**
 * Formulaire d'authentification unique renvoyé par l'ENT pour revenir à
 * PRONOTE. On n'accepte qu'un POST de champs cachés : un formulaire de
 * connexion (mot de passe, identifiant) n'est jamais soumis.
 *
 * @param {string} html
 */
function ssoForm(html) {
  const markup = /<form\b[^>]*>[\s\S]*?<\/form>/i.exec(html)
  if (!markup) return null
  const open = /<form\b[^>]*>/i.exec(markup[0])?.[0] ?? ''
  const method = (/method=["']?([a-z]+)/i.exec(open)?.[1] ?? 'get').toLowerCase()
  if (method !== 'post' && method !== 'get') return null
  if (/captcha|otp|totp|two.factor|deux étapes/i.test(markup[0])) return null

  const fields = new URLSearchParams()
  for (const input of markup[0].match(/<input\b[^>]*>/gi) ?? []) {
    const name = /name=["']([^"']+)["']/i.exec(input)?.[1]
    if (!name) continue
    // Un formulaire qui affiche des champs à remplir est une page de
    // connexion : il n'est jamais soumis à la place de l'élève.
    if ((/type=["']([^"']+)["']/i.exec(input)?.[1] ?? 'text').toLowerCase() !== 'hidden') return null
    if (/pass|user|login|identifiant|email|courriel/i.test(name)) return null
    fields.set(name, (/value=["']([^"']*)["']/i.exec(input)?.[1] ?? '').replace(/&amp;/gi, '&'))
  }
  if (!fields.toString()) return null
  return {
    action: /action=["']([^"']*)["']/i.exec(open)?.[1] ?? '',
    method,
    body: fields.toString(),
  }
}

/**
 * Formulaire de connexion de l'ENT rencontré pendant l'ouverture de PRONOTE.
 *
 * Seul un formulaire servi par MonLycée peut recevoir les identifiants de
 * l'élève : un formulaire PRONOTE, un autre domaine ou une page demandant un
 * code de vérification est ignoré.
 *
 * @param {string} html
 * @param {string} pageUrl
 * @param {{ username: string; password: string } | null} credentials
 */
export function entLoginForm(html, pageUrl, credentials) {
  if (!credentials?.username || !credentials?.password) return null
  let page
  try {
    page = new URL(pageUrl)
  } catch {
    return null
  }
  if (!isEntHostname(page.hostname)) return null
  if (/g-recaptcha|h-captcha|hcaptcha|cf-turnstile|recaptcha|captcha/i.test(html)) return null

  const markup = /<form\b[^>]*>[\s\S]*?<\/form>/i.exec(html)
  if (!markup) return null
  const open = /^<form\b[^>]*>/i.exec(markup[0])?.[0] ?? ''
  if ((/method=["']?([a-z]+)/i.exec(open)?.[1] ?? 'get').toLowerCase() !== 'post') return null

  let action
  try {
    const rawAction = (/action=["']([^"']*)["']/i.exec(open)?.[1] ?? pageUrl).replace(/&amp;/gi, '&')
    action = new URL(rawAction || pageUrl, page)
  } catch {
    return null
  }
  if (!isEntHostname(action.hostname)) return null

  const fields = new URLSearchParams()
  const textFields = []
  let passwordField = ''
  let needsSecondStep = false

  for (const input of markup[0].match(/<input\b[^>]*>/gi) ?? []) {
    const name = /name=["']([^"']+)["']/i.exec(input)?.[1]
    if (!name) continue
    const type = (/type=["']([^"']+)["']/i.exec(input)?.[1] ?? 'text').toLowerCase()
    const value = (/value=["']([^"']*)["']/i.exec(input)?.[1] ?? '').replace(/&amp;/gi, '&')
    if (type !== 'hidden' && /otp|totp|one.?time|webauthn|passkey|code/i.test(name)) {
      needsSecondStep = true
    }
    if (type === 'password') {
      passwordField ||= name
    } else if (type === 'hidden') {
      fields.set(name, value)
    } else if (type === 'submit' || type === 'image') {
      // CAS attend souvent le bouton « _eventId=submit » comme champ.
      if (value) fields.set(name, value)
    } else if (type === 'text' || type === 'email' || type === 'tel') {
      textFields.push(name)
    }
  }
  for (const button of markup[0].match(/<button\b[^>]*>/gi) ?? []) {
    const name = /name=["']([^"']+)["']/i.exec(button)?.[1]
    const value = /value=["']([^"']*)["']/i.exec(button)?.[1]
    if (name && value) fields.set(name, value)
  }
  if (needsSecondStep) return null

  const usernameField = textFields.find((name) =>
    /user|login|ident|mail|courriel|compte/i.test(name),
  )
  // Connexion en deux temps : d'abord l'identifiant seul, puis le mot de
  // passe. On n'accepte un formulaire sans mot de passe que si son champ est
  // clairement un identifiant, jamais un champ de recherche.
  if (!passwordField && !usernameField) return null

  if (usernameField) fields.set(usernameField, credentials.username)
  if (passwordField) fields.set(passwordField, credentials.password)
  return { action: action.toString(), body: fields.toString() }
}

/**
 * Points d'entrée essayés, dans l'ordre : l'adresse exacte fournie par
 * l'élève d'abord (elle peut contenir un jeton d'accès), puis les pages
 * habituelles de l'Espace élève.
 *
 * @param {string} normalized
 */
export function entryCandidates(normalized) {
  const base = new URL(normalized)
  const directory = base.pathname.replace(/[^/]*$/, '') || '/'
  const plain = (pathname) => `${base.origin}${pathname}`
  const loginCandidate = base.search ? null : `${plain(directory)}?login=true`
  const candidates = [
    normalized,
    plain(`${directory}eleve.html`),
    // Un compte parent de l'ENT ouvre l'espace parent, pas l'espace élève.
    plain(`${directory}parent.html`),
    plain('/pronote/eleve.html'),
    plain('/pronote/parent.html'),
    plain('/pronote/'),
    loginCandidate,
  ].filter((value) => Boolean(value))
  return candidates.filter((value, index, all) => all.indexOf(value) === index)
}

/**
 * Ouvre la page d'entrée de l'Espace élève, en suivant les redirections côté
 * client et le formulaire SSO que l'ENT renvoie avant d'atteindre PRONOTE.
 *
 * @param {string} url
 * @param {{ headerFor(url: string): string; absorb(response: Response, url: string): void }} jar
 * @param {{ fetchImpl?: typeof fetch; allowedHosts: Set<string>; credentials?: { username: string; password: string } | null }} options
 */
async function readEntryPage(url, jar, options) {
  let current = url
  let method = 'GET'
  let body
  let page = null
  let logins = 0

  for (let hop = 0; hop <= MAX_ENTRY_HOPS; hop += 1) {
    const { response, finalUrl } = await fetchWithJar(
      current,
      {
        method,
        body,
        headers:
          method === 'POST'
            ? { ...HTML_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' }
            : HTML_HEADERS,
      },
      jar,
      options,
    )
    const html = await response.text()
    page = { response, finalUrl, html, attributes: parseStartAttributes(html), logins }
    if (page.attributes || !response.ok) return page

    // L'ENT redemande parfois une connexion au moment d'ouvrir PRONOTE : la
    // session du portail ne couvre pas toujours la délégation CAS. On rejoue
    // alors la connexion sur sa page, avec les identifiants qui sont déjà en
    // mémoire pour cette requête (jamais stockés).
    const login = entLoginForm(html, finalUrl, options.credentials)
    if (login) {
      logins += 1
      if (logins > 2) return { ...page, logins }
      method = 'POST'
      body = login.body
      current = login.action
      continue
    }

    const form = ssoForm(html)
    const next = form ? null : clientRedirect(html, finalUrl)
    if (!form && !next) return page

    if (form) {
      method = form.method
      body = form.body
      current = new URL(form.action || finalUrl, finalUrl).toString()
    } else {
      method = 'GET'
      body = undefined
      current = next
    }
  }
  return page
}

/**
 * @param {object} config
 * @param {string} config.url
 * @param {{ headerFor(url: string): string; absorb(response: Response, url: string): void; allowHost?(host: string): void }} config.jar
 * @param {typeof fetch} [config.fetchImpl]
 */
export async function openPronoteSession({ url, jar, fetchImpl = fetch, credentials = null }) {
  const normalized = normalizePronoteUrl(url)
  if (!normalized)
    throw new PronoteError('PRONOTE_URL', 'L’adresse PRONOTE n’est pas valide.', 502, 'E1')

  const host = normalizeHost(new URL(normalized).hostname)
  if (typeof jar.allowHost === 'function') jar.allowHost(host)
  const allowedHosts = new Set([host])
  const entryOptions = { fetchImpl, allowedHosts, credentials }

  const candidates = entryCandidates(normalized)

  let page = null
  let score = -1
  let entLogins = 0
  for (const candidate of candidates) {
    let current
    try {
      current = await readEntryPage(candidate, jar, entryOptions)
    } catch (error) {
      if (error instanceof PronoteError && error.code === 'PRONOTE_REDIRECT') continue
      throw error
    }
    entLogins += current.logins ?? 0
    if (current.attributes) {
      page = current
      break
    }

    const currentScore = /mot de passe|identifiant|connexion/i.test(current.html)
      ? 2
      : current.response.ok
        ? 1
        : 0
    if (currentScore > score) {
      page = current
      score = currentScore
    }
    // Un refus explicite arrête les essais. Une page qui demande un mot de
    // passe arrête aussi les essais, sauf si elle vient de l'ENT : la session
    // vient peut-être d'être renouvelée pour l'adresse suivante.
    if (!current.response.ok) break
    if (currentScore === 2 && !isEntHost(current.finalUrl)) break
  }

  // La connexion à l'ENT a réussi pendant l'essai : PRONOTE peut maintenant
  // accepter une nouvelle requête sur l'adresse exacte de l'élève.
  if (!page?.attributes && entLogins > 0) {
    const retry = await readEntryPage(candidates[0], jar, entryOptions)
    if (retry.attributes || retry.response.ok) page = retry
  }

  if (!page) {
    throw new PronoteError(
      'PRONOTE_REDIRECT',
      'PRONOTE a interrompu la connexion (trop de redirections).',
      502,
      'E4',
    )
  }
  if (!page.response.ok) {
    // Le statut HTTP suffit à distinguer un mauvais hôte (404) d'un refus
    // (403) sans révéler d'adresse ni de détail de configuration.
    throw new PronoteError(
      'PRONOTE_ACCESS',
      'PRONOTE n’a pas accepté la session MonLycée.',
      502,
      `E5-${page.response.status}`,
    )
  }

  const attributes = page.attributes
  if (!attributes) {
    if (/adresse IP|trop de connexions|bloqu[ée]/i.test(page.html)) {
      throw new PronoteError(
        'PRONOTE_BLOCKED',
        'PRONOTE bloque temporairement les connexions. Réessaie dans quelques minutes.',
        502,
        'E8',
      )
    }
    if (isEntHost(page.finalUrl)) {
      throw new PronoteError(
        'PRONOTE_ACCESS',
        'MonLycée n’a pas transmis la session PRONOTE. Ouvre PRONOTE depuis ton ENT une première fois, puis réessaie.',
        502,
        'E6',
      )
    }
    if (/mot de passe|identifiant|connexion/i.test(page.html)) {
      throw new PronoteError(
        'PRONOTE_ACCESS',
        'PRONOTE demande une connexion séparée. Vérifie que l’accès PRONOTE est bien ouvert depuis ton ENT.',
        502,
        'E7',
      )
    }
    throw new PronoteError(
      'PRONOTE_PAGE',
      'PRONOTE a répondu sans ouvrir l’Espace élève. Vérifie l’adresse PRONOTE de ton lycée (elle finit par /pronote/eleve.html) puis réessaie.',
      502,
      'E9',
    )
  }
  if (!attributes.e || !attributes.f) {
    throw new PronoteError(
      'PRONOTE_ACCESS',
      'MonLycée n’a pas transmis la session PRONOTE. Ouvre PRONOTE depuis ton ENT puis réessaie.',
      502,
      'E6',
    )
  }

  const root = page.finalUrl.replace(/\/[^/]*$/, '')
  // Sans numéro de version dans la page, la présence des indicateurs CrA/CoA
  // signale une version récente (format id/dataSec).
  const version = parseVersion(page.html) ?? (attributes.CrA !== undefined ? [2025, 1, 3] : null)
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
    throw new PronoteError(
      'PRONOTE_LOGIN',
      'PRONOTE n’a pas ouvert de session pour ce compte.',
      502,
      'W1',
    )
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
    throw new PronoteError('PRONOTE_LOGIN', 'PRONOTE a refusé la session de cet élève.', 502, 'W1')
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
        502,
        'W2',
      )
    }
  }

  const key = authData.cle
  if (!key) {
    throw new PronoteError('PRONOTE_LOGIN', 'PRONOTE a refusé la session de cet élève.', 502, 'W1')
  }

  const cleBytes = await aesDecrypt(loginKey, session.aesIv, hexToBytes(String(key)))
  const cleText = new TextDecoder().decode(cleBytes).trim()
  if (!/^\d+(,\d+)*$/.test(cleText)) {
    throw new PronoteError(
      'PRONOTE_LOGIN',
      'PRONOTE a renvoyé une clé de session inattendue.',
      502,
      'W1',
    )
  }
  // PRONOTE fournit les octets de la clé séparés par des virgules ; la clé
  // AES suivante est le MD5 de ces octets.
  session.aesKey = md5(Uint8Array.from(cleText.split(',').map((value) => Number.parseInt(value, 10))))

  const parameters = await session.request('ParametresUtilisateur', {})
  const parameterData = parameters?.data ?? parameters?.donnees ?? {}
  if (!parameterData.ressource) {
    throw new PronoteError(
      'PRONOTE_LOGIN',
      'PRONOTE n’a pas transmis le profil de l’élève.',
      502,
      'W1',
    )
  }

  session.phase = 'data'
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
export async function fetchSchoolData({ url, jar, fetchImpl = fetch, credentials = null }) {
  const connection = await openPronoteSession({ url, jar, fetchImpl, credentials })
  return readSchoolData(connection, { fetchImpl })
}
