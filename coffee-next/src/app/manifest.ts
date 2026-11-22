import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "עגלת הקפה",
    short_name: "עגלת הקפה",
    description: "הזמנת קפה ומאפים במהירות",
    start_url: "/",
    display: "standalone",
    background_color: "#09090b",
    theme_color: "#f59e0b",
    icons: [
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
      {
        src: "/icon",
        sizes: "64x64",
        type: "image/png",
      },
    ],
  };
}