# Votación de Equipos Posibles — Diseño

## 1. Contexto y objetivo

Hoy, cuando se completa el cupo de titulares de un partido (`ocupados.titulares >= cupoTitulares`), el admin arma la formación (auto-shuffle balanceado por habilidad o drag&drop manual en `MapaCancha.jsx`) y la guarda directo como oficial (`PUT /:partidoId/formacion`), sin que los jugadores opinen.

Este diseño agrega un paso intermedio opcional: el admin puede generar hasta **5 propuestas de equipos** (cada una, un snapshot del armado en `MapaCancha` en ese momento) y publicarlas para que los **titulares voten** cuál prefieren. La propuesta más votada se aplica como formación oficial. El admin sigue pudiendo editar la formación oficial después, igual que hoy.

No se reemplaza nada del armador existente (`inscripcionesService.js`, `formacion.js`, `data/formaciones.js`, `MapaCancha.jsx`): la votación es una capa encima.

## 2. Elegibilidad y habilitación

Reutiliza la condición `habilitado` ya calculada (`ocupados.titulares >= partido.cupoTitulares`).

- **Proponer**: solo admin del grupo (`verificarMiembroGrupo('admin')`), solo si `habilitado`, si `votacionEquiposCerrada = 0`, y hay menos de 5 propuestas vivas para ese partido.
- **Votar**: solo titulares con `Inscripciones.estado = 'anotado'` y `tipo = 'titular'` en ese partido (incluye al admin si él mismo está anotado como titular). Un voto por titular, puede cambiarlo mientras la votación esté abierta.
- Si el cupo deja de estar completo (baja de un titular) antes de que cierre la votación, se descartan todas las propuestas y votos del partido (ver §5, casos borde) y hay que volver a proponer cuando se re-complete.

## 3. Modelo de datos

```sql
CREATE TABLE IF NOT EXISTS FormacionesPropuestas (
  id TEXT PRIMARY KEY,
  partidoId TEXT NOT NULL REFERENCES Partidos(id),
  numero INTEGER NOT NULL,
  creadoPor TEXT NOT NULL REFERENCES Usuarios(uid),
  fechaCreacion TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_formaciones_propuestas_numero
  ON FormacionesPropuestas (partidoId, numero);

CREATE TABLE IF NOT EXISTS FormacionesPropuestasDetalle (
  id TEXT PRIMARY KEY,
  propuestaId TEXT NOT NULL REFERENCES FormacionesPropuestas(id),
  usuarioId TEXT NOT NULL REFERENCES Usuarios(uid),
  equipo TEXT NOT NULL CHECK (equipo IN ('A','B')),
  linea TEXT,
  ordenLinea INTEGER,
  lado TEXT
);
CREATE INDEX IF NOT EXISTS idx_formaciones_propuestas_detalle_propuesta
  ON FormacionesPropuestasDetalle (propuestaId);

CREATE TABLE IF NOT EXISTS VotosFormacion (
  id TEXT PRIMARY KEY,
  partidoId TEXT NOT NULL REFERENCES Partidos(id),
  usuarioId TEXT NOT NULL REFERENCES Usuarios(uid),
  propuestaId TEXT NOT NULL REFERENCES FormacionesPropuestas(id),
  fecha TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_votos_formacion_unico ON VotosFormacion (partidoId, usuarioId);
CREATE INDEX IF NOT EXISTS idx_votos_formacion_propuesta ON VotosFormacion (propuestaId);
```

`Partidos` agrega dos columnas (mismo patrón `ALTER TABLE` in caliente que el resto de `db.js`):

```sql
ALTER TABLE Partidos ADD COLUMN votacionEquiposCerrada INTEGER NOT NULL DEFAULT 0;
ALTER TABLE Partidos ADD COLUMN propuestaGanadoraId TEXT REFERENCES FormacionesPropuestas(id);
```

Decisiones de modelado:
- `FormacionesPropuestasDetalle` copia el shape de las columnas relevantes de `Inscripciones` (equipo/linea/ordenLinea/lado) al momento de proponer — es una foto, no referencia viva.
- Borrado de partido agrega limpieza de `VotosFormacion` → `FormacionesPropuestasDetalle` → `FormacionesPropuestas` (mismo lugar donde hoy se limpian `Resultados`/`Goles`/etc.).

## 4. API

Todas las rutas nuevas anidan bajo `/api/grupos/:grupoId/partidos/:partidoId/formaciones-propuestas` y usan `verificarMiembroGrupo` (con o sin `'admin'` según el caso).

### `POST /formaciones-propuestas` (admin)
Sin body. Lee la formación actual de `Inscripciones` para ese partido y crea una nueva fila en `FormacionesPropuestas` (siguiente `numero` libre) + su detalle. Errores: 400 si `!habilitado`, 400 si ya hay 5 propuestas, 400 si `votacionEquiposCerrada`.

