import { useEffect, useState } from 'react'
import type { CommitDetail } from '@shared/types'
import { ansiToHtml } from '../lib/ansi'

interface Props {
  repoPath: string
  hash: string
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
function CommitDetailDrawer({ repoPath, hash, onClose }: Props): JSX.Element {
  const [detail, setDetail] = useState<CommitDetail | null>(null)

  useEffect(() => {
    let alive = true
    setDetail(null)
    window.api.commitDetail(repoPath, hash).then((d) => {
      if (alive) setDetail(d)
    })
    return () => {
      alive = false
    }
  }, [repoPath, hash])

  return (
    <div className="cd-overlay" onClick={onClose}>
      <div className="cd-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="cd-head">
          <span className="cd-sha">{detail?.short || hash.slice(0, 7)}</span>
          {detail && detail.parents.length > 1 && <span className="cd-merge">merge</span>}
          <span className="spacer" />
          <button className="link" onClick={onClose} title="cerrar">
            ✕
          </button>
        </div>

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
