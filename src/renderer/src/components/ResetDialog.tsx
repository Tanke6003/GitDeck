import { useState } from 'react'
import type { GitResult, ResetMode } from '@shared/types'
import Dialog from './Dialog'
import { useI18n } from '../lib/i18n'

interface Props {
  repoPath: string
  /** revision destino (sha, HEAD@{n}…) */
  rev: string
  /** etiqueta corta para mostrar (sha corto o selector del reflog) */
  revLabel: string
  /** publica el resultado (comando + salida) donde el padre lo muestre */
  onDone: (res: GitResult) => void
  onClose: () => void
}

/**
 * `git reset` a una revision con eleccion de modo. Es LA operacion de deshacer
 * que faltaba: el reflog mostraba puntos de recuperacion pero no dejaba actuar.
 * `hard` destruye el working tree, por eso el boton se pinta de peligro y el
 * foco inicial queda en Cancelar (via ConfirmDialog-style data-autofocus).
 */
function ResetDialog({ repoPath, rev, revLabel, onDone, onClose }: Props): JSX.Element {
  const { t } = useI18n()
  const [mode, setMode] = useState<ResetMode>('mixed')
  const [busy, setBusy] = useState(false)

  const run = async (): Promise<void> => {
    setBusy(true)
    const res = await window.api.reset(repoPath, mode, rev)
    setBusy(false)
    onDone(res)
    onClose()
  }

  return (
    <Dialog className="cf-dialog" labelledBy="rs-title" onClose={onClose}>
      <div className="cf-title" id="rs-title">
        {t('reset.title', { rev: revLabel })}
      </div>
      <div className="cf-message">
        <p className="rs-intro">{t('reset.intro', { rev: revLabel })}</p>
        <div className="mp-strategies" role="radiogroup" aria-label={t('reset.mode')}>
          {(['soft', 'mixed', 'hard'] as ResetMode[]).map((m) => (
            <label key={m} className={`mp-strat ${mode === m ? 'on' : ''} ${m === 'hard' ? 'danger' : ''}`}>
              <input type="radio" name="reset-mode" checked={mode === m} onChange={() => setMode(m)} />
              <span className="mp-strat-name">--{m}</span>
              <span className="mp-strat-desc">
                {m === 'soft' ? t('reset.soft') : m === 'mixed' ? t('reset.mixed') : t('reset.hard')}
              </span>
            </label>
          ))}
        </div>
        {mode === 'hard' && (
          <p className="rs-warn" role="alert">
            ⚠ {t('reset.hardWarn')}
          </p>
        )}
      </div>
      <div className="cf-actions">
        <button className="link" onClick={onClose} data-autofocus>
          {t('common.cancel')}
        </button>
        <button className={mode === 'hard' ? 'danger' : ''} onClick={run} disabled={busy}>
          {busy ? t('reset.running') : t('reset.confirm', { mode })}
        </button>
      </div>
    </Dialog>
  )
}

export default ResetDialog
