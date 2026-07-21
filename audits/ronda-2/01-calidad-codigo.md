# Auditoría de calidad de código — GitDeck (ronda 2)

_Fecha: 2026-07-21 · Alcance: `src/` (main, preload, renderer, shared, tests) + configuración de raíz._
_Contexto: segunda ronda, tras aplicar el lote de correcciones descrito en `audits/00-resumen-y-tareas.md`._

## Resumen ejecutivo

El lote de correcciones fue **real y de alta calidad**: los 14 hallazgos accionables de la ronda 1
están **resueltos** (13 completos, 1 parcial), y las piezas nuevas — contrato IPC tipado
(`src/shared/ipc.ts`), `ReadResult<T>` en todas las lecturas, cola por repo (`repoQueue.ts`),
`Dialog` accesible, i18n tipado y refactor de `RepoDetail` con `runAction()` y subcomponentes —
están bien diseñadas, comentadas con el _porqué_ y cubiertas por tests (129/129 verdes; typecheck
y lint también pasan, verificado en esta auditoría).

Los hallazgos nuevos son de **menor gravedad que en la ronda 1**. El más relevante es que la
promesa de "i18n completo" tiene dos agujeros: las explicaciones de errores de `gitError.ts` están
solo en español, y los mensajes de usuario que fabrica el proceso `main` mezclan español e inglés
sin pasar por ningún diccionario. El resto es duplicación de patrones entre paneles (el `run()` de
Stash/Tag, el bloque de error de lectura repetido 8 veces con presentación inconsistente),
constantes mágicas duplicadas entre renderer y main (límites 200/400) y detalles de robustez.
**Estado general: verde**, con mejoras incrementales recomendadas.

---

## Verificación de los hallazgos de la ronda 1

| # (r1) | Hallazgo | Estado | Evidencia |
|--------|----------|--------|-----------|
| A1 | `RepoDetail.tsx` gigante y patrón de acción duplicado ~10 veces | **Resuelto** | `runAction()` (`RepoDetail.tsx:111-121`) encapsula busy→api→result→reload; listas extraídas a `BranchLists.tsx` y `RemoteList.tsx`. De ~834 a 702 líneas y sin duplicación del patrón. Sigue siendo el componente más grande, pero con responsabilidades acotadas (orquestación + diálogos). |
| M1 | `parseRef` marcaba remota cualquier ref con `/` | **Resuelto** | `format.ts:50-58` compara el primer segmento contra la lista real de remotos (que `CommitGraph` recibe por props). Con test en `format.test.ts`. |
| M2 | Colores hardcodeados que ignoraban el tema claro | **Resuelto** | `--lane-0..7`, `--graph-bg`, `--teal`, `--mauve` definidos por tema en `main.css:15-91`; `CommitGraph.tsx:14-15` y `BlameDialog.tsx:23` consumen las variables. |
| M3 | `SEP` y `NET_TIMEOUT` duplicados en 4 servicios | **Resuelto** | Centralizados en `src/main/gitFormat.ts` e importados por gitService, blameService, stashService y tagService. |
| M4 | Hack `undefined!` en `dialog.showOpenDialog` | **Resuelto** | `index.ts:308-311` usa el overload sin ventana cuando no hay `mainWindow`. |
| M5 | `no-explicit-any` desactivado | **Resuelto** | `.eslintrc.cjs:20` lo pone en `'error'`; el lint pasa. |
| Rec. 6 | Adoptar `import/order` | **Persiste** (descartado conscientemente) | Documentado en `00-resumen-y-tareas.md`; decisión explícita, no un olvido. |
| B1 | Comentario de "Fase 1/2" obsoleto en `App.tsx` | **Resuelto** | Cabecera actualizada (`App.tsx:8-12`). |
| B2 | Ruta personal `E:\MTTRSystem` en la UI | **Resuelto** | Texto genérico vía diccionario (`app.noReposHint`). |
| B3 | Condición muerta `staged.length >= 0` en `canCommit` | **Resuelto** | `CommitPanel.tsx:181`: `… || amend`. |
| B4 | `style={{ cursor: 'pointer' }}` inline repetido | **Resuelto** | Las filas clicables son ahora `<button>` reales con cursor en CSS. |
| B5 | Keys por índice en listas | **Parcial** | `CommitGraph.tsx:139` ya usa `key={raw}`; **`HunkView.tsx:93` sigue con `key={i}`** por línea del hunk (aceptable, pero era parte del hallazgo). |
| B6 | Doble cast ilegible al extraer `code` en `runGit` | **Resuelto** | Type guard `exitCode()` (`gitRunner.ts:5-11`). |
| B7 | `line.match` vs `re.exec` inconsistente | **Resuelto** | Todo el parseo del main usa `re.exec(...)`. |

