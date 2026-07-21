# Auditoría de Ingeniería de Software — GitDeck (ronda 2)

**Fecha:** 2026-07-21
**Alcance:** `src/main`, `src/preload`, `src/shared`, componentes React con lógica de estado (`RepoDetail`, `CommitPanel`, `StashPanel`, `TagPanel`, `CommitDetailDrawer`, drawers/dialogs nuevos: `ResetDialog`, `CleanDialog`, `CompareDialog`, `ReflogDialog`, `Dialog`), `src/renderer/src/lib` (i18n, ansi, graph, format, gitError, theme), tests y toda la configuración de build/test/CI.
**Contexto:** segunda ronda, tras aplicar el lote de correcciones descrito en `audits/00-resumen-y-tareas.md`. Los hallazgos de la ronda 1 están en `audits/03-ingenieria-software.md` (A-1/A-2, M-1…M-9, B-1…B-8).
**Verificación ejecutada en esta auditoría:** `npm test` → **129/129 verdes**; `npm run typecheck` (node + web) → **limpio**; `npm run lint` → **0 errores / 0 warnings**.

---

## 1. Resumen ejecutivo

El lote de correcciones es **serio y bien ejecutado**. De los 19 hallazgos de la ronda 1, **13 quedan totalmente resueltos**, **4 parciales** y **2 persisten** (ambos conscientemente diferidos a futuro). Los dos hallazgos ALTA (A-1 serialización, A-2 lecturas que tragan errores) están atacados en el sitio correcto —la invariante ahora vive en el `main`, no en cada componente— con `repoQueue.ts` (cola de escrituras por repo) y `ReadResult<T>` (todas las lecturas conservan el `GitResult` fallido). El **contrato IPC único y tipado** (`src/shared/ipc.ts`) es la mejora estructural de mayor retorno: un typo de canal o un parámetro cambiado ya no compila, y elimina la triplicación de firmas. Se añadió **CI en dos plataformas**, `sandbox: true`, CSP, `GIT_TERMINAL_PROMPT=0`, `realpath` + denylist en `openFile`, y ~50 tests nuevos que corren **git de verdad**.

**Veredicto general: verde.** La arquitectura ya era sólida; esta ronda cierra la deuda estructural que crecía rápido (serialización, contrato IPC, modelo de error de lectura). Los hallazgos nuevos son de **menor gravedad que en la ronda 1** y casi todos son *bordes* de las piezas nuevas: (1) las lecturas **no** entran en la cola y no fijan `GIT_OPTIONAL_LOCKS=0`, así que un `git status` puede contender con una escritura en curso; (2) `getMergePreview` sigue teniendo un residual del patrón A-2 (un sub-comando fallido produce un "ya está fusionada" falso); (3) `RepoDetail.load()` es la única carga sin guard `alive`, con carrera de "repo obsoleto" al cambiar rápido de repo; (4) la denylist de `openFile` omite `.js`/`.jse`/`.url`/`.scf`, que en Windows **también** ejecutan; (5) `runAlias` no hereda el endurecimiento de entorno (`GIT_TERMINAL_PROMPT=0`). Ninguno es bloqueante.

**Lo más urgente de esta ronda:** (1) serializar/etiquetar también las lecturas críticas contra escrituras o fijar `GIT_OPTIONAL_LOCKS=0`; (2) cerrar el residual de A-2 en `getMergePreview`; (3) añadir guard `alive` a `RepoDetail.load()`; (4) cambiar la denylist de `openFile` por allowlist o apertura solo-en-editor.

---

## 2. Estado de los hallazgos de la ronda 1

