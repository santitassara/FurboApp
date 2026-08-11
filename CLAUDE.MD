# ⚽ FurboApp - Documentación Técnica y Arquitectura

## 1. Descripción General del Proyecto
**FurboApp** es una aplicación web diseñada para automatizar y simplificar la organización de partidos de fútbol amateur entre amigos. Permite a un administrador gestionar las fechas de los partidos, mientras que los jugadores pueden inscribirse utilizando su cuenta de Google. El sistema cuenta con un mecanismo de penalización automática: si un jugador se da de baja después de haberse anotado, es sancionado y no puede inscribirse en el siguiente partido hasta que un administrador le revoque la sanción.

---

## 2. Estructura del Proyecto
El repositorio debe mantener una estructura monorepo básica con dos carpetas principales en la raíz (`FurboApp/`):

```text
FurboApp/
├── backend/      # Servidor API REST (Node.js + Express)
└── frontend/     # Aplicación cliente (React.js)
```

---

## 3. Stack Tecnológico
*   **Frontend**: React.js (recomendado usar Vite), React Router, TailwindCSS (opcional pero recomendado para UI), Axios (peticiones HTTP), Firebase Client SDK (solo para Auth).
*   **Backend**: Node.js, Express.js, CORS, dotenv.
*   **Base de Datos**: SQLite (`better-sqlite3`), archivo local gestionado desde el backend (`backend/src/config/db.js`), sin dependencias cloud.
*   **Auth**: Firebase Authentication (Google Provider), verificado desde el backend mediante **Firebase Admin SDK** (`admin.auth().verifyIdToken()`). Requiere conexión a internet para validar el login con Google; esto es independiente de dónde corre la base de datos.

---

## 4. Actores y Permisos (Roles)
1.  **Administrador (Admin)**:
    *   Login con Google.
    *   Puede crear fechas de partidos.
    *   Puede anotarse para jugar.
    *   Puede ver la lista de jugadores sancionados.
    *   Puede revocar la sanción de un jugador.
2.  **Jugador**:
    *   Login con Google.
    *   Puede ver el próximo partido disponible.
    *   Puede anotarse a un partido (si no está sancionado).
    *   Puede darse de baja de un partido (esto acciona la sanción automática).

---

## 5. Modelo de Datos (SQLite)

### Tabla: `Usuarios`
*   `uid` (TEXT, PK, ID de Google)
*   `nombre` (TEXT)
*   `email` (TEXT, UNIQUE)
*   `rol` (TEXT: "admin" | "jugador")
*   `estaSancionado` (INTEGER, 0/1)
*   `fechaCreacion` (TEXT, ISO 8601)

### Tabla: `Partidos`
*   `id` (TEXT, PK, generado con `crypto.randomUUID()`)
*   `fecha` (TEXT, ISO 8601)
*   `estado` (TEXT: "abierto" | "cerrado" | "jugado")
*   `creadoPor` (TEXT, uid del Admin)
*   `cupoTitulares` (INTEGER)
*   `cupoSuplentes` (INTEGER)

### Tabla: `Inscripciones`
*   `id` (TEXT, PK, generado con `crypto.randomUUID()`)
*   `partidoId` (TEXT, FK -> Partidos)
*   `usuarioId` (TEXT, FK -> Usuarios)
*   `estado` (TEXT: "anotado" | "dado_de_baja")
*   `tipo` (TEXT: "titular" | "suplente")
*   `orden` (INTEGER)
*   `fechaInscripcion` (TEXT, ISO 8601)

---

## 6. Diseño de la API (Backend - Node.js)
Todas las rutas (excepto validaciones públicas si las hubiera) deben estar protegidas por un Middleware `verificarToken` que valide el Bearer token de Google usando `firebase-admin`.

### Auth & Usuarios
*   `POST /api/auth/sync`: Recibe el token. El backend verifica si el usuario existe en Firestore. Si no, lo crea con rol "jugador" y `estaSancionado: false`.
*   `GET /api/usuarios/sancionados`: (Solo Admin) Retorna lista de jugadores con `estaSancionado: true`.
*   `POST /api/usuarios/:uid/perdonar`: (Solo Admin) Pone `estaSancionado: false` al usuario.

### Partidos
*   `GET /api/partidos`: Retorna los partidos con estado "abierto".
*   `POST /api/partidos`: (Solo Admin) Crea una nueva fecha de partido. Body: `{ fecha }`.

### Inscripciones (Flujo principal de la app)
*   `POST /api/partidos/:partidoId/anotarse`: 
    *   Verifica si el usuario está sancionado. Si lo está -> Error 403.
    *   Si no, crea/actualiza registro en `Inscripciones` a "anotado".
*   `POST /api/partidos/:partidoId/bajarse`:
    *   Busca la inscripción del usuario.
    *   Cambia estado a "dado_de_baja".
    *   **CRÍTICO:** Actualiza el perfil del usuario en Firestore seteando `estaSancionado: true`.

---

## 7. Flujo de Autenticación (Explicado para los Agentes)
1. El frontend (React) ejecuta `signInWithPopup(auth, googleProvider)`.
2. React obtiene el `idToken` y se lo envía al backend (Axios -> header `Authorization: Bearer <TOKEN>`).
3. El middleware en Express usa `admin.auth().verifyIdToken(token)`.
4. Si es válido, inyecta `req.usuario` en el controlador y permite la operación en Firestore.

---

## 8. Guía de Buenas Prácticas e Instrucciones para Agentes de IA
Al desarrollar el código a partir de este documento, los agentes deben seguir estas directrices:
1.  **Arquitectura Limpia en Node.js**: Dividir responsabilidades en `/routes`, `/controllers`, `/middlewares` (para el token de Firebase y roles) y `/services` (para la lógica de base de datos).
2.  **Variables de Entorno**: Nunca hardcodear credenciales. Usar `.env` en backend (`FIREBASE_SERVICE_ACCOUNT`) y `.env` en frontend (`VITE_FIREBASE_API_KEY`, etc.).
3.  **Manejo de Errores**: Usar bloques `try/catch` en los controladores y devolver códigos HTTP adecuados (401 No Autorizado, 403 Prohibido, 400 Bad Request, 500 Error de Servidor).
4.  **Validación de Datos**: Validar los cuerpos de las peticiones antes de interactuar con la base de datos (por ejemplo, comprobar que la fecha del partido sea válida).
5.  **Componentización en React**: Crear componentes reutilizables (Ej: `Botón`, `TarjetaPartido`, `ModalConfirmacionSancion`).
6.  **Estado Global vs Local**: Usar un contexto (`AuthContext`) en React para mantener el estado del usuario logueado en toda la aplicación.