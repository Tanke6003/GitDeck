import { useCallback, useState } from 'react'
import type { GitResult } from '@shared/types'
import Dialog from './Dialog'
import { ansiToHtml } from '../lib/ansi'
import { useI18n } from '../lib/i18n'

interface Props {
  repoPath: string
  /** refs conocidas (ramas y tags) para autocompletar */
  refs: string[]
  onClose: () => void
}

/**
 * Comparar dos revisiones cualquiera: rama↔rama, tag↔tag, sha↔sha, o el
 * working tree contra una revision (dejando B vacio). Con `...` el diff es
 * contra la base comun ("que aporto B"), el mismo criterio que usa un merge.
 */
function CompareDialog({ repoPath, refs, onClose }: Props): JSX.Element {
  const { t } = useI18n()
  const [revA, setRevA] = useState('')
  const [revB, setRevB] = useState('')
  const [threeDot, setThreeDot] = useState(false)
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<GitResult | null>(null)

  const run = useCallback(async () => {
    if (!revA.trim()) return
    setBusy(true)
    const r = await window.api.diffRange(repoPath, revA.trim(), revB.trim() || undefined, threeDot)
    setRes(r)
    setBusy(false)
  }, [repoPath, revA, revB, threeDot])

  return (
    <Dialog className="bl-dialog" overlayClassName="cd-overlay" labelledBy="cmp-title" onClose={onClose}>
      <div className="cd-head">
        <span className="cd-sha" id="cmp-title">
          {t('compare.title')}
        </span>
        <span className="spacer" />
        <button className="link" onClick={onClose} aria-label={t('common.close')} title={t('common.closeEsc')}>
          ✕
        </button>
      </div>

      <div className="cmp-form">
        <input
          autoFocus
          list="cmp-refs"
          placeholder={t('compare.revA')}
          aria-label={t('compare.revA')}
          value={revA}
          onChange={(e) => setRevA(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run()}
        />
        <span className="cmp-dots">{threeDot ? '...' : '..'}</span>
        <input
          list="cmp-refs"
          placeholder={t('compare.revB')}
          aria-label={t('compare.revB')}
          value={revB}
          onChange={(e) => setRevB(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run()}
        />
        <datalist id="cmp-refs">
          {refs.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
        <label className="mini check" title={t('compare.threeDotTitle')}>
          <input type="checkbox" checked={threeDot} onChange={(e) => setThreeDot(e.target.checked)} />
          {t('compare.threeDot')}
        </label>
        <button onClick={run} disabled={busy || !revA.trim()}>
          {busy ? t('compare.comparing') : t('compare.run')}
        </button>
      </div>

      {!res ? (
        <div className="bl-empty">{t('compare.hint')}</div>
      ) : !res.ok ? (
        <div className="bl-empty err" role="alert">
          <code>$ {res.cmd}</code>
          <pre>{(res.stderr || res.stdout).trim()}</pre>
        </div>
      ) : res.stdout.trim() === '' ? (
        <div className="bl-empty">{t('compare.identical')}</div>
      ) : (
        <>
          <div className="cmp-cmd mini">$ {res.cmd}</div>
          <pre className="cd-diff cmp-diff" dangerouslySetInnerHTML={{ __html: ansiToHtml(res.stdout) }} />
        </>
      )}
    </Dialog>
  )
}

export default CompareDialog
