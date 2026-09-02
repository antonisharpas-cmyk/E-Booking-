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

  /**
   * The deploy id, stamped onto every asset request.
   *
   * The problem it solves is called build skew and it is nastier than it sounds.
   * A member has the site open. You deploy. Their browser is still running the
   * old JavaScript, which asks for a chunk by the filename the old build used,
   * and that filename no longer exists. The request 404s and the page half
   * works: a button does nothing, or a panel never loads, with nothing in the
   * console a non-developer could act on.
   *
   * With this set, Next adds `?dpl=<id>` to the assets it requests, so a browser
   * carrying the old build asks for the old deploy's copies and a fresh visitor
   * gets the new ones. It also means every deploy changes every asset URL, which
   * is the cache-busting half of the same coin.
   *
   * `RENDER_GIT_COMMIT` is set by the platform to the commit being built, which
   * makes it exactly the right value: it changes when and only when the code
   * does. Undefined off Render, where Next falls back to its own build id and
   * this is a no-op.
   */
  deploymentId: process.env.RENDER_GIT_COMMIT,

  /**
   * What may be cached, and for how long. The whole answer to "I deployed and
   * everybody still sees the old site".
   */
  async headers() {
    /**
     * Order matters here, and it is the opposite of what it looks like.
     *
     * Next applies *every* rule whose source matches, and for two rules setting
     * the same header the **last** one wins. So the broad rule goes first and
     * the specific ones after it, each overriding it for the paths it names. A
     * first draft of this had the catch-all last and it quietly undid the
     * immutable caching and the service-worker rule, which is exactly the kind
     * of thing that looks fine until a deploy behaves oddly.
     */
    return [
      {
        /**
         * Everything, which in practice means the pages.
         *
         * The HTML points at the hashed asset filenames, so a cached copy of it
         * is a browser politely serving last week's site to somebody who
         * reloaded. `must-revalidate` with `max-age=0` still lets the browser
         * keep the copy and answer from it after a 304, which is fast, but it
         * has to ask first, every time. That is the difference between a deploy
         * appearing on the next page load and appearing whenever somebody
         * happens to hard-refresh.
         *
         * Two exclusions, both of which set their own headers for good reasons.
         *
         * `/_next/image` is the image optimiser: it caches its output sensibly
         * and re-optimising a photograph on every page view is expensive for
         * nothing.
         *
         * `/api/` matters more, and a test caught it. The avatar route answers
         * with `Cache-Control: private` so that a shared cache — a company
         * proxy, a CDN — cannot store one member's photograph and hand it to
         * somebody else. A blanket `public` here silently undid that. API
         * routes decide their own caching, and every one of them has thought
         * about it more carefully than a catch-all can.
         */
        source: "/((?!_next/image|api/).*)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
      {
        /* Fingerprinted by the build: the filename contains a hash of the
           contents, so a changed file is a changed URL and the old one can be
           kept forever. `immutable` tells the browser not to even ask. */
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        /* Photographs, the wordmark, the team portraits. Not fingerprinted,
           because these are files the studio replaces by name, so they are kept
           for an hour and then re-checked: a new photograph appears the same
           morning without the hero image being re-downloaded on every page. */
        source: "/:folder(brand|media|team)/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600, must-revalidate",
          },
        ],
      },
      {
        /* The push worker. Browsers re-check it on their own schedule, and a
           stale one keeps handling notifications with old code, so it is never
           served from a cache at all. */
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
