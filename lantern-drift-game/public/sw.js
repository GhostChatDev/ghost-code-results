/* Lantern Drift offline shell. Bump this version whenever app files change. */
const CACHE = "lantern-drift-v1";
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./lantern-icon.svg", "./lantern-icon-maskable.svg"];
const LEVELS = ["01", "02", "03", "04", "05"].map((id) => `./levels/${id}.json`);
const urlOf = (path) => new URL(path, self.registration.scope).href;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Cache each file independently: one unavailable level must not cancel installation.
    await Promise.all([...CORE, ...LEVELS].map(async (path) => {
      const response = await fetch(urlOf(path), { cache: "reload" });
      if (response.ok) await cache.put(urlOf(path), response);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith("lantern-drift-") && name !== CACHE).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE);
          await cache.put(urlOf("./index.html"), response.clone());
        }
        return response;
      } catch {
        return (await caches.match(urlOf("./index.html"))) || (await caches.match(urlOf("./"))) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    // Compiled JS/CSS have content hashes: a cached copy is safe for this cache version.
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok && (response.type === "basic" || response.type === "default")) {
        const cache = await caches.open(CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      return new Response("Offline resource unavailable", { status: 503, headers: { "Content-Type": "text/plain" } });
    }
  })());
});
