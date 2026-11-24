import { useCallback, useEffect, useRef, useState } from 'react'
import { LogoMark } from './Logo'

export function Splash({ onFinish }: { onFinish: () => void }) {
  const [leaving, setLeaving] = useState(false)
  const finished = useRef(false)
  const finish = useCallback(() => {
    if (finished.current) return
    finished.current = true
    setLeaving(true)
    window.setTimeout(onFinish, 420)
  }, [onFinish])

  useEffect(() => {
    const timer = window.setTimeout(finish, 2000)
    return () => window.clearTimeout(timer)
  }, [finish])

  return (
    <div
      className={`splash ${leaving ? 'is-leaving' : ''}`}
      onClick={finish}
      onKeyDown={finish}
      role="status"
      aria-label="Chargement de Pr8note"
      tabIndex={0}
    >
      <div className="splash-orb orb-one" />
      <div className="splash-orb orb-two" />
      <div className="splash-orb orb-three" />
      <div className="splash-grid" />

      <div className="splash-content">
        <div className="splash-logo">
          <LogoMark size={82} />
          <span className="splash-logo-glow" />
        </div>
        <h1 className="splash-word">
          Pr<span>8</span>note
        </h1>
        <p className="splash-tagline">Ton espace scolaire, en mieux.</p>
        <div className="splash-loader" aria-hidden="true">
          <span />
        </div>
        <p className="splash-hint">Chargement de ta journée…</p>
      </div>

      <div className="splash-foot">
        <span>v1.0</span>
        <span>⌘K pour tout retrouver</span>
      </div>
    </div>
  )
}
