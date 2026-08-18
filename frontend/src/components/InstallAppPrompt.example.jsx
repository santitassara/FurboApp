/**
 * Ejemplo de uso del componente InstallAppPrompt
 * Coloca esto en tu componente principal (App.jsx o Layout.jsx)
 */

import { useEffect } from 'react';
import InstallAppPrompt from './InstallAppPrompt';
import './InstallAppPrompt.css';

export default function App() {
  useEffect(() => {
    // Inicializa el prompt de instalación
    new InstallAppPrompt({
      containerId: 'install-prompt-container',
      dismissDaysAndroid: 7,  // Re-mostrar después de 7 días si rechaza
      dismissDaysIos: 7,      // Re-mostrar después de 7 días si cierra
    });
  }, []);

  return (
    <div>
      {/* Tu contenido principal aquí */}
      <h1>FurboApp</h1>
      {/* ... resto de la aplicación ... */}
    </div>
  );
}

/**
 * INTEGRACIÓN ALTERNATIVA (Sin React):
 *
 * Si prefieres usar en un componente que no es React:
 *
 * 1. En tu HTML:
 *    <script src="/src/components/InstallAppPrompt.js" type="module"></script>
 *
 * 2. En tu JavaScript:
 *    import InstallAppPrompt from './InstallAppPrompt.js';
 *    const prompter = new InstallAppPrompt();
 *
 * 3. Para resetear (ej: en logout):
 *    prompter.reset();
 */
