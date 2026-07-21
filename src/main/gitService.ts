import { runGit } from './gitRunner'
import { NET_TIMEOUT, SEP } from './gitFormat'
import { readErr, readOk } from '@shared/types'
import type {
  BranchInfo,
  Commit,
  CommitDetail,
  GitResult,
  IncomingCommit,
  MergeOpts,
  MergePreview,
  PullOpts,
  PushOpts,
  ReadResult,
  RemoteInfo,
  SearchMode
} from '@shared/types'

/** formato de una linea de log -> Commit */
const LOG_FMT = ['%H', '%h', '%P', '%an', '%ae', '%at', '%D', '%s'].join(SEP)

/** Parsea la salida de `log --pretty=format:LOG_FMT`. */
function parseCommits(stdout: string): Commit[] {
  return stdout
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

/** Lee el log de TODAS las ramas (para el grafo). Newest-first, --date-order. */
export async function getCommits(repo: string, limit = 400): Promise<ReadResult<Commit[]>> {
  const res = await runGit(
    ['log', '--all', '--date-order', `--max-count=${limit}`, `--pretty=format:${LOG_FMT}`],
    repo
  )
  // un repo recien inicializado no tiene HEAD: eso es "sin commits", no un error
  if (!res.ok && /does not have any commits yet|bad default revision/i.test(res.stderr)) {
    return readOk([])
  }
  return res.ok ? readOk(parseCommits(res.stdout)) : readErr([], res)
}

/**
 * Busca commits en todas las ramas.
 *
 * Los argumentos van como array a execFile (sin shell), asi que el texto del
 * usuario no se interpreta: no hace falta escaparlo.
 */
export async function searchCommits(
  repo: string,
  mode: SearchMode,
  text: string,
  limit = 200
): Promise<ReadResult<Commit[]>> {
  const t = text.trim()
  if (!t) return readOk([])

  const base = ['log', `--max-count=${limit}`, `--pretty=format:${LOG_FMT}`]
  let args: string[]
  switch (mode) {
    case 'message':
      args = [...base, '--all', '--regexp-ignore-case', `--grep=${t}`]
      break
    case 'author':
      args = [...base, '--all', '--regexp-ignore-case', `--author=${t}`]
      break
    case 'content':
      // pickaxe: commits donde cambio el numero de apariciones del texto
      args = [...base, '--all', `-S${t}`]
      break
    case 'regex':
      // -G: regex sobre las lineas agregadas/quitadas; encuentra cambios que -S no ve
      args = [...base, '--all', `-G${t}`]
      break
    case 'file':
      // pathspec con comodines: cualquier ruta que contenga el texto
      args = [...base, '--all', '--', `*${t}*`]
      break
    case 'hash':
      // acepta cualquier revision: sha, rama, tag, HEAD~2...
      args = [...base, '--max-count=1', t]
      break
  }

  const res = await runGit(args, repo)
  // una revision inexistente o un regex invalido salen por exit != 0: sin resultados,
  // pero conservamos el error para que la UI pueda distinguirlo de "0 coincidencias"
  return res.ok ? readOk(parseCommits(res.stdout)) : readErr([], res)
}

/**
 * Detalle de un commit: metadatos, archivos cambiados y diff con color.
 *
 * `--cc` en diff-tree: sin el, un commit de MERGE no emite ningun archivo
 * (mientras `git show` si produce diff) y el drawer mostraba "Archivos (0)"
 * con un diff visible debajo.
 */
export async function getCommitDetail(
  repo: string,
  hash: string
): Promise<ReadResult<CommitDetail | null>> {
  const fmt = ['%H', '%h', '%P', '%an', '%ae', '%ad', '%at', '%s', '%b'].join(SEP)
  const [metaRes, filesRes, diffRes] = await Promise.all([
    runGit(['show', '-s', '--date=format:%Y-%m-%d %H:%M', `--format=${fmt}`, hash], repo),
    runGit(['diff-tree', '--cc', '--no-commit-id', '--name-status', '-r', '--root', hash], repo),
    runGit(['-c', 'color.ui=always', 'show', '--format=', '--patch', hash], repo)
  ])

  // hash invalido u otro fallo: antes se devolvia un detalle "fantasma" con todo vacio
  if (!metaRes.ok) return readErr(null, metaRes)

  const p = metaRes.stdout.split(SEP)
  const files = filesRes.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const cols = line.split('\t')
      return { status: cols[0], path: cols[cols.length - 1] }
    })

  return readOk({
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
  })
}

