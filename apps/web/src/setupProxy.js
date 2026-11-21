// Dev only: forwards /api to the API server so the browser sees ONE origin (cookies and the CSRF origin check work).
// Not used by `npm run build`; in production serve the web app and /api from the same host.
const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = function setupProxy(app) {
  app.use(createProxyMiddleware({ target: process.env.API_PROXY_TARGET || "http://localhost:8787", pathFilter: "/api" }));
};
