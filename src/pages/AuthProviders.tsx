import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Copy,
  ExternalLink,
  Info,
  KeyRound,
  Loader2,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import {
  AUTH_PROVIDERS,
  EDUC_CONNECT_LOGIN_URL,
  MONLYCEE_ISSUER,
  MONLYCEE_LOGIN_URL,
  MONLYCEE_NAME,
  authErrorMessage,
  beginOidcLogin,
  clearOidcConfig,
  fetchOidcDiscovery,
  getRedirectUri,
  isWebAuthAvailable,
  loadOidcConfig,
  saveOidcConfig,
  type OidcConfig,
} from '../lib/auth'
import { STUDENT } from '../data/seed'
import { useStore } from '../lib/store'
import { Badge } from '../components/ui'
import { LogoMark, Wordmark } from '../components/Logo'

type ServerStatus = { kind: 'ok' | 'error'; text: string } | null

export function AuthProviders() {
  const { state, signIn, toast } = useStore()
  const navigate = useNavigate()
  const [config, setConfig] = useState<OidcConfig | null>(() => loadOidcConfig())
  const [clientId, setClientId] = useState(() => loadOidcConfig()?.clientId ?? '')
  const [starting, setStarting] = useState(false)
  const [testing, setTesting] = useState(false)
  const [status, setStatus] = useState<ServerStatus>(null)
  const [customUrl, setCustomUrl] = useState('')
  const [customError, setCustomError] = useState('')

  const redirectUri = getRedirectUri()
  const webAuth = isWebAuthAvailable()
  const oidcReady = Boolean(config?.clientId) && webAuth
  const monlycee = AUTH_PROVIDERS.find((provider) => provider.id === 'monlycee')!
  const educonnect = AUTH_PROVIDERS.find((provider) => provider.id === 'educonnect')!

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

  const handleSave = () => {
    const trimmed = clientId.trim()
    if (!trimmed) {
      toast('Renseigne le client ID fourni par ton ENT.', 'error')
      return
    }
    saveOidcConfig({ clientId: trimmed, issuer: MONLYCEE_ISSUER, label: MONLYCEE_NAME })
    setConfig(loadOidcConfig())
    setStatus(null)
    toast('Configuration OIDC enregistrée sur cet appareil.', 'success')
  }

  const handleClear = () => {
    clearOidcConfig()
    setConfig(null)
    setClientId('')
    setStatus(null)
    toast('Configuration OIDC supprimée.', 'info')
  }

  const handleTest = async () => {
    setTesting(true)
    setStatus(null)
    try {
      const discovery = await fetchOidcDiscovery(MONLYCEE_ISSUER, true)
      setStatus({ kind: 'ok', text: `Serveur joignable : ${new URL(discovery.issuer).host}` })
    } catch (error) {
      setStatus({ kind: 'error', text: authErrorMessage(error) })
    } finally {
      setTesting(false)
    }
  }

  const copy = async (value: string, message: string) => {
    try {
      await navigator.clipboard.writeText(value)
      toast(message, 'success')
    } catch {
      toast('Copie impossible — sélectionne le texte manuellement.', 'error')
    }
  }

  const handleCustom = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    let candidate = customUrl.trim()
    if (!candidate) {
      setCustomError('Saisis l’adresse de ton ENT ou de ton établissement.')
      return
    }
    if (!/^https?:\/\//i.test(candidate)) candidate = `https://${candidate}`
    try {
      const url = new URL(candidate)
      if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('protocole')
      setCustomError('')
      window.location.assign(url.toString())
    } catch {
      setCustomError('Cette adresse n’est pas valide. Exemple : https://mon-ent.fr')
    }
  }

  const requestMessage = `Bonjour,

Je souhaite connecter Pr8note à mon ENT via OpenID Connect.
Merci de créer un client OIDC public (Authorization Code + PKCE, sans secret client) avec :

• URL de redirection : ${redirectUri}
• Origine web autorisée : ${window.location.origin}
• Scopes : openid profile email

Pr8note est un client scolaire indépendant, sans affiliation avec Index Éducation.
Merci d’avance.`

  return (
    <div className="auth-page">
      <div className="auth-page-glow auth-glow-a" />
      <div className="auth-page-glow auth-glow-b" />

      <header className="auth-page-header">
        <Link to="/" className="auth-brand" aria-label="Pr8note">
          <LogoMark size={34} />
          <Wordmark />
        </Link>
        <Link to="/" className="btn btn-ghost btn-sm">
          <ArrowLeft size={15} /> Retour
        </Link>
      </header>

      <main className="auth-main">
        {state.session && (
          <div className="auth-session">
            <ShieldCheck size={16} />
            <span>
              Connecté en tant que {state.session.firstName} {state.session.lastName} ·{' '}
              {state.session.authLabel ?? 'démonstration'}
            </span>
            <Link to="/">Retour à mon espace</Link>
          </div>
        )}

        <div className="auth-heading">
          <Badge tone="accent">
            <ShieldCheck size={13} /> Connexion officielle
          </Badge>
          <h1>Choisis ton fournisseur d’identité.</h1>
          <p>
            Pr8note t’envoie vers le portail officiel de ton établissement. Ton mot de passe ne transite
            jamais par l’application.
          </p>
        </div>

        <div className="auth-provider-grid">
          <article className="auth-provider-card auth-provider-featured">
            <div className="auth-provider-top">
              <span className="auth-provider-logo" style={{ background: `${monlycee.accent}22`, color: monlycee.accent }}>
                {monlycee.monogram}
              </span>
              <div className="auth-provider-title">
                <h2>{monlycee.name}</h2>
                <p>{monlycee.subtitle}</p>
              </div>
              <Badge tone="accent">{monlycee.badge}</Badge>
            </div>
            <p className="auth-provider-desc">{monlycee.description}</p>
            <div className="auth-tags">
              <span>PRONOTE</span>
              <span>ENT</span>
              <span>OIDC</span>
            </div>
            <div className="auth-provider-actions">
              {oidcReady ? (
                <button
                  type="button"
                  className="btn btn-primary btn-block btn-lg"
                  onClick={handleOidc}
                  disabled={starting}
                >
                  {starting ? <Loader2 size={17} className="spin" /> : <LockKeyhole size={17} />}
                  {starting ? 'Ouverture du portail…' : `Se connecter avec ${monlycee.name}`}
                </button>
              ) : (
                <a className="btn btn-primary btn-block btn-lg" href={MONLYCEE_LOGIN_URL}>
                  <ExternalLink size={17} />
                  Ouvrir {monlycee.name}
                </a>
              )}
              {oidcReady && (
                <a className="btn btn-ghost btn-block btn-sm" href={MONLYCEE_LOGIN_URL}>
                  Ouvrir le portail officiel <ExternalLink size={13} />
                </a>
              )}
            </div>
            <div className={`auth-provider-status ${oidcReady ? 'ok' : ''}`}>
              {oidcReady ? (
                <>
                  <CheckCircle2 size={14} /> Connexion OIDC configurée — la session revient dans Pr8note
                </>
              ) : (
                <>
                  <ExternalLink size={14} /> Redirection officielle — la session ne revient pas sans client
                  OIDC autorisé
                </>
              )}
            </div>
            <p className="auth-provider-hint">
              Destination : <strong>psn.monlycee.net</strong> · Tu peux y utiliser ton compte ENT ou
              ÉduConnect.
            </p>
          </article>

          <article className="auth-provider-card">
            <div className="auth-provider-top">
              <span className="auth-provider-logo" style={{ background: `${educonnect.accent}22`, color: educonnect.accent }}>
                {educonnect.monogram}
              </span>
              <div className="auth-provider-title">
                <h2>{educonnect.name}</h2>
                <p>{educonnect.subtitle}</p>
              </div>
              <Badge tone="neutral">{educonnect.badge}</Badge>
            </div>
            <p className="auth-provider-desc">{educonnect.description}</p>
            <div className="auth-tags">
              <span>Compte unique</span>
              <span>Élèves & parents</span>
            </div>
            <div className="auth-provider-actions">
              <a className="btn btn-outline btn-block" href={EDUC_CONNECT_LOGIN_URL}>
                <ExternalLink size={16} /> Ouvrir ÉduConnect
              </a>
            </div>
            <div className="auth-provider-status">
              <ExternalLink size={14} /> Redirection officielle vers education.gouv.fr
            </div>
            <p className="auth-provider-hint">
              ÉduConnect est le portail national : Pr8note ne stocke aucun identifiant.
            </p>
          </article>
        </div>

        <section className="card auth-custom-card">
          <div className="auth-provider-top">
            <span className="auth-provider-logo" style={{ background: '#14b8a622', color: '#14b8a6' }}>
              <Building2 size={19} />
            </span>
            <div className="auth-provider-title">
              <h2>Un autre ENT ou PRONOTE</h2>
              <p>Mon Bureau Numérique, Atrium, Lycée Connecté, Hyperplanning…</p>
            </div>
          </div>
          <p className="auth-provider-desc">
            Colle l’adresse de ton espace scolaire pour ouvrir directement la page de connexion officielle.
          </p>
          <form className="auth-custom-form" onSubmit={handleCustom}>
            <label htmlFor="custom-ent" className="sr-only">
              Adresse de l’ENT
            </label>
            <input
              id="custom-ent"
              type="text"
              inputMode="url"
              autoComplete="url"
              spellCheck={false}
              placeholder="https://mon-ent.fr"
              value={customUrl}
              onChange={(event) => {
                setCustomUrl(event.target.value)
                setCustomError('')
              }}
            />
            <button type="submit" className="btn btn-primary">
              Continuer <ArrowRight size={16} />
            </button>
          </form>
          {customError && <p className="auth-inline-error">{customError}</p>}
          <p className="auth-provider-hint">
            Exemples : <span>monlycee.net</span>, <span>monbureaunumerique.fr</span>, l’adresse PRONOTE de
            ton lycée.
          </p>
        </section>

        <section className="card auth-config-card">
          <div className="auth-config-head">
            <div>
              <p className="eyebrow">
                <KeyRound size={13} /> OIDC · {MONLYCEE_NAME}
              </p>
              <h2>Faire revenir la connexion dans Pr8note</h2>
            </div>
            <Badge tone={config ? 'good' : 'neutral'}>{config ? 'Configuré' : 'Non configuré'}</Badge>
          </div>

          <p className="auth-config-desc">
            {MONLYCEE_NAME} utilise OpenID Connect (Keycloak). Pour que le portail renvoie la session à
            Pr8note, un administrateur de l’ENT doit créer un <strong>client public</strong> avec l’URL de
            redirection exacte ci-dessous. Pr8note utilise PKCE : aucun secret client n’est stocké.
          </p>

          <div className="auth-config-grid">
            <div className="auth-config-fields">
              <label htmlFor="redirect-uri">URL de redirection à autoriser</label>
              <div className="copy-field">
                <code id="redirect-uri">{redirectUri}</code>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => copy(redirectUri, 'URL de redirection copiée.')}
                  aria-label="Copier l’URL de redirection"
                  title="Copier"
                >
                  <Copy size={15} />
                </button>
              </div>

              <label htmlFor="client-id">Client ID public</label>
              <input
                id="client-id"
                type="text"
                autoComplete="off"
                spellCheck={false}
                placeholder="ex. pr8note-web"
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
              />

              <label htmlFor="issuer">Issuer</label>
              <input id="issuer" type="text" value={MONLYCEE_ISSUER} readOnly spellCheck={false} />

              <div className="auth-config-actions">
                <button type="button" className="btn btn-primary" onClick={handleSave}>
                  <CheckCircle2 size={15} /> Enregistrer
                </button>
                <button type="button" className="btn btn-ghost" onClick={handleTest} disabled={testing}>
                  {testing ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
                  Tester le serveur
                </button>
                {config && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={handleClear}>
                    Effacer
                  </button>
                )}
              </div>

              {status && (
                <p className={`auth-inline-status ${status.kind === 'ok' ? 'ok' : 'error'}`} role="status">
                  {status.kind === 'ok' ? <CheckCircle2 size={14} /> : <Info size={14} />}
                  {status.text}
                </p>
              )}
            </div>

            <div className="auth-config-side">
              <h3>Comment l’obtenir ?</h3>
              <ol>
                <li>Demande à l’administrateur de ton ENT de créer un client OIDC public.</li>
                <li>Transmets-lui l’URL de redirection ci-contre et l’origine du site.</li>
                <li>Colle le client ID reçu ici, puis teste la connexion.</li>
              </ol>
              <p>
                Sans ce client, le bouton ouvre bien le portail officiel, mais Pr8note ne peut pas
                récupérer ta session.
              </p>
              <button
                type="button"
                className="btn btn-outline btn-sm btn-block"
                onClick={() => copy(requestMessage, 'Demande copiée — tu peux l’envoyer à ton ENT.')}
              >
                <Copy size={14} /> Copier la demande pour l’ENT
              </button>
              {!webAuth && (
                <p className="auth-inline-error">
                  La connexion OIDC fonctionne dans la version web. Dans l’app macOS, les portails
                  s’ouvrent dans ton navigateur.
                </p>
              )}
            </div>
          </div>
        </section>

        <div className="auth-note">
          <Info size={17} />
          <p>
            Pr8note est un client indépendant, sans affiliation avec Index Éducation. La connexion
            authentifie ton identité ; les notes, devoirs et emploi du temps restent des données de
            démonstration tant qu’un connecteur PRONOTE autorisé n’est pas installé.
          </p>
        </div>

        <div className="auth-footer-actions">
          <Link to="/" className="btn btn-ghost">
            <ArrowLeft size={15} /> Retour à l’accueil
          </Link>
          {!state.session && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                signIn(STUDENT)
                navigate('/')
              }}
            >
              <Sparkles size={15} /> Explorer la démo
            </button>
          )}
        </div>
      </main>

      <footer className="auth-page-foot">
        <span>Pr8note · client scolaire indépendant</span>
        <span>Aucun mot de passe stocké par l’application</span>
      </footer>
    </div>
  )
}
