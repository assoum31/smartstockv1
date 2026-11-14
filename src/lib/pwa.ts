/** Only published top-level apps may cache their shell. */
export function mayRegisterWorker(hostname: string, production: boolean, framed: boolean, disabled: boolean) {
  const host = hostname.toLowerCase();
  if (!production || framed || disabled) return false;
  if (/(^|\.)(lovableproject(?:-dev)?\.com|beta\.lovable\.dev)$/.test(host)) return false;
  if (/\.(lovable\.app|gpt-eng\.com|gptengineer\.run)$/.test(host)) {
    const label = host.split('.')[0] ?? '';
    if (/^(?:id-preview|preview)(?:-[a-z0-9]+)?--.+$/.test(label) || /^project--.+-dev$/.test(label)) return false;
  }
  return true;
}

export async function initializePwa() {
  if (!('serviceWorker' in navigator)) return;
  if (!mayRegisterWorker(window.location.hostname, import.meta.env.PROD, window.self !== window.top, new URLSearchParams(window.location.search).get('sw') === 'off')) {
    for (const registration of await navigator.serviceWorker.getRegistrations()) {
      if ([registration.active, registration.waiting, registration.installing].some(worker => worker && new URL(worker.scriptURL).pathname === '/sw.js')) await registration.unregister();
    }
    return;
  }
  const registration = await navigator.serviceWorker.register('/sw.js');
  void registration.update();
  await navigator.serviceWorker.ready;
  // Warm the fixed start URL and the two offline work screens, never API responses.
  await Promise.allSettled(['/login', '/pos', '/scan'].map(path => fetch(path, { headers: { Accept: 'text/html' }, credentials: 'same-origin' })));
}