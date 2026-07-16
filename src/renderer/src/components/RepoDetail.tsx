import { useCallback, useEffect, useRef, useState } from 'react'
import type { BranchInfo, Commit, GitResult, MergePreview, RemoteInfo, RepoInfo } from '@shared/types'
import CommitGraph from './CommitGraph'
import AliasPanel from './AliasPanel'
import CommitPanel from './CommitPanel'
import CommitDetailDrawer from './CommitDetailDrawer'
import ConfirmDialog, { type ConfirmSpec } from './ConfirmDialog'
import MergePreviewDialog from './MergePreviewDialog'
import StashPanel from './StashPanel'
import TagPanel from './TagPanel'
import SearchBar from './SearchBar'
import ReflogDialog from './ReflogDialog'

interface Props {
  repo: RepoInfo
  onRemove: (path: string) => void
  onChanged: () => void
}

/**
 * Panel de un repo: cabecera + acciones (fetch / nueva rama), grafo de commits,
 * y a la derecha las ramas (con checkout / renombrar / borrar) y los remotos.
 */
function RepoDetail({ repo, onRemove, onChanged }: Props): JSX.Element {
  const [commits, setCommits] = useState<Commit[]>([])
  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [remotes, setRemotes] = useState<RemoteInfo[]>([])
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null)
  // resultados de busqueda; null = sin busqueda activa (se muestra el grafo)
  const [search, setSearch] = useState<Commit[] | null>(null)
  const [showReflog, setShowReflog] = useState(false)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null) // etiqueta de accion en curso
  const [result, setResult] = useState<GitResult | null>(null)
  const [showNewBranch, setShowNewBranch] = useState(false)
  const [newBranch, setNewBranch] = useState('')
  const [tab, setTab] = useState<'tree' | 'commit' | 'alias'>('tree')
  const [showAddRemote, setShowAddRemote] = useState(false)
  const [rName, setRName] = useState('')
  const [rUrl, setRUrl] = useState('')

  // dialogos: confirmacion generica y vista previa de merge
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null)
  const [mergeBranch, setMergeBranch] = useState<string | null>(null)
  const [mergePreview, setMergePreview] = useState<MergePreview | null>(null)
  const mergeReq = useRef(0) // descarta vistas previas de clicks ya superados

  // edicion en linea: nombre de remoto y de rama
  const [editRemote, setEditRemote] = useState<string | null>(null)
  const [editRemoteName, setEditRemoteName] = useState('')
  const [editBranch, setEditBranch] = useState<string | null>(null)
  const [editBranchName, setEditBranchName] = useState('')

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
    setSearch(null)
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

  // --- checkout (con aviso si hay cambios sin guardar) ---

  const doCheckout = useCallback(
    async (b: BranchInfo) => {
      setBusy(`co:${b.name}`)
      // una remota "origin/foo" crea/usa la local "foo" que la sigue (--track)
      const res = b.isRemote
        ? await window.api.checkoutRemote(repo.path, b.name)
        : await window.api.checkout(repo.path, b.name)
      setResult(res)
      setBusy(null)
      await reloadAll()
    },
    [repo.path, reloadAll]
  )

  const onCheckout = useCallback(
    (b: BranchInfo) => {
      if (b.isCurrent) return
      // avisamos ANTES en vez de dejar que git falle (o arrastre los cambios)
      if (repo.dirty) {
        setConfirm({
          title: 'Tienes cambios sin guardar',
          message: (
            <>
              El working tree de <b>{repo.name}</b> tiene cambios sin commitear. Git los arrastrará a{' '}
              <b>{b.name}</b> si no chocan, y se negará si chocan.
              <br />
              <br />
              Puedes commitearlos o guardarlos antes de cambiar de rama.
            </>
          ),
          confirmLabel: 'Cambiar igual',
          onConfirm: () => {
            setConfirm(null)
            doCheckout(b)
          }
        })
        return
      }
      doCheckout(b)
    },
    [repo.dirty, repo.name, doCheckout]
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

  const doMerge = useCallback(async () => {
    if (!mergeBranch) return
    setBusy('merge')
    const res = await window.api.merge(repo.path, mergeBranch)
    setResult(res)
    setBusy(null)
    closeMerge()
    await reloadAll()
    // conflictos (o error): llevar a la pestaña Commit para resolver
    if (!res.ok) setTab('commit')
  }, [mergeBranch, repo.path, reloadAll, closeMerge])

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

  const onPull = useCallback(async () => {
    setBusy('pull')
    const res = await window.api.pull(repo.path)
    setResult(res)
    setBusy(null)
    await reloadAll()
    if (!res.ok) setTab('commit') // posibles conflictos
  }, [repo.path, reloadAll])

  const onPush = useCallback(async () => {
    setBusy('push')
    const cur = branches.find((b) => b.isCurrent)
    // rama sin upstream -> publicar con -u
    const res =
      cur && !cur.upstream
        ? await window.api.push(repo.path, { setUpstream: true, branch: cur.name })
        : await window.api.push(repo.path)
    setResult(res)
    setBusy(null)
    await reloadAll()
  }, [repo.path, branches, reloadAll])

  // --- borrar / renombrar ramas ---

  const runDeleteBranch = useCallback(
    async (name: string, force: boolean): Promise<GitResult> => {
      setBusy('branch')
      const res = await window.api.deleteBranch(repo.path, name, force)
      setResult(res)
      setBusy(null)
      await reloadAll()
      return res
    },
    [repo.path, reloadAll]
  )

  const onDeleteBranch = useCallback(
    (b: BranchInfo) => {
      setConfirm({
        title: `Borrar la rama "${b.name}"`,
        message: (
          <>
            Se borra solo la rama local (<code>git branch -d {b.name}</code>). Si tiene commits sin
            fusionar, git se negará y podrás decidir si forzar.
          </>
        ),
        confirmLabel: 'Borrar',
        danger: true,
        onConfirm: async () => {
          setConfirm(null)
          const res = await runDeleteBranch(b.name, false)
          // git rechaza -d si la rama no está fusionada: ofrecer -D explicitamente
          if (!res.ok && /not fully merged/i.test(res.stderr)) {
            setConfirm({
              title: `"${b.name}" no está fusionada`,
              message: (
                <>
                  Tiene commits que no están en ninguna otra rama. Si la borras con{' '}
                  <code>-D</code> esos commits quedan huérfanos (recuperables por{' '}
                  <code>git reflog</code> un tiempo, no para siempre).
                </>
              ),
              confirmLabel: 'Borrar igual (-D)',
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
    [runDeleteBranch]
  )

  const onDeleteRemoteBranch = useCallback(
    (b: BranchInfo) => {
      const [remote, ...rest] = b.name.split('/')
      const branch = rest.join('/')
      if (!remote || !branch) return
      setConfirm({
        title: `Borrar "${branch}" en el remoto "${remote}"`,
        message: (
          <>
            Esto borra la rama <b>en el servidor</b> (<code>git push {remote} --delete {branch}</code>
            ), no solo en tu copia. Afecta a todo el que use ese remoto y desde aquí no se deshace.
          </>
        ),
        confirmLabel: 'Borrar en el remoto',
        danger: true,
        onConfirm: async () => {
          setConfirm(null)
          setBusy('branch')
          const res = await window.api.deleteRemoteBranch(repo.path, remote, branch)
          setResult(res)
          setBusy(null)
          await reloadAll()
        }
      })
    },
    [repo.path, reloadAll]
  )

  const startRenameBranch = useCallback((b: BranchInfo) => {
    setEditBranch(b.name)
    setEditBranchName(b.name)
  }, [])

  const onRenameBranch = useCallback(
    async (oldName: string) => {
      const name = editBranchName.trim()
      if (!name || name === oldName) {
        setEditBranch(null)
        return
      }
      setBusy('branch')
      const res = await window.api.renameBranch(repo.path, oldName, name)
      setResult(res)
      setBusy(null)
      setEditBranch(null)
      await reloadAll()
    },
    [editBranchName, repo.path, reloadAll]
  )

  // --- remotos ---

  const onAddRemote = useCallback(async () => {
    if (!rName.trim() || !rUrl.trim()) return
    setBusy('remote')
    const res = await window.api.addRemote(repo.path, rName.trim(), rUrl.trim())
    setResult(res)
    setBusy(null)
    if (res.ok) {
      setRName('')
      setRUrl('')
      setShowAddRemote(false)
      await reloadAll()
    }
  }, [repo.path, rName, rUrl, reloadAll])

  const onRemoveRemote = useCallback(
    async (name: string) => {
      setBusy('remote')
      const res = await window.api.removeRemote(repo.path, name)
      setResult(res)
      setBusy(null)
      await reloadAll()
    },
    [repo.path, reloadAll]
  )

  const startRenameRemote = useCallback((rm: RemoteInfo) => {
    setEditRemote(rm.name)
    setEditRemoteName(rm.name)
  }, [])

  const onRenameRemote = useCallback(
    async (oldName: string) => {
      const name = editRemoteName.trim()
      if (!name || name === oldName) {
        setEditRemote(null)
        return
      }
      setBusy('remote')
      const res = await window.api.renameRemote(repo.path, oldName, name)
      setResult(res)
      setBusy(null)
      setEditRemote(null)
      await reloadAll()
    },
    [editRemoteName, repo.path, reloadAll]
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
              <button onClick={onPull} disabled={!!busy} title="git pull">
                {busy === 'pull' ? '⏳ pull…' : '↓ Pull'}
              </button>
              <button onClick={onPush} disabled={!!busy} title="git push">
                {busy === 'push' ? '⏳ push…' : '↑ Push'}
              </button>
              <button onClick={() => setShowNewBranch((s) => !s)} disabled={!!busy}>
                ＋ Nueva rama
              </button>
              <button
                onClick={() => setShowReflog(true)}
                disabled={!!busy}
                title="git reflog: recuperar commits que quedaron sin rama"
              >
                ⏱ Reflog
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
              </>
            )}
          </section>

          <aside className="side-pane">
            <div className="pane-title">Ramas locales <span className="count">{locals.length}</span></div>
            <ul className="branch-list">
              {locals.map((b) =>
                editBranch === b.name ? (
                  <li key={b.name} className="branch-row editing">
                    <input
                      autoFocus
                      className="b-edit"
                      value={editBranchName}
                      onChange={(e) => setEditBranchName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') onRenameBranch(b.name)
                        if (e.key === 'Escape') setEditBranch(null)
                      }}
                    />
                    <button onClick={() => onRenameBranch(b.name)} disabled={!!busy} title="renombrar">
                      ✓
                    </button>
                    <button className="link" onClick={() => setEditBranch(null)}>
                      ✕
                    </button>
                  </li>
                ) : (
                  <li
                    key={b.name}
                    className={`branch-row ${b.isCurrent ? 'current' : ''}`}
                    onClick={() => onCheckout(b)}
                    title={b.isCurrent ? 'rama actual' : `cambiar a ${b.name}`}
                  >
                    <span className="b-mark">{b.isCurrent ? '●' : '○'}</span>
                    <span className="b-name">{b.name}</span>
                    {(b.ahead > 0 || b.behind > 0) && (
                      <span className="b-sync" title={`${b.ahead} adelante / ${b.behind} atrás`}>
                        {b.ahead > 0 && <span className="ahead">↑{b.ahead}</span>}
                        {b.behind > 0 && <span className="behind">↓{b.behind}</span>}
                      </span>
                    )}
                    {b.gone && (
                      <span className="b-gone" title="el upstream ya no existe">
                        gone
                      </span>
                    )}
                    <span className="b-actions">
                      {!b.isCurrent && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              onMergeClick(b.name)
                            }}
                            disabled={!!busy}
                            title={`ver qué traería fusionar ${b.name} en la rama actual`}
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
                        </>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          startRenameBranch(b)
                        }}
                        disabled={!!busy}
                        title={`renombrar ${b.name}`}
                      >
                        ✎
                      </button>
                      {!b.isCurrent && (
                        <button
                          className="del"
                          onClick={(e) => {
                            e.stopPropagation()
                            onDeleteBranch(b)
                          }}
                          disabled={!!busy}
                          title={`borrar ${b.name}`}
                        >
                          ✕
                        </button>
                      )}
                    </span>
                  </li>
                )
              )}
            </ul>

            <div className="pane-title">Ramas remotas <span className="count">{remoteBranches.length}</span></div>
            <ul className="branch-list">
              {remoteBranches.map((b) => (
                <li key={b.name} className="branch-row remote">
                  <span
                    className="b-mark"
                    onClick={() => onCheckout(b)}
                    title={`crear/cambiar a la local que sigue a ${b.name} (--track)`}
                    style={{ cursor: 'pointer' }}
                  >
                    ⇄
                  </span>
                  <span
                    className="b-name"
                    onClick={() => onCheckout(b)}
                    title={`crear/cambiar a la local que sigue a ${b.name} (--track)`}
                    style={{ cursor: 'pointer' }}
                  >
                    {b.name}
                  </span>
                  <span className="b-actions">
                    <button
                      onClick={() => onMergeClick(b.name)}
                      disabled={!!busy}
                      title={`ver qué traería fusionar ${b.name} en la rama actual`}
                    >
                      merge
                    </button>
                    <button
                      className="del"
                      onClick={() => onDeleteRemoteBranch(b)}
                      disabled={!!busy}
                      title={`borrar ${b.name} en el remoto`}
                    >
                      ✕
                    </button>
                  </span>
                </li>
              ))}
            </ul>

            <div className="pane-title">
              Remotos <span className="count">{remotes.length}</span>
              <button className="link" onClick={() => setShowAddRemote((s) => !s)} disabled={!!busy}>
                ＋ agregar
              </button>
            </div>
            {showAddRemote && (
              <div className="add-remote">
                <input
                  placeholder="nombre (ej. hub)"
                  value={rName}
                  onChange={(e) => setRName(e.target.value)}
                />
                <input
                  placeholder="url (https://… o git@…)"
                  value={rUrl}
                  onChange={(e) => setRUrl(e.target.value)}
                />
                <div className="ar-btns">
                  <button onClick={onAddRemote} disabled={!!busy || !rName.trim() || !rUrl.trim()}>
                    Agregar
                  </button>
                  <button className="link" onClick={() => setShowAddRemote(false)}>
                    cancelar
                  </button>
                </div>
              </div>
            )}
            <ul className="remote-list">
              {remotes.length === 0 && <li className="mini">sin remotos</li>}
              {remotes.map((rm) => (
                <li key={rm.name} className="remote-row">
                  <div className="rm-head">
                    {editRemote === rm.name ? (
                      <>
                        <input
                          autoFocus
                          className="rm-edit"
                          value={editRemoteName}
                          onChange={(e) => setEditRemoteName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') onRenameRemote(rm.name)
                            if (e.key === 'Escape') setEditRemote(null)
                          }}
                        />
                        <button
                          className="link"
                          onClick={() => onRenameRemote(rm.name)}
                          disabled={!!busy}
                          title="renombrar remoto"
                        >
                          ✓
                        </button>
                        <button className="link" onClick={() => setEditRemote(null)}>
                          ✕
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="rm-name">{rm.name}</span>
                        <button
                          className="link"
                          onClick={() => startRenameRemote(rm)}
                          disabled={!!busy}
                          title="renombrar remoto"
                        >
                          ✎
                        </button>
                        <button
                          className="link del"
                          onClick={() => onRemoveRemote(rm.name)}
                          disabled={!!busy}
                          title="quitar remoto"
                        >
                          ✕
                        </button>
                      </>
                    )}
                  </div>
                  <span className="rm-url" title={rm.fetchUrl}>
                    {rm.fetchUrl}
                  </span>
                </li>
              ))}
            </ul>

            <StashPanel
              repoPath={repo.path}
              dirty={repo.dirty}
              onChanged={reloadAll}
              onResult={setResult}
            />

            <TagPanel
              repoPath={repo.path}
              remotes={remotes.map((r) => r.name)}
              onChanged={reloadAll}
              onResult={setResult}
            />
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

      {showReflog && (
        <ReflogDialog
          repoPath={repo.path}
          onChanged={reloadAll}
          onClose={() => setShowReflog(false)}
        />
      )}

      {confirm && <ConfirmDialog {...confirm} onCancel={() => setConfirm(null)} />}
    </div>
  )
}

export default RepoDetail
