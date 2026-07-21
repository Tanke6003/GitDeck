# Auditoría de UX/UI — GitDeck

Fecha: 2026-07-21
Alcance: capa de presentación (`src/renderer/src/**`). No cubre el proceso `main`/`preload` salvo lo que asoma en la UI.

---

## Resumen ejecutivo

GitDeck es un cliente de Git de escritorio con una base de UX **notablemente sólida para su etapa**: la información es transparente (siempre se ve el comando real y su salida), las acciones destructivas están casi todas protegidas con confirmaciones que distinguen *local* de *remoto*, hay explicaciones accionables de errores de git, y funciones avanzadas (staging por hunk, vista previa de merge, blame, reflog, búsqueda multi-modo) que muchos clientes comerciales no tienen. El microcopy en español es claro y con buen tono.

Dicho esto, la auditoría encontró **tres problemas de alto impacto que hoy degradan seriamente la experiencia**:

1. **El tema claro está roto en la vista principal** (el grafo de commits queda con texto oscuro sobre fondo oscuro forzado): la funcionalidad estrella es ilegible para quien use el tema claro.
2. **La operabilidad por teclado es casi inexistente**: el foco es invisible (no hay estilo `:focus-visible`), y casi todos los elementos interactivos son `<li>`/`<div>` con `onClick`, no focusables ni accionables con teclado.
3. **Descubribilidad**: las acciones más importantes de cada rama (merge, rebase, renombrar, borrar) solo aparecen al pasar el ratón por encima, por lo que son invisibles para teclado y pantallas táctiles, y difíciles de encontrar en general.

El resto son mejoras de consistencia, feedback y accesibilidad, más una lista de oportunidades mayores (virtualización del grafo, diff lado a lado, resolución de conflictos integrada).

---

## Lo que ya está muy bien

- **Transparencia total**: cada operación muestra `$ comando` + salida cruda (`action-result`, `term`, `cd-opres`). Excelente para un público técnico y para depurar.
- **Errores accionables**: `lib/gitError.ts` traduce los fallos más comunes de git a título + qué hacer, sin sustituir nunca la salida real (`RepoDetail.tsx:789-795`). Es una de las mejores decisiones del proyecto.
- **Confirmaciones destructivas con matices**: borrar rama local vs remota (`RepoDetail.tsx:274-340`), tag local vs remoto (`TagPanel.tsx:61-100`), drop de stash (`StashPanel.tsx:64-83`), escalado a `-D` solo cuando git rechaza `-d` (`RepoDetail.tsx:290-307`). El lenguaje explica consecuencias reales ("quedan huérfanos", "afecta a todo el que use ese remoto").
- **Vista previa de merge no destructiva** (`MergePreviewDialog.tsx`): commits que entran, archivos, fast-forward vs merge-commit. Modelo a seguir para otras acciones.
- **Avisos no bloqueantes** en vez de `window.alert`/`window.confirm` (comentado explícitamente en `App.tsx:17` y `ConfirmDialog.tsx:18`), lo que evita congelar el renderer.
- **Estados de carga y vacío contemplados** en casi todos los paneles ("cargando…", "sin stashes", "sin tags", "nada preparado", etc.).
- **Detalles finos**: descarte de respuestas obsoletas por carrera (`SearchBar.tsx:33`, `RepoDetail.tsx:47,199`), debounce de búsqueda a 300 ms, agrupado visual del blame por commit, contador de longitud del encabezado Conventional Commits con umbrales 50/72.
- **Auto-refresh al recuperar el foco de la ventana** (`App.tsx:34-40`, `RepoDetail.tsx:86-92`): buen puente con quien también usa la terminal.

---

## Hallazgos por severidad

### Alta

**A1 · El tema claro es ilegible en el grafo de commits (theming)**
`assets/main.css:489` fija `.graph-scroll { background: #16161f }` y `CommitGraph.tsx:128` pinta el nodo de merge con `fill='#181825'`, ambos colores oscuros *hardcodeados*. Las filas de commit (`.commit-row`) heredan `color: var(--text)`, que en tema claro es `#4c4f69` (gris oscuro). Resultado: en tema claro, el árbol de commits —la vista central de la app— muestra **texto oscuro sobre fondo casi negro**, prácticamente ilegible.
*Recomendación*: sustituir esos literales por variables de tema (p. ej. un nuevo `--graph-bg` con valor por tema), y usar `--bg`/`--code-bg` para el nodo de merge. Auditar todos los hex literales del CSS/JS (ver también M5).

