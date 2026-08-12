# Login con usuario y contraseña (JWT)

**Fecha:** 2026-08-12
**Estado:** Aprobado por el usuario, pendiente de plan de implementación.

## Objetivo

Hoy el único método de login es Google (Firebase Auth). Se agrega un método
alternativo de login con email/contraseña, emitiendo un JWT propio del
backend. Ambos métodos coexisten: un usuario puede loguearse con Google, con
contraseña, o eventualmente con ambos sobre la misma cuenta.

## 1. Modelo de datos

- **Tabla `Usuarios`**: se agrega columna `passwordHash TEXT` (nullable).
  - Usuarios creados por Google: `passwordHash = NULL`.
  - Usuarios creados por registro con contraseña: `passwordHash` seteado.
- **Migración**: `db.js` debe seguir soportando bases de datos SQLite ya
  existentes (creadas antes de este cambio). Como `CREATE TABLE IF NOT
  EXISTS` no altera tablas ya creadas, se agrega una migración manual:
  - Chequear `PRAGMA table_info(Usuarios)`.
  - Si no existe la columna `passwordHash`, ejecutar
    `ALTER TABLE Usuarios ADD COLUMN passwordHash TEXT`.
  - `schema.sql` también se actualiza para incluir `passwordHash TEXT` en el
    `CREATE TABLE`, para que las bases nuevas ya nazcan con la columna.

## 2. Backend — endpoints y lógica

### Nuevas dependencias
- `jsonwebtoken` (firmar/verificar JWT propio).
- `bcryptjs` (hash de contraseñas; se elige la variante pura JS para evitar
  compilación nativa adicional).

### Nueva env var
- `JWT_SECRET` en `backend/.env`.

### `POST /api/auth/register` (público, sin `verificarToken`)
Body: `{ nombre, email, password }`.

Validaciones (400 si fallan):
- `nombre`, `email`, `password` presentes.
- `email` con formato válido (regex simple), normalizado a lowercase.
- `password` con largo mínimo 6.

Lógica:
1. Buscar usuario existente por `email`.
2. Si existe y ya tiene `passwordHash` seteado → 409 "El email ya está
   registrado".
3. Si existe pero `passwordHash` es `NULL` (cuenta creada por Google) →
   asociarle la contraseña a esa cuenta existente (linking): actualizar
   `passwordHash`. No se toca `rol` ni `estaSancionado`.
4. Si no existe → crear usuario nuevo:
   - `uid`: `crypto.randomUUID()`.
   - `rol`: siempre `'jugador'` (ver sección de seguridad — nunca admin vía
     registro por contraseña, sin importar `ADMIN_EMAILS`).
   - `estaSancionado`: `false`.
   - `fechaCreacion`: ISO 8601 actual.
   - `passwordHash`: hash de la contraseña con bcrypt.
5. Firmar JWT (ver abajo) y responder `{ token, usuario }`.

### `POST /api/auth/login` (público, sin `verificarToken`)
Body: `{ email, password }`.

Lógica:
1. Buscar usuario por `email` (normalizado a lowercase).
2. Si no existe, o `passwordHash` es `NULL` (cuenta solo-Google), o
   `bcrypt.compare` falla → 401 con mensaje genérico `"Credenciales
   inválidas"` (no distinguir el motivo, para no filtrar qué emails
   existen).
3. Si coincide → firmar JWT y responder `{ token, usuario }`.

### JWT propio
- Payload: `{ uid, email, nombre }`.
- Firma: `jwt.sign(payload, JWT_SECRET, { algorithm: 'HS256', expiresIn:
  '7d' })`. Token único de larga duración, sin refresh tokens (igual de
  "duro" que la sesión persistente que ya da Firebase).

### `verificarToken` (middleware unificado)
Se modifica para soportar ambos tipos de token sin cambiar ninguna otra
ruta protegida:

1. Extraer el Bearer token como hoy.
2. Intentar verificarlo como JWT propio:
   `jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] })`
   (algoritmo fijado explícitamente para evitar ataques de confusión de
   algoritmo). Si es válido, `req.usuario = { uid, email, nombre,
   emailVerificado: true }` y `next()`.
3. Si falla la verificación como JWT propio, intentar como hoy con
   `admin.auth().verifyIdToken(token)` (Firebase). Si es válido, seguir como
   está implementado actualmente.
4. Si ninguna de las dos verificaciones es válida → 401 "Token inválido".

De esta forma `/api/auth/sync` y todas las rutas de partidos/inscripciones/
admin funcionan igual sin importar el método de login usado.

### Refactor menor
- Extraer de `usuariosService.js` la lógica `obtenerAdminEmails()` /
  chequeo de admin a un helper compartido `esEmailAdmin(email)`, reutilizado
  tanto por `sincronizarUsuario` (Google) como por la lógica de creación en
  `register`.

## 3. Seguridad

- **Algoritmo JWT fijo** al verificar (`algorithms: ['HS256']`), para que un
  token con `alg: none` u otro algoritmo no sea aceptado.
- **Rol admin nunca vía password**: el registro por contraseña siempre crea
  `rol: 'jugador'`, sin excepción. El chequeo de `ADMIN_EMAILS` que hoy
  existe para Google depende de `emailVerificado === true`, garantizado
  porque Google verificó la casilla. Con contraseña, cualquiera puede
  escribir el email que quiera sin probar que es dueño de esa casilla, así
  que otorgar admin ahí sería un agujero de seguridad. El rol admin solo se
  obtiene vía Google (como ya funciona) o promoviendo manualmente al
  usuario.
- **Hash de contraseñas** con `bcryptjs`, costo estándar de la librería.
- **Mensajes de error de login genéricos**, sin distinguir "no existe el
  email" de "contraseña incorrecta".

### Explícitamente fuera de alcance (YAGNI)
- Recuperación / reseteo de contraseña.
- Verificación de email para cuentas creadas por contraseña.
- Rate limiting / protección anti brute-force en `/login`.
- Refresh tokens (se usa un único JWT de larga duración).

Estas quedan afuera por decisión explícita; si en el futuro importa el
brute-force, se puede agregar un rate limiter sin rediseñar nada de lo
anterior.

## 4. Frontend

- **`Login.jsx`**: se agrega un formulario de email/contraseña junto al
  botón de Google existente, con un toggle "¿No tenés cuenta? Registrate"
  que además muestra el campo `nombre` y confirmación de contraseña.
- **`AuthContext.jsx`**:
  - Nuevas funciones `iniciarSesionConPassword(email, password)` y
    `registrarse(nombre, email, password)`, que llaman a `/auth/login` /
    `/auth/register`, guardan el JWT recibido en `localStorage` (clave
    `furboapp_token`) y setean `perfil` directamente con la respuesta.
  - Al montar el provider: si hay token en `localStorage` y no hay sesión
    de Firebase activa, se llama a `/auth/sync` (que ya sincroniza/devuelve
    el perfil) para validar el token y restaurar la sesión. Si responde 401,
    se limpia el `localStorage`.
  - `cerrarSesion` limpia ambos: `signOut(auth)` de Firebase (si aplica) y
    el token propio de `localStorage`.
- **`api.js`**: el interceptor de request usa el token de Firebase si hay
  `auth.currentUser`; si no, usa el JWT de `localStorage`.
- No se modifican `RutaPrivada` / `RutaAdmin` — siguen gateando por
  `perfil` / `esAdmin`, que ya funcionan igual sin importar el método de
  login.

## Nota sobre testing

Por pedido explícito del usuario, esta implementación **no incluye tests
automatizados**.
