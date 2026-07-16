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
  /** commits por delante del upstream */
  ahead: number
  /** commits por detras del upstream */
  behind: number
  /** el upstream ya no existe (rama borrada en el remoto) */
  gone: boolean
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

/**
 * Operacion a medias que hay que terminar (--continue) o abortar (--abort).
 * Cada una deja su propia marca en el git dir, asi que solo puede haber una.
 */
export type PendingOp = 'merge' | 'rebase' | 'cherry-pick' | 'revert'

/** Estado global del repo respecto a operaciones en curso. */
export interface RepoState {
  /** operacion sin terminar, o null si el repo esta tranquilo */
  op: PendingOp | null
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
  /** marcado como favorito por el usuario (se guarda en userData/favorites.json) */
  favorite: boolean
}

/** Un trozo contiguo de cambios dentro de un archivo (un "@@" del diff). */
export interface Hunk {
  /** posicion dentro del archivo (0 = el primero) */
  index: number
  /** la linea "@@ -a,b +c,d @@ …" */
  header: string
  /** el hunk entero tal cual lo escribio git (cabecera incluida) */
  text: string
  /** lineas agregadas */
  added: number
  /** lineas quitadas */
  removed: number
}

/** El diff de un archivo, ya troceado en hunks. */
export interface FileDiff {
  path: string
  /** cabecera del parche (diff --git / index / --- / +++) */
  header: string
  hunks: Hunk[]
  /** binario: no hay hunks que preparar por separado */
  binary: boolean
}

/** Una linea de `git blame`: el commit que la introdujo + su contenido. */
export interface BlameLine {
  hash: string
  short: string
  author: string
  /** fecha del commit (epoch en segundos) */
  timestamp: number
  /** asunto del commit, para el tooltip */
  subject: string
  /** numero de linea en el archivo */
  line: number
  /** texto de la linea */
  content: string
}

/** Una entrada del reflog: por donde paso HEAD. */
export interface ReflogEntry {
  /** selector usable como revision: "HEAD@{2}" */
  ref: string
  /** sha corto al que apuntaba */
  short: string
  /** que se hizo: "commit: …", "reset: moving to …", "checkout: …" */
  action: string
  /** cuando, relativo */
  date: string
  /** asunto del commit apuntado */
  subject: string
}

/**
 * Como se busca un commit:
 * - `message`  texto en el mensaje (--grep)
 * - `author`   nombre/email del autor (--author)
 * - `content`  texto que el commit agrego o quito (pickaxe -S)
 * - `file`     commits que tocaron rutas que contienen el texto
 * - `hash`     una revision concreta (sha, rama, tag, HEAD~2…)
 */
export type SearchMode = 'message' | 'author' | 'content' | 'file' | 'hash'

/** Un tag, ligero o anotado. */
export interface TagInfo {
  name: string
  /** sha corto del COMMIT apuntado (en un anotado, no el del objeto tag) */
  commit: string
  /** true si es un tag anotado (objeto propio con autor y mensaje) */
  annotated: boolean
  /** mensaje del tag; vacio en los ligeros (no tienen) */
  message: string
  /** fecha de creacion, relativa */
  date: string
}

/** Una entrada de la pila de stash (git stash list). */
export interface StashEntry {
  /** posicion en la pila: 0 = el mas reciente */
  index: number
  /** ref usable en comandos: "stash@{0}" */
  ref: string
  /** mensaje, ya sin el prefijo "WIP on <rama>: <sha>" */
  message: string
  /** rama en la que se creo el stash */
  branch: string
  /** cuando se creo, relativo (ej. "2 hours ago") */
  date: string
}

/** Un commit que entraria con un merge (linea del log HEAD..branch). */
export interface IncomingCommit {
  short: string
  author: string
  subject: string
}

/**
 * Vista previa de un merge: que traeria fusionar `branch` en la rama actual,
 * calculada SIN tocar el working tree (solo lecturas).
 */
export interface MergePreview {
  /** rama que se fusionaria */
  branch: string
  /** true si no hay nada que traer (ya esta fusionada) */
  upToDate: boolean
  /** true si el merge seria fast-forward (HEAD es ancestro de branch) */
  fastForward: boolean
  /** commits que entrarian (log HEAD..branch), newest-first */
  commits: IncomingCommit[]
  /** resumen de archivos (diff --stat HEAD...branch) */
  stat: string
  /** null si se pudo calcular; mensaje de git si fallo (ej. rama inexistente) */
  error: string | null
}
