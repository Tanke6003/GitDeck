# Auditoría de UX/UI — GitDeck (Ronda 2)

Fecha: 2026-07-21
Alcance: capa de presentación (`src/renderer/src/**`), tras las correcciones aplicadas después de la ronda 1. No cubre `main`/`preload` salvo lo que asoma en la UI.

---

## Resumen ejecutivo

La ronda 1 encontró una app **inoperable con teclado y lector de pantalla, con el tema claro roto en la vista central y diálogos sin semántica**. Esa foto ya no existe: el equipo aplicó las correcciones de forma seria, no cosmética. Hoy hay `:focus-visible` global, todas las filas clicables son `<button>` reales, existe un componente `Dialog` accesible (foco atrapado, Escape uniforme, retorno de foco, Cancelar enfocado en destructivos), `aria-label`/`aria-live` en los sitios clave, confirmaciones consistentes (rebase, quitar remoto/repo, descartar, clean con dry-run obligatorio), tema claro funcional con variables por tema hasta en los carriles del grafo, y un i18n es/en tipado en el que una clave sin traducir no compila. De los 21 hallazgos de la ronda 1, **14 están resueltos, 5 parciales y 2 persisten** (los dos declarados explícitamente como trabajo futuro).

La ronda 2 se centra en lo que queda y en la superficie nueva. Los tres problemas de mayor impacto hoy:

1. **La secuencia de tabulación del grafo es impracticable**: convertir cada fila de commit en `<button>` (correcto en sí) crea una lista de hasta 400+ tabulaciones consecutivas sin *roving tabindex* ni mecanismo de salto; llegar con teclado al panel lateral de ramas exige atravesarla entera.
2. **La trampa de foco de los diálogos se rompe cuando el botón enfocado se deshabilita** (`busy`): el foco cae a `<body>`, Escape deja de cerrar y Tab escapa al fondo. Pasa en Comparar, Reflog, Clean y Reset; fuera de diálogos, el mismo patrón hace que el usuario de teclado pierda su posición tras cada acción.
3. **El sistema de explicación de errores (`gitError.ts`) quedó fuera del i18n**: con la UI en inglés, los títulos y consejos de error —el momento donde más importa entender— siguen apareciendo en español.

El resto son pulidos: el anillo de foco global no llega a los inputs (9 reglas `outline: none` con más especificidad), contrastes AA que fallan en tema claro para texto pequeño en `--warn`/`--ok`, borrar un alias global sin confirmación, y detalles de microcopy bilingüe. Ninguno es estructural: la base es hoy notablemente sólida.

---

## Lo que ya está muy bien (verificado en esta ronda)

