# Backend handoff после каркаса DEV-1

Исторический срез каркаса DEV-1 до объединения PR #9 и #10. Упоминания
«сейчас», незавершённых frontend/DEV-3 API и worker ниже относятся к тому
моменту, а не к текущему `develop`. Текущее состояние — в
[сверке с кейсом](case-alignment.md) и [DEV-3 handoff](dev3-handoff.md).
Источник истины по API — [контракт](api-contract.md) и код.

Текущий DEV-1 status после PR #14–#20: API получает коррелированный
`request_id` в ответах и stdout-логах, лимит тела Nginx задаётся через
`CLIENT_MAX_BODY_SIZE`, превышение точного лимита файла возвращает
`413 file_too_large`, а в `scripts/` добавлены backup/restore для PostgreSQL.
Для стенда добавлен отдельный HTTPS Compose-профиль с внешними PEM-файлами;
локальный HTTP-профиль по умолчанию не требует сертификатов.
Текущая локальная проверка — 26 backend-тестов и 25 frontend-тестов; Docker и
Nginx CLI на рабочей машине отсутствуют, поэтому Compose, HTTPS и live recovery
остаются стендовыми проверками.

## 1. Быстрый старт

Docker-вариант:

```bash
cp .env.example .env
docker compose up --build -d
docker compose exec web python manage.py seed_demo
curl http://localhost:8080/api/v1/health
```

Локальный вариант с SQLite:

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cd backend
../.venv/bin/python manage.py migrate
../.venv/bin/python manage.py seed_demo
../.venv/bin/python manage.py runserver
```

Проверка перед каждым PR:

```bash
cd backend
../.venv/bin/python manage.py check
../.venv/bin/python manage.py test
../.venv/bin/python manage.py makemigrations --check --dry-run
```

Исторический baseline этого handoff: 8 тестов проходили, system check был без
ошибок, расхождений моделей и миграций не было. На текущей машине DEV-1 Docker
CLI по-прежнему отсутствует; Django, миграции и seed проверяются исполняемым
локальным прогоном.

## 2. Demo-данные

Команда `python manage.py seed_demo` идемпотентно создаёт:

- `admin_demo / demo`;
- `curator_demo / demo`;
- `student_demo / demo`;
- один опубликованный синтетический курс из шести P0-типов;
- одно назначение ученика с куратором.

После повторного запуска остаются 3 пользователя, 1 курс, 1 ревизия, 6 draft
steps, 6 published steps и 1 enrollment.

## 3. Реализованная инфраструктура

- Django 5.2, DRF, PostgreSQL в Compose и SQLite fallback для локальной работы.
- Сервисы `db`, `web`, `proxy`, healthcheck и persistent volumes; Python
  запускается в браузерном Web Worker, отдельный Compose worker удалён.
- API envelope `data/meta/error`, `request_id`, пагинация и role permissions.
- Все доменные конфликты используют `409` и `error.code = state_conflict`.
- Сессионная авторизация и CSRF. Все browser fetch-запросы используют
  `credentials: "include"`; изменяющие запросы передают `X-CSRFToken`.
- UUID-идентификаторы и UTC-время.
- Nginx собирает и отдаёт React SPA DEV-2, проксирует `/api/` в Django;
  маршруты `/admin/` принадлежат React, Django admin доступен при прямом локальном запуске backend
  и сохраняет исходный Host с портом для same-origin CSRF.
- Backup/restore runbook для PostgreSQL находится в корневом `README.md`, а
  сгенерированные dump-файлы исключены из Git.

Успешный объект:

```json
{"data": {"id": "uuid"}, "meta": {"request_id": "uuid"}}
```

Ошибка:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Проверьте данные формы",
    "fields": {"title": ["Обязательное поле"]}
  },
  "meta": {"request_id": "uuid"}
}
```

Маршруты объявлены без завершающего `/`.

## 4. Реализованные маршруты