Además, lo comprometido en el lote de correcciones existe de verdad: `ipc.ts` es la única fuente
del contrato (main y preload derivan tipos de él), `handleWrite` serializa por repo, todas las
lecturas devuelven `ReadResult<T>` y la UI lo muestra, y el CI (`.github/workflows/ci.yml`) corre
typecheck + lint + tests en Windows y Ubuntu.

---

## Fortalezas del código (estado actual)

- **Contrato IPC tipado de una sola fuente.** `IpcContract` (`src/shared/ipc.ts`) elimina la
  triplicación de firmas: un typo de canal o un parámetro cambiado no compila. El borrado de tipos
  interno de `handle()` está bien acotado y comentado (`index.ts:119-133`).
- **`ReadResult<T>` aplicado con criterio.** Las lecturas distinguen "sin datos" de "git falló", y
  casos legítimos se tratan como éxito vacío (repo sin commits en `gitService.ts:54-56`, exit 1 de
  `config --get-regexp` sin coincidencias en `aliasService.ts:34-36`).
- **Cola por repo en el sitio correcto.** `withRepoLock` vive en el main (no depende de la
  disciplina del renderer), normaliza mayúsculas de rutas Windows y no se atasca ante un throw
  (`repoQueue.ts`), todo con tests.
- **Seguridad mantenida y ampliada**: `execFile`/`spawn` con argumentos como array (nunca shell),
  `sandbox: true` + `contextIsolation`, `GIT_TERMINAL_PROMPT=0`, guard de path traversal que
  resuelve symlinks y bloquea extensiones ejecutables (`index.ts:283-300`), CSP en `index.html`.
- **i18n tipado**: `es` define las claves y `en` está tipado contra ese conjunto
  (`messages.ts:385-387`) — una clave sin traducir no compila. `lang` del documento sincronizado.
- **`Dialog` accesible reutilizable** (trampa de foco, Escape, retorno de foco, `data-autofocus`
  en Cancelar para diálogos destructivos) usado por todos los diálogos.
- **Tests valiosos**: 129 tests contra el git real con fixtures temporales (`fixture.ts`), que
  cubren justo lo frágil (porcelain de blame, orden de tags, `--cc` en merges, inyección,
  concurrencia de `repoQueue`). Verificado: typecheck, lint y suite completa **pasan**.
- **Comentarios que explican el porqué**, no el qué, de forma consistente en todo `src/`.

---

## Hallazgos por severidad

### Alta

**A1 · La cobertura i18n tiene dos agujeros: `gitError.ts` y los mensajes fabricados en el main**
El lote de correcciones declara "i18n completo (es/en)", pero dos categorías de texto de usuario
no pasan por el diccionario:

1. **Las explicaciones de errores de git están solo en español.**
   `src/renderer/src/lib/gitError.ts:18-89`: los 14 pares `title`/`hint` de `PATTERNS` son
   literales en español. Un usuario con la UI en inglés ve la interfaz en inglés y, justo cuando
   algo falla (el momento en que más importa entender), la explicación en español.
2. **Los mensajes de usuario del proceso `main` mezclan idiomas y no son traducibles.**
   En español: `gitService.ts:351` (`la rama "…" no existe`), `aliasService.ts:72`
   (`ya hay un alias en ejecucion…`) y `:96` (`[alias detenido]`), `gitRunner.ts:98`
   (`[proceso terminado…]`), `hunkService.ts:96` (`no existe el hunk…`).
   En inglés: `index.ts:293` (`file not found`), `:295` (`path outside the repository`), `:297`
   (`blocked extension…`). Todos acaban en `stderr`/retornos que la UI muestra tal cual.
- **Recomendación:** mover los textos de `gitError.ts` al diccionario (una clave por patrón:
  `explainGitError` devolvería claves y la UI las traduciría con `t()`), y para el main devolver
  códigos/claves estables en lugar de frases (p. ej. `shell:openFile` → `'not-found' |
  'outside-repo' | 'blocked-ext'`) que el renderer traduzca. Como mínimo, unificar el idioma de
  los mensajes del main.

### Media