| # (r1) | Hallazgo | Estado | Evidencia / residual |
|--------|----------|--------|----------------------|
| **A-1** | Sin serialización de git por repo (`index.lock`) | **Resuelto** | `repoQueue.ts:16` `withRepoLock` + `index.ts:136` `handleWrite`; TODAS las escrituras van en cola por ruta (`toLowerCase` para Windows). Test `repoQueue.test.ts`. **Residual:** las *lecturas* no entran en la cola (ver M2-1). |
| **A-2** | Lecturas tragan errores (`res.ok ? parse : []`) | **Parcial** | `ReadResult<T>` (`types.ts:24`) en getCommits/search/commitDetail/branches/remotes/status/stash/tags/blame/reflog/hunks/aliases; la UI muestra `pane-error` con cmd+salida. **Residual:** `getMergePreview` no comprueba sus sub-comandos (M2-2); `getRepoState`, `loadDiff`, `stashShow` aún aplanan (B2-2/B2-3). |
| **M-1** | `runGitStdin` sin timeout | **Resuelto** | `gitRunner.ts:76-105`: `timeout` en `spawn`, `close(code, signal)` explica la señal (`code:null`). |
| **M-2** | Detalle de merge muestra 0 archivos | **Resuelto** | `gitService.ts:122` `diff-tree --cc`; test "un commit de MERGE lista sus archivos". |
| **M-3** | Contrato IPC triplicado a mano | **Resuelto** | `src/shared/ipc.ts` única fuente; `index.ts:119` `handle<K>` y `preload/index.ts:9` `invoke<K>` derivan del contrato. Un typo de canal no compila. |
| **M-4** | `git:run`/`api.git` sin uso | **Resuelto** | Eliminado; no existe handler `git:run` (verificado por grep). |
| **M-5** | Guard de alias solo en el renderer | **Resuelto** | `aliasService.ts:67` rechaza si `currentAlias` vivo; además `handleWrite('alias:run')`. **Quirk menor:** el guard es global (exclusivo entre repos) y retiene el lock del repo hasta 60 s (M2-4). |
| **M-6** | `repos:list` fan-out sin límite + 4 git/repo | **Resuelto** | `mapLimit(paths, 6, …)` (`index.ts:175`) y `getRepoInfo` en 1 comando (`status --porcelain=v2 --branch`, `repoService.ts:23`). Tests. |
| **M-7** | Doble refresco en `focus` | **Resuelto** | Único listener en `App.tsx:42-49` con `focusTick`; `RepoDetail` reacciona vía efecto (`RepoDetail.tsx:106-108`). **Residual:** `load()` sin guard `alive` (M2-3). |
| **M-8** | Sin CSP y `sandbox:false` | **Resuelto** | `index.html:6` CSP `default-src 'self'`; `index.ts:83` `sandbox:true`. La invariante "todo `dangerouslySetInnerHTML` pasa por `ansiToHtml`" se mantiene en los 5 usos. |
| **M-9** | Red sin `GIT_TERMINAL_PROMPT=0` | **Parcial** | `gitRunner.ts:23` en `runGit`/`runGitStdin`. **Residual:** `runAlias` usa su propio env sin él (`aliasService.ts:81`, M2-4). |
| **B-1** | `openFile` ejecuta `.bat`/`.exe`; symlinks | **Parcial** | `realpath` de raíz y destino (`index.ts:290-295`) + `BLOCKED_EXT`. **Residual:** denylist incompleta — omite `.js`/`.jse`/`.url`/`.scf`/`.chm`/`.pif`, que Windows también ejecuta (M2-5). |
| **B-2** | `getCommitDetail` no comprueba `ok` | **Resuelto** | `gitService.ts:127` `if (!metaRes.ok) return readErr(null, metaRes)`; test "hash inválido devuelve error explícito". |
| **B-3** | Estado renderer sin store; prop-drilling | **Persiste** (mejorado) | `runAction()` + `BranchLists`/`RemoteList` adelgazan `RepoDetail` (834→702 líneas), pero sigue con ~20 `useState` y `onResult`/`onChanged` por props. Diferido conscientemente. |
| **B-4** | `dialog.showOpenDialog(… undefined!)` | **Resuelto** | `index.ts:309-311` usa el overload sin ventana. |
| **B-5** | `maxBuffer` 32 MB trunca → "error → []" | **Parcial** | Sigue fijo (`gitRunner.ts:51`), sin streaming/paginación. Mitigado por `ReadResult`: ahora el truncado se **distingue** como error en la UI en vez de "vacío" mudo. |
| **B-6** | Límite fijo de 400 commits sin paginación | **Resuelto** | Botón "cargar 400 más" (`RepoDetail.tsx:580-586`), `limit` cableado a `getCommits`. La búsqueda mantiene tope 200 con indicador "(máx.)". |
| **B-7** | Handlers sin captura de excepciones / unhandled rejections | **Persiste** | No hay wrapper que normalice errores de handler; `saveRepoPaths`/`saveFavorites` pueden rechazar y propagarse como *unhandled rejection* (B2-4). |
| **B-8** | Versionado y metadatos | **Parcial** | `version 0.1.0` + `engines.node>=18` hechos. **Residual:** falta `repository` en `package.json`; README ya usa texto genérico. |

