// App icon badge and system notifications (installed PWA, where the browser
// supports them). Everything here fails quietly when unsupported.

const KEY = 'nba-manager:notify';

export function setAppBadge(count: number) {
  const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }) : null;
  if (!nav?.setAppBadge) return;
  void (count > 0 ? nav.setAppBadge(count) : nav.clearAppBadge?.())?.catch(() => {});
}

export const notifySupported = () => typeof window !== 'undefined' && 'Notification' in window;

export function notifyWanted(): boolean {
  try {
    return notifySupported() && Notification.permission === 'granted' && localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
}

export async function enableNotify(on: boolean): Promise<boolean> {
  if (!notifySupported()) return false;
  if (on && Notification.permission !== 'granted') {
    const r = await Notification.requestPermission();
    if (r !== 'granted') return false;
  }
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* private mode */
  }
  return on;
}

/** A system notification, only when the app is in the background and the user asked for them. */
export function notify(title: string, body: string) {
  if (!notifyWanted() || typeof document === 'undefined' || !document.hidden) return;
  try {
    // Through the service worker when there is one (needed on mobile), otherwise directly.
    void navigator.serviceWorker?.ready
      .then((reg) => reg.showNotification(title, { body, icon: `${import.meta.env.BASE_URL}icons/icon-192.png`, tag: 'nba-manager' }))
      .catch(() => new Notification(title, { body }));
  } catch {
    /* unsupported */
  }
}