/** Lista ramas locales y remotas en una sola pasada. */
export async function getBranches(repo: string): Promise<ReadResult<BranchInfo[]>> {
  const fmt = [
    '%(refname)',
    '%(objectname:short)',
    '%(HEAD)',
    '%(upstream:short)',
    '%(committerdate:relative)',
    '%(subject)',
    '%(upstream:track,nobracket)'
  ].join(SEP)
  const res = await runGit(['for-each-ref', `--format=${fmt}`, 'refs/heads', 'refs/remotes'], repo)
  if (!res.ok) return readErr([], res)

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
  return readOk(out)
}

/** Lista los remotos con sus URLs de fetch/push. */
export async function getRemotes(repo: string): Promise<ReadResult<RemoteInfo[]>> {
  const res = await runGit(['remote', '-v'], repo)
  if (!res.ok) return readErr([], res)
  const map = new Map<string, { fetch?: string; push?: string }>()
  for (const line of res.stdout.split('\n')) {
    const m = /^(\S+)\s+(\S+)\s+\((fetch|push)\)/.exec(line)
    if (!m) continue
    const [, name, url, kind] = m
    const entry = map.get(name) ?? {}
    if (kind === 'fetch') entry.fetch = url
    else entry.push = url
    map.set(name, entry)
  }
  return readOk(
    [...map.entries()].map(([name, e]) => ({
      name,
      fetchUrl: e.fetch ?? '',
      pushUrl: e.push ?? ''
    }))
  )
}

/**
 * Diff entre dos revisiones cualquiera (rama, tag, sha…), con color.
 * - `revA..revB`  diferencia directa entre ambos arboles
 * - `revA...revB` (threeDot) diferencia contra la base comun: "que aporto revB"
 * - sin revB: working tree contra revA
 */
export function diffRange(
  repo: string,
  revA: string,
  revB?: string,
  threeDot = false
): Promise<GitResult> {
  const range = revB && revB.trim() ? `${revA}${threeDot ? '...' : '..'}${revB.trim()}` : revA
  return runGit(['-c', 'color.ui=always', 'diff', range], repo)
}

// ---- acciones (devuelven GitResult para mostrar comando + salida) ----

/** git fetch --all --prune */
export function fetchAll(repo: string): Promise<GitResult> {
  return runGit(['fetch', '--all', '--prune'], repo, undefined, NET_TIMEOUT)
}

/**
 * git pull con estrategia opcional (--rebase / --ff-only) y remoto/rama
 * concretos. Sin opciones es el pull de siempre (merge del upstream actual).
 */
export function pull(repo: string, opts?: PullOpts): Promise<GitResult> {
  const args = ['pull']
  if (opts?.rebase) args.push('--rebase')
  if (opts?.ffOnly) args.push('--ff-only')
  if (opts?.remote) {
    args.push(opts.remote)
    if (opts.branch) args.push(opts.branch)
  }
  return runGit(args, repo, undefined, NET_TIMEOUT)
}

/**
 * git push. Con setUpstream publica la rama (-u remote branch). Con
 * forceWithLease hace el push forzado SEGURO que hace falta tras amend/rebase.
 */
export function push(repo: string, opts?: PushOpts): Promise<GitResult> {
  const args = ['push']
  if (opts?.forceWithLease) args.push('--force-with-lease')
  if (opts?.setUpstream) args.push('-u', opts.remote ?? 'origin', opts.branch ?? 'HEAD')
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
export async function checkoutRemoteBranch(repo: string, remoteBranch: string): Promise<GitResult> {
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
): Promise<GitResult> => runGit(['push', remote, '--delete', branch], repo, undefined, NET_TIMEOUT)

/** Renombra una rama local (git branch -m viejo nuevo). */
export const renameBranch = (repo: string, oldName: string, newName: string): Promise<GitResult> =>
  runGit(['branch', '-m', oldName, newName], repo)

/**
 * Fusiona una rama en la actual con opciones de politica de integracion.
 * Conflictos => exit != 0 y queda MERGE_HEAD.
 */
export function merge(repo: string, branch: string, opts?: MergeOpts): Promise<GitResult> {
  const args = ['merge']
  if (opts?.noFF) args.push('--no-ff')
  if (opts?.ffOnly) args.push('--ff-only')
  if (opts?.squash) args.push('--squash')
  args.push(branch)
  return runGit(args, repo)
}

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
