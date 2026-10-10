// Runtime configuration injected by the container entrypoint (docker/env.sh).
// Falls back to the current origin when the page is served without it.
(function () {
  var injected = window.__TSH_ENV__ || {};
  window.TSH_ENV = {
    domain: injected.TSH_DOMAIN || window.location.hostname,
    apiBase: injected.TSH_API_BASE || "/api",
    backendHost: injected.TSH_BACKEND_HOST || "backend",
    backendPort: injected.TSH_BACKEND_PORT || "37296",
    httpPort: injected.TSH_HTTP_PORT || window.location.port || "8080",
    logLevel: injected.TSH_LOG_LEVEL || "info"
  };
  window.TSH_LOG = function () {
    if (window.TSH_ENV.logLevel === "debug" && window.console) {
      console.debug.apply(console, arguments);
    }
  };
})();
