# Multi Tenant: Sistema de Grupos (Ligas)

**Fecha:** 2026-08-17
**Estado:** Aprobado para plan de implementación

## 1. Objetivo

Convertir FurboApp de single-tenant a multi-tenant mediante un concepto de **Grupo** (ej. "Fútbol de los Jueves"). La app sigue siendo una sola instancia, pero cada Grupo compartimenta sus propios partidos, inscripciones, resultados, votaciones y sanciones. Un usuario puede pertenecer a varios Grupos.

## 2. Flujo de usuario

1. Usuario se loguea (Google o password) — igual que hoy, identidad global.
2. Si no pertenece a ningún Grupo: pantalla con dos opciones:
   - **Crear un Grupo nuevo**: ingresa nombre → se crea el Grupo, el usuario queda como `admin` de ese Grupo, se genera un código de invitación único (ej. `JUEVES-A1B2`).
   - **Unirme a un Grupo**: ingresa el código de invitación → se une directo (sin aprobación) como `jugador` de ese Grupo.
3. Si pertenece a uno o más Grupos: se selecciona un "Grupo activo" (persistido en el cliente). Un selector en la navegación permite cambiar de Grupo activo o crear/unirse a otro en cualquier momento.
4. Toda la operatoria de partidos (ver próximo partido, anotarse, bajarse, sanciones, resultados, votación) queda scopeada al Grupo activo.

## 3. Modelo de datos

### Tabla nueva: `Grupos`
| Campo | Tipo | Notas |
|---|---|---|
| id | TEXT PK | `crypto.randomUUID()` |
| nombre | TEXT NOT NULL | |
| codigoInvitacion | TEXT UNIQUE NOT NULL | Generado: slug del nombre (mayúsculas, máx 10 chars) + `-` + 4 alfanuméricos random. Retry en colisión. |
| creadoPor | TEXT NOT NULL REFERENCES Usuarios(uid) | |
| fechaCreacion | TEXT NOT NULL | ISO 8601 |

### Tabla nueva: `UsuariosGrupos` (membresía)
| Campo | Tipo | Notas |
|---|---|---|
| id | TEXT PK | |
| grupoId | TEXT NOT NULL REFERENCES Grupos(id) | |
| usuarioId | TEXT NOT NULL REFERENCES Usuarios(uid) | |
| rol | TEXT NOT NULL CHECK IN ('admin','jugador') | Admin de ESE grupo, no global |
| estaSancionado | INTEGER NOT NULL DEFAULT 0 | Sanción es por grupo |
| fechaIngreso | TEXT NOT NULL | ISO 8601 |

Índice único `(grupoId, usuarioId)`.

### Tabla `Usuarios` (cambios)
- **Se elimina** `rol` (pasa a ser por-grupo, vive en `UsuariosGrupos`).
- **Se elimina** `estaSancionado` (pasa a ser por-grupo, vive en `UsuariosGrupos`).
- **Se agrega** `esSuperAdmin INTEGER NOT NULL DEFAULT 0`: reemplaza el concepto actual de "admin global" vía `ADMIN_EMAILS`. Se sigue seteando en `sincronizarUsuario` igual que hoy (email verificado + matchea `ADMIN_EMAILS`), pero ahora es un concepto de soporte/mantenimiento separado del rol de grupo. Un super admin actúa como admin en cualquier Grupo sin necesidad de membresía.

Nota de migración: dado que SQLite (better-sqlite3 embebe versión reciente) soporta `DROP COLUMN`, se eliminan las columnas legacy tras copiar sus valores a `UsuariosGrupos`/`esSuperAdmin`. Si en la práctica `DROP COLUMN` da problemas por triggers/índices heredados, alternativa de bajo riesgo es dejar las columnas sin uso (ignoradas por el código) en vez de bloquear la migración — decisión a tomar en implementación si surge el problema.

### Tabla `Partidos` (cambio)
- Se agrega `grupoId TEXT NOT NULL REFERENCES Grupos(id)`.

### Resto de tablas (Inscripciones, Resultados, Goles, RendimientosJugador, VotosMvp, SancionesPartido)
Sin cambio de columnas. Quedan scopeadas indirectamente vía `partidoId → Partidos.grupoId`. Los controladores deben validar que el `partidoId` de la URL pertenece al `grupoId` de la URL.

## 4. Migración de datos existentes

Al iniciar con el schema nuevo (una vez, en `db.js`, siguiendo el patrón actual de migraciones ad-hoc con `ALTER TABLE` idempotentes):

1. Si no existe ningún Grupo, crear uno `"Legado"` con `codigoInvitacion` generado y `creadoPor` = el primer usuario con `rol = 'admin'` encontrado (o el usuario más antiguo si no hay ninguno).
2. Asignar `grupoId` de ese Grupo "Legado" a todos los `Partidos` existentes (columna nueva, backfill).
3. Insertar en `UsuariosGrupos` una fila por cada `Usuario` existente, con ese `grupoId`, copiando su `rol` y `estaSancionado` actuales.
4. Copiar el valor actual de `rol = 'admin'` (originado en `ADMIN_EMAILS`) a `esSuperAdmin` para esos usuarios — así nadie pierde su nivel de acceso de soporte tras la migración.

Nadie pierde acceso ni historial (partidos jugados, goles, votos MVP, sanciones).

## 5. API

