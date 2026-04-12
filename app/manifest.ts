import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Receipt Tracker",
    short_name: "Receipts",
    description: "Track grocery receipts, corrections, and spend trends.",
    start_url: "/?tab=photo",
    scope: "/",
    display: "standalone",
    background_color: "#f7f1e6",
    theme_color: "#0f766e",
    orientation: "portrait",
    icons: [
      {
        src: "/pwa-icons/192",
        sizes: "192x192",
        type: "image/png"
      },
      {
        src: "/pwa-icons/512",
        sizes: "512x512",
        type: "image/png"
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png"
      }
    ]
  };
}
