import { execFile, spawn } from 'child_process'
import type { GitResult } from '@shared/types'

/** ¿El error de execFile trae un exit code numerico? */
function exitCode(error: unknown): number {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: unknown }).code
    if (typeof code === 'number') return code
  }
  return 1
}

/**
 * Entorno comun de todos los git que lanzamos.
 * - LC_ALL: salida en UTF-8 sin depender del locale de Windows.
 * - GIT_TERMINAL_PROMPT=0: sin TTY no hay quien conteste un prompt de
 *   credenciales; sin esto git se quedaria esperando hasta agotar el timeout
 *   de red en vez de fallar limpio (el credential manager sigue funcionando).
 */
const baseEnv = (extraEnv?: Record<string, string>): NodeJS.ProcessEnv => ({
  ...process.env,
  LC_ALL: 'C.UTF-8',
  GIT_TERMINAL_PROMPT: '0',
  ...extraEnv
})

/**
 * Ejecuta el binario `git` REAL con los argumentos dados.
 *
 * Usamos el git de Git-for-Windows (no una reimplementacion JS) para que
 * los alias con `!` de shell (overview, alias, lgme, today...) corran igual
 * que en la terminal.
 *
 * @param args argumentos, ya troceados (ej. ["log", "--oneline"])
 * @param cwd  carpeta del repo donde correr el comando (undefined = cwd del proceso)
 */
export function runGit(
  args: string[],
  cwd?: string,
  extraEnv?: Record<string, string>,
  timeoutMs = 60_000
): Promise<GitResult> {
  const cmd = `git ${args.join(' ')}`
  return new Promise((resolve) => {
    execFile(
      'git',
      args,
      {
        cwd,
        // buffer amplio para logs largos; se paginara en fases futuras
        maxBuffer: 32 * 1024 * 1024,
        windowsHide: true,
        timeout: timeoutMs,
        env: baseEnv(extraEnv)
      },
      (error, stdout, stderr) => {
        resolve({
          ok: !error,
          cmd,
          stdout: stdout ?? '',
          stderr: stderr ?? '',
          code: error ? exitCode(error) : 0
        })
      }
    )
  })
}

/**
 * Igual que runGit pero pasando texto por STDIN. Se usa para `git commit -F -`,
 * asi el mensaje conserva saltos de linea y UTF-8 sin depender de `-m` ni de la shell.
 *
 * Con timeout: un hook (pre-commit, commit-msg…) colgado dejaba el commit/tag
 * esperando para siempre, sin forma de cancelar desde la UI.
 */
export function runGitStdin(
  args: string[],
  cwd: string,
  input: string,
  timeoutMs = 60_000
): Promise<GitResult> {
  const cmd = `git ${args.join(' ')}`
  return new Promise((resolve) => {
    const child = spawn('git', args, {
      cwd,
      windowsHide: true,
      timeout: timeoutMs,
      env: baseEnv()
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d.toString()))
    child.stderr.on('data', (d) => (stderr += d.toString()))
    child.on('error', (e) => resolve({ ok: false, cmd, stdout, stderr: stderr || String(e), code: 1 }))
    child.on('close', (code, signal) => {
      if (signal) {
        // lo mato el timeout (o alguien externo): que el usuario sepa por que fallo
        const note = `[proceso terminado (${signal}) — posible hook colgado o timeout de ${timeoutMs / 1000}s]`
        resolve({ ok: false, cmd, stdout, stderr: `${stderr}\n${note}`.trim(), code: null })
      } else {
        resolve({ ok: code === 0, cmd, stdout, stderr, code })
      }
    })
    child.stdin.end(input)
  })
}
