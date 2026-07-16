import { contextBridge, ipcRenderer } from 'electron'
import type {
  AliasInfo,
  BlameLine,
  BranchInfo,
  Commit,
  CommitDetail,
  FileDiff,
  FileStatus,
  GitResult,
  MergePreview,
  PendingOp,
  ReflogEntry,
  RemoteInfo,
  RepoInfo,
  RepoState,
  SearchMode,
  StashEntry,
  TagInfo
} from '@shared/types'

/**
 * API segura expuesta al renderer. El renderer NUNCA toca child_process ni ipcRenderer
 * directamente: solo este objeto acotado (contextIsolation activo).
 */
const api = {
  // --- git ---
  /** git --version (prueba de vida del pipeline) */
  gitVersion: (): Promise<GitResult> => ipcRenderer.invoke('git:version'),
  /** ejecutor generico de git en un repo dado */
  git: (args: string[], cwd?: string): Promise<GitResult> =>
    ipcRenderer.invoke('git:run', args, cwd),

  // --- repos ---
  /** lista los repos guardados con su info fresca (rama, head, estado) */
  listRepos: (): Promise<RepoInfo[]> => ipcRenderer.invoke('repos:list'),
  /** agrega un repo por ruta (si es valido) y devuelve su info */
  addRepo: (dir: string): Promise<RepoInfo> => ipcRenderer.invoke('repos:add', dir),
  /** escanea una carpeta y agrega todos los repos encontrados */
  scanFolder: (dir: string): Promise<RepoInfo[]> => ipcRenderer.invoke('repos:scan', dir),
  /** quita un repo de la lista (no toca el disco) */
  removeRepo: (dir: string): Promise<boolean> => ipcRenderer.invoke('repos:remove', dir),

  // --- grafo / ramas / remotos ---
  /** commits de todas las ramas (para el arbol) */
  commits: (repo: string, limit?: number): Promise<Commit[]> =>
    ipcRenderer.invoke('git:commits', repo, limit),
  /** detalle de un commit (meta + archivos + diff) */
  commitDetail: (repo: string, hash: string): Promise<CommitDetail> =>
    ipcRenderer.invoke('git:commitDetail', repo, hash),
  /** busca commits por mensaje, autor, contenido, archivo o revision */
  searchCommits: (
    repo: string,
    mode: SearchMode,
    text: string,
    limit?: number
  ): Promise<Commit[]> => ipcRenderer.invoke('git:search', repo, mode, text, limit),
  /** ramas locales y remotas */
  branches: (repo: string): Promise<BranchInfo[]> => ipcRenderer.invoke('git:branches', repo),
  /** remotos con sus URLs */
  remotes: (repo: string): Promise<RemoteInfo[]> => ipcRenderer.invoke('git:remotes', repo),

  // --- acciones ---
  /** git fetch --all --prune */
  fetchAll: (repo: string): Promise<GitResult> => ipcRenderer.invoke('git:fetchAll', repo),
  /** git pull en la rama actual */
  pull: (repo: string): Promise<GitResult> => ipcRenderer.invoke('git:pull', repo),
  /** git push (con -u si setUpstream) */
  push: (
    repo: string,
    opts?: { setUpstream?: boolean; remote?: string; branch?: string }
  ): Promise<GitResult> => ipcRenderer.invoke('git:push', repo, opts),
  /** agrega un remoto */
  addRemote: (repo: string, name: string, url: string): Promise<GitResult> =>
    ipcRenderer.invoke('git:addRemote', repo, name, url),
  /** quita un remoto */
  removeRemote: (repo: string, name: string): Promise<GitResult> =>
    ipcRenderer.invoke('git:removeRemote', repo, name),
  /** renombra un remoto */
  renameRemote: (repo: string, oldName: string, newName: string): Promise<GitResult> =>
    ipcRenderer.invoke('git:renameRemote', repo, oldName, newName),
  /** crea rama (y opcionalmente cambia a ella); startPoint = commit/rama de origen */
  createBranch: (
    repo: string,
    name: string,
    startPoint?: string,
    checkout?: boolean
  ): Promise<GitResult> =>
    ipcRenderer.invoke('git:createBranch', repo, name, startPoint, checkout),
  /** cambia a una rama local existente */
  checkout: (repo: string, name: string): Promise<GitResult> =>
    ipcRenderer.invoke('git:checkout', repo, name),
  /** crea/cambia a la local que sigue a una remota (switch --track) */
  checkoutRemote: (repo: string, remoteBranch: string): Promise<GitResult> =>
    ipcRenderer.invoke('git:checkoutRemote', repo, remoteBranch),
  /** borra una rama local (force = -D) */
  deleteBranch: (repo: string, name: string, force?: boolean): Promise<GitResult> =>
    ipcRenderer.invoke('git:deleteBranch', repo, name, force),
  /** borra una rama en el remoto (push --delete) */
  deleteRemoteBranch: (repo: string, remote: string, branch: string): Promise<GitResult> =>
    ipcRenderer.invoke('git:deleteRemoteBranch', repo, remote, branch),
  /** renombra una rama local */
  renameBranch: (repo: string, oldName: string, newName: string): Promise<GitResult> =>
    ipcRenderer.invoke('git:renameBranch', repo, oldName, newName),
  /** que traeria fusionar `branch` en HEAD (solo lecturas) */
  mergePreview: (repo: string, branch: string): Promise<MergePreview> =>
    ipcRenderer.invoke('git:mergePreview', repo, branch),

  // --- stash ---
  /** pila de stashes (0 = mas reciente) */
  stashes: (repo: string): Promise<StashEntry[]> => ipcRenderer.invoke('stash:list', repo),
  /** guarda los cambios actuales en un stash */
  stashPush: (
    repo: string,
    message?: string,
    includeUntracked?: boolean,
    keepIndex?: boolean
  ): Promise<GitResult> =>
    ipcRenderer.invoke('stash:push', repo, message, includeUntracked, keepIndex),
  /** aplica un stash y lo deja en la pila */
  stashApply: (repo: string, ref: string): Promise<GitResult> =>
    ipcRenderer.invoke('stash:apply', repo, ref),
  /** aplica un stash y lo saca de la pila */
  stashPop: (repo: string, ref: string): Promise<GitResult> =>
    ipcRenderer.invoke('stash:pop', repo, ref),
  /** descarta un stash sin aplicarlo */
  stashDrop: (repo: string, ref: string): Promise<GitResult> =>
    ipcRenderer.invoke('stash:drop', repo, ref),
  /** crea una rama a partir de un stash */
  stashBranch: (repo: string, name: string, ref: string): Promise<GitResult> =>
    ipcRenderer.invoke('stash:branch', repo, name, ref),
  /** diff de lo que guarda un stash (con color) */
  stashShow: (repo: string, ref: string): Promise<GitResult> =>
    ipcRenderer.invoke('stash:show', repo, ref),

  // --- tags ---
  /** tags del repo, los mas nuevos primero */
  tags: (repo: string): Promise<TagInfo[]> => ipcRenderer.invoke('tag:list', repo),
  /** crea un tag; con message es anotado, sin el es ligero */
  createTag: (repo: string, name: string, message?: string, target?: string): Promise<GitResult> =>
    ipcRenderer.invoke('tag:create', repo, name, message, target),
  /** borra un tag local */
  deleteTag: (repo: string, name: string): Promise<GitResult> =>
    ipcRenderer.invoke('tag:delete', repo, name),
  /** borra un tag en el remoto */
  deleteRemoteTag: (repo: string, remote: string, name: string): Promise<GitResult> =>
    ipcRenderer.invoke('tag:deleteRemote', repo, remote, name),
  /** publica un tag en el remoto */
  pushTag: (repo: string, remote: string, name: string): Promise<GitResult> =>
    ipcRenderer.invoke('tag:push', repo, remote, name),
  /** publica todos los tags que falten en el remoto */
  pushAllTags: (repo: string, remote: string): Promise<GitResult> =>
    ipcRenderer.invoke('tag:pushAll', repo, remote),

  // --- staging por hunk ---
  /** diff de un archivo troceado en hunks (cached = lo ya preparado) */
  fileHunks: (repo: string, path: string, cached?: boolean): Promise<FileDiff | null> =>
    ipcRenderer.invoke('hunk:list', repo, path, cached),
  /** prepara (o con reverse quita) un solo hunk, sin tocar el archivo en disco */
  applyHunk: (
    repo: string,
    file: FileDiff,
    index: number,
    reverse?: boolean
  ): Promise<GitResult> => ipcRenderer.invoke('hunk:apply', repo, file, index, reverse),

  // --- blame / reflog ---
  /** quien escribio cada linea de un archivo (opcionalmente en una revision) */
  blame: (repo: string, path: string, rev?: string): Promise<BlameLine[]> =>
    ipcRenderer.invoke('git:blame', repo, path, rev),
  /** por donde paso HEAD (para recuperar commits sin rama) */
  reflog: (repo: string, limit?: number): Promise<ReflogEntry[]> =>
    ipcRenderer.invoke('git:reflog', repo, limit),

  // --- alias ---
  /** lista alias (global+local) con su desc.<name> y su marca de favorito */
  aliases: (repo: string): Promise<AliasInfo[]> => ipcRenderer.invoke('alias:list', repo),
  /** marca/desmarca un alias como favorito; devuelve la lista de favoritos */
  toggleAliasFavorite: (name: string): Promise<string[]> =>
    ipcRenderer.invoke('alias:toggleFavorite', name),
  /** ejecuta un alias en el repo (con color ANSI) */
  runAlias: (repo: string, name: string): Promise<GitResult> =>
    ipcRenderer.invoke('alias:run', repo, name),
  /** detiene el alias en curso */
  stopAlias: (): Promise<boolean> => ipcRenderer.invoke('alias:stop'),
  /** crea/edita un alias global (+desc opcional) */
  setAlias: (name: string, command: string, desc?: string): Promise<GitResult> =>
    ipcRenderer.invoke('alias:set', name, command, desc),
  /** borra un alias global (+su desc) */
  deleteAlias: (name: string): Promise<GitResult> => ipcRenderer.invoke('alias:delete', name),

  // --- commit / staging ---
  /** estado de archivos (staged / sin preparar / untracked) */
  status: (repo: string): Promise<FileStatus[]> => ipcRenderer.invoke('commit:status', repo),
  stage: (repo: string, path: string): Promise<GitResult> =>
    ipcRenderer.invoke('commit:stage', repo, path),
  unstage: (repo: string, path: string): Promise<GitResult> =>
    ipcRenderer.invoke('commit:unstage', repo, path),
  stageAll: (repo: string): Promise<GitResult> => ipcRenderer.invoke('commit:stageAll', repo),
  unstageAll: (repo: string): Promise<GitResult> => ipcRenderer.invoke('commit:unstageAll', repo),
  /** diff con color; cached=false para ver marcadores de conflicto */
  stagedDiff: (repo: string, path?: string, cached?: boolean): Promise<GitResult> =>
    ipcRenderer.invoke('commit:diff', repo, path, cached),
  /** crea el commit con mensaje multilínea (por stdin) */
  commit: (repo: string, message: string, amend?: boolean): Promise<GitResult> =>
    ipcRenderer.invoke('commit:commit', repo, message, amend),

  // --- merge / rebase / cherry-pick / revert ---
  /** operacion a medias (si la hay) + archivos en conflicto */
  repoState: (repo: string): Promise<RepoState> => ipcRenderer.invoke('git:state', repo),
  merge: (repo: string, branch: string): Promise<GitResult> =>
    ipcRenderer.invoke('git:merge', repo, branch),
  rebase: (repo: string, onto: string): Promise<GitResult> =>
    ipcRenderer.invoke('git:rebase', repo, onto),
  /** aplica un commit de otra rama sobre la actual (cherry-pick -x) */
  cherryPick: (repo: string, hash: string): Promise<GitResult> =>
    ipcRenderer.invoke('git:cherryPick', repo, hash),
  /** crea un commit que deshace otro */
  revert: (repo: string, hash: string): Promise<GitResult> =>
    ipcRenderer.invoke('git:revert', repo, hash),
  /** termina la operacion en curso tras resolver conflictos */
  continueOp: (repo: string, op: PendingOp): Promise<GitResult> =>
    ipcRenderer.invoke('git:continueOp', repo, op),
  /** aborta la operacion en curso */
  abortOp: (repo: string, op: PendingOp): Promise<GitResult> =>
    ipcRenderer.invoke('git:abortOp', repo, op),

  // --- dialogos / sistema ---
  /** abre el selector nativo de carpeta; null si se cancela */
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:pickFolder'),
  /** abre un archivo del repo en la app por defecto; '' si abrio bien */
  openFile: (repo: string, relPath: string): Promise<string> =>
    ipcRenderer.invoke('shell:openFile', repo, relPath)
}

export type GitDeckApi = typeof api

contextBridge.exposeInMainWorld('api', api)
