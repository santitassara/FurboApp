# Sanción manual por admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El admin puede sancionar manualmente a un titular anotado en un partido (para el caso en que el jugador no pueda darse de baja solo), con el mismo efecto final que una baja normal: pierde su lugar en el partido y queda `estaSancionado: true`.

**Architecture:** Nueva función de servicio `sancionarManualmente` en `inscripcionesService.js` (paralela a `bajarse` pero admin-only y restringida a titulares), expuesta vía nueva ruta admin `POST /api/partidos/:partidoId/sancionar/:usuarioId`. En el frontend, `ListaJugadores` gana un botón "Sancionar" por titular, un nuevo modal de confirmación, y `AdminPanel` orquesta la llamada.

**Tech Stack:** Node.js + Express + Firestore (backend), Jest (tests backend), React + Axios + TailwindCSS (frontend). Sin tests de frontend (consistente con el resto del proyecto).

## Global Constraints

- Backend: arquitectura en capas `routes` → `controllers` → `services`, con errores lanzados como `Error` + `error.status` y capturados por `envolverAsync` / middleware de errores centralizado.
- Rutas admin protegidas con `verificarToken` + `verificarAdmin`, en ese orden.
- Solo se sanciona/da de baja a jugadores con `tipo === 'titular'`; los suplentes nunca se sancionan (regla ya vigente para la baja automática, y se reutiliza igual aquí).
- Frontend en español (nombres de funciones, textos de UI), siguiendo el estilo visual "potrero nocturno de barrio" ya usado en `Boton`, `ModalConfirmacionSancion`, etc.
- No agregar historial ni motivo de sanción — solo el flag booleano `estaSancionado` ya existente.

---

### Task 1: Servicio — `inscripcionesService.sancionarManualmente`

**Files:**
- Modify: `backend/src/services/inscripcionesService.js`
- Test: `backend/tests/services/inscripcionesService.test.js`

**Interfaces:**
- Consumes: `obtenerInscripcionActiva(partidoId, usuarioId)` (ya existe en el mismo archivo), `usuariosService.sancionar(usuarioId)` (ya existe, mockeado en el test vía `jest.mock('../../src/services/usuariosService')`), `crearError(mensaje, status)` (helper ya existente en el archivo).
- Produces: `sancionarManualmente(partidoId, usuarioId)` — async, devuelve `{ ...inscripcion, estado: 'dado_de_baja' }`; lanza error con `status: 404` si no hay inscripción activa, `status: 400` si `tipo !== 'titular'`. Exportado desde `module.exports` del archivo.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `backend/tests/services/inscripcionesService.test.js` (antes del `describe('inscripcionesService.listarActivas'...)` final, o después de `describe('inscripcionesService.promover'...)`, respetando el mismo estilo que los bloques existentes):

