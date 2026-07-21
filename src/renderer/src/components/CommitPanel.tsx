import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FileStatus, GitResult, PendingOp, RepoState } from '@shared/types'
import { ansiToHtml } from '../lib/ansi'
import { useI18n } from '../lib/i18n'
import HunkView from './HunkView'
import CleanDialog from './CleanDialog'
import ConfirmDialog from './ConfirmDialog'
import type { ConfirmSpec } from './ConfirmDialog'

/** Como se llama cada operacion a medias en el banner. */
const OP_LABEL: Record<PendingOp, string> = {
  merge: 'Merge',
  rebase: 'Rebase',
  'cherry-pick': 'Cherry-pick',
  revert: 'Revert'
}

/** Tipos Conventional Commits. */
const TYPES = ['', 'feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert']

const SUBJECT_SOFT = 50 // recomendado
const SUBJECT_HARD = 72 // límite

interface Props {
  repoPath: string
  onCommitted: () => void
}

/**
 * Panel de commit: staging por archivo y por hunk, descartar cambios, limpiar
 * untracked, diff de lo preparado y un editor de mensaje MULTILÍNEA con formato
 * Conventional Commits. El mensaje se envía por stdin (no `-m`), así conserva
 * encabezado + cuerpo con saltos de línea.
 */