- **`Dialog` reutilizable ejemplar** (`components/Dialog.tsx`): `role="dialog"` + `aria-modal` + `aria-labelledby`, trampa de Tab, Escape con `stopPropagation` (los diálogos anidados —Reset dentro de Reflog, Blame dentro del drawer— cierran de dentro hacia fuera correctamente), retorno de foco al abridor, y la convención `data-autofocus` que en destructivos aterriza en **Cancelar** (`ConfirmDialog.tsx:37-46`). Es exactamente lo que pedía A4.
- **Confirmaciones con pedagogía**: los textos de rebase, force-with-lease, reset (`reset.soft/mixed/hard`), clean y borrar rama remota explican consecuencias reales y distinguen local/remoto/irreversible (`lib/messages.ts:84-115, 151-161, 345-363`). El flujo de borrado de rama que escala a `-D` solo cuando git rechaza `-d` sigue siendo modélico (`RepoDetail.tsx:307-334`).
- **`CleanDialog` obliga al dry-run**: la lista exacta de lo que se borraría se calcula siempre antes de habilitar el botón real, y "no hay nada que limpiar" deshabilita el peligro (`CleanDialog.tsx:43-84`).
- **Flujo de push rechazado → force-with-lease**: detectar el non-fast-forward y ofrecer el reintento seguro con confirmación y explicación (`RepoDetail.tsx:278-298`, `push.force.msg`) es mejor que lo que hacen varios clientes comerciales.
- **i18n tipado**: `es` define las claves y `en` está tipado contra ellas (`lib/messages.ts:385-387`), `document.documentElement.lang` sigue al idioma (`lib/i18n.tsx:41-44`), y `relativeTime` es bilingüe con tests que además cazaron un bug real de etiquetas corridas.
- **Errores de lectura visibles**: todos los paneles distinguen "sin datos" de "git falló" y muestran comando + salida (`RepoDetail.tsx:553-557`, `StashPanel.tsx:118-123`, `BlameDialog.tsx:80-85`, etc.).
- **Feedback localizado**: spinner en el botón que disparó fetch/pull/push (`RepoDetail.tsx:414-421`), resultados OK auto-descartados a los 6 s con errores persistentes (`RepoDetail.tsx:124-128`), spinner con `aria-hidden` correcto.
- **Señales con forma además de color**: dot limpio = anillo / sucio = relleno con `aria-label` (`main.css:279-293`, `App.tsx:151-156`); contador de encabezado con ⚠ al pasarse (`CommitPanel.tsx:404-407`).
- **La hoja de atajos** (`?` y botón en cabecera) con `<kbd>` y tabla legible (`ShortcutsDialog.tsx`).
- **Vista previa de merge ampliada** con radiogrupo de estrategia (`--no-ff/--squash/--ff-only`) descrito en lenguaje llano (`MergePreviewDialog.tsx:76-99`).

---

## Estado de los hallazgos de la ronda 1

