/**
 * PWA Install Prompt Component
 * Handles both Android (beforeinstallprompt) and iOS (manual banner)
 */

class InstallAppPrompt {
  constructor(config = {}) {
    this.config = {
      containerId: config.containerId || 'install-prompt-container',
      dismissDaysAndroid: config.dismissDaysAndroid || 7,
      dismissDaysIos: config.dismissDaysIos || 7,
      ...config,
    };

    this.deferredPrompt = null;
    this.isIos = false;
    this.isAndroid = false;
    this.appInstalled = false;

    this.init();
  }

  init() {
    this.detectPlatform();
    this.handleAndroid();
    this.handleIos();
  }

  detectPlatform() {
    const ua = navigator.userAgent;
    this.isIos = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    this.isAndroid = /Android/.test(ua);
    this.appInstalled = window.navigator.standalone === true;
  }

  handleAndroid() {
    if (!this.isAndroid || this.appInstalled) return;

    // Escucha beforeinstallprompt y evita que se dispare automáticamente
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;

      // Verifica si ha sido rechazado recientemente
      if (!this.isDismissedRecently('android')) {
        this.showAndroidButton();
      }
    });

    // Escucha si la app ya fue instalada
    window.addEventListener('appinstalled', () => {
      this.hideAndroidButton();
      this.clearDismissal('android');
    });
  }

  handleIos() {
    if (!this.isIos || this.appInstalled) return;

    // Verifica si ha sido rechazado recientemente
    if (!this.isDismissedRecently('ios')) {
      this.showIosBanner();
    }
  }

  showAndroidButton() {
    const container = this.getOrCreateContainer();

    const button = document.createElement('button');
    button.id = 'install-app-button-android';
    button.className = 'install-app-button install-app-button-android';
    button.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2v20M2 12h20M4 4l16 16M20 4l-16 16"></path>
      </svg>
      Instalar App
    `;

    button.addEventListener('click', () => this.triggerAndroidPrompt());

    container.appendChild(button);
  }

  async triggerAndroidPrompt() {
    if (!this.deferredPrompt) return;

    this.deferredPrompt.prompt();
    const { outcome } = await this.deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      localStorage.setItem('furbo-app-installed', 'true');
      this.hideAndroidButton();
      this.clearDismissal('android');
    } else {
      this.setDismissal('android');
      this.hideAndroidButton();
    }

    this.deferredPrompt = null;
  }

  showIosBanner() {
    const container = this.getOrCreateContainer();

    const banner = document.createElement('div');
    banner.id = 'install-app-banner-ios';
    banner.className = 'install-app-banner install-app-banner-ios';
    banner.innerHTML = `
      <div class="install-app-banner-content">
        <div class="install-app-banner-text">
          <strong>Instalar App</strong>
          <p>Toca el ícono de Compartir del navegador y selecciona 'Agregar a inicio'</p>
        </div>
        <button class="install-app-banner-close" aria-label="Cerrar">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `;

    const closeBtn = banner.querySelector('.install-app-banner-close');
    closeBtn.addEventListener('click', () => {
      this.hideIosBanner();
      this.setDismissal('ios');
    });

    container.appendChild(banner);
  }

  hideAndroidButton() {
    const button = document.getElementById('install-app-button-android');
    if (button) button.remove();
  }

  hideIosBanner() {
    const banner = document.getElementById('install-app-banner-ios');
    if (banner) banner.remove();
  }

  getOrCreateContainer() {
    let container = document.getElementById(this.config.containerId);
    if (!container) {
      container = document.createElement('div');
      container.id = this.config.containerId;
      container.className = 'install-prompt-container';
      document.body.appendChild(container);
    }
    return container;
  }

  isDismissedRecently(platform) {
    const key = `install-app-dismissed-${platform}`;
    const dismissedTime = localStorage.getItem(key);
    if (!dismissedTime) return false;

    const days = platform === 'android'
      ? this.config.dismissDaysAndroid
      : this.config.dismissDaysIos;

    const elapsedDays = (Date.now() - parseInt(dismissedTime)) / (1000 * 60 * 60 * 24);
    return elapsedDays < days;
  }

  setDismissal(platform) {
    const key = `install-app-dismissed-${platform}`;
    localStorage.setItem(key, Date.now().toString());
  }

  clearDismissal(platform) {
    const key = `install-app-dismissed-${platform}`;
    localStorage.removeItem(key);
  }

  reset() {
    this.clearDismissal('android');
    this.clearDismissal('ios');
    this.hideAndroidButton();
    this.hideIosBanner();
    this.deferredPrompt = null;
  }
}

export default InstallAppPrompt;
