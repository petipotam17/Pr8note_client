import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CookieJar,
  LoginError,
  loginToMonlycee,
  parseIdentityPayload,
  parseLoginForm,
  schoolFailure,
} from './index.js'

const START = 'https://psn.monlycee.net/oauth2/start?rd=https%3A%2F%2Fpsn.monlycee.net%2F'
const AUTH = 'https://auth.monlycee.net/realms/TWIDF/protocol/openid-connect/auth?client_id=psn-web-een'
const ACTION =
  'https://auth.monlycee.net/realms/TWIDF/login-actions/authenticate?session_code=abc&amp;execution=def&amp;client_id=psn-web-een&amp;tab_id=ghi'

function loginPage(error = '') {
  return `<!doctype html><html><body>
    <form id="kc-form-login" action="${ACTION}" method="post">
      <input name="username" />
      <input name="password" type="password" />
      <input type="hidden" id="id-hidden-input" name="credentialId" value="" />
      <input type="hidden" name="login" value="Se connecter" />
    </form>
    ${error ? `<div id="kc-error-message">${error}</div>` : ''}
  </body></html>`
}

function response(status, { location = '', cookies = [], body = '', type = 'text/html' } = {}) {
  const headers = new Headers({ 'Content-Type': type })
  if (location) headers.set('Location', location)
  for (const cookie of cookies) headers.append('Set-Cookie', cookie)
  return new Response(body, { status, headers })
}

function mockFetch({ invalid = false } = {}) {
  const calls = []
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init })
    if (String(url).startsWith(START)) {
      return response(302, {
        location: AUTH,
        cookies: ['_oauth2_proxy_csrf=csrf-1; Path=/; Domain=monlycee.net; Secure; HttpOnly'],
      })
    }
    if (String(url).startsWith(AUTH)) {
      return response(200, {
        body: loginPage(),
        cookies: [
          'AUTH_SESSION_ID=session-1; Path=/realms/TWIDF/; Secure; HttpOnly',
          'KC_RESTART=restart-1; Path=/realms/TWIDF/; Secure; HttpOnly',
        ],
      })
    }
    if (String(url).startsWith('https://auth.monlycee.net/realms/TWIDF/login-actions/authenticate')) {
      assert.equal(init.method, 'POST')
      assert.match(String(init.headers.get('Cookie')), /AUTH_SESSION_ID=session-1/)
      assert.match(String(init.body), /username=camille.durand/)
      assert.match(String(init.body), /password=secret/)
      if (invalid) {
        return response(200, { body: loginPage('Invalid username or password.') })
      }
      return response(302, {
        location: 'https://psn.monlycee.net/oauth2/callback?code=code-1&state=state-1',
        cookies: ['KEYCLOAK_IDENTITY=keycloak-1; Path=/realms/TWIDF/; Secure; HttpOnly'],
      })
    }
    if (String(url).startsWith('https://psn.monlycee.net/oauth2/callback')) {
      assert.doesNotMatch(String(init.headers.get('Cookie') || ''), /KEYCLOAK_IDENTITY/)
      return response(302, {
        location: 'https://psn.monlycee.net/',
        cookies: [
          '_oauth2_proxy_csrf=csrf-1; Path=/; Domain=monlycee.net; Secure; HttpOnly',
          '_oauth2_proxy=portal-session; Path=/; Domain=monlycee.net; Secure; HttpOnly',
        ],
      })
    }
    if (String(url) === 'https://psn.monlycee.net/') {
      assert.match(String(init.headers.get('Cookie')), /_oauth2_proxy=portal-session/)
      assert.doesNotMatch(String(init.headers.get('Cookie')), /AUTH_SESSION_ID/)
      return response(200, { body: '<html><body>MonLycée</body></html>' })
    }
    if (String(url) === 'https://psn.monlycee.net/oauth2/userinfo') {
      return response(200, {
        type: 'application/json',
        body: JSON.stringify({
          preferredUsername: 'camille.durand',
          given_name: 'Camille',
          family_name: 'Durand',
          email: 'camille.durand@example.fr',
          className: 'Terminale 4',
          establishment: 'Lycée Victor Hugo',
        }),
      })
    }
    throw new Error(`Unexpected fetch: ${url}`)
  }
  return { fetchImpl, calls }
}

test('parseLoginForm lit le formulaire Keycloak et décode l’action', () => {
  const form = parseLoginForm(loginPage(), AUTH)
  assert.ok(form)
  assert.equal(
    form.action,
    'https://auth.monlycee.net/realms/TWIDF/login-actions/authenticate?session_code=abc&execution=def&client_id=psn-web-een&tab_id=ghi',
  )
  assert.equal(form.fields.credentialId, '')
  assert.equal(form.fields.login, 'Se connecter')
  assert.equal(form.captcha, false)
})

test('le flux complet conserve les cookies et renvoie l’identité', async () => {
  const { fetchImpl, calls } = mockFetch()
  const result = await loginToMonlycee('camille.durand', 'secret', {
    fetchImpl,
    startUrl: START,
  })
  assert.equal(result.student.firstName, 'Camille')
  assert.equal(result.student.lastName, 'Durand')
  assert.equal(result.student.className, 'Terminale 4')
  assert.equal(result.student.establishment, 'Lycée Victor Hugo')
  assert.equal(result.student.authMethod, 'password')
  assert.equal(result.student.authLabel, 'MonLycée.net')
  assert.equal(result.student.subject, 'camille.durand')
  assert.ok(result.verifiedAt)
  assert.equal(calls.filter((call) => call.url.includes('/oauth2/userinfo')).length, 1)
})

test('un refus Keycloak devient une erreur générique sans détail sensible', async () => {
  const { fetchImpl } = mockFetch({ invalid: true })
  await assert.rejects(
    () => loginToMonlycee('camille.durand', 'secret', { fetchImpl, startUrl: START }),
    (error) => {
      assert.ok(error instanceof LoginError)
      assert.equal(error.code, 'INVALID_CREDENTIALS')
      assert.equal(error.status, 401)
      assert.doesNotMatch(error.message, /invalid username/i)
      return true
    },
  )
})

test('le cookie de session du portail n’est pas confondu avec le CSRF', () => {
  const jar = new CookieJar()
  jar.addCookieHeader('_oauth2_proxy_csrf=csrf; Path=/; Domain=monlycee.net', 'https://psn.monlycee.net/')
  assert.equal(jar.hasPortalSession(), false)
  jar.addCookieHeader('_oauth2_proxy=session; Path=/; Domain=monlycee.net', 'https://psn.monlycee.net/')
  assert.equal(jar.hasPortalSession(), true)
})

test('l’identité accepte une charge utile imbriquée', () => {
  const student = parseIdentityPayload(
    {
      data: {
        user: {
          givenName: 'Lina',
          familyName: 'Benali',
          division: 'Première 2',
          schoolName: 'Lycée Jean Moulin',
        },
      },
    },
    'lina.benali',
  )
  assert.equal(student.firstName, 'Lina')
  assert.equal(student.lastName, 'Benali')
  assert.equal(student.className, 'Première 2')
  assert.equal(student.establishment, 'Lycée Jean Moulin')
})

test('un échec inattendu porte aussi un code d’étape', () => {
  const failure = schoolFailure(new TypeError('boom at 10.0.0.1'), 2)
  assert.equal(failure.stage, 'E0')
  assert.match(failure.message, /· code E0/)
  assert.match(failure.message, /2 adresses essayées/)
  // Le détail technique ne doit jamais parvenir à l'élève.
  assert.doesNotMatch(failure.message, /boom|10\.0\.0\.1/)
})

test('un échec réseau sur la première adresse essaie la suivante', async () => {
  const base = mockFetch()
  const pronoteCalls = []
  const fetchImpl = async (url, init = {}) => {
    const target = String(url)
    if (target.includes('index-education.net')) {
      pronoteCalls.push(target)
      throw new TypeError('fetch failed')
    }
    if (target === 'https://psn.monlycee.net/') {
      return response(200, {
        body: `<html><body>
          <a href="https://0751234a.index-education.net/pronote/parent.html">PRONOTE</a>
          <span>0751234A</span>
        </body></html>`,
      })
    }
    return base.fetchImpl(url, init)
  }

  const result = await loginToMonlycee('camille.durand', 'secret', {
    fetchImpl,
    startUrl: START,
  })

  assert.equal(result.school, null)
  // L'hôte qui échoue ici est PRONOTE (pas le portail MonLycée) : E3-P…
  assert.match(result.schoolError.stage, /^E3-P[GP][1-5]/)
  assert.match(result.schoolError.message, / · code E3-P/)
  assert.match(result.schoolError.message, /2 adresses essayées/)
  assert.ok(
    pronoteCalls.length >= 2,
    `une seule adresse essayée : ${pronoteCalls.join(', ')}`,
  )
})

test('l’adresse fournie prime sur l’échec de l’adresse devinée', async () => {
  const base = mockFetch()
  const fetchImpl = async (url, init = {}) => {
    const target = String(url)
    if (target.includes('0782567s.index-education.net')) {
      // PRONOTE répond, mais demande sa propre connexion (E7).
      return new Response('<html><body>Veuillez saisir votre mot de passe</body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      })
    }
    if (target.includes('0751234a.index-education.net')) {
      const failure = new TypeError('fetch failed')
      failure.cause = { code: 'ENOTFOUND', message: 'DNS record not found' }
      throw failure
    }
    if (target === 'https://psn.monlycee.net/') {
      return response(200, {
        body: '<!doctype html><html><body>Établissement 0751234A</body></html>',
      })
    }
    return base.fetchImpl(url, init)
  }

  const result = await loginToMonlycee('camille.durand', 'secret', {
    fetchImpl,
    startUrl: START,
    pronoteUrl: 'https://0782567s.index-education.net/pronote/eleve.html',
  })

  assert.equal(result.school, null)
  // Sans ce correctif, l'échec DNS de l'adresse devinée écrasait le E7.
  assert.equal(result.schoolError.stage, 'E7')
  assert.doesNotMatch(result.schoolError.message, /E3-/)
  assert.match(result.schoolError.message, /2 adresses essayées/)
})

test('un domaine PRONOTE introuvable se distingue et demande l’adresse', async () => {
  const base = mockFetch()
  const fetchImpl = async (url, init = {}) => {
    const target = String(url)
    if (target.includes('index-education.net')) {
      const failure = new TypeError('fetch failed')
      // Forme renvoyée par le runtime quand le nom de domaine n'existe pas.
      failure.cause = { code: 'ENOTFOUND', message: 'DNS record not found' }
      throw failure
    }
    if (target === 'https://psn.monlycee.net/') {
      return response(200, {
        body: `<!doctype html><html><body>
          <a href="https://0751234a.index-education.net/pronote/eleve.html">PRONOTE</a>
        </body></html>`,
      })
    }
    return base.fetchImpl(url, init)
  }

  const result = await loginToMonlycee('camille.durand', 'secret', {
    fetchImpl,
    startUrl: START,
  })

  assert.equal(result.school, null)
  assert.equal(result.schoolError.stage, 'E3-D')
  assert.match(result.schoolError.message, / · code E3-D/)
  assert.match(result.schoolError.message, /Adresse PRONOTE de ton lycée/)
  // Ni hôte ni RNE ne doivent apparaître dans le message.
  assert.doesNotMatch(result.schoolError.message, /index-education|0751234/i)
})
