# Auditoría de Ingeniería de Software — GitDeck

**Fecha:** 2026-07-21
**Alcance:** `src/main`, `src/preload`, `src/shared`, componentes React con lógica de estado (`RepoDetail`, `CommitPanel`, `CommitDetailDrawer`, `SearchBar`, y paneles auxiliares), `src/renderer/src/lib`, y toda la configuración de build/test.
**Enfoque:** arquitectura, robustez, seguridad, concurrencia, tipado, testabilidad, rendimiento, mantenibilidad y DX.

---

## 1. Resumen ejecutivo

GitDeck está **notablemente bien construido para su tamaño y madurez (v0.0.1)**. La arquitectura de cuatro capas (main / preload / renderer / shared) es limpia y coherente, la frontera IPC está bien pensada, y hay decisiones de seguridad correctas y deliberadas: argumentos de git como array (sin shell), `contextIsolation` activo, `nodeIntegration` desactivado, mensajes por STDIN (`-F -`), verificación de path traversal en `shell:openFile`, y timeouts en operaciones de red y de alias. La capa de servicios del `main` es la joya del proyecto: funciones pequeñas, puras en su mayoría, con comentarios que explican el *porqué* de cada decisión de git, y una **suite de tests que corre git de verdad** contra repos temporales (excelente para lo que se quiere verificar: que los parseos aguantan la salida real de git).

**Veredicto general: arquitectura sólida y por encima de la media para un proyecto de este tamaño.** Los problemas no son estructurales sino de *bordes*: la ausencia de un mutex por repo permite operaciones git concurrentes que pueden chocar por `index.lock`; el patrón `res.ok ? parse : []` omnipresente confunde "sin datos" con "error"; falta un contrato de tipos único para la frontera IPC (hoy la firma de cada comando está triplicada a mano); no hay tests de renderer ni de las piezas puras más delicadas (el algoritmo del grafo, el conversor ANSI); y falta CI. Ninguno bloquea el uso, pero varios son deuda que crecerá rápido cuando se añadan features.

**Lo más urgente:** (1) serializar las operaciones de escritura por repo, (2) unificar el contrato IPC en tipos compartidos, (3) dejar de tragar los errores de git en las lecturas, y (4) añadir CI + tests a `graph.ts` y `ansi.ts`.

---

## 2. Fortalezas arquitectónicas

- **Separación de capas real y disciplinada.** El renderer *nunca* toca `child_process` ni `ipcRenderer` directamente; todo pasa por el objeto `api` acotado de `preload/index.ts`. El único punto con acceso a git/fs es el `main`. Esto es exactamente lo que Electron recomienda.
- **Superficie IPC mínima y explícita.** `index.ts` registra un handler por operación con nombres namespaced (`git:*`, `stash:*`, `tag:*`, …). No hay un `eval`/`exec` genérico expuesto salvo `git:run` (ver hallazgo M-4).
- **Seguridad de inyección bien resuelta.** Los argumentos van como array a `execFile`/`spawn`, jamás concatenados a una shell. El test `gitService.test.ts:266` (`'"; rm -rf . #'`) verifica explícitamente que el texto del usuario no se interpreta. Los mensajes de commit y de tag van por STDIN con `-F -` (`commitService.ts:59`, `tagService.ts:65`), conservando saltos de línea y UTF-8.
- **`GitResult` como contrato uniforme.** Toda acción devuelve `{ok, cmd, stdout, stderr, code}`, lo que da transparencia total en la UI (muestra el comando real) y un manejo homogéneo del error crudo.
- **Manejo de errores *legible* para el usuario.** `gitError.ts` traduce los fallos más comunes a explicaciones accionables **sin sustituir jamás la salida cruda** (`RepoDetail.tsx:789`). Es un patrón maduro y bien comentado.
- **Tests de integración contra git real.** `Fixture` (`__tests__/fixture.ts`) crea repos de verdad; los tests cubren los parseos frágiles (blame porcelain, stash subject, tags anotados vs ligeros, ahead/behind, estado de operación en curso). Es la estrategia correcta para esta clase de código.
- **Patrones anti-race ya presentes donde importa.** El contador `req.current` en `SearchBar.tsx:33` y `mergeReq` en `RepoDetail.tsx:47` descartan respuestas de peticiones superadas; el debounce de 300 ms en la búsqueda; el patrón `alive` en efectos con fetch (`CommitDetailDrawer.tsx:52`, `ReflogDialog.tsx:32`). Demuestra conciencia de las condiciones de carrera del renderer.
- **Detalles de robustez de git bien cuidados:** `GIT_EDITOR=true`/`GIT_SEQUENCE_EDITOR=true` en `continueOp` para que no cuelgue esperando un editor (`mergeService.ts:49`); `core.quotePath=false` en status; `--line-porcelain` en blame para no desincronizar el parseo; cierre inmediato de STDIN en alias.

