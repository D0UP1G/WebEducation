#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_root"

usage() {
    cat <<'EOF'
Usage:
  ./scripts/start-demo.sh
  ./scripts/start-demo.sh --lan [PRIVATE_IPV4]

Default mode serves only this computer at http://localhost:8080.
LAN mode binds to one private IPv4 address, for example 192.168.1.25.
EOF
}

mode=local
lan_ip=
if [ "$#" -gt 0 ]; then
    case "$1" in
        --lan)
            mode=lan
            shift
            if [ "$#" -gt 0 ]; then
                lan_ip=$1
                shift
            fi
            ;;
        --help|-h)
            usage
            exit 0
            ;;
        *)
            usage >&2
            exit 2
            ;;
    esac
fi
if [ "$#" -gt 0 ]; then
    usage >&2
    exit 2
fi

if ! command -v docker >/dev/null 2>&1; then
    echo "Docker CLI was not found. Install Docker Engine/Desktop with the Compose plugin first." >&2
    exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
    echo "Docker Compose v2 is unavailable. Install or enable the Docker Compose plugin." >&2
    exit 1
fi

if [ ! -f .env ]; then
    cp .env.example .env
    echo "Created .env from .env.example. Local demo defaults are in use."
fi

read_setting() {
    name=$1
    case "$name" in
        PROXY_PORT) value=${PROXY_PORT-} ;;
        DJANGO_ALLOWED_HOSTS) value=${DJANGO_ALLOWED_HOSTS-} ;;
        DJANGO_CSRF_TRUSTED_ORIGINS) value=${DJANGO_CSRF_TRUSTED_ORIGINS-} ;;
        *) return 2 ;;
    esac
    if [ -z "$value" ]; then
        value=$(sed -n "s/^${name}=//p" .env | tail -n 1)
    fi
    value=${value#\"}
    value=${value%\"}
    printf '%s' "$value"
}

proxy_setting=$(read_setting PROXY_PORT)
case "$proxy_setting" in
    *:*) proxy_port=${proxy_setting##*:} ;;
    *) proxy_port=$proxy_setting ;;
esac
proxy_port=${proxy_port:-8080}
case "$proxy_port" in
    *[!0-9]*|'')
        echo "PROXY_PORT must end in a numeric port (current value: $proxy_setting)." >&2
        exit 2
        ;;
esac
if [ "$proxy_port" -lt 1 ] || [ "$proxy_port" -gt 65535 ]; then
    echo "PROXY_PORT must be between 1 and 65535 (current value: $proxy_port)." >&2
    exit 2
fi

append_csv() {
    list=$1
    item=$2
    case ",$list," in
        *",$item,"*) printf '%s' "$list" ;;
        *)
            if [ -n "$list" ]; then
                printf '%s,%s' "$list" "$item"
            else
                printf '%s' "$item"
            fi
            ;;
    esac
}

allowed_hosts=$(append_csv "$(read_setting DJANGO_ALLOWED_HOSTS)" "localhost")
allowed_hosts=$(append_csv "$allowed_hosts" "127.0.0.1")
trusted_origins=$(append_csv "$(read_setting DJANGO_CSRF_TRUSTED_ORIGINS)" "http://localhost:${proxy_port}")
trusted_origins=$(append_csv "$trusted_origins" "http://127.0.0.1:${proxy_port}")

if [ "$mode" = lan ]; then
    if [ -z "$lan_ip" ]; then
        if command -v ip >/dev/null 2>&1; then
            lan_ip=$(ip -o -4 addr show scope global 2>/dev/null | awk '
                $2 !~ /^(docker|br-|veth|cni|virbr|podman)/ {
                    split($4, parts, "/")
                    address = parts[1]
                    if (address ~ /^10\./ || address ~ /^192\.168\./ ||
                        address ~ /^172\.(1[6-9]|2[0-9]|3[01])\./) {
                        print address
                        exit
                    }
                }
            ')
        fi
    fi
    case "$lan_ip" in
        10.*|192.168.*|172.1[6-9].*|172.2[0-9].*|172.3[01].*) ;;
        *)
            echo "Could not identify a private LAN address. Pass one explicitly: ./scripts/start-demo.sh --lan 192.168.1.25" >&2
            exit 2
            ;;
    esac

    allowed_hosts=$(append_csv "$allowed_hosts" "$lan_ip")
    trusted_origins=$(append_csv "$trusted_origins" "http://${lan_ip}:${proxy_port}")
    PROXY_PORT="${lan_ip}:${proxy_port}" \
        DJANGO_ALLOWED_HOSTS="$allowed_hosts" \
        DJANGO_CSRF_TRUSTED_ORIGINS="$trusted_origins" \
        docker compose up --build --detach --wait --wait-timeout 180
    demo_url="http://${lan_ip}:${proxy_port}"
else
    DJANGO_ALLOWED_HOSTS="$allowed_hosts" \
        DJANGO_CSRF_TRUSTED_ORIGINS="$trusted_origins" \
        docker compose up --build --detach --wait --wait-timeout 180
    demo_url="http://localhost:${proxy_port}"
fi

docker compose exec -T web python manage.py seed_demo

printf '\nDemo is ready: %s\n' "$demo_url"
printf 'Demo accounts use password: demo\n'
if [ "$mode" = lan ]; then
    printf 'Open this address from devices on the same network. The host firewall must allow TCP %s from that LAN.\n' "$proxy_port"
fi
printf 'Stop the stack with: docker compose down\n'