**M1 · Stash y Tag limpian el formulario aunque la operación falle (se pierde lo escrito)**
`src/renderer/src/components/StashPanel.tsx:66-71`: `onPush` hace `await run(…)` y acto seguido
`setMessage('')`, `setUntracked(false)`, `setShowNew(false)` **sin mirar `res.ok`** (el `run`
devuelve el resultado, pero se ignora). Si el stash falla (p. ej. hook o lock), el mensaje que el
usuario escribió desaparece junto con el formulario. Igual en `TagPanel.tsx:60-68` (`onCreate`
borra nombre, mensaje y target aunque `git tag` falle). Contrasta con `AliasPanel.tsx:63-73`, que
sí comprueba `res.ok` antes de limpiar — el criterio correcto ya existe en el propio código.
- **Recomendación:** condicionar la limpieza/cierre a `res.ok`, como hace `AliasPanel.create`.

**M2 · El patrón "panel satélite" está triplicado y el bloque de error de lectura, óctuple**
Dos duplicaciones estructurales en el renderer:
- El helper `run()` de `StashPanel.tsx:52-64` y `TagPanel.tsx:48-58` es casi idéntico
  (selfBusy → fn → onResult → load → onChanged), y el trío `load`/`setData`/`setLoadErr` sobre un
  `ReadResult` se repite en `StashPanel.tsx:40-44`, `TagPanel.tsx:38-42`, `AliasPanel.tsx:30-34`,
  `HunkView.tsx:36-42`, `BlameDialog.tsx:36-48` y `ReflogDialog.tsx:40-50` (estos dos últimos
  añaden a mano el mismo guard `alive`).
- El markup del error de lectura (`role="alert"` + `(err.stderr || err.stdout).trim()`…) aparece
  en 8 sitios con **presentación inconsistente**: `RepoDetail.tsx:553-557`, `CommitPanel.tsx:264-269`,
  `HunkView.tsx:63-69`, `BlameDialog.tsx:80-85` y `ReflogDialog.tsx:99-104` muestran el comando
  (`<code>{err.cmd}</code>`); `StashPanel.tsx:118-123`, `TagPanel.tsx:121-126` y
  `AliasPanel.tsx:137-142` solo lo enseñan como fallback dentro del `<pre>`.
- **Recomendación:** un hook `useGitRead(fn)` (data + error + reload + cancelación `alive`) y un
  hook/`runPanelAction` compartido para el patrón busy→result→reload de los paneles satélite, más
  un componente `<GitReadError result={…}/>` que unifique el bloque de error. Elimina ~100 líneas
  y la inconsistencia visual de golpe.

**M3 · Límites mágicos duplicados a ambos lados de la frontera IPC**
El límite de búsqueda vive dos veces: como default `limit = 200` en `gitService.ts:70` y como
literal en `SearchBar.tsx:123` (`results.length === 200` para pintar "(máx.)"). Si el default del
main cambia, el indicador del renderer miente **silenciosamente** (nada compila mal ni falla).
Lo mismo con la página del grafo: `GRAPH_PAGE = 400` en `RepoDetail.tsx:21` duplica el default
`limit = 400` de `getCommits` (`gitService.ts:48`).
- **Recomendación:** constantes compartidas (`SEARCH_LIMIT`, `GRAPH_PAGE`) en `src/shared/` (junto
  a los tipos), importadas por ambos procesos; el renderer además debería pasarlas explícitamente
  en la llamada en vez de confiar en el default remoto.

**M4 · `discoverRepos` lanza un git por subcarpeta sin tope de concurrencia**
`src/main/repoService.ts:70-77`: `Promise.all` sobre todas las subcarpetas de primer nivel, con un
`isRepo` (proceso git) por cada una. Escanear una carpeta con 100 subdirectorios lanza 100 gits
simultáneos — exactamente el problema que `mapLimit` se añadió a resolver para `repos:list`
(`repoQueue.ts:29-33` lo documenta). Inconsistencia interna: el propio handler `repos:scan` sí usa
`mapLimit(discovered, 6, getRepoInfo)` justo después (`index.ts:190-195`).
- **Recomendación:** `mapLimit(entries, 6, …)` también dentro de `discoverRepos`.

### Baja

**B1 · `--max-count` duplicado en la búsqueda por revisión**
`src/main/gitService.ts:75,98`: en modo `hash`, `base` ya incluye `--max-count=${limit}` y luego se
añade `--max-count=1`. Git obedece al último, así que funciona, pero el argumento duplicado en el
comando (que además se muestra en la UI como `cmd`) es ruido y confunde al lector.
- **Recomendación:** construir `base` sin `--max-count` y añadir el límite por modo.

**B2 · `keepIndex` es superficie muerta del contrato**
`src/shared/ipc.ts:84` y `stashService.ts:61` soportan `keepIndex` (`--keep-index`), pero ningún
componente lo pasa: `StashPanel` solo expone mensaje e `includeUntracked`. Parámetro escrito,
testeado a medias y sin camino de uso.
- **Recomendación:** exponer el checkbox en `StashPanel` (es útil de verdad) o quitar el parámetro
  hasta que se necesite.

