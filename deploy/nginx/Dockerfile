FROM node:22-alpine AS frontend-build

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
COPY design/brand-tokens.css /app/design/brand-tokens.css
RUN npm run build

FROM nginx:1.27-alpine
ENV CLIENT_MAX_BODY_SIZE=11m \
    HTTPS_ENABLED=0 \
    TLS_CERTIFICATE_PATH=/etc/nginx/tls/fullchain.pem \
    TLS_CERTIFICATE_KEY_PATH=/etc/nginx/tls/privkey.pem
COPY deploy/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY deploy/nginx/default.https.conf.template /etc/nginx/templates/default.https.conf.template
COPY deploy/nginx/10-select-server-template.sh /docker-entrypoint.d/10-select-server-template.sh
RUN tr -d '\015' < /docker-entrypoint.d/10-select-server-template.sh > /tmp/select-server-template.sh \
    && cat /tmp/select-server-template.sh > /docker-entrypoint.d/10-select-server-template.sh \
    && rm /tmp/select-server-template.sh \
    && chmod +x /docker-entrypoint.d/10-select-server-template.sh
COPY --from=frontend-build /app/frontend/dist/ /usr/share/nginx/html/
