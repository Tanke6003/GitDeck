import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { CommitDetail, GitResult } from '@shared/types'
import { ansiToHtml } from '../lib/ansi'
import { useI18n } from '../lib/i18n'
import Dialog from './Dialog'
import ConfirmDialog from './ConfirmDialog'
import type { ConfirmSpec } from './ConfirmDialog'
import BlameDialog from './BlameDialog'
import ResetDialog from './ResetDialog'

interface Props {
  repoPath: string
  hash: string
  /** hay cambios sin commitear: el checkout de la rama nueva puede arrastrarlos */
  dirty: boolean
  /** avisar al padre para refrescar grafo/ramas tras crear una rama */
  onBranchCreated: () => void
  /** avisar al padre tras cherry-pick/revert/reset (cambian HEAD y el working tree) */
  onApplied: () => void
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
  onApplied,
  onClose
}: Props): JSX.Element {
  const { t } = useI18n()
  const [detail, setDetail] = useState<CommitDetail | null>(null)
  const [loadErr, setLoadErr] = useState<GitResult | null>(null)
  const [showBranch, setShowBranch] = useState(false)
  const [branchName, setBranchName] = useState('')
  const [checkout, setCheckout] = useState(true)
  const [busy, setBusy] = useState(false)
  const [branchRes, setBranchRes] = useState<GitResult | null>(null)
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null)
  const [opRes, setOpRes] = useState<GitResult | null>(null)
  // archivo cuyo blame se esta viendo, o null
  const [blameFile, setBlameFile] = useState<string | null>(null)
  const [showReset, setShowReset] = useState(false)

  useEffect(() => {
    let alive = true
    setDetail(null)
    setLoadErr(null)
    setShowBranch(false)
    setBranchName('')
    setBranchRes(null)
    setOpRes(null)
    window.api.commitDetail(repoPath, hash).then((r) => {
      if (!alive) return
      setDetail(r.data)
      setLoadErr(r.error)
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

  /**
   * Cherry-pick / revert. Los dos crean un commit sobre la rama ACTUAL y pueden
   * dejar conflictos; si eso pasa, el banner de la pestaña Commit toma el relevo
   * (Continuar / Abortar), asi que ahi mandamos al usuario.
   */
  const runOn = useCallback(
    (label: 'cherry-pick' | 'revert', fn: () => Promise<GitResult>, warn: ReactNode) => {
      setConfirm({
        title: label === 'revert' ? t('drawer.revert.title') : t('drawer.cherry.title'),
        message: warn,
        confirmLabel: label === 'revert' ? t('drawer.revert.confirm') : t('drawer.cherry.confirm'),
        onConfirm: async () => {
          setConfirm(null)
          setBusy(true)
          const res = await fn()
          setOpRes(res)
          setBusy(false)
          onApplied()
        }
      })
    },
    [onApplied, t]
  )

  const shortSha = detail?.short || hash.slice(0, 7)

  const onCherryPick = useCallback(() => {
    runOn('cherry-pick', () => window.api.cherryPick(repoPath, hash), t('drawer.cherry.warn', { sha: shortSha }))
  }, [runOn, repoPath, hash, shortSha, t])

  const onRevert = useCallback(() => {
    runOn('revert', () => window.api.revert(repoPath, hash), t('drawer.revert.warn', { sha: shortSha }))
  }, [runOn, repoPath, hash, shortSha, t])

  const onResetDone = useCallback(
    (r: GitResult) => {
      setOpRes(r)
      if (r.ok) onApplied()
    },
    [onApplied]
  )

  return (
    <Dialog className="cd-drawer" overlayClassName="cd-overlay" labelledBy="cd-title" onClose={onClose}>
      <div className="cd-head">
        <span className="cd-sha" id="cd-title">
          {shortSha}
        </span>
        {detail && detail.parents.length > 1 && <span className="cd-merge">merge</span>}
        <span className="spacer" />
        <button className="link" onClick={() => setShowBranch((s) => !s)} title={t('drawer.branchHere.title')}>
          ⑂ {t('drawer.branchHere')}
        </button>
        <button className="link" onClick={onCherryPick} disabled={busy} title={t('drawer.cherry.btnTitle')}>
          ⇢ cherry-pick
        </button>
        <button className="link" onClick={onRevert} disabled={busy} title={t('drawer.revert.btnTitle')}>
          ↩ revert
        </button>
        <button className="link" onClick={() => setShowReset(true)} disabled={busy} title={t('drawer.reset.btnTitle')}>
          ⟲ reset
        </button>
        <button className="link" onClick={onClose} aria-label={t('common.close')} title={t('common.closeEsc')}>
          ✕
        </button>
      </div>

      {opRes && (
        <div className={`cd-opres ${opRes.ok ? 'ok' : 'err'}`} role="status">
          <span className="cd-cmd">$ {opRes.cmd}</span>
          <pre>{(opRes.stdout || opRes.stderr || t('common.noOutput')).trim()}</pre>
          {!opRes.ok && <span className="hint">{t('drawer.conflictHint')}</span>}
        </div>
      )}

      {showBranch && (
        <div className="cd-branch">
          <input
            autoFocus
            placeholder={t('branch.namePlaceholder')}
            value={branchName}
            onChange={(e) => setBranchName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') createBranch()
              if (e.key === 'Escape') {
                e.stopPropagation()
                setShowBranch(false)
              }
            }}
          />
          <label className="cd-co">
            <input type="checkbox" checked={checkout} onChange={(e) => setCheckout(e.target.checked)} />
            {t('drawer.branchCheckout')}
          </label>
          <button onClick={createBranch} disabled={busy || !branchName.trim()}>
            {busy ? t('common.creating') : t('common.create')}
          </button>
          <span className="hint">
            {t('drawer.branchHint', { sha: shortSha })}
            {checkout && dirty && ` — ${t('drawer.branchDirtyWarn')}`}
          </span>
        </div>
      )}

      {branchRes && !branchRes.ok && (
        <div className="cd-branch-err" role="alert">
          {(branchRes.stderr || 'error').trim()}
        </div>
      )}

      {loadErr ? (
        <div className="cd-loading err" role="alert">
          {t('common.readError')} — <code>{loadErr.cmd}</code>
          <pre>{(loadErr.stderr || loadErr.stdout).trim()}</pre>
        </div>
      ) : !detail ? (
        <div className="cd-loading">{t('common.loading')}</div>
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
            {t('drawer.files')} <span className="count">{detail.files.length}</span>
          </div>
          <ul className="cd-files">
            {detail.files.map((f) => (
              <li key={f.path} className="cd-file">
                <span className={`cd-fstat ${statusClass(f.status)}`}>{f.status}</span>
                <span className="cd-fpath">{f.path}</span>
                {/* un archivo borrado en este commit no existe aqui: no hay blame */}
                {f.status !== 'D' && (
                  <button
                    className="link"
                    onClick={() => setBlameFile(f.path)}
                    title={t('drawer.blame.title', { path: f.path })}
                  >
                    blame
                  </button>
                )}
              </li>
            ))}
          </ul>

          <pre className="cd-diff" dangerouslySetInnerHTML={{ __html: ansiToHtml(detail.diff) }} />
        </div>
      )}

      {blameFile && (
        <BlameDialog repoPath={repoPath} path={blameFile} rev={hash} onClose={() => setBlameFile(null)} />
      )}

      {showReset && (
        <ResetDialog
          repoPath={repoPath}
          rev={hash}
          revLabel={shortSha}
          onDone={onResetDone}
          onClose={() => setShowReset(false)}
        />
      )}

      {confirm && <ConfirmDialog {...confirm} onCancel={() => setConfirm(null)} />}
    </Dialog>
  )
}

export default CommitDetailDrawer
