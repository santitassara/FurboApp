# FurboApp — Diseño

Fecha: 2026-08-09

## 1. Contexto y objetivo

FurboApp organiza partidos de fútbol amateur entre amigos. Un admin crea fechas de partido con cupo de titulares y suplentes; los jugadores se anotan con su cuenta de Google. Si un titular se da de baja después de anotarse, queda sancionado hasta que un admin lo perdone. Este documento extiende y resuelve ambigüedades del `CLAUDE.MD` original del repo (que sigue siendo la referencia de stack y estructura general).

## 2. Alcance de esta spec

Proyecto completo desde cero: estructura monorepo (`backend/` + `frontend/`), modelo de datos en Firestore, API REST, autenticación con Google vía Firebase, y UI en React. La conexión real a un proyecto de Firebase (credenciales) la aporta el usuario después; el código queda listo para conectarse vía variables de entorno.

## 3. Decisiones clave (resueltas en brainstorming)

- **Lenguaje**: JavaScript (no TypeScript) en backend y frontend.
- **Gestor de paquetes**: npm.
- **Primer admin**: variable `ADMIN_EMAILS` (lista separada por comas) en `.env` del backend. En `POST /api/auth/sync`, si el email del usuario logueado está en esa lista, se le asigna/mantiene `rol: "admin"`.
- **Cupos por partido**: cada partido tiene `cupoTitulares` y `cupoSuplentes`, definidos por el admin al crearlo.
- **Asignación al anotarse**: si hay lugar en titulares, el jugador entra como titular; si no, y hay lugar en suplentes, entra como suplente; si ambos cupos están llenos, error 400.
- **Sanción**: solo se sanciona a quien se da de baja siendo **titular**. Un suplente que se baja libera su lugar sin sanción.
- **Promoción de suplente a titular**: NO es automática. El admin la ejecuta manualmente desde su panel cuando hay un lugar libre.
- **Testing**: tests unitarios con Jest para los controllers/services principales del backend (anotarse, bajarse, sanciones, promoción), desde el arranque del proyecto.
- **Estilo visual**: libre, ambientado en fútbol amateur argentino ("potrero nocturno de barrio"), sin usar marcas/colores de clubes reales.

## 4. Arquitectura

```
FurboApp/
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   ├── controllers/
│   │   ├── middlewares/   # verificarToken, verificarAdmin
│   │   ├── services/      # lógica de Firestore
│   │   └── config/        # inicialización firebase-admin
│   ├── tests/             # Jest
│   ├── .env.example
│   └── server.js
└── frontend/
    ├── src/
    │   ├── components/
    │   ├── pages/
    │   ├── context/        # AuthContext
    │   ├── services/       # instancia de axios
    │   └── config/         # inicialización firebase client
    ├── .env.example
    └── vite.config.js
```

Backend: Node.js + Express + CORS + dotenv + firebase-admin.
Frontend: React (Vite) + React Router + TailwindCSS + Axios + Firebase Client SDK (solo Auth).

## 5. Modelo de datos (Firestore)

### Colección `Usuarios`
- `uid` (String, PK)
- `nombre` (String)
- `email` (String)
- `rol` (String: "admin" | "jugador")
- `estaSancionado` (Boolean)
- `fechaCreacion` (Timestamp)

### Colección `Partidos`
- `id` (String, PK)
- `fecha` (Timestamp)
- `estado` (String: "abierto" | "cerrado" | "jugado")
- `creadoPor` (String, uid del admin)
- `cupoTitulares` (Number)
- `cupoSuplentes` (Number)

### Colección `Inscripciones`
- `id` (String, PK)
- `partidoId` (String, FK)
- `usuarioId` (String, FK)
- `estado` (String: "anotado" | "dado_de_baja")
- `tipo` (String: "titular" | "suplente")
- `orden` (Number) — orden de inscripción, usado para mostrar el siguiente candidato a promover
- `fechaInscripcion` (Timestamp)

## 6. Reglas de negocio

1. Al crear un partido (admin), se define `cupoTitulares` y `cupoSuplentes` (> 0).
2. Al anotarse un jugador:
   - Rechazar con 403 si `estaSancionado === true`.
   - Rechazar con 400 si ya tiene una inscripción activa ("anotado") en ese partido.
   - Contar inscripciones activas por `tipo` en el partido. Si titulares < cupo → `tipo: "titular"`. Si no, si suplentes < cupo → `tipo: "suplente"`. Si ambos llenos → 400 "Partido completo".
3. Al darse de baja:
   - Buscar inscripción activa del usuario en ese partido → cambiar `estado` a "dado_de_baja".
   - Si `tipo === "titular"` → setear `estaSancionado: true` en `Usuarios`.
   - Si `tipo === "suplente"` → no se sanciona.
   - No hay promoción automática de suplentes.
4. Promoción manual (solo admin): dado un partido y un usuario suplente con inscripción activa, si hay lugar libre en titulares, cambiar su `tipo` a "titular".
5. Perdón de sanción (solo admin): setea `estaSancionado: false`.

## 7. API

Middleware `verificarToken` (Bearer + `firebase-admin`) en todas las rutas salvo que se indique. Middleware adicional `verificarAdmin` para rutas de admin.

### Auth & Usuarios
- `POST /api/auth/sync` — crea o actualiza el usuario en Firestore a partir del token; asigna `rol: "admin"` si el email está en `ADMIN_EMAILS`.
- `GET /api/usuarios/sancionados` (admin) — lista usuarios con `estaSancionado: true`.
- `POST /api/usuarios/:uid/perdonar` (admin) — `estaSancionado: false`.

### Partidos
- `GET /api/partidos` — partidos con estado "abierto", incluyendo conteo de titulares/suplentes ocupados vs. cupo.
- `POST /api/partidos` (admin) — body `{ fecha, cupoTitulares, cupoSuplentes }`; valida `fecha` futura y cupos > 0.

### Inscripciones
- `POST /api/partidos/:partidoId/anotarse` — aplica reglas de la sección 6.2.
- `POST /api/partidos/:partidoId/bajarse` — aplica reglas de la sección 6.3.
- `POST /api/partidos/:partidoId/promover/:usuarioId` (admin) — aplica regla 6.4.

Códigos de error: 400 (validación/estado inválido), 401 (sin token o inválido), 403 (sancionado o no-admin), 404 (recurso inexistente), 500 (error de servidor). Todas las respuestas de error: `{ error: "mensaje" }`.

## 8. Frontend

### Páginas
- `Login` — botón "Ingresar con Google".
- `Home` — partido(s) abiertos, cupos, y acción según el estado del usuario (anotarse / bajarse / sancionado).
- `AdminPanel` — crear partido, ver sancionados + perdonar, ver titulares/suplentes por partido + promover.

### Componentes reutilizables
- `Boton` (variantes primario/peligro/ghost)
- `TarjetaPartido` (fecha, barra de cupos titulares/suplentes, estado del usuario actual)
- `ModalConfirmacionSancion` (confirma la baja de un titular, advirtiendo la sanción)
- `ListaJugadores` (titulares/suplentes; reutilizada en Home y AdminPanel)
- `BadgeSancion`

### Estado global
`AuthContext`: usuario de Firebase Auth + perfil sincronizado desde `/api/auth/sync` (incluye `rol`, `estaSancionado`). Rutas protegidas con wrappers `RutaPrivada` / `RutaAdmin` sobre React Router.

### Identidad visual
Estética "potrero nocturno de barrio": fondo oscuro estilo cancha con luces de estadio, verde césped como color primario, blanco de contraste, acento celeste (albiceleste genérico, sin marcas de clubes reales). Tipografía condensada/bold en títulos, sans-serif en cuerpo. Cupos como barra de progreso (ej. "8/10 titulares"). Badges de estado: abierto=verde, completo=amarillo, sancionado=rojo.

## 9. Manejo de errores y validación

- Backend: middleware de errores centralizado; validación de body antes de tocar Firestore (fecha futura y válida, cupos numéricos > 0).
- Frontend: interceptor de Axios para mostrar errores (toast/alert); estados de carga en botones de acción para evitar doble submit.

## 10. Testing

Jest en el backend, cubriendo los services/controllers de:
- Anotarse (asignación titular/suplente, rechazo por sanción, rechazo por partido completo).
- Bajarse (sanción solo si era titular).
- Promoción manual de suplente a titular.
- Perdón de sanción.

Sin tests de frontend en esta primera etapa.

## 11. Fuera de alcance (por ahora)

- Notificaciones (email/push).
- Historial de partidos jugados / estadísticas.
- Pagos o cobros por partido.
- Edición o cancelación de un partido ya creado.
