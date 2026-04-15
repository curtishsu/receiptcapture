const CACHE_NAME = "foodprint-static-v2";
const STATIC_ASSET_DESTINATIONS = new Set(["font", "image"]);

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;

  if (!isSameOrigin || url.pathname.startsWith("/api/")) {
    return;
  }

  if (!STATIC_ASSET_DESTINATIONS.has(request.destination) && !url.pathname.startsWith("/pwa-icons/")) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      const networkFetch = fetch(request)
        .then((response) => {
          if (response.ok) {
            void cache.put(request, response.clone());
          }

          return response;
        })
        .catch(() => cached);

      return cached ?? networkFetch;
    })
  );
});
