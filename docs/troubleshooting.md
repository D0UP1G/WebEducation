# Устранение неполадок

## Контейнеры не запускаются

Проверьте Docker Compose и состояние сервисов:

```bash
docker compose version
docker compose ps
docker compose logs --tail=100 web proxy db runner
```

Если изменялись зависимости или frontend, пересоберите образы:

```bash
docker compose up --build -d
```

## Страница открывается, но вход не работает

Убедитесь, что frontend и backend используют один адрес, а адрес страницы есть
в `DJANGO_CSRF_TRUSTED_ORIGINS`. Для Docker-демо запускайте `start-demo.sh`
или `start-demo.cmd` в Windows,
для локальных портов 5173 и 8000 используйте значения из корневого README.

Проверьте, что демо-данные созданы:

```bash
docker compose exec web python manage.py seed_demo
```

Логины `admin_demo`, `curator_demo`, `student_demo` используют пароль `demo`.

## API возвращает ошибку после изменения схемы

Примените миграции и проверьте приложение:

```bash
docker compose exec web python manage.py migrate
docker compose exec web python manage.py check
```

При проблеме с конкретным запросом сохраните HTTP-статус, URL и заголовок
`X-Request-ID`.

## Не загружается Python-редактор или frontend

При локальной разработке установите зависимости заново командой `npm ci`, затем
запустите `npm run build`. Docker-контейнер копирует Pyodide при сборке frontend;
CDN для работы приложения не нужен.

## Ошибка импорта учебного пакета

Запустите `preflight_curriculum_import` из каталога `backend`. Команда проверяет
хэш исходного DOCX, структуру JSON, типы шагов и обязательные доказательства без
изменения базы. Исправляйте карту или исходный источник согласованно и повторяйте
проверку до импорта.

## Другие причины

Перед удалением томов или повторной инициализацией базы сохраните backup. Не
используйте реальные персональные данные в локальном демо и не публикуйте
секреты из `.env`.
