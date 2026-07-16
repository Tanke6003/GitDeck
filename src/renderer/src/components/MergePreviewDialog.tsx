import type { MergePreview } from '@shared/types'

interface Props {
  preview: MergePreview | null
  /** rama que se va a fusionar (se muestra mientras carga la vista previa) */
  branch: string
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Vista previa de un merge antes de ejecutarlo: que commits entrarian, que
 * archivos tocaria y si seria fast-forward. Todo se calcula con lecturas
 * (log/diff/merge-base), asi que abrir este dialogo no modifica el repo.
 */
function MergePreviewDialog({ preview, branch, busy, onConfirm, onCancel }: Props): JSX.Element {
  const canMerge = !!preview && !preview.error && !preview.upToDate

  return (
    <div className="cf-overlay" onClick={onCancel}>
      <div className="cf-dialog mp-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="cf-title">
          Merge de <code>{preview?.branch ?? branch}</code> en la rama actual
        </div>

        {!preview ? (
          <div className="mp-loading">calculando vista previa…</div>
        ) : preview.error ? (
          <div className="mp-error">{preview.error}</div>
        ) : preview.upToDate ? (
          <div className="mp-uptodate">
            Ya está fusionada: <code>{preview.branch}</code> no tiene nada que la rama actual no
            tenga. No hay nada que hacer.
          </div>
        ) : (
          <div className="mp-body">
            <div className="mp-badges">
              <span className={`mp-badge ${preview.fastForward ? 'ff' : 'mc'}`}>
                {preview.fastForward ? 'fast-forward' : 'commit de merge'}
              </span>
              <span className="mini">
                {preview.commits.length} commit(s) entrarían
                {preview.fastForward
                  ? ' — la rama actual solo avanza, sin merge commit'
                  : ' — las ramas divergieron; puede haber conflictos'}
              </span>
            </div>

            <div className="pane-title">
              Commits que entran <span className="count">{preview.commits.length}</span>
            </div>
            <ul className="mp-commits">
              {preview.commits.map((c) => (
                <li key={c.short} className="mp-commit">
                  <span className="mp-sha">{c.short}</span>
                  <span className="mp-subject">{c.subject}</span>
                  <span className="mp-author">{c.author}</span>
                </li>
              ))}
            </ul>

            <div className="pane-title">Archivos</div>
            <pre className="mp-stat">{preview.stat || '(sin cambios de archivos)'}</pre>
          </div>
        )}

        <div className="cf-actions">
          <button className="link" onClick={onCancel}>
            Cancelar
          </button>
          <button onClick={onConfirm} disabled={!canMerge || busy}>
            {busy ? 'fusionando…' : 'Confirmar merge'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default MergePreviewDialog
