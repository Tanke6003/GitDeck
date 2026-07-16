import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FileStatus, GitResult, RepoState } from '@shared/types'
import { ansiToHtml } from '../lib/ansi'

/** Tipos Conventional Commits. */
const TYPES = [
  '',
  'feat',
  'fix',
  'docs',
  'style',
  'refactor',
  'perf',
  'test',
  'build',
  'ci',
  'chore',
  'revert'
]

const SUBJECT_SOFT = 50 // recomendado
const SUBJECT_HARD = 72 // límite

interface Props {
  repoPath: string
  onCommitted: () => void
}

/**
 * Panel de commit (Fase 6): staging por archivo, diff de lo preparado y un
 * editor de mensaje MULTILÍNEA con formato Conventional Commits. El mensaje se
 * envía por stdin (no `-m`), así conserva encabezado + cuerpo con saltos de línea.
 */
function CommitPanel({ repoPath, onCommitted }: Props): JSX.Element {
  const [files, setFiles] = useState<FileStatus[]>([])
  const [diffHtml, setDiffHtml] = useState<string>('')
  const [diffFile, setDiffFile] = useState<string | null>(null)

  const [type, setType] = useState('')
  const [scope, setScope] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [amend, setAmend] = useState(false)

  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<GitResult | null>(null)
  const [state, setState] = useState<RepoState | null>(null)

  const staged = files.filter((f) => f.staged)
  const conflicts = files.filter((f) => f.conflicted)
  const changes = files.filter((f) => f.unstaged && !f.conflicted)

  const loadDiff = useCallback(
    async (path?: string, cached = true) => {
      const res = await window.api.stagedDiff(repoPath, path, cached)
      setDiffHtml(ansiToHtml((res.stdout || '').replace(/\s+$/, '')))
      setDiffFile(path ?? null)
    },
    [repoPath]
  )

  const refresh = useCallback(async () => {
    const [list, st] = await Promise.all([
      window.api.status(repoPath),
      window.api.repoState(repoPath)
    ])
    setFiles(list)
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

  // --- merge / rebase en curso ---
  const onResolve = useCallback(
    async (f: FileStatus) => {
      await window.api.stage(repoPath, f.path) // stage = marcar resuelto
      await refresh()
    },
    [repoPath, refresh]
  )
  const onContinue = useCallback(async () => {
    setBusy(true)
    const res = state?.merging
      ? await window.api.mergeContinue(repoPath)
      : await window.api.rebaseContinue(repoPath)
    setResult(res)
    setBusy(false)
    await refresh()
    onCommitted()
  }, [state, repoPath, refresh, onCommitted])
  const onAbort = useCallback(async () => {
    setBusy(true)
    const res = state?.merging
      ? await window.api.mergeAbort(repoPath)
      : await window.api.rebaseAbort(repoPath)
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

  const canCommit = (subject.trim().length > 0 && staged.length > 0) || (amend && staged.length >= 0)

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

  const fileRow = (f: FileStatus, staged: boolean): JSX.Element => (
    <li
      key={f.path}
      className={`file-row ${diffFile === f.path ? 'active' : ''}`}
      onClick={() => (staged ? loadDiff(f.path) : undefined)}
      title={staged ? 'ver diff' : f.path}
    >
      <span className={`fstat ${f.untracked ? 'new' : ''}`}>
        {f.untracked ? '?' : staged ? f.index : f.work}
      </span>
      <span className="fpath">{f.path}</span>
      <button
        className="file-act"
        onClick={(e) => {
          e.stopPropagation()
          staged ? onUnstage(f) : onStage(f)
        }}
        title={staged ? 'quitar de staging' : 'preparar (stage)'}
      >
        {staged ? '−' : '＋'}
      </button>
    </li>
  )

  return (
    <div className="commit-panel">
      {(state?.merging || state?.rebasing) && (
        <div className="merge-banner">
          <span className="mb-label">⚠ {state.merging ? 'Merge' : 'Rebase'} en curso</span>
          <span className="mb-info">
            {state.conflicted.length > 0
              ? `${state.conflicted.length} conflicto(s): resuélvelos, marca ✓, y Continuar`
              : 'sin conflictos pendientes — puedes Continuar'}
          </span>
          <span className="spacer" />
          <button onClick={onContinue} disabled={busy || state.conflicted.length > 0}>
            Continuar
          </button>
          <button className="danger" onClick={onAbort} disabled={busy}>
            Abortar
          </button>
        </div>
      )}

      <div className="commit-top">
        <div className="file-lists">
          {conflicts.length > 0 && (
            <>
              <div className="pane-title conflict">
                Conflictos <span className="count">{conflicts.length}</span>
              </div>
              <ul className="file-list">
                {conflicts.map((f) => (
                  <li
                    key={f.path}
                    className={`file-row conflict ${diffFile === f.path ? 'active' : ''}`}
                    onClick={() => loadDiff(f.path, false)}
                    title="ver diff del conflicto"
                  >
                    <span className="fstat conf">!</span>
                    <span className="fpath">{f.path}</span>
                    <button
                      className="file-act ok"
                      onClick={(e) => {
                        e.stopPropagation()
                        onResolve(f)
                      }}
                      title="marcar resuelto (stage)"
                    >
                      ✓
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="pane-title">
            Preparado (staged) <span className="count">{staged.length}</span>
            {staged.length > 0 && (
              <button className="link" onClick={onUnstageAll}>
                quitar todo
              </button>
            )}
          </div>
          <ul className="file-list">
            {staged.length === 0 && <li className="mini pad">nada preparado</li>}
            {staged.map((f) => fileRow(f, true))}
          </ul>

          <div className="pane-title">
            Cambios <span className="count">{changes.length}</span>
            {changes.length > 0 && (
              <button className="link" onClick={onStageAll}>
                preparar todo
              </button>
            )}
          </div>
          <ul className="file-list">
            {changes.length === 0 && <li className="mini pad">sin cambios</li>}
            {changes.map((f) => fileRow(f, false))}
          </ul>
        </div>

        <div className="diff-view">
          <div className="pane-title">
            Diff preparado {diffFile ? <span className="mini">— {diffFile}</span> : <span className="mini">— todo</span>}
            {diffFile && (
              <button className="link" onClick={() => loadDiff()}>
                ver todo
              </button>
            )}
          </div>
          {diffHtml ? (
            <pre className="diff-body" dangerouslySetInnerHTML={{ __html: diffHtml }} />
          ) : (
            <div className="diff-empty">Nada preparado. Prepara archivos (＋) para ver el diff.</div>
          )}
        </div>
      </div>

      <div className="commit-editor">
        <div className="ce-header">
          <select value={type} onChange={(e) => setType(e.target.value)} title="tipo (Conventional Commits)">
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t || '(sin tipo)'}
              </option>
            ))}
          </select>
          <input
            className="ce-scope"
            placeholder="scope (opcional)"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
          />
          <input
            className="ce-subject"
            placeholder="resumen breve del cambio"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
          <span className={`ce-count ${lenClass}`} title="longitud del encabezado (rec. ≤50, máx 72)">
            {headerLen}
          </span>
        </div>

        {header && (
          <div className="ce-preview">
            <span className="mini">encabezado:</span> <code>{header}</code>
          </div>
        )}

        <textarea
          className="ce-body"
          placeholder={
            'Cuerpo (opcional, multilínea).\n\n- explica el qué y el porqué\n- BREAKING CHANGE: … / Refs #123'
          }
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
        />

        <div className="ce-actions">
          <label className="ce-amend">
            <input type="checkbox" checked={amend} onChange={(e) => setAmend(e.target.checked)} />
            amend (rehacer último commit)
          </label>
          <span className="spacer" />
          {result && (
            <span className={`ce-result ${result.ok ? 'ok' : 'err'}`}>
              {result.ok ? '✓ commit creado' : `✕ ${(result.stderr || 'error').split('\n')[0]}`}
            </span>
          )}
          <button className="commit-btn" onClick={onCommit} disabled={busy || !canCommit}>
            {busy ? 'creando…' : amend ? 'Amend commit' : 'Commit'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default CommitPanel
