import { promises as fs } from 'fs'
import { isAbsolute, join } from 'path'
import { runGit } from './gitRunner'
import type { GitResult, PendingOp, RepoState } from '@shared/types'

/** Fusiona una rama en la actual. Conflictos => exit != 0 y queda MERGE_HEAD. */
export const merge = (repo: string, branch: string): Promise<GitResult> =>
  runGit(['merge', branch], repo)

/** Rebasa la rama actual sobre otra. */
export const rebase = (repo: string, onto: string): Promise<GitResult> =>
  runGit(['rebase', onto], repo)

/**
 * Aplica un commit de otra rama sobre la actual. Conflictos => queda CHERRY_PICK_HEAD.
 * `-x` anota "(cherry picked from commit …)" para no perder el rastro del original.
 */
export const cherryPick = (repo: string, hash: string): Promise<GitResult> =>
  runGit(['cherry-pick', '-x', hash], repo)

/**
 * Crea un commit que deshace otro. Conflictos => queda REVERT_HEAD.
 * `--no-edit` evita que git abra el editor y se cuelgue esperando.
 */
export const revert = (repo: string, hash: string): Promise<GitResult> =>
  runGit(['revert', '--no-edit', hash], repo)

/** Comandos para terminar cada operacion. El merge se cierra con un commit normal. */
const CONTINUE: Record<PendingOp, string[]> = {
  merge: ['commit', '--no-edit'],
  rebase: ['rebase', '--continue'],
  'cherry-pick': ['cherry-pick', '--continue'],
  revert: ['revert', '--continue']
}

const ABORT: Record<PendingOp, string[]> = {
  merge: ['merge', '--abort'],
  rebase: ['rebase', '--abort'],
  'cherry-pick': ['cherry-pick', '--abort'],
  revert: ['revert', '--abort']
}

/**
 * Termina la operacion en curso tras resolver los conflictos.
 * GIT_EDITOR/GIT_SEQUENCE_EDITOR=true: sin esto git abriria un editor y el
 * proceso se quedaria colgado esperando a que alguien lo cierre.
 */
export const continueOp = (repo: string, op: PendingOp): Promise<GitResult> =>
  runGit(CONTINUE[op], repo, { GIT_EDITOR: 'true', GIT_SEQUENCE_EDITOR: 'true' })

/** Aborta la operacion en curso y deja el repo como estaba. */
export const abortOp = (repo: string, op: PendingOp): Promise<GitResult> =>
  runGit(ABORT[op], repo)

/** Ruta real del git dir (respeta worktrees y .git como archivo). */
async function gitDir(repo: string): Promise<string> {
  const res = await runGit(['rev-parse', '--git-dir'], repo)
  const dir = res.stdout.trim()
  return dir ? (isAbsolute(dir) ? dir : join(repo, dir)) : join(repo, '.git')
}

async function exists(path: string): Promise<boolean> {
  try {
    await fs.access(path)
    return true
  } catch {
    return false
  }
}

/**
 * Detecta que operacion quedo a medias y que archivos estan en conflicto.
 *
 * El rebase se comprueba primero: por dentro usa cherry-pick, y aunque hoy no
 * deje CHERRY_PICK_HEAD, sus directorios son la señal inequivoca de que lo que
 * hay que continuar es el rebase y no otra cosa.
 */
export async function getRepoState(repo: string): Promise<RepoState> {
  const base = await gitDir(repo)

  let op: PendingOp | null = null
  if ((await exists(join(base, 'rebase-merge'))) || (await exists(join(base, 'rebase-apply')))) {
    op = 'rebase'
  } else if (await exists(join(base, 'MERGE_HEAD'))) {
    op = 'merge'
  } else if (await exists(join(base, 'CHERRY_PICK_HEAD'))) {
    op = 'cherry-pick'
  } else if (await exists(join(base, 'REVERT_HEAD'))) {
    op = 'revert'
  }

  const confRes = await runGit(['diff', '--name-only', '--diff-filter=U'], repo)
  const conflicted = confRes.ok ? confRes.stdout.split('\n').filter(Boolean) : []

  return { op, conflicted }
}
