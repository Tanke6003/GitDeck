import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AliasInfo, GitResult } from '@shared/types'
import { ansiToHtml } from '../lib/ansi'
import { useI18n } from '../lib/i18n'

interface Output {
  name: string
  cmd: string
  html: string
  ok: boolean
}

/**
 * Panel de alias: lista todos los alias con su descripcion (desc.<name>)
 * y su comando real, permite ejecutarlos (salida con color ANSI), marcarlos como
 * favoritos (accesos rapidos arriba) y crear/editar/borrar.
 */
function AliasPanel({ repoPath }: { repoPath: string }): JSX.Element {
  const { t } = useI18n()
  const [aliases, setAliases] = useState<AliasInfo[]>([])
  const [loadErr, setLoadErr] = useState<GitResult | null>(null)
  const [running, setRunning] = useState<string | null>(null)
  const [output, setOutput] = useState<Output | null>(null)
  const [filter, setFilter] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [nName, setNName] = useState('')
  const [nCmd, setNCmd] = useState('')
  const [nDesc, setNDesc] = useState('')

  const load = useCallback(async () => {
    const r = await window.api.aliases(repoPath)
    setAliases(r.data)
    setLoadErr(r.error)
  }, [repoPath])

  useEffect(() => {
    load()
  }, [load])

  const run = useCallback(
    async (a: AliasInfo) => {
      if (running) return // solo uno a la vez (el main tambien lo impone)
      setRunning(a.name)
      setOutput(null)
      const res = await window.api.runAlias(repoPath, a.name)
      setOutput({
        name: a.name,
        cmd: res.cmd,
        html: ansiToHtml((res.stdout || res.stderr || t('common.noOutput')).replace(/\s+$/, '')),
        ok: res.ok
      })
      setRunning(null)
    },
    [repoPath, running, t]
  )

  const stop = useCallback(async () => {
    await window.api.stopAlias()
  }, [])

  const create = useCallback(async () => {
    if (!nName.trim() || !nCmd.trim()) return
    const res = await window.api.setAlias(nName.trim(), nCmd.trim(), nDesc.trim() || undefined)
    if (res.ok) {
      setNName('')
      setNCmd('')
      setNDesc('')
      setShowNew(false)
      await load()
    } else {
      setOutput({ name: nName, cmd: res.cmd, html: ansiToHtml(res.stderr || 'error'), ok: false })
    }
  }, [nName, nCmd, nDesc, load])

  const edit = useCallback((a: AliasInfo) => {
    setShowNew(true)
    setNName(a.name)
    setNCmd(a.command)
    setNDesc(a.desc ?? '')
  }, [])

  const remove = useCallback(
    async (a: AliasInfo) => {
      await window.api.deleteAlias(a.name)
      setOutput((o) => (o?.name === a.name ? null : o))
      await load()
    },
    [load]
  )

  const toggleFavorite = useCallback(async (a: AliasInfo) => {
    const favorites = await window.api.toggleAliasFavorite(a.name)
    const favSet = new Set(favorites)
    // reflejamos la respuesta del store en vez de invertir el flag a ciegas
    setAliases((list) => list.map((x) => ({ ...x, favorite: favSet.has(x.name) })))
  }, [])

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase()
    if (!f) return aliases
    return aliases.filter(
      (a) =>
        a.name.toLowerCase().includes(f) ||
        (a.desc ?? '').toLowerCase().includes(f) ||
        a.command.toLowerCase().includes(f)
    )
  }, [aliases, filter])

  // los favoritos primero (el orden alfabetico ya viene del main)
  const sorted = useMemo(() => [...shown].sort((a, b) => Number(b.favorite) - Number(a.favorite)), [shown])

  const favorites = useMemo(() => aliases.filter((a) => a.favorite), [aliases])

  return (
    <div className="alias-panel">
      <div className="alias-toolbar">
        <input
          className="alias-filter"
          aria-label={t('alias.filter')}
          placeholder={t('alias.filterPlaceholder')}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <span className="mini">{t('alias.count', { n: aliases.length })}</span>
        <button
          onClick={() => {
            setShowNew((s) => !s)
            setNName('')
            setNCmd('')
            setNDesc('')
          }}
        >
          ＋ {t('alias.new')}
        </button>
      </div>

      {loadErr && (
        <div className="pane-error" role="alert">
          {t('common.readError')}
          <pre>{(loadErr.stderr || loadErr.stdout).trim() || loadErr.cmd}</pre>
        </div>
      )}

      {favorites.length > 0 && (
        <div className="alias-favs">
          <span className="af-label">★ {t('alias.favorites')}</span>
          {favorites.map((a) => (
            <button
              key={a.name}
              className="fav-chip"
              onClick={() => run(a)}
              disabled={running !== null}
              title={a.desc ? `${a.desc} — git ${a.name}` : `git ${a.name}`}
            >
              {running === a.name ? '⏳' : '▶'} {a.name}
            </button>
          ))}
        </div>
      )}

      {showNew && (
        <div className="alias-form">
          <div className="af-row">
            <label>{t('alias.name')}</label>
            <input value={nName} onChange={(e) => setNName(e.target.value)} placeholder={t('alias.namePlaceholder')} />
          </div>
          <div className="af-row">
            <label>{t('alias.command')}</label>
            <input
              className="mono"
              value={nCmd}
              onChange={(e) => setNCmd(e.target.value)}
              placeholder={t('alias.cmdPlaceholder')}
            />
          </div>
          <div className="af-row">
            <label>{t('alias.desc')}</label>
            <input value={nDesc} onChange={(e) => setNDesc(e.target.value)} placeholder={t('alias.descPlaceholder')} />
          </div>
          <div className="af-actions">
            <button onClick={create} disabled={!nName.trim() || !nCmd.trim()}>
              {t('alias.saveGlobal')}
            </button>
            <button className="link" onClick={() => setShowNew(false)}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      <div className="alias-body">
        <ul className="alias-list">
          {sorted.length === 0 && <li className="mini pad">{t('alias.noMatches')}</li>}
          {sorted.map((a) => (
            <li key={a.name} className={`alias-item ${a.favorite ? 'fav' : ''}`}>
              <div className="alias-head">
                <button
                  className={`fav-star ${a.favorite ? 'on' : ''}`}
                  onClick={() => toggleFavorite(a)}
                  aria-label={a.favorite ? t('alias.unfavorite') : t('alias.favorite')}
                  title={a.favorite ? t('alias.unfavorite') : t('alias.favorite')}
                >
                  {a.favorite ? '★' : '☆'}
                </button>
                <span className="alias-name">{a.name}</span>
                {a.isShell && <span className="alias-tag">shell !</span>}
                <span className="spacer" />
                <button
                  className="run-btn"
                  onClick={() => run(a)}
                  disabled={running !== null}
                  title={running ? t('alias.waitRunning') : `git ${a.name}`}
                >
                  {running === a.name ? `⏳ ${t('alias.running')}` : `▶ ${t('alias.run')}`}
                </button>
                <button
                  className="link"
                  onClick={() => edit(a)}
                  disabled={running !== null}
                  aria-label={t('common.edit')}
                  title={t('common.edit')}
                >
                  ✎
                </button>
                <button
                  className="link del"
                  onClick={() => remove(a)}
                  disabled={running !== null}
                  aria-label={t('alias.delete')}
                  title={t('alias.delete')}
                >
                  ✕
                </button>
              </div>
              {a.desc ? (
                <div className="alias-desc">{a.desc}</div>
              ) : (
                <div className="alias-desc none">{t('alias.noDesc', { name: a.name })}</div>
              )}
              <code className="alias-cmd">{a.command}</code>
            </li>
          ))}
        </ul>

        <div className="term">
          {running ? (
            <div className="term-running" role="status">
              <span className="spinner" aria-hidden="true" />
              <span>
                {t('alias.runningCmd')} <code>git {running}</code>…
              </span>
              <button className="danger stop-btn" onClick={stop}>
                ■ {t('alias.stop')}
              </button>
            </div>
          ) : output ? (
            <>
              <div className={`term-head ${output.ok ? '' : 'err'}`}>
                <span>$ git {output.name}</span>
                <button className="link" onClick={() => setOutput(null)} aria-label={t('common.close')}>
                  ✕
                </button>
              </div>
              <pre className="term-body" dangerouslySetInnerHTML={{ __html: output.html }} />
            </>
          ) : (
            <div className="term-empty">
              {t('alias.termEmpty1')}
              <br />
              {t('alias.termEmpty2')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default AliasPanel