| ID | Hallazgo | Estado | Nota |
|----|----------|--------|------|
| A1 | Tema claro ilegible en el grafo | **Resuelto** | `--graph-bg` y `--lane-0..7` por tema (`main.css:21,34-42,84-91`; `CommitGraph.tsx:14-15,109`). |
| A2 | Foco invisible + elementos no focusables | **Resuelto (con matiz)** | `:focus-visible` global (`main.css:2249-2259`) y filas convertidas a `<button>`. Matiz: los inputs siguen anulando el anillo (nuevo M4) y el grafo genera una tab-sequence enorme (nuevo A1-R2). |
| A3 | Acciones de rama solo al hover | **Parcial** | Ahora también con `:focus-within` (`main.css:1131-1134`) y botones más grandes. Pero siguen invisibles hasta hover/foco: nada indica al usuario de ratón que existen, y en táctil siguen inaccesibles. |
| A4 | Diálogos sin trampa de foco / Escape / autoFocus peligroso | **Resuelto (con matiz)** | `Dialog.tsx` cubre todo lo pedido. Matiz: la trampa se rompe si el elemento enfocado se deshabilita (nuevo A2-R2). |
| A5 | Operaciones largas sin progreso | **Parcial** | Spinner localizado en el botón disparador. Sigue el bloqueo global `disabled={!!busy}` de toda la cabecera y panel lateral, y sin streaming (declarado futuro). |
| M1 | Fetch/Pull/Push solo en pestaña Árbol | **Resuelto** | Fuera del condicional de pestaña (`RepoDetail.tsx:439-468`). |
| M2 | Rebase sin confirmación | **Resuelto** | `ConfirmDialog` danger con explicación (`RepoDetail.tsx:244-259`). Sin vista previa tipo merge (aceptable). |
| M3 | Quitar remoto / repo sin confirmación | **Resuelto** | Ambos confirman con texto que aclara qué se pierde (`RepoDetail.tsx:373-408`). |
| M4 | Señales solo-color | **Resuelto (mayormente)** | Dot con forma, ⚠ en contador. El `tab-dot` sigue siendo un punto minúsculo, pero su señal es presencia/ausencia (no discriminación de color) y tiene `aria-label` (`RepoDetail.tsx:509-511`). |
| M5 | Colores hardcodeados en tema claro | **Parcial** | `--teal`/`--mauve`/lanes ya son variables. Quedan fondos `rgba()` fijos de la paleta mocha en ambos temas y fallos AA de `--warn`/`--ok` como texto pequeño en claro (nuevo M2-R2). |
| M6 | Sin `aria-live` | **Resuelto (con matiz)** | `notice` y `action-result` con `role="status"`/`aria-live="polite"`. Matiz: los errores también son *polite*; merecerían `role="alert"` (nuevo M7-R2). |
| M7 | Botones solo-icono sin nombre | **Resuelto (casi)** | `aria-label` generalizado. Quedan los ✓ de confirmar renombrado (`BranchLists.tsx:59`, `RemoteList.tsx:94`) solo con `title`. |
| M8 | Toast persistente que tapa | **Resuelto (con matiz)** | OK auto-descarta a 6 s, errores persisten. Matiz: sin pausa al hover y `z-index: 50` queda bajo el overlay del drawer (60) (`main.css:1629, 958`). |
| M9 | Atajos poco descubribles | **Resuelto** | `ShortcutsDialog` con `?` y botón en cabecera; atajos en los `title`. |
| M10 | Panel lateral sin colapsables | **Persiste** | Declarado como mejora futura en el backlog. |
| B1 | Casing "cancelar"/✕ sin `del` | **Resuelto** | `common.cancel` = "Cancelar" unificado; el ✕ local de tag ya lleva `del` (`TagPanel.tsx:181`). Nueva inconsistencia menor con `common.close` = "cerrar" (B1-R2). |
| B2 | Ruta personal hardcodeada | **Resuelto** | Texto genérico (`app.noReposHint`). |
| B3 | Escape ausente en nueva rama | **Resuelto** | `RepoDetail.tsx:529`. |
| B4 | Encabezados y landmarks | **Parcial** | `<nav aria-label>` para repos y un solo `<h1>` visible por vista. Pero solo dos `pane-title` son `<h2>` (`RepoDetail.tsx:593,606`); en Stash, Tags, Remotos, CommitPanel y diálogos siguen siendo `<div>`. |
| B5 | Feedback por fila | **Parcial** | Solo fetch/pull/push tienen spinner localizado; checkout/merge desde una fila siguen deshabilitando todo sin señal en la fila. |
| B6 | Abrir en terminal/explorador/editor | **Persiste** | Sigue sin existir (solo abrir archivo en conflicto). |

---

## Hallazgos por severidad (ronda 2)

### Alta

**A1-R2 · La secuencia de tabulación del grafo es impracticable con teclado**
Cada fila del grafo es ahora un `<button>` (`CommitGraph.tsx:128-151`), y la página carga 400 commits por defecto (`RepoDetail.tsx:21`, `GRAPH_PAGE`). Resultado: entre el buscador y el panel lateral de ramas hay **hasta 400+ paradas de Tab consecutivas** (más con "cargar 400 más"). Un usuario de teclado que quiera hacer checkout de una rama debe tabular por todo el historial; en la práctica se ha cambiado "no se puede operar" por "operar cuesta cientos de pulsaciones". Lo mismo aplica, a menor escala, a los resultados de búsqueda y a listas largas de ramas/tags.
*Recomendación*: patrón de *roving tabindex* (el contenedor recibe un solo Tab; ↑/↓ mueven la selección entre filas, Enter abre el commit), que además es el patrón APG para listboxes. Como paliativo inmediato: un enlace de salto ("saltar al panel de ramas") antes del grafo, o `tabIndex={-1}` en todas las filas salvo la activa.