```js
describe('inscripcionesService.sancionarManualmente', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rechaza con 404 si no hay inscripción activa', async () => {
    mockInscripcionesCol.get.mockResolvedValueOnce({ empty: true, docs: [] });

    await expect(inscripcionesService.sancionarManualmente('p1', 'u1')).rejects.toMatchObject({ status: 404 });
  });

  it('rechaza con 400 si el jugador es suplente', async () => {
    mockInscripcionesCol.get.mockResolvedValueOnce({
      empty: false,
      docs: [{ id: 'i1', data: () => ({ tipo: 'suplente', estado: 'anotado' }) }],
    });

    await expect(inscripcionesService.sancionarManualmente('p1', 'u1')).rejects.toMatchObject({ status: 400 });
    expect(usuariosService.sancionar).not.toHaveBeenCalled();
  });

  it('da de baja y sanciona al usuario si es titular', async () => {
    const docActualizarMock = crearDocMock();
    mockInscripcionesCol.get.mockResolvedValueOnce({
      empty: false,
      docs: [{ id: 'i1', data: () => ({ tipo: 'titular', estado: 'anotado' }) }],
    });
    mockInscripcionesCol.doc.mockReturnValue(docActualizarMock);

    const inscripcion = await inscripcionesService.sancionarManualmente('p1', 'u1');

    expect(docActualizarMock.update).toHaveBeenCalledWith({ estado: 'dado_de_baja' });
    expect(usuariosService.sancionar).toHaveBeenCalledWith('u1');
    expect(inscripcion.estado).toBe('dado_de_baja');
  });
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `cd backend && npx jest tests/services/inscripcionesService.test.js -t "sancionarManualmente"`
Expected: FAIL — `inscripcionesService.sancionarManualmente is not a function`

- [ ] **Step 3: Implementar la función**

En `backend/src/services/inscripcionesService.js`, agregar la función después de `bajarse` (línea 78, antes de `async function promover`):

```js
async function sancionarManualmente(partidoId, usuarioId) {
  const inscripcion = await obtenerInscripcionActiva(partidoId, usuarioId);
  if (!inscripcion) throw crearError('El jugador no está anotado en este partido', 404);
  if (inscripcion.tipo !== 'titular') throw crearError('Solo se puede sancionar a jugadores titulares', 400);

  await db.collection(COLECCION).doc(inscripcion.id).update({ estado: 'dado_de_baja' });
  await usuariosService.sancionar(usuarioId);

  return { ...inscripcion, estado: 'dado_de_baja' };
}
```

Y actualizar el `module.exports` al final del archivo para incluirla:

```js
module.exports = {
  anotarse,
  bajarse,
  sancionarManualmente,
  promover,
  contarOcupados,
  obtenerInscripcionActiva,
  listarActivas,
};
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `cd backend && npx jest tests/services/inscripcionesService.test.js`
Expected: PASS (todos los tests del archivo, incluidos los 3 nuevos)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/inscripcionesService.js backend/tests/services/inscripcionesService.test.js
git commit -m "feat(backend): agregar sancionarManualmente al servicio de inscripciones"
```

---

### Task 2: Controller y ruta admin

**Files:**
- Modify: `backend/src/controllers/inscripcionesController.js`
- Modify: `backend/src/routes/partidosRoutes.js`

**Interfaces:**
- Consumes: `inscripcionesService.sancionarManualmente(partidoId, usuarioId)` (Task 1), `verificarToken`, `verificarAdmin`, `envolverAsync` (ya existen y ya se usan en `partidosRoutes.js`).
- Produces: handler `inscripcionesController.sancionarManualmente(req, res)`; ruta `POST /api/partidos/:partidoId/sancionar/:usuarioId`.

- [ ] **Step 1: Agregar el handler en el controller**

En `backend/src/controllers/inscripcionesController.js`, agregar después de `promover` (línea 17):

```js
async function sancionarManualmente(req, res) {
  const inscripcion = await inscripcionesService.sancionarManualmente(req.params.partidoId, req.params.usuarioId);
  res.json(inscripcion);
}
```

Y actualizar el `module.exports`:

```js
module.exports = { anotarse, bajarse, promover, sancionarManualmente, listarPorPartido };
```

- [ ] **Step 2: Agregar la ruta**

En `backend/src/routes/partidosRoutes.js`, agregar después de la ruta de `promover` (línea 20, antes de `module.exports`):

```js
router.post(
  '/:partidoId/sancionar/:usuarioId',
  verificarToken,
  verificarAdmin,
  envolverAsync(inscripcionesController.sancionarManualmente)
);
```

- [ ] **Step 3: Verificar manualmente con el servidor**

Run: `cd backend && npm run dev` (o el script de arranque que use el proyecto — revisar `package.json` si el nombre difiere)

Con un token de admin válido y un `partidoId`/`usuarioId` de un titular anotado real (via Postman/curl/Firestore emulator, según cómo esté corriendo el proyecto localmente):

```bash
curl -X POST http://localhost:<puerto>/api/partidos/<partidoId>/sancionar/<usuarioId> \
  -H "Authorization: Bearer <token-admin>"
```

Expected: `200` con el JSON de la inscripción actualizada (`estado: "dado_de_baja"`), y el documento del usuario en Firestore con `estaSancionado: true`.

Si no hay entorno local de Firebase configurado para probar esto manualmente, documentar en el reporte de la tarea que este paso se omitió y por qué — no bloquea el resto del plan, ya que el Task 1 ya cubre la lógica con tests.

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/inscripcionesController.js backend/src/routes/partidosRoutes.js
git commit -m "feat(backend): expone POST /partidos/:partidoId/sancionar/:usuarioId para admin"
```

