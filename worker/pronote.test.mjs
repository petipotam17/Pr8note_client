import assert from 'node:assert/strict'
import test from 'node:test'
import { createCipheriv, createDecipheriv, createHash } from 'node:crypto'
import { deflateRawSync, inflateRawSync } from 'node:zlib'
import {
  fetchSchoolData,
  md5Hex,
  normalizePronoteUrl,
  parseStartAttributes,
  PronoteError,
} from './pronote.js'

/* ------------------------------------------------------------------ */
/* Petit serveur PRONOTE de test                                      */
/* ------------------------------------------------------------------ */

const md5Buffer = (value) => createHash('md5').update(value).digest()
const sha256Hex = (value) => createHash('sha256').update(value).digest('hex').toUpperCase()

// Les clés passées ici sont déjà des digests MD5 de 16 octets.
function encrypt(key, iv, data) {
  const cipher = createCipheriv('aes-128-cbc', key, iv)
  return Buffer.concat([cipher.update(data), cipher.final()])
}

function decrypt(key, iv, data) {
  const decipher = createDecipheriv('aes-128-cbc', key, iv)
  return Buffer.concat([decipher.update(data), decipher.final()])
}

function hex(value) {
  return Buffer.from(value, 'utf8').toString('hex')
}

function compressRequest(json) {
  return deflateRawSync(Buffer.from(hex(json), 'utf8'))
}

function decompressResponse(json) {
  return deflateRawSync(Buffer.from(json, 'utf8'))
}

function createFakePronote(options = {}) {
  const loginKey = md5Buffer(sha256Hex('secret-ent'))
  // Chaîne non hexadécimale : force le mode « challenge brut » des serveurs 2026.
  const challengePlain = options.challengeMode === 'legacy' ? 'challenge-2024' : 'challenge-2026'
  const cleValues = Array.from({ length: 32 }, (_, index) => 10 + index)
  const cleText = cleValues.join(',')

  let sessionIv = Buffer.alloc(16)
  let sessionKey = md5Buffer('')
  let expectedOrder = 1
  let firstRequest = true
  let authenticated = false

  const label = (date) =>
    `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`
  const midnight = new Date()
  midnight.setHours(0, 0, 0, 0)
  const shifted = (days) => {
    const date = new Date(midnight)
    date.setDate(date.getDate() + days)
    return label(date)
  }
  const firstMonday = new Date(midnight)
  firstMonday.setDate(firstMonday.getDate() - ((firstMonday.getDay() + 6) % 7) - 56)

  const weekNumber = (() => {
    const diff = Math.floor((Date.now() - firstMonday.getTime()) / 86_400_000)
    return 1 + Math.floor(diff / 7)
  })()

  // Trois trimestres autour d'aujourd'hui : le trimestre 2 est toujours la
  // période courante, et chaque trimestre a ses propres notes.
  const periods = {
    data: {
      General: {
        PremierLundi: { V: label(firstMonday) },
        versionPN: '2025.2.0',
        ListePeriodes: [
          {
            N: 'p1',
            L: 'Trimestre 1',
            dateDebut: { V: shifted(-100) },
            dateFin: { V: shifted(-31) },
          },
          {
            N: 'p2',
            L: 'Trimestre 2',
            dateDebut: { V: shifted(-30) },
            dateFin: { V: shifted(30) },
          },
          {
            N: 'p3',
            L: 'Trimestre 3',
            dateDebut: { V: shifted(31) },
            dateFin: { V: shifted(120) },
          },
        ],
      },
      identifiantNav: 'nav-test',
    },
  }

  const parameters = {
    data: {
      ressource: {
        N: 'eleve-1',
        L: 'Élève Test',
        classeDEleve: { L: 'Première 4' },
        Etablissement: { V: { L: 'Lycée de Test' } },
      },
      listeOnglets: [{ G: 198 }, { G: 16 }, { G: 88 }, { G: 19 }, { G: 131 }],
      listeOngletsPourPeriodes: [],
    },
  }

  // Les moyennes de matière diffèrent volontairement de la note listée pour
  // vérifier que le client affiche la moyenne officielle PRONOTE.
  const periodGrades = {
    'Trimestre 1': { note: '9,5', coefficient: '1', classAverage: '11,5', subjectAverage: '10,2' },
    'Trimestre 2': { note: '15,5', coefficient: '2', classAverage: '12,5', subjectAverage: '15,5' },
    'Trimestre 3': { note: '18', coefficient: '3', classAverage: '13,5', subjectAverage: '17,2' },
  }

  const gradesFor = (periodName) => {
    const periodGrade = periodGrades[periodName] ?? periodGrades['Trimestre 2']
    return {
      data: {
        listeDevoirs: {
          V: [
            {
              N: `g-${periodName}`,
              note: { V: periodGrade.note },
              bareme: { V: '20' },
              coefficient: periodGrade.coefficient,
              date: { V: '10/11/2026' },
              service: { N: 'm1', L: 'Mathématiques' },
              moyenne: { V: periodGrade.classAverage },
              commentaire: `DS ${periodName}`,
            },
          ],
        },
        listeServices: {
          V: [
            {
              N: 'm1',
              L: 'Mathématiques',
              moyEleve: { V: periodGrade.subjectAverage },
              moyClasse: { V: periodGrade.classAverage },
              baremeMoyEleve: { V: '20' },
              coefficient: '4',
            },
          ],
        },
        moyGenerale: { V: periodGrade.subjectAverage },
        moyGeneraleClasse: { V: periodGrade.classAverage },
      },
    }
  }

  const today = new Date()
  const todayLabel = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`
  const lesson = {
    N: 'cours-1',
    DateDuCours: { V: `${todayLabel} 08:00:00` },
    DateDuCoursFin: { V: `${todayLabel} 09:55:00` },
    estat: '',
    duree: 2,
    ListeContenus: {
      V: [
        { G: 16, N: 'm1', L: 'Mathématiques' },
        { G: 3, L: 'Mme Test' },
        { G: 17, L: 'B204' },
      ],
    },
  }

  const responses = {
    FonctionParametres: periods,
    ParametresUtilisateur: parameters,
    DernieresNotes: null,
    PageEmploiDuTemps: { data: { ListeCours: [lesson] } },
    PageCahierDeTexte: {
      data: {
        ListeTravauxAFaire: {
          V: [
            {
              N: 'hw-1',
              Matiere: { N: 'm1', L: 'Mathématiques' },
              descriptif: { V: '<p>Exercices 1 à 3</p>' },
              PourLe: { V: '26/11/2026' },
              TAFFait: false,
              duree: 30,
            },
          ],
        },
      },
    },
    PagePresence: {
      data: {
        listeAbsences: {
          V: [
            {
              G: 13,
              N: 'abs-1',
              dateDebut: { V: '20/11/2026 08:00:00' },
              dateFin: { V: '20/11/2026 10:00:00' },
              justifie: false,
              NbrHeures: '2h00',
              listeMotifs: { V: [{ L: 'Maladie' }] },
            },
            {
              G: 14,
              N: 'ret-1',
              date: { V: '18/11/2026 08:10:00' },
              duree: 10,
              justifie: true,
              justification: 'Transports',
              listeMotifs: { V: [{ L: 'Transports' }] },
            },
          ],
        },
      },
    },
    ListeMessagerie: {
      data: {
        listeMessagerie: {
          V: [
            {
              N: 'd-1',
              objet: 'Sortie pédagogique',
              initiateur: 'Mme Test',
              nbNonLus: 1,
              ferme: false,
              profondeur: 0,
              estUneDiscussion: true,
              listePossessionsMessages: { V: [{ N: 'pos-1' }] },
            },
          ],
        },
      },
    },
    ListeMessages: {
      data: {
        listeMessages: {
          V: [
            {
              N: 'msg-1',
              emetteur: false,
              public_gauche: 'Mme Test',
              contenu: { V: 'Pensez au formulaire.' },
              date: { V: '22/11/2026 10:00:00' },
              lu: true,
            },
            {
              N: 'msg-2',
              emetteur: true,
              contenu: { V: 'C’est noté, merci.' },
              date: { V: '22/11/2026 10:05:00' },
              lu: true,
            },
          ],
        },
      },
    },
    PageActualites: {
      data: {
        listeModesAff: [
          {
            listeActualites: {
              V: [
                {
                  N: 'news-1',
                  L: 'Forum des métiers',
                  auteur: 'La direction',
                  dateCreation: { V: '21/11/2026 09:00:00' },
                  nature: 'Orientation',
                  lue: false,
                },
              ],
            },
          },
        ],
      },
    },
  }

  const startPage = `<!doctype html><html><body onload="try { Start ({h:'4242',CrA:true,CoA:true,a:6,e:'eleve.demo',f:'secret-ent'}) } catch (e) { messageErreur (e) }">
        <span>PRONOTE 2025.2.0</span></body></html>`
  const htmlPage = (body, status = 200) =>
    new Response(body, { status, headers: { 'Content-Type': 'text/html' } })

  const log = []
  const loginPageHtml =
    '<!doctype html><html><body><form method="post" action="/realms/login">' +
    '<input type="hidden" name="execution" value="jeton-ent">' +
    '<input name="username" type="text"><input name="password" type="password">' +
    '</form></body></html>'

  const fetchImpl = async (input, init = {}) => {
    const url = new URL(input)
    log.push({
      url: url.toString(),
      method: String(init.method || 'GET').toUpperCase(),
      body: String(init.body ?? ''),
    })

    // ENT MonLycée (Keycloak) : PRONOTE délègue l'authentification ici.
    if (url.hostname === 'psn.monlycee.net') {
      if (options.entry !== 'ent-login') return new Response('', { status: 404 })
      if (url.pathname === '/realms/auth') return htmlPage(loginPageHtml)
      if (url.pathname === '/realms/login') {
        assert.equal(init.method, 'POST')
        const body = new URLSearchParams(String(init.body))
        if (body.get('username') !== 'eleve.demo' || body.get('password') !== 'mot-de-passe-ent') {
          return htmlPage(loginPageHtml)
        }
        assert.equal(body.get('execution'), 'jeton-ent')
        return htmlPage(
          '<!doctype html><html><head><meta http-equiv="refresh" content="0; url=https://lycee.index-education.net/pronote/eleve.html?ent=ok"></head></html>',
        )
      }
      return new Response('', { status: 404 })
    }

    if (url.pathname.endsWith('eleve.html')) {
      if (options.entry === 'ent-login' && !url.searchParams.has('ent')) {
        return new Response(null, {
          status: 302,
          headers: { Location: 'https://psn.monlycee.net/realms/auth?service=pronote' },
        })
      }
      if (options.entry === 'alias' && url.hostname.startsWith('lycee.')) {
        return new Response(null, {
          status: 302,
          headers: { Location: 'https://www.index-education.net/pronote/eleve.html?alias=1' },
        })
      }
      if (options.access === 'forbidden') {
        return new Response('Accès refusé', { status: 403 })
      }
      if (options.access === 'login') {
        return htmlPage(
          '<!doctype html><html><body><form><label>Identifiant</label><input type="password"></form></body></html>',
        )
      }
      if (options.access === 'page') {
        return htmlPage(
          '<!doctype html><html><head><title>PRONOTE</title></head><body>Service momentanément indisponible.</body></html>',
        )
      }
      // Deux entrées d'ENT : redirection JavaScript puis formulaire SSO
      // auto-posté, avant d'atteindre la page de l'Espace élève.
      if (options.entry === 'meta' && !url.searchParams.has('step')) {
        return htmlPage(
          '<!doctype html><html><head><meta http-equiv="refresh" content="0; url=eleve.html?step=1"></head></html>',
        )
      }
      if (options.entry === 'sso' && !url.searchParams.has('sso')) {
        return htmlPage(
          '<!doctype html><html><body><form method="post" action="/pronote/sso"><input type="hidden" name="SAMLResponse" value="jeton-test"></form></body></html>',
        )
      }
      return htmlPage(startPage)
    }

    if (url.pathname.endsWith('/sso')) {
      assert.equal(init.method, 'POST')
      assert.equal(String(init.body), 'SAMLResponse=jeton-test')
      return htmlPage(startPage)
    }

    // Autres chemins (racine /pronote/) : page neutre sans bloc Start.
    if (init.method !== 'POST') {
      return htmlPage('<!doctype html><html><body>Accueil PRONOTE</body></html>')
    }

    assert.equal(init.method, 'POST')
    const envelope = JSON.parse(init.body)
    assert.equal(envelope.session, 4242)
    assert.equal(envelope.id !== undefined, true, 'nouvelle enveloppe attendue')

    const requestIv = firstRequest ? Buffer.alloc(16) : sessionIv
    const order = decrypt(sessionKey, requestIv, Buffer.from(envelope.no, 'hex')).toString()
    assert.equal(Number(order), expectedOrder, 'numéro d’ordre PRONOTE')
    expectedOrder += 2

    const clear = inflateRawSync(
      decrypt(sessionKey, requestIv, Buffer.from(envelope.dataSec, 'hex')),
    ).toString('utf8')
    const payload = JSON.parse(Buffer.from(clear, 'hex').toString('utf8'))

    if (firstRequest) {
      sessionIv = md5Buffer(Buffer.from(payload.data.Uuid, 'base64'))
      firstRequest = false
    }

    let responsePayload
    if (envelope.id === 'FonctionParametres') {
      responsePayload = responses.FonctionParametres
    } else if (envelope.id === 'Identification') {
      assert.equal(payload.data.identifiant, 'eleve.demo')
      assert.equal(payload.data.pourENT, true)
      // Les serveurs actuels renvoient un challenge brut, que le client
      // ré-chiffre directement. Les anciens l'envoient chiffré et entrelacé
      // avec des caractères aléatoires, à déchiffrer puis désentrelacer.
      const challenge =
        options.challengeMode === 'legacy'
          ? encrypt(
              loginKey,
              sessionIv,
              Buffer.from(
                Array.from(challengePlain)
                  .map((character) => `${character}x`)
                  .join(''),
                'utf8',
              ),
            ).toString('hex')
          : challengePlain
      responsePayload = {
        data: { challenge, modeCompLog: 0, modeCompMdp: 0 },
      }
    } else if (envelope.id === 'Authentification') {
      const answer = decrypt(
        loginKey,
        sessionIv,
        Buffer.from(payload.data.challenge, 'hex'),
      ).toString()
      assert.equal(answer, challengePlain)
      const cle = encrypt(loginKey, sessionIv, Buffer.from(cleText, 'utf8')).toString('hex')
      responsePayload = { data: { cle } }
      authenticated = true
    } else {
      assert.equal(authenticated, true)
      if (envelope.id === 'DernieresNotes') {
        responsePayload = gradesFor(payload.data.Periode.L)
      } else if (envelope.id === 'PageEmploiDuTemps') {
        responsePayload =
          payload.data.numeroSemaine === weekNumber
            ? responses.PageEmploiDuTemps
            : { data: { ListeCours: [] } }
      } else {
        responsePayload = responses[envelope.id]
      }
    }

    const compressed = decompressResponse(JSON.stringify(responsePayload))
    const encrypted = encrypt(sessionKey, sessionIv, compressed).toString('hex').toUpperCase()
    if (envelope.id === 'Authentification') sessionKey = md5Buffer(Buffer.from(cleValues))
    return new Response(JSON.stringify({ dataSec: encrypted }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return { fetchImpl, log }
}

const jar = {
  headerFor: () => '',
  absorb: () => {},
  allowHost: () => {},
}

/* ------------------------------------------------------------------ */
/* Tests                                                              */
/* ------------------------------------------------------------------ */

test('MD5 et numéro d’ordre PRONOTE correspondent aux valeurs connues', () => {
  assert.equal(md5Hex(''), 'd41d8cd98f00b204e9800998ecf8427e')
  assert.equal(md5Hex('abc'), '900150983cd24fb0d6963f7d28e17f72')
})

test('l’adresse PRONOTE est normalisée et les hôtes locaux refusés', () => {
  assert.equal(
    normalizePronoteUrl('0751234A.index-education.net/pronote/'),
    'https://0751234a.index-education.net/pronote/eleve.html',
  )
  // L'élève peut coller le domaine de son lycée, une page personnalisée ou
  // un lien signé : l'adresse est conservée telle quelle.
  assert.equal(
    normalizePronoteUrl('https://pronote.monlycee.net'),
    'https://pronote.monlycee.net/',
  )
  assert.equal(
    normalizePronoteUrl('https://lycee.fr/espaces/eleves'),
    'https://lycee.fr/espaces/eleves',
  )
  assert.equal(
    normalizePronoteUrl('https://lycee.fr/pronote/eleve.html?sso=jeton'),
    'https://lycee.fr/pronote/eleve.html?sso=jeton',
  )
  assert.equal(
    normalizePronoteUrl('http://lycee.fr/pronote/'),
    'https://lycee.fr/pronote/eleve.html',
  )
  assert.equal(normalizePronoteUrl('http://127.0.0.1/pronote/'), null)
  assert.equal(normalizePronoteUrl('https://localhost/pronote/'), null)
})

test('les attributs Start sont lus dans la page PRONOTE', () => {
  const attributes = parseStartAttributes(
    "<body onload=\"try { Start ({h:'4242',CrA:true,CoA:true,a:6,e:'e',f:'f'}) } catch (e) {}\">",
  )
  assert.equal(attributes?.h, '4242')
  assert.equal(attributes?.e, 'e')
  assert.equal(attributes?.CrA, 'true')
})

test('une session PRONOTE réelle est lue et normalisée', async () => {
  const fake = createFakePronote()
  const school = await fetchSchoolData({
    url: 'https://lycee.index-education.net/pronote/eleve.html',
    jar,
    fetchImpl: fake.fetchImpl,
  })

  assert.equal(school.source, 'pronote')
  assert.equal(school.currentPeriodId, 'T2')
  assert.equal(school.generalAverage, 15.5)
  assert.equal(school.classGeneralAverage, 12.5)

  const maths = school.subjects.find((subject) => subject.id === 'm1')
  assert.ok(maths)
  assert.equal(maths.teacher, 'Mme Test')
  assert.equal(maths.coef, 4)

  // Une note listée par période, et la moyenne officielle de matière de
  // chaque période : l'onglet Notes doit pouvoir basculer sans perdre T1.
  assert.equal(school.periods.length, 3)
  assert.equal(school.grades.length, 3)
  const firstTrimester = school.grades.find((grade) => grade.period === 'T1')
  const secondTrimester = school.grades.find((grade) => grade.period === 'T2')
  assert.equal(firstTrimester?.value, 9.5)
  assert.equal(firstTrimester?.classAvg, 11.5)
  assert.equal(secondTrimester?.value, 15.5)
  assert.equal(secondTrimester?.outOf, 20)
  assert.equal(secondTrimester?.classAvg, 12.5)

  assert.equal(school.averages.length, 3)
  assert.equal(school.averages.find((average) => average.period === 'T1')?.student, 10.2)
  assert.equal(school.averages.find((average) => average.period === 'T2')?.student, 15.5)
  assert.equal(school.averages.find((average) => average.period === 'T3')?.student, 17.2)

  assert.ok(school.lessons.length >= 1)
  const lesson = school.lessons[0]
  const now = new Date()
  const expectedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  assert.equal(lesson.date, expectedDate)
  assert.equal(lesson.start, '08:00')
  assert.equal(lesson.end, '09:55')
  assert.equal(lesson.room, 'B204')

  assert.equal(school.homework.length, 1)
  assert.equal(school.homework[0].title, 'Exercices 1 à 3')
  assert.equal(school.homework[0].due, '2026-11-26')

  const absence = school.lifeEvents.find((event) => event.type === 'absence')
  assert.equal(absence?.durationHours, 2)
  assert.equal(absence?.justified, false)

  assert.equal(school.threads.length, 1)
  assert.equal(school.threads[0].subject, 'Sortie pédagogique')
  assert.equal(school.threads[0].unread, true)
  assert.equal(school.threads[0].body[0], 'Pensez au formulaire.')
  assert.equal(school.threads[0].replies[0].body, 'C’est noté, merci.')

  assert.equal(school.news.length, 1)
  assert.equal(school.news[0].title, 'Forum des métiers')
  assert.equal(school.student.className, 'Première 4')
})

test('une adresse PRONOTE absente est refusée avant toute requête', async () => {
  let requested = false
  await assert.rejects(
    () =>
      fetchSchoolData({
        url: '   ',
        jar,
        fetchImpl: async () => {
          requested = true
          return new Response('', { status: 200 })
        },
      }),
    (error) => error instanceof PronoteError && error.code === 'PRONOTE_URL',
  )
  assert.equal(requested, false)
})

test('un refus d’accès PRONOTE remonte une erreur générique', async () => {
  const forbidden = createFakePronote({ access: 'forbidden' })
  await assert.rejects(
    () =>
      fetchSchoolData({
        url: 'https://lycee.index-education.net/pronote/eleve.html',
        jar,
        fetchImpl: forbidden.fetchImpl,
      }),
    (error) =>
      error instanceof PronoteError &&
      error.code === 'PRONOTE_ACCESS' &&
      !/403|index-education|secret-ent/i.test(error.message),
  )

  // Page de connexion PRONOTE au lieu de l'Espace élève : même refus d'accès.
  const loginPage = createFakePronote({ access: 'login' })
  await assert.rejects(
    () =>
      fetchSchoolData({
        url: 'https://lycee.index-education.net/pronote/eleve.html',
        jar,
        fetchImpl: loginPage.fetchImpl,
      }),
    (error) => error instanceof PronoteError && error.code === 'PRONOTE_ACCESS',
  )
})

test('l’ancien format de challenge PRONOTE reste accepté', async () => {
  const fake = createFakePronote({ challengeMode: 'legacy' })
  const school = await fetchSchoolData({
    url: 'https://lycee.index-education.net/pronote/eleve.html',
    jar,
    fetchImpl: fake.fetchImpl,
  })
  assert.equal(school.currentPeriodId, 'T2')
  assert.equal(school.generalAverage, 15.5)
  assert.equal(school.grades.length, 3)
})

test('une page d’entrée avec redirection JavaScript ouvre quand même la session', async () => {
  const fake = createFakePronote({ entry: 'meta' })
  const school = await fetchSchoolData({
    url: 'https://lycee.index-education.net/pronote/eleve.html',
    jar,
    fetchImpl: fake.fetchImpl,
  })
  assert.equal(school.currentPeriodId, 'T2')
  assert.equal(school.averages.length, 3)
})

test('un formulaire SSO auto-posté par l’ENT ramène à PRONOTE', async () => {
  const fake = createFakePronote({ entry: 'sso' })
  const school = await fetchSchoolData({
    url: 'https://lycee.index-education.net/pronote/eleve.html',
    jar,
    fetchImpl: fake.fetchImpl,
  })
  assert.equal(school.grades.length, 3)
  assert.equal(school.student.className, 'Première 4')
})

test('une connexion ENT redemandée à l’ouverture de PRONOTE est rejouée', async () => {
  const fake = createFakePronote({ entry: 'ent-login' })
  const school = await fetchSchoolData({
    url: 'https://lycee.index-education.net/pronote/eleve.html',
    jar,
    fetchImpl: fake.fetchImpl,
    credentials: { username: 'eleve.demo', password: 'mot-de-passe-ent' },
  })

  assert.equal(school.currentPeriodId, 'T2')
  assert.equal(school.generalAverage, 15.5)

  const login = fake.log.find((entry) => entry.url.includes('/realms/login'))
  assert.ok(login, 'le formulaire de l’ENT doit être soumis')
  assert.equal(login.method, 'POST')
  assert.ok(login.body.includes('username=eleve.demo'))
  // Le mot de passe ne doit jamais apparaître dans une URL ni dans un message.
  assert.ok(fake.log.every((entry) => !entry.url.includes('mot-de-passe-ent')))
})

test('sans identifiants, la connexion redemandée par l’ENT reste un refus explicite', async () => {
  const fake = createFakePronote({ entry: 'ent-login' })
  await assert.rejects(
    () =>
      fetchSchoolData({
        url: 'https://lycee.index-education.net/pronote/eleve.html',
        jar,
        fetchImpl: fake.fetchImpl,
      }),
    (error) =>
      error instanceof PronoteError &&
      error.code === 'PRONOTE_ACCESS' &&
      !/mot-de-passe-ent|psn\.monlycee/i.test(error.message),
  )
})

test('une redirection vers un alias PRONOTE du même domaine est suivie', async () => {
  const fake = createFakePronote({ entry: 'alias' })
  const school = await fetchSchoolData({
    url: 'https://lycee.index-education.net/pronote/eleve.html',
    jar,
    fetchImpl: fake.fetchImpl,
  })
  assert.equal(school.generalAverage, 15.5)
  assert.ok(school.subjects.length >= 1)
})

test('une page sans bloc Start demande de vérifier l’adresse PRONOTE', async () => {
  const fake = createFakePronote({ access: 'page' })
  await assert.rejects(
    () =>
      fetchSchoolData({
        url: 'https://lycee.index-education.net/pronote/eleve.html',
        jar,
        fetchImpl: fake.fetchImpl,
      }),
    (error) =>
      error instanceof PronoteError &&
      error.code === 'PRONOTE_PAGE' &&
      /adresse PRONOTE/i.test(error.message) &&
      !/index-education|secret-ent/i.test(error.message),
  )
})

test('le bloc Start est lu même avec des accolades dans une valeur', () => {
  const attributes = parseStartAttributes(
    `<script>window.Start (\n { h: 4242, a: 6, e: 'eleve.demo', f: 'mot}de{passe', CrA: true }\n)</script>`,
  )
  assert.equal(attributes?.h, '4242')
  assert.equal(attributes?.a, '6')
  assert.equal(attributes?.f, 'mot}de{passe')
})
