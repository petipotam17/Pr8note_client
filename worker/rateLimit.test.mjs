import assert from 'node:assert/strict'
import test from 'node:test'
import worker, { createWorker } from './index.js'
import {
  RATE_LIMITS,
  consumeRateLimit,
  rateLimitKey,
} from './rateLimit.js'

class FakeStatement {
  constructor(db, sql) {
    this.db = db
    this.sql = sql
    this.params = []
  }

  bind(...params) {
    this.params = params
    return this
  }

  async run() {
    return { success: true }
  }
}

class FakeD1 {
  constructor() {
    this.rows = new Map()
  }

  prepare(sql) {
    return new FakeStatement(this, sql)
  }

  async batch(statements) {
    return statements.map((statement) => {
      if (statement.sql.startsWith('INSERT INTO auth_rate_limits')) {
        const [key, windowStart, updatedAt] = statement.params
        const current = this.rows.get(key)
        if (!current || Number(current.window_start) !== Number(windowStart)) {
          this.rows.set(key, { count: 1, window_start: windowStart, updated_at: updatedAt })
        } else {
          current.count += 1
          current.updated_at = updatedAt
        }
        return { results: [] }
      }

      if (statement.sql.startsWith('SELECT count')) {
        const row = this.rows.get(statement.params[0])
        return { results: row ? [{ count: row.count }] : [] }
      }

      if (statement.sql.startsWith('DELETE FROM')) {
        if (statement.sql.includes('updated_at <')) {
          const cutoff = Number(statement.params[0])
          for (const [key, row] of this.rows) {
            if (Number(row.updated_at) < cutoff) this.rows.delete(key)
          }
        } else {
          this.rows.delete(statement.params[0])
        }
        return { results: [] }
      }

      if (statement.sql.startsWith('UPDATE auth_rate_limits')) {
        const row = this.rows.get(statement.params[1])
        if (row) {
          row.count = Math.max(0, row.count - 1)
          row.updated_at = statement.params[0]
        }
        return { results: [] }
      }

      return { results: [] }
    })
  }
}

class OverLimitD1 extends FakeD1 {
  async batch(statements) {
    return statements.map((statement) =>
      statement.sql.startsWith('SELECT count')
        ? { results: [{ count: 999 }] }
        : { results: [] },
    )
  }
}

class FailingD1 extends FakeD1 {
  async batch() {
    throw new Error('D1 exploded with internal details')
  }
}

function loginRequest() {
  return new Request('https://auth.example/api/monlycee/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://petipotam17.github.io',
      'CF-Connecting-IP': '203.0.113.7',
    },
    body: JSON.stringify({ username: 'student.one', password: 'secret' }),
  })
}

test('les clés stockées sont hachées et l’identifiant est normalisé', async () => {
  const ipKey = await rateLimitKey('ip', '203.0.113.7')
  assert.match(ipKey, /^ip:[0-9a-f]{64}$/)
  assert.equal(ipKey.includes('203.0.113.7'), false)

  const withSpaces = await rateLimitKey('user', '  Alice.Dupont  ')
  const lower = await rateLimitKey('user', 'alice.dupont')
  assert.equal(withSpaces, lower)
  assert.equal(withSpaces.includes('alice.dupont'), false)
})

test('la limite par IP bloque la 31e tentative de la fenêtre', async () => {
  const db = new FakeD1()
  const now = Date.UTC(2026, 0, 1, 12, 0, 0)

  for (let attempt = 0; attempt < RATE_LIMITS.ip.max; attempt += 1) {
    const result = await consumeRateLimit(db, {
      ip: '203.0.113.7',
      username: `student${attempt}`,
      now,
    })
    assert.equal(result.allowed, true)
  }

  const blocked = await consumeRateLimit(db, {
    ip: '203.0.113.7',
    username: 'student-last',
    now,
  })
  assert.equal(blocked.allowed, false)
})

test('la limite par identifiant bloque la 9e tentative, quel que soit le casing', async () => {
  const db = new FakeD1()
  const now = Date.UTC(2026, 0, 1, 12, 0, 0)

  for (let attempt = 0; attempt < RATE_LIMITS.user.max; attempt += 1) {
    const result = await consumeRateLimit(db, {
      ip: `198.51.100.${attempt + 1}`,
      username: 'Alice.Dupont',
      now,
    })
    assert.equal(result.allowed, true)
  }

  const blocked = await consumeRateLimit(db, {
    ip: '198.51.100.200',
    username: ' alice.dupont ',
    now,
  })
  assert.equal(blocked.allowed, false)
})

test('une connexion réussie renvoie l’élève et rembourse la réservation', async () => {
  const db = new FakeD1()
  let received

  const app = createWorker(async (username, password) => {
    received = { username, password }
    return {
      student: { firstName: 'Bob', lastName: 'Dupont', className: '2nde A' },
      verifiedAt: '2026-11-24T12:00:00.000Z',
    }
  })

  const response = await app.fetch(loginRequest(), { DB: db })
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.student.firstName, 'Bob')
  assert.deepEqual(received, { username: 'student.one', password: 'secret' })

  const ipKey = await rateLimitKey('ip', '203.0.113.7')
  const userKey = await rateLimitKey('user', 'student.one')
  assert.equal(db.rows.get(ipKey)?.count, 0)
  assert.equal(db.rows.has(userKey), false)
})

test('un refus de limite est générique et ne révèle ni IP ni identifiant', async () => {
  const response = await worker.fetch(loginRequest(), { DB: new OverLimitD1() })
  assert.equal(response.status, 429)
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://petipotam17.github.io')
  // Valeur fixe : elle ne doit pas indiquer si c'est l'IP ou l'identifiant qui bloque.
  assert.equal(response.headers.get('retry-after'), '900')

  const body = await response.json()
  assert.equal(body.error, 'RATE_LIMITED')
  assert.match(body.message, /Trop de tentatives de connexion/)
  const serialized = JSON.stringify(body)
  for (const secret of ['student.one', '203.0.113.7', 'ip:', 'user:', 'auth_rate_limits']) {
    assert.equal(serialized.includes(secret), false, `la réponse ne doit pas contenir ${secret}`)
  }
})

test('une panne de la base renvoie une erreur générique et ne tente pas MonLycée', async () => {
  const originalError = console.error
  console.error = () => {}
  try {
    const response = await worker.fetch(loginRequest(), { DB: new FailingD1() })
    assert.equal(response.status, 503)
    const body = await response.json()
    assert.equal(body.error, 'AUTH_UNAVAILABLE')
    assert.match(body.message, /momentanément indisponible/)
    assert.equal(JSON.stringify(body).includes('D1 exploded'), false)
  } finally {
    console.error = originalError
  }
})