---

### Task 3: `ListaJugadores` — botón "Sancionar" para titulares

**Files:**
- Modify: `frontend/src/components/ListaJugadores.jsx`

**Interfaces:**
- Consumes: `Boton` (ya importado), variante `peligro` (ya definida en `Boton.jsx`).
- Produces: nueva prop `onSancionar?: (usuarioId: string) => void`. Cuando está presente, cada `<li>` de la lista de titulares muestra un botón "Sancionar" que llama a `onSancionar(jugador.usuarioId)`.

- [ ] **Step 1: Modificar el componente**

Reemplazar el bloque de titulares en `frontend/src/components/ListaJugadores.jsx` (líneas 3-22) por:

```jsx
export default function ListaJugadores({ jugadores, onPromover, onSancionar, deshabilitado }) {
  const titulares = jugadores.filter((jugador) => jugador.tipo === 'titular');
  const suplentes = jugadores.filter((jugador) => jugador.tipo === 'suplente');

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h4 className="mb-2 text-sm font-bold uppercase tracking-wide text-pasto-500">Titulares</h4>
        {titulares.length === 0 ? (
          <p className="text-sm text-white/50">Todavía no hay titulares.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {titulares.map((jugador) => (
              <li key={jugador.usuarioId} className="flex items-center justify-between text-sm text-white/90">
                <span>{jugador.nombre}</span>
                {onSancionar && (
                  <Boton
                    variante="peligro"
                    className="px-3 py-1 text-xs"
                    onClick={() => onSancionar(jugador.usuarioId)}
                    disabled={deshabilitado}
                  >
                    Sancionar
                  </Boton>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
```

El resto del archivo (bloque de suplentes, líneas 23-49) queda igual — no lo toques.

- [ ] **Step 2: Verificar visualmente**

Run: `cd frontend && npm run dev`, abrir el panel de admin (`/admin`), y confirmar que:
- Los titulares ahora muestran un botón rojo "Sancionar" al lado del nombre.
- Los suplentes siguen mostrando "Promover" como antes, sin cambios.
- En `Home.jsx` (donde `ListaJugadores` se usa sin pasar `onSancionar`), no aparece ningún botón nuevo — confirmar que `Home.jsx` no pasa esa prop (ya no la pasa por defecto, así que no requiere cambios).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ListaJugadores.jsx
git commit -m "feat(frontend): agregar botón Sancionar para titulares en ListaJugadores"
```

---

### Task 4: Modal de confirmación `ModalConfirmacionSancionAdmin`

**Files:**
- Create: `frontend/src/components/ModalConfirmacionSancionAdmin.jsx`

**Interfaces:**
- Consumes: `Boton` (mismo import que `ModalConfirmacionSancion.jsx`).
- Produces: componente con props `{ abierto: boolean, nombre: string, procesando: boolean, onConfirmar: () => void, onCancelar: () => void }`. Renderiza `null` si `abierto` es falsy.

- [ ] **Step 1: Crear el componente**

Crear `frontend/src/components/ModalConfirmacionSancionAdmin.jsx` con el mismo patrón visual que `ModalConfirmacionSancion.jsx`:

```jsx
import Boton from './Boton';

