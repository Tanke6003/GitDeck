import { spawn, type ChildProcess } from 'child_process'
import { runGit } from './gitRunner'
import { loadFavorites, saveFavorites } from './aliasStore'
import type { AliasInfo, GitResult } from '@shared/types'

/**
 * Lee todos los alias efectivos en el repo (global + local) junto con su
 * descripcion opcional `desc.<name>` — igual que el alias `alias` del usuario.
 * Los favoritos (userData/favorites.json) vienen ya marcados en cada alias.
 */
export async function getAliases(repo: string): Promise<AliasInfo[]> {
  const [aliasRes, descRes, favorites] = await Promise.all([
    runGit(['config', '--get-regexp', '^alias\\.'], repo),
    runGit(['config', '--get-regexp', '^desc\\.'], repo),
    loadFavorites()
  ])
  const favSet = new Set(favorites)

  // mapa name -> descripcion
  const descMap = new Map<string, string>()
  if (descRes.ok) {
    for (const line of descRes.stdout.split('\n')) {
      if (!line.trim()) continue
      const sp = line.indexOf(' ')
      if (sp === -1) continue
      descMap.set(line.slice(0, sp).replace(/^desc\./, ''), line.slice(sp + 1))
    }
  }

  if (!aliasRes.ok) return []
  const out: AliasInfo[] = []
  for (const line of aliasRes.stdout.split('\n')) {
    if (!line.trim()) continue
    const sp = line.indexOf(' ')
    if (sp === -1) continue
    const name = line.slice(0, sp).replace(/^alias\./, '')
    const command = line.slice(sp + 1)
    out.push({
      name,
      command,
      desc: descMap.get(name) ?? null,
      isShell: command.startsWith('!'),
      favorite: favSet.has(name)
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** Proceso de alias en curso (solo se corre uno a la vez desde la UI). */
let currentAlias: ChildProcess | null = null

/**
 * Ejecuta un alias en el repo. Forzamos color.ui=always para el color ANSI.
 * Usamos spawn (no execFile) para poder DETENERLO, y cerramos stdin de una:
 * asi alias que leen de stdin (ej. `who` = shortlog sin args) no se cuelgan.
 */
export function runAlias(repo: string, name: string): Promise<GitResult> {
  const cmd = `git ${name}`
  return new Promise((resolve) => {
    const child = spawn('git', ['-c', 'color.ui=always', name], {
      cwd: repo,
      windowsHide: true,
      timeout: 60_000, // corta alias colgados
      env: { ...process.env, LC_ALL: 'C.UTF-8' }
    })
    currentAlias = child
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (d) => (stdout += d.toString()))
    child.stderr?.on('data', (d) => (stderr += d.toString()))
    child.stdin?.end() // EOF inmediato -> alias que leen stdin no se bloquean
    child.on('error', (e) => {
      currentAlias = null
      resolve({ ok: false, cmd, stdout, stderr: stderr || String(e), code: 1 })
    })
    child.on('close', (code, signal) => {
      currentAlias = null
      if (signal) {
        resolve({ ok: false, cmd, stdout, stderr: `${stderr}\n[alias detenido]`.trim(), code: null })
      } else {
        resolve({ ok: code === 0, cmd, stdout, stderr, code })
      }
    })
  })
}

/** Detiene el alias en curso (si hay). Devuelve true si mató algo. */
export function stopAlias(): boolean {
  if (currentAlias) {
    currentAlias.kill()
    return true
  }
  return false
}

/** Crea o edita un alias en la config GLOBAL (y su desc si se pasa). */
export async function setAlias(name: string, command: string, desc?: string): Promise<GitResult> {
  const res = await runGit(['config', '--global', `alias.${name}`, command])
  if (res.ok && desc != null && desc.trim().length > 0) {
    return runGit(['config', '--global', `desc.${name}`, desc])
  }
  return res
}

/** Borra un alias global, su descripcion y su marca de favorito (best-effort). */
export async function deleteAlias(name: string): Promise<GitResult> {
  const res = await runGit(['config', '--global', '--unset', `alias.${name}`])
  await runGit(['config', '--global', '--unset', `desc.${name}`]) // ignora si no existe
  // si estaba en favoritos, quitarlo: si no, quedaria un favorito fantasma
  const favorites = await loadFavorites()
  if (favorites.includes(name)) await saveFavorites(favorites.filter((n) => n !== name))
  return res
}
