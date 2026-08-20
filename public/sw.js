// __BUILD_ID__ est substitué par scripts/postbuild.mjs à chaque déploiement.
// POURQUOI : ce cache retient du HTML avec les DONNÉES INLINÉES dedans
// (networkFirst ci-dessous). Sous un nom constant, l'activate ne purgeait
// jamais rien, et un visiteur récurrent pouvait revoir indéfiniment une
// édition d'il y a des jours au moindre raté réseau — relevé par l'audit de
// lancement du 2026-08-19. Un nom par build = l'ancien cache meurt à chaque
// déploiement. En dev local (public/ servi tel quel), le jeton non substitué
// reste un nom valide.
const CACHE_NAME = "vitrine-__BUILD_ID__";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.origin !== location.origin) return;
  if (request.method !== "GET") return;

  // Immutable Next.js assets (content-hashed filenames) → cache first
  if (url.pathname.includes("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Everything else (HTML, data JSON, images) → network first, cache as fallback
  event.respondWith(networkFirst(request));
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached ?? new Response("Hors ligne", { status: 503 });
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone()).catch(() => {});
  }
  return response;
}
