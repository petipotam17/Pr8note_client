import { useRef, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  GraduationCap,
  Info,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Upload,
} from 'lucide-react'
import { STUDENT } from '../data/seed'
import { useStore } from '../lib/store'
import { Badge } from '../components/ui'
import { LogoMark, Wordmark } from '../components/Logo'
import { MonlyceeLoginForm } from '../components/MonlyceeLoginForm'
import { EDUC_CONNECT_LOGIN_URL } from '../lib/auth'

export function Login() {
  const { signIn, importData, toast } = useStore()
  const fileInput = useRef<HTMLInputElement>(null)

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
            Connecte-toi avec ton compte élève MonLycée.net. Pr8note ouvre ensuite ton espace PRONOTE
            pour lire tes vraies notes, ton emploi du temps, tes devoirs et ta messagerie. Ton mot de
            passe n’est pas stocké.
          </p>

          <div className="login-provider login-student-provider">
            <MonlyceeLoginForm compact showProviderLink={false} />
          </div>

          <div className="login-provider-alt">
            <a className="btn btn-outline" href={EDUC_CONNECT_LOGIN_URL}>
              <ExternalLink size={14} /> ÉduConnect
            </a>
            <Link className="btn btn-outline" to="/connexion">
              <Building2 size={14} /> Autre ENT
            </Link>
          </div>

          <div className="login-auth-note">
            <Info size={15} />
            <p>
              Pas besoin d’administrateur : cette connexion utilise ton compte élève. La connexion
              officielle OIDC reste disponible dans <Link to="/connexion">les autres options</Link>.
            </p>
          </div>

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
              <ShieldCheck size={14} /> Mot de passe jamais stocké
            </span>
            <span>
              <GraduationCap size={14} /> Données PRONOTE réelles
            </span>
          </div>

          <p className="login-fineprint">
            Pr8note est un client indépendant, sans affiliation avec Index Éducation, PRONOTE ni
            MonLycée.net.
          </p>
        </div>
      </section>
    </div>
  )
}
