# Perfil de jugador (datos personales, estado físico y habilidades) — Diseño

Fecha: 2026-08-13

## 1. Contexto y objetivo

Hoy el jugador solo puede fijar su posición principal/secundaria (feature previa, ver `2026-08-12-posiciones-jugador-design.md`). Se necesita una pantalla de "Mi Perfil" donde el jugador complete voluntariamente más datos sobre sí mismo: su nombre real para mostrar, fecha de nacimiento (para calcular edad), y una autoevaluación de su nivel de juego (resistencia, ritmo de juego, y 6 habilidades numéricas). Esta información sirve para que cualquier jugador pueda conocer con quién va a compartir la cancha, y para que el admin pueda usarla a futuro al armar equipos.

## 2. Alcance de esta spec

Cubre: columnas nuevas en `Usuarios`, catálogos de resistencia y ritmo de juego, endpoint para editar el propio perfil completo, endpoint para consultar (de solo lectura, con vista restringida) el perfil de cualquier otro jugador, cálculo de edad, y las dos pantallas de frontend (`Perfil` editable y `PerfilJugador` de solo lectura) más el link desde `ListaJugadores`.

No cubre: que estos datos sean obligatorios para anotarse a un partido (siguen siendo opcionales, a diferencia de la posición), edición de estos campos por parte del admin, historial de cambios, ni que las habilidades influyan en ninguna lógica de armado de equipos/cupos (por ahora es puramente informativo). Tampoco incluye tests automatizados (preferencia ya establecida del usuario para este proyecto).

## 3. Decisiones clave (resueltas en brainstorming)

- **Almacenamiento**: columnas planas en `Usuarios`, mismo patrón que `posicionPrincipal`/`posicionSecundaria`. Se descartó una tabla `PerfilesJugador` separada (relación siempre 1:1, solo agrega joins) y una columna JSON única (pierde tipado/validación a nivel SQL).
- **Nombre a mostrar**: columna nueva `nombreCompleto`, independiente de `nombre` (la que ya llega de Google/registro). Si `nombreCompleto` es `NULL`, se sigue mostrando `nombre` en todos lados (roster, anotación, etc.) — no se toca ningún lugar que hoy lee `nombre`.
- **Posiciones**: el formulario de perfil reutiliza los campos `posicionPrincipal`/`posicionSecundaria` que ya existen, sin cambios de esquema ni de catálogo.
- **Habilidades numéricas**: escala 0 a 100, enteros, nullable.
- **Resistencia y ritmo de juego**: catálogos cerrados (enums de texto), mismo patrón que el catálogo de posiciones.
- **Edad**: se deriva de `fechaNacimiento` en el service (no se guarda como columna separada).
- **Obligatoriedad y acceso**: a diferencia de la posición, este perfil es 100% opcional. Se accede vía un link "Mi Perfil" en `Home.jsx`, sin modal forzado ni bloqueo de ninguna acción si queda incompleto.
- **Visibilidad**: a diferencia de las habilidades, que son autoevaluación personal, cualquier jugador logueado puede ver el perfil completo (edad, resistencia, ritmo, habilidades) de cualquier otro jugador — no solo el propio o el admin. Para eso, el endpoint de consulta ajena expone una vista restringida (sin `email`, `rol`, `estaSancionado`, `fechaCreacion` ni la fecha de nacimiento cruda — solo la edad calculada).

## 4. Backend

### Esquema (`schema.sql` + migración en `db.js`)

`Usuarios` gana:
```sql
nombreCompleto TEXT,
fechaNacimiento TEXT,
resistencia TEXT,
ritmoJuego TEXT,
velocidad INTEGER,
pegada INTEGER,
tocaPase INTEGER,
gambeta INTEGER,
marcaDefensa INTEGER,
fisico INTEGER
```

Todas nullable, sin `CHECK` a nivel SQL (la validación de enums/rangos vive en el service, igual que las posiciones). En `db.js`, se extiende el mismo bloque de `PRAGMA table_info(Usuarios)` que ya agrega `posicionPrincipal`/`posicionSecundaria`, agregando estas 10 columnas a la lista de columnas a verificar/crear con `ALTER TABLE ... ADD COLUMN` si faltan.

### Catálogos nuevos

`backend/src/constants/resistencia.js`:
```js
const RESISTENCIA = ['partido_completo', 'medio_partido', 'un_rato', 'no_corro'];

function esResistenciaValida(valor) {
  return valor === null || valor === undefined || RESISTENCIA.includes(valor);
}

module.exports = { RESISTENCIA, esResistenciaValida };
```

`backend/src/constants/ritmoJuego.js`:
```js
const RITMO_JUEGO = ['juego_seguido', 'juego_poco', 'nunca_juego'];

function esRitmoJuegoValido(valor) {
  return valor === null || valor === undefined || RITMO_JUEGO.includes(valor);
}

module.exports = { RITMO_JUEGO, esRitmoJuegoValido };
```

Ambos catálogos tratan `null`/`undefined` como válido porque el perfil es opcional: el jugador puede guardar solo algunos campos.

### Validación de habilidades numéricas

Nueva función local en `usuariosService.js`, `esHabilidadValida(valor)`: acepta `null`/`undefined`, o un entero entre 0 y 100 inclusive (rechaza decimales y valores fuera de rango). Se aplica a las 6 habilidades.

### Validación de fecha de nacimiento

Acepta `null`/`undefined`, o un string parseable como fecha (`YYYY-MM-DD`) que no sea futura. Si es inválida → error 400 ("Fecha de nacimiento inválida").

### `usuariosService.js`

Nueva función `actualizarPerfil(uid, datos)`:
1. Extrae del body: `nombreCompleto`, `fechaNacimiento`, `posicionPrincipal`, `posicionSecundaria`, `resistencia`, `ritmoJuego`, `velocidad`, `pegada`, `tocaPase`, `gambeta`, `marcaDefensa`, `fisico`.
2. Valida cada campo presente (posiciones con `sonPosicionesValidas` solo si se envían ambas; resistencia/ritmo con sus validadores; habilidades con `esHabilidadValida`; fecha con el validador de fecha) → error 400 con mensaje específico si algo es inválido.
3. Un solo `UPDATE Usuarios SET ... WHERE uid = ?` con todos los campos.
4. Devuelve el usuario actualizado (mismo shape que `obtenerUsuario`).

Nueva función `obtenerPerfilPublico(uid)`:
1. Busca el usuario por `uid` (404 si no existe).
2. Calcula `edad` a partir de `fechaNacimiento` (o `null` si no la tiene): años completos entre esa fecha y la fecha actual (`hoy.getFullYear() - nacimiento.getFullYear()`, restando 1 si todavía no pasó el cumpleaños de este año).
3. Devuelve solo: `uid`, `nombre`, `nombreCompleto`, `edad`, `posicionPrincipal`, `posicionSecundaria`, `resistencia`, `ritmoJuego`, `velocidad`, `pegada`, `tocaPase`, `gambeta`, `marcaDefensa`, `fisico`. No incluye `email`, `rol`, `estaSancionado`, `fechaCreacion`, `passwordHash`, ni `fechaNacimiento` cruda.

`filaAUsuario` no cambia para el resto de los endpoints (sigue spreadeando todas las columnas menos `passwordHash`, así que el propio usuario sigue viendo su `fechaNacimiento` completa en `/auth/sync`, `/auth/login`, y en la respuesta de `actualizarPerfil`).

### `usuariosController.js` + `usuariosRoutes.js`

```js
async function actualizarMiPerfil(req, res) {
  const usuario = await usuariosService.actualizarPerfil(req.usuario.uid, req.body);
  res.json(usuario);
}

async function obtenerPerfilDeJugador(req, res) {
  const perfil = await usuariosService.obtenerPerfilPublico(req.params.uid);
  res.json(perfil);
}
```