---

## 3. Hallazgos por severidad

### ALTA

#### A-1 — No hay serialización de operaciones git por repo (condición de carrera / `index.lock`)
**Archivos:** `RepoDetail.tsx:34` (`busy`), `StashPanel.tsx:24`, `TagPanel.tsx:21`, `CommitPanel.tsx:60`, `index.ts` (handlers).
El estado `busy` que bloquea la UI es **local a cada componente**. `RepoDetail` pasa su `busy` a los botones de fetch/pull/push, pero `StashPanel` y `TagPanel` (renderizados a la vez en el mismo panel lateral, `RepoDetail.tsx:763` y `:770`) tienen su **propio** `busy` y no reciben el del padre. Resultado: el usuario puede lanzar un `fetch` y, mientras corre, un `stash drop` o un `tag push` sobre el **mismo repo**. Dos procesos git escribiendo a la vez chocan por `.git/index.lock` (el propio `gitError.ts:55` ya contempla ese error, señal de que puede ocurrir). El `main` no impone ninguna serialización: cada handler llama a `runGit` sin cola.
**Riesgo:** corrupción de operación a medias, fallos intermitentes difíciles de reproducir, estado del repo inconsistente.
**Recomendación:** introducir en el `main` una **cola/mutex por ruta de repo** (un `Map<string, Promise>` que encadene las operaciones de escritura de un mismo repo). Alternativa mínima a corto plazo: elevar `busy` a un estado por-repo compartido (contexto o store) que deshabilite *todas* las acciones de escritura del repo activo.

#### A-2 — Las lecturas se tragan los errores de git (`res.ok ? parse : []`)
**Archivos:** `gitService.ts:50, 93, 144, 176`; `commitService.ts:8` (`getStatus`); `stashService.ts:34`; `tagService.ts:33`; `blameService.ts:26, 73`; `hunkService.ts:24` (devuelve `null`).
Todas las funciones de lectura hacen `if (!res.ok) return []`. Esto **confunde "no hay datos" con "git falló"**. Ejemplo concreto: si `getStatus` falla (repo bloqueado, `.git` dañado, buffer excedido), `CommitPanel` muestra tranquilamente *"nada preparado / sin cambios"* y habilita/inhabilita el commit como si el working tree estuviera limpio — el usuario no se entera de que la información es falsa. Lo mismo con el grafo vacío, ramas vacías, blame vacío, etc.
**Riesgo:** el usuario toma decisiones sobre información silenciosamente incorrecta; los fallos reales son invisibles y no depurables.
**Recomendación:** que las lecturas propaguen el error en vez de aplanarlo. Opciones: devolver `{ data, error }` o `Result<T>`, o al menos loggear en `main` y exponer un canal de diagnóstico. Como mínimo, distinguir en la UI "cargando", "vacío" y "error".

---

### MEDIA

#### M-1 — `runGitStdin` no tiene timeout (posible cuelgue permanente) — *posible BUG*
**Archivo:** `gitRunner.ts:57-73`.
`runGit` acepta `timeoutMs` (60 s por defecto, 180 s en red). `runGitStdin` — usado por `commit`, `createTag` y `applyHunk` — **no pasa `timeout` a `spawn`**. Un hook de git (`pre-commit`, `commit-msg`, `pre-applypatch`) que se cuelgue esperando entrada, o que simplemente tarde, deja el proceso vivo para siempre; el botón queda en *"creando…"* indefinidamente y no hay forma de cancelarlo desde la UI (a diferencia de los alias, que sí tienen `stopAlias`).
**Recomendación:** añadir `timeout` a `spawn` en `runGitStdin` (y manejar la señal como en `runAlias`), y considerar exponer un "cancelar" para el commit.