**A2 · Operabilidad por teclado rota: foco invisible + elementos clicables no focusables**
- No existe ningún estilo `:focus-visible` para botones, `.link` ni filas. Los `input` además anulan el contorno (`outline: none`) y solo cambian el color de borde (`main.css:434, 677, 751, 1281`…), señal débil. Con teclado es casi imposible saber dónde está el foco.
- La mayoría de elementos interactivos son `<li>`/`<div>` con `onClick`: repos (`App.tsx:127-139`), ramas (`RepoDetail.tsx:563-568`), filas del grafo (`CommitGraph.tsx:152-159`), archivos del commit-panel (`CommitPanel.tsx:185-201`), resultados de búsqueda (`SearchBar.tsx:121`), mensaje de stash (`StashPanel.tsx:150-155`). No son `tabbable`, no tienen `role`, y no responden a Enter/Espacio. Un usuario de teclado no puede seleccionar un repo, abrir un commit ni hacer checkout de una rama.
*Recomendación*: añadir un `:focus-visible` global visible (contorno de 2px con `--accent`); convertir las filas clicables en `<button>`/`role="button"` con `tabIndex=0` y manejo de teclado, o envolver el contenido clicable en un `<button>`.

**A3 · Acciones de rama solo visibles al hover**
`main.css:1097-1104`: `.b-actions { display: none }` y solo se muestran con `.branch-row:hover`. merge, rebase, renombrar y borrar (`RepoDetail.tsx:582-630`) están **ocultos hasta pasar el ratón**. Consecuencias: invisibles para teclado (que además no puede hacer hover), invisibles en pantallas táctiles, y poco descubribles incluso con ratón (nada indica que existan). El propio checkout de una rama comparte el click de fila con esas acciones, lo que confunde el modelo mental.
*Recomendación*: mostrar las acciones siempre (aunque atenuadas) o al menos con `:focus-within`; separar claramente el área de "checkout" de la de acciones (p. ej. un menú "⋯" por fila) para que el click de fila no compita con los botones.

**A4 · Diálogos: sin trampa de foco, Escape inconsistente y autoFocus en el botón destructivo**
- No hay foco atrapado ni `role="dialog"`/`aria-modal`/`aria-labelledby` en ningún diálogo (`ConfirmDialog`, `MergePreviewDialog`, `CommitDetailDrawer`, `BlameDialog`, `ReflogDialog`). El fondo no queda inerte: con Tab el foco se escapa al contenido de detrás. Tampoco se devuelve el foco al elemento que abrió el diálogo al cerrarlo.
- **Escape es inconsistente**: `BlameDialog.tsx:41-47` y `ReflogDialog.tsx:42-48` cierran con Escape, pero `ConfirmDialog`, `MergePreviewDialog` y `CommitDetailDrawer` **no** (solo click en overlay o botón). El usuario aprende un comportamiento y en la mitad de los diálogos no funciona.
- `ConfirmDialog.tsx:40`: el botón de confirmar tiene `autoFocus`, **incluso cuando es destructivo** (`danger`). Si el usuario venía de pulsar Enter/Espacio para abrir el diálogo y repite la pulsación, **dispara la acción destructiva sin querer**.
*Recomendación*: un componente `Dialog` reutilizable con `role="dialog"`, `aria-modal`, trampa de foco, cierre con Escape y retorno de foco. En diálogos `danger`, enfocar **Cancelar** por defecto, no el botón peligroso.