Nuevas rutas en `usuariosRoutes.js`:
```
PATCH /api/usuarios/me/perfil     (verificarToken)
GET   /api/usuarios/:uid/perfil   (verificarToken)
```

El endpoint existente `PATCH /api/usuarios/me/posiciones` no se modifica ni se elimina: sigue siendo usado por el modal obligatorio de setup y por la confirmación al anotarse.

## 5. Frontend

### Catálogos nuevos

`frontend/src/constants/resistencia.js`:
```js
export const RESISTENCIA = [
  { valor: 'partido_completo', etiqueta: 'Todo el partido' },
  { valor: 'medio_partido', etiqueta: 'Medio partido' },
  { valor: 'un_rato', etiqueta: 'Un rato y me canso' },
  { valor: 'no_corro', etiqueta: 'No sé si puedo correr siquiera' },
];

export function etiquetaResistencia(valor) {
  return RESISTENCIA.find((r) => r.valor === valor)?.etiqueta || 'Sin dato';
}
```

`frontend/src/constants/ritmoJuego.js`:
```js
export const RITMO_JUEGO = [
  { valor: 'juego_seguido', etiqueta: 'Juego seguido' },
  { valor: 'juego_poco', etiqueta: 'Juego poco' },
  { valor: 'nunca_juego', etiqueta: 'Nunca juego' },
];

export function etiquetaRitmoJuego(valor) {
  return RITMO_JUEGO.find((r) => r.valor === valor)?.etiqueta || 'Sin dato';
}
```

### `AuthContext.jsx`

Nuevo método `actualizarMiPerfil(datos)`, mismo patrón que `actualizarPosicionesPerfil`: hace `PATCH /usuarios/me/perfil` con `datos` y `setPerfil(data)` con la respuesta.

### `frontend/src/pages/Perfil.jsx` (nueva)

Formulario controlado, prellenado desde `perfil` (del `AuthContext`):
- Nombre completo: `<input type="text">`.
- Fecha de nacimiento: `<input type="date">`.
- Posición principal / secundaria: dos `<select>` con `POSICIONES` (mismo catálogo que `ModalPosicion`).
- Resistencia: `<select>` con `RESISTENCIA`.
- Ritmo de juego: `<select>` con `RITMO_JUEGO`.
- Las 6 habilidades (`velocidad`, `pegada`, `tocaPase`, `gambeta`, `marcaDefensa`, `fisico`): `<input type="range" min="0" max="100">` con el valor numérico visible al lado.

Botón "Guardar" llama a `actualizarMiPerfil(datos)`; muestra estado de guardado/error inline (mismo patrón visual que el resto del formulario de la app).

### `frontend/src/pages/PerfilJugador.jsx` (nueva, solo lectura)

- Lee `:uid` de la URL, hace `GET /usuarios/:uid/perfil` al montar.
- Muestra: nombre (o nombreCompleto si existe), edad, posiciones, resistencia, ritmo de juego, y las 6 habilidades (ej. como barras o números simples).
- Estados de carga y error (404 si el uid no existe) siguiendo el mismo patrón que el resto de las páginas.

### `App.jsx`

Dos rutas nuevas, protegidas por `RutaPrivada`:
```
/perfil          -> Perfil.jsx
/jugadores/:uid  -> PerfilJugador.jsx
```

### `Home.jsx`

Se agrega un link "Mi Perfil" (navega a `/perfil`) en el header/nav existente, junto a los otros controles de sesión.

### `ListaJugadores.jsx`

El nombre de cada jugador (titulares y suplentes) pasa de texto plano a `<Link to={`/jugadores/${jugador.usuarioId}`}>`, manteniendo el estilo visual actual.

## 6. No incluido (fuera de alcance)

- Obligatoriedad de completar el perfil para anotarse a un partido.
- Edición de estos campos por parte del admin sobre otros jugadores.
- Historial de cambios del perfil.
- Cualquier efecto de resistencia/ritmo/habilidades sobre cupos, armado de equipos o algoritmos de asignación.
- Tests automatizados (por preferencia ya establecida del usuario para este proyecto).
