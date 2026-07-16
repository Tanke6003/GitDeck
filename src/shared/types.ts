/**
 * Tipos compartidos entre main, preload y renderer.
 * Cada comando git devuelve siempre esta forma para poder mostrar
 * el comando real y su salida (transparencia total en la UI).
 */
export interface GitResult {
  /** true si el exit code fue 0 */
  ok: boolean
  /** comando ejecutado, para mostrarlo en la UI (ej. "git --version") */
  cmd: string
  stdout: string
  stderr: string
  /** exit code del proceso (null si murio por señal) */
  code: number | null
}

/** Info de un repo detectado. */
export interface RepoInfo {
  /** ruta absoluta al repo */
  path: string
  /** nombre de la carpeta */
  name: string
  /** rama actual, o null si HEAD esta detached / repo vacio */
  currentBranch: string | null
  /** sha corto de HEAD, o null si el repo no tiene commits */
  head: string | null
  /** true si hay cambios sin commitear (working tree o staging) */
  dirty: boolean
  /** false si la ruta ya no es un repo git valido (movido/borrado) */
  valid: boolean
  /** mensaje de error cuando valid es false */
  error?: string
}

/** Un commit tal como lo necesita el grafo. */
export interface Commit {
  hash: string
  short: string
  /** hashes completos de los padres (0 = root, 1 = normal, 2+ = merge) */
  parents: string[]
  author: string
  email: string
  /** timestamp unix en segundos (author date) */
  timestamp: number
  /** refs que apuntan a este commit (ramas, tags, HEAD) tal cual %D */
  refs: string[]
  subject: string
}

/** Un archivo cambiado en un commit (name-status). */
export interface CommitFileChange {
  /** M, A, D, R100, C… */
  status: string
  path: string
}

/** Detalle completo de un commit (para el panel de detalle). */
export interface CommitDetail {
  hash: string
  short: string
  parents: string[]
  author: string
  email: string
  /** fecha ya formateada */
  date: string
  timestamp: number
  subject: string
  /** cuerpo del mensaje (multilínea, sin el subject) */
  body: string
  files: CommitFileChange[]
  /** diff completo con color ANSI */
  diff: string
}

/** Una rama local o remota. */
export interface BranchInfo {
  /** nombre corto: "feature-x" (local) o "origin/feature-x" (remota) */
  name: string
  isRemote: boolean
  isCurrent: boolean
  /** sha corto del tip */
  head: string
  /** upstream configurado, o null */
  upstream: string | null
  /** fecha del ultimo commit, relativa */
  lastCommit: string
  subject: string
}

/** Un remoto con sus URLs. */
export interface RemoteInfo {
  name: string
  fetchUrl: string
  pushUrl: string
}

/** Estado de un archivo en el working tree / staging (git status porcelain). */
export interface FileStatus {
  path: string
  /** codigo X (staging) del porcelain */
  index: string
  /** codigo Y (working tree) del porcelain */
  work: string
  /** hay algo preparado (staged) para este archivo */
  staged: boolean
  /** hay cambios sin preparar (o es untracked) */
  unstaged: boolean
  /** archivo nuevo sin trackear */
  untracked: boolean
  /** archivo en conflicto de merge/rebase (unmerged) */
  conflicted: boolean
}

/** Estado global del repo respecto a operaciones en curso. */
export interface RepoState {
  /** hay un merge sin terminar (existe MERGE_HEAD) */
  merging: boolean
  /** hay un rebase en curso */
  rebasing: boolean
  /** rutas de archivos en conflicto (unmerged) */
  conflicted: string[]
}

/** Un alias de git con su descripcion opcional (desc.<name>). */
export interface AliasInfo {
  /** nombre del alias (ej. "lg") */
  name: string
  /** definicion (ej. "log --graph …" o "!git …" para shell) */
  command: string
  /** descripcion leida de desc.<name>, o null */
  desc: string | null
  /** true si es un alias de shell (empieza con '!') */
  isShell: boolean
}