| Метод | Маршрут | Состояние |
|---|---|---|
| GET | `/api/v1/health` | Работает, проверяет БД |
| GET | `/api/v1/auth/csrf` | Работает |
| POST | `/api/v1/auth/login` | Работает, CSRF обязателен |
| POST | `/api/v1/auth/logout` | Работает |
| GET | `/api/v1/auth/me` | Работает |
| GET/POST | `/api/v1/admin/courses` | Работает |
| GET/PATCH | `/api/v1/admin/courses/{course_id}` | Работает |
| GET | `/api/v1/admin/courses/{course_id}/preview` | Работает, скрытые поля удаляются |
| POST | `/api/v1/admin/courses/{course_id}/steps` | Работает, вставляет шаг в указанную позицию |
| PATCH/DELETE | `/api/v1/admin/courses/{course_id}/steps/{step_id}` | Работает, атомарно переставляет или уплотняет порядок |
| POST | `/api/v1/admin/courses/{course_id}/publish` | Работает атомарно |
| GET | `/api/v1/admin/course-types` | Работает, возвращает 6 типов |
| GET | `/api/v1/admin/users?role=student\|curator` | Работает |
| GET/POST | `/api/v1/admin/enrollments` | Работает |
| PATCH | `/api/v1/admin/enrollments/{enrollment_id}` | Работает: curator/status |
| GET | `/api/v1/student/courses` | Работает, включает progress summary |
| GET | `/api/v1/student/enrollments/{enrollment_id}` | Работает |
| GET | `/api/v1/student/enrollments/{enrollment_id}/progress` | Временная core-реализация |
| GET | `/api/v1/student/enrollments/{enrollment_id}/steps/{step_id}` | Работает |

В историческом срезе этого документа submission, question и curator endpoint'ы
ещё ожидали DEV-3. В текущем `develop` они реализованы в `grading` и
`mentoring`; актуальные маршруты и ограничения описаны в `api-contract.md`.

## 5. Общая модель данных

DEV-1 создал начальные миграции и владеет их согласованием:

- `User`: UUID, username, display name, одна роль.
- `Course`: изменяемые draft metadata и ссылка на последнюю публикацию.
- `DraftStep`: редактируемый шаг с уникальной позицией внутри курса.
- `CourseRevision`: неизменяемый snapshot метаданных курса и номер версии.
- `StepRevision`: неизменяемый snapshot шага конкретной публикации.
- `Enrollment`: student, curator, конкретная `CourseRevision`, status.
- `Submission`: enrollment, step, student, attempt, status, payload/file/url,
  score, feedback, safe diagnostics и idempotency metadata.
- `Review`: one-to-one решение куратора по Submission.
- `StepQuestion`: вопрос в контексте enrollment + published step.

Ключевые инварианты:

- публикация выполняется через `courses.services.publish_course`;
- опубликованные объекты нельзя менять обычным `save/delete`;
- enrollment никогда автоматически не переключается на новую ревизию;
- создание Enrollment блокирует Course и повторно читает `latest_revision`, чтобы
  параллельная публикация не создала назначение на устаревшую версию;
- уникальная пара `student + revision` возвращает `409 state_conflict` при
  повторном назначении вместо внутренней ошибки;
- student API получает только шаг из ревизии своего enrollment;
- hidden answers/tests остаются в server-side `content` и удаляются через
  `public_step_content`;
- принятый шаг учитывается в прогрессе максимум один раз;
- DEV-3 не создаёт дублирующие модели Submission/Review/Question.

## 6. Реестр типов шагов

Реестр находится в `backend/apps/courses/step_types.py`:

| type_key | Проверка | Скрытые поля |
|---|---|---|
| `theory` | instant complete | нет |
| `quiz.single_choice` | instant backend | `correct_option_id` |
| `quiz.multiple_choice` | instant backend | `correct_option_ids` |
| `answer.exact` | instant backend | `accepted_answers` |
| `algorithm.python` | browser Web Worker + server comparison | `tests` |
| `artifact.scratch` | manual curator | нет |
| `artifact.minecraft` | manual curator | нет |

DEV-3 добавляет проверяющие обработчики через этот интерфейс, не разветвляет
общие таблицы по типам. DEV-2 выбирает renderer по `type_key`.

## 6.1. Порядок draft-шагов

`position` в draft всегда представляет непрерывную последовательность от `1`.
Сервис courses берёт блокировку курса, переводит затронутые строки во временные
свободные позиции и затем сохраняет новый порядок одной транзакцией. Поэтому
сдвиг, вставка и удаление не нарушают `unique(course, position)` и не оставляют
в базе временную позицию при ошибке запроса.

