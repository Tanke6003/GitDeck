import { useCallback, useEffect, useState } from 'react'
import type { RepoInfo } from '@shared/types'
import RepoDetail from './components/RepoDetail'

/**
 * Fase 1 + arranque de Fase 2: gestion de repos.
 * Sidebar con los repos reales (agregar / escanear / quitar) y un panel de
 * detalle con rama, HEAD y estado. El arbol de commits llega en la Fase 2.
 */
function App(): JSX.Element {
  const [repos, setRepos] = useState<RepoInfo[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [gitVersion, setGitVersion] = useState('')

  const refresh = useCallback(async () => {
    const list = await window.api.listRepos()
    setRepos(list)
    setSelected((cur) => cur ?? (list[0]?.path || null))
  }, [])

  useEffect(() => {
    refresh()
    window.api.gitVersion().then((r) => setGitVersion(r.ok ? r.stdout.trim() : 'git no disponible'))
  }, [refresh])

  // refrescar la lista de repos al volver el foco a la ventana
  useEffect(() => {
    const onFocus = (): void => {
      refresh()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  const onAdd = useCallback(async () => {
    const dir = await window.api.pickFolder()
    if (!dir) return
    setBusy(true)
    const info = await window.api.addRepo(dir)
    setBusy(false)
    if (!info.valid) {
      alert(`No se agrego: ${info.error ?? 'ruta invalida'}`)
      return
    }
    await refresh()
    setSelected(info.path)
  }, [refresh])

  const onScan = useCallback(async () => {
    const dir = await window.api.pickFolder()
    if (!dir) return
    setBusy(true)
    const found = await window.api.scanFolder(dir)
    setBusy(false)
    await refresh()
    if (found.length === 0) alert('No se encontraron repos git en esa carpeta.')
  }, [refresh])

  const onRemove = useCallback(
    async (path: string) => {
      await window.api.removeRepo(path)
      setSelected((cur) => (cur === path ? null : cur))
      await refresh()
    },
    [refresh]
  )

  const selectedRepo = repos.find((r) => r.path === selected) ?? null

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">GitDeck</div>

        <div className="sidebar-actions">
          <button onClick={onAdd} disabled={busy} title="Agregar un repo por carpeta">
            ＋ Agregar
          </button>
          <button onClick={onScan} disabled={busy} title="Escanear una carpeta y agregar los repos">
            ⟲ Escanear
          </button>
        </div>

        <div className="sidebar-section">
          Repositorios <span className="count">{repos.length}</span>
        </div>

        <ul className="repo-list">
          {repos.length === 0 && (
            <li className="repo-empty">
              Sin repos todavia.
              <br />
              Usa <b>Escanear</b> sobre <code>E:\MTTRSystem</code>.
            </li>
          )}
          {repos.map((r) => (
            <li
              key={r.path}
              className={`repo-item ${selected === r.path ? 'active' : ''} ${
                r.valid ? '' : 'invalid'
              }`}
              onClick={() => setSelected(r.path)}
            >
              <span className={`dot ${r.dirty ? 'dirty' : 'clean'}`} title={r.dirty ? 'cambios sin guardar' : 'limpio'} />
              <span className="repo-name">{r.name}</span>
              <span className="repo-branch">{r.valid ? (r.currentBranch ?? 'detached') : '⚠'}</span>
            </li>
          ))}
        </ul>

        <div className="sidebar-footer">
          <span className="ver">{gitVersion}</span>
          <button className="link" onClick={refresh} disabled={busy}>
            {busy ? 'trabajando…' : '↻ refrescar'}
          </button>
        </div>
      </aside>

      <main className="content">
        {selectedRepo ? (
          <RepoDetail repo={selectedRepo} onRemove={onRemove} onChanged={refresh} />
        ) : (
          <div className="empty-state">
            <h1>GitDeck</h1>
            <p className="tagline">Git GUI mejorado — arbol multi-repo, remotos, ramas y alias.</p>
            <p>Agrega o escanea una carpeta para empezar. Selecciona un repo a la izquierda.</p>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