El frontend garantiza que "lo que hay en `Inscripciones`" y "lo que se ve en pantalla en `MapaCancha`" sean lo mismo en el momento de proponer: antes de llamar a este endpoint, guarda primero la formación actual (mismo `PUT /formacion` que usa el botón "Guardar formación"). Así la propuesta es siempre un snapshot fiel del armado en pantalla, sin perder cambios sin guardar.

### `GET /formaciones-propuestas` (cualquier miembro)
```json
{
  "votacionEquiposCerrada": false,
  "propuestaGanadoraId": null,
  "miVoto": "propuestaId" | null,
  "propuestas": [
    {
      "id": "...", "numero": 1, "votos": 3,
      "equipoA": [{ "usuarioId": "...", "nombre": "...", "posicionPrincipal": "..." }],
      "equipoB": [ ... ]
    }
  ]
}
```
`miVoto` solo se informa si `req.usuario` es titular elegible; si no, `null`. `votos` es el conteo de `VotosFormacion` por propuesta.

### `DELETE /formaciones-propuestas/:propuestaId` (admin)
Borra la propuesta, su detalle y los votos asociados. Error 400 si `votacionEquiposCerrada`.

### `POST /formaciones-propuestas/:propuestaId/votar` (titular elegible)
Sin body (la propuesta va en la URL). Upsert en `VotosFormacion` por `(partidoId, usuarioId)`. Error 403 si el usuario no es titular activo del partido. Error 400 si `votacionEquiposCerrada` o si `propuestaId` no pertenece al partido.

Efecto secundario: tras registrar el voto, si el conteo de votos emitidos == cantidad de titulares elegibles actuales, cierra automáticamente (misma lógica que el cierre manual, ver abajo).

### `POST /formaciones-propuestas/cerrar` (admin)
Cierre manual. Toma la propuesta con más votos (empate → menor `numero`); error 400 si no hay ninguna propuesta con al menos un voto. Aplica: copia `FormacionesPropuestasDetalle` de la ganadora a `Inscripciones` (mismo criterio que ya usa `guardarFormacion`, dentro de una transacción), setea `votacionEquiposCerrada = 1` y `propuestaGanadoraId`.

## 5. Frontend

### `MapaCancha.jsx`
- Tercer botón "Proponer para votación" junto a los dos existentes, visible si `esAdmin && habilitado && !votacionEquiposCerrada && propuestas.length < 5`.
- Nueva prop opcional `previewPropuesta` (array de asientos). Si viene seteada: renderiza esos asientos en vez de la formación oficial, fuerza modo solo lectura (sin drag&drop ni botones admin) y muestra un banner "Vista previa: Equipos posibles N — Volver a formación oficial" para limpiar el preview.

### Nuevo `EquiposPosibles.jsx`
Se monta en `Home.jsx` debajo de cada `TarjetaPartido` cuyo partido esté `habilitado` y tenga ≥1 propuesta (`GET /formaciones-propuestas`).
- Cards colapsadas "Equipos posibles 1"…N, con cantidad de votos al costado.
- Expandir card → lista simple de nombres agrupados por Equipo A / Equipo B (sin cancha visual).
- Botón "Ver en cancha" dentro de la card expandida → seteando `previewPropuesta` en el estado de `Home.jsx`, que se pasa al `MapaCancha` de ese partido (no se crea ninguna vista de cancha nueva).
- Botón "Votar esta" si el usuario es titular elegible y `!votacionEquiposCerrada`; resalta la propuesta que ya votó (`miVoto`), permite cambiar.
- Si `votacionEquiposCerrada`: badge "Ganadora" sobre `propuestaGanadoraId`, se ocultan los botones de voto, el conteo queda visible.
- Si es admin: botón "Eliminar" por card (mientras no haya cerrado).

## 6. Casos borde

- **Baja de un titular con propuestas vivas y votación abierta**: al procesar la baja (`bajarse`), si el partido tenía propuestas y no cerró votación, se borran todas las propuestas/votos de ese partido (vuelven a foja cero; el admin re-propone cuando el cupo se re-complete). Si ya había cerrado (formación oficial ya aplicada), no se toca nada — sigue el flujo normal de sanción por baja.
- **Titular vota y luego se da de baja antes del cierre**: su fila en `VotosFormacion` se borra junto con el resto de la limpieza de esa baja; ya no cuenta para el total de elegibles.
- **Cero votos al momento del cierre manual**: error 400, no hay ganadora que aplicar.
- **Grupo con un solo titular**: vota una vez y cierra automático en el acto.
- **Admin edita la formación oficial después del cierre**: sin restricciones nuevas — sigue usando `PUT /:partidoId/formacion` como hoy, la votación no se reabre.

## 7. Manejo de errores

Mismos patrones existentes: `crearError(mensaje, status)` + `envolverAsync` + `manejadorErrores` en el backend; `setError(err.message)` en frontend.
