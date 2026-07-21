import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BranchInfo, Commit, GitResult, MergeOpts, MergePreview, PullMode, RemoteInfo, RepoInfo } from '@shared/types'
import { explainGitError } from '../lib/gitError'
import { useI18n } from '../lib/i18n'
import CommitGraph from './CommitGraph'
import AliasPanel from './AliasPanel'
import CommitPanel from './CommitPanel'
import CommitDetailDrawer from './CommitDetailDrawer'
import ConfirmDialog from './ConfirmDialog'
import type { ConfirmSpec } from './ConfirmDialog'
import MergePreviewDialog from './MergePreviewDialog'
import StashPanel from './StashPanel'
import TagPanel from './TagPanel'
import SearchBar from './SearchBar'
import ReflogDialog from './ReflogDialog'
import CompareDialog from './CompareDialog'
import ShortcutsDialog from './ShortcutsDialog'
import { LocalBranchList, RemoteBranchList } from './BranchLists'
import RemoteList from './RemoteList'

const GRAPH_PAGE = 400
const PULL_MODE_KEY = 'gitdeck.pullMode'

interface Props {
  repo: RepoInfo
  /** contador que sube cuando la ventana recupera el foco (refresco unico desde App) */
  focusTick: number
  onRemove: (path: string) => void
  onChanged: () => void
}

/**
 * Panel de un repo: cabecera + acciones (fetch/pull/push, nueva rama, comparar,
 * reflog), grafo de commits, y panel lateral con ramas, remotos, stashes y tags.
 * El patron busy→api→result→reload vive en `runAction`; las listas del lateral
 * son subcomponentes (BranchLists, RemoteList).
 */