**A5 · Operaciones largas sin progreso real (fetch/pull/push)**
`RepoDetail.tsx:120-258`: fetch, pull y push solo cambian la etiqueta del botón a "⏳ fetch…" y ponen `busy`. Un `busy` único **deshabilita a la vez todos los botones de acción** del panel (cabecera + panel lateral: merge, rebase, borrar, stash, tags), sin indicar dónde está pasando algo. Para un fetch/push de un repo grande (segundos o minutos) la app **parece congelada**: sin spinner, sin barra, sin salida en vivo.
*Recomendación*: indicador de progreso indeterminado en el botón que disparó la acción (spinner + estado "conectando/transfiriendo"), y a medio plazo *streaming* de la salida de git para que se vea avanzar. Considerar deshabilitar solo lo que corresponde en vez de todo.

### Media

**M1 · Fetch/Pull/Push desaparecen fuera de la pestaña "Árbol"**
`RepoDetail.tsx:432`: los botones de sincronización están dentro de `tab === 'tree'`. En las pestañas *Commit* o *Alias* no hay forma visible de hacer pull/push (solo el atajo Ctrl+Shift+F sigue haciendo fetch). Justo tras resolver un merge en la pestaña *Commit*, el usuario querrá empujar y no encontrará el botón.
*Recomendación*: mantener las acciones de sincronización accesibles en todas las pestañas (barra fija de cabecera) o replicar Push cuando hay commits por delante.

**M2 · Rebase sin confirmación ni vista previa**
`RepoDetail.tsx:226-236` ejecuta `rebase` **inmediatamente** al pulsar el botón. Es incoherente con merge, que sí tiene una vista previa completa, siendo el rebase igual o más arriesgado (reescribe la rama actual y puede dejar conflictos). Un click accidental en "rebase" (que además está en el bloque oculto por hover, A3) lanza la operación sin red.
*Recomendación*: como mínimo un `ConfirmDialog`; idealmente reutilizar el patrón de `MergePreviewDialog` (qué commits se reaplicarían, sobre qué base).

**M3 · Acciones que sí modifican estado sin confirmación (inconsistencia)**
"Quitar remoto" (`RepoDetail.tsx:380-389` / botón `745-752`) y "Quitar" repo (`RepoDetail.tsx:466`) se ejecutan sin confirmar, mientras acciones comparables (borrar rama, borrar tag) sí piden confirmación. Aunque ambas son recuperables (re-agregar), la inconsistencia hace que el usuario no sepa cuándo esperar una red de seguridad. "Quitar" repo, además, comparte el estilo `.danger` con acciones peligrosas y está pegado al resto de botones de cabecera: un misclick borra la entrada de la lista.
*Recomendación*: confirmación ligera para quitar remoto y para quitar repo (o `undo` con toast), y separar visualmente "Quitar" del cluster de acciones frecuentes.

**M4 · Señales que dependen solo del color**
- Punto dirty/limpio del sidebar: `App.tsx:135` + `main.css:254-265` solo diferencian por color (amarillo/verde). El `title` requiere hover; para daltónicos son casi iguales.
- Punto de la pestaña *Commit* cuando hay cambios (`RepoDetail.tsx:478`, `.tab-dot`) es puro color, minúsculo, sin texto ni conteo.
- Contador de longitud del encabezado (`CommitPanel.tsx:397`, `.ce-count.over`) comunica "pasado de largo" solo con color.
*Recomendación*: añadir forma/ícono/texto además del color (p. ej. anillo vs relleno en el punto, número de archivos junto a la pestaña, "72/72" o icono ⚠ en el contador).

**M5 · Contraste y colores hardcodeados en tema claro**
Varios colores fijos pensados para fondo oscuro se usan en ambos temas: `.ref-chip.remote { color:#94e2d5 }` (`main.css:570`), `.branch-row.remote .b-mark { color:#94e2d5 }` (`611`), `.cd-merge { color:#cba6f7 }` (`963`), `.cd-fstat.st-ren { color:#94e2d5 }` (`1041`). Sobre fondos claros son pastel de bajo contraste. Además `.alias-desc.none` combina texto ya atenuado con `opacity:.7` (`1493-1497`), probablemente por debajo del mínimo AA. La paleta `LANE_COLORS` del grafo (`CommitGraph.tsx:12-21`) también es fija (dentro del grafo oscuro no molesta, pero conviene revisarla si se corrige A1).
*Recomendación*: pasar estos colores a variables por tema y verificar contraste AA (4.5:1 texto normal).

