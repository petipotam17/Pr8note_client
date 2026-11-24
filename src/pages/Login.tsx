import { useRef, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  GraduationCap,
  Info,
  KeyRound,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Upload,
} from 'lucide-react'
import { STUDENT } from '../data/seed'
import { useStore } from '../lib/store'
import { Badge } from '../components/ui'
import { LogoMark, Wordmark } from '../components/Logo'
import {
  EDUC_CONNECT_LOGIN_URL,
  MONLYCEE_LOGIN_URL,
  authErrorMessage,
  beginOidcLogin,
  isWebAuthAvailable,
  loadOidcConfig,
} from '../lib/auth'

export function Login() {
  const { signIn, importData, toast } = useStore()
  const [starting, setStarting] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const oidcConfigured = Boolean(loadOidcConfig())
  const webAuth = isWebAuthAvailable()
  const oidcReady = oidcConfigured && webAuth

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      await importData(file)
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Import impossible.', 'error')
    } finally {
      event.target.value = ''
    }
  }

  const handleOidc = async () => {
    if (starting) return
    setStarting(true)
    try {
      await beginOidcLogin()
    } catch (error) {
      toast(authErrorMessage(error), 'error')
      setStarting(false)
    }
  }

  return (
    <div className="login">
      <section className="login-art">
        <div className="login-art-glow glow-a" />
        <div className="login-art-glow glow-b" />

        <div className="login-brand">
          <LogoMark size={38} />
          <Wordmark />
        </div>

        <div className="login-copy">
          <Badge tone="accent">
            <Sparkles size={13} /> Nouvelle génération
          </Badge>
          <h1>
            La scolarité,
            <br />
            <span className="grad-text">en plus fluide.</span>
          </h1>
          <p>
            Ton emploi du temps, tes notes, tes devoirs et toute ta vie de lycéen. Réunis dans un espace
            clair, rapide et pensé pour toi.
          </p>

          <ul className="login-features">
            <li>
              <span className="login-feature-icon">
                <CalendarDays size={17} />
              </span>
              <div>
                <strong>Ta semaine, en un regard</strong>
                <span>Un planning lisible, des rappels intelligents.</span>
              </div>
            </li>
            <li>
              <span className="login-feature-icon">
                <TrendingUp size={17} />
              </span>
              <div>
                <strong>Des notes qui racontent ta progression</strong>
                <span>Moyennes, comparaison avec la classe, simulateur.</span>
              </div>
            </li>
            <li>
              <span className="login-feature-icon">
                <ShieldCheck size={17} />
              </span>
              <div>
                <strong>Une connexion chez ton ENT</strong>
                <span>MonLycée.net, ÉduConnect ou le portail de ton établissement.</span>
              </div>
            </li>
          </ul>
        </div>

        <div className="login-previews" aria-hidden="true">
          <div className="preview-card preview-grade">
            <span className="preview-label">Moyenne générale</span>
            <div className="preview-grade-row">
              <strong>15,9</strong>
              <Badge tone="good">+0,6</Badge>
            </div>
            <div className="preview-bar">
              <span style={{ width: '79%' }} />
            </div>
            <small>Trimestre 2 · 11 matières</small>
          </div>
          <div className="preview-card preview-lesson">
            <span className="preview-label">Prochain cours</span>
            <div className="preview-lesson-row">
              <span className="preview-dot" />
              <div>
                <strong>Mathématiques</strong>
                <span>08:00 · Salle B204</span>
              </div>
            </div>
            <div className="preview-pill">dans 42 min</div>
          </div>
          <div className="preview-card preview-done">
            <CheckCircle2 size={18} />
            <div>
              <strong>3 devoirs terminés</strong>
              <span>Ta journée est bien lancée.</span>
            </div>
          </div>
        </div>

        <footer className="login-art-foot">
          <span>Pr8note · client indépendant</span>
          <span>Pensé pour les élèves</span>
        </footer>
      </section>

      <section className="login-panel">
        <div className="login-mobile-brand">
          <LogoMark size={34} />
          <Wordmark />
        </div>

        <div className="login-card">
          <Badge tone="accent" className="login-badge">
            <ShieldCheck size={13} /> Connexion scolaire
          </Badge>

          <h2>Bienvenue dans Pr8note.</h2>
          <p className="login-sub">
            Connecte-toi avec ton établissement pour retrouver ton espace. Pr8note ne voit jamais ton mot
            de passe.
          </p>

          <div className="login-provider">
            <div className="login-provider-top">
              <span className="login-provider-mark">ML</span>
              <div className="login-provider-copy">
                <strong>MonLycée.net</strong>
                <span>Portail officiel · Île-de-France</span>
              </div>
              <Badge tone="accent">Principal</Badge>
            </div>

            {oidcReady ? (
              <button
                type="button"
                className="btn btn-primary btn-block btn-lg"
                onClick={handleOidc}
                disabled={starting}
              >
                {starting ? <Loader2 size={17} className="spin" /> : <LockKeyhole size={17} />}
                {starting ? 'Ouverture du portail…' : 'Continuer avec MonLycée.net'}
              </button>
            ) : (
              <Link className="btn btn-primary btn-block btn-lg" to="/connexion">
                <KeyRound size={17} />
                Configurer la connexion MonLycée
              </Link>
            )}

            <p className="login-provider-destination">
              <ExternalLink size={11} />
              {oidcReady
                ? 'Connexion sécurisée via le portail MonLycée.net'
                : 'Le portail s’ouvre sans retour automatique'}
            </p>
          </div>

          <div className="login-provider-alt">
            <a className="btn btn-outline" href={EDUC_CONNECT_LOGIN_URL}>
              <ExternalLink size={14} /> ÉduConnect
            </a>
            <Link className="btn btn-outline" to="/connexion">
              <Building2 size={14} /> Autre ENT
            </Link>
          </div>

          {oidcConfigured && !webAuth ? (
            <div className="login-auth-note">
              <Info size={15} />
              <p>
                La connexion OIDC active est disponible dans la version web. Depuis l’app macOS, le
                portail s’ouvre dans ton navigateur.{' '}
                <a href={MONLYCEE_LOGIN_URL}>Ouvrir le portail</a>
              </p>
            </div>
          ) : oidcReady ? (
            <div className="login-auth-note ok">
              <ShieldCheck size={15} />
              <p>Connexion OIDC active : ton identité sera vérifiée par MonLycée.net.</p>
            </div>
          ) : (
            <div className="login-auth-note">
              <Info size={15} />
              <p>
                MonLycée.net ne peut pas encore renvoyer ta session : un client OIDC doit être autorisé
                par ton ENT.{' '}
                <Link to="/connexion">Configurer</Link>
                {' · '}
                <a href={MONLYCEE_LOGIN_URL}>Ouvrir le portail sans retour</a>
              </p>
            </div>
          )}

          <div className="login-divider">
            <span>ou explorer</span>
          </div>

          <button type="button" className="btn btn-ghost btn-block" onClick={() => signIn(STUDENT)}>
            <ArrowRight size={16} />
            Ouvrir la démonstration
          </button>

          <button type="button" className="btn btn-ghost btn-block" onClick={() => fileInput.current?.click()}>
            <Upload size={16} />
            Importer une sauvegarde
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            onChange={handleImport}
            hidden
          />

          <div className="login-meta">
            <span>
              <ShieldCheck size={14} /> Aucun mot de passe stocké par Pr8note
            </span>
            <span>
              <GraduationCap size={14} /> Notes et planning de démonstration
            </span>
          </div>

          <p className="login-fineprint">
            Pr8note est un client indépendant, sans affiliation avec Index Éducation ni PRONOTE.
          </p>
        </div>
      </section>
    </div>
  )
}
