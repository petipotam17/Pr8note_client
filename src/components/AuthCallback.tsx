import { useEffect, useRef, useState } from 'react'
import type { JWTPayload } from 'jose'
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, RefreshCw, ShieldCheck } from 'lucide-react'
import type { Student } from '../types'
import { authErrorMessage, completeOidcLogin, getRedirectUri } from '../lib/auth'
import { useStore } from '../lib/store'
import { LogoMark, Wordmark } from '../components/Logo'
import { Badge } from '../components/ui'

type CallbackState =
  | { status: 'working' }
  | { status: 'success'; student: Student }
  | { status: 'error'; message: string; detail: string }

export function AuthCallback({ onFinish }: { onFinish: (destination?: string) => void }) {
  const { signIn } = useStore()
  const [state, setState] = useState<CallbackState>({ status: 'working' })
  const requestRef = useRef<Promise<{ student: Student; claims: JWTPayload }> | null>(null)

  useEffect(() => {
    let active = true

    // Reuse the same exchange across React StrictMode's double effect invocation.
    // The authorization code is single-use, so the second run must not redeem it again.
    if (!requestRef.current) {
      const timeout = new Promise<never>((_, reject) => {
        window.setTimeout(
          () => reject(new Error('Délai dépassé : le serveur de connexion ne répond pas.')),
          25_000,
        )
      })
      requestRef.current = Promise.race([completeOidcLogin(), timeout])
    }

    requestRef.current
      .then(({ student }) => {
        if (!active) return
        signIn(student)
        setState({ status: 'success', student })
      })
      .catch((error: unknown) => {
        if (!active) return
        setState({
          status: 'error',
          message: authErrorMessage(error),
          detail: error instanceof Error ? error.message : String(error),
        })
      })

    return () => {
      active = false
    }
  }, [signIn])

  useEffect(() => {
    if (state.status !== 'success') return
    const timer = window.setTimeout(() => onFinish(), 2800)
    return () => window.clearTimeout(timer)
  }, [state.status, onFinish])

  return (
    <div className="auth-page auth-callback-page">
      <div className="auth-page-glow auth-glow-a" />
      <div className="auth-page-glow auth-glow-b" />

      <header className="auth-page-header">
        <span className="auth-brand">
          <LogoMark size={34} />
          <Wordmark />
        </span>
        <Badge tone="neutral">
          <ShieldCheck size={12} /> Connexion sécurisée
        </Badge>
      </header>

      <main className="auth-callback-main">
        <section className="card auth-callback-card" aria-live="polite">
          {state.status === 'working' && (
            <>
              <span className="auth-callback-icon working">
                <Loader2 size={28} className="spin" />
              </span>
              <h1>Vérification de la connexion…</h1>
              <p>
                Pr8note échange le code d’autorisation avec le portail et vérifie la signature du jeton
                d’identité. Cela ne prend que quelques secondes.
              </p>
              <div className="auth-callback-progress" aria-hidden="true">
                <span />
              </div>
              <small>Ne ferme pas cet onglet.</small>
            </>
          )}

          {state.status === 'success' && (
            <>
              <span className="auth-callback-icon success">
                <CheckCircle2 size={30} />
              </span>
              <Badge tone="good">Identité vérifiée</Badge>
              <h1>
                Bienvenue, {state.student.firstName} {state.student.lastName}.
              </h1>
              <p>
                Ta connexion {state.student.authLabel ?? 'OIDC'} a bien été vérifiée. Tu vas être
                redirigé vers ton espace.
              </p>
              <div className="auth-callback-identity">
                <div>
                  <span>Connexion</span>
                  <strong>{state.student.authLabel ?? 'MonLycée.net'}</strong>
                </div>
                <div>
                  <span>Établissement</span>
                  <strong>{state.student.establishment}</strong>
                </div>
                {state.student.email && (
                  <div>
                    <span>E-mail</span>
                    <strong>{state.student.email}</strong>
                  </div>
                )}
              </div>
              <p className="auth-callback-note">
                Les notes et l’emploi du temps affichés restent des données de démonstration : la
                connexion PRONOTE n’est pas encore autorisée.
              </p>
            </>
          )}

          {state.status === 'error' && (
            <>
              <span className="auth-callback-icon error">
                <AlertTriangle size={29} />
              </span>
              <Badge tone="bad">Connexion interrompue</Badge>
              <h1>La connexion n’a pas abouti.</h1>
              <p>{state.message}</p>
              <div className="auth-callback-error-detail">
                <span>Adresse de retour</span>
                <code>{getRedirectUri()}</code>
                <details>
                  <summary>Détail technique</summary>
                  <pre>{state.detail}</pre>
                </details>
              </div>
              <div className="auth-callback-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => onFinish('#/connexion')}
                >
                  <RefreshCw size={15} /> Réessayer
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => onFinish()}>
                  <ArrowLeft size={15} /> Retour à l’accueil
                </button>
              </div>
              <small>
                Astuce : si le portail refuse le retour, vérifie que l’URL de redirection ci-dessus est
                autorisée pour le client OIDC auprès de ton ENT.
              </small>
            </>
          )}
        </section>
      </main>
    </div>
  )
}