#### M-2 — El detalle de un commit de *merge* muestra 0 archivos (diff y lista descuadrados) — *posible BUG (verificar)*
**Archivo:** `gitService.ts:99-103` (`getCommitDetail`).
La lista de archivos se obtiene con `git diff-tree --no-commit-id --name-status -r --root <hash>`, que **para un commit de merge no emite nada** sin `-c`/`--cc`/`-m`. En cambio, el diff se obtiene con `git show --patch <hash>`, que **sí** produce un diff combinado para merges. Resultado probable: al abrir un merge en el drawer se ve *"Archivos (0)"* pero abajo aparece un diff — inconsistente y confuso. El propio grafo marca los merges (`CommitGraph.tsx:121`), así que son clickables.
**Recomendación:** usar `--cc` (o `-m --first-parent`) también en `diff-tree` para merges, o detectar `parents.length > 1` y ajustar la estrategia. Añadir un test de `getCommitDetail` sobre un merge (hoy no existe).

#### M-3 — Contrato IPC triplicado a mano, sin verificación en compilación
**Archivos:** `index.ts:105-288` (registro de handlers), `preload/index.ts:26-234` (api), y las firmas de cada servicio.
Cada operación existe escrita tres veces: el nombre del canal + firma en el handler del `main`, la misma firma en el `preload`, y la firma real del servicio. `ipcRenderer.invoke` devuelve `Promise<any>` y `ipcMain.handle` tipa laxo, así que **TypeScript no detecta desajustes**: un typo en el nombre de canal (`'git:commits'`) o un parámetro cambiado se convierte en un fallo silencioso en runtime. El tipo del `opts` de `push` está literal en tres sitios (`gitService.ts:212`, `index.ts:159`, `preload/index.ts:70`).
**Recomendación:** definir en `src/shared` un **mapa de comandos** (`type IpcContract = { 'git:commits': (repo, limit?) => Promise<Commit[]>, … }`) y derivar de él tanto el registro (`handle`) como el `invoke` con wrappers genéricos tipados. Elimina la triplicación y hace los canales type-safe extremo a extremo.

#### M-4 — Ejecutor genérico de git expuesto al renderer y sin uso
**Archivo:** `index.ts:108` — `ipcMain.handle('git:run', (_e, args, cwd) => runGit(args, cwd))`; expuesto como `api.git` en `preload/index.ts:31`.
Es un ejecutor de **git arbitrario en cualquier carpeta**. No hay shell (bien), pero git por sí mismo ofrece vectores peligrosos vía flags (`-c core.sshCommand=…`, `-c core.pager=…`, `-c alias.*`, remotos `ext::`), es decir, potencial ejecución de comandos si el renderer llegara a estar comprometido (dependencia con XSS, contenido de repo mal renderizado). Una búsqueda confirma que **`api.git` no se usa en ningún sitio** del renderer (solo `gitVersion`).
**Riesgo:** superficie de ataque grande a cambio de cero valor actual.
**Recomendación:** eliminar `git:run`/`api.git`. Si en el futuro se necesita, exponer operaciones concretas, nunca un passthrough.

#### M-5 — El proceso de alias en curso es un global; el guard de "uno a la vez" solo vive en el renderer
**Archivo:** `aliasService.ts:50` (`let currentAlias`), `:66`, `:88` (`stopAlias`).
`currentAlias` es una variable de módulo. El "solo uno a la vez" se impone en `AliasPanel.tsx:37` (`if (running) return`), pero **el `main` no lo impone**: si por cualquier vía llegan dos `alias:run`, el segundo `spawn` sobrescribe `currentAlias` y `stopAlias` solo matará al último, dejando el primero huérfano corriendo. Además `stopAlias` no distingue de qué repo era.
**Recomendación:** mover el guard al `main` (rechazar `alias:run` si ya hay uno vivo, o mantener un `Map` de procesos con id) para que la invariante no dependa del renderer.

#### M-6 — `repos:list` hace fan-out de git sin límite de concurrencia
**Archivo:** `index.ts:111-114` + `repoService.ts:13` (`getRepoInfo`).
`repos:list` hace `Promise.all(paths.map(getRepoInfo))`, y cada `getRepoInfo` lanza **4 comandos git** (`isRepo` + branch + rev-parse + status). Con N repos son 4N procesos git simultáneos al arrancar y en **cada `focus` de ventana** (ver M-7). Con decenas de repos (el caso de uso "multi-repo" que promete el README) esto satura CPU/IO y en Windows el coste de crear procesos es alto.
**Recomendación:** limitar la concurrencia (pool de ~4-8), y combinar los 4 git de `getRepoInfo` en menos llamadas (p. ej. `git status -b --porcelain=v2` da rama, upstream y estado de una sola pasada).

