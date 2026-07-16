import { useCallback, useEffect, useState } from 'react'
import type { CommitDetail, GitResult } from '@shared/types'
import { ansiToHtml } from '../lib/ansi'

interface Props {
  repoPath: string
  hash: string
  /** hay cambios sin commitear: el checkout de la rama nueva puede arrastrarlos */
  dirty: boolean
  /** avisar al padre para refrescar grafo/ramas tras crear una rama */
  onBranchCreated: () => void
  onClose: () => void
}

/** Etiqueta corta y color por estado de archivo (M/A/D/R…). */
function statusClass(status: string): string {
  const c = status[0]
  if (c === 'A') return 'st-add'
  if (c === 'D') return 'st-del'
  if (c === 'R') return 'st-ren'
  return 'st-mod'
}

/**
 * Panel deslizante con el detalle de un commit: mensaje completo, autor/fecha,
 * archivos cambiados y el diff con color. Se abre al hacer click en el árbol.
 */
function CommitDetailDrawer({
  repoPath,
  hash,
  dirty,
  onBranchCreated,
  onClose
}: Props): JSX.Element {
  const [detail, setDetail] = useState<CommitDetail | null>(null)
  const [showBranch, setShowBranch] = useState(false)
  const [branchName, setBranchName] = useState('')
  const [checkout, setCheckout] = useState(true)
  const [busy, setBusy] = useState(false)
  const [branchRes, setBranchRes] = useState<GitResult | null>(null)

  useEffect(() => {
    let alive = true
    setDetail(null)
    setShowBranch(false)
    setBranchName('')
    setBranchRes(null)
    window.api.commitDetail(repoPath, hash).then((d) => {
      if (alive) setDetail(d)
    })
    return () => {
      alive = false
    }
  }, [repoPath, hash])

  const createBranch = useCallback(async () => {
    const name = branchName.trim()
    if (!name) return
    setBusy(true)
    // startPoint = este commit: la rama nace aqui, no en HEAD
    const res = await window.api.createBranch(repoPath, name, hash, checkout)
    setBranchRes(res)
    setBusy(false)
    if (res.ok) {
      setBranchName('')
      setShowBranch(false)
      onBranchCreated()
    }
  }, [branchName, repoPath, hash, checkout, onBranchCreated])

  return (
    <div className="cd-overlay" onClick={onClose}>
      <div className="cd-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="cd-head">
          <span className="cd-sha">{detail?.short || hash.slice(0, 7)}</span>
          {detail && detail.parents.length > 1 && <span className="cd-merge">merge</span>}
          <span className="spacer" />
          <button
            className="link"
            onClick={() => setShowBranch((s) => !s)}
            title="crear una rama en este commit"
          >
            ⑂ rama aquí
          </button>
          <button className="link" onClick={onClose} title="cerrar">
            ✕
          </button>
        </div>

        {showBranch && (
          <div className="cd-branch">
            <input
              autoFocus
              placeholder="nombre-de-la-rama"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') createBranch()
                if (e.key === 'Escape') setShowBranch(false)
              }}
            />
            <label className="cd-co">
              <input
                type="checkbox"
                checked={checkout}
                onChange={(e) => setCheckout(e.target.checked)}
              />
              cambiar a ella
            </label>
            <button onClick={createBranch} disabled={busy || !branchName.trim()}>
              {busy ? 'creando…' : 'Crear'}
            </button>
            <span className="hint">
              nace en <code>{detail?.short || hash.slice(0, 7)}</code>
              {checkout && dirty && ' — ojo: tienes cambios sin guardar'}
            </span>
          </div>
        )}

        {branchRes && !branchRes.ok && (
          <div className="cd-branch-err">{(branchRes.stderr || 'error').trim()}</div>
        )}

        {!detail ? (
          <div className="cd-loading">cargando…</div>
        ) : (
          <div className="cd-scroll">
            <div className="cd-subject">{detail.subject}</div>
            <div className="cd-meta">
              {detail.author} &lt;{detail.email}&gt;
              <span className="cd-dot">·</span>
              {detail.date}
              <span className="cd-dot">·</span>
              <span className="mono">{detail.short}</span>
            </div>
            {detail.body && <pre className="cd-body">{detail.body}</pre>}

            <div className="pane-title cd-files-title">
              Archivos <span className="count">{detail.files.length}</span>
            </div>
            <ul className="cd-files">
              {detail.files.map((f) => (
                <li key={f.path} className="cd-file">
                  <span className={`cd-fstat ${statusClass(f.status)}`}>{f.status}</span>
                  <span className="cd-fpath">{f.path}</span>
                </li>
              ))}
            </ul>

            <pre className="cd-diff" dangerouslySetInnerHTML={{ __html: ansiToHtml(detail.diff) }} />
          </div>
        )}
      </div>
    </div>
  )
}

export default CommitDetailDrawer