**M6 · Sin regiones `aria-live`: los resultados asíncronos no se anuncian**
`notice` (`App.tsx:106-113`) y `action-result` (`RepoDetail.tsx:780-797`) aparecen sin `aria-live`. Un usuario de lector de pantalla no se entera de si el fetch fue bien, si el push fue rechazado o si se agregó un repo.
*Recomendación*: `aria-live="polite"` (y `role="status"`/`role="alert"` según criticidad) en esos contenedores.

**M7 · Botones solo-icono sin nombre accesible**
Multitud de botones son un glifo con `title` pero sin `aria-label`: ✎ ✕ ✓ − ＋ ↗ ↑ ✕↑ ⇢ ↩ ⑂ ↻ ⟱ etc. (`RepoDetail`, `CommitPanel`, `TagPanel`, `StashPanel`, `CommitDetailDrawer`). El `title` no es un nombre accesible fiable en todos los lectores y depende del hover (inútil en teclado/táctil).
*Recomendación*: `aria-label` explícito en cada botón solo-icono; marcar los glifos decorativos con `aria-hidden`.

**M8 · El toast `action-result` no se autodescarta y puede tapar contenido**
`main.css:1589-1600`: panel fijo abajo-derecha de 520px que persiste hasta pulsar ✕, también en caso de éxito. Puede solaparse con el panel lateral (ramas/remotos) o quedar detrás/encima del drawer. Tras varias acciones, el usuario acumula la sensación de "algo tapando".
*Recomendación*: auto-descartar los resultados `ok` tras unos segundos (con opción de fijar), mantener visibles los de error; asegurar que no colisiona con drawer/diálogos (z-index y posición).

**M9 · Atajos de teclado poco descubribles**
Existen F5, Ctrl+R, Ctrl+Shift+F, Ctrl+B, Ctrl+F, pero solo Ctrl+Shift+F y Ctrl+B se insinúan en `title`, y Ctrl+F en el placeholder del buscador. No hay ninguna hoja/panel que los liste.
*Recomendación*: un overlay de ayuda (tecla `?`) o un menú con la lista de atajos; mostrar el atajo en el `title`/`aria-label` de cada acción que lo tenga.

**M10 · Densidad del panel lateral: scroll largo sin agrupación colapsable**
`RepoDetail.tsx:539-776` apila Ramas locales, Ramas remotas, Remotos, Stashes y Tags en una sola columna de 300px que crece sin límite. En un repo con muchas ramas/tags, encontrar algo obliga a un scroll largo y el grafo pierde protagonismo.
*Recomendación*: secciones colapsables (acordeón) con conteo en la cabecera y estado recordado; o pestañas dentro del panel lateral.

### Baja

**B1 · Inconsistencias de microcopy y de iconografía**
- Mayúsculas mezcladas: "cancelar" en línea (`RepoDetail.tsx:499`, `StashPanel`, `TagPanel`) vs "Cancelar" en diálogos (`ConfirmDialog.tsx:38`).
- En `TagPanel.tsx:172` el ✕ de "borrar tag local" **no** lleva la clase `del`, así que no adopta el hover rojo de peligro que sí tiene el ✕↑ remoto (`175-183`): dos botones de borrado adyacentes con affordance distinta. Además ✕ vs ✕↑ pegados son fáciles de confundir (borrar local vs remoto).
*Recomendación*: unificar casing de "Cancelar"; homogeneizar el estilo de los botones de borrado; separar/etiquetar mejor local vs remoto.

**B2 · Ruta personal hardcodeada en el estado vacío**
`App.tsx:124`: el mensaje de "sin repos" sugiere *"Usa Escanear sobre `E:\MTTRSystem`"*, una ruta concreta del desarrollador. Para cualquier otro usuario es ruido confuso.
*Recomendación*: texto genérico ("escanea una carpeta que contenga tus repos").

**B3 · Escape ausente en formularios en línea**
La barra de nueva rama (`RepoDetail.tsx:486-503`) crea con Enter pero no cierra con Escape, a diferencia de otros formularios (`StashPanel`, `TagPanel`, edición de rama/remoto sí lo hacen). Inconsistencia menor.

