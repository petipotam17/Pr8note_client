/**
 * Limitation des tentatives de connexion MonLycée.
 *
 * Les compteurs vivent dans D1, donc toutes les instances du Worker partagent
 * les mêmes fenêtres. Les clés sont hachées : ni l'IP ni l'identifiant ne sont
 * écrits en clair. Une connexion réussie rembourse la tentative IP et efface
 * la fenêtre de l'identifiant.
 */

const TABLE = 'auth_rate_limits'
const RETENTION_MS = 24 * 60 * 60_000

export const RATE_LIMITS = Object.freeze({
  ip: {
    // Une IP peut être partagée par tout un établissement.
    max: 30,
    windowMs: 10 * 60_000,
  },
  user: {
    max: 8,
    windowMs: 15 * 60_000,
  },
})

// Même valeur pour les deux limites, alignée sur la plus longue fenêtre.
export const RATE_LIMIT_RETRY_AFTER_SECONDS = Math.ceil(RATE_LIMITS.user.windowMs / 1000)

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS ${TABLE} (
    key TEXT PRIMARY KEY,
    window_start INTEGER NOT NULL,
    count INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )
`.trim()

const UPSERT = `
  INSERT INTO ${TABLE} (key, window_start, count, updated_at)
  VALUES (?, ?, 1, ?)
  ON CONFLICT(key) DO UPDATE SET
    count = CASE
      WHEN ${TABLE}.window_start = excluded.window_start
      THEN ${TABLE}.count + 1
      ELSE 1
    END,
    window_start = excluded.window_start,
    updated_at = excluded.updated_at
`.trim()

const SELECT = `SELECT count FROM ${TABLE} WHERE key = ?`
const DELETE_USER = `DELETE FROM ${TABLE} WHERE key = ?`
const DECREMENT_IP = `
  UPDATE ${TABLE}
  SET count = CASE WHEN count > 0 THEN count - 1 ELSE 0 END,
      updated_at = ?
  WHERE key = ?
`.trim()
const CLEANUP = `DELETE FROM ${TABLE} WHERE updated_at < ?`

let schemaReady = false

/** @param {D1Database | undefined} db */
export async function ensureRateLimitSchema(db) {
  if (schemaReady) return
  if (!db) throw new Error('D1 binding missing')
  await db.prepare(SCHEMA).run()
  schemaReady = true
}

/**
 * @param {'ip' | 'user'} kind
 * @param {string} value
 */
export async function rateLimitKey(kind, value) {
  const raw = String(value || '').trim()
  const normalized = kind === 'user' ? raw.normalize('NFKC').toLowerCase() : raw.toLowerCase()
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${kind}:${normalized}`))
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0'))
  return `${kind}:${hex.join('')}`
}

/** @param {number} now @param {number} windowMs */
function windowStart(now, windowMs) {
  return Math.floor(now / windowMs) * windowMs
}

/**
 * Réserve une tentative dans les deux fenêtres et nettoie les anciennes
 * fenêtres dans le même batch D1.
 *
 * @param {D1Database} db
 * @param {{ ip: string; username: string; now?: number }} input
 * @returns {Promise<{ allowed: boolean; ipKey: string; userKey: string }>}
 */
export async function consumeRateLimit(db, { ip, username, now = Date.now() }) {
  if (!db) throw new Error('D1 binding missing')

  const [ipKey, userKey] = await Promise.all([
    rateLimitKey('ip', ip || 'unknown'),
    rateLimitKey('user', username || ''),
  ])

  const results = await db.batch([
    db.prepare(UPSERT).bind(ipKey, windowStart(now, RATE_LIMITS.ip.windowMs), now),
    db.prepare(SELECT).bind(ipKey),
    db.prepare(UPSERT).bind(userKey, windowStart(now, RATE_LIMITS.user.windowMs), now),
    db.prepare(SELECT).bind(userKey),
    db.prepare(CLEANUP).bind(now - RETENTION_MS),
  ])

  const ipCount = Number(results?.[1]?.results?.[0]?.count)
  const userCount = Number(results?.[3]?.results?.[0]?.count)
  if (!Number.isFinite(ipCount) || !Number.isFinite(userCount)) {
    throw new Error('Rate limit state unavailable')
  }

  return {
    allowed: ipCount <= RATE_LIMITS.ip.max && userCount <= RATE_LIMITS.user.max,
    ipKey,
    userKey,
  }
}

/**
 * Une connexion réussie ne doit pas laisser une réservation derrière elle.
 * L'identifiant est remis à zéro et l'IP récupère sa tentative.
 *
 * @param {D1Database} db
 * @param {{ ipKey: string; userKey: string }} input
 */
export async function refundRateLimit(db, { ipKey, userKey }) {
  if (!db) return
  await db.batch([
    db.prepare(DELETE_USER).bind(userKey),
    db.prepare(DECREMENT_IP).bind(Date.now(), ipKey),
  ])
}