### Grupos (nuevas rutas, no anidadas)
- `POST /api/grupos` — body `{nombre}`. Crea Grupo, el usuario autenticado queda `admin` en `UsuariosGrupos`. Devuelve el Grupo incluyendo `codigoInvitacion`.
- `POST /api/grupos/unirse` — body `{codigoInvitacion}`. Si el código existe y el usuario no es ya miembro, inserta membresía `rol: 'jugador'`. 404 si el código no existe. 409 si ya es miembro.
- `GET /api/grupos/mios` — lista los Grupos donde el usuario autenticado tiene membresía (id, nombre, rol, y `codigoInvitacion` solo si es admin de ese grupo).

### Rutas existentes: se anidan bajo `/api/grupos/:grupoId/...`
- `GET /api/grupos/:grupoId/partidos`
- `POST /api/grupos/:grupoId/partidos` (admin del grupo)
- `POST /api/grupos/:grupoId/partidos/:partidoId/anotarse`
- `POST /api/grupos/:grupoId/partidos/:partidoId/bajarse`
- `DELETE /api/grupos/:grupoId/partidos/:partidoId`
- `GET /api/grupos/:grupoId/usuarios/sancionados` (admin del grupo)
- `POST /api/grupos/:grupoId/usuarios/:uid/perdonar` (admin del grupo)
- Resultados, Goles, Votos, Rendimientos (rutas actuales de esos recursos, hoy colgadas de partidos): se anidan igual, bajo `/api/grupos/:grupoId/partidos/:partidoId/...`.

### Rutas que quedan globales (sin cambio)
- `POST /api/auth/sync`, `POST /api/auth/register`, `POST /api/auth/login`
- `PATCH /api/usuarios/me/posiciones`, `PATCH /api/usuarios/me/perfil`, `POST /api/usuarios/me/foto`, `GET /api/usuarios/:uid/perfil-publico`

### Middleware nuevo: `verificarMiembroGrupo(rolRequerido)`
Se ejecuta después de `verificarToken`. Lee `req.params.grupoId`:
- Si `req.usuario` tiene `esSuperAdmin`, deja pasar con `req.miembro = { grupoId, rol: 'admin', estaSancionado: false }` sin consultar `UsuariosGrupos`.
- Si no, busca fila en `UsuariosGrupos` para `(grupoId, uid)`. Si no existe → 403 "No pertenecés a este grupo". Si existe, inyecta `req.miembro = {grupoId, rol, estaSancionado}`.
- Si `rolRequerido === 'admin'` y `req.miembro.rol !== 'admin'` → 403.

`verificarAdmin` actual (chequea `Usuarios.rol`) se reemplaza por este middleware en las rutas anidadas.

## 6. Frontend

### `GrupoContext` (nuevo, junto a `AuthContext`)
Estado: `misGrupos` (array), `grupoActivo` (objeto o null), `cargandoGrupos`.
Acciones: `crearGrupo(nombre)`, `unirseAGrupo(codigo)`, `seleccionarGrupo(grupoId)`.
Persistencia: `grupoActivo.id` en `localStorage` (preferencia de cliente, no hay estado de sesión server-side). Al cargar, si el id guardado ya no está en `misGrupos` (ej. el usuario fue eliminado del grupo — fuera de alcance de esta spec, no hay feature de "expulsar"), cae al primer grupo de la lista o a null.

### Flujo de UI
- 0 grupos → pantalla `SeleccionarGrupoPage` con dos acciones (crear / unirse), sin acceso a partidos.
- 1+ grupos → selector de grupo activo en el nav (dropdown con nombre + opción "Crear otro" / "Unirme a otro"). El resto de la app (partidos, sancionados, resultados, votación) sigue igual pero todas las llamadas Axios arman la URL con `grupoActivo.id`.
- Pantalla de "Crear grupo" muestra el código de invitación resultante con botón copiar.

### Componentes nuevos
- `SeleccionarGrupoPage`, `CrearGrupoForm`, `UnirseGrupoForm`, `SelectorGrupoActivo` (dropdown de nav).

## 7. Manejo de errores

- 403 si la URL trae un `grupoId` del que el usuario no es miembro (intento de acceso directo a datos de otro grupo).
- 404 en `POST /api/grupos/unirse` si el código no existe; validar formato antes de pegarle a la DB.
- 409 en `POST /api/grupos/unirse` si ya es miembro de ese grupo.
- Colisión de `codigoInvitacion` al generarlo: retry interno (no debería llegar nunca al usuario).
- Todas las rutas anidadas deben validar que `partidoId` (y recursos derivados) pertenecen al `grupoId` de la URL — si no, 404 (no 403, para no filtrar existencia de partidos de otros grupos).

## 8. Testing

Sin tests automáticos (acordado previamente para este proyecto salvo pedido explícito). Verificación manual post-implementación:
1. Crear Grupo A y Grupo B con dos cuentas distintas.
2. Confirmar que un partido creado en A no aparece en B.
3. Unirse a A desde una tercera cuenta con el código, confirmar que ve los partidos de A únicamente.
4. Sancionar a un usuario en A (dándose de baja), confirmar que puede anotarse sin problema en B.
5. Confirmar que el super admin (`ADMIN_EMAILS`) puede administrar cualquier grupo sin ser miembro explícito.
6. Confirmar que los datos previos a la migración (partidos, goles, votos ya cargados) siguen visibles dentro del Grupo "Legado".

## 9. Fuera de alcance (YAGNI, no en esta iteración)

- Expulsar miembros de un Grupo.
- Aprobación manual de solicitudes de unión.
- Regenerar código de invitación.
- Roles adicionales a admin/jugador dentro de un Grupo.
- Compartir un usuario "sancionado" entre grupos (la sanción es y seguirá siendo estrictamente por grupo).
