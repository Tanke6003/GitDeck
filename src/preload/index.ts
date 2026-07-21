import { contextBridge, ipcRenderer } from 'electron'
import type { IpcChannel, IpcContract } from '@shared/ipc'

/**
 * `invoke` tipado contra el contrato de `@shared/ipc`: la firma de cada metodo
 * del api se deriva del canal, asi que main, preload y renderer no pueden
 * desalinearse sin que falle la compilacion.
 */
function invoke<K extends IpcChannel>(channel: K) {
  return (...args: Parameters<IpcContract[K]>): ReturnType<IpcContract[K]> =>
    ipcRenderer.invoke(channel, ...args) as ReturnType<IpcContract[K]>
}

/**
 * API segura expuesta al renderer. El renderer NUNCA toca child_process ni
 * ipcRenderer directamente: solo este objeto acotado (contextIsolation +
 * sandbox activos). No hay ejecutor generico de git: cada operacion es
 * explicita y acotada.
 */
const api = {
  // --- git ---
  /** git --version (prueba de vida del pipeline) */
  gitVersion: invoke('git:version'),

  // --- repos ---
  /** lista los repos guardados con su info fresca (rama, head, estado) */
  listRepos: invoke('repos:list'),
  /** agrega un repo por ruta (si es valido) y devuelve su info */
  addRepo: invoke('repos:add'),
  /** escanea una carpeta y agrega todos los repos encontrados */
  scanFolder: invoke('repos:scan'),
  /** quita un repo de la lista (no toca el disco) */
  removeRepo: invoke('repos:remove'),

  // --- grafo / ramas / remotos ---
  /** commits de todas las ramas (para el arbol) */
  commits: invoke('git:commits'),
  /** detalle de un commit (meta + archivos + diff) */
  commitDetail: invoke('git:commitDetail'),
  /** busca commits por mensaje, autor, contenido (-S/-G), archivo o revision */
  searchCommits: invoke('git:search'),
  /** ramas locales y remotas */
  branches: invoke('git:branches'),
  /** remotos con sus URLs */
  remotes: invoke('git:remotes'),
  /** diff entre dos revisiones cualquiera (rama/tag/sha), con color */
  diffRange: invoke('git:diffRange'),

  // --- acciones ---
  /** git fetch --all --prune */
  fetchAll: invoke('git:fetchAll'),
  /** git pull (con --rebase/--ff-only y remoto/rama opcionales) */
  pull: invoke('git:pull'),
  /** git push (con -u si setUpstream; --force-with-lease tras amend/rebase) */
  push: invoke('git:push'),
  /** agrega un remoto */
  addRemote: invoke('git:addRemote'),
  /** quita un remoto */
  removeRemote: invoke('git:removeRemote'),
  /** renombra un remoto */
  renameRemote: invoke('git:renameRemote'),
  /** crea rama (y opcionalmente cambia a ella); startPoint = commit/rama de origen */
  createBranch: invoke('git:createBranch'),
  /** cambia a una rama local existente */
  checkout: invoke('git:checkout'),
  /** crea/cambia a la local que sigue a una remota (switch --track) */
  checkoutRemote: invoke('git:checkoutRemote'),
  /** borra una rama local (force = -D) */
  deleteBranch: invoke('git:deleteBranch'),
  /** borra una rama en el remoto (push --delete) */
  deleteRemoteBranch: invoke('git:deleteRemoteBranch'),
  /** renombra una rama local */
  renameBranch: invoke('git:renameBranch'),
  /** que traeria fusionar `branch` en HEAD (solo lecturas) */
  mergePreview: invoke('git:mergePreview'),

  // --- stash ---
  /** pila de stashes (0 = mas reciente) */
  stashes: invoke('stash:list'),
  /** guarda los cambios actuales en un stash */
  stashPush: invoke('stash:push'),
  /** aplica un stash y lo deja en la pila */
  stashApply: invoke('stash:apply'),
  /** aplica un stash y lo saca de la pila */
  stashPop: invoke('stash:pop'),
  /** descarta un stash sin aplicarlo */
  stashDrop: invoke('stash:drop'),
  /** crea una rama a partir de un stash */
  stashBranch: invoke('stash:branch'),
  /** diff de lo que guarda un stash (con color) */
  stashShow: invoke('stash:show'),

  // --- tags ---
  /** tags del repo, los mas nuevos primero */
  tags: invoke('tag:list'),
  /** crea un tag; con message es anotado, sin el es ligero */
  createTag: invoke('tag:create'),
  /** borra un tag local */
  deleteTag: invoke('tag:delete'),
  /** borra un tag en el remoto */
  deleteRemoteTag: invoke('tag:deleteRemote'),
  /** publica un tag en el remoto */
  pushTag: invoke('tag:push'),
  /** publica todos los tags que falten en el remoto */
  pushAllTags: invoke('tag:pushAll'),

  // --- staging por hunk ---
  /** diff de un archivo troceado en hunks (cached = lo ya preparado) */
  fileHunks: invoke('hunk:list'),
  /** prepara (o con reverse quita) un solo hunk, sin tocar el archivo en disco */
  applyHunk: invoke('hunk:apply'),

  // --- blame / reflog ---
  /** quien escribio cada linea de un archivo (opcionalmente en una revision) */
  blame: invoke('git:blame'),
  /** por donde paso HEAD (para recuperar commits sin rama) */
  reflog: invoke('git:reflog'),

  // --- alias ---
  /** lista alias (global+local) con su desc.<name> y su marca de favorito */
  aliases: invoke('alias:list'),
  /** marca/desmarca un alias como favorito; devuelve la lista de favoritos */
  toggleAliasFavorite: invoke('alias:toggleFavorite'),
  /** ejecuta un alias en el repo (con color ANSI); solo uno a la vez */
  runAlias: invoke('alias:run'),
  /** detiene el alias en curso */
  stopAlias: invoke('alias:stop'),
  /** crea/edita un alias global (+desc opcional) */
  setAlias: invoke('alias:set'),
  /** borra un alias global (+su desc) */
  deleteAlias: invoke('alias:delete'),

  // --- commit / staging ---
  /** estado de archivos (staged / sin preparar / untracked) */
  status: invoke('commit:status'),
  stage: invoke('commit:stage'),
  unstage: invoke('commit:unstage'),
  stageAll: invoke('commit:stageAll'),
  unstageAll: invoke('commit:unstageAll'),
  /** diff con color; cached=false para ver marcadores de conflicto */
  stagedDiff: invoke('commit:diff'),
  /** crea el commit con mensaje multilínea (por stdin) */
  commit: invoke('commit:commit'),
  /** descarta los cambios de un archivo (restore; clean -f si es untracked) */
  discardFile: invoke('commit:discardFile'),
  /** dry-run de git clean: que se borraria, sin tocar nada */
  cleanPreview: invoke('commit:cleanPreview'),
  /** borra untracked (git clean -fd); destructivo, la UI confirma antes */
  clean: invoke('commit:clean'),

  // --- merge / rebase / cherry-pick / revert / reset ---
  /** operacion a medias (si la hay) + archivos en conflicto */
  repoState: invoke('git:state'),
  /** fusiona una rama (con --no-ff/--squash/--ff-only opcionales) */
  merge: invoke('git:merge'),
  rebase: invoke('git:rebase'),
  /** aplica un commit de otra rama sobre la actual (cherry-pick -x) */
  cherryPick: invoke('git:cherryPick'),
  /** crea un commit que deshace otro */
  revert: invoke('git:revert'),
  /** mueve HEAD a una revision (soft/mixed/hard) */
  reset: invoke('git:reset'),
  /** termina la operacion en curso tras resolver conflictos */
  continueOp: invoke('git:continueOp'),
  /** aborta la operacion en curso */
  abortOp: invoke('git:abortOp'),

  // --- dialogos / sistema ---
  /** abre el selector nativo de carpeta; null si se cancela */
  pickFolder: invoke('dialog:pickFolder'),
  /** abre un archivo del repo en la app por defecto; '' si abrio bien */
  openFile: invoke('shell:openFile')
}

export type GitDeckApi = typeof api

contextBridge.exposeInMainWorld('api', api)