---

## 3. Fortalezas de esta ronda

- **La invariante de concurrencia está en el sitio correcto.** `withRepoLock` (`repoQueue.ts:16`) encadena las escrituras del mismo repo con un `Map<string, Promise>`, tolera `throw` sin atascar la cola (`prev.then(fn, fn)` + `next.catch(() => undefined)`), y normaliza la clave con `toLowerCase()` para Windows. El diseño resuelve A-1 sin depender de que cada componente coordine su `busy`: el renderer puede *permitir* clicks aparentemente concurrentes (Stash con `selfBusy` mientras el padre lanza Fetch) porque el `main` los serializa de todos modos. Cubierto por tests deterministas.
- **Contrato IPC de extremo a extremo.** `IpcContract` (`ipc.ts:35`) es la única fuente de verdad; `handle<K>` y `invoke<K>` derivan la firma del canal. Es imposible registrar un canal inexistente o con firma incompatible sin romper la compilación. El `opts` de `push`/`pull`/`merge` vive en un único tipo (`types.ts`), no triplicado.
- **Modelo de error de lectura de primera clase.** `ReadResult<T>` con `readOk`/`readErr` y el patrón "`data` vacío + `error: GitResult`" es consistente en las 12 lecturas, y la UI lo consume con bloques `role="alert"` que muestran `cmd` + `stderr`. Los casos legítimos de "sin datos" (repo sin commits, `config --get-regexp` con exit 1) se distinguen del error real de forma explícita y comentada (`gitService.ts:54`, `aliasService.ts:34`).
- **Diálogos accesibles unificados.** `Dialog.tsx` centraliza `role="dialog"`, `aria-modal`, trampa de foco (`FOCUSABLE`), Escape que siempre cierra, retorno de foco al opener y `data-autofocus` en Cancelar para los destructivos. `ResetDialog`/`CleanDialog` lo aprovechan y ponen el foco inicial en la salida segura.
- **Operaciones de deshacer con red de seguridad.** `CleanDialog` **siempre** hace `clean -nd` (dry-run) antes de permitir el borrado real; `ResetDialog` marca `--hard` con `danger` y aviso `role="alert"`; `discardFile` confirma y distingue trackeado (`restore`) de untracked (`clean -f`). Todo con tests en `commitService.test.ts`.
- **Endurecimiento de seguridad correcto.** `sandbox:true` con preload que solo usa `contextBridge`/`ipcRenderer`; CSP estricta; `openFile` con `realpath` (cierra el hueco de symlink de la ronda 1) y bloqueo de ejecutables; sin ejecutor genérico de git.
- **CI real y de doble plataforma.** `.github/workflows/ci.yml` corre typecheck + lint + tests en `windows-latest` y `ubuntu-latest`, con identidad de git inyectada para que los tests de commit funcionen en runners limpios.
- **i18n tipado que no puede desincronizarse.** `MessageKey` obliga a que toda clave exista; `messages.test.ts` verifica paridad es/en de claves **y** de placeholders. `relativeTime` corrigió un bug real de etiquetas corridas (detectado por los tests nuevos).

---

## 4. Hallazgos por severidad

> No se detectan hallazgos de severidad **ALTA** en esta ronda: los dos ALTA de la ronda 1 están resueltos (A-1) o mayormente resueltos (A-2), y no aparece ningún riesgo estructural nuevo.

### MEDIA

#### M2-1 — Las lecturas no entran en la cola por repo y no fijan `GIT_OPTIONAL_LOCKS=0`
**Archivos:** `index.ts:204-270` (todas las lecturas van por `handle`, no `handleWrite`); `gitRunner.ts:20-25` (env sin `GIT_OPTIONAL_LOCKS`).
La cola serializa escritura-vs-escritura, pero las **lecturas corren siempre en paralelo**, también contra una escritura en curso del mismo repo. La mayoría de lecturas de git son *lock-free* (`log`, `for-each-ref`, `diff`), pero `git status` (usado por `getStatus` y por `getRepoInfo` en `repos:list`) refresca el índice y toma el **lock opcional** `index.lock`. Con `git reset`/`git add`/`commit` sosteniendo ese lock, un `status` concurrente puede fallar en refrescar (normalmente degradación suave, pero contención real). No se fija `GIT_OPTIONAL_LOCKS=0`, que es justo el mecanismo que git ofrece para que las lecturas nunca peleen por el lock.
**Riesgo:** contención intermitente y difícil de reproducir; lecturas que se ejecutan sobre un estado a medias de una escritura (grafo/estado momentáneamente inconsistente en la UI).
**Recomendación:** añadir `GIT_OPTIONAL_LOCKS: '0'` al `baseEnv` de `runGit` para todas las lecturas; opcionalmente, encolar `getStatus`/`getRepoInfo` como "lectura que respeta el lock" (leer detrás de la última escritura del repo, sin bloquear otras lecturas).