**A2-R2 · Deshabilitar el control enfocado durante `busy` rompe la trampa de foco (y Escape) en los diálogos**
`Dialog` atrapa Tab y cierra con Escape **solo mientras el foco está dentro del diálogo** (los handlers viven en el contenedor, `Dialog.tsx:40-66`). Pero varios diálogos deshabilitan el botón recién pulsado al entrar en `busy`: Comparar (`CompareDialog.tsx:27-33,75`), crear rama en Reflog (`ReflogDialog.tsx:52-68,151`), Clean (`CleanDialog.tsx:35-41,81`) y Reset (`ResetDialog.tsx:28-34,64`). Cuando un botón enfocado pasa a `disabled`, el navegador mueve el foco a `<body>`: a partir de ahí **Tab escapa al contenido de detrás y Escape deja de cerrar el diálogo** — precisamente lo que A4 quería impedir. Fuera de diálogos pasa lo mismo con `disabled={!!busy}` en toda la cabecera (`RepoDetail.tsx:441-498`): tras cada fetch/pull/push el usuario de teclado pierde su posición y debe re-tabular desde el principio.
*Recomendación*: no deshabilitar el botón en curso (usar `aria-busy` + ignorar clicks repetidos), o mover el foco explícitamente a un elemento vivo del diálogo antes de deshabilitar; en `Dialog`, como red de seguridad, escuchar Escape a nivel de documento mientras el diálogo esté montado y devolver el foco al contenedor si `document.activeElement` sale de él.

**A3-R2 · El sistema de explicación de errores no está internacionalizado**
Todo `lib/gitError.ts` (14 patrones con `title` y `hint`, líneas 18-89) está hardcodeado en español. Con la UI en inglés, el momento más crítico —"el push fue rechazado, haz esto"— aparece en otro idioma, justo donde el usuario está más perdido. Es la única pieza grande de microcopy fuera del diccionario tipado, y rompe la promesa del i18n completo. (Menor y relacionado: `confirmLabel: 'rebase'` en `RepoDetail.tsx:249` y los literales `'HEAD detached'` / `'detached'` en `RepoDetail.tsx:434` y `App.tsx:158` tampoco pasan por `t()`.)
*Recomendación*: mover títulos y hints a claves de `messages.ts` (p. ej. `gitError.auth.title`) y que `explainGitError` devuelva claves que la UI traduzca; el tipado existente garantiza la cobertura en ambos idiomas.

### Media

**M1-R2 · Los inputs siguen anulando el anillo de foco (regresión parcial de A2)**
El `:focus-visible` global (`main.css:2249-2259`) queda derrotado por 9 reglas preexistentes `outline: none` de mayor especificidad: `.new-branch-bar input:focus` (463), `.add-remote input:focus` (706), `.s-input:focus` (780), `.ce-header input:focus, .ce-body:focus` (1313), `.alias-filter:focus` (1415), `.af-row input:focus` (1454), `.rl-branch input:focus` (2103) y `.cd-branch` (2152) — `.b-edit/.rm-edit` (1851) también, aunque ahí la menor especificidad deja ganar al global. En esos campos el único indicador de foco es el cambio de color de un borde de 1px, muy por debajo del anillo de 2px del resto de la UI: inconsistente y débil (WCAG 2.4.7 se cumple a duras penas; 2.4.13/AAA no).
*Recomendación*: eliminar esos `outline: none` (el global ya da un anillo coherente) o sustituirlos por el mismo `outline: 2px solid var(--accent)`.

