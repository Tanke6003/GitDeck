# GitDeck — Resumen de auditorías y backlog de tareas

Consolidado de las 4 auditorías realizadas sobre GitDeck. El detalle de cada una
está en su propio archivo:

| # | Auditoría | Ronda 1 | Ronda 2 (tras las correcciones) |
|---|-----------|---------|--------------------------------|
| 1 | Calidad de código | [`01-calidad-codigo.md`](01-calidad-codigo.md) | [`ronda-2/01-calidad-codigo.md`](ronda-2/01-calidad-codigo.md) |
| 2 | UI / UX | [`02-ui-ux.md`](02-ui-ux.md) | [`ronda-2/02-ui-ux.md`](ronda-2/02-ui-ux.md) |
| 3 | Ingeniería de software | [`03-ingenieria-software.md`](03-ingenieria-software.md) | [`ronda-2/03-ingenieria-software.md`](ronda-2/03-ingenieria-software.md) |
| 4 | Control de versiones (assessment) | [`04-control-versiones.md`](04-control-versiones.md) | [`ronda-2/04-control-versiones.md`](ronda-2/04-control-versiones.md) |

**Veredicto global (ronda 1):** GitDeck es un proyecto **de calidad alta y bien construido**
para su madurez (v0.0.1). Arquitectura de 4 capas limpia, frontera IPC sensata,
decisiones de seguridad correctas (argumentos como array sin shell, `contextIsolation`,
mensajes por STDIN, guard de path traversal) y una suite de tests que corre **git
real** contra repos temporales. Los problemas encontrados son de **bordes,
accesibilidad, tema claro y cobertura funcional**, no estructurales.

---

## ✅ Ya corregido (sesión 1 — auditorías)

- [x] **`.editorconfig`** creado (utf-8, 2 espacios, LF, newline final, trim de
  trailing whitespace; overrides para `*.md` y `*.{json,yml,yaml}`).
- [x] **Linting reforzado** en `.eslintrc.cjs`: `eslint-plugin-react-hooks` +
  `eslint-config-prettier`, y reglas `eqeqeq`, `no-var`, `object-shorthand`,
  `consistent-type-imports`. 0 errores / 0 warnings.
- [x] **`App.tsx`**: quitada la ruta personal `E:\MTTRSystem` del estado vacío.
- [x] **`CommitPanel.tsx`**: eliminado el código muerto `staged.length >= 0`.
- [x] **BUG `format.ts` `parseRef`**: rama local jerárquica ya no se pinta como remota.
- [x] **BUG de tema claro**: variable `--graph-bg` por tema en el grafo.
- [x] **`index.ts`**: quitado el hack de tipado `undefined!` del diálogo de carpeta.

## ✅ Corregido (sesión 2 — atención del backlog)

Verificado: `npm run typecheck`, `npm run lint`, `npm test` (129/129) y
`npm run build` pasan.

### P0 — Críticas (todas resueltas)

- [x] **`[bug]` `push --force-with-lease`**: nueva opción `forceWithLease` en `push`
  + botón "Reintentar con --force-with-lease" (con confirmación) cuando el push
  es rechazado por non-fast-forward. El flujo amend/rebase ya no queda atascado.
- [x] **`[bug]` `runGitStdin` con timeout** (`gitRunner.ts`): un hook colgado ya
  no deja el commit/tag/hunk esperando para siempre; el fallo explica la señal.
- [x] **Serialización de operaciones git por repo**: cola por ruta en el `main`
  (`repoQueue.ts` + `handleWrite` en `index.ts`). Dos escrituras concurrentes
  sobre el mismo repo ya no chocan por `.git/index.lock`. Stash/Tag además
  reciben el `busy` del padre.
- [x] **Los errores de lectura ya no se tragan**: todas las lecturas devuelven
  `ReadResult<T>` (`{ data, error }`); la UI distingue "sin datos" de "git falló"
  y muestra el comando + salida del fallo (grafo, status, stash, tags, blame,
  reflog, hunks, alias, búsqueda).

### P1 — Altas (todas resueltas)

**Accesibilidad:**
- [x] `:focus-visible` global (y en inputs) — el foco de teclado siempre se ve.
- [x] Elementos clicables convertidos en `<button>` reales: repos, filas del
  grafo, ramas, archivos, resultados de búsqueda, mensajes de stash.
- [x] Acciones de rama visibles también con `:focus-within` (no solo hover) y
  con área de click mayor.
- [x] `Dialog` accesible reutilizable (role="dialog", aria-modal, trampa de foco,
  Escape uniforme, retorno de foco) usado por TODOS los diálogos. En los
  destructivos el foco inicial va a **Cancelar**.

**Flujos de control de versiones:**
- [x] **`git reset` (soft/mixed/hard)** con `ResetDialog` desde el detalle de
  commit y desde el reflog (que ya no es solo lectura).
- [x] **Descartar cambios de un archivo** (`restore`; `clean -f` si es untracked),
  con confirmación destructiva, en el panel Commit.
