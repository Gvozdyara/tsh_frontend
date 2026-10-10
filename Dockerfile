# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1: fetch the pinned React / htm UMD bundles.
# The SPA itself is plain ES2020 + htm tagged templates: there is no bundler,
# no transpiler and no build step, these three files are the whole toolchain.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS vendor

WORKDIR /vendor
COPY vendor/package.json ./
RUN npm install --no-audit --no-fund --ignore-scripts \
 && mkdir -p /out \
 && cp node_modules/react/umd/react.production.min.js /out/ \
 && cp node_modules/react-dom/umd/react-dom.production.min.js /out/ \
 && cp node_modules/htm/dist/htm.umd.js /out/

# ---------------------------------------------------------------------------
# Stage 2: nginx serving the static SPA and reverse proxying /api.
# ---------------------------------------------------------------------------
FROM nginx:alpine AS runtime

ENV TSH_DOMAIN=tsh.local \
    TSH_BACKEND_HOST=backend \
    TSH_BACKEND_PORT=37296 \
    TSH_HTTP_PORT=8080 \
    TSH_LOG_LEVEL=info \
    TSH_RESOLVER=127.0.0.11

COPY --from=vendor /out/ /usr/share/nginx/html/vendor/
COPY public/ /usr/share/nginx/html/
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY docker/entrypoint.sh /docker-entrypoint.d/40-tsh-env.sh
RUN chmod +x /docker-entrypoint.d/40-tsh-env.sh \
 && chmod -R a+rX /usr/share/nginx/html \
 && rm -f /etc/nginx/conf.d/default.conf

EXPOSE 8080

HEALTHCHECK --interval=20s --timeout=5s --start-period=10s --retries=5 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
