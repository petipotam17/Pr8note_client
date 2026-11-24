import { useMemo, useState } from 'react'
import {
  ArrowUpRight,
  FileText,
  Heart,
  Link2,
  Library,
  PencilRuler,
  Play,
  Search,
  Star,
  type LucideIcon,
} from 'lucide-react'
import { RESOURCES, SUBJECTS } from '../data/seed'
import type { Resource } from '../types'
import { useStore } from '../lib/store'
import { Badge, EmptyState, Modal, PageHeader } from '../components/ui'

const TYPE_META: Record<Resource['type'], { label: string; icon: LucideIcon; color: string }> = {
  pdf: { label: 'PDF', icon: FileText, color: '#fb7185' },
  lien: { label: 'Lien', icon: Link2, color: '#38d6c4' },
  video: { label: 'Vidéo', icon: Play, color: '#4aa8ff' },
  exercice: { label: 'Exercice', icon: PencilRuler, color: '#f7b955' },
}

const FILTERS: { value: Resource['type'] | 'all'; label: string }[] = [
  { value: 'all', label: 'Tout' },
  { value: 'pdf', label: 'PDF' },
  { value: 'video', label: 'Vidéos' },
  { value: 'lien', label: 'Liens' },
  { value: 'exercice', label: 'Exercices' },
]

export function Resources() {
  const { state, toggleFavorite, toast } = useStore()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<Resource['type'] | 'all'>('all')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [selected, setSelected] = useState<Resource | null>(null)

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return RESOURCES.filter((resource) => {
      if (typeFilter !== 'all' && resource.type !== typeFilter) return false
      if (favoritesOnly && !state.favorites.includes(resource.id)) return false
      if (!query) return true
      const subject = SUBJECTS.find((item) => item.id === resource.subjectId)
      return (
        resource.title.toLowerCase().includes(query) ||
        resource.description.toLowerCase().includes(query) ||
        (subject?.name.toLowerCase().includes(query) ?? false)
      )
    })
  }, [search, typeFilter, favoritesOnly, state.favorites])

  const selectedSubject = selected ? SUBJECTS.find((subject) => subject.id === selected.subjectId) : null

  return (
    <div className="page">
      <PageHeader
        eyebrow="Bibliothèque"
        title="Ressources"
        description="Fiches, vidéos et exercices partagés par tes professeurs. Tout au même endroit."
        actions={
          <button
            type="button"
            className={`btn btn-ghost btn-sm ${favoritesOnly ? 'is-active' : ''}`}
            onClick={() => setFavoritesOnly((value) => !value)}
          >
            <Heart size={15} fill={favoritesOnly ? 'currentColor' : 'none'} />
            Favoris ({state.favorites.length})
          </button>
        }
      />

      <div className="resources-toolbar">
        <div className="chip-scroll">
          {FILTERS.map((filter) => (
            <button
              type="button"
              key={filter.value}
              className={`filter-chip ${typeFilter === filter.value ? 'active' : ''}`}
              onClick={() => setTypeFilter(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <label className="search-field resources-search">
          <Search size={15} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher une ressource…"
            aria-label="Rechercher une ressource"
          />
        </label>
      </div>

      {filtered.length ? (
        <div className="resource-grid">
          {filtered.map((resource) => {
            const subject = SUBJECTS.find((item) => item.id === resource.subjectId)
            const meta = TYPE_META[resource.type]
            const Icon = meta.icon
            const favorite = state.favorites.includes(resource.id)
            return (
              <article key={resource.id} className="card resource-card">
                <div className="resource-top">
                  <span className="resource-icon" style={{ color: meta.color, background: `${meta.color}18` }}>
                    <Icon size={21} />
                  </span>
                  <button
                    type="button"
                    className={`icon-btn star-btn ${favorite ? 'starred' : ''}`}
                    onClick={() => toggleFavorite(resource.id)}
                    aria-label={favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                  >
                    <Star size={17} fill={favorite ? 'currentColor' : 'none'} />
                  </button>
                </div>
                <button type="button" className="resource-body" onClick={() => setSelected(resource)}>
                  <span className="resource-kicker">
                    <i style={{ background: subject?.color }} />
                    {subject?.short} · {meta.label}
                  </span>
                  <h3>{resource.title}</h3>
                  <p>{resource.description}</p>
                </button>
                <div className="resource-foot">
                  <span>{resource.meta}</span>
                  <button type="button" className="card-link" onClick={() => setSelected(resource)}>
                    Ouvrir <ArrowUpRight size={14} />
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <div className="card">
          <EmptyState
            icon={<Library size={26} />}
            title="Aucune ressource trouvée"
            description="Essaie un autre filtre ou un autre mot-clé."
            action={
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setSearch('')
                  setTypeFilter('all')
                  setFavoritesOnly(false)
                }}
              >
                Réinitialiser les filtres
              </button>
            }
          />
        </div>
      )}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.title ?? 'Ressource'}
        subtitle={selected && selectedSubject ? `${selectedSubject.name} · ${TYPE_META[selected.type].label}` : undefined}
        footer={
          <>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                if (!selected) return
                toggleFavorite(selected.id)
              }}
            >
              <Star size={15} fill={selected && state.favorites.includes(selected.id) ? 'currentColor' : 'none'} />
              {selected && state.favorites.includes(selected.id) ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => toast('Ressource de démonstration : aucun fichier réel n’est joint.', 'info')}
            >
              <ArrowUpRight size={15} /> Ouvrir la ressource
            </button>
          </>
        }
      >
        {selected && (
          <div className="resource-detail">
            <div className="resource-detail-head">
              <span
                className="resource-icon"
                style={{ color: TYPE_META[selected.type].color, background: `${TYPE_META[selected.type].color}18` }}
              >
                {(() => {
                  const Icon = TYPE_META[selected.type].icon
                  return <Icon size={24} />
                })()}
              </span>
              <div>
                <strong>{selectedSubject?.name}</strong>
                <span>{selected.meta}</span>
              </div>
              <Badge tone="neutral">{TYPE_META[selected.type].label}</Badge>
            </div>
            <p className="resource-detail-desc">{selected.description}</p>
            <div className="notice">
              <Library size={18} />
              <div>
                <strong>Ressource de démonstration</strong>
                <p>
                  Cette bibliothèque montre comment Pr8note regroupe les documents de tes professeurs.
                  Les fichiers ne sont pas inclus dans la version de démonstration.
                </p>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
