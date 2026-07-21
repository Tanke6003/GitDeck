import { useState } from 'react'
import type { MergeOpts, MergePreview } from '@shared/types'
import Dialog from './Dialog'
import { useI18n } from '../lib/i18n'

interface Props {
  preview: MergePreview | null
  /** rama que se va a fusionar (se muestra mientras carga la vista previa) */
  branch: string
  busy: boolean
  onConfirm: (opts: MergeOpts) => void
  onCancel: () => void
}

type Strategy = 'default' | 'no-ff' | 'squash' | 'ff-only'

const OPTS: Record<Strategy, MergeOpts> = {
  default: {},
  'no-ff': { noFF: true },
  squash: { squash: true },
  'ff-only': { ffOnly: true }
}

/**
 * Vista previa de un merge antes de ejecutarlo: que commits entrarian, que
 * archivos tocaria y si seria fast-forward. Todo se calcula con lecturas
 * (log/diff/merge-base), asi que abrir este dialogo no modifica el repo.
 * Ademas se elige la politica de integracion (--no-ff / --squash / --ff-only).
 */
function MergePreviewDialog({ preview, branch, busy, onConfirm, onCancel }: Props): JSX.Element {
  const { t } = useI18n()
  const [strategy, setStrategy] = useState<Strategy>('default')
  const canMerge = !!preview && !preview.error && !preview.upToDate

  return (
    <Dialog className="cf-dialog mp-dialog" labelledBy="mp-title" onClose={onCancel}>
      <div className="cf-title" id="mp-title">
        {t('merge.title', { branch: preview?.branch ?? branch })}
      </div>

      {!preview ? (
        <div className="mp-loading">{t('merge.loading')}</div>
      ) : preview.error ? (
        <div className="mp-error">{preview.error}</div>
      ) : preview.upToDate ? (
        <div className="mp-uptodate">{t('merge.upToDate', { branch: preview.branch })}</div>
      ) : (
        <div className="mp-body">
          <div className="mp-badges">
            <span className={`mp-badge ${preview.fastForward ? 'ff' : 'mc'}`}>
              {preview.fastForward ? t('merge.ff') : t('merge.mergeCommit')}
            </span>
            <span className="mini">
              {t('merge.incoming', { n: preview.commits.length })}
              {preview.fastForward ? ` — ${t('merge.ffNote')}` : ` — ${t('merge.divergedNote')}`}
            </span>
          </div>

          <div className="pane-title">
            {t('merge.commitsIn')} <span className="count">{preview.commits.length}</span>
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

          <div className="pane-title">{t('merge.files')}</div>
          <pre className="mp-stat">{preview.stat || t('merge.noFileChanges')}</pre>

          <div className="pane-title">{t('merge.strategy')}</div>
          <div className="mp-strategies" role="radiogroup" aria-label={t('merge.strategy')}>
            {(['default', 'no-ff', 'squash', 'ff-only'] as Strategy[]).map((s) => (
              <label key={s} className={`mp-strat ${strategy === s ? 'on' : ''}`}>
                <input
                  type="radio"
                  name="merge-strategy"
                  checked={strategy === s}
                  onChange={() => setStrategy(s)}
                />
                <span className="mp-strat-name">
                  {s === 'default' ? t('merge.stratDefault') : `--${s}`}
                </span>
                <span className="mp-strat-desc">
                  {s === 'default'
                    ? t('merge.stratDefaultDesc')
                    : s === 'no-ff'
                      ? t('merge.stratNoFFDesc')
                      : s === 'squash'
                        ? t('merge.stratSquashDesc')
                        : t('merge.stratFFOnlyDesc')}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="cf-actions">
        <button className="link" onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button onClick={() => onConfirm(OPTS[strategy])} disabled={!canMerge || busy} data-autofocus>
          {busy ? t('merge.merging') : t('merge.confirm')}
        </button>
      </div>
    </Dialog>
  )
}

export default MergePreviewDialog
