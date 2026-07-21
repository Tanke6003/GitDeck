import { useEffect, useMemo, useState } from 'react'
import type { BlameLine, GitResult } from '@shared/types'
import Dialog from './Dialog'
import { useI18n } from '../lib/i18n'

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

/** paleta por commit: variables de tema (los carriles del grafo), no hex fijos */
const PALETTE = Array.from({ length: 8 }, (_, i) => `var(--lane-${i})`)

/**
 * `git blame` de un archivo: cada linea con el commit que la introdujo.
 *
 * Las lineas del mismo commit se agrupan visualmente (solo la primera del bloque
 * muestra sha/autor/fecha), que es como se lee un blame sin ruido.
 */
function BlameDialog({ repoPath, path, rev, onClose }: Props): JSX.Element {
  const { t } = useI18n()
  const [lines, setLines] = useState<BlameLine[] | null>(null)
  const [error, setError] = useState<GitResult | null>(null)

  useEffect(() => {
    let alive = true
    setLines(null)
    setError(null)
    window.api.blame(repoPath, path, rev).then((r) => {
      if (!alive) return
      setLines(r.data)
      setError(r.error)
    })
    return () => {
      alive = false
    }
  }, [repoPath, path, rev])

  // un color estable por commit para distinguir bloques de un vistazo
  const colorOf = useMemo(() => {
    const seen = new Map<string, string>()
    return (hash: string): string => {
      let c = seen.get(hash)
      if (!c) {
        c = PALETTE[seen.size % PALETTE.length]
        seen.set(hash, c)
      }
      return c
    }
  }, [])

  return (
    <Dialog className="bl-dialog" overlayClassName="cd-overlay" labelledBy="bl-title" onClose={onClose}>
      <div className="cd-head">
        <span className="cd-sha" id="bl-title">
          blame
        </span>
        <span className="bl-path" title={path}>
          {path}
        </span>
        {rev && <span className="bl-rev">{t('blame.atRev', { rev: rev.slice(0, 7) })}</span>}
        <span className="spacer" />
        <button className="link" onClick={onClose} aria-label={t('common.close')} title={t('common.closeEsc')}>
          ✕
        </button>
      </div>

      {!lines && !error && <div className="bl-empty">{t('common.loading')}</div>}
      {error && (
        <div className="bl-empty err" role="alert">
          {t('common.readError')} — <code>{error.cmd}</code>
          <pre>{(error.stderr || error.stdout).trim()}</pre>
        </div>
      )}
      {lines && !error && lines.length === 0 && <div className="bl-empty">{t('blame.empty')}</div>}

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
    </Dialog>
  )
}

export default BlameDialog
