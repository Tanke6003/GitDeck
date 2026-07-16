import { runGit, runGitStdin } from './gitRunner'
import type { FileStatus, GitResult } from '@shared/types'

/** Lee el estado de archivos (staged / sin preparar / untracked). */
export async function getStatus(repo: string): Promise<FileStatus[]> {
  const res = await runGit(
    ['-c', 'core.quotePath=false', 'status', '--porcelain=v1', '--untracked-files=all'],
    repo
  )
  if (!res.ok) return []
  const out: FileStatus[] = []
  for (const line of res.stdout.split('\n')) {
    if (!line) continue
    const x = line[0]
    const y = line[1]
    let path = line.slice(3)
    // renombrados vienen como "old -> new": nos quedamos con el nuevo
    if (path.includes(' -> ')) path = path.split(' -> ')[1]
    const untracked = x === '?' && y === '?'
    // codigos unmerged del porcelain
    const conflicted = ['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'].includes(x + y)
    out.push({
      path,
      index: x,
      work: y,
      staged: !untracked && !conflicted && x !== ' ',
      unstaged: untracked || conflicted || y !== ' ',
      untracked,
      conflicted
    })
  }
  return out
}

export const stageFile = (repo: string, path: string): Promise<GitResult> =>
  runGit(['add', '--', path], repo)

export const unstageFile = (repo: string, path: string): Promise<GitResult> =>
  runGit(['restore', '--staged', '--', path], repo)

export const stageAll = (repo: string): Promise<GitResult> => runGit(['add', '-A'], repo)

export const unstageAll = (repo: string): Promise<GitResult> => runGit(['reset'], repo)

/**
 * Diff con color ANSI. cached=true => staging vs HEAD; cached=false => working
 * tree vs index (útil para ver marcadores de conflicto en archivos unmerged).
 */
export function getStagedDiff(repo: string, path?: string, cached = true): Promise<GitResult> {
  const args = ['-c', 'color.ui=always', 'diff', ...(cached ? ['--cached'] : [])]
  if (path) args.push('--', path)
  return runGit(args, repo)
}

/**
 * Crea el commit. El mensaje (multilínea) va por stdin con `-F -` para respetar
 * saltos de línea. Si es amend sin mensaje nuevo, conserva el anterior (--no-edit).
 */
export function commit(repo: string, message: string, amend = false): Promise<GitResult> {
  if (amend && message.trim().length === 0) {
    return runGit(['commit', '--amend', '--no-edit'], repo)
  }
  const args = ['commit', ...(amend ? ['--amend'] : []), '-F', '-']
  return runGitStdin(args, repo, message)
}
