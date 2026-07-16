import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AliasInfo } from '@shared/types'
import { ansiToHtml } from '../lib/ansi'

interface Output {
  name: string
  cmd: string
  html: string
  ok: boolean
}

/**
 * Panel de alias (Fase 5): lista todos los alias con su descripcion (desc.<name>)
 * y su comando real, permite ejecutarlos (salida con color ANSI), marcarlos como
 * favoritos (accesos rapidos arriba) y crear/editar/borrar.
 */
function AliasPanel({ repoPath }: { repoPath: string }): JSX.Element {
  const [aliases, setAliases] = useState<AliasInfo[]>([])
  const [running, setRunning] = useState<string | null>(null)
  const [output, setOutput] = useState<Output | null>(null)
  const [filter, setFilter] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [nName, setNName] = useState('')
  const [nCmd, setNCmd] = useState('')
  const [nDesc, setNDesc] = useState('')

  const load = useCallback(async () => {
    setAliases(await window.api.aliases(repoPath))
  }, [repoPath])

  useEffect(() => {
    load()
  }, [load])

  const run = useCallback(
    async (a: AliasInfo) => {
      if (running) return // solo uno a la vez
      setRunning(a.name)
      setOutput(null)
      const res = await window.api.runAlias(repoPath, a.name)
      setOutput({
        name: a.name,
        cmd: res.cmd,
        html: ansiToHtml((res.stdout || res.stderr || '(sin salida)').replace(/\s+$/, '')),
        ok: res.ok
      })
      setRunning(null)
    },
    [repoPath, running]
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

  const toggleFavorite = useCallback(
    async (a: AliasInfo) => {
      const favorites = await window.api.toggleAliasFavorite(a.name)
      const favSet = new Set(favorites)
      // reflejamos la respuesta del store en vez de invertir el flag a ciegas
      setAliases((list) => list.map((x) => ({ ...x, favorite: favSet.has(x.name) })))
    },
    []
  )

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
  const sorted = useMemo(
    () => [...shown].sort((a, b) => Number(b.favorite) - Number(a.favorite)),
    [shown]
  )

  const favorites = useMemo(() => aliases.filter((a) => a.favorite), [aliases])

  return (
    <div className="alias-panel">
      <div className="alias-toolbar">
        <input
          className="alias-filter"
          placeholder="buscar alias, descripción o comando…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <span className="mini">{aliases.length} alias</span>
        <button
          onClick={() => {
            setShowNew((s) => !s)
            setNName('')
            setNCmd('')
            setNDesc('')
          }}
        >
          ＋ Nuevo alias
        </button>
      </div>

      {favorites.length > 0 && (
        <div className="alias-favs">
          <span className="af-label">★ Favoritos</span>
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
            <label>nombre</label>
            <input value={nName} onChange={(e) => setNName(e.target.value)} placeholder="ej. st" />
          </div>
          <div className="af-row">
            <label>comando</label>
            <input
              className="mono"
              value={nCmd}
              onChange={(e) => setNCmd(e.target.value)}
              placeholder="ej. status -sb   (o !git ... para shell)"
            />
          </div>
          <div className="af-row">
            <label>desc</label>
            <input
              value={nDesc}
              onChange={(e) => setNDesc(e.target.value)}
              placeholder="qué hace (opcional, se guarda en desc.<name>)"
            />
          </div>
          <div className="af-actions">
            <button onClick={create} disabled={!nName.trim() || !nCmd.trim()}>
              Guardar (global)
            </button>
            <button className="link" onClick={() => setShowNew(false)}>
              cancelar
            </button>
          </div>
        </div>
      )}

      <div className="alias-body">
        <ul className="alias-list">
          {sorted.length === 0 && <li className="mini pad">sin alias que coincidan</li>}
          {sorted.map((a) => (
            <li key={a.name} className={`alias-item ${a.favorite ? 'fav' : ''}`}>
              <div className="alias-head">
                <button
                  className={`fav-star ${a.favorite ? 'on' : ''}`}
                  onClick={() => toggleFavorite(a)}
                  title={a.favorite ? 'quitar de favoritos' : 'marcar como favorito'}
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
                  title={running ? 'espera a que termine el alias en curso' : `git ${a.name}`}
                >
                  {running === a.name ? '⏳ corriendo' : '▶ correr'}
                </button>
                <button
                  className="link"
                  onClick={() => edit(a)}
                  disabled={running !== null}
                  title="editar"
                >
                  ✎
                </button>
                <button
                  className="link del"
                  onClick={() => remove(a)}
                  disabled={running !== null}
                  title="borrar (global)"
                >
                  ✕
                </button>
              </div>
              {a.desc ? (
                <div className="alias-desc">{a.desc}</div>
              ) : (
                <div className="alias-desc none">sin descripción (desc.{a.name})</div>
              )}
              <code className="alias-cmd">{a.command}</code>
            </li>
          ))}
        </ul>

        <div className="term">
          {running ? (
            <div className="term-running">
              <span className="spinner" />
              <span>
                corriendo <code>git {running}</code>…
              </span>
              <button className="danger stop-btn" onClick={stop}>
                ■ Detener
              </button>
            </div>
          ) : output ? (
            <>
              <div className={`term-head ${output.ok ? '' : 'err'}`}>
                <span>$ git {output.name}</span>
                <button className="link" onClick={() => setOutput(null)}>
                  ✕
                </button>
              </div>
              <pre className="term-body" dangerouslySetInnerHTML={{ __html: output.html }} />
            </>
          ) : (
            <div className="term-empty">
              Corre un alias (▶) para ver su salida aquí, con colores.
              <br />
              Los alias con <code>!</code> de shell también funcionan.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default AliasPanel
