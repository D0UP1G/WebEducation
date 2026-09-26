#!/bin/sh
set -eu

template_dir=/etc/nginx/templates
https_enabled=${HTTPS_ENABLED:-0}

case "$https_enabled" in
    0)
        selected_template="$template_dir/default.conf.template"
        ;;
    1)
        certificate=${TLS_CERTIFICATE_PATH:-/etc/nginx/tls/fullchain.pem}
        certificate_key=${TLS_CERTIFICATE_KEY_PATH:-/etc/nginx/tls/privkey.pem}
        if [ ! -f "$certificate" ] || [ ! -f "$certificate_key" ]; then
            printf 'HTTPS_ENABLED=1 requires readable TLS certificate and key files.\n' >&2
            exit 1
        fi
        selected_template="$template_dir/default.https.conf.template"
        ;;
    *)
        printf 'HTTPS_ENABLED must be 0 or 1.\n' >&2
        exit 1
        ;;
esac

cp "$selected_template" "$template_dir/active.conf.template"
rm -f "$template_dir/default.conf.template" "$template_dir/default.https.conf.template"
mv "$template_dir/active.conf.template" "$template_dir/default.conf.template"
