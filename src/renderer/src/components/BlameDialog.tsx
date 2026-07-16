import { useEffect, useMemo, useState } from 'react'
import type { BlameLine } from '@shared/types'

interface Props {
  repoPath: string
  /** ruta del archivo, relativa al repo */
  path: string
  /** revision en la que mirar el archivo (undefined = working tree) */
  rev?: string
  onClose: () => void
}

function fmtDate(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * `git blame` de un archivo: cada linea con el commit que la introdujo.
 *
 * Las lineas del mismo commit se agrupan visualmente (solo la primera del bloque
 * muestra sha/autor/fecha), que es como se lee un blame sin ruido.
 */
function BlameDialog({ repoPath, path, rev, onClose }: Props): JSX.Element {
  const [lines, setLines] = useState<BlameLine[] | null>(null)

  useEffect(() => {
    let alive = true
    setLines(null)
    window.api.blame(repoPath, path, rev).then((l) => {
      if (alive) setLines(l)
    })
    return () => {
      alive = false
    }
  }, [repoPath, path, rev])

  // cerrar con Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // un color estable por commit para distinguir bloques de un vistazo
  const colorOf = useMemo(() => {
    const palette = ['#89b4fa', '#a6e3a1', '#f9e2af', '#cba6f7', '#94e2d5', '#fab387', '#f38ba8']
    const seen = new Map<string, string>()
    return (hash: string): string => {
      let c = seen.get(hash)
      if (!c) {
        c = palette[seen.size % palette.length]
        seen.set(hash, c)
      }
      return c
    }
  }, [])

  return (
    <div className="cd-overlay" onClick={onClose}>
      <div className="bl-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="cd-head">
          <span className="cd-sha">blame</span>
          <span className="bl-path" title={path}>
            {path}
          </span>
          {rev && <span className="bl-rev">en {rev.slice(0, 7)}</span>}
          <span className="spacer" />
          <button className="link" onClick={onClose} title="cerrar (Esc)">
            ✕
          </button>
        </div>

        {!lines && <div className="bl-empty">cargando…</div>}
        {lines && lines.length === 0 && (
          <div className="bl-empty">
            sin blame: el archivo puede ser binario, estar vacío o no existir en esa revisión.
          </div>
        )}

        {lines && lines.length > 0 && (
          <div className="bl-body">
            {lines.map((l, i) => {
              // solo la primera linea de cada bloque repite los datos del commit
              const first = i === 0 || lines[i - 1].hash !== l.hash
              return (
                <div key={`${l.hash}-${l.line}`} className={`bl-row ${first ? 'first' : ''}`}>
                  <span className="bl-gutter" style={{ borderLeftColor: colorOf(l.hash) }}>
                    {first && (
                      <>
                        <span className="bl-sha" title={l.subject}>
                          {l.short}
                        </span>
                        <span className="bl-author">{l.author}</span>
                        <span className="bl-date">{fmtDate(l.timestamp)}</span>
                      </>
                    )}
                  </span>
                  <span className="bl-num">{l.line}</span>
                  <pre className="bl-code">{l.content}</pre>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default BlameDialog