**M2-R2 · Contraste AA en tema claro: `--warn` y `--ok` como color de texto pequeño**
En claro, `--warn: #df8e1d` sobre `--bg #eff1f5` da ≈2.7:1 y `--ok: #40a02b` ≈2.9:1 — ambos por debajo del 4.5:1 exigido para texto normal. Se usan como texto de 10-13px en: nombres de tag (`.tg-name`, `main.css:913-921`), sha de la vista previa de merge (`.mp-sha`, 1804-1808), contadores ahead/behind de 10px (`.b-sync`, 663-675), `.fstat` (1210-1217), `.ce-count.warn` (1325-1327), `.hk-stat` (1897-1907), badges y `.ce-result.ok`. En oscuro todos pasan holgadamente. Además persisten fondos `rgba()` fijos de la paleta mocha usados en ambos temas (chips `main.css:588-604`, badges 374-385, `.merge-banner` 1150, `.fav-chip` 2199-2206): funcionan, pero son deuda de theming.
*Recomendación*: introducir variantes de texto más oscuras para claro (p. ej. `--warn-text: #b07000`) o subir el peso/tamaño; pasar los `rgba` fijos a variables.

**M3-R2 · Borrar un alias global no pide confirmación (y editar puede duplicar)**
`AliasPanel.tsx:82-89`: el ✕ borra el alias **de la configuración global de git** inmediatamente, sin `ConfirmDialog` — inconsistente con el resto de la app, donde hasta quitar un repo de la lista (recuperable) confirma. Un alias con un comando largo y cuidado no es trivial de reconstruir. Además, "editar" (`AliasPanel.tsx:75-80`) rellena el formulario de creación: si el usuario corrige el **nombre**, "Guardar (global)" crea un alias nuevo y deja el viejo huérfano, sin avisar.
*Recomendación*: `ConfirmDialog` (no necesariamente `danger`) mostrando el comando que se pierde; en edición, detectar el cambio de nombre y ofrecer renombrar (crear + borrar el anterior).

**M4-R2 · El reintento con `--force-with-lease` solo existe dentro del toast de error**
El botón vive en el `action-result` del push rechazado (`RepoDetail.tsx:659-665`). Si el usuario cierra el toast (✕) —un gesto entrenado por la propia app—, la única vía al force push desaparece: no hay ninguna otra superficie que lo ofrezca, y repetir Push normal vuelve a fallar igual. El usuario atascado tras un amend/rebase debe darse cuenta de que tiene que *volver a fallar* para recuperar el botón.
*Recomendación*: mientras `pushRejected` sea cierto, ofrecer también el reintento junto al botón Push de la cabecera (o mantener el hint en el toast del siguiente fallo, que ya ocurre, pero documentar el atajo en el propio mensaje de error).

**M5-R2 · Enter en formularios en línea ignora `busy` (bypass del disabled)**
Los botones de enviar se deshabilitan con `busy`, pero el Enter del input no lo comprueba: guardar stash (`StashPanel.tsx:132-135` → `onPush` sin guarda), crear tag (`TagPanel.tsx:134-138`), agregar remoto (`RemoteList.tsx:61-64`), crear rama en el drawer (`CommitDetailDrawer.tsx:174-180`) y en Reflog (`ReflogDialog.tsx:143-149`). Un Enter repetido durante una operación en curso lanza una segunda operación concurrente (la cola por repo del `main` la serializa, pero la UI muestra resultados que se pisan).
*Recomendación*: guardar `if (busy) return` al inicio de cada handler de envío (una línea por sitio).

**M6-R2 · Objetivos de click diminutos persisten en stash/tags**
`.st-actions button` y `.tg-actions button` siguen en `font-size: 10px; padding: 1px 5px` (`main.css:883-886, 927-930`) — muy por debajo del objetivo recomendado de 24×24px (WCAG 2.5.8), y son precisamente apply/pop/drop y publicar/borrar tag, acciones con consecuencias. `.b-gone` es texto de 9px (676-683). Los `.b-actions` sí crecieron (11px + padding, 1135-1139): aplicar el mismo trato al resto.