#### M2-2 — `getMergePreview` no comprueba sus sub-comandos → "ya está fusionada" falso (residual de A-2) — *posible BUG*
**Archivo:** `gitService.ts:355-380`.
Tras verificar que la rama existe, se lanzan `log HEAD..branch`, `diff --stat HEAD...branch` y `merge-base --is-ancestor` en paralelo, pero **ninguno comprueba `ok`**. Se calcula `upToDate: commits.length === 0`. Si `logRes` falla (p. ej. rango enorme que excede `maxBuffer`, o repo bloqueado), `commits` queda `[]` y el diálogo muestra **"ya está fusionada / nada que traer"**, deshabilitando el botón de merge — cuando en realidad la lectura falló. Es exactamente el patrón que A-2 quería erradicar, pero en la ruta de `MergePreview` (que devuelve su propio tipo, no `ReadResult`).
**Recomendación:** propagar el fallo de los sub-comandos al campo `error` de `MergePreview` (ya existe), en vez de asumir éxito. Añadir un test que fuerce el fallo del `log`.

#### M2-3 — `RepoDetail.load()` sin guard `alive`: carrera de "repo obsoleto" al cambiar de repo — *posible BUG*
**Archivo:** `RepoDetail.tsx:72-92`.
Todos los cargadores del proyecto (drawer, blame, reflog, clean) usan el patrón `let alive = true` en su efecto, **menos `RepoDetail.load()`**. `load()` hace tres IPC (`commits`/`branches`/`remotes`) y luego `setCommits`/`setBranches`. Si el usuario cambia de repo mientras la carga anterior está en vuelo, la respuesta tardía del repo A puede resolver **después** de la del repo B y pintar los commits de A bajo la cabecera de B. El componente no se remonta al cambiar de repo (solo `key={repo.path}` está en `SearchBar`, no en `RepoDetail`), así que el estado obsoleto persiste hasta la siguiente recarga.
**Recomendación:** añadir el mismo guard `alive` que el resto de efectos (o un contador tipo `SearchBar.req`) y descartar la respuesta si el repo cambió.

#### M2-4 — `runAlias` no hereda el endurecimiento de entorno y retiene el lock del repo hasta 60 s
**Archivo:** `aliasService.ts:76-102` (env propio en `:81`); interacción con `handleWrite('alias:run')` en `index.ts:255`.
`runAlias` construye su entorno a mano (`{ ...process.env, LC_ALL: 'C.UTF-8' }`) **sin** `GIT_TERMINAL_PROMPT=0`, duplicando la lógica que `gitRunner.baseEnv` centralizó. Un alias que toque la red (`!git fetch`, `!git push`) puede colgarse pidiendo credenciales hasta agotar su timeout de 60 s, justo el fallo que M-9 arregló para el resto. Además, al ir por `handleWrite`, el alias **retiene el lock del repo durante toda su ejecución** (hasta 60 s): cualquier otra escritura al mismo repo espera en cola detrás del alias.
**Recomendación:** que `runAlias` use `baseEnv()` (con `GIT_TERMINAL_PROMPT=0` y, si se aplica M2-1, `GIT_OPTIONAL_LOCKS=0`). Evaluar si un alias de solo-lectura debería bloquear la cola de escritura del repo o correr fuera de ella.

#### M2-5 — Denylist de `openFile` incompleta: `.js`/`.jse`/`.url`/`.scf` también se ejecutan en Windows (residual de B-1) — *posible BUG de seguridad*
**Archivo:** `index.ts:145-163` (`BLOCKED_EXT`), invocado desde `CommitPanel.tsx:144` sobre archivos en conflicto cuyos nombres vienen de git.
El chequeo de traversal con `realpath` es correcto y cierra el hueco de symlink. Pero la mitigación por **denylist** es incompleta por construcción: omite extensiones que Windows ejecuta igualmente — `.js`/`.jse` (Windows Script Host), `.url`/`.scf` (pueden apuntar a recursos/ejecutables), `.chm`, `.pif`, `.msc`. `.js` es especialmente delicado: es ubicuo en repos (este mismo proyecto está lleno) y `shell.openPath('evil.js')` lo pasa a WSH, que **lo ejecuta**. Un repo hostil con un `conflicto.js` + un clic en "abrir" del usuario basta.
**Recomendación:** invertir la estrategia — abrir siempre con un editor de texto conocido, o usar una **allowlist** de extensiones seguras de texto/código, en vez de intentar enumerar todo lo peligroso. Es lo que la recomendación original de B-1 ("abrir solo con un editor de texto conocido") ya apuntaba.

---

### BAJA

#### B2-1 — El `Map` de la cola no se poda nunca
**Archivo:** `repoQueue.ts:10,22`.
`chains` guarda una entrada por repo para siempre (nunca se borra la clave). Es una fuga acotada por el número de repos abiertos (irrelevante en la práctica), pero conviene una nota o un `delete` cuando la cadena queda resuelta e igual a la almacenada.

#### B2-2 — `CommitPanel.loadDiff` y `StashPanel.toggleDiff` no comprueban `ok` (residual menor de A-2)
**Archivos:** `CommitPanel.tsx:65-73` (`setDiffHtml(ansiToHtml(res.stdout || ''))` sin mirar `res.ok`); `StashPanel.tsx:98-99` (`setDiff(res.stdout || res.stderr)`).
Son `GitResult` crudos (diffs), no `ReadResult`. Si el `diff`/`stash show` falla, se muestra un diff vacío o el stderr sin marcarlo como error. Impacto bajo (diffs, no decisiones de estado), pero es el mismo patrón que A-2 en un rincón.
**Recomendación:** distinguir "sin diff" de "falló el diff" también aquí, o migrar estas dos a `ReadResult`.

#### B2-3 — `getRepoState` aplana el error de sus lecturas
**Archivo:** `mergeService.ts:97-98` (`confRes.ok ? split : []`) y `gitDir` cae a `.git` si `rev-parse` falla (`:64`).
Si `diff --name-only --diff-filter=U` falla, `conflicted` queda `[]` y el banner de operación en curso podría subestimar los conflictos. Bajo impacto (el `op` se detecta por filesystem, que es lo crítico), pero es una lectura que traga el error.

#### B2-4 — Sin wrapper de handler: fallos de escritura del store se propagan como *unhandled rejection* y atascan `busy` (persiste B-7)
**Archivos:** `index.ts:178-201` (`repos:add`/`scan`/`remove` llaman a `saveRepoPaths`), `aliasStore.ts:25` (`saveFavorites`); consumo sin `try/catch` en `App.tsx:54-57` (`onAdd`) y `:71` (`onScan`).
La mayoría de handlers devuelven `GitResult` y nunca rechazan. La excepción son los respaldados por `fs.writeFile`: si `saveRepoPaths` rechaza (disco lleno, permisos), `repos:add` rechaza → `await window.api.addRepo(dir)` sin `catch` deja una *unhandled rejection* **y** `setBusy(false)` nunca corre, dejando los botones Agregar/Escanear/Refrescar deshabilitados hasta recargar. Probabilidad baja, pero real.
**Recomendación:** un wrapper de handler que normalice cualquier `throw` a un resultado de error; y/o `try/finally` alrededor de `setBusy` en `App.onAdd`/`onScan`. Considerar un `window.addEventListener('unhandledrejection', …)` global para no perder fallos silenciosos.

#### B2-5 — Estado del renderer sin store; prop-drilling de `onResult`/`onChanged` (persiste B-3)
`RepoDetail` sigue orquestando ~20 `useState` y pasando `onResult`/`onChanged`/`parentBusy` a Stash/Tag. `runAction()` y los subcomponentes mejoran mucho la legibilidad, pero la UI sigue sin ser testeable sin Electron. Diferido conscientemente; sigue siendo la mayor palanca de mantenibilidad a plazo.