#### M-7 — Doble refresco en `focus` y refrescos no cancelables
**Archivos:** `App.tsx:34-40` y `RepoDetail.tsx:86-92`.
Ambos registran `window.addEventListener('focus', …)`. Al recuperar el foco: `App.refresh` corre una vez directamente **y** `RepoDetail.reloadAll` corre `load()` (3 IPC) y luego llama a `onChanged` que es `App.refresh` otra vez → `refresh` se ejecuta **dos veces** por cada focus, más las 3 lecturas del detalle. Ninguno comprueba si ya hay una carga en curso, así que focos rápidos encadenan cargas solapadas (y, con A-1, pueden solaparse con escrituras).
**Recomendación:** un único punto de refresco (subir la responsabilidad a `App` o coordinar con un flag/última-marca), y descartar refrescos solapados con un contador como el de `SearchBar`.

#### M-8 — Sin CSP y `sandbox: false`
**Archivo:** `index.ts:82` (`sandbox: false`), ausencia de `Content-Security-Policy`.
`contextIsolation` está activo (bien), pero `sandbox: false` hace que el preload corra con Node disponible, reduciendo la defensa en profundidad. No hay meta CSP en el HTML del renderer. Se usa `dangerouslySetInnerHTML` en varios sitios (`CommitPanel.tsx:365`, `CommitDetailDrawer.tsx:242`, `AliasPanel.tsx:258`, `StashPanel.tsx:187`); hoy es seguro porque `ansi.ts:18` (`esc`) escapa el texto antes de inyectarlo — pero es una invariante frágil que un cambio futuro puede romper sin que nada avise.
**Recomendación:** añadir una CSP estricta (`default-src 'self'`), evaluar activar `sandbox: true`, y centralizar/testear que todo lo que va a `dangerouslySetInnerHTML` pasa siempre por `ansiToHtml`.

#### M-9 — Operaciones de red sin `GIT_TERMINAL_PROMPT=0`
**Archivo:** `gitRunner.ts:32` (env).
Fetch/pull/push confían en el credential manager. Si git decide pedir credenciales por terminal (según configuración del entorno), como no hay TTY puede quedarse esperando hasta agotar el `NET_TIMEOUT` de 180 s en vez de fallar limpio. `gitError.ts:22` ya contempla *"terminal prompts disabled"*, lo que sugiere que conviene forzarlo.
**Recomendación:** añadir `GIT_TERMINAL_PROMPT: '0'` (y opcionalmente `GIT_ASKPASS` vacío) al env de `runGit`/`runGitStdin` para fallo rápido y determinista.

---

### BAJA

#### B-1 — `openFile` abre archivos del repo con el handler por defecto del SO (ejecución de `.bat`/`.exe`)
**Archivo:** `index.ts:271-278`.
El check de path traversal es correcto (rechaza rutas fuera del repo). Pero `shell.openPath` sobre un archivo *dentro* del repo con extensión ejecutable (`.bat`, `.cmd`, `.exe`, `.ps1`) lo **ejecuta**. Se invoca sobre archivos en conflicto (`CommitPanel.tsx:127`), cuyos nombres vienen de git. Un repo malicioso podría tener un `conflicto.bat`. Riesgo bajo (requiere repo hostil + clic del usuario), pero real. Además `resolve` no resuelve symlinks: un symlink dentro del repo apuntando fuera pasaría el check.
**Recomendación:** validar extensión/abrir solo con un editor de texto conocido, o advertir para extensiones ejecutables; resolver symlinks (`fs.realpath`) antes de comparar con la raíz.

#### B-2 — `getCommitDetail` no comprueba `ok` de sus tres comandos
**Archivo:** `gitService.ts:99-127`.
Si el hash es inválido, `metaRes.stdout` viene vacío y la función devuelve un `CommitDetail` con casi todo en `''`/`0` pero con `hash` = el que se pasó, sin señal de error. No revienta, pero produce un objeto engañoso.
**Recomendación:** si `metaRes` falla, devolver un error explícito (o `null`) y que el drawer lo muestre.

