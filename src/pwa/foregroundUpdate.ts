// Check in every screen; activate and reload only at a safe point chosen by App.
let registration: ServiceWorkerRegistration | undefined;
let allowed = false;
let checking = false;
let activationRequested = false;
let reloadRequired = false;
let reloading = false;
let started = false;
let retry: ReturnType<typeof setTimeout> | undefined;
let notice = '';
const listeners = new Set<() => void>();

export function subscribeUpdateNotice(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function getUpdateNotice() { return notice; }
function announce(value: string) {
  if (notice === value) return;
  notice = value;
  listeners.forEach((listener) => listener());
}
function applyWhenSafe() {
  if (retry !== undefined) { clearTimeout(retry); retry = undefined; }
  if ((!registration?.waiting && !reloadRequired) || reloading) return;
  announce('Nueva versión disponible. Se aplicará al volver al menú principal.');
  if (!allowed || document.visibilityState !== 'visible') return;
  if (window.speechSynthesis?.speaking || window.speechSynthesis?.pending) {
    retry = setTimeout(applyWhenSafe, 1000);
    return;
  }
  if (reloadRequired) {
    reloading = true;
    announce('Actualizando aplicación…');
    window.location.reload();
  } else if (!activationRequested && registration?.waiting) {
    activationRequested = true;
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  }
}
export function setUpdateReloadAllowed(value: boolean) {
  allowed = value;
  if (started) applyWhenSafe();
}
export function startForegroundUpdates(baseUrl: string) {
  if (started || !('serviceWorker' in navigator)) return;
  started = true;
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // The first installation is not an update of the current document.
    if (hadController) reloadRequired = true;
    hadController = true;
    activationRequested = false;
    applyWhenSafe();
  });
  async function check() {
    if (document.visibilityState !== 'visible') return;
    applyWhenSafe();
    if (checking || !navigator.onLine) return;
    checking = true;
    try {
      if (!registration) {
        registration = await navigator.serviceWorker.register(`${baseUrl}sw.js`, {
          scope: baseUrl, updateViaCache: 'none',
        });
        const watchInstalling = () => {
          const worker = registration?.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed') {
              activationRequested = false;
              applyWhenSafe();
            }
          });
        };
        registration.addEventListener('updatefound', watchInstalling);
        watchInstalling();
        applyWhenSafe();
      }
      await registration.update();
      applyWhenSafe();
    } catch {
      // Keep the installed offline version. Retry on the next foreground/online event.
    } finally {
      checking = false;
    }
  }
  document.addEventListener('visibilitychange', () => { void check(); });
  window.addEventListener('online', () => { void check(); });
  void check();
}
