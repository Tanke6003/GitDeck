import type {
  AliasInfo,
  BlameLine,
  BranchInfo,
  Commit,
  CommitDetail,
  FileDiff,
  FileStatus,
  GitResult,
  MergeOpts,
  MergePreview,
  PendingOp,
  PullOpts,
  PushOpts,
  ReadResult,
  ReflogEntry,
  RemoteInfo,
  RepoInfo,
  RepoState,
  ResetMode,
  SearchMode,
  StashEntry,
  TagInfo
} from './types'

/**
 * Contrato de la frontera IPC: canal -> firma. UNICA fuente de verdad.
 *
 * Antes cada comando estaba escrito tres veces (handler del main, preload y
 * servicio) y `invoke` era Promise<any>: un typo de canal o un parametro
 * cambiado era un fallo silencioso en runtime. Ahora el registro del main y el
 * `invoke` del preload derivan sus tipos de este mapa, asi que un desajuste no
 * compila.
 */
export interface IpcContract {
  // -- git directo --
  'git:version': () => Promise<GitResult>

  // -- repos --
  'repos:list': () => Promise<RepoInfo[]>
  'repos:add': (dir: string) => Promise<RepoInfo>
  'repos:scan': (parentDir: string) => Promise<RepoInfo[]>
  'repos:remove': (dir: string) => Promise<boolean>

  // -- lecturas de grafo / ramas / remotos --
  'git:commits': (repo: string, limit?: number) => Promise<ReadResult<Commit[]>>
  'git:commitDetail': (repo: string, hash: string) => Promise<ReadResult<CommitDetail | null>>
  'git:search': (
    repo: string,
    mode: SearchMode,
    text: string,
    limit?: number
  ) => Promise<ReadResult<Commit[]>>
  'git:branches': (repo: string) => Promise<ReadResult<BranchInfo[]>>
  'git:remotes': (repo: string) => Promise<ReadResult<RemoteInfo[]>>
  'git:diffRange': (repo: string, revA: string, revB?: string, threeDot?: boolean) => Promise<GitResult>

  // -- acciones --
  'git:fetchAll': (repo: string) => Promise<GitResult>
  'git:pull': (repo: string, opts?: PullOpts) => Promise<GitResult>
  'git:push': (repo: string, opts?: PushOpts) => Promise<GitResult>
  'git:addRemote': (repo: string, name: string, url: string) => Promise<GitResult>
  'git:removeRemote': (repo: string, name: string) => Promise<GitResult>
  'git:renameRemote': (repo: string, oldName: string, newName: string) => Promise<GitResult>
  'git:createBranch': (
    repo: string,
    name: string,
    startPoint?: string,
    checkout?: boolean
  ) => Promise<GitResult>
  'git:checkout': (repo: string, name: string) => Promise<GitResult>
  'git:checkoutRemote': (repo: string, remoteBranch: string) => Promise<GitResult>
  'git:deleteBranch': (repo: string, name: string, force?: boolean) => Promise<GitResult>
  'git:deleteRemoteBranch': (repo: string, remote: string, branch: string) => Promise<GitResult>
  'git:renameBranch': (repo: string, oldName: string, newName: string) => Promise<GitResult>
  'git:mergePreview': (repo: string, branch: string) => Promise<MergePreview>

  // -- stash --
  'stash:list': (repo: string) => Promise<ReadResult<StashEntry[]>>
  'stash:push': (
    repo: string,
    message?: string,
    includeUntracked?: boolean,
    keepIndex?: boolean
  ) => Promise<GitResult>
  'stash:apply': (repo: string, ref: string) => Promise<GitResult>
  'stash:pop': (repo: string, ref: string) => Promise<GitResult>
  'stash:drop': (repo: string, ref: string) => Promise<GitResult>
  'stash:branch': (repo: string, name: string, ref: string) => Promise<GitResult>
  'stash:show': (repo: string, ref: string) => Promise<GitResult>

  // -- tags --
  'tag:list': (repo: string) => Promise<ReadResult<TagInfo[]>>
  'tag:create': (repo: string, name: string, message?: string, target?: string) => Promise<GitResult>
  'tag:delete': (repo: string, name: string) => Promise<GitResult>
  'tag:deleteRemote': (repo: string, remote: string, name: string) => Promise<GitResult>
  'tag:push': (repo: string, remote: string, name: string) => Promise<GitResult>
  'tag:pushAll': (repo: string, remote: string) => Promise<GitResult>

  // -- blame / reflog --
  'git:blame': (repo: string, path: string, rev?: string) => Promise<ReadResult<BlameLine[]>>
  'git:reflog': (repo: string, limit?: number) => Promise<ReadResult<ReflogEntry[]>>

  // -- staging por hunk --
  'hunk:list': (repo: string, path: string, cached?: boolean) => Promise<ReadResult<FileDiff | null>>
  'hunk:apply': (repo: string, file: FileDiff, index: number, reverse?: boolean) => Promise<GitResult>

  // -- alias --
  'alias:list': (repo: string) => Promise<ReadResult<AliasInfo[]>>
  'alias:toggleFavorite': (name: string) => Promise<string[]>
  'alias:run': (repo: string, name: string) => Promise<GitResult>
  'alias:stop': () => Promise<boolean>
  'alias:set': (name: string, command: string, desc?: string) => Promise<GitResult>
  'alias:delete': (name: string) => Promise<GitResult>

  // -- commit / staging --
  'commit:status': (repo: string) => Promise<ReadResult<FileStatus[]>>
  'commit:stage': (repo: string, path: string) => Promise<GitResult>
  'commit:unstage': (repo: string, path: string) => Promise<GitResult>
  'commit:stageAll': (repo: string) => Promise<GitResult>
  'commit:unstageAll': (repo: string) => Promise<GitResult>
  'commit:diff': (repo: string, path?: string, cached?: boolean) => Promise<GitResult>
  'commit:commit': (repo: string, message: string, amend?: boolean) => Promise<GitResult>
  'commit:discardFile': (repo: string, path: string, untracked?: boolean) => Promise<GitResult>
  'commit:cleanPreview': (repo: string, includeIgnored?: boolean) => Promise<GitResult>
  'commit:clean': (repo: string, includeIgnored?: boolean) => Promise<GitResult>

  // -- merge / rebase / cherry-pick / revert / reset --
  'git:state': (repo: string) => Promise<RepoState>
  'git:merge': (repo: string, branch: string, opts?: MergeOpts) => Promise<GitResult>
  'git:rebase': (repo: string, onto: string) => Promise<GitResult>
  'git:cherryPick': (repo: string, hash: string) => Promise<GitResult>
  'git:revert': (repo: string, hash: string) => Promise<GitResult>
  'git:reset': (repo: string, mode: ResetMode, rev: string) => Promise<GitResult>
  'git:continueOp': (repo: string, op: PendingOp) => Promise<GitResult>
  'git:abortOp': (repo: string, op: PendingOp) => Promise<GitResult>

  // -- sistema --
  'shell:openFile': (repo: string, relPath: string) => Promise<string>
  'dialog:pickFolder': () => Promise<string | null>
}

export type IpcChannel = keyof IpcContract
