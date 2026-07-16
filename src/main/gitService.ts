import { runGit } from './gitRunner'
import type {
  BranchInfo,
  Commit,
  CommitDetail,
  GitResult,
  IncomingCommit,
  MergePreview,
  RemoteInfo
} from '@shared/types'

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
    '%(subject)',
    '%(upstream:track,nobracket)'
  ].join(SEP)
  const res = await runGit(
    ['for-each-ref', `--format=${fmt}`, 'refs/heads', 'refs/remotes'],
    repo
  )
  if (!res.ok) return []

  const out: BranchInfo[] = []
  for (const line of res.stdout.split('\n')) {
    if (!line.trim()) continue
    const [refname, sha, head, upstream, date, subject, track] = line.split(SEP)
    const isRemote = refname.startsWith('refs/remotes/')
    const name = refname.replace('refs/heads/', '').replace('refs/remotes/', '')
    // saltar el puntero remoto "origin/HEAD"
    if (isRemote && name.endsWith('/HEAD')) continue
    const t = track ?? ''
    const aheadM = /ahead (\d+)/.exec(t)
    const behindM = /behind (\d+)/.exec(t)
    out.push({
      name,
      isRemote,
      isCurrent: head.trim() === '*',
      head: sha,
      upstream: upstream || null,
      lastCommit: date,
      subject: subject ?? '',
      ahead: aheadM ? Number(aheadM[1]) : 0,
      behind: behindM ? Number(behindM[1]) : 0,
      gone: t.includes('gone')
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

/** timeout amplio para operaciones de red (fetch/pull/push) */
const NET_TIMEOUT = 180_000

/** git fetch --all --prune */
export function fetchAll(repo: string): Promise<GitResult> {
  return runGit(['fetch', '--all', '--prune'], repo, undefined, NET_TIMEOUT)
}

/** git pull en la rama actual (usa su upstream). */
export function pull(repo: string): Promise<GitResult> {
  return runGit(['pull'], repo, undefined, NET_TIMEOUT)
}

/** git push; si setUpstream, publica la rama con -u remote branch. */
export function push(
  repo: string,
  opts?: { setUpstream?: boolean; remote?: string; branch?: string }
): Promise<GitResult> {
  const args = opts?.setUpstream
    ? ['push', '-u', opts.remote ?? 'origin', opts.branch ?? 'HEAD']
    : ['push']
  return runGit(args, repo, undefined, NET_TIMEOUT)
}

export const addRemote = (repo: string, name: string, url: string): Promise<GitResult> =>
  runGit(['remote', 'add', name, url], repo)

export const removeRemote = (repo: string, name: string): Promise<GitResult> =>
  runGit(['remote', 'remove', name], repo)

/** Renombra un remoto; git reescribe solo las refs remotas y el upstream de las ramas. */
export const renameRemote = (repo: string, oldName: string, newName: string): Promise<GitResult> =>
  runGit(['remote', 'rename', oldName, newName], repo)

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

/**
 * Checkout de una rama remota ("origin/foo") creando la local que la sigue.
 *
 * Si la local ya existe hacemos un `switch` normal (`--track` fallaria con
 * "already exists"); si no, `switch --track origin/foo` la crea con upstream
 * explicito en vez de depender del DWIM de git.
 */
export async function checkoutRemoteBranch(
  repo: string,
  remoteBranch: string
): Promise<GitResult> {
  const local = remoteBranch.split('/').slice(1).join('/')
  if (!local) return runGit(['switch', remoteBranch], repo)
  const exists = await runGit(['rev-parse', '--verify', '--quiet', `refs/heads/${local}`], repo)
  return exists.ok
    ? runGit(['switch', local], repo)
    : runGit(['switch', '--track', remoteBranch], repo)
}

/** Borra una rama local. force => -D (descarta commits no fusionados). */
export const deleteBranch = (repo: string, name: string, force = false): Promise<GitResult> =>
  runGit(['branch', force ? '-D' : '-d', name], repo)

/** Borra una rama en el remoto (git push origin --delete foo). Toca la red. */
export const deleteRemoteBranch = (
  repo: string,
  remote: string,
  branch: string
): Promise<GitResult> =>
  runGit(['push', remote, '--delete', branch], repo, undefined, NET_TIMEOUT)

/** Renombra una rama local (git branch -m viejo nuevo). */
export const renameBranch = (repo: string, oldName: string, newName: string): Promise<GitResult> =>
  runGit(['branch', '-m', oldName, newName], repo)

/**
 * Vista previa de un merge: commits y archivos que entrarian al fusionar
 * `branch` en HEAD. Solo lecturas — no toca el working tree ni el indice.
 */
export async function getMergePreview(repo: string, branch: string): Promise<MergePreview> {
  // la rama tiene que existir antes de comparar
  const verify = await runGit(['rev-parse', '--verify', '--quiet', `${branch}^{commit}`], repo)
  if (!verify.ok) {
    return {
      branch,
      upToDate: false,
      fastForward: false,
      commits: [],
      stat: '',
      error: (verify.stderr || `la rama "${branch}" no existe`).trim()
    }
  }

  const fmt = ['%h', '%an', '%s'].join(SEP)
  const [logRes, statRes, ffRes] = await Promise.all([
    // HEAD..branch = lo que tiene branch y no tiene HEAD
    runGit(['log', `--pretty=format:${fmt}`, `HEAD..${branch}`], repo),
    // 3 puntos = diff contra la base comun, que es lo que el merge aplicaria
    runGit(['diff', '--stat', `HEAD...${branch}`], repo),
    // HEAD ancestro de branch => el merge seria fast-forward
    runGit(['merge-base', '--is-ancestor', 'HEAD', branch], repo)
  ])

  const commits: IncomingCommit[] = logRes.stdout
    .split('\n')
    .filter((l) => l.length > 0)
    .map((line) => {
      const [short, author, subject] = line.split(SEP)
      return { short, author, subject: subject ?? '' }
    })

  return {
    branch,
    upToDate: commits.length === 0,
    fastForward: ffRes.ok,
    commits,
    stat: statRes.stdout.trim(),
    error: null
  }
}
