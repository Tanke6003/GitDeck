import { useCallback, useEffect, useState } from 'react'
import type { RepoInfo } from '@shared/types'
import RepoDetail from './components/RepoDetail'
import { applyTheme, initialTheme } from './lib/theme'
import type { Theme } from './lib/theme'
import { useI18n } from './lib/i18n'

/**
 * Raiz de la app: gestion de repos.
 * Sidebar con los repos reales (agregar / escanear / quitar) y, al seleccionar
 * uno, un panel de detalle (arbol de commits, ramas, remotos, commit, alias...).
 */
function App(): JSX.Element {
  const { t, lang, setLang } = useI18n()
  const [repos, setRepos] = useState<RepoInfo[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [gitVersion, setGitVersion] = useState('')
  const [theme, setTheme] = useState<Theme>(initialTheme)
  /** aviso no bloqueante (antes eran window.alert, que congelan el renderer) */
  const [notice, setNotice] = useState<string | null>(null)
  /** sube en cada focus de la ventana; RepoDetail recarga al verlo cambiar */
  const [focusTick, setFocusTick] = useState(0)

  useEffect(() => applyTheme(theme), [theme])

  const refresh = useCallback(async () => {
    const list = await window.api.listRepos()
    setRepos(list)
    setSelected((cur) => cur ?? (list[0]?.path || null))
  }, [])

  useEffect(() => {
    refresh()
    window.api.gitVersion().then((r) => setGitVersion(r.ok ? r.stdout.trim() : t('app.gitMissing')))
    // el nombre de la version no depende del idioma elegido despues
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh])

  // UNICO listener de focus de la app: refresca la lista y avisa al detalle.
  // Antes App y RepoDetail registraban cada uno el suyo y todo corria dos veces.
  useEffect(() => {
    const onFocus = (): void => {
      refresh()
      setFocusTick((n) => n + 1)
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  const onAdd = useCallback(async () => {
    const dir = await window.api.pickFolder()
    if (!dir) return
    setBusy(true)
    setNotice(null)
    const info = await window.api.addRepo(dir)
    setBusy(false)
    if (!info.valid) {
      setNotice(t('app.notAdded', { dir, err: info.error ?? t('app.notARepo') }))
      return
    }
    await refresh()
    setSelected(info.path)
  }, [refresh, t])

  const onScan = useCallback(async () => {
    const dir = await window.api.pickFolder()
    if (!dir) return
    setBusy(true)
    setNotice(null)
    const found = await window.api.scanFolder(dir)
    setBusy(false)
    await refresh()
    setNotice(found.length === 0 ? t('app.noneFound', { dir }) : t('app.added', { n: found.length }))
  }, [refresh, t])

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
        <div className="sidebar-header">
          GitDeck
          <span className="sidebar-toggles">
            <button
              className="link lang-toggle"
              onClick={() => setLang(lang === 'es' ? 'en' : 'es')}
              title={t('app.langToggle')}
              aria-label={t('app.langToggle')}
            >
              {lang === 'es' ? 'EN' : 'ES'}
            </button>
            <button
              className="link theme-toggle"
              onClick={() => setTheme((th) => (th === 'dark' ? 'light' : 'dark'))}
              title={theme === 'dark' ? t('app.toLight') : t('app.toDark')}
              aria-label={theme === 'dark' ? t('app.toLight') : t('app.toDark')}
            >
              {theme === 'dark' ? '☀' : '☾'}
            </button>
          </span>
        </div>

        <div className="sidebar-actions">
          <button onClick={onAdd} disabled={busy} title={t('app.add.title')}>
            ＋ {t('app.add')}
          </button>
          <button onClick={onScan} disabled={busy} title={t('app.scan.title')}>
            ⟲ {t('app.scan')}
          </button>
        </div>

        {notice && (
          <div className="notice" role="status" aria-live="polite">
            <span>{notice}</span>
            <button className="link" onClick={() => setNotice(null)} aria-label={t('common.close')} title={t('common.close')}>
              ✕
            </button>
          </div>
        )}

        <div className="sidebar-section">
          {t('app.repos')} <span className="count">{repos.length}</span>
        </div>

        <nav aria-label={t('app.repos')} className="repo-nav">
          <ul className="repo-list">
            {repos.length === 0 && (
              <li className="repo-empty">
                {t('app.noRepos')}
                <br />
                {t('app.noReposHint')}
              </li>
            )}
            {repos.map((r) => (
              <li key={r.path}>
                <button
                  className={`repo-item ${selected === r.path ? 'active' : ''} ${r.valid ? '' : 'invalid'}`}
                  onClick={() => setSelected(r.path)}
                  aria-current={selected === r.path || undefined}
                >
                  <span
                    className={`dot ${r.dirty ? 'dirty' : 'clean'}`}
                    role="img"
                    aria-label={r.dirty ? t('app.dirty') : t('app.clean')}
                    title={r.dirty ? t('app.dirty') : t('app.clean')}
                  />
                  <span className="repo-name">{r.name}</span>
                  <span className="repo-branch">{r.valid ? (r.currentBranch ?? 'detached') : '⚠'}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="sidebar-footer">
          <span className="ver">{gitVersion}</span>
          <button className="link" onClick={refresh} disabled={busy}>
            {busy ? t('app.working') : `↻ ${t('app.refresh')}`}
          </button>
        </div>
      </aside>

      <main className="content">
        {selectedRepo ? (
          <RepoDetail repo={selectedRepo} focusTick={focusTick} onRemove={onRemove} onChanged={refresh} />
        ) : (
          <div className="empty-state">
            <h1>GitDeck</h1>
            <p className="tagline">{t('app.tagline')}</p>
            <p>{t('app.emptyHint')}</p>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
