import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: { formats: ["image/avif", "image/webp"] },

  /**
   * Packages webpack must not try to bundle.
   *
   * Both of these are native or Node-only and have no business inside a browser
   * or edge bundle. Left to itself, webpack follows `web-push` into
   * `https-proxy-agent` and then into Node's own `http`, which does not exist in
   * the edge runtime — and the whole page fails to compile with
   * `Can't resolve 'http'`. Naming them here leaves them as ordinary runtime
   * requires on the server, which is what they are.
   *
   * `better-sqlite3` is here for the same reason and one more: it is a compiled
   * binary, and bundling a `.node` file is not a thing that works.
   */
  serverExternalPackages: ["web-push", "better-sqlite3"],

  /**
   * The build type-checks the website, not the toolbox.
   *
   * `scripts/` holds the test suites, the manual renderer and the social card
   * renderer, and those reach for packages the website itself does not depend
   * on. `next build` type-checks every file the tsconfig includes, so one script
   * importing something a hosting provider has not installed fails the deploy,
   * pointing at a file that never runs in production. See tsconfig.build.json.
   *
   * `npm run typecheck` still uses tsconfig.json and still checks everything.
   */
  typescript: { tsconfigPath: "tsconfig.build.json" },
};

export default nextConfig;
