import { contextBridge, ipcRenderer } from 'electron'
import type {
  AliasInfo,
  BranchInfo,
  Commit,
  CommitDetail,
  FileStatus,
  GitResult,
  RemoteInfo,
  RepoInfo,
  RepoState
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
  /** ramas locales y remotas */
  branches: (repo: string): Promise<BranchInfo[]> => ipcRenderer.invoke('git:branches', repo),
  /** remotos con sus URLs */
  remotes: (repo: string): Promise<RemoteInfo[]> => ipcRenderer.invoke('git:remotes', repo),

  // --- acciones ---
  /** git fetch --all --prune */
  fetchAll: (repo: string): Promise<GitResult> => ipcRenderer.invoke('git:fetchAll', repo),
  /** crea rama (y opcionalmente cambia a ella) */
  createBranch: (
    repo: string,
    name: string,
    startPoint?: string,
    checkout?: boolean
  ): Promise<GitResult> =>
    ipcRenderer.invoke('git:createBranch', repo, name, startPoint, checkout),
  /** cambia a una rama existente */
  checkout: (repo: string, name: string): Promise<GitResult> =>
    ipcRenderer.invoke('git:checkout', repo, name),

  // --- alias ---
  /** lista alias (global+local) con su desc.<name> */
  aliases: (repo: string): Promise<AliasInfo[]> => ipcRenderer.invoke('alias:list', repo),
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

  // --- merge / rebase ---
  /** estado del repo: merge/rebase en curso + archivos en conflicto */
  repoState: (repo: string): Promise<RepoState> => ipcRenderer.invoke('git:state', repo),
  merge: (repo: string, branch: string): Promise<GitResult> =>
    ipcRenderer.invoke('git:merge', repo, branch),
  rebase: (repo: string, onto: string): Promise<GitResult> =>
    ipcRenderer.invoke('git:rebase', repo, onto),
  mergeAbort: (repo: string): Promise<GitResult> => ipcRenderer.invoke('git:mergeAbort', repo),
  rebaseAbort: (repo: string): Promise<GitResult> => ipcRenderer.invoke('git:rebaseAbort', repo),
  mergeContinue: (repo: string): Promise<GitResult> =>
    ipcRenderer.invoke('git:mergeContinue', repo),
  rebaseContinue: (repo: string): Promise<GitResult> =>
    ipcRenderer.invoke('git:rebaseContinue', repo),

  // --- dialogos ---
  /** abre el selector nativo de carpeta; null si se cancela */
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:pickFolder')
}

export type GitDeckApi = typeof api

contextBridge.exposeInMainWorld('api', api)
