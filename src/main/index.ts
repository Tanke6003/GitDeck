import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join, resolve, sep } from 'path'
import { runGit } from './gitRunner'
import { loadRepoPaths, saveRepoPaths } from './repoStore'
import { discoverRepos, getRepoInfo } from './repoService'
import {
  addRemote,
  checkoutBranch,
  checkoutRemoteBranch,
  createBranch,
  deleteBranch,
  deleteRemoteBranch,
  fetchAll,
  getBranches,
  getCommitDetail,
  getCommits,
  getMergePreview,
  getRemotes,
  pull,
  push,
  removeRemote,
  renameBranch,
  renameRemote
} from './gitService'
import { deleteAlias, getAliases, runAlias, setAlias, stopAlias } from './aliasService'
import { toggleFavorite } from './aliasStore'
import {
  applyStash,
  branchFromStash,
  dropStash,
  listStashes,
  popStash,
  pushStash,
  showStash
} from './stashService'
import {
  createTag,
  deleteRemoteTag,
  deleteTag,
  listTags,
  pushAllTags,
  pushTag
} from './tagService'
import {
  commit,
  getStagedDiff,
  getStatus,
  stageAll,
  stageFile,
  unstageAll,
  unstageFile
} from './commitService'
import {
  abortOp,
  cherryPick,
  continueOp,
  getRepoState,
  merge,
  rebase,
  revert
} from './mergeService'
import type { PendingOp, RepoInfo } from '@shared/types'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'GitDeck',
    autoHideMenuBar: true,
    backgroundColor: '#1e1e2e',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => (mainWindow = null))

  // abrir enlaces externos en el navegador, no en la app
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // en dev electron-vite expone la URL del renderer; en prod cargamos el html empaquetado
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ---- IPC: unica puerta de entrada del renderer a git / fs ----
function registerIpc(): void {
  // -- git directo --
  ipcMain.handle('git:version', () => runGit(['--version']))
  ipcMain.handle('git:run', (_e, args: string[], cwd?: string) => runGit(args, cwd))

  // -- repos --
  ipcMain.handle('repos:list', async (): Promise<RepoInfo[]> => {
    const paths = await loadRepoPaths()
    return Promise.all(paths.map(getRepoInfo))
  })

  ipcMain.handle('repos:add', async (_e, dir: string): Promise<RepoInfo> => {
    const info = await getRepoInfo(dir)
    if (info.valid) {
      const paths = await loadRepoPaths()
      if (!paths.includes(info.path)) {
        paths.push(info.path)
        await saveRepoPaths(paths)
      }
    }
    return info
  })

  ipcMain.handle('repos:scan', async (_e, parentDir: string): Promise<RepoInfo[]> => {
    const discovered = await discoverRepos(parentDir)
    const paths = await loadRepoPaths()
    await saveRepoPaths([...paths, ...discovered])
    return Promise.all(discovered.map(getRepoInfo))
  })

  ipcMain.handle('repos:remove', async (_e, dir: string): Promise<boolean> => {
    const paths = await loadRepoPaths()
    await saveRepoPaths(paths.filter((p) => p !== dir))
    return true
  })

  // -- lectura de grafo / ramas / remotos --
  ipcMain.handle('git:commits', (_e, repo: string, limit?: number) => getCommits(repo, limit))
  ipcMain.handle('git:commitDetail', (_e, repo: string, hash: string) =>
    getCommitDetail(repo, hash)
  )
  ipcMain.handle('git:branches', (_e, repo: string) => getBranches(repo))
  ipcMain.handle('git:remotes', (_e, repo: string) => getRemotes(repo))

  // -- acciones --
  ipcMain.handle('git:fetchAll', (_e, repo: string) => fetchAll(repo))
  ipcMain.handle('git:pull', (_e, repo: string) => pull(repo))
  ipcMain.handle(
    'git:push',
    (_e, repo: string, opts?: { setUpstream?: boolean; remote?: string; branch?: string }) =>
      push(repo, opts)
  )
  ipcMain.handle('git:addRemote', (_e, repo: string, name: string, url: string) =>
    addRemote(repo, name, url)
  )
  ipcMain.handle('git:removeRemote', (_e, repo: string, name: string) => removeRemote(repo, name))
  ipcMain.handle('git:renameRemote', (_e, repo: string, oldName: string, newName: string) =>
    renameRemote(repo, oldName, newName)
  )
  ipcMain.handle(
    'git:createBranch',
    (_e, repo: string, name: string, startPoint?: string, checkout?: boolean) =>
      createBranch(repo, name, startPoint, checkout)
  )
  ipcMain.handle('git:checkout', (_e, repo: string, name: string) => checkoutBranch(repo, name))
  ipcMain.handle('git:checkoutRemote', (_e, repo: string, remoteBranch: string) =>
    checkoutRemoteBranch(repo, remoteBranch)
  )
  ipcMain.handle('git:deleteBranch', (_e, repo: string, name: string, force?: boolean) =>
    deleteBranch(repo, name, force)
  )
  ipcMain.handle('git:deleteRemoteBranch', (_e, repo: string, remote: string, branch: string) =>
    deleteRemoteBranch(repo, remote, branch)
  )
  ipcMain.handle('git:renameBranch', (_e, repo: string, oldName: string, newName: string) =>
    renameBranch(repo, oldName, newName)
  )
  ipcMain.handle('git:mergePreview', (_e, repo: string, branch: string) =>
    getMergePreview(repo, branch)
  )

  // -- stash --
  ipcMain.handle('stash:list', (_e, repo: string) => listStashes(repo))
  ipcMain.handle(
    'stash:push',
    (_e, repo: string, message?: string, includeUntracked?: boolean, keepIndex?: boolean) =>
      pushStash(repo, message, includeUntracked, keepIndex)
  )
  ipcMain.handle('stash:apply', (_e, repo: string, ref: string) => applyStash(repo, ref))
  ipcMain.handle('stash:pop', (_e, repo: string, ref: string) => popStash(repo, ref))
  ipcMain.handle('stash:drop', (_e, repo: string, ref: string) => dropStash(repo, ref))
  ipcMain.handle('stash:branch', (_e, repo: string, name: string, ref: string) =>
    branchFromStash(repo, name, ref)
  )
  ipcMain.handle('stash:show', (_e, repo: string, ref: string) => showStash(repo, ref))

  // -- tags --
  ipcMain.handle('tag:list', (_e, repo: string) => listTags(repo))
  ipcMain.handle(
    'tag:create',
    (_e, repo: string, name: string, message?: string, target?: string) =>
      createTag(repo, name, message, target)
  )
  ipcMain.handle('tag:delete', (_e, repo: string, name: string) => deleteTag(repo, name))
  ipcMain.handle('tag:deleteRemote', (_e, repo: string, remote: string, name: string) =>
    deleteRemoteTag(repo, remote, name)
  )
  ipcMain.handle('tag:push', (_e, repo: string, remote: string, name: string) =>
    pushTag(repo, remote, name)
  )
  ipcMain.handle('tag:pushAll', (_e, repo: string, remote: string) => pushAllTags(repo, remote))

  // -- alias --
  ipcMain.handle('alias:list', (_e, repo: string) => getAliases(repo))
  ipcMain.handle('alias:toggleFavorite', (_e, name: string) => toggleFavorite(name))
  ipcMain.handle('alias:run', (_e, repo: string, name: string) => runAlias(repo, name))
  ipcMain.handle('alias:stop', () => stopAlias())
  ipcMain.handle('alias:set', (_e, name: string, command: string, desc?: string) =>
    setAlias(name, command, desc)
  )
  ipcMain.handle('alias:delete', (_e, name: string) => deleteAlias(name))

  // -- commit / staging --
  ipcMain.handle('commit:status', (_e, repo: string) => getStatus(repo))
  ipcMain.handle('commit:stage', (_e, repo: string, path: string) => stageFile(repo, path))
  ipcMain.handle('commit:unstage', (_e, repo: string, path: string) => unstageFile(repo, path))
  ipcMain.handle('commit:stageAll', (_e, repo: string) => stageAll(repo))
  ipcMain.handle('commit:unstageAll', (_e, repo: string) => unstageAll(repo))
  ipcMain.handle('commit:diff', (_e, repo: string, path?: string, cached?: boolean) =>
    getStagedDiff(repo, path, cached)
  )
  ipcMain.handle('commit:commit', (_e, repo: string, message: string, amend?: boolean) =>
    commit(repo, message, amend)
  )

  // -- merge / rebase / cherry-pick / revert --
  ipcMain.handle('git:state', (_e, repo: string) => getRepoState(repo))
  ipcMain.handle('git:merge', (_e, repo: string, branch: string) => merge(repo, branch))
  ipcMain.handle('git:rebase', (_e, repo: string, onto: string) => rebase(repo, onto))
  ipcMain.handle('git:cherryPick', (_e, repo: string, hash: string) => cherryPick(repo, hash))
  ipcMain.handle('git:revert', (_e, repo: string, hash: string) => revert(repo, hash))
  ipcMain.handle('git:continueOp', (_e, repo: string, op: PendingOp) => continueOp(repo, op))
  ipcMain.handle('git:abortOp', (_e, repo: string, op: PendingOp) => abortOp(repo, op))

  // -- abrir archivo en el editor/app por defecto del sistema --
  ipcMain.handle('shell:openFile', async (_e, repo: string, relPath: string): Promise<string> => {
    // el renderer solo manda rutas relativas del repo; nos aseguramos de que
    // el resultado no se escape de la carpeta del repo antes de abrir nada
    const target = resolve(repo, relPath)
    const root = resolve(repo)
    if (target !== root && !target.startsWith(root + sep)) return 'ruta fuera del repositorio'
    return shell.openPath(target) // '' si abrio bien, mensaje de error si no
  })

  // -- dialogos nativos --
  ipcMain.handle('dialog:pickFolder', async (): Promise<string | null> => {
    const res = await dialog.showOpenDialog(mainWindow ?? undefined!, {
      title: 'Elige una carpeta',
      properties: ['openDirectory']
    })
    return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0]
  })
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
