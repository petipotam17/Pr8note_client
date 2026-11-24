import { useMemo, useState, type FormEvent } from 'react'
import {
  ArrowLeft,
  FileText,
  Inbox,
  Mail,
  Paperclip,
  PenLine,
  Search,
  Send,
  Star,
  MessagesSquare,
} from 'lucide-react'
import { SUBJECTS, THREADS } from '../data/seed'
import type { Thread } from '../types'
import { useStore } from '../lib/store'
import { formatDateTime, formatTimeAgo } from '../lib/date'
import { Avatar, Badge, EmptyState, Modal, PageHeader } from '../components/ui'

const RECIPIENTS = Array.from(
  new Set(['Vie scolaire', 'Secrétariat', 'Direction', ...SUBJECTS.map((subject) => subject.teacher)]),
)

const EMPTY_COMPOSE = { to: 'Vie scolaire', subject: '', body: '' }

export function Messages() {
  const { state, markRead, addReply, toggleStar, sendThread, toast } = useStore()
  const [tab, setTab] = useState<'inbox' | 'sent'>('inbox')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [reply, setReply] = useState('')
  const [composeOpen, setComposeOpen] = useState(false)
  const [compose, setCompose] = useState(EMPTY_COMPOSE)

  const allThreads = useMemo(() => [...THREADS, ...state.sentThreads], [state.sentThreads])
  const unreadCount = THREADS.filter((thread) => !state.readThreads.includes(thread.id)).length

  const list = useMemo(() => {
    const base = allThreads.filter((thread) => thread.folder === tab)
    const query = search.trim().toLowerCase()
    return base
      .filter((thread) =>
        query
          ? thread.subject.toLowerCase().includes(query) ||
            thread.from.toLowerCase().includes(query) ||
            thread.preview.toLowerCase().includes(query)
          : true,
      )
      .sort((a, b) => b.at.localeCompare(a.at))
  }, [allThreads, tab, search])

  const selected: Thread | null = allThreads.find((thread) => thread.id === selectedId) ?? null
  const replies = selected ? state.replies[selected.id] ?? [] : []
  const isUnread = (thread: Thread) =>
    thread.folder === 'inbox' && !state.readThreads.includes(thread.id)
  const isStarred = (thread: Thread) => state.starredThreads.includes(thread.id)

  const openThread = (thread: Thread) => {
    setSelectedId(thread.id)
    setReply('')
    if (thread.folder === 'inbox') markRead(thread.id)
  }

  const handleReply = (event: FormEvent) => {
    event.preventDefault()
    if (!selected || !reply.trim()) return
    addReply(selected.id, reply.trim())
    setReply('')
    toast('Réponse envoyée (démo).', 'success')
  }

  const handleSend = () => {
    if (!compose.subject.trim() || !compose.body.trim()) {
      toast('Ajoute un objet et un message.', 'error')
      return
    }
    sendThread({ to: compose.to, subject: compose.subject.trim(), body: compose.body.trim() })
    setCompose(EMPTY_COMPOSE)
    setComposeOpen(false)
    setTab('sent')
    toast('Message envoyé dans la boîte « Envoyés » (démo).', 'success')
  }

  return (
    <div className="page messages-page">
      <PageHeader
        eyebrow="Messagerie"
        title="Tes échanges"
        description={`${unreadCount} message${unreadCount > 1 ? 's' : ''} non lu${unreadCount > 1 ? 's' : ''} · réponses et nouveaux messages conservés sur cet appareil.`}
        actions={
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setComposeOpen(true)}>
            <PenLine size={15} /> Nouveau message
          </button>
        }
      />

      <div className={`messages-layout ${selected ? 'has-selection' : ''}`}>
        <section className="card messages-list">
          <div className="messages-list-head">
            <div className="msg-tabs">
              <button
                type="button"
                className={tab === 'inbox' ? 'active' : ''}
                onClick={() => {
                  setTab('inbox')
                  setSelectedId(null)
                }}
              >
                <Inbox size={15} /> Reçus
                {unreadCount > 0 && <span>{unreadCount}</span>}
              </button>
              <button
                type="button"
                className={tab === 'sent' ? 'active' : ''}
                onClick={() => {
                  setTab('sent')
                  setSelectedId(null)
                }}
              >
                <Send size={15} /> Envoyés
                {state.sentThreads.length > 0 && <span>{state.sentThreads.length}</span>}
              </button>
            </div>
            <label className="search-field">
              <Search size={15} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Rechercher…"
                aria-label="Rechercher un message"
              />
            </label>
          </div>

          <div className="thread-list">
            {list.map((thread) => (
              <button
                type="button"
                key={thread.id}
                className={`thread-row ${selectedId === thread.id ? 'active' : ''} ${isUnread(thread) ? 'unread' : ''}`}
                onClick={() => openThread(thread)}
              >
                <Avatar
                  name={thread.from === 'Moi' ? 'Moi' : thread.from}
                  color={thread.color}
                  size={38}
                  className="thread-avatar"
                />
                <div className="thread-row-copy">
                  <div className="thread-row-top">
                    <strong>{thread.folder === 'sent' ? `À : ${thread.role.replace('À : ', '')}` : thread.from}</strong>
                    <span>{formatTimeAgo(thread.at)}</span>
                  </div>
                  <p className="thread-row-subject">{thread.subject}</p>
                  <p className="thread-row-preview">{thread.preview}</p>
                </div>
                <div className="thread-row-marks">
                  {isStarred(thread) && <Star size={13} fill="currentColor" />}
                  {isUnread(thread) && <i />}
                </div>
              </button>
            ))}

            {list.length === 0 && (
              <EmptyState
                icon={<MessagesSquare size={26} />}
                title="Aucun message"
                description={search ? 'Essaie un autre mot-clé.' : 'Ta boîte est vide pour le moment.'}
              />
            )}
          </div>
        </section>

        <section className="card message-detail">
          {selected ? (
            <>
              <header className="thread-head">
                <button
                  type="button"
                  className="icon-btn msg-back"
                  onClick={() => setSelectedId(null)}
                  aria-label="Retour aux messages"
                >
                  <ArrowLeft size={18} />
                </button>
                <Avatar name={selected.from === 'Moi' ? 'Moi' : selected.from} color={selected.color} size={42} />
                <div className="thread-head-copy">
                  <strong>{selected.folder === 'sent' ? `À : ${selected.role.replace('À : ', '')}` : selected.from}</strong>
                  <span>{selected.folder === 'sent' ? 'Message envoyé' : selected.role}</span>
                </div>
                <div className="thread-actions">
                  <span className="thread-date">{formatDateTime(selected.at)}</span>
                  <button
                    type="button"
                    className={`icon-btn star-btn ${isStarred(selected) ? 'starred' : ''}`}
                    onClick={() => toggleStar(selected.id)}
                    aria-label={isStarred(selected) ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                  >
                    <Star size={17} fill={isStarred(selected) ? 'currentColor' : 'none'} />
                  </button>
                </div>
              </header>

              <div className="thread-scroll">
                <div className="thread-title">
                  <h2>{selected.subject}</h2>
                  <Badge tone="neutral">
                    <Mail size={12} /> {selected.folder === 'inbox' ? 'Reçu' : 'Envoyé'}
                  </Badge>
                </div>

                <div className="thread-body">
                  {selected.body.map((paragraph, index) => (
                    <p key={index}>{paragraph}</p>
                  ))}
                </div>

                {selected.attachment && (
                  <button
                    type="button"
                    className="attachment"
                    onClick={() => toast('Pièce jointe de démonstration : aucun fichier réel n’est stocké.', 'info')}
                  >
                    <span className="attachment-icon">
                      <FileText size={18} />
                    </span>
                    <span>
                      <strong>{selected.attachment.name}</strong>
                      <em>{selected.attachment.size}</em>
                    </span>
                    <Paperclip size={14} />
                  </button>
                )}

                {replies.length > 0 && (
                  <div className="replies">
                    {replies.map((item) => (
                      <div key={item.id} className={`reply ${item.fromMe ? 'mine' : ''}`}>
                        <div className="reply-bubble">
                          <p>{item.body}</p>
                          <span>{formatTimeAgo(item.at)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <form className="reply-box" onSubmit={handleReply}>
                <textarea
                  rows={2}
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  placeholder="Écrire une réponse…"
                  aria-label="Réponse"
                />
                <button type="submit" className="btn btn-primary" disabled={!reply.trim()}>
                  <Send size={15} /> Envoyer
                </button>
              </form>
            </>
          ) : (
            <div className="message-empty">
              <span className="message-empty-icon">
                <Inbox size={30} />
              </span>
              <h3>Choisis une conversation</h3>
              <p>Les messages de tes professeurs et de la vie scolaire s’afficheront ici.</p>
              <div className="message-empty-hints">
                <span>
                  <Star size={14} /> Épingle les messages importants
                </span>
                <span>
                  <PenLine size={14} /> Écris à un professeur
                </span>
              </div>
            </div>
          )}
        </section>
      </div>

      <Modal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        title="Nouveau message"
        subtitle="Il sera conservé dans « Envoyés » (démo)."
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setComposeOpen(false)}>
              Annuler
            </button>
            <button type="button" className="btn btn-primary" onClick={handleSend}>
              <Send size={15} /> Envoyer
            </button>
          </>
        }
      >
        <div className="field">
          <label htmlFor="compose-to">Destinataire</label>
          <select
            id="compose-to"
            value={compose.to}
            onChange={(event) => setCompose((value) => ({ ...value, to: event.target.value }))}
          >
            {RECIPIENTS.map((recipient) => (
              <option key={recipient} value={recipient}>
                {recipient}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="compose-subject">Objet</label>
          <input
            id="compose-subject"
            value={compose.subject}
            onChange={(event) => setCompose((value) => ({ ...value, subject: event.target.value }))}
            placeholder="Ex. Question sur le prochain contrôle"
            maxLength={120}
          />
        </div>
        <div className="field">
          <label htmlFor="compose-body">Message</label>
          <textarea
            id="compose-body"
            rows={6}
            value={compose.body}
            onChange={(event) => setCompose((value) => ({ ...value, body: event.target.value }))}
            placeholder="Bonjour, je me permets de vous écrire au sujet de…"
          />
        </div>
      </Modal>
    </div>
  )
}