**M7-R2 · El toast de resultado: errores anunciados como cortesía, sin pausa, y por debajo del drawer**
- `action-result` usa `role="status"`/`aria-live="polite"` también cuando `result.ok === false` (`RepoDetail.tsx:645`): un push fallido se anuncia con la misma prioridad que un fetch exitoso. Los errores merecen `role="alert"`.
- El auto-descarte de 6 s (`RepoDetail.tsx:124-128`) no se pausa al hacer hover ni al enfocar: un resultado OK con salida larga (p. ej. un pull con resumen de archivos) puede desaparecer mientras se lee (WCAG 2.2.1).
- `z-index: 50` (`main.css:1629`) queda por debajo del overlay del drawer (60) y de los diálogos (70): con el drawer abierto, el toast queda atenuado bajo el velo y puede quedar tapado por el propio drawer de 620px.

### Baja

**B1-R2 · Microcopy: casing y término de "cerrar"**
`common.close` = "cerrar"/"close" en minúscula se usa como etiqueta **visible** del botón principal de `ShortcutsDialog` (`ShortcutsDialog.tsx:36-39`), conviviendo con "Cancelar", "Continuar", "Crear" capitalizados en los demás diálogos. Como `aria-label` de los ✕ está bien; como botón de acción rompe la convención.

**B2-R2 · Pluralización con paréntesis**
"{n} commit(s)", "Se agregaron {n} repo(s)", "{n} conflicto(s)" (`messages.ts:25,201,297`). Con n=1 queda "Se agregaron 1 repo(s)". El diccionario tipado hace trivial añadir claves `.one/.many` o una mini-función de plural.

**B3-R2 · `gitVersion` se congela en el idioma inicial**
`App.tsx:33-38` captura `t('app.gitMissing')` una sola vez al montar (con eslint-disable explícito): si git falta y el usuario cambia de idioma, el pie del sidebar queda en el idioma anterior. Menor, pero es el único texto que no reacciona al toggle.

**B4-R2 · Tabs con ARIA a medias**
`role="tablist"`/`role="tab"` y `aria-selected` están (`RepoDetail.tsx:503-516`), pero no hay `role="tabpanel"` ni `aria-controls`, y la navegación es con Tab en lugar de flechas (patrón APG). Funciona porque son botones reales; la semántica anunciada promete un widget que no se comporta como tal. O completar el patrón o dejar botones con `aria-current`.

**B5-R2 · La etiqueta del botón de Clean no refleja `-x`**
Con "incluir ignorados" marcado, el botón sigue diciendo "Borrar (clean -fd)" (`CleanDialog.tsx:81-83`, `clean.confirm`), pero el comando ejecutado incluirá `-x`. En una app cuyo sello es enseñar el comando exacto, el literal debería actualizarse (`clean -fdx`).

**B6-R2 · Fechas relativas sin absoluta**
Las filas del grafo muestran solo "hace 3 sem" (`CommitGraph.tsx:147`) y el `title` de la fila es el subject: no hay forma de ver la fecha exacta sin abrir el drawer. Un `title`/tooltip con la fecha completa en `.commit-date` bastaría.

**B7-R2 · El atajo `?` solo existe con un repo abierto y se cuela en los diálogos**
El listener vive en `RepoDetail` (`RepoDetail.tsx:152-153`): en el estado vacío `?` no hace nada y no hay botón de ayuda. Además, con un diálogo abierto, `?` (no es Escape, no se detiene) abre la hoja de atajos debajo/encima del diálogo actual. Mover el listener a `App` y suprimirlo cuando haya un diálogo modal.

**B8-R2 · `ReflogDialog` comparte el estado del nombre entre entradas**
`name` es único para todo el diálogo (`ReflogDialog.tsx:36`): abrir "rama" en una entrada, teclear, y abrir en otra conserva el texto anterior, con el riesgo de crear la rama en la entrada equivocada tras un despiste. Limpiar `name` al cambiar `openRef`.

**B9-R2 · La estrategia de pull no se refleja en el botón**
El botón siempre dice "↓ Pull" aunque el `<select>` esté en `--rebase`/`--ff-only` (`RepoDetail.tsx:444-463`); la única pista es el `title` y un select estrecho de 11px. Mostrar el modo en el propio botón ("Pull --rebase") reforzaría el modelo mental. La preferencia además es global (`PULL_MODE_KEY`, línea 22), no por repo — discutible pero razonable.

