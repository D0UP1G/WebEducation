# Backend handoff после каркаса DEV-1

Статус на 23 сентября 2026: интеграционная основа готова для параллельной работы
DEV-2 и DEV-3. Источник истины по API — этот документ, `api-contract.md` и код.

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

Проверенный baseline: 7 тестов проходят, system check без ошибок, расхождений
моделей и миграций нет. На машине DEV-1 отсутствовал Docker CLI, поэтому Compose
проверен статически, а Django, миграции и seed — исполняемым локальным прогоном.

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
- Сервисы `db`, `web`, `worker`, `proxy`, healthcheck и persistent volumes.
- API envelope `data/meta/error`, `request_id`, пагинация и role permissions.
- Сессионная авторизация и CSRF. Все browser fetch-запросы используют
  `credentials: "include"`; изменяющие запросы передают `X-CSRFToken`.
- UUID-идентификаторы и UTC-время.
- Nginx проксирует `/api/`; корень `/` до подключения DEV-2 отвечает `503`.
- Worker сейчас является lifecycle scaffold и не исполняет ученический код.

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
| POST | `/api/v1/admin/courses/{course_id}/steps` | Работает |
| PATCH/DELETE | `/api/v1/admin/courses/{course_id}/steps/{step_id}` | Работает |
| POST | `/api/v1/admin/courses/{course_id}/publish` | Работает атомарно |
| GET | `/api/v1/admin/course-types` | Работает, возвращает 6 типов |
| GET | `/api/v1/admin/users?role=student\|curator` | Работает |
| GET/POST | `/api/v1/admin/enrollments` | Работает |
| PATCH | `/api/v1/admin/enrollments/{enrollment_id}` | Работает: curator/status |
| GET | `/api/v1/student/courses` | Работает, включает progress summary |
| GET | `/api/v1/student/enrollments/{enrollment_id}` | Работает |
| GET | `/api/v1/student/enrollments/{enrollment_id}/progress` | Временная core-реализация |
| GET | `/api/v1/student/enrollments/{enrollment_id}/steps/{step_id}` | Работает |

Все submission, question и curator endpoint'ы из `api-contract.md` ещё должен
реализовать DEV-3.

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
| `answer.exact` | instant backend | `accepted_answers` |
| `algorithm.python` | isolated worker | `tests` |
| `artifact.scratch` | manual curator | нет |
| `artifact.minecraft` | manual curator | нет |

DEV-3 добавляет проверяющие обработчики через этот интерфейс, не разветвляет
общие таблицы по типам. DEV-2 выбирает renderer по `type_key`.

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

Для nginx DEV-2 должен либо добавить сборку `frontend/dist` в proxy image, либо
добавить frontend service и проксирование. До этого ожидаемый ответ `/` — `503`.

## 8. Инструкция DEV-3

Владелец файлов:

```text
backend/apps/grading/
backend/apps/mentoring/
backend/apps/progress/
backend/worker/                 # если будет создан
```

Уже подключены:

- `grading.student_urls` под `/api/v1/student/`;
- `progress.student_urls` под `/api/v1/student/`, перед временным core route;
- `mentoring.urls` под `/api/v1/curator/`;
- management command `run_grading_worker` как заменяемая точка входа Compose.

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

## 10. Что ещё не реализовано

- submission create/detail/history и фактическая идемпотентность;
- automatic quiz/exact handlers;
- изолированный Python runner;
- upload limits/MIME validation и авторизованное скачивание;
- curator students/reviews/questions;
- review state machine и конкурентные блокировки;
- lag signals;
- полноценный E2E publish → submit → return → resubmit → accept;
- React frontend и его production-сборка;
- проверка Compose на машине с Docker.

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