#### B2-6 — `maxBuffer` fijo y `repository` ausente (residual B-5/B-8)
`gitRunner.ts:51` mantiene 32 MB sin streaming (mitigado por `ReadResult`, que ahora lo marca como error en vez de vaciarlo). `package.json` sigue sin `repository`. Sin `@typescript-eslint/no-floating-promises` (requiere `parserOptions.project`), que cazaría los `.then()`/async sin `catch` de B2-4.

#### B2-7 — `HunkView` usa `key={i}` por línea del hunk
**Archivo:** `HunkView.tsx:93`. Ya señalado en la auditoría de calidad de ronda 2; aceptable (líneas estáticas), pero era parte del hallazgo original de keys por índice.

---

## 5. Auditoría de la superficie NUEVA (carreras / bordes / seguridad)

- **`repoQueue`** — Correcto y robusto: tolera `throw`, no atasca, clave case-insensitive, tests deterministas. Cubre 100% de las escrituras (`handleWrite` en 27 canales). Huecos: no cubre lecturas (M2-1); no cubre escrituras a config **global** (`alias:set`/`delete`, que van por `handle` y comparten `.gitconfig`, pero git usa su propio `.gitconfig.lock`). Poda del `Map` ausente (B2-1).
- **`ipc.ts` / `ReadResult`** — Sin agujeros de tipado en la frontera. El único punto de fe es que el renderer no pasa argumentos fuera de tipo (garantizado por TS, único consumidor). El residual de A-2 vive fuera de `ReadResult`: los tipos "a medida" (`MergePreview`, `RepoState`) siguen aplanando (M2-2, B2-3).
- **i18n** — Sólido: paridad de claves y placeholders testada, `lang` del documento sincronizado. `format()` reemplaza placeholders sin evaluar; sin riesgo de inyección. (Nota de otra auditoría: `gitError.ts` y algunos mensajes fabricados en `main` siguen solo en español; es cobertura i18n, no ingeniería.)
- **Diálogos nuevos** (`Reset`/`Clean`/`Compare`/`Reflog`) — Buen manejo de foco y Escape vía `Dialog`. `CleanDialog` y `BlameDialog` usan guard `alive`. `CompareDialog` y `stashShow` renderizan diff por `ansiToHtml` (seguro). `ResetDialog --hard` y `CleanDialog` son destructivos pero con dry-run/aviso y foco en Cancelar.
- **reset/clean/discard** — Semántica correcta y testeada (soft/mixed/hard, `clean -nd`→`-fd`, `restore` vs `clean -f`). El único borde es que dependen de la cola para no chocar con otras escrituras — lo cual está cubierto.
- **`dangerouslySetInnerHTML`** — Los 5 usos (CommitPanel, CommitDetailDrawer, StashPanel, AliasPanel, CompareDialog) pasan por `ansiToHtml`, cuyo `esc()` escapa `&<>` en el **contenido** y cuyo `style` proviene solo de estado controlado (colores parseados). Invariante intacta; la CSP con `style-src 'unsafe-inline'` es la relajación mínima necesaria para esos estilos inline.

---

## 6. Recomendaciones de arquitectura a mayor plazo

1. **Cerrar el modelo de error de lectura al 100%.** Extender `ReadResult<T>` (o el chequeo de `ok`) a los últimos rincones que aún aplanan: `getMergePreview` (M2-2), `getRepoState` (B2-3), `loadDiff`/`stashShow` (B2-2). Es el cierre natural de A-2.
2. **Política de locks de git explícita.** Fijar `GIT_OPTIONAL_LOCKS=0` para lecturas y decidir si `getStatus`/`getRepoInfo` deben leer "detrás" de la última escritura del repo. Unificar el entorno: que `runAlias` use `baseEnv()` en vez de su copia (M2-4).
3. **Wrapper de handler + captura global de rejections.** Un decorador que envuelva cada handler y convierta `throw` en resultado de error normalizado (cierra B2-4 de raíz), más un `unhandledrejection` global en el renderer y `try/finally` en los `busy` de `App`.
4. **`openFile` con allowlist.** Sustituir la denylist por apertura solo-en-editor o allowlist de extensiones de texto (M2-5).
5. **Guard `alive`/contador en toda carga.** Estandarizar el patrón (ya presente en 4 de 5 cargadores) e incluir `RepoDetail.load()` (M2-3). Un `useRepo(repoPath)` con React Query o un store ligero resolvería esto y B2-5 a la vez (cache + invalidación + cancelación).
6. **Streaming/paginación** para diffs/log grandes, superando el `maxBuffer` fijo (residual B-5).
7. **Lint más estricto:** activar `@typescript-eslint/no-floating-promises` (requiere `parserOptions.project`) para cazar las promesas sin `catch` que hoy dependen de que `runGit` no rechace.
8. **Tests de renderer.** Con la cola y el contrato ya estabilizados, `@testing-library/react` + `window.api` mockeado cubriría los flujos críticos (commit, checkout dirty, merge preview, reset, clean) sin tocar git. El renderer sigue al 0% de cobertura.

