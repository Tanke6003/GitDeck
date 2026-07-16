import { useCallback, useEffect, useState } from 'react'
import type { GitResult, ReflogEntry } from '@shared/types'

interface Props {
  repoPath: string
  /** avisa al padre tras crear una rama (cambia el grafo) */
  onChanged: () => void
  onClose: () => void
}

/** El reflog dice qué se hizo; esto lo traduce a una etiqueta corta. */
function kindOf(action: string): string {
  const verb = action.split(':')[0].trim()
  return verb || 'ref'
}

/**
 * Reflog: por dónde ha pasado HEAD. Sirve para recuperar commits que se
 * quedaron sin rama (tras un reset, un rebase o un checkout).
 *
 * La forma segura de recuperarlos es crear una rama en su entrada: el selector
 * `HEAD@{n}` sigue resolviendo al commit aunque ninguna rama lo apunte.
 */
function ReflogDialog({ repoPath, onChanged, onClose }: Props): JSX.Element {
  const [entries, setEntries] = useState<ReflogEntry[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<GitResult | null>(null)
  // entrada en la que se esta creando rama
  const [openRef, setOpenRef] = useState<string | null>(null)
  const [name, setName] = useState('')

  useEffect(() => {
    let alive = true
    window.api.reflog(repoPath).then((r) => {
      if (alive) setEntries(r)
    })
    return () => {
      alive = false
    }
  }, [repoPath])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const createBranch = useCallback(
    async (entry: ReflogEntry) => {
      const n = name.trim()
      if (!n) return
      setBusy(true)
      // startPoint = la entrada del reflog; sin checkout, para no mover al usuario
      const r = await window.api.createBranch(repoPath, n, entry.ref, false)
      setRes(r)
      setBusy(false)
      if (r.ok) {
        setName('')
        setOpenRef(null)
        onChanged()
      }
    },
    [name, repoPath, onChanged]
  )

  return (
    <div className="cd-overlay" onClick={onClose}>
      <div className="bl-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="cd-head">
          <span className="cd-sha">reflog</span>
          <span className="bl-path">por dónde ha pasado HEAD</span>
          <span className="spacer" />
          <button className="link" onClick={onClose} title="cerrar (Esc)">
            ✕
          </button>
        </div>

        {res && (
          <div className={`cd-opres ${res.ok ? 'ok' : 'err'}`}>
            <span className="cd-cmd">$ {res.cmd}</span>
            <pre>{(res.stdout || res.stderr || '(sin salida)').trim()}</pre>
          </div>
        )}

        {!entries && <div className="bl-empty">cargando…</div>}
        {entries && entries.length === 0 && <div className="bl-empty">reflog vacío</div>}

        {entries && entries.length > 0 && (
          <ul className="rl-list">
            {entries.map((e) => (
              <li key={e.ref} className="rl-row">
                <div className="rl-head">
                  <span className="rl-ref">{e.ref}</span>
                  <span className="rl-sha">{e.short}</span>
                  <span className="rl-kind">{kindOf(e.action)}</span>
                  <span className="rl-subject" title={e.action}>
                    {e.subject || e.action}
                  </span>
                  <span className="rl-date">{e.date}</span>
                  <button
                    className="link"
                    onClick={() => setOpenRef(openRef === e.ref ? null : e.ref)}
                    disabled={busy}
                    title="crear una rama aquí para recuperar este commit"
                  >
                    ⑂ rama
                  </button>
                </div>
                {openRef === e.ref && (
                  <div className="rl-branch">
                    <input
                      autoFocus
                      placeholder="nombre-de-la-rama"
                      value={name}
                      onChange={(ev) => setName(ev.target.value)}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter') createBranch(e)
                        if (ev.key === 'Escape') setOpenRef(null)
                      }}
                    />
                    <button onClick={() => createBranch(e)} disabled={busy || !name.trim()}>
                      {busy ? 'creando…' : 'Crear'}
                    </button>
                    <span className="hint">
                      nace en <code>{e.short}</code> — no cambia tu rama actual
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default ReflogDialog