**B10-R2 · Diálogos anidados: doble manejo de Tab**
Cuando Reset se abre dentro de Reflog (o Blame dentro del drawer), el evento Tab lo procesan ambos `Dialog` (el interior no hace `stopPropagation` para Tab, `Dialog.tsx:46-66`). Hoy no produce fallos visibles porque el interior mueve el foco antes de que el exterior evalúe, pero es frágil: cualquier cambio de orden DOM podría hacer que el trap exterior "robe" el foco. Añadir `e.stopPropagation()` también en la rama de Tab.

**B11-R2 · Últimos botones-icono sin `aria-label`**
Los ✓ de confirmar renombrado de rama y remoto solo tienen `title` (`BranchLists.tsx:59-61`, `RemoteList.tsx:94-96`). El resto de la app ya usa `aria-label`; completar por consistencia.

**B12-R2 · Límite de búsqueda 200 hardcodeado en la vista**
`results.length === 200` (`SearchBar.tsx:123`) replica un límite que vive en el backend: si este cambia, el indicador "(máx.)" deja de aparecer sin que nadie lo note. Exponer el límite en la respuesta o en una constante compartida.

---

## Accesibilidad (sección específica)

Estado general: **de "no operable" (ronda 1) a "operable con fricciones"**. El salto es real: foco visible, controles nativos, diálogos con semántica completa, nombres accesibles, anuncios en vivo y `lang` dinámico. Lo que queda, por orden de impacto:

1. **Navegación eficiente del grafo (crítico restante)** — La tab-sequence de 400+ botones (A1-R2) es hoy la mayor barrera práctica de teclado. Roving tabindex o skip-link.
2. **Robustez de la trampa de foco** — La pérdida de foco por `disabled` en `busy` (A2-R2) anula Escape y el confinamiento justo en los diálogos que operan sobre el repo.
3. **Indicador de foco en inputs** — 9 reglas `outline: none` siguen ganando al anillo global (M1-R2); el borde de 1px es una señal débil e inconsistente.
4. **Contraste en tema claro** — `--warn`/`--ok` como texto de 10-13px quedan en 2.6-2.9:1 (M2-R2). El oscuro cumple.
5. **Objetivos táctiles** — apply/pop/drop y publicar/borrar tag siguen en ~14px de alto (M6-R2); `.b-actions` ya se corrigió, extender el trato.
6. **Anuncios con la prioridad correcta** — errores como `role="alert"`, no `status` (M7-R2); el ⚠ del contador de encabezado es `aria-hidden`, así que el estado "pasado de 72" no se transmite a lector de pantalla (`CommitPanel.tsx:404-407`) — añadir un `aria-label` al contador ("74 caracteres, por encima del máximo").
7. **Estructura de encabezados** — solo dos `pane-title` son `<h2>`; Stash, Tags, Remotos y los títulos internos de paneles siguen siendo `<div>` (B4 ronda 1, parcial).
8. **Semántica de tabs** — completar o simplificar (B4-R2).
9. **Tipografías mínimas** — abundan 9-11px (`.b-gone` 9px, metadatos 10px): legibilidad justa incluso sin zoom; con zoom 200% el layout aguanta (grid con minmax), lo cual es bueno.
10. **Contenido temporizado** — el toast OK desaparece a los 6 s sin pausa al hover/foco (M7-R2).
11. **Hover residual** — `.b-actions` sigue sin pista visible para ratón hasta el hover y sin vía táctil (A3 parcial): un menú "⋯" por fila resolvería descubribilidad, táctil y densidad a la vez.

---

## Quick wins (bajo esfuerzo, alto impacto)