export default function ModalConfirmacionSancionAdmin({ abierto, nombre, procesando, onConfirmar, onCancelar }) {
  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-cancha-800 p-6 text-center">
        <h2 className="mb-2 text-lg font-bold text-tarjeta">¿Seguro que querés sancionar a {nombre}?</h2>
        <p className="mb-6 text-sm text-white/70">
          Va a quedar dado de baja de este partido y sancionado: no va a poder anotarse al próximo partido hasta que
          lo perdones.
        </p>
        <div className="flex justify-center gap-3">
          <Boton variante="ghost" onClick={onCancelar} disabled={procesando}>
            Cancelar
          </Boton>
          <Boton variante="peligro" onClick={onConfirmar} disabled={procesando}>
            {procesando ? 'Procesando…' : 'Sí, sancionar'}
          </Boton>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ModalConfirmacionSancionAdmin.jsx
git commit -m "feat(frontend): agregar modal de confirmación para sanción manual de admin"
```

---

### Task 5: `AdminPanel` — orquestar la sanción manual

**Files:**
- Modify: `frontend/src/pages/AdminPanel.jsx`

**Interfaces:**
- Consumes: `ModalConfirmacionSancionAdmin` (Task 4), prop `onSancionar` de `ListaJugadores` (Task 3), endpoint `POST /partidos/:partidoId/sancionar/:usuarioId` (Task 2), `api` (instancia de axios ya importada), `cargarTodo` (ya existe en el componente).
- Produces: ninguna interfaz nueva consumida por otros archivos — es la página final que integra todo.

- [ ] **Step 1: Importar el modal**

En `frontend/src/pages/AdminPanel.jsx`, agregar el import junto a los otros (después de la línea 5):

```jsx
import ModalConfirmacionSancionAdmin from '../components/ModalConfirmacionSancionAdmin';
```

- [ ] **Step 2: Agregar estado para el jugador a sancionar**

Junto a los demás `useState` (después de la línea 16, `const [accionEnCurso, setAccionEnCurso] = useState(false);`):

```jsx
const [jugadorASancionar, setJugadorASancionar] = useState(null);
```

`jugadorASancionar` va a tener la forma `{ partidoId, usuarioId, nombre }` o `null`.

- [ ] **Step 3: Agregar la función `sancionar`**

Después de la función `promover` (después de la línea 91, antes del `return`):

```jsx
async function sancionar(partidoId, usuarioId) {
  setError('');
  setMensaje('');
  setAccionEnCurso(true);
  try {
    await api.post(`/partidos/${partidoId}/sancionar/${usuarioId}`);
    setJugadorASancionar(null);
    await cargarTodo();
  } catch (err) {
    setError(err.message);
  } finally {
    setAccionEnCurso(false);
  }
}
```

- [ ] **Step 4: Pasar `onSancionar` a `ListaJugadores` y abrir el modal**

Reemplazar el bloque `<ListaJugadores ... />` (líneas 177-181) por:

```jsx
<ListaJugadores
  jugadores={inscripcionesPorPartido[partido.id] || []}
  onPromover={(usuarioId) => promover(partido.id, usuarioId)}
  onSancionar={(usuarioId) => {
    const jugador = (inscripcionesPorPartido[partido.id] || []).find((j) => j.usuarioId === usuarioId);
    setJugadorASancionar({ partidoId: partido.id, usuarioId, nombre: jugador?.nombre || 'este jugador' });
  }}
  deshabilitado={accionEnCurso}
/>
```

- [ ] **Step 5: Renderizar el modal**

Antes del cierre del `</div>` final del componente (después del `</section>` de "Partidos abiertos", línea 185), agregar:

```jsx
<ModalConfirmacionSancionAdmin
  abierto={Boolean(jugadorASancionar)}
  nombre={jugadorASancionar?.nombre}
  procesando={accionEnCurso}
  onConfirmar={() => sancionar(jugadorASancionar.partidoId, jugadorASancionar.usuarioId)}
  onCancelar={() => setJugadorASancionar(null)}
/>
```

- [ ] **Step 6: Verificar manualmente en el navegador**

Run: `cd frontend && npm run dev`, ir a `/admin` logueado como admin, con al menos un partido abierto con un titular anotado.

Pasos a probar:
1. Click en "Sancionar" junto a un titular → se abre el modal con su nombre.
2. Click en "Cancelar" → el modal se cierra sin cambios.
3. Click en "Sancionar" de nuevo → "Sí, sancionar" → el modal se cierra, el titular desaparece de la lista de anotados del partido, y aparece en la sección "Sancionados" con el botón "Perdonar".
4. Verificar que "Perdonar" sobre ese usuario sigue funcionando como antes (lo saca de "Sancionados").

Si no hay Firestore local para probar esto de punta a punta, dejarlo documentado explícitamente como no verificado end-to-end, en vez de asumir que funciona.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/AdminPanel.jsx
git commit -m "feat(frontend): integrar sanción manual de titulares en el panel de admin"
```
