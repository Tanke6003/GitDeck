import { runGit } from './gitRunner'
import { SEP } from './gitFormat'
import { readErr, readOk } from '@shared/types'
import type { GitResult, ReadResult, StashEntry } from '@shared/types'

/**
 * De la linea de asunto del reflog saca la rama donde se creo el stash.
 * git escribe "WIP on main: 1a2b3c mensaje" (stash automatico) o
 * "On main: mi mensaje" (cuando se pasa -m).
 */
function parseBranch(subject: string): string {
  const m = /^(?:WIP on|On) ([^:]+):/.exec(subject)
  return m ? m[1] : ''
}

/**
 * Quita el prefijo "WIP on <rama>: <sha>" y deja solo el texto util.
 * Para un stash con -m, el mensaje del usuario es todo lo que sigue a "On <rama>: ".
 */
function parseMessage(subject: string): string {
  const wip = /^WIP on [^:]+: [0-9a-f]+ (.*)$/.exec(subject)
  if (wip) return wip[1]
  const on = /^On [^:]+: (.*)$/.exec(subject)
  if (on) return on[1]
  return subject
}

/** git stash list — pila de stashes, indice 0 = el mas reciente. */
export async function listStashes(repo: string): Promise<ReadResult<StashEntry[]>> {
  const fmt = ['%gd', '%gs', '%cr'].join(SEP)
  const res = await runGit(['stash', 'list', `--format=${fmt}`], repo)
  if (!res.ok) return readErr([], res)

  const out: StashEntry[] = []
  for (const line of res.stdout.split('\n')) {
    if (!line.trim()) continue
    const [ref, subject, date] = line.split(SEP)
    // "stash@{2}" -> 2
    const idx = /\{(\d+)\}/.exec(ref ?? '')
    out.push({
      index: idx ? Number(idx[1]) : out.length,
      ref: ref ?? '',
      message: parseMessage(subject ?? ''),
      branch: parseBranch(subject ?? ''),
      date: date ?? ''
    })
  }
  return readOk(out)
}

/**
 * Guarda los cambios actuales en un stash.
 * @param message texto opcional; sin el, git genera "WIP on <rama>".
 * @param includeUntracked -u: incluye archivos nuevos sin trackear.
 * @param keepIndex --keep-index: deja lo que ya estaba en staging tal cual.
 */
export function pushStash(
  repo: string,
  message?: string,
  includeUntracked = false,
  keepIndex = false
): Promise<GitResult> {
  const args = ['stash', 'push']
  if (includeUntracked) args.push('-u')
  if (keepIndex) args.push('--keep-index')
  // -m va al final: lo que sigue es el mensaje, no un pathspec
  if (message && message.trim()) args.push('-m', message.trim())
  return runGit(args, repo)
}

/** Aplica un stash y lo DEJA en la pila. */
export const applyStash = (repo: string, ref: string): Promise<GitResult> =>
  runGit(['stash', 'apply', ref], repo)

/** Aplica un stash y lo SACA de la pila (si aplica limpio). */
export const popStash = (repo: string, ref: string): Promise<GitResult> =>
  runGit(['stash', 'pop', ref], repo)

/** Descarta un stash sin aplicarlo. Irreversible: la UI confirma antes. */
export const dropStash = (repo: string, ref: string): Promise<GitResult> =>
  runGit(['stash', 'drop', ref], repo)

/** Crea una rama nueva a partir de un stash (git stash branch). */
export const branchFromStash = (repo: string, name: string, ref: string): Promise<GitResult> =>
  runGit(['stash', 'branch', name, ref], repo)

/** Diff de lo que guarda un stash, con color para el panel tipo terminal. */
export const showStash = (repo: string, ref: string): Promise<GitResult> =>
  runGit(['-c', 'color.ui=always', 'stash', 'show', '-p', ref], repo)
