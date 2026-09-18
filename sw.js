const CACHE_NAME = "paivabudjetti-v1";
const ASSETS_TO_CACHE = ["./", "./index.html", "./script.js", "./settings.json", "./manifest.json"];

// Asennus: Tallennetaan staattiset tiedostot välimuistiin
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }),
  );
  self.skipWaiting();
});

// Aktivointi: Poistetaan vanhat välimuistit tarvittaessa
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
    }),
  );
  self.clients.claim();
});

// Verkkopyyntöjen käsittely: Haetaan verkosta, jos ei löydy välimuistista
self.addEventListener("fetch", (event) => {
  // Supabase-pyyntöjä ja ulkoisia CDN-kirjastoja ei pakoteta tiukkaan offline-välimuistiin
  if (event.request.url.includes("supabase.co")) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request);
    }),
  );
});
