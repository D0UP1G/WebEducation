# База данных и учебный импорт

## Где хранятся данные

В Docker Compose PostgreSQL хранится в именованном томе `postgres_data`, а
загруженные материалы — в `media_data`. Локальный запуск без Docker использует
настройку базы из окружения и обычно SQLite. Учебная история и файлы не должны
храниться только в контейнерном слое.

## Миграции и проверки

В контейнере миграции выполняются при старте `web`. В локальной разработке:

```bash
cd backend
../.venv/bin/python manage.py migrate
../.venv/bin/python manage.py makemigrations --check --dry-run
../.venv/bin/python manage.py check
```

## Импорт официального пакета

Карта [curriculum-map.json](organizer/curriculum-map.json) содержит 3 курса,
9 модулей и 30 шагов. Перед записью в базу можно проверить источник и структуру:

```bash
cd backend
../.venv/bin/python manage.py preflight_curriculum_import
```

Импорт выполняется администратором-владельцем. Команда обновляет draft и при
`--publish` публикует изменённые версии:

```bash
../.venv/bin/python manage.py import_curriculum --owner admin_demo --publish
```

`seed_demo` создаёт три синтетические учётные записи, импортирует и публикует
официальные курсы и назначает их ученику:

```bash
../.venv/bin/python manage.py seed_demo
```

Обе команды рассчитаны на повторный запуск: известные записи обновляются по
стабильным `source_id`, а одинаковые опубликованные ревизии не дублируются.
Исходный DOCX нужен для проверки карты; приложение читает во время запуска
подготовленный JSON-манифест.

## Резервное копирование

Для согласованной копии PostgreSQL и media остановите запись:

```bash
docker compose stop proxy web
./scripts/backup-instance.sh
docker compose up -d web proxy
```

В `backups/` появятся dump базы и ZIP с media. В ZIP могут быть ученические
работы, поэтому обе копии нужно защищать одинаково.

## Восстановление

Восстановление заменяет текущие данные. Сначала сделайте свежую резервную копию,
остановите `web` и `proxy`, затем выполните команды с явным подтверждением:

```bash
docker compose stop web proxy
CONFIRM_RESTORE=1 ./scripts/restore-db.sh backups/webeducation-YYYYMMDDTHHMMSSZ.dump
CONFIRM_RESTORE=1 ./scripts/restore-media.sh backups/webeducation-YYYYMMDDTHHMMSSZ.media.zip
docker compose up -d web proxy
```

После восстановления проверьте healthcheck, вход и наличие файлов. Не запускайте
восстановление на единственной копии важных данных.
