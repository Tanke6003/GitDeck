import { useCallback, useEffect, useState } from 'react'
import type { FileDiff, GitResult } from '@shared/types'
import { useI18n } from '../lib/i18n'

interface Props {
  repoPath: string
  /** ruta del archivo */
  path: string
  /** false = hunks sin preparar (se pueden stagear); true = ya preparados (se pueden quitar) */
  cached: boolean
  /** recargar listas del panel padre tras aplicar */
  onApplied: () => void
  onResult: (res: GitResult) => void
}

/** clase css segun el tipo de linea del diff */
function lineClass(line: string): string {
  if (line.startsWith('+')) return 'add'
  if (line.startsWith('-')) return 'del'
  if (line.startsWith('@@')) return 'hh'
  if (line.startsWith('\\')) return 'meta'
  return ''
}

/**
 * Diff de un archivo troceado en hunks, con un botón por hunk para prepararlo
 * o quitarlo del staging por separado (el equivalente visual de `git add -p`).
 */
function HunkView({ repoPath, path, cached, onApplied, onResult }: Props): JSX.Element {
  const { t } = useI18n()
  const [diff, setDiff] = useState<FileDiff | null>(null)
  const [loadErr, setLoadErr] = useState<GitResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await window.api.fileHunks(repoPath, path, cached)
    setDiff(r.data)
    setLoadErr(r.error)
    setLoading(false)
  }, [repoPath, path, cached])

  useEffect(() => {
    load()
  }, [load])

  const apply = useCallback(
    async (index: number) => {
      if (!diff) return
      setBusy(true)
      const res = await window.api.applyHunk(repoPath, diff, index, cached)
      onResult(res)
      setBusy(false)
      // los hunks se renumeran al aplicar uno: hay que releer, no ajustar a mano
      await load()
      onApplied()
    },
    [diff, repoPath, cached, onResult, load, onApplied]
  )

  if (loading) return <div className="hk-empty">{t('hunk.loading')}</div>
  if (loadErr)
    return (
      <div className="hk-empty err" role="alert">
        {t('common.readError')} — <code>{loadErr.cmd}</code>
        <pre>{(loadErr.stderr || loadErr.stdout).trim()}</pre>
      </div>
    )
  if (!diff) return <div className="hk-empty">{t('hunk.noChanges')}</div>
  if (diff.binary) return <div className="hk-empty">{t('hunk.binary')}</div>
  if (diff.hunks.length === 0) return <div className="hk-empty">{t('hunk.none')}</div>

  return (
    <div className="hk-wrap">
      {diff.hunks.map((h) => (
        <div key={h.index} className="hk-block">
          <div className="hk-bar">
            <span className="hk-title">{h.header}</span>
            <span className="hk-stat">
              <span className="add">+{h.added}</span> <span className="del">−{h.removed}</span>
            </span>
            <button
              onClick={() => apply(h.index)}
              disabled={busy}
              title={cached ? t('hunk.unstage.title') : t('hunk.stage.title')}
            >
              {cached ? `− ${t('hunk.unstage')}` : `+ ${t('hunk.stage')}`}
            </button>
          </div>
          <pre className="hk-code">
            {h.text.split('\n').map((line, i) => (
              <div key={i} className={`hk-line ${lineClass(line)}`}>
                {line || ' '}
              </div>
            ))}
          </pre>
        </div>
      ))}
    </div>
  )
}

export default HunkView