**B3 · El mapa de colas de `repoQueue` nunca se poda**
`src/main/repoQueue.ts:10-27`: `chains` guarda una entrada por ruta de repo para siempre (la
promesa ya resuelta queda retenida). Impacto real minúsculo, pero es un mapa que solo crece.
- **Recomendación:** al resolverse la cadena, borrar la entrada si sigue siendo la última
  (`if (chains.get(key) === tail) chains.delete(key)`).

**B4 · Resto del hallazgo B5 (ronda 1): `key={i}` por línea en `HunkView`**
`src/renderer/src/components/HunkView.tsx:93`. Las líneas de un hunk son estáticas dentro de un
render, así que no hay bug, pero quedó como única key por índice del hallazgo original.

**B5 · La detección de "push rechazado" está duplicada en dos sitios**
`RepoDetail.tsx:278-285` (`pushRejected`, regex `non-fast-forward|fetch first|\[rejected\]|failed
to push`) y `gitError.ts:45-48` (patrón `failed to push some refs|non-fast-forward|\[rejected\]`)
codifican el mismo conocimiento con regexes ligeramente distintas; pueden divergir (una ya incluye
`fetch first` y la otra no).
- **Recomendación:** exportar de `gitError.ts` un predicado `isPushRejected(res)` y usarlo en ambos.

**B6 · Amend con cuerpo pero sin subject descarta el texto en silencio**
`CommitPanel.tsx:181,185` + `commitService.ts:83-89`: con `amend` activo y subject vacío se envía
mensaje `''` → `--amend --no-edit`. Si el usuario escribió solo un cuerpo (esperando reescribir el
mensaje), ese texto se ignora sin aviso.
- **Recomendación:** o bien incluir el body en `message` aunque no haya subject, o deshabilitar el
  textarea/avisar cuando amend va a conservar el mensaje anterior.

**B7 · Cada stage/unstage resetea el diff que el usuario estaba mirando**
`CommitPanel.tsx:75-81`: `refresh()` termina siempre en `loadDiff()` sin argumentos, que vuelve al
diff global staged (`diffFile = null`). Al preparar un archivo mientras se revisa otro, la vista
salta. Es comportamiento, no bug, pero nace de que `refresh` mezcla dos responsabilidades
(recargar listas y resetear el diff).
- **Recomendación:** que `refresh` recargue el diff **actual** (`loadDiff(diffFile ?? undefined,
  diffCached)`) y solo resetee si el archivo desapareció de la lista.

---

## Recomendaciones priorizadas

| # | Prioridad | Acción | Referencia |
|---|-----------|--------|------------|
| 1 | Alta | Pasar `gitError.ts` a claves del diccionario y devolver códigos (no frases) desde el main; unificar idioma | `gitError.ts:18-89`, `index.ts:293-297`, `gitService.ts:351` (A1) |
| 2 | Media | No limpiar formularios de Stash/Tag cuando la operación falla (mirar `res.ok`) | `StashPanel.tsx:66-71`, `TagPanel.tsx:60-68` (M1) |
| 3 | Media | Hook `useGitRead` + acción de panel compartida + componente `<GitReadError>` | 6-8 componentes (M2) |
| 4 | Media | Constantes compartidas `SEARCH_LIMIT` / `GRAPH_PAGE` en `src/shared/` | `SearchBar.tsx:123`, `gitService.ts:48,70`, `RepoDetail.tsx:21` (M3) |
| 5 | Media | `mapLimit` también dentro de `discoverRepos` | `repoService.ts:70-77` (M4) |
| 6 | Baja | Exponer `keepIndex` en la UI o retirarlo del contrato | `ipc.ts:84`, `StashPanel.tsx` (B2) |
| 7 | Baja | Unificar la detección de push rechazado en un predicado exportado | `RepoDetail.tsx:278-285`, `gitError.ts:45-48` (B5) |
| 8 | Baja | Conservar el diff seleccionado tras stage/unstage; aclarar amend sin subject | `CommitPanel.tsx:75-81,181` (B6, B7) |
| 9 | Baja | Limpiezas menores: `--max-count` duplicado, poda de `chains`, `key={i}` en HunkView | (B1, B3, B4) |

---

## Verificación realizada

- `npm run typecheck` → **PASA** (node y web, exit 0).
- `npm run lint` → **PASA** (0 errores / 0 warnings, con `no-explicit-any: 'error'` activo).
- `npm test` → **129/129 tests PASAN** (14 archivos, git real contra repos temporales, ~25 s).
- No se modificó ningún archivo de código; el único entregable es este informe.