**B4 · Semántica de encabezados y landmarks**
Hay varios `<h1>` (el de `empty-state` en `App.tsx:155` y el de `RepoDetail.tsx:420`), sin una jerarquía de headings clara dentro de los paneles (los `pane-title` son `<div>`). La lista de repos no está en un `<nav>`.
*Recomendación*: un solo `<h1>` por vista, `pane-title` como `<h2>`/`<h3>`, y envolver la lista de repos en `<nav aria-label="Repositorios">`.

**B5 · Feedback por-fila ausente durante acciones**
Al hacer checkout o merge desde una fila de rama, `busy` se pone a `co:<rama>`/`merge` (`RepoDetail.tsx:152,214`) pero la UI no lo refleja en esa fila: todo se deshabilita en bloque sin spinner localizado.
*Recomendación*: spinner/estado en la fila que originó la acción.

**B6 · Falta de acciones "de desarrollador" esperadas sobre el repo**
No hay "abrir en terminal", "abrir en el explorador" ni "abrir en el editor" desde un repo (sí existe abrir archivo en conflicto en el editor, `CommitPanel.tsx:126-132`). Es una expectativa habitual en clientes Git.

---

## Accesibilidad (sección específica)

Estado general: **la app hoy no es operable con teclado ni con lector de pantalla**. Es el área con más recorrido de mejora.

1. **Foco visible (crítico)** — No hay `:focus-visible` en botones/enlaces/filas; los inputs anulan `outline`. Añadir un anillo de foco visible y consistente en todos los elementos interactivos. (Ver A2.)
2. **Elementos interactivos reales (crítico)** — Convertir los `<li>/<div onClick>` (repos, ramas, commits, archivos, resultados de búsqueda, stashes) en controles focusables con rol y manejo de Enter/Espacio. (Ver A2.)
3. **Acciones ocultas por hover (crítico)** — `.b-actions` debe ser alcanzable sin ratón (`:focus-within` o siempre visibles). (Ver A3.)
4. **Diálogos accesibles** — `role="dialog"` + `aria-modal="true"` + `aria-labelledby`, trampa de foco, Escape uniforme, fondo inerte y retorno de foco al cerrar. En diálogos destructivos, foco inicial en Cancelar. (Ver A4.)
5. **Nombres accesibles** — `aria-label` en todos los botones solo-icono; `aria-hidden` en glifos decorativos. (Ver M7.)
6. **Anuncios en vivo** — `aria-live` para `notice`, `action-result`, resultado de commit y estados "cargando/hecho". (Ver M6.)
7. **No depender solo del color** — dirty/clean, dot de pestaña, contador de longitud, ahead/behind: reforzar con forma/texto/icono. (Ver M4.)
8. **Contraste** — corregir colores hardcodeados en tema claro y `alias-desc.none`; verificar AA en `--text-dim` sobre `--bg`/`--bg-elev`. (Ver A1, M5.)
9. **El grafo SVG** — no tiene alternativa textual ni navegación por teclado; considerar que cada fila (ya en el DOM en `.commit-rows`) sea un control accesible y que el SVG sea `aria-hidden` (decorativo), apoyándose en la fila para la semántica.
10. **`lang` del documento** — verificar que el `index.html` declara `lang="es"` para que el lector de pantalla use pronunciación correcta.
11. **Tamaños de click** — varios botones de acción son de 10px con padding mínimo (`.b-actions`, `.st-actions`, `.tg-actions`): por debajo del objetivo recomendado (~24-44px). Ampliar el área activa.

---

## Quick wins (bajo esfuerzo, alto impacto)