DEV-2 переставляет шаг одним `PATCH` с новой `position`; прежняя схема из трёх
PATCH исключена. Публикация копирует уже нормализованный порядок в новую
неизменяемую ревизию.

## 7. Инструкция DEV-2

Владелец файлов: весь `frontend/`. Backend-модели, миграции и контракт напрямую
не менять.

Можно сразу реализовывать:

1. API client с `credentials: "include"` и общим envelope.
2. Получение CSRF перед login и роль через `/auth/me`.
3. Student courses/enrollment/step/progress.
4. Admin courses, draft steps, preview, publish и enrollment assignment.
5. Renderer registry для шести `type_key`.

Submission и curator UI сначала подключать к fixtures по точным payload из
`api-contract.md`, затем переключить на API DEV-3. Не добавлять mock-only поля в
контракт без согласования.

DEV-2 уже добавил сборку `frontend/dist` в proxy image. При изменении маршрутов
SPA проверить nginx fallback `try_files ... /index.html` и не менять API prefix.

## 8. Инструкция DEV-3

Владелец файлов:

```text
backend/apps/grading/
backend/apps/mentoring/
backend/apps/progress/
backend/worker/                 # если будет создан
```

В историческом срезе уже были подключены:

- `grading.student_urls` под `/api/v1/student/`;
- `progress.student_urls` под `/api/v1/student/`, перед временным core route;
- `mentoring.urls` под `/api/v1/curator/`;
- management command `run_grading_worker` как заменяемая точка входа Compose;
  позже worker удалён вместе с переходом на browser Pyodide.

Очередность DEV-3:

1. Доменный service создания Submission: ownership, принадлежность step к
   revision, active-attempt conflict, attempt number и `Idempotency-Key`.
2. Теория, quiz и exact answer с безопасным feedback.
3. Artifact URL/file validation и `pending_review`.
4. Curator queue/detail/review с блокировкой конкурентного решения.
5. Questions/answers и защищённая выдача файла.
6. Progress override и lag signals.
7. Изолированный runner: без сети, БД, secrets и Docker socket у web; с лимитами
   CPU/RAM/time/process/input/output.

Текущий worker — не sandbox и не может использоваться для исполнения кода.
Статусы и переходы брать только из `api-contract.md`.

## 9. Владение файлами и миграции

| Зона | Владелец |
|---|---|
| `backend/config/`, root URL | DEV-1 |
| `backend/apps/accounts/` | DEV-1 |
| `backend/apps/courses/` | DEV-1 |
| `backend/apps/learning/models.py` | DEV-1 |
| `backend/apps/*/migrations/` | DEV-1 координирует порядок |
| `backend/apps/grading/` | DEV-3 |
| `backend/apps/mentoring/` | DEV-3 |
| `backend/apps/progress/` | DEV-3 |
| `frontend/` | DEV-2 |

Если DEV-3 нужны новые общие поля:

1. описать поле, инвариант и нужный индекс;
2. согласовать с DEV-1;
3. DEV-1 меняет общую модель и выпускает миграцию либо явно передаёт право на
   одну именованную миграцию;
4. обе ветки синхронизируются с `develop` до следующей миграции.

Не редактировать `0001_initial.py` после merge в `develop`.

## 10. Что ещё не реализовано в историческом срезе

- submission create/detail/history и фактическая идемпотентность;
- automatic quiz/exact handlers;
- изолированный Python runner;
- upload limits/MIME validation и авторизованное скачивание;
- curator students/reviews/questions;
- review state machine и конкурентные блокировки;
- lag signals;
- полноценный E2E publish → submit → return → resubmit → accept;
- React frontend и его production-сборка;
Этот список описывает состояние до DEV-3 и не является checklist текущего
`develop`. Актуальные незакрытые пункты — только стендовая проверка Compose,
HTTPS, backup/restore, persistent media и полный браузерный E2E; код этих
сценариев и инструкции уже находятся в текущем репозитории.

## 11. GitFlow для продолжения

После merge `feature/platform-core` в `develop`:

```bash
git fetch origin
git switch develop
git pull --ff-only origin develop
git switch -c feature/role-ui              # DEV-2
# или
git switch -c feature/submission-grading   # DEV-3
```

PR направляется в `develop`. В `main` и `develop` напрямую не коммитить.
