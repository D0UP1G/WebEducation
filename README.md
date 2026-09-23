# WebEducation

Проект образовательной платформы для самостоятельной подготовки школьников 1–9 классов по спортивному программированию. Основание — [кейс хакатона](keys-obrazovatelnaya-platforma.pdf) Федерации спортивного программирования Чувашской Республики.

## Текущее состояние

В `develop` объединены ядро DEV-1, React-клиент DEV-2 и модули DEV-3:
вход и кабинеты трёх ролей, редактор курса, шесть типов шагов, сдачи,
браузерная проверка Python, ручная проверка, вопросы и прогресс. Код и API
покрыты тестами; полный сценарий на развёрнутом HTTPS-стенде ещё не проверен.
Оставшиеся задачи и ограничения описаны в [DEV-3 handoff](docs/dev3-handoff.md)
и [сверке с кейсом](docs/case-alignment.md).

Кейс требует работающие контуры **ученика, куратора и администратора**, разнотипные шаги (теория, контрольный вопрос, задача с точным ответом, Scratch, Minecraft Education, алгоритмическая задача с тестами), автоматическую и ручную проверку, объяснимый прогресс и рейтинг. Точный перечень выполненного, недостающего и критерии приёмки — в [сверке с кейсом](docs/case-alignment.md).

## Документы

- [Документация команды](docs/README.md) — порядок чтения и правила координации.
- [Backend handoff](docs/backend-handoff.md) — исторический срез после каркаса DEV-1.
- [DEV-3 handoff](docs/dev3-handoff.md) — сдачи, куратор и браузерный Python.
- [Архитектура](ARCHITECTURE.md) — модель данных, границы компонентов и правила безопасности.
- [API-контракт](docs/api-contract.md) — маршруты, состояния и форматы ответов.
- [Пользовательские сценарии](docs/user-flows.md) — экраны и действия трёх ролей.
- [План реализации](ROADMAP.md) — приоритеты до защиты.

## Быстрый запуск

```bash
cp .env.example .env
docker compose up --build -d
docker compose exec web python manage.py seed_demo
```

API после healthcheck доступен на `http://localhost:8080/api/v1/`, проверка:

```bash
curl http://localhost:8080/api/v1/health
```

Корень `/` отдаёт собранный React-клиент, а `/api/v1/` проксируется в Django.
Python-код запускается в браузере ученика через Pyodide; отдельный worker в
Compose не используется.

Локально без Docker используется SQLite:

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cd backend
../.venv/bin/python manage.py migrate
../.venv/bin/python manage.py seed_demo
DJANGO_CSRF_TRUSTED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173 ../.venv/bin/python manage.py runserver
```

Для разработки интерфейса в другом терминале:

```bash
cd frontend
npm ci
npm run dev
```

Откройте `http://localhost:5173/`; Vite проксирует `/api/` на локальный Django
порт 8000. Адрес Vite указан в `DJANGO_CSRF_TRUSTED_ORIGINS`, чтобы браузерный
вход не отклонялся проверкой Origin. Команды проверки frontend приведены в
[его README](frontend/README.md).

Тесты:

```bash
cd backend
../.venv/bin/python manage.py test
```

## Demo-аккаунты

После `seed_demo` доступны синтетические пользователи с паролем `demo`:

- `admin_demo`
- `curator_demo`
- `student_demo`

Перед входом браузер получает CSRF cookie через `GET /api/v1/auth/csrf`, затем
передаёт токен в `X-CSRFToken` для изменяющих запросов.

## Границы параллельной разработки

- DEV-1 владеет `config`, `accounts`, `courses`, общими моделями
  `learning/models.py`, корневыми URL и миграциями.
- DEV-2 использует маршруты и envelope из `docs/api-contract.md`; работают
  auth, admin core и ученическое чтение. Формы сдачи и страницы куратора
  подключены к контрактным маршрутам DEV-3.
- DEV-3 владеет `grading`, `mentoring` и браузерным протоколом Python.
  Прогресс сейчас рассчитывает `learning.services.build_progress`; отдельный
  `progress` API-модуль не понадобился. URL-модули DEV-3 подключены.

Изменения общих моделей и миграций предварительно согласуются с DEV-1.

## Данные и права

Для разработки и показа используются только синтетические данные. Не загружайте реальные сведения об учениках, родителях и педагогах. Код проекта распространяется по [лицензии MIT](LICENSE). Материалы кейса и будущий учебный пакет организатора нужно учитывать отдельно от лицензии на код.

## Ветки

`main` — готовые к выпуску версии; `develop` — интеграция; `feature/*` создаются от `develop` и вливаются в неё через PR; `release/*` идёт из `develop` в `main` с обратной синхронизацией; `hotfix/*` идёт из `main` в обе постоянные ветки. Подробнее — в [архитектуре](ARCHITECTURE.md#13-git-и-слияния).