1. **Añadir `:focus-visible` global** para botones, `.link` y filas interactivas (arregla la mitad del problema de teclado). *(A2)*
2. **Reemplazar `#16161f` y `#181825` por variables de tema** para arreglar el grafo en tema claro. *(A1)*
3. **Enfocar "Cancelar" en `ConfirmDialog` cuando es `danger`** (cambiar el `autoFocus`). *(A4)*
4. **`aria-label` + `role="status"`/`aria-live`** en `notice` y `action-result`. *(M6, M7)*
5. **Mostrar `.b-actions` con `:focus-within` además de `:hover`** y subir un poco el tamaño de esos botones. *(A3)*
6. **Escape uniforme**: añadirlo a `ConfirmDialog`, `MergePreviewDialog`, `CommitDetailDrawer` y a la barra de nueva rama. *(A4, B3)*
7. **Confirmación para "Quitar remoto" y "Quitar" repo**; separar "Quitar" del cluster de acciones. *(M3)*
8. **Confirmación (o preview) para rebase**, reutilizando `ConfirmDialog`. *(M2)*
9. **Quitar la ruta personal `E:\MTTRSystem`** del estado vacío. *(B2)*
10. **Clase `del` al ✕ de borrar tag local** y unificar casing "Cancelar". *(B1)*
11. **Auto-descartar los toasts de éxito** tras unos segundos. *(M8)*
12. **Reforzar el punto dirty/clean** con forma (anillo vs relleno) además del color. *(M4)*

## Mejoras mayores (más esfuerzo, alto valor)

1. **Wrapper `Dialog` accesible reutilizable** (foco atrapado, aria, Escape, retorno de foco) que sustituya a los cinco diálogos actuales. Resuelve A4 de raíz y unifica el patrón.
2. **Virtualización del grafo de commits** (p. ej. `react-window`): hoy `CommitGraph` genera SVG + fila DOM para *cada* commit; en repos con miles de commits habrá jank y consumo de memoria. Virtualizar filas y dibujar solo los tramos de aristas visibles.
3. **Diff lado a lado (split)** con resaltado intra-línea (word-diff) y, si se puede, coloreado por sintaxis. Hoy todos los diffs son unificados (`CommitPanel`, `CommitDetailDrawer`, `HunkView`, `StashPanel`).
4. **Resolución de conflictos integrada** (editor 3-way) en la pestaña *Commit*, para no depender del editor externo (`CommitPanel.tsx:126-132`).
5. **Streaming/`progreso real` de operaciones de red** (fetch/pull/push) con salida en vivo y barra indeterminada; deshabilitar de forma granular en lugar del bloqueo global `busy`. *(A5)*
6. **Reorganización del panel lateral** en secciones colapsables con estado recordado, para escalar a repos con muchas ramas/tags. *(M10)*
7. **Command palette + hoja de atajos** (`Ctrl+K` / `?`) que también sirva de descubrimiento de funciones. *(M9)*
8. **Acciones sobre commit desde el grafo** (reset soft/mixed/hard "hasta aquí", checkout de commit) con confirmaciones al nivel de las actuales; y acciones de repo ("abrir en terminal/explorador/editor"). *(B6)*
9. **Drag & drop**: soltar una carpeta para agregarla como repo, y arrastrar archivos entre "Cambios" y "Preparado".

---

## Recomendaciones priorizadas

| # | Acción | Severidad | Esfuerzo |
|---|--------|-----------|----------|
| 1 | `:focus-visible` global + convertir filas clicables en controles accesibles | Alta (A2) | Bajo–Medio |
| 2 | Arreglar el tema claro del grafo (variables en vez de hex fijos) | Alta (A1) | Bajo |
| 3 | Mostrar acciones de rama sin depender del hover | Alta (A3) | Bajo |
| 4 | Wrapper de diálogo accesible (aria + foco atrapado + Escape uniforme + foco en Cancelar) | Alta (A4) | Medio |
| 5 | Progreso real / no bloquear todo en fetch/pull/push | Alta (A5) | Medio |
| 6 | Confirmación o preview de rebase; confirmar "quitar remoto/repo" | Media (M2, M3) | Bajo |
| 7 | Fetch/Pull/Push accesibles en todas las pestañas | Media (M1) | Bajo |
| 8 | `aria-live` + `aria-label` en avisos, resultados y botones-icono | Media (M6, M7) | Bajo |
| 9 | Reforzar señales por color; corregir contrastes de tema claro | Media (M4, M5) | Bajo |
| 10 | Virtualización del grafo + diff lado a lado (mejoras mayores) | — | Alto |

Los puntos 1–5 son los que más elevan la calidad percibida y la usabilidad real; conviene abordarlos antes de las mejoras mayores.