- [x] **`git clean`** con vista previa dry-run (`clean -nd`) y opción `-x`.
- [x] **`pull --rebase` / `--ff-only`**: selector de estrategia junto al botón
  Pull (se recuerda la elección).
- [x] **Comparar dos revisiones cualquiera**: diálogo "Comparar" (A..B, A...B y
  working-tree↔rev) con autocompletado de refs y diff ANSI.

**Feedback:**
- [x] Spinner localizado en el botón que dispara fetch/pull/push; resultados OK
  se auto-descartan a los 6 s (los errores persisten). *(Streaming de progreso
  real queda como mejora futura.)*

### P2 — Medias (todas resueltas salvo notas)

- [x] **`[bug]` detalle de commits de merge**: `diff-tree --cc` — ya lista los
  archivos (test incluido).
- [x] **Contrato IPC tipado**: `src/shared/ipc.ts` es la única fuente de verdad;
  `main` y `preload` derivan sus tipos de él (un typo de canal no compila).
- [x] **`git:run`/`api.git` eliminados** (ejecutor de git arbitrario sin uso).
- [x] **Concurrencia limitada en `repos:list`** (`mapLimit`, 6 a la vez) y
  `getRepoInfo` pasa de 4 comandos git a **1** (`status --porcelain=v2 --branch`).
- [x] **Un solo listener de `focus`** (en App, con `focusTick` hacia RepoDetail).
- [x] **CI**: `.github/workflows/ci.yml` (typecheck + lint + test en Windows y Ubuntu).
- [x] **Tests de piezas puras**: `graph.ts`, `ansi.ts`, `gitError.ts`, `format.ts`,
  diccionario i18n, `commitService`, `repoService`, `repoQueue` (129 tests en total).
  *(Pendiente: `aliasService`/stores — requieren mock de electron.)*
- [x] **Refactor de `RepoDetail.tsx`**: helper `runAction()` + subcomponentes
  `BranchLists` y `RemoteList`.
- [x] **Confirmaciones destructivas consistentes**: rebase, quitar remoto y
  quitar repo ahora confirman.
- [x] **`aria-label` en botones solo-icono, `aria-live`/`role=status|alert`** en
  avisos y resultados; punto dirty/clean con forma (anillo vs relleno) además
  del color; contador de encabezado con ⚠ al pasarse.
- [x] **`merge` con opciones** `--no-ff` / `--squash` / `--ff-only` (radio en la
  vista previa de merge, con tests).
- [x] **Búsqueda con `-G` (regex)** como sexto modo del buscador.
- [x] **Paginación del grafo**: botón "cargar 400 más" (el `limit` de
  `getCommits` ya está cableado). *(La búsqueda mantiene su límite de 200 con
  indicador "(máx.)".)*

### P3 — Bajas (hechas las de calidad; el resto sigue a futuro)

- [x] `SEP` y `NET_TIMEOUT` centralizados en `src/main/gitFormat.ts`.
- [x] Colores restantes a variables CSS: carriles del grafo (`--lane-0..7` por
  tema), paleta del blame, chips remotos/merge (`--teal`, `--mauve`); contraste
  de `alias-desc.none` corregido.
- [x] `@typescript-eslint/no-explicit-any` reactivado en `'error'`.
- [ ] *(Opcional, descartado por ahora)* `import/order` con `--fix`.
- [x] **Seguridad**: CSP ya presente en `index.html`; ahora además
  `sandbox: true`, `GIT_TERMINAL_PROMPT=0`, y `shell:openFile` resuelve
  symlinks (`realpath`) y bloquea extensiones ejecutables (.exe/.bat/.ps1…).

**Extra (fuera del backlog):**
- [x] **i18n completo (es/en)**: diccionario tipado (`lib/messages.ts` — una
  clave sin traducir no compila), provider `lib/i18n.tsx`, toggle ES/EN en el
  sidebar, `lang` del documento sincronizado y `relativeTime` bilingüe.
- [x] **BUG `relativeTime`**: las etiquetas estaban corridas una unidad
  ("hace 3 min" cuando eran 3 horas) — detectado por los tests nuevos.
- [x] Hoja de atajos de teclado (tecla `?` o botón en la cabecera).
- [x] Fetch/Pull/Push visibles en todas las pestañas (no solo en Árbol).
- [x] Guard de "un alias a la vez" impuesto en el `main`.
- [x] `package.json`: versión 0.1.0 + `engines.node >= 18`.

### Pendiente a futuro (sin cambios)

**Control de versiones — deseables:** rebase interactivo, `--onto`/`--autostash`/
`--skip`, staging por línea, firmar/verificar commits, resolución 3-way
ours/theirs, clone/init, config de identidad por repo, `.gitignore`/hooks.

**Avanzadas:** submódulos, worktrees, LFS, sparse-checkout, `gc`/`prune`,
`bisect`, blame `-C`/`-M`/`--follow`.

**UI/UX mayores:** virtualizar el grafo, diff lado a lado, resolución de
conflictos integrada, panel lateral colapsable, streaming de progreso de red.
