# Запуск и развёртывание

## Docker Compose

Основной сценарий на Linux и macOS:

```bash
cp .env.example .env
./scripts/start-demo.sh
```

В Windows Command Prompt запустите `scripts\start-demo.cmd`. Этот скрипт также
создаёт `.env`, поднимает Compose и загружает демо-данные.

Скрипт ждёт готовности зависимостей, применяет миграции, собирает frontend и
вызывает `seed_demo`. По умолчанию приложение доступно только на компьютере,
запустившем Docker, по адресу <http://localhost:8080/>.

Сервисы Compose:

| Сервис | Назначение |
| --- | --- |
| `db` | PostgreSQL и постоянный том `postgres_data` |
| `web` | Django API, миграции и gunicorn |
| `proxy` | Nginx, собранный frontend и проксирование `/api/` и `/media/` |
| `runner` | Python-проверка без сети через Unix-сокет |

Проверка готовности:

```bash
curl http://localhost:8080/api/v1/health
docker compose ps
```

Остановка не удаляет именованные тома:

```bash
docker compose down
```

Для полного удаления данных сначала убедитесь, что они больше не нужны, затем
используйте отдельную команду Compose с явным удалением томов.

## Доступ по локальной сети

```bash
./scripts/start-demo.sh --lan 192.168.1.25
```

Укажите частный IPv4-адрес компьютера с Docker. Скрипт добавит адрес в hosts и
CSRF origins и напечатает URL для других устройств. Если страница не открывается,
проверьте, что устройства находятся в одной сети и firewall разрешает TCP-порт
8080.

## Конфигурация

Локальные значения находятся в `.env.example`. Перед внешним размещением:

- задайте случайный `DJANGO_SECRET_KEY`;
- замените пароль PostgreSQL и `DATABASE_URL`;
- укажите домен в `DJANGO_ALLOWED_HOSTS`;
- добавьте полный `https://...` адрес в `DJANGO_CSRF_TRUSTED_ORIGINS`;
- используйте `DJANGO_DEBUG=0` и отдельные секреты вне репозитория;
- оставьте на стенде только синтетические данные.

Размер загружаемого файла проверяется на уровне Nginx и Django. В стандартной
конфигурации Django принимает до 10 MiB (`MAX_UPLOAD_SIZE`), а Nginx оставляет
небольшой запас для multipart-оболочки (`CLIENT_MAX_BODY_SIZE`). При изменении
одного значения проверьте второе.

Официальный Python-код запускается в `runner`: сеть отключена, файловая система
ограничена, процесс получает лимиты CPU, памяти, PID и времени. Браузерный
Pyodide используется только для открытого примера и не влияет на оценку.

## HTTPS

Профиль HTTPS принимает сертификат и ключ из файловой системы хоста:

```bash
TLS_CERTIFICATE_FILE=/etc/letsencrypt/live/example/fullchain.pem \
TLS_CERTIFICATE_KEY_FILE=/etc/letsencrypt/live/example/privkey.pem \
docker compose -f docker-compose.yml -f docker-compose.https.yml up --build -d
```

Перед запуском проверьте наличие обоих файлов, домен в разрешённых адресах и
настоящие секреты. Сертификаты и ключи не копируются в образ и не добавляются в
Git.

## Локальная разработка

Backend запускается на порту 8000, frontend — на порту 5173. Полные команды
приведены в [корневом README](../README.md). Для frontend доступны
`npm run typecheck`, `npm test` и `npm run build`.

Каждый API-ответ содержит `X-Request-ID`; это значение полезно приложить к
сообщению об ошибке вместе с URL и действием пользователя.