1. **Quitar los 9 `outline: none`** de los inputs — una pasada de CSS restaura el anillo global. *(M1-R2)*
2. **`if (busy) return`** en los 5 handlers de Enter que lo omiten. *(M5-R2)*
3. **`role="alert"` cuando `result.ok === false`** en `action-result` y `notice`. *(M7-R2)*
4. **Subir `z-index` del toast** por encima del drawer y pausar el auto-descarte con `mouseenter`/`focusin`. *(M7-R2)*
5. **`ConfirmDialog` para borrar alias** mostrando el comando que se pierde. *(M3-R2)*
6. **Igualar `.st-actions`/`.tg-actions` al tamaño de `.b-actions`**. *(M6-R2)*
7. **Etiqueta dinámica del botón de Clean** (`clean -fd` / `clean -fdx`). *(B5-R2)*
8. **`aria-label` en los ✓ de renombrar** y "Cerrar" capitalizado en ShortcutsDialog. *(B11-R2, B1-R2)*
9. **Limpiar `name` al cambiar de entrada en Reflog**. *(B8-R2)*
10. **`title` con fecha absoluta** en `.commit-date`. *(B6-R2)*
11. **Mostrar el modo de pull en el botón** ("Pull --rebase"). *(B9-R2)*
12. **`stopPropagation` en la rama Tab de `Dialog`** para blindar los anidados. *(B10-R2)*

## Mejoras mayores (más esfuerzo, alto valor)

1. **Roving tabindex / listbox en el grafo y resultados de búsqueda** (↑/↓ + Enter, un solo tab-stop) — resuelve A1-R2 y prepara la virtualización pendiente.
2. **Internacionalizar `gitError.ts`** vía claves del diccionario tipado. *(A3-R2)*
3. **Gestión de foco en `busy`**: no deshabilitar el control en curso (aria-busy) o recolocar el foco; red de seguridad de Escape a nivel documento en `Dialog`. *(A2-R2)*
4. **Menú "⋯" por fila de rama** que sustituya al bloque hover/focus-within: descubribilidad para ratón, acceso táctil y menos densidad. *(A3 ronda 1, cierre definitivo)*
5. **Variantes de color de texto para tema claro** (`--warn-text`, `--ok-text`) y migrar los `rgba` fijos a variables. *(M2-R2)*
6. Pendientes ya reconocidos del backlog: virtualización del grafo, diff lado a lado, panel lateral colapsable, streaming de progreso de red, resolución de conflictos integrada.

---

## Recomendaciones priorizadas

| # | Acción | Severidad | Esfuerzo |
|---|--------|-----------|----------|
| 1 | Roving tabindex (o skip-link) en el grafo de commits | Alta (A1-R2) | Medio |
| 2 | Arreglar pérdida de foco por `disabled` en diálogos + Escape a nivel documento | Alta (A2-R2) | Bajo–Medio |
| 3 | i18n de `gitError.ts` (títulos y hints por clave) | Alta (A3-R2) | Bajo–Medio |
| 4 | Quitar los `outline: none` de inputs | Media (M1-R2) | Bajo |
| 5 | Contraste de `--warn`/`--ok` en tema claro | Media (M2-R2) | Bajo |
| 6 | Confirmar borrado de alias; manejar renombrado | Media (M3-R2) | Bajo |
| 7 | Force push descubrible fuera del toast | Media (M4-R2) | Bajo |
| 8 | Guardas de `busy` en Enter; targets de stash/tags | Media (M5/M6-R2) | Bajo |
| 9 | Toast: `alert` en errores, pausa al hover, z-index | Media (M7-R2) | Bajo |
| 10 | Menú "⋯" por rama (cierre de A3) + colapsables del panel lateral | Media | Medio |

Con los puntos 1-3 resueltos, GitDeck quedaría genuinamente operable de punta a punta con teclado y coherente en sus dos idiomas; el resto es pulido incremental sobre una base que esta ronda confirma como sólida.
