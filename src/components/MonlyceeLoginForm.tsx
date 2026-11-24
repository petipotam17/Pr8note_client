import { useId, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Eye,
  EyeOff,
  Info,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { MONLYCEE_LOGIN_URL, MONLYCEE_NAME } from '../lib/auth'
import { signInWithMonlyceePassword } from '../lib/monlyceeApi'
import { useStore } from '../lib/store'

interface MonlyceeLoginFormProps {
  compact?: boolean
  showProviderLink?: boolean
}

export function MonlyceeLoginForm({ compact = false, showProviderLink = true }: MonlyceeLoginFormProps) {
  const { signIn, toast } = useStore()
  const navigate = useNavigate()
  const formId = useId()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return
    const login = username.trim()
    if (!login || !password) {
      setError('Renseigne ton identifiant et ton mot de passe MonLycée.')
      return
    }

    setError('')
    setSubmitting(true)
    try {
      const student = await signInWithMonlyceePassword(login, password)
      setPassword('')
      signIn(student)
      toast(`Connexion MonLycée réussie. Bienvenue ${student.firstName} !`, 'success')
      navigate('/')
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'La connexion MonLycée n’a pas abouti. Réessaie dans quelques instants.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      className={`auth-student-form ${compact ? 'compact' : ''}`}
      onSubmit={submit}
      aria-busy={submitting}
      noValidate
    >
      <div className="auth-student-head">
        <span className="auth-provider-logo" style={{ background: '#3b82f622', color: '#3b82f6' }}>
          ML
        </span>
        <div className="auth-provider-title">
          <h2>Ton compte élève {MONLYCEE_NAME}</h2>
          <p>Sans administrateur · identifiant et mot de passe MonLycée</p>
        </div>
        <span className="auth-student-lock" title="Connexion traitée par le serveur Pr8note">
          <LockKeyhole size={15} />
        </span>
      </div>

      <div className="auth-student-fields">
        <div className="auth-field">
          <label htmlFor={`${formId}-username`}>Identifiant MonLycée</label>
          <div className="auth-input-wrap">
            <UserRound size={16} aria-hidden="true" />
            <input
              id={`${formId}-username`}
              type="text"
              inputMode="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="prenom.nom"
              value={username}
              onChange={(event) => {
                setUsername(event.target.value)
                if (error) setError('')
              }}
              disabled={submitting}
              aria-invalid={Boolean(error)}
            />
          </div>
        </div>

        <div className="auth-field">
          <label htmlFor={`${formId}-password`}>Mot de passe</label>
          <div className="auth-input-wrap">
            <LockKeyhole size={16} aria-hidden="true" />
            <input
              id={`${formId}-password`}
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Ton mot de passe MonLycée"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value)
                if (error) setError('')
              }}
              disabled={submitting}
              aria-invalid={Boolean(error)}
            />
            <button
              type="button"
              className="auth-password-toggle"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              title={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <p className="auth-form-error" role="alert">
          <Info size={14} />
          <span>{error}</span>
        </p>
      )}

      <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={submitting}>
        {submitting ? <Loader2 size={17} className="spin" /> : <ArrowRight size={17} />}
        {submitting ? 'Connexion à MonLycée…' : 'Se connecter avec mon compte élève'}
      </button>

      <p className="auth-form-notice">
        <ShieldCheck size={14} />
        <span>
          Ton mot de passe est envoyé à notre serveur <strong>uniquement pour ouvrir ta session</strong>{' '}
          MonLycée. Il n’est ni stocké ni journalisé.
        </span>
      </p>

      <details className="auth-form-help">
        <summary>
          <Info size={13} /> Pourquoi Pr8note me demande-t-il mon mot de passe ?
        </summary>
        <p>
          {MONLYCEE_NAME} ne permet pas encore à un site externe de récupérer ta session sans qu’un
          administrateur de l’ENT crée un client OIDC. Cette méthode utilise donc ton compte élève
          directement, sans passer par l’administrateur. Si tu préfères ne pas saisir ton mot de passe
          ici, tu peux ouvrir le portail officiel et revenir manuellement.
        </p>
      </details>

      <div className="auth-form-links">
        <a href={MONLYCEE_LOGIN_URL} className="auth-form-link">
          Ouvrir le portail officiel <ArrowRight size={12} />
        </a>
        {showProviderLink && (
          <Link to="/connexion" className="auth-form-link">
            Autres fournisseurs
          </Link>
        )}
      </div>
    </form>
  )
}
