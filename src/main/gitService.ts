import { runGit } from './gitRunner'
import type { BranchInfo, Commit, CommitDetail, GitResult, RemoteInfo } from '@shared/types'

/** separador de campos poco probable en el contenido (unit separator) */
const SEP = '\x1f'

/** Lee el log de TODAS las ramas (para el grafo). Newest-first, --date-order. */
export async function getCommits(repo: string, limit = 400): Promise<Commit[]> {
  const fmt = ['%H', '%h', '%P', '%an', '%ae', '%at', '%D', '%s'].join(SEP)
  const res = await runGit(
    ['log', '--all', '--date-order', `--max-count=${limit}`, `--pretty=format:${fmt}`],
    repo
  )
  if (!res.ok) return []
  return res.stdout
    .split('\n')
    .filter((l) => l.length > 0)
    .map((line) => {
      const [hash, short, parents, author, email, at, refs, subject] = line.split(SEP)
      return {
        hash,
        short,
        parents: parents ? parents.split(' ').filter(Boolean) : [],
        author,
        email,
        timestamp: Number(at) || 0,
        refs: refs
          ? refs
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
        subject: subject ?? ''
      }
    })
}

/** Detalle de un commit: metadatos, archivos cambiados y diff con color. */
export async function getCommitDetail(repo: string, hash: string): Promise<CommitDetail> {
  const fmt = ['%H', '%h', '%P', '%an', '%ae', '%ad', '%at', '%s', '%b'].join(SEP)
  const [metaRes, filesRes, diffRes] = await Promise.all([
    runGit(['show', '-s', '--date=format:%Y-%m-%d %H:%M', `--format=${fmt}`, hash], repo),
    runGit(['diff-tree', '--no-commit-id', '--name-status', '-r', '--root', hash], repo),
    runGit(['-c', 'color.ui=always', 'show', '--format=', '--patch', hash], repo)
  ])

  const p = metaRes.stdout.split(SEP)
  const files = filesRes.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const cols = line.split('\t')
      return { status: cols[0], path: cols[cols.length - 1] }
    })

  return {
    hash: p[0] ?? hash,
    short: p[1] ?? '',
    parents: p[2] ? p[2].split(' ').filter(Boolean) : [],
    author: p[3] ?? '',
    email: p[4] ?? '',
    date: p[5] ?? '',
    timestamp: Number(p[6]) || 0,
    subject: p[7] ?? '',
    body: (p[8] ?? '').trim(),
    files,
    diff: diffRes.stdout
  }
}

/** Lista ramas locales y remotas en una sola pasada. */
export async function getBranches(repo: string): Promise<BranchInfo[]> {
  const fmt = [
    '%(refname)',
    '%(objectname:short)',
    '%(HEAD)',
    '%(upstream:short)',
    '%(committerdate:relative)',
    '%(subject)'
  ].join(SEP)
  const res = await runGit(
    ['for-each-ref', `--format=${fmt}`, 'refs/heads', 'refs/remotes'],
    repo
  )
  if (!res.ok) return []

  const out: BranchInfo[] = []
  for (const line of res.stdout.split('\n')) {
    if (!line.trim()) continue
    const [refname, sha, head, upstream, date, subject] = line.split(SEP)
    const isRemote = refname.startsWith('refs/remotes/')
    const name = refname.replace('refs/heads/', '').replace('refs/remotes/', '')
    // saltar el puntero remoto "origin/HEAD"
    if (isRemote && name.endsWith('/HEAD')) continue
    out.push({
      name,
      isRemote,
      isCurrent: head.trim() === '*',
      head: sha,
      upstream: upstream || null,
      lastCommit: date,
      subject: subject ?? ''
    })
  }
  return out
}

/** Lista los remotos con sus URLs de fetch/push. */
export async function getRemotes(repo: string): Promise<RemoteInfo[]> {
  const res = await runGit(['remote', '-v'], repo)
  if (!res.ok) return []
  const map = new Map<string, { fetch?: string; push?: string }>()
  for (const line of res.stdout.split('\n')) {
    const m = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)/)
    if (!m) continue
    const [, name, url, kind] = m
    const entry = map.get(name) ?? {}
    if (kind === 'fetch') entry.fetch = url
    else entry.push = url
    map.set(name, entry)
  }
  return [...map.entries()].map(([name, e]) => ({
    name,
    fetchUrl: e.fetch ?? '',
    pushUrl: e.push ?? ''
  }))
}

// ---- acciones (devuelven GitResult para mostrar comando + salida) ----

/** git fetch --all --prune */
export function fetchAll(repo: string): Promise<GitResult> {
  return runGit(['fetch', '--all', '--prune'], repo)
}

/** Crea una rama; si checkout, cambia a ella (switch -c). */
export function createBranch(
  repo: string,
  name: string,
  startPoint?: string,
  checkout = true
): Promise<GitResult> {
  const args = checkout ? ['switch', '-c', name] : ['branch', name]
  if (startPoint) args.push(startPoint)
  return runGit(args, repo)
}

/** Cambia a una rama existente (el renderer manda el nombre local ya resuelto). */
export function checkoutBranch(repo: string, name: string): Promise<GitResult> {
  return runGit(['switch', name], repo)
}
