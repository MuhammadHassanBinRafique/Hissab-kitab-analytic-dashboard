// Builds the whole site for Vercel in the "Build Output API" format (https://vercel.com/docs/build-output-api):
//   .vercel/output/static            the web app (apps/web build)
//   .vercel/output/functions/api.func the API, bundled into ONE file (no TypeScript or workspace resolving on Vercel)
//   .vercel/output/config.json        routing + security headers
// Run locally with: node scripts/build-vercel.mjs
import { execSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { build } from "esbuild";

const out = ".vercel/output";
rmSync(out, { recursive: true, force: true });

execSync("npm run build -w @insights/web", { stdio: "inherit" });

mkdirSync(`${out}/functions/api.func`, { recursive: true });
await build({
  entryPoints: ["apps/api/src/vercel.ts"], bundle: true, platform: "node", target: "node22", format: "cjs",
  outfile: `${out}/functions/api.func/index.js`, legalComments: "none", logLevel: "info",
  footer: { js: "module.exports = module.exports.default;" }, // Vercel calls module.exports as the request handler
});
writeFileSync(`${out}/functions/api.func/.vc-config.json`, JSON.stringify({
  runtime: "nodejs22.x", handler: "index.js", launcherType: "Nodejs", maxDuration: 10,
  // Run the API in the same region as the Supabase database (e.g. "bom1" for Mumbai). Set API_REGION in Vercel.
  ...(process.env.API_REGION ? { regions: [process.env.API_REGION] } : {}),
}, null, 2));

cpSync("apps/web/build", `${out}/static`, { recursive: true });

const headers = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  // Report-Only first: it logs violations in the browser console without blocking anything.
  // After checking the console on the live site is clean, rename the key to "Content-Security-Policy".
  "Content-Security-Policy-Report-Only": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};
writeFileSync(`${out}/config.json`, JSON.stringify({
  version: 3,
  routes: [
    { src: "/(.*)", headers, continue: true },
    { src: "/api(?:/.*)?", dest: "/api" },          // every /api/... request goes to the one function
    { handle: "filesystem" },                         // real files (js, css, icons) are served as they are
    { src: "/(.*)", dest: "/index.html" },            // everything else is the single-page app
  ],
}, null, 2));
console.log(`\nVercel output ready. API bundle: ${(statSync(`${out}/functions/api.func/index.js`).size / 1024).toFixed(0)} KB`);
