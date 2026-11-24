import { useRef, useState, type ChangeEvent } from 'react'
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  GraduationCap,
  Info,
  Lock,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Upload,
  WifiOff,
} from 'lucide-react'
import { STUDENT } from '../data/seed'
import { useStore } from '../lib/store'
import { Avatar, Badge, Modal } from '../components/ui'
import { LogoMark, Wordmark } from '../components/Logo'

export function Login() {
  const { signIn, importData, toast } = useStore()
  const [pronoteOpen, setPronoteOpen] = useState(false)
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
                <WifiOff size={17} />
              </span>
              <div>
                <strong>Un espace qui reste avec toi</strong>
                <span>Accessible hors ligne et exportable à tout moment.</span>
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
            Espace de démonstration
          </Badge>

          <Avatar
            name="Léo Marchand"
            color="linear-gradient(135deg, var(--accent), var(--accent-2))"
            size={66}
            className="login-avatar"
          />

          <h2>Content de te revoir, Léo.</h2>
          <p className="login-sub">
            Ton espace est prêt. Retrouve ta journée, tes devoirs et tes notes — tout est déjà à sa place.
          </p>

          <button type="button" className="btn btn-primary btn-block btn-lg" onClick={() => signIn(STUDENT)}>
            Ouvrir mon espace
            <ArrowRight size={18} />
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

          <div className="login-divider">
            <span>ou</span>
          </div>

          <button type="button" className="btn btn-outline btn-block" onClick={() => setPronoteOpen(true)}>
            <Lock size={15} />
            Connexion à mon établissement
          </button>

          <div className="login-meta">
            <span>
              <ShieldCheck size={14} /> Tes données restent sur cet appareil
            </span>
            <span>
              <GraduationCap size={14} /> Première 4 · Lycée Victor Hugo
            </span>
          </div>

          <p className="login-fineprint">
            Mode démo avec des données fictives. Pr8note n’est pas affilié à Index Éducation ni à PRONOTE.
          </p>
        </div>
      </section>

      <Modal
        open={pronoteOpen}
        onClose={() => setPronoteOpen(false)}
        title="Connexion à ton établissement"
        subtitle="Une seule porte d’entrée, toutes tes infos."
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setPronoteOpen(false)}>
              Plus tard
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setPronoteOpen(false)
                signIn(STUDENT)
              }}
            >
              Explorer en mode démo <ArrowRight size={16} />
            </button>
          </>
        }
      >
        <div className="notice">
          <Info size={18} />
          <div>
            <strong>PRONOTE est un logiciel propriétaire d’Index Éducation.</strong>
            <p>
              La synchronisation réelle dépend de l’accès API autorisé par ton établissement. Pr8note est
              aujourd’hui livré avec un espace de démonstration complet pour que tu puisses tout essayer.
            </p>
          </div>
        </div>
        <ul className="modal-list">
          <li>
            <span>1</span>
            <div>
              <strong>Adresse de l’établissement</strong>
              <p>PRONOTE, ENT ou portail de ton lycée.</p>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <strong>Identifiants remis par la vie scolaire</strong>
              <p>Ton identifiant élève et ton mot de passe habituel.</p>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <strong>Le connecteur de ton lycée</strong>
              <p>Une autorisation à demander à l’administrateur du réseau.</p>
            </div>
          </li>
        </ul>
        <p className="modal-note">
          Le mode démo reprend exactement l’expérience de l’application : notes, emploi du temps,
          devoirs, messagerie et réglages.
        </p>
      </Modal>
    </div>
  )
}
