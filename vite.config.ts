// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// Never set ssr.external or resolve.external: the Worker has no runtime module resolution, so
// the build fails. Never add compression (compressPublicAssets, vite-plugin-compression):
// hosting already compresses at the edge.
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  vite: {
    plugins: [VitePWA({
      strategies: 'generateSW',
      filename: 'sw.js',
      outDir: 'dist/client',
      injectRegister: null,
      registerType: 'autoUpdate',
      devOptions: { enabled: false },
      manifest: false,
      includeAssets: ['icon-192.png', 'icon-512.png', 'favicon.svg', 'manifest.webmanifest'],
      workbox: {
        globPatterns: ['**/*.{js,css,woff2,png,svg}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: undefined,
        cleanupOutdatedCaches: true,
        runtimeCaching: [{
          urlPattern: ({ request, url }) => url.origin === self.location.origin && !url.pathname.startsWith('/~oauth') && !url.pathname.startsWith('/api/') && (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html') === true),
          handler: 'NetworkFirst',
          options: { cacheName: 'smartstock-pages', networkTimeoutSeconds: 4, cacheableResponse: { statuses: [200] }, expiration: { maxEntries: 20 } },
        }, {
          urlPattern: ({ url }) => url.origin === self.location.origin && /\/assets\/.*-[a-zA-Z0-9_-]+\.(js|css|woff2)$/.test(url.pathname),
          handler: 'CacheFirst',
          options: { cacheName: 'smartstock-assets', cacheableResponse: { statuses: [200] } },
        }],
      },
    })],
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
