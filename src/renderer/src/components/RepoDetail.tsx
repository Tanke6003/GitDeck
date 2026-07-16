import { useCallback, useEffect, useState } from 'react'
import type { BranchInfo, Commit, GitResult, RemoteInfo, RepoInfo } from '@shared/types'
import CommitGraph from './CommitGraph'
import AliasPanel from './AliasPanel'
import CommitPanel from './CommitPanel'
import CommitDetailDrawer from './CommitDetailDrawer'

interface Props {
  repo: RepoInfo
  onRemove: (path: string) => void
  onChanged: () => void
}

/**
 * Panel de un repo: cabecera + acciones (fetch / nueva rama), grafo de commits,
 * y a la derecha las ramas (con checkout) y los remotos.
 */
function RepoDetail({ repo, onRemove, onChanged }: Props): JSX.Element {
  const [commits, setCommits] = useState<Commit[]>([])
  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [remotes, setRemotes] = useState<RemoteInfo[]>([])
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null) // etiqueta de accion en curso
  const [result, setResult] = useState<GitResult | null>(null)
  const [showNewBranch, setShowNewBranch] = useState(false)
  const [newBranch, setNewBranch] = useState('')
  const [tab, setTab] = useState<'tree' | 'commit' | 'alias'>('tree')

  const load = useCallback(async () => {
    if (!repo.valid) return
    setLoading(true)
    const [c, b, r] = await Promise.all([
      window.api.commits(repo.path),
      window.api.branches(repo.path),
      window.api.remotes(repo.path)
    ])
    setCommits(c)
    setBranches(b)
    setRemotes(r)
    setLoading(false)
  }, [repo.path, repo.valid])

  useEffect(() => {
    setResult(null)
    setSelectedCommit(null)
    load()
  }, [load])

  // recarga info del repo (rama/estado en el sidebar) + grafo/ramas
  const reloadAll = useCallback(async () => {
    await load()
    onChanged()
  }, [load, onChanged])

  // auto-refresh al volver el foco a la ventana (p. ej. tras usar la terminal)
  useEffect(() => {
    const onFocus = (): void => {
      reloadAll()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [reloadAll])

  const onFetch = useCallback(async () => {
    setBusy('fetch')
    const res = await window.api.fetchAll(repo.path)
    setResult(res)
    setBusy(null)
    await reloadAll()
  }, [repo.path, reloadAll])

  const onCreateBranch = useCallback(async () => {
    const name = newBranch.trim()
    if (!name) return
    setBusy('branch')
    const res = await window.api.createBranch(repo.path, name, undefined, true)
    setResult(res)
    setBusy(null)
    if (res.ok) {
      setNewBranch('')
      setShowNewBranch(false)
      await reloadAll()
    }
  }, [newBranch, repo.path, reloadAll])

  const onCheckout = useCallback(
    async (b: BranchInfo) => {
      if (b.isCurrent) return
      // para una remota "origin/foo" cambiamos a la local "foo" (git DWIM)
      const target = b.isRemote ? b.name.split('/').slice(1).join('/') : b.name
      setBusy(`co:${b.name}`)
      const res = await window.api.checkout(repo.path, target)
      setResult(res)
      setBusy(null)
      await reloadAll()
    },
    [repo.path, reloadAll]
  )

  const onMerge = useCallback(
    async (name: string) => {
      setBusy('merge')
      const res = await window.api.merge(repo.path, name)
      setResult(res)
      setBusy(null)
      await reloadAll()
      // conflictos (o error): llevar a la pestaña Commit para resolver
      if (!res.ok) setTab('commit')
    },
    [repo.path, reloadAll]
  )

  const onRebase = useCallback(
    async (name: string) => {
      setBusy('rebase')
      const res = await window.api.rebase(repo.path, name)
      setResult(res)
      setBusy(null)
      await reloadAll()
      if (!res.ok) setTab('commit')
    },
    [repo.path, reloadAll]
  )

  const locals = branches.filter((b) => !b.isRemote)
  const remoteBranches = branches.filter((b) => b.isRemote)

  return (
    <div className="repo-detail">
      <header className="detail-header">
        <div className="detail-title">
          <h1>
            {repo.name}
            {!repo.valid && <span className="badge warn">no valido</span>}
            {repo.valid && repo.dirty && <span className="badge dirty">cambios</span>}
            {repo.valid && !repo.dirty && <span className="badge clean">limpio</span>}
          </h1>
          <div className="detail-sub">
            <span className="branch-name">{repo.currentBranch ?? 'HEAD detached'}</span>
            <span className="detail-path">{repo.path}</span>
          </div>
        </div>
        <div className="detail-actions">
          {tab === 'tree' && (
            <>
              <button onClick={onFetch} disabled={!!busy} title="git fetch --all --prune">
                {busy === 'fetch' ? '⏳ fetch…' : '⟱ Fetch'}
              </button>
              <button onClick={() => setShowNewBranch((s) => !s)} disabled={!!busy}>
                ＋ Nueva rama
              </button>
            </>
          )}
          <button onClick={reloadAll} disabled={!!busy} title="Recargar">
            ↻
          </button>
          <button className="danger" onClick={() => onRemove(repo.path)} title="Quitar de la lista">
            Quitar
          </button>
        </div>
      </header>

      {repo.valid && (
        <div className="detail-tabs">
          <button className={tab === 'tree' ? 'active' : ''} onClick={() => setTab('tree')}>
            Árbol
          </button>
          <button className={tab === 'commit' ? 'active' : ''} onClick={() => setTab('commit')}>
            Commit{repo.dirty && <span className="tab-dot" />}
          </button>
          <button className={tab === 'alias' ? 'active' : ''} onClick={() => setTab('alias')}>
            Alias
          </button>
        </div>
      )}

      {tab === 'tree' && showNewBranch && (
        <div className="new-branch-bar">
          <input
            autoFocus
            placeholder="nombre-de-la-rama"
            value={newBranch}
            onChange={(e) => setNewBranch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onCreateBranch()}
          />
          <span className="hint">se crea desde HEAD y cambia a ella (switch -c)</span>
          <button onClick={onCreateBranch} disabled={busy === 'branch' || !newBranch.trim()}>
            Crear
          </button>
          <button className="link" onClick={() => setShowNewBranch(false)}>
            cancelar
          </button>
        </div>
      )}

      {!repo.valid ? (
        <div className="detail-error">{repo.error}</div>
      ) : tab === 'alias' ? (
        <AliasPanel repoPath={repo.path} />
      ) : tab === 'commit' ? (
        <CommitPanel repoPath={repo.path} onCommitted={reloadAll} />
      ) : (
        <div className="detail-body">
          <section className="graph-pane">
            <div className="pane-title">
              Árbol de commits {loading && <span className="mini">cargando…</span>}
              <span className="mini">{commits.length} commits (todas las ramas)</span>
            </div>
            <div className="graph-scroll">
              <CommitGraph
                commits={commits}
                selected={selectedCommit}
                onSelect={setSelectedCommit}
              />
            </div>
          </section>

          <aside className="side-pane">
            <div className="pane-title">Ramas locales <span className="count">{locals.length}</span></div>
            <ul className="branch-list">
              {locals.map((b) => (
                <li
                  key={b.name}
                  className={`branch-row ${b.isCurrent ? 'current' : ''}`}
                  onClick={() => onCheckout(b)}
                  title={b.isCurrent ? 'rama actual' : `cambiar a ${b.name}`}
                >
                  <span className="b-mark">{b.isCurrent ? '●' : '○'}</span>
                  <span className="b-name">{b.name}</span>
                  {b.upstream && <span className="b-up">→ {b.upstream}</span>}
                  {!b.isCurrent && (
                    <span className="b-actions">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onMerge(b.name)
                        }}
                        disabled={!!busy}
                        title={`merge ${b.name} en la rama actual`}
                      >
                        merge
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onRebase(b.name)
                        }}
                        disabled={!!busy}
                        title={`rebase de la rama actual sobre ${b.name}`}
                      >
                        rebase
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>

            <div className="pane-title">Ramas remotas <span className="count">{remoteBranches.length}</span></div>
            <ul className="branch-list">
              {remoteBranches.map((b) => (
                <li key={b.name} className="branch-row remote">
                  <span
                    className="b-mark"
                    onClick={() => onCheckout(b)}
                    title={`crear/cambiar a local desde ${b.name}`}
                    style={{ cursor: 'pointer' }}
                  >
                    ⇄
                  </span>
                  <span
                    className="b-name"
                    onClick={() => onCheckout(b)}
                    title={`crear/cambiar a local desde ${b.name}`}
                    style={{ cursor: 'pointer' }}
                  >
                    {b.name}
                  </span>
                  <span className="b-actions">
                    <button
                      onClick={() => onMerge(b.name)}
                      disabled={!!busy}
                      title={`merge ${b.name} en la rama actual`}
                    >
                      merge
                    </button>
                  </span>
                </li>
              ))}
            </ul>

            <div className="pane-title">Remotos <span className="count">{remotes.length}</span></div>
            <ul className="remote-list">
              {remotes.length === 0 && <li className="mini">sin remotos</li>}
              {remotes.map((rm) => (
                <li key={rm.name} className="remote-row">
                  <span className="rm-name">{rm.name}</span>
                  <span className="rm-url" title={rm.fetchUrl}>
                    {rm.fetchUrl}
                  </span>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      )}

      {result && (
        <div className={`action-result ${result.ok ? 'ok' : 'err'}`}>
          <div className="ar-head">
            <span className="ar-cmd">$ {result.cmd}</span>
            <button className="link" onClick={() => setResult(null)}>
              ✕
            </button>
          </div>
          <pre>{(result.stdout || result.stderr || '(sin salida)').trim()}</pre>
        </div>
      )}

      {tab === 'tree' && selectedCommit && (
        <CommitDetailDrawer
          repoPath={repo.path}
          hash={selectedCommit}
          onClose={() => setSelectedCommit(null)}
        />
      )}
    </div>
  )
}

export default RepoDetail
