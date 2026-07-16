import { promises as fs } from 'fs'
import { isAbsolute, join } from 'path'
import { runGit } from './gitRunner'
import type { GitResult, RepoState } from '@shared/types'

/** Fusiona una rama en la actual. Conflictos => exit != 0 y queda MERGE_HEAD. */
export const merge = (repo: string, branch: string): Promise<GitResult> =>
  runGit(['merge', branch], repo)

/** Rebasa la rama actual sobre otra. */
export const rebase = (repo: string, onto: string): Promise<GitResult> =>
  runGit(['rebase', onto], repo)

export const mergeAbort = (repo: string): Promise<GitResult> =>
  runGit(['merge', '--abort'], repo)

export const rebaseAbort = (repo: string): Promise<GitResult> =>
  runGit(['rebase', '--abort'], repo)

/** Termina el merge tras resolver: crea el commit de merge sin abrir editor. */
export const mergeContinue = (repo: string): Promise<GitResult> =>
  runGit(['commit', '--no-edit'], repo)

/** Continua el rebase tras resolver. GIT_EDITOR=true evita que se cuelgue en el editor. */
export const rebaseContinue = (repo: string): Promise<GitResult> =>
  runGit(['rebase', '--continue'], repo, { GIT_EDITOR: 'true', GIT_SEQUENCE_EDITOR: 'true' })

/** Detecta si hay merge/rebase en curso y qué archivos están en conflicto. */
export async function getRepoState(repo: string): Promise<RepoState> {
  const mergeHead = await runGit(['rev-parse', '-q', '--verify', 'MERGE_HEAD'], repo)
  const merging = mergeHead.ok

  // rebase: existencia de rebase-merge / rebase-apply dentro del git dir
  const gitDirRes = await runGit(['rev-parse', '--git-dir'], repo)
  const gitDir = gitDirRes.stdout.trim()
  const base = gitDir ? (isAbsolute(gitDir) ? gitDir : join(repo, gitDir)) : join(repo, '.git')
  let rebasing = false
  for (const d of ['rebase-merge', 'rebase-apply']) {
    try {
      await fs.access(join(base, d))
      rebasing = true
    } catch {
      /* no existe */
    }
  }

  const confRes = await runGit(['diff', '--name-only', '--diff-filter=U'], repo)
  const conflicted = confRes.ok ? confRes.stdout.split('\n').filter(Boolean) : []

  return { merging, rebasing, conflicted }
}