---

## 7. Tabla de priorización (esfuerzo vs impacto)

| ID | Hallazgo | Severidad | Estado r1 | Esfuerzo | Impacto | Prioridad |
|----|----------|-----------|-----------|----------|---------|-----------|
| M2-2 | `getMergePreview`: sub-comandos sin `ok` ("ya fusionada" falso) | Media | residual A-2 | Bajo | Medio | **1** |
| M2-3 | `RepoDetail.load()` sin guard `alive` (repo obsoleto) | Media | residual M-7 | Bajo | Medio | **2** |
| M2-5 | `openFile`: denylist omite `.js`/`.jse`/`.url`… | Media | parcial B-1 | Bajo | Medio | **3** |
| M2-1 | Lecturas fuera de la cola + `GIT_OPTIONAL_LOCKS=0` | Media | residual A-1 | Bajo | Medio | **4** |
| M2-4 | `runAlias` sin `GIT_TERMINAL_PROMPT=0`; retiene lock 60 s | Media | residual M-9 | Bajo | Bajo | **5** |
| B2-4 | Wrapper de handler / unhandled rejection + `busy` atascado | Baja | persiste B-7 | Medio | Medio | **6** |
| B2-2 | `loadDiff`/`stashShow` no comprueban `ok` | Baja | residual A-2 | Bajo | Bajo | **7** |
| B2-3 | `getRepoState` aplana error de conflictos | Baja | residual A-2 | Bajo | Bajo | **8** |
| B2-1 | `Map` de la cola sin podar | Baja | nuevo | Bajo | Bajo | **9** |
| B2-5 | Store en renderer / prop-drilling | Baja | persiste B-3 | Alto | Medio | 10 |
| B2-6 | `maxBuffer` fijo, `repository`, `no-floating-promises` | Baja | residual B-5/B-8 | Medio | Bajo | 11 |
| B2-7 | `HunkView` key por índice | Baja | residual | Bajo | Bajo | 12 |

---

## 8. Posibles BUGS detectados (resumen)

- **M2-2** — `getMergePreview` (`gitService.ts:355-380`): si `git log HEAD..branch` falla tras verificar la rama, `commits=[]` ⇒ `upToDate:true` ⇒ el diálogo dice "ya está fusionada, nada que traer" y deshabilita el merge, ocultando el fallo real. *(Reproducible forzando el fallo del log; baja probabilidad en uso normal.)*
- **M2-3** — `RepoDetail.load()` sin guard `alive` (`RepoDetail.tsx:72-92`): al cambiar rápido de repo, la respuesta tardía del repo anterior puede pintar sus commits bajo la cabecera del repo nuevo. *(Depende de latencias; real.)*
- **M2-5** — `openFile` con `.js`/`.jse`/`.url` (`index.ts:145-163`): un repo hostil con `conflicto.js` en conflicto + clic del usuario en "abrir" → Windows Script Host lo ejecuta. Vector de ejecución de código, extensión omitida por la denylist. *(Requiere repo hostil + clic.)*
- **B2-4** — `App.onAdd`/`onScan` (`App.tsx:54-57`): si `saveRepoPaths`/`saveFavorites` rechaza, `setBusy(false)` no corre (botones atascados) + *unhandled rejection*. *(Requiere fallo de `fs.writeFile`; baja probabilidad.)*
- **M2-1** — Contención de `index.lock` entre un `git status` de lectura y una escritura en curso del mismo repo, al no fijar `GIT_OPTIONAL_LOCKS=0` (`gitRunner.ts:20`, `index.ts:261`). *(Degradación normalmente suave; intermitente.)*
