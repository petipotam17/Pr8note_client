import { useRef, useState, type ChangeEvent } from 'react'
import {
  AlertTriangle,
  Check,
  Download,
  ExternalLink,
  FileJson,
  Github,
  Keyboard,
  LogOut,
  Mail,
  MapPin,
  Palette,
  RotateCcw,
  School,
  ShieldCheck,
  Sparkles,
  Upload,
} from 'lucide-react'
import { useStore } from '../lib/store'
import { ACCENTS } from '../lib/theme'
import type { AccentId, Density, ThemeMode } from '../types'
import { Avatar, Badge, PageHeader, Segmented, Toggle } from '../components/ui'
import { LogoMark, Wordmark } from '../components/Logo'

export function Settings() {
  const { state, updateSettings, exportData, importData, resetDemo, signOut, toast } = useStore()
  const student = state.session!
  const fileInput = useRef<HTMLInputElement>(null)
  const [confirmReset, setConfirmReset] = useState(false)

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
    <div className="page">
      <PageHeader
        eyebrow="Ton espace"
        title="Réglages"
        description="Fais de Pr8note ton espace : apparence, données, raccourcis."
      />

      <div className="settings-grid">
        <section className="card settings-profile">
          <div className="profile-top">
            <Avatar
              name={`${student.firstName} ${student.lastName}`}
              color="linear-gradient(135deg, var(--accent), var(--accent-2))"
              size={72}
            />
            <div>
              <h2>
                {student.firstName} {student.lastName}
              </h2>
              <div className="profile-badges">
                <Badge tone="accent">{student.className}</Badge>
                <Badge tone="neutral">
                  <Sparkles size={11} /> Compte démo
                </Badge>
              </div>
            </div>
          </div>
          <div className="profile-rows">
            <div>
              <span>
                <School size={15} /> Établissement
              </span>
              <strong>
                {student.establishment} · {student.city}
              </strong>
            </div>
            <div>
              <span>
                <Mail size={15} /> E-mail
              </span>
              <strong>{student.email}</strong>
            </div>
            <div>
              <span>
                <MapPin size={15} /> Niveau
              </span>
              <strong>{student.level}</strong>
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-block btn-sm" onClick={signOut}>
            <LogOut size={15} /> Se déconnecter
          </button>
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <p className="eyebrow">
                <Palette size={13} /> Apparence
              </p>
              <h2>À ton image</h2>
            </div>
          </div>

          <div className="settings-row">
            <div>
              <strong>Thème</strong>
              <span>Le mode sombre est plus doux le soir.</span>
            </div>
            <Segmented<ThemeMode>
              options={[
                { value: 'dark', label: 'Sombre' },
                { value: 'light', label: 'Clair' },
              ]}
              value={state.settings.theme}
              onChange={(theme) => updateSettings({ theme })}
              label="Thème"
            />
          </div>

          <div className="settings-row">
            <div>
              <strong>Couleur d’accent</strong>
              <span>Elle colore les boutons, les anneaux et les graphiques.</span>
            </div>
            <div className="accent-swatches">
              {(Object.keys(ACCENTS) as AccentId[]).map((key) => {
                const accent = ACCENTS[key]
                return (
                  <button
                    type="button"
                    key={key}
                    className={`accent-swatch ${state.settings.accent === key ? 'active' : ''}`}
                    style={{ background: `linear-gradient(135deg, ${accent.from}, ${accent.to})` }}
                    onClick={() => updateSettings({ accent: key })}
                    aria-label={`Accent ${accent.name}`}
                    aria-pressed={state.settings.accent === key}
                    title={accent.name}
                  >
                    {state.settings.accent === key && <Check size={13} />}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="settings-row">
            <div>
              <strong>Densité</strong>
              <span>Plus compacte pour voir davantage d’informations.</span>
            </div>
            <Segmented<Density>
              options={[
                { value: 'comfortable', label: 'Confort' },
                { value: 'compact', label: 'Compacte' },
              ]}
              value={state.settings.density}
              onChange={(density) => updateSettings({ density })}
              label="Densité"
            />
          </div>

          <div className="settings-row">
            <div>
              <strong>Animations</strong>
              <span>Transitions douces et effets de mouvement.</span>
            </div>
            <Toggle
              checked={state.settings.motion}
              onChange={(motion) => updateSettings({ motion })}
              label="Animations"
            />
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <p className="eyebrow">
                <FileJson size={13} /> Tes données
              </p>
              <h2>Garder la main</h2>
            </div>
            <Badge tone="good">
              <ShieldCheck size={12} /> Local
            </Badge>
          </div>

          <p className="settings-note">
            Tes devoirs cochés, messages lus, favoris et réglages sont stockés dans ton navigateur.
            Exporte une sauvegarde pour les retrouver ailleurs.
          </p>

          <div className="data-actions">
            <button type="button" className="btn btn-outline btn-block" onClick={exportData}>
              <Download size={16} /> Exporter ma sauvegarde
            </button>
            <button type="button" className="btn btn-ghost btn-block" onClick={() => fileInput.current?.click()}>
              <Upload size={16} /> Importer une sauvegarde
            </button>
            <input ref={fileInput} type="file" accept="application/json,.json" onChange={handleImport} hidden />
          </div>

          {!confirmReset ? (
            <button type="button" className="link-btn danger-link" onClick={() => setConfirmReset(true)}>
              <RotateCcw size={13} /> Réinitialiser la démonstration
            </button>
          ) : (
            <div className="reset-confirm">
              <p>
                <AlertTriangle size={15} /> Effacer tes devoirs cochés, messages lus, favoris et réglages ?
              </p>
              <div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmReset(false)}>
                  Annuler
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => {
                    resetDemo()
                    setConfirmReset(false)
                    toast('La démonstration a été réinitialisée.', 'success')
                  }}
                >
                  Réinitialiser
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <p className="eyebrow">
                <Keyboard size={13} /> Raccourcis
              </p>
              <h2>Plus vite au clavier</h2>
            </div>
          </div>
          <div className="shortcut-list">
            <div>
              <span>Ouvrir la recherche</span>
              <span className="shortcut-keys">
                <kbd>⌘</kbd>
                <kbd>K</kbd>
              </span>
            </div>
            <div>
              <span>Naviguer dans les résultats</span>
              <span className="shortcut-keys">
                <kbd>↑</kbd>
                <kbd>↓</kbd>
              </span>
            </div>
            <div>
              <span>Ouvrir le résultat</span>
              <span className="shortcut-keys">
                <kbd>↵</kbd>
              </span>
            </div>
            <div>
              <span>Fermer une fenêtre</span>
              <span className="shortcut-keys">
                <kbd>esc</kbd>
              </span>
            </div>
          </div>
        </section>

        <section className="card about-card">
          <div className="about-brand">
            <LogoMark size={42} />
            <div>
              <Wordmark />
              <span>Version 1.0.0 · édition web & macOS</span>
            </div>
          </div>
          <p>
            Pr8note est un client scolaire indépendant, imaginé pour rendre le quotidien des élèves plus
            lisible. Il n’est pas affilié à Index Éducation ni à PRONOTE.
          </p>
          <div className="about-links">
            <a href="https://github.com/petipotam17/Pr8note_client" target="_blank" rel="noreferrer">
              <Github size={15} /> Code source <ExternalLink size={12} />
            </a>
            <a href="https://petipotam17.github.io/Pr8note_web/" target="_blank" rel="noreferrer">
              <ExternalLink size={15} /> Version web
            </a>
          </div>
        </section>
      </div>
    </div>
  )
}