function CommitPanel({ repoPath, onCommitted }: Props): JSX.Element {
  const { t } = useI18n()
  const [files, setFiles] = useState<FileStatus[]>([])
  const [statusErr, setStatusErr] = useState<GitResult | null>(null)
  const [diffHtml, setDiffHtml] = useState<string>('')
  const [diffFile, setDiffFile] = useState<string | null>(null)
  /** el diff abierto es del index (true) o del working tree (false) */
  const [diffCached, setDiffCached] = useState(true)
  /** ver el archivo troceado en hunks en vez del diff completo */
  const [byHunk, setByHunk] = useState(false)
  /** el archivo abierto es nuevo sin trackear: no hay hunks que dividir */
  const [diffUntracked, setDiffUntracked] = useState(false)

  const [type, setType] = useState('')
  const [scope, setScope] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [amend, setAmend] = useState(false)

  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<GitResult | null>(null)
  const [state, setState] = useState<RepoState | null>(null)
  const [openErr, setOpenErr] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null)
  const [showClean, setShowClean] = useState(false)

  const staged = files.filter((f) => f.staged)
  const conflicts = files.filter((f) => f.conflicted)
  const changes = files.filter((f) => f.unstaged && !f.conflicted)

  const loadDiff = useCallback(
    async (path?: string, cached = true) => {
      const res = await window.api.stagedDiff(repoPath, path, cached)
      setDiffHtml(ansiToHtml((res.stdout || '').replace(/\s+$/, '')))
      setDiffFile(path ?? null)
      setDiffCached(cached)
    },
    [repoPath]
  )

  const refresh = useCallback(async () => {
    const [list, st] = await Promise.all([window.api.status(repoPath), window.api.repoState(repoPath)])
    setFiles(list.data)
    setStatusErr(list.error)
    setState(st)
    await loadDiff()
  }, [repoPath, loadDiff])

  useEffect(() => {
    refresh()
  }, [refresh])

  const onStage = useCallback(
    async (f: FileStatus) => {
      await window.api.stage(repoPath, f.path)
      await refresh()
    },
    [repoPath, refresh]
  )
  const onUnstage = useCallback(
    async (f: FileStatus) => {
      await window.api.unstage(repoPath, f.path)
      await refresh()
    },
    [repoPath, refresh]
  )
  const onStageAll = useCallback(async () => {
    await window.api.stageAll(repoPath)
    await refresh()
  }, [repoPath, refresh])
  const onUnstageAll = useCallback(async () => {
    await window.api.unstageAll(repoPath)
    await refresh()
  }, [repoPath, refresh])

  /** descartar los cambios de un archivo: destructivo, se confirma antes */
  const onDiscard = useCallback(
    (f: FileStatus) => {
      setConfirm({
        title: t('discard.title', { path: f.path }),
        message: f.untracked ? t('discard.msgUntracked', { path: f.path }) : t('discard.msg', { path: f.path }),
        confirmLabel: t('discard.confirm'),
        danger: true,
        onConfirm: async () => {
          setConfirm(null)
          setBusy(true)
          const res = await window.api.discardFile(repoPath, f.path, f.untracked)
          setResult(res)
          setBusy(false)
          await refresh()
          onCommitted()
        }
      })
    },
    [repoPath, refresh, onCommitted, t]
  )

  // --- merge / rebase en curso ---
  const onResolve = useCallback(
    async (f: FileStatus) => {
      await window.api.stage(repoPath, f.path) // stage = marcar resuelto
      await refresh()
    },
    [repoPath, refresh]
  )

  /** abre el archivo en conflicto en el editor por defecto del sistema */
  const onOpenExternal = useCallback(
    async (f: FileStatus) => {
      const err = await window.api.openFile(repoPath, f.path)
      if (err) setOpenErr(t('commit.openError', { path: f.path, err }))
    },
    [repoPath, t]
  )
  const onContinue = useCallback(async () => {
    if (!state?.op) return
    setBusy(true)
    const res = await window.api.continueOp(repoPath, state.op)
    setResult(res)
    setBusy(false)
    await refresh()
    onCommitted()
  }, [state, repoPath, refresh, onCommitted])
  const onAbort = useCallback(async () => {
    if (!state?.op) return
    setBusy(true)
    const res = await window.api.abortOp(repoPath, state.op)
    setResult(res)
    setBusy(false)
    await refresh()
    onCommitted()
  }, [state, repoPath, refresh, onCommitted])

  // encabezado Conventional Commits + mensaje completo
  const header = useMemo(() => {
    const s = subject.trim()
    if (!type) return s
    return `${type}${scope.trim() ? `(${scope.trim()})` : ''}: ${s}`
  }, [type, scope, subject])

  const message = useMemo(() => {
    const b = body.replace(/\s+$/, '')
    return b.trim() ? `${header}\n\n${b}` : header
  }, [header, body])

  // con amend se puede recommitear aunque no haya nada nuevo preparado (solo reescribir el mensaje)
  const canCommit = (subject.trim().length > 0 && staged.length > 0) || amend

  const onCommit = useCallback(async () => {
    setBusy(true)
    const res = await window.api.commit(repoPath, subject.trim() ? message : '', amend)
    setResult(res)
    setBusy(false)
    if (res.ok) {
      setType('')
      setScope('')
      setSubject('')
      setBody('')
      setAmend(false)
      await refresh()
      onCommitted()
    }
  }, [repoPath, message, subject, amend, refresh, onCommitted])

  const headerLen = header.length
  const lenClass = headerLen > SUBJECT_HARD ? 'over' : headerLen > SUBJECT_SOFT ? 'warn' : 'ok'

  const fileRow = (f: FileStatus, isStaged: boolean): JSX.Element => (
    <li key={f.path} className={`file-row ${diffFile === f.path ? 'active' : ''}`}>
      <button
        className="file-main"
        onClick={() => {
          // un archivo nuevo sin trackear no tiene diff: git no sabe de el todavia
          setDiffUntracked(f.untracked)
          if (f.untracked) {
            setDiffFile(f.path)
            setDiffHtml('')
            setByHunk(false)
          } else {
            loadDiff(f.path, isStaged)
          }
        }}
        title={f.untracked ? `${f.path} (${t('commit.newFile')})` : t('commit.viewDiff')}
      >
        <span className={`fstat ${f.untracked ? 'new' : ''}`}>{f.untracked ? '?' : isStaged ? f.index : f.work}</span>
        <span className="fpath">{f.path}</span>
      </button>
      {!isStaged && (
        <button
          className="file-act del"
          onClick={() => onDiscard(f)}
          disabled={busy}
          aria-label={t('discard.btn', { path: f.path })}
          title={t('discard.btnTitle')}
        >
          🗑
        </button>
      )}
      <button
        className="file-act"
        onClick={() => (isStaged ? onUnstage(f) : onStage(f))}
        aria-label={isStaged ? t('commit.unstage', { path: f.path }) : t('commit.stage', { path: f.path })}
        title={isStaged ? t('commit.unstageTitle') : t('commit.stageTitle')}
      >
        {isStaged ? '−' : '＋'}
      </button>
    </li>
  )

  return (
    <div className="commit-panel">
      {state?.op && (
        <div className="merge-banner" role="alert">
          <span className="mb-label">⚠ {t('commit.opInProgress', { op: OP_LABEL[state.op] })}</span>
          <span className="mb-info">
            {state.conflicted.length > 0
              ? t('commit.conflictsPending', { n: state.conflicted.length })
              : t('commit.noConflictsPending')}
          </span>
          <span className="spacer" />
          <button onClick={onContinue} disabled={busy || state.conflicted.length > 0}>
            {t('commit.continue')}
          </button>
          <button className="danger" onClick={onAbort} disabled={busy}>
            {t('commit.abort')}
          </button>
        </div>
      )}

      {statusErr && (
        <div className="pane-error big" role="alert">
          <b>{t('commit.statusError')}</b> — <code>{statusErr.cmd}</code>
          <pre>{(statusErr.stderr || statusErr.stdout).trim()}</pre>
        </div>
      )}

      <div className="commit-top">
        <div className="file-lists">
          {conflicts.length > 0 && (
            <>
              <div className="pane-title conflict">
                {t('commit.conflicts')} <span className="count">{conflicts.length}</span>
              </div>
              {openErr && (
                <div className="open-err" role="alert">
                  {openErr}
                  <button className="link" onClick={() => setOpenErr(null)} aria-label={t('common.close')}>
                    ✕
                  </button>
                </div>
              )}
              <ul className="file-list">
                {conflicts.map((f) => (
                  <li key={f.path} className={`file-row conflict ${diffFile === f.path ? 'active' : ''}`}>
                    <button className="file-main" onClick={() => loadDiff(f.path, false)} title={t('commit.viewConflictDiff')}>
                      <span className="fstat conf">!</span>
                      <span className="fpath">{f.path}</span>
                    </button>
                    <button
                      className="file-act"
                      onClick={() => onOpenExternal(f)}
                      aria-label={t('commit.openExternal', { path: f.path })}
                      title={t('commit.openExternalTitle')}
                    >
                      ↗
                    </button>
                    <button
                      className="file-act ok"
                      onClick={() => onResolve(f)}
                      aria-label={t('commit.markResolved', { path: f.path })}
                      title={t('commit.markResolvedTitle')}
                    >
                      ✓
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="pane-title">
            {t('commit.staged')} <span className="count">{staged.length}</span>
            {staged.length > 0 && (
              <button className="link" onClick={onUnstageAll}>
                {t('commit.unstageAll')}
              </button>
            )}
          </div>
          <ul className="file-list">
            {staged.length === 0 && <li className="mini pad">{t('commit.nothingStaged')}</li>}
            {staged.map((f) => fileRow(f, true))}
          </ul>

          <div className="pane-title">
            {t('commit.changes')} <span className="count">{changes.length}</span>
            {changes.length > 0 && (
              <button className="link" onClick={onStageAll}>
                {t('commit.stageAll')}
              </button>
            )}
            <button className="link" onClick={() => setShowClean(true)} disabled={busy} title={t('clean.btnTitle')}>
              {t('clean.btn')}
            </button>
          </div>
          <ul className="file-list">
            {changes.length === 0 && <li className="mini pad">{t('commit.noChanges')}</li>}
            {changes.map((f) => fileRow(f, false))}
          </ul>
        </div>

        <div className="diff-view">
          <div className="pane-title">
            {diffCached ? t('commit.diffStaged') : t('commit.diffUnstaged')}
            {diffFile ? <span className="mini">— {diffFile}</span> : <span className="mini">— {t('commit.diffAll')}</span>}
            {diffFile && !diffUntracked && (
              <button
                className={`link ${byHunk ? 'on' : ''}`}
                onClick={() => setByHunk((s) => !s)}
                title={byHunk ? t('commit.fullDiffTitle') : t('commit.byHunkTitle', { path: diffFile })}
              >
                {byHunk ? t('commit.fullDiff') : `⧉ ${t('commit.byHunk')}`}
              </button>
            )}
            {diffFile && (
              <button
                className="link"
                onClick={() => {
                  setByHunk(false)
                  setDiffUntracked(false)
                  loadDiff()
                }}
              >
                {t('commit.viewAll')}
              </button>
            )}
          </div>

          {diffUntracked ? (
            <div className="diff-empty">{t('commit.untrackedNote')}</div>
          ) : byHunk && diffFile ? (
            <HunkView repoPath={repoPath} path={diffFile} cached={diffCached} onApplied={refresh} onResult={setResult} />
          ) : diffHtml ? (
            <pre className="diff-body" dangerouslySetInnerHTML={{ __html: diffHtml }} />
          ) : (
            <div className="diff-empty">{diffCached ? t('commit.emptyStaged') : t('commit.emptyUnstaged')}</div>
          )}
        </div>
      </div>

      <div className="commit-editor">
        <div className="ce-header">
          <select value={type} onChange={(e) => setType(e.target.value)} title={t('commit.typeTitle')} aria-label={t('commit.typeTitle')}>
            {TYPES.map((ty) => (
              <option key={ty} value={ty}>
                {ty || t('commit.noType')}
              </option>
            ))}
          </select>
          <input
            className="ce-scope"
            placeholder={t('commit.scopePlaceholder')}
            value={scope}
            onChange={(e) => setScope(e.target.value)}
          />
          <input
            className="ce-subject"
            placeholder={t('commit.subjectPlaceholder')}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
          <span className={`ce-count ${lenClass}`} title={t('commit.lenTitle')}>
            {headerLen}
            {headerLen > SUBJECT_HARD && <span aria-hidden="true"> ⚠</span>}
          </span>
        </div>

        {header && (
          <div className="ce-preview">
            <span className="mini">{t('commit.headerPreview')}:</span> <code>{header}</code>
          </div>
        )}

        <textarea
          className="ce-body"
          placeholder={t('commit.bodyPlaceholder')}
          aria-label={t('commit.bodyLabel')}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
        />

        <div className="ce-actions">
          <label className="ce-amend">
            <input type="checkbox" checked={amend} onChange={(e) => setAmend(e.target.checked)} />
            {t('commit.amend')}
          </label>
          <span className="spacer" />
          {result && (
            <span className={`ce-result ${result.ok ? 'ok' : 'err'}`} role="status">
              {result.ok ? `✓ ${t('commit.done')}` : `✕ ${(result.stderr || 'error').split('\n')[0]}`}
            </span>
          )}
          <button className="commit-btn" onClick={onCommit} disabled={busy || !canCommit}>
            {busy ? t('commit.creating') : amend ? t('commit.amendBtn') : 'Commit'}
          </button>
        </div>
      </div>

      {showClean && (
        <CleanDialog
          repoPath={repoPath}
          onDone={async (res) => {
            setResult(res)
            await refresh()
            onCommitted()
          }}
          onClose={() => setShowClean(false)}
        />
      )}
      {confirm && <ConfirmDialog {...confirm} onCancel={() => setConfirm(null)} />}
    </div>
  )
}

export default CommitPanel