#### B-3 — Estado del renderer todo en `useState`/`useCallback`, sin store
**Archivos:** `RepoDetail.tsx` (≈20 `useState`), y prop-drilling de `onChanged`/`onResult`/`reloadAll` a `StashPanel`, `TagPanel`, `CommitPanel`, `CommitDetailDrawer`.
`RepoDetail` es un componente de 830 líneas con ~20 piezas de estado local y callbacks encadenados. Funciona, pero el acoplamiento por props (`onResult` que sube el `GitResult` de un panel hijo al banner del padre) y la lógica de negocio mezclada con la vista dificultan el mantenimiento y hacen casi imposible testear la UI. Ver recomendaciones de arquitectura.

#### B-4 — `dialog.showOpenDialog(mainWindow ?? undefined!, …)`
**Archivo:** `index.ts:282`.
El `undefined!` es un parche de tipos. Funciona (un diálogo sin ventana padre), pero es un olor. Manejar el caso `mainWindow === null` explícitamente.

#### B-5 — `maxBuffer` de 32 MB puede truncar salidas grandes convirtiéndolas en "error → []"
**Archivo:** `gitRunner.ts:28`.
Un commit con un diff enorme, o un `log` gigantesco, excede el buffer y `execFile` devuelve error; por A-2 eso se convierte en lista vacía / diff vacío sin explicación. El propio comentario ("se paginara en fases futuras") lo reconoce.
**Recomendación:** para diffs/logs grandes, migrar a streaming (`spawn` + lectura incremental) o paginación; hoy al menos distinguir el error de "vacío".

#### B-6 — Límite fijo de 400 commits sin paginación
**Archivo:** `gitService.ts:45` (`limit = 400`), consumido sin límite en `RepoDetail.tsx:63`.
En repos grandes el grafo se corta en 400 y no hay "cargar más". Aceptable como decisión de fase temprana, pero es un techo de escalabilidad. `computeGraph` (`graph.ts`) es O(n·carriles) con `indexOf` lineales — bien para 400, a vigilar si sube.

#### B-7 — `git:run` y otros handlers síncronos no capturan excepciones
Los handlers que no son `async` (p. ej. los que devuelven directamente `runGit(...)`) están bien porque `runGit` nunca rechaza. Pero conviene una política explícita: cualquier `throw` en un handler se propaga como rechazo del `invoke` en el renderer, y varios `.then()`/llamadas sin `.catch()` en la UI (`App.tsx:30`, `RepoDetail.tsx:88`) quedarían como *unhandled rejection*. Riesgo bajo hoy, pero conviene un wrapper de handler que normalice errores.

#### B-8 — Versionado y metadatos
`package.json` sigue en `0.0.1` pese a tener 5+ fases de features y releases empaquetables (`electron-builder`). Sin `engines` (versión de Node), sin `repository`. El README menciona rutas personales (`E:\MTTRSystem`, `E:\others`) filtradas también en `App.tsx:124`.

---

## 4. Recomendaciones de arquitectura a mayor plazo

1. **Contrato IPC único y tipado (prioridad alta).** Definir el mapa de canales en `src/shared` y generar `handle`/`invoke` a partir de él. Elimina M-3 y M-4 de raíz y hace la frontera type-safe. Es la mejora estructural de mayor retorno.

2. **Cola de operaciones por repo en el `main` (prioridad alta).** Un pequeño scheduler (`Map<repoPath, Promise>`) que serialice las escrituras y limite la concurrencia de lecturas resuelve A-1 y M-6 a la vez, y es el sitio correcto para poner la invariante (no en cada componente).

3. **Capa de servicios en el renderer + gestión de estado.** Extraer las llamadas a `window.api` y la lógica de refresco a hooks/servicios (`useRepo(repoPath)`, `useGitAction`) y adoptar un store ligero (Zustand/Context+reducer, o React Query para el cacheo/invalidasción de las lecturas). Esto adelgaza `RepoDetail` (B-3), elimina el prop-drilling de `onResult`/`onChanged`, unifica el estado `busy` (A-1) y da un punto natural para invalidar tras cada acción.

4. **Modelo de error de primera clase.** Sustituir `res.ok ? parse : []` por un tipo `Result<T>` (o `{data, error}`) en las lecturas (A-2), y un patrón consistente de "cargando / vacío / error" en la UI.

