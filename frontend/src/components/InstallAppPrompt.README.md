# InstallAppPrompt - Componente PWA Install

Maneja automáticamente la instalación de la app en Android e iOS.

## Características

### Android (Chrome/Edge)
- Escucha evento `beforeinstallprompt` automáticamente
- Evita que se dispare sin consentimiento
- Muestra botón flotante "Instalar App" en bottom-right
- Al hacer clic, muestra el prompt nativo de instalación
- Oculta botón después de instalar o rechazar
- Re-muestra después de N días si fue rechazado

### iOS (Safari)
- Detecta iPhone/iPad automáticamente
- Valida que no esté ya instalada (`window.navigator.standalone`)
- Muestra banner bottom-sheet con instrucciones
- Botón X para cerrar y descartar
- Re-muestra después de N días si fue cerrado
- Soporte para dark mode
- Respeta safe area en notch/Dynamic Island

## Instalación

### 1. En React (recomendado)

```jsx
import { useEffect } from 'react';
import InstallAppPrompt from './InstallAppPrompt';
import './InstallAppPrompt.css';

export default function App() {
  useEffect(() => {
    new InstallAppPrompt({
      dismissDaysAndroid: 7,
      dismissDaysIos: 7,
    });
  }, []);

  return (
    <div>
      {/* Tu contenido */}
    </div>
  );
}
```

### 2. En JavaScript Vanilla

```html
<script src="path/to/InstallAppPrompt.js" type="module"></script>
<link rel="stylesheet" href="path/to/InstallAppPrompt.css">

<script type="module">
  import InstallAppPrompt from './InstallAppPrompt.js';
  const prompter = new InstallAppPrompt();
</script>
```

## Configuración

```javascript
new InstallAppPrompt({
  containerId: 'install-prompt-container',  // ID del contenedor (default: generado automáticamente)
  dismissDaysAndroid: 7,                     // Días antes de re-mostrar en Android (default: 7)
  dismissDaysIos: 7,                         // Días antes de re-mostrar en iOS (default: 7)
});
```

## API

### Métodos

```javascript
const prompter = new InstallAppPrompt();

// Resetear: borrar dismissals y esconder elementos
prompter.reset();
```

### Propiedades

```javascript
prompter.isIos           // boolean
prompter.isAndroid       // boolean
prompter.appInstalled    // boolean (true si ya está instalada)
prompter.deferredPrompt  // Evento beforeinstallprompt (solo Android)
```

## Almacenamiento Local

Usa `localStorage` para recordar rechazo:
- `install-app-dismissed-android` → timestamp
- `install-app-dismissed-ios` → timestamp

Se borran automáticamente cuando el usuario instala la app.

## Dark Mode

Los estilos se adaptan automáticamente a `prefers-color-scheme: dark`.

## Safe Area (Notch/Dynamic Island)

Soporta `env(safe-area-inset-*)` automáticamente en iOS.

## Estructura HTML Generada

**Android:**
```html
<button class="install-app-button install-app-button-android">
  <svg>...</svg>
  Instalar App
</button>
```

**iOS:**
```html
<div class="install-app-banner install-app-banner-ios">
  <div class="install-app-banner-content">
    <div class="install-app-banner-text">
      <strong>Instalar App</strong>
      <p>Toca el ícono de Compartir del navegador...</p>
    </div>
    <button class="install-app-banner-close">✕</button>
  </div>
</div>
```

## Notas

- Requiere que tu app tenga un `manifest.json` válido (PWA)
- En iOS, solo funciona desde Safari (no Chrome, no WebView)
- El evento `beforeinstallprompt` NO se dispara si la app ya está instalada
- El banner iOS se muestra incluso si no hay conexión a internet
- Todos los estilos incluyen animaciones suaves y transiciones

## Testing Manual

**Android:**
1. Abre Chrome/Edge en Android
2. Verifica que haya botón "Instalar App" en bottom-right
3. Haz clic → debe mostrar prompt nativo
4. Acepta → botón desaparece
5. Rechazo → botón desaparece por 7 días

**iOS:**
1. Abre Safari en iPhone/iPad
2. Verifica que haya banner inferior con instrucciones
3. Haz clic X → banner desaparece por 7 días
4. Sigue instrucciones (Share → Add to Home Screen)
5. Una vez instalada, no debe mostrar nada
