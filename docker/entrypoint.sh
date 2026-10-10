#!/bin/sh
set -eu

: "${TSH_DOMAIN:=tsh.local}"
: "${TSH_BACKEND_HOST:=backend}"
: "${TSH_BACKEND_PORT:=37296}"
: "${TSH_HTTP_PORT:=8080}"
: "${TSH_LOG_LEVEL:=info}"
: "${TSH_RESOLVER:=127.0.0.11}"

export TSH_DOMAIN TSH_BACKEND_HOST TSH_BACKEND_PORT TSH_HTTP_PORT TSH_LOG_LEVEL TSH_RESOLVER

CONFIG="/usr/share/nginx/html/config.js"
cat > "$CONFIG" <<EOF
// generated at container start by /docker-entrypoint.d/40-tsh-env.sh
window.__TSH_ENV__ = {
  TSH_DOMAIN: "${TSH_DOMAIN}",
  TSH_BACKEND_HOST: "${TSH_BACKEND_HOST}",
  TSH_BACKEND_PORT: "${TSH_BACKEND_PORT}",
  TSH_HTTP_PORT: "${TSH_HTTP_PORT}",
  TSH_LOG_LEVEL: "${TSH_LOG_LEVEL}",
  TSH_API_BASE: "/api"
};
EOF

# --- NEW: derive the runtime config the SPA actually consumes ------------
cat >> "$CONFIG" <<'EOF'

(function () {
  var e = window.__TSH_ENV__ || {};
  window.TSH_ENV = {
    domain:      e.TSH_DOMAIN       || window.location.hostname,
    apiBase:     e.TSH_API_BASE     || "/api",
    backendHost: e.TSH_BACKEND_HOST || "backend",
    backendPort: e.TSH_BACKEND_PORT || "37296",
    httpPort:    e.TSH_HTTP_PORT    || window.location.port || "8080",
    logLevel:    e.TSH_LOG_LEVEL    || "info"
  };
  window.TSH_LOG = function () {
    if (window.TSH_ENV.logLevel === "debug" && window.console) {
      console.debug.apply(console, arguments);
    }
  };
})();
EOF
# ------------------------------------------------------------------------

echo "[tsh] frontend config written for domain ${TSH_DOMAIN}, upstream http://${TSH_BACKEND_HOST}:${TSH_BACKEND_PORT}"