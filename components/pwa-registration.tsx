"use client";

import { useEffect } from "react";

export function PwaRegistration(): null {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations().then(async (registrations) => {
        await Promise.all(registrations.map((registration) => registration.unregister()));

        if ("caches" in window) {
          const cacheKeys = await caches.keys();
          await Promise.all(
            cacheKeys
              .filter((key) => key.startsWith("receipt-tracker-static-") || key.startsWith("foodprint-static-"))
              .map((key) => caches.delete(key))
          );
        }
      });
      return;
    }

    void navigator.serviceWorker.register("/sw.js");
  }, []);

  return null;
}
