import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { promises as fs } from 'fs'
import { extname, join, resolve, sep } from 'path'
import { runGit } from './gitRunner'
import { mapLimit, withRepoLock } from './repoQueue'
import { loadRepoPaths, saveRepoPaths } from './repoStore'
import { discoverRepos, getRepoInfo } from './repoService'
import {
  addRemote,
  checkoutBranch,
  checkoutRemoteBranch,
  createBranch,
  deleteBranch,
  deleteRemoteBranch,
  diffRange,
  fetchAll,
  getBranches,
  getCommitDetail,
  getCommits,
  getMergePreview,
  getRemotes,
  merge,
  pull,
  push,
  removeRemote,
  renameBranch,
  renameRemote,
  searchCommits
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
import { getBlame, getReflog } from './blameService'
import { applyHunk, getFileHunks } from './hunkService'
import {
  clean,
  cleanPreview,
  commit,
  discardFile,
  getStagedDiff,
  getStatus,
  stageAll,
  stageFile,
  unstageAll,
  unstageFile
} from './commitService'
import { abortOp, cherryPick, continueOp, getRepoState, rebase, reset, revert } from './mergeService'
import type { IpcChannel, IpcContract } from '@shared/ipc'
import type { RepoInfo } from '@shared/types'

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
      // sandbox activo: el preload solo usa contextBridge/ipcRenderer, que
      // estan disponibles en preloads sandboxeados. Defensa en profundidad.
      sandbox: true,
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

type Handler<K extends IpcChannel> = (
  ...args: Parameters<IpcContract[K]>
) => ReturnType<IpcContract[K]>

/**
 * Registra un handler tipado contra el contrato de `@shared/ipc`: canal y
 * firma se verifican en compilacion (antes cada firma estaba triplicada a
 * mano y un typo era un fallo silencioso en runtime).
 *
 * `serializeByRepo`: encola la operacion tras las pendientes del MISMO repo
 * (el primer argumento es la ruta). Evita que dos escrituras concurrentes
 * choquen por `.git/index.lock`.
 */
function handle<K extends IpcChannel>(
  channel: K,
  fn: Handler<K>,
  opts?: { serializeByRepo?: boolean }
): void {
  // el tipado fuerte vive en la firma de arriba (Handler<K> contra el contrato);
  // por dentro se borra para poder re-esparcir los argumentos del ipc
  const untyped = fn as unknown as (...args: unknown[]) => Promise<unknown>
  ipcMain.handle(channel, (_e, ...args: unknown[]) => {
    if (opts?.serializeByRepo && typeof args[0] === 'string') {
      return withRepoLock(args[0], () => untyped(...args))
    }
    return untyped(...args)
  })
}

/** atajo para las escrituras: siempre en cola por repo */
function handleWrite<K extends IpcChannel>(channel: K, fn: Handler<K>): void {
  handle(channel, fn, { serializeByRepo: true })
}

/**
 * Extensiones que Windows EJECUTA al "abrirlas". `shell.openPath` sobre un
 * `conflicto.bat` de un repo hostil lo correria; para estos casos el usuario
 * debe abrir el archivo desde su editor.
 */
const BLOCKED_EXT = new Set([
  '.exe',
  '.bat',
  '.cmd',
  '.com',
  '.scr',
  '.msi',
  '.ps1',
  '.psm1',
  '.vbs',
  '.vbe',
  '.wsf',
  '.wsh',
  '.hta',
  '.cpl',
  '.reg',
  '.lnk',
  '.jar'
])

// ---- IPC: unica puerta de entrada del renderer a git / fs ----
// No hay ejecutor generico de git expuesto (el antiguo `git:run` se elimino:
// superficie de ataque sin ningun uso en la UI).
function registerIpc(): void {
  handle('git:version', () => runGit(['--version']))

  // -- repos --
  handle('repos:list', async (): Promise<RepoInfo[]> => {
    const paths = await loadRepoPaths()
    // tope de concurrencia: con decenas de repos no se lanzan decenas de gits a la vez
    return mapLimit(paths, 6, getRepoInfo)
  })

  handle('repos:add', async (dir: string): Promise<RepoInfo> => {
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

  handle('repos:scan', async (parentDir: string): Promise<RepoInfo[]> => {
    const discovered = await discoverRepos(parentDir)
    const paths = await loadRepoPaths()
    await saveRepoPaths([...paths, ...discovered])
    return mapLimit(discovered, 6, getRepoInfo)
  })

  handle('repos:remove', async (dir: string): Promise<boolean> => {
    const paths = await loadRepoPaths()
    await saveRepoPaths(paths.filter((p) => p !== dir))
    return true
  })

  // -- lectura de grafo / ramas / remotos --
  handle('git:commits', getCommits)
  handle('git:commitDetail', getCommitDetail)
  handle('git:search', searchCommits)
  handle('git:branches', getBranches)
  handle('git:remotes', getRemotes)
  handle('git:diffRange', diffRange)
  handle('git:mergePreview', getMergePreview)

  // -- acciones (escrituras: en cola por repo) --
  handleWrite('git:fetchAll', fetchAll)
  handleWrite('git:pull', pull)
  handleWrite('git:push', push)
  handleWrite('git:addRemote', addRemote)
  handleWrite('git:removeRemote', removeRemote)
  handleWrite('git:renameRemote', renameRemote)
  handleWrite('git:createBranch', createBranch)
  handleWrite('git:checkout', checkoutBranch)
  handleWrite('git:checkoutRemote', checkoutRemoteBranch)
  handleWrite('git:deleteBranch', deleteBranch)
  handleWrite('git:deleteRemoteBranch', deleteRemoteBranch)
  handleWrite('git:renameBranch', renameBranch)

  // -- stash --
  handle('stash:list', listStashes)
  handleWrite('stash:push', pushStash)
  handleWrite('stash:apply', applyStash)
  handleWrite('stash:pop', popStash)
  handleWrite('stash:drop', dropStash)
  handleWrite('stash:branch', branchFromStash)
  handle('stash:show', showStash)

  // -- tags --
  handle('tag:list', listTags)
  handleWrite('tag:create', createTag)
  handleWrite('tag:delete', deleteTag)
  handleWrite('tag:deleteRemote', deleteRemoteTag)
  handleWrite('tag:push', pushTag)
  handleWrite('tag:pushAll', pushAllTags)

  // -- blame / reflog --
  handle('git:blame', getBlame)
  handle('git:reflog', getReflog)

  // -- staging por hunk --
  handle('hunk:list', getFileHunks)
  handleWrite('hunk:apply', applyHunk)

  // -- alias --
  handle('alias:list', getAliases)
  handle('alias:toggleFavorite', toggleFavorite)
  // un alias puede escribir en el repo: tambien va en cola
  handleWrite('alias:run', runAlias)
  handle('alias:stop', async () => stopAlias())
  handle('alias:set', setAlias)
  handle('alias:delete', deleteAlias)

  // -- commit / staging --
  handle('commit:status', getStatus)
  handleWrite('commit:stage', stageFile)
  handleWrite('commit:unstage', unstageFile)
  handleWrite('commit:stageAll', stageAll)
  handleWrite('commit:unstageAll', unstageAll)
  handle('commit:diff', getStagedDiff)
  handleWrite('commit:commit', commit)
  handleWrite('commit:discardFile', discardFile)
  handle('commit:cleanPreview', cleanPreview)
  handleWrite('commit:clean', clean)

  // -- merge / rebase / cherry-pick / revert / reset --
  handle('git:state', getRepoState)
  handleWrite('git:merge', merge)
  handleWrite('git:rebase', rebase)
  handleWrite('git:cherryPick', cherryPick)
  handleWrite('git:revert', revert)
  handleWrite('git:reset', reset)
  handleWrite('git:continueOp', continueOp)
  handleWrite('git:abortOp', abortOp)

  // -- abrir archivo en el editor/app por defecto del sistema --
  handle('shell:openFile', async (repo: string, relPath: string): Promise<string> => {
    // el renderer solo manda rutas relativas del repo; ademas de comprobar que
    // el resultado no se escapa de la carpeta, se resuelven symlinks: un enlace
    // dentro del repo apuntando fuera pasaria el chequeo de prefijo a secas
    let root: string
    let target: string
    try {
      root = await fs.realpath(resolve(repo))
      target = await fs.realpath(resolve(repo, relPath))
    } catch {
      return 'file not found'
    }
    if (target !== root && !target.startsWith(root + sep)) return 'path outside the repository'
    if (BLOCKED_EXT.has(extname(target).toLowerCase())) {
      return `blocked extension (${extname(target)}): open it from your editor`
    }
    return shell.openPath(target) // '' si abrio bien, mensaje de error si no
  })

  // -- dialogos nativos --
  handle('dialog:pickFolder', async (): Promise<string | null> => {
    const opts: Electron.OpenDialogOptions = {
      title: 'GitDeck',
      properties: ['openDirectory']
    }
    // sin ventana usamos el overload de un solo argumento, en vez de forzar undefined
    const res = mainWindow
      ? await dialog.showOpenDialog(mainWindow, opts)
      : await dialog.showOpenDialog(opts)
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