5. **Tests de la lógica pura del renderer.** `graph.ts` (algoritmo de carriles, no trivial y hoy **sin ningún test**), `ansi.ts` (parser SGR con 256/truecolor), `format.ts` (`parseRef`, `relativeTime`) y `gitError.ts` son funciones puras, deterministas y sin Electron: cubrirlas con vitest (entorno node) es barato y de alto valor. Añadir además `getCommitDetail` sobre merges (M-2) y tests de `commitService`, `repoService`, `aliasService`, `aliasStore`, `repoStore`, hoy sin cobertura.

6. **Tests de componentes.** Con `@testing-library/react` + jsdom y un `window.api` mockeado se pueden cubrir los flujos críticos (commit, checkout con dirty, merge preview, resolución de conflictos) sin tocar git. El renderer es hoy el 0% de la cobertura.

7. **CI (prioridad alta, coste bajo).** No existe `.github/`. Un workflow que ejecute `npm run typecheck`, `npm run lint` y `npm test` en cada push/PR (los tests de git funcionan en runners con git preinstalado). Añadir `build:win` en release. Reglas de lint más estrictas: activar `@typescript-eslint/no-floating-promises` (requiere `parserOptions.project`) para cazar promesas sin await/catch.

8. **Streaming/paginación** para grafo, diffs y blame grandes (B-5, B-6), superando el `maxBuffer` fijo.

---

## 5. Tabla de priorización (esfuerzo vs impacto)

| ID  | Hallazgo | Severidad | Esfuerzo | Impacto | Prioridad |
|-----|----------|-----------|----------|---------|-----------|
| A-1 | Serializar operaciones git por repo (mutex/cola) | Alta | Medio | Alto | **1** |
| B-8/CI | Añadir CI (typecheck+lint+test) | — | Bajo | Alto | **2** |
| A-2 | Dejar de tragar errores en lecturas (`Result<T>`) | Alta | Medio | Alto | **3** |
| M-3 | Contrato IPC único y tipado en `shared` | Media | Medio | Alto | **4** |
| M-4 | Eliminar `git:run`/`api.git` sin uso | Media | Bajo | Medio | **5** |
| M-1 | Timeout en `runGitStdin` | Media | Bajo | Medio | **6** |
| M-5 | Guard de alias en el `main` | Media | Bajo | Medio | **7** |
| Test | Tests de `graph.ts` + `ansi.ts` (puras) | — | Bajo | Medio | **8** |
| M-2 | Detalle de merge muestra 0 archivos | Media | Bajo | Medio | **9** |
| M-9 | `GIT_TERMINAL_PROMPT=0` en red | Media | Bajo | Medio | **10** |
| M-6 | Limitar concurrencia + fusionar git en `getRepoInfo` | Media | Medio | Medio | 11 |
| M-7 | Un solo refresco en `focus`, no cancelables | Media | Bajo | Medio | 12 |
| M-8 | CSP + evaluar `sandbox:true` | Media | Medio | Medio | 13 |
| B-3 | Store + capa de servicios en renderer | Baja | Alto | Medio | 14 |
| B-1 | `openFile`: extensiones ejecutables / symlinks | Baja | Bajo | Bajo | 15 |
| B-5/B-6 | Streaming/paginación (buffer, 400 commits) | Baja | Alto | Bajo | 16 |
| B-2/B-4/B-7/B-8 | Pulidos varios (ok-check, tipos, versión) | Baja | Bajo | Bajo | 17 |

---

## 6. Posibles BUGS detectados (resumen)

- **M-1** — `runGitStdin` sin timeout: un hook colgado deja el commit/tag/hunk esperando para siempre, sin cancelación (`gitRunner.ts:57-73`).
- **M-2** — Detalle de commits de merge: `diff-tree` sin `--cc` no lista archivos mientras `git show` sí produce diff → "Archivos (0)" con diff visible (`gitService.ts:99-103`). *(Verificar en runtime.)*
- **A-1** — Operaciones git concurrentes sobre el mismo repo (fetch + stash/tag) por `busy` local → choque de `index.lock` (`RepoDetail.tsx` vs `StashPanel.tsx`/`TagPanel.tsx`).
- **B-5** — Salidas que exceden `maxBuffer` (32 MB) se convierten silenciosamente en lista/diff vacío por el patrón A-2 (`gitRunner.ts:28`).