function RepoDetail({ repo, focusTick, onRemove, onChanged }: Props): JSX.Element {
  const { t } = useI18n()
  const [commits, setCommits] = useState<Commit[]>([])
  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [remotes, setRemotes] = useState<RemoteInfo[]>([])
  /** primer error de lectura del grafo/ramas/remotos (antes se tragaba) */
  const [loadErr, setLoadErr] = useState<GitResult | null>(null)
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null)
  // resultados de busqueda; null = sin busqueda activa (se muestra el grafo)
  const [search, setSearch] = useState<Commit[] | null>(null)
  const [showReflog, setShowReflog] = useState(false)
  const [showCompare, setShowCompare] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null) // etiqueta de accion en curso
  const [result, setResult] = useState<GitResult | null>(null)
  const [showNewBranch, setShowNewBranch] = useState(false)
  const [newBranch, setNewBranch] = useState('')
  const [tab, setTab] = useState<'tree' | 'commit' | 'alias'>('tree')
  const [limit, setLimit] = useState(GRAPH_PAGE)
  const [pullMode, setPullMode] = useState<PullMode>(() => {
    const saved = localStorage.getItem(PULL_MODE_KEY)
    return saved === 'rebase' || saved === 'ff-only' ? saved : 'merge'
  })

  // dialogos: confirmacion generica y vista previa de merge
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null)
  const [mergeBranch, setMergeBranch] = useState<string | null>(null)
  const [mergePreview, setMergePreview] = useState<MergePreview | null>(null)
  const mergeReq = useRef(0) // descarta vistas previas de clicks ya superados

  // explicacion legible del ultimo fallo de git (null si fue bien o no se reconoce)
  const hint = useMemo(() => explainGitError(result), [result])

  const load = useCallback(async () => {
    if (!repo.valid) return
    setLoading(true)
    const [c, b, r] = await Promise.all([
      window.api.commits(repo.path, limit),
      window.api.branches(repo.path),
      window.api.remotes(repo.path)
    ])
    setCommits(c.data)
    setBranches(b.data)
    setRemotes(r.data)
    setLoadErr(c.error ?? b.error ?? r.error)
    setLoading(false)
  }, [repo.path, repo.valid, limit])

  useEffect(() => {
    setResult(null)
    setSelectedCommit(null)
    setSearch(null)
    load()
  }, [load])

  // recarga info del repo (rama/estado en el sidebar) + grafo/ramas
  const reloadAll = useCallback(async () => {
    await load()
    onChanged()
  }, [load, onChanged])

  // refresco al recuperar el foco: lo dispara App (un solo listener para toda
  // la app; antes App y RepoDetail registraban ambos y todo corria dos veces)
  const loadRef = useRef(load)
  useEffect(() => {
    loadRef.current = load
  })
  useEffect(() => {
    if (focusTick > 0) loadRef.current()
  }, [focusTick])

  /** patron unico de accion: busy -> api -> result -> reload */
  const runAction = useCallback(
    async (label: string, fn: () => Promise<GitResult>): Promise<GitResult> => {
      setBusy(label)
      const res = await fn()
      setResult(res)
      setBusy(null)
      await reloadAll()
      return res
    },
    [reloadAll]
  )

  // los resultados OK se auto-descartan (los errores se quedan hasta cerrarlos)
  useEffect(() => {
    if (!result?.ok) return
    const timer = setTimeout(() => setResult(null), 6000)
    return () => clearTimeout(timer)
  }, [result])

  const onFetchRef = useRef<() => void>(() => {})

  /**
   * Atajos de teclado. Las combinaciones con Ctrl (y F5) no chocan con escribir;
   * "?" solo se atiende fuera de un campo de texto.
   * Ctrl+F lo maneja el propio buscador, que es quien tiene su input.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const ctrl = e.ctrlKey || e.metaKey
      const el = e.target as HTMLElement | null
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
      if (e.key === 'F5' || (ctrl && e.key.toLowerCase() === 'r')) {
        e.preventDefault()
        reloadAll()
      } else if (ctrl && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        onFetchRef.current()
      } else if (ctrl && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        setTab('tree')
        setShowNewBranch((s) => !s)
      } else if (e.key === '?' && !ctrl && !typing) {
        setShowShortcuts((s) => !s)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [reloadAll])

  const onFetch = useCallback(() => runAction('fetch', () => window.api.fetchAll(repo.path)), [runAction, repo.path])

  // el atajo llama al fetch de siempre; via ref para no re-registrar el listener
  // en cada render (onFetch se recrea cuando cambia el repo)
  useEffect(() => {
    onFetchRef.current = () => {
      if (!busy) onFetch()
    }
  }, [onFetch, busy])

  const onCreateBranch = useCallback(async () => {
    const name = newBranch.trim()
    if (!name) return
    const res = await runAction('branch', () => window.api.createBranch(repo.path, name, undefined, true))
    if (res.ok) {
      setNewBranch('')
      setShowNewBranch(false)
    }
  }, [newBranch, repo.path, runAction])

  // --- checkout (con aviso si hay cambios sin guardar) ---

  const doCheckout = useCallback(
    (b: BranchInfo) =>
      runAction(`co:${b.name}`, () =>
        // una remota "origin/foo" crea/usa la local "foo" que la sigue (--track)
        b.isRemote ? window.api.checkoutRemote(repo.path, b.name) : window.api.checkout(repo.path, b.name)
      ),
    [repo.path, runAction]
  )

  const onCheckout = useCallback(
    (b: BranchInfo) => {
      if (b.isCurrent) return
      // avisamos ANTES en vez de dejar que git falle (o arrastre los cambios)
      if (repo.dirty) {
        setConfirm({
          title: t('checkout.dirty.title'),
          message: t('checkout.dirty.msg', { repo: repo.name, branch: b.name }),
          confirmLabel: t('checkout.dirty.confirm'),
          onConfirm: () => {
            setConfirm(null)
            doCheckout(b)
          }
        })
        return
      }
      doCheckout(b)
    },
    [repo.dirty, repo.name, doCheckout, t]
  )

  // --- merge con vista previa ---

  const onMergeClick = useCallback(
    async (name: string) => {
      const id = ++mergeReq.current
      setMergeBranch(name)
      setMergePreview(null)
      const p = await window.api.mergePreview(repo.path, name)
      if (mergeReq.current === id) setMergePreview(p) // ignora clicks superados
    },
    [repo.path]
  )

  const closeMerge = useCallback(() => {
    mergeReq.current++
    setMergeBranch(null)
    setMergePreview(null)
  }, [])

  const doMerge = useCallback(
    async (opts: MergeOpts) => {
      if (!mergeBranch) return
      const branch = mergeBranch
      closeMerge()
      const res = await runAction('merge', () => window.api.merge(repo.path, branch, opts))
      // conflictos (o error): llevar a la pestaña Commit para resolver
      if (!res.ok) setTab('commit')
    },
    [mergeBranch, repo.path, runAction, closeMerge]
  )

  /** rebase con confirmacion previa: reescribe la rama actual, igual de serio que un merge */
  const onRebase = useCallback(
    (name: string) => {
      setConfirm({
        title: t('rebase.title', { name }),
        message: t('rebase.msg', { name }),
        confirmLabel: 'rebase',
        danger: true,
        onConfirm: async () => {
          setConfirm(null)
          const res = await runAction('rebase', () => window.api.rebase(repo.path, name))
          if (!res.ok) setTab('commit')
        }
      })
    },
    [repo.path, runAction, t]
  )

  const onPull = useCallback(async () => {
    const opts = pullMode === 'rebase' ? { rebase: true } : pullMode === 'ff-only' ? { ffOnly: true } : {}
    const res = await runAction('pull', () => window.api.pull(repo.path, opts))
    if (!res.ok) setTab('commit') // posibles conflictos
  }, [repo.path, runAction, pullMode])

  const onPush = useCallback(() => {
    const cur = branches.find((b) => b.isCurrent)
    // rama sin upstream -> publicar con -u
    return runAction('push', () =>
      cur && !cur.upstream
        ? window.api.push(repo.path, { setUpstream: true, branch: cur.name })
        : window.api.push(repo.path)
    )
  }, [repo.path, branches, runAction])

  /** el push fallo por non-fast-forward (tipico tras amend/rebase): ofrecer el force seguro */
  const pushRejected = useMemo(
    () =>
      !!result &&
      !result.ok &&
      result.cmd.startsWith('git push') &&
      /non-fast-forward|fetch first|\[rejected\]|failed to push/i.test(`${result.stderr}\n${result.stdout}`),
    [result]
  )

  const onForcePush = useCallback(() => {
    setConfirm({
      title: t('push.force.title'),
      message: t('push.force.msg'),
      confirmLabel: t('push.force.confirm'),
      danger: true,
      onConfirm: () => {
        setConfirm(null)
        runAction('push', () => window.api.push(repo.path, { forceWithLease: true }))
      }
    })
  }, [repo.path, runAction, t])

  // --- borrar / renombrar ramas ---

  const runDeleteBranch = useCallback(
    (name: string, force: boolean) => runAction('branch', () => window.api.deleteBranch(repo.path, name, force)),
    [repo.path, runAction]
  )

  const onDeleteBranch = useCallback(
    (b: BranchInfo) => {
      setConfirm({
        title: t('branch.delete.title', { name: b.name }),
        message: t('branch.delete.msg', { name: b.name }),
        confirmLabel: t('branch.delete.confirm'),
        danger: true,
        onConfirm: async () => {
          setConfirm(null)
          const res = await runDeleteBranch(b.name, false)
          // git rechaza -d si la rama no está fusionada: ofrecer -D explicitamente
          if (!res.ok && /not fully merged/i.test(res.stderr)) {
            setConfirm({
              title: t('branch.notMerged.title', { name: b.name }),
              message: t('branch.notMerged.msg'),
              confirmLabel: t('branch.notMerged.confirm'),
              danger: true,
              onConfirm: () => {
                setConfirm(null)
                runDeleteBranch(b.name, true)
              }
            })
          }
        }
      })
    },
    [runDeleteBranch, t]
  )

  const onDeleteRemoteBranch = useCallback(
    (b: BranchInfo) => {
      const [remote, ...rest] = b.name.split('/')
      const branch = rest.join('/')
      if (!remote || !branch) return
      setConfirm({
        title: t('branch.deleteRemote.title', { branch, remote }),
        message: t('branch.deleteRemote.msg', { branch, remote }),
        confirmLabel: t('branch.deleteRemote.confirm'),
        danger: true,
        onConfirm: () => {
          setConfirm(null)
          runAction('branch', () => window.api.deleteRemoteBranch(repo.path, remote, branch))
        }
      })
    },
    [repo.path, runAction, t]
  )

  const onRenameBranch = useCallback(
    async (oldName: string, newName: string): Promise<void> => {
      await runAction('branch', () => window.api.renameBranch(repo.path, oldName, newName))
    },
    [repo.path, runAction]
  )

  // --- remotos ---

  const onAddRemote = useCallback(
    async (name: string, url: string): Promise<boolean> => {
      const res = await runAction('remote', () => window.api.addRemote(repo.path, name, url))
      return res.ok
    },
    [repo.path, runAction]
  )

  /** quitar remoto ahora confirma: es recuperable, pero consistente con el resto */
  const onRemoveRemote = useCallback(
    (name: string) => {
      setConfirm({
        title: t('remote.removeConfirm.title', { name }),
        message: t('remote.removeConfirm.msg', { name }),
        confirmLabel: t('remote.removeConfirm.confirm'),
        danger: true,
        onConfirm: () => {
          setConfirm(null)
          runAction('remote', () => window.api.removeRemote(repo.path, name))
        }
      })
    },
    [repo.path, runAction, t]
  )

  const onRenameRemote = useCallback(
    async (oldName: string, newName: string): Promise<void> => {
      await runAction('remote', () => window.api.renameRemote(repo.path, oldName, newName))
    },
    [repo.path, runAction]
  )

  /** quitar el repo de la lista tambien confirma (estaba pegado a acciones frecuentes) */
  const onRemoveRepo = useCallback(() => {
    setConfirm({
      title: t('repo.remove.title', { name: repo.name }),
      message: t('repo.remove.msg'),
      confirmLabel: t('repo.remove.confirm'),
      danger: true,
      onConfirm: () => {
        setConfirm(null)
        onRemove(repo.path)
      }
    })
  }, [repo.name, repo.path, onRemove, t])

  const locals = branches.filter((b) => !b.isRemote)
  const remoteBranches = branches.filter((b) => b.isRemote)
  const compareRefs = useMemo(() => ['HEAD', ...branches.map((b) => b.name)], [branches])

  const spin = (label: string, text: string): JSX.Element | string =>
    busy === label ? (
      <>
        <span className="spinner sm" aria-hidden="true" /> {text}…
      </>
    ) : (
      text
    )

  return (
    <div className="repo-detail">
      <header className="detail-header">
        <div className="detail-title">
          <h1>
            {repo.name}
            {!repo.valid && <span className="badge warn">{t('repo.invalid')}</span>}
            {repo.valid && repo.dirty && <span className="badge dirty">{t('repo.dirty')}</span>}
            {repo.valid && !repo.dirty && <span className="badge clean">{t('repo.clean')}</span>}
          </h1>
          <div className="detail-sub">
            <span className="branch-name">{repo.currentBranch ?? 'HEAD detached'}</span>
            <span className="detail-path">{repo.path}</span>
          </div>
        </div>
        <div className="detail-actions">
          {repo.valid && (
            <>
              <button onClick={onFetch} disabled={!!busy} title={t('sync.fetch.title')}>
                {spin('fetch', '⟱ Fetch')}
              </button>
              <span className="pull-group">
                <button onClick={onPull} disabled={!!busy} title={t(`sync.pull.title.${pullMode}`)}>
                  {spin('pull', '↓ Pull')}
                </button>
                <select
                  className="pull-mode"
                  value={pullMode}
                  aria-label={t('sync.pull.mode')}
                  title={t('sync.pull.mode')}
                  onChange={(e) => {
                    const m = e.target.value as PullMode
                    setPullMode(m)
                    localStorage.setItem(PULL_MODE_KEY, m)
                  }}
                >
                  <option value="merge">merge</option>
                  <option value="rebase">--rebase</option>
                  <option value="ff-only">--ff-only</option>
                </select>
              </span>
              <button onClick={onPush} disabled={!!busy} title={t('sync.push.title')}>
                {spin('push', '↑ Push')}
              </button>
            </>
          )}
          {tab === 'tree' && repo.valid && (
            <>
              <button
                onClick={() => setShowNewBranch((s) => !s)}
                disabled={!!busy}
                title={t('branch.new.title')}
              >
                ＋ {t('branch.new')}
              </button>
              <button onClick={() => setShowCompare(true)} disabled={!!busy} title={t('compare.btnTitle')}>
                ⇆ {t('compare.btn')}
              </button>
              <button onClick={() => setShowReflog(true)} disabled={!!busy} title={t('reflog.btnTitle')}>
                ⏱ Reflog
              </button>
            </>
          )}
          <button onClick={reloadAll} disabled={!!busy} aria-label={t('repo.reload')} title={t('repo.reloadTitle')}>
            ↻
          </button>
          <button
            onClick={() => setShowShortcuts(true)}
            aria-label={t('keys.title')}
            title={`${t('keys.title')} (?)`}
          >
            ?
          </button>
          <button className="danger detach" onClick={onRemoveRepo} title={t('repo.remove.btnTitle')}>
            {t('repo.remove.btn')}
          </button>
        </div>
      </header>

      {repo.valid && (
        <div className="detail-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'tree'} className={tab === 'tree' ? 'active' : ''} onClick={() => setTab('tree')}>
            {t('tabs.tree')}
          </button>
          <button role="tab" aria-selected={tab === 'commit'} className={tab === 'commit' ? 'active' : ''} onClick={() => setTab('commit')}>
            Commit
            {repo.dirty && (
              <span className="tab-dot" role="img" aria-label={t('repo.dirty')} title={t('repo.dirty')} />
            )}
          </button>
          <button role="tab" aria-selected={tab === 'alias'} className={tab === 'alias' ? 'active' : ''} onClick={() => setTab('alias')}>
            Alias
          </button>
        </div>
      )}

      {tab === 'tree' && showNewBranch && (
        <div className="new-branch-bar">
          <input
            autoFocus
            placeholder={t('branch.namePlaceholder')}
            aria-label={t('branch.new')}
            value={newBranch}
            onChange={(e) => setNewBranch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onCreateBranch()
              if (e.key === 'Escape') setShowNewBranch(false)
            }}
          />
          <span className="hint">{t('branch.newHint')}</span>
          <button onClick={onCreateBranch} disabled={busy === 'branch' || !newBranch.trim()}>
            {t('common.create')}
          </button>
          <button className="link" onClick={() => setShowNewBranch(false)}>
            {t('common.cancel')}
          </button>
        </div>
      )}

      {!repo.valid ? (
        <div className="detail-error" role="alert">
          {repo.error}
        </div>
      ) : tab === 'alias' ? (
        <AliasPanel repoPath={repo.path} />
      ) : tab === 'commit' ? (
        <CommitPanel repoPath={repo.path} onCommitted={reloadAll} />
      ) : (
        <div className="detail-body">
          <section className="graph-pane">
            {loadErr && (
              <div className="pane-error big" role="alert">
                <b>{t('common.readError')}</b> — <code>{loadErr.cmd}</code>
                <pre>{(loadErr.stderr || loadErr.stdout).trim()}</pre>
              </div>
            )}
            {/* key: al cambiar de repo se remonta y limpia texto y resultados */}
            <SearchBar
              key={repo.path}
              repoPath={repo.path}
              results={search}
              onResults={setSearch}
              onPick={setSelectedCommit}
            />
            {!search && (
              <>
                <div className="pane-title">
                  {t('graph.title')} {loading && <span className="mini">{t('common.loading')}</span>}
                  <span className="mini">{t('graph.count', { n: commits.length })}</span>
                </div>
                <div className="graph-scroll">
                  <CommitGraph
                    commits={commits}
                    remotes={remotes.map((r) => r.name)}
                    selected={selectedCommit}
                    onSelect={setSelectedCommit}
                  />
                  {commits.length >= limit && (
                    <div className="graph-more">
                      <button className="link" onClick={() => setLimit((l) => l + GRAPH_PAGE)} disabled={loading}>
                        {t('graph.loadMore', { n: GRAPH_PAGE })}
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </section>

          <aside className="side-pane">
            <h2 className="pane-title">
              {t('branch.locals')} <span className="count">{locals.length}</span>
            </h2>
            <LocalBranchList
              branches={locals}
              busy={!!busy}
              onCheckout={onCheckout}
              onMerge={onMergeClick}
              onRebase={onRebase}
              onDelete={onDeleteBranch}
              onRename={onRenameBranch}
            />

            <h2 className="pane-title">
              {t('branch.remotes')} <span className="count">{remoteBranches.length}</span>
            </h2>
            <RemoteBranchList
              branches={remoteBranches}
              busy={!!busy}
              onCheckout={onCheckout}
              onMerge={onMergeClick}
              onDeleteRemote={onDeleteRemoteBranch}
            />

            <RemoteList
              remotes={remotes}
              busy={!!busy}
              onAdd={onAddRemote}
              onRemove={onRemoveRemote}
              onRename={onRenameRemote}
            />

            <StashPanel
              repoPath={repo.path}
              dirty={repo.dirty}
              parentBusy={!!busy}
              onChanged={reloadAll}
              onResult={setResult}
            />

            <TagPanel
              repoPath={repo.path}
              remotes={remotes.map((r) => r.name)}
              parentBusy={!!busy}
              onChanged={reloadAll}
              onResult={setResult}
            />
          </aside>
        </div>
      )}

      {result && (
        <div className={`action-result ${result.ok ? 'ok' : 'err'}`} role="status" aria-live="polite">
          <div className="ar-head">
            <span className="ar-cmd">$ {result.cmd}</span>
            <button className="link" onClick={() => setResult(null)} aria-label={t('common.close')}>
              ✕
            </button>
          </div>
          {/* la explicación acompaña a la salida cruda, nunca la sustituye */}
          {hint && (
            <div className="ar-hint">
              <b>{hint.title}</b>
              <span>{hint.hint}</span>
            </div>
          )}
          {pushRejected && (
            <div className="ar-hint">
              <button className="force-push" onClick={onForcePush} disabled={!!busy}>
                {t('push.force.retry')}
              </button>
            </div>
          )}
          <pre>{(result.stdout || result.stderr || t('common.noOutput')).trim()}</pre>
        </div>
      )}

      {tab === 'tree' && selectedCommit && (
        <CommitDetailDrawer
          repoPath={repo.path}
          hash={selectedCommit}
          dirty={repo.dirty}
          onBranchCreated={reloadAll}
          onApplied={reloadAll}
          onClose={() => setSelectedCommit(null)}
        />
      )}

      {mergeBranch && (
        <MergePreviewDialog
          preview={mergePreview}
          branch={mergeBranch}
          busy={busy === 'merge'}
          onConfirm={doMerge}
          onCancel={closeMerge}
        />
      )}

      {showReflog && <ReflogDialog repoPath={repo.path} onChanged={reloadAll} onClose={() => setShowReflog(false)} />}

      {showCompare && <CompareDialog repoPath={repo.path} refs={compareRefs} onClose={() => setShowCompare(false)} />}

      {showShortcuts && <ShortcutsDialog onClose={() => setShowShortcuts(false)} />}

      {confirm && <ConfirmDialog {...confirm} onCancel={() => setConfirm(null)} />}
    </div>
  )
}

export default RepoDetail
