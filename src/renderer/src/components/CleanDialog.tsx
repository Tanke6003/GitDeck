import { useCallback, useEffect, useState } from 'react'
import type { GitResult } from '@shared/types'
import Dialog from './Dialog'
import { useI18n } from '../lib/i18n'

interface Props {
  repoPath: string
  /** publica el resultado del clean real en el panel del padre */
  onDone: (res: GitResult) => void
  onClose: () => void
}

/**
 * `git clean` con red de seguridad: primero SIEMPRE el dry-run (`clean -nd`)
 * para ensenar exactamente que se borraria, y solo entonces se puede confirmar
 * el borrado real (`clean -fd`). Es irreversible: no hay reflog para untracked.
 */
function CleanDialog({ repoPath, onDone, onClose }: Props): JSX.Element {
  const { t } = useI18n()
  const [includeIgnored, setIncludeIgnored] = useState(false)
  const [preview, setPreview] = useState<GitResult | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    setPreview(null)
    window.api.cleanPreview(repoPath, includeIgnored).then((r) => {
      if (alive) setPreview(r)
    })
    return () => {
      alive = false
    }
  }, [repoPath, includeIgnored])

  const doClean = useCallback(async () => {
    setBusy(true)
    const res = await window.api.clean(repoPath, includeIgnored)
    setBusy(false)
    onDone(res)
    onClose()
  }, [repoPath, includeIgnored, onDone, onClose])

  const list = (preview?.stdout ?? '').trim()
  const nothing = preview !== null && preview.ok && list.length === 0

  return (
    <Dialog className="cf-dialog mp-dialog" labelledBy="cl-title" onClose={onClose}>
      <div className="cf-title" id="cl-title">
        {t('clean.title')}
      </div>
      <div className="cf-message">
        <p>{t('clean.intro')}</p>
        <label className="mini check">
          <input
            type="checkbox"
            checked={includeIgnored}
            onChange={(e) => setIncludeIgnored(e.target.checked)}
          />
          {t('clean.includeIgnored')}
        </label>
        {!preview ? (
          <div className="mp-loading">{t('common.loading')}</div>
        ) : !preview.ok ? (
          <pre className="mp-error">{(preview.stderr || preview.stdout).trim()}</pre>
        ) : nothing ? (
          <div className="mp-uptodate">{t('clean.nothing')}</div>
        ) : (
          <>
            <div className="pane-title">{t('clean.wouldRemove')}</div>
            <pre className="mp-stat">{list}</pre>
          </>
        )}
        <p className="rs-warn" role="alert">
          ⚠ {t('clean.warn')}
        </p>
      </div>
      <div className="cf-actions">
        <button className="link" onClick={onClose} data-autofocus>
          {t('common.cancel')}
        </button>
        <button className="danger" onClick={doClean} disabled={busy || nothing || !preview?.ok}>
          {busy ? t('clean.cleaning') : t('clean.confirm')}
        </button>
      </div>
    </Dialog>
  )
}

export default CleanDialog
