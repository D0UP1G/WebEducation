# API-контракт WebEducation

Статус: контракт v1 зафиксирован для параллельной реализации. Core-маршруты
auth/admin/student read реализованы в `feature/platform-core`; submission,
curator и worker остаются за DEV-3. Фактическая матрица реализации находится в
[backend handoff](backend-handoff.md). Правила оценки и границы MVP сверены с
[кейсом](case-alignment.md).

Контракт спроектирован под модульный монолит Django + Django REST Framework,
PostgreSQL и React-клиент из `ARCHITECTURE.md`. Все данные в демо синтетические.

## 1. Общие правила

- Base URL: `/api/v1`.
- Формат: JSON; даты и время — ISO 8601 в UTC.
- Авторизация: сессия Django. Для state-changing запросов из браузера передаётся
  CSRF-токен в `X-CSRFToken`.
- Один домен для React и API: `/` и `/api/v1/`.
- Сервер всегда проверяет роль и принадлежность ресурса пользователю. Нельзя
  считать скрытие кнопки на фронтенде проверкой доступа.
- Пагинация списков: `?page=1&page_size=20`, максимум `100`.
- Сортировка задаётся явно только на поддержанных полях; дефолт — новые записи
  сверху.
- Идентификаторы — UUID в строковом представлении.

Успешный объект возвращается напрямую в `data`:

```json
{
  "data": { "id": "uuid", "title": "Основы Python" },
  "meta": { "request_id": "uuid" }
}
```

Для списка:

```json
{
  "data": [{ "id": "uuid", "title": "Основы Python" }],
  "meta": { "page": 1, "page_size": 20, "total": 1, "request_id": "uuid" }
}
```

Ошибка:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Проверьте данные формы",
    "fields": { "answer": ["Поле обязательно"] }
  },
  "meta": { "request_id": "uuid" }
}
```

Базовые HTTP-статусы: `400` — неверные данные, `401` — не вошёл, `403` — нет
прав, `404` — ресурс не найден или скрыт политикой доступа, `409` — конфликт
состояния, `413` — файл слишком большой, `429` — слишком много запросов,
`500` — внутренняя ошибка.

## 2. Сессия и текущий пользователь

| Метод и путь | Роль | Назначение |
|---|---|---|
| `GET /auth/csrf` | public | Создать/обновить CSRF-cookie перед входом |
| `POST /auth/login` | public | Войти по синтетическим credentials |
| `POST /auth/logout` | authenticated | Завершить сессию |
| `GET /auth/me` | authenticated | Текущий пользователь и роли |

`POST /auth/login`:

```json
{ "username": "student_demo", "password": "demo" }
```

`GET /auth/me`:

```json
{
  "data": {
    "id": "uuid",
    "display_name": "Алексей",
    "role": "student"
  }
}
```

В MVP один пользователь имеет одну роль: `student`, `curator` или `admin`.

## 3. Каталог и контур ученика

| Метод и путь | Роль | Назначение |
|---|---|---|
| `GET /student/courses` | student | Назначенные ученику курсы |
| `GET /student/enrollments/{enrollment_id}` | student | Курс, текущий шаг и состояние прохождения |
| `GET /student/enrollments/{enrollment_id}/progress` | student | Объяснимые баллы и прогресс |
| `GET /student/enrollments/{enrollment_id}/steps/{step_id}` | student | Данные шага без скрытых ответов/тестов |
| `POST /student/enrollments/{enrollment_id}/steps/{step_id}/submissions` | student | Создать попытку сдачи |
| `GET /student/submissions/{submission_id}` | student | Статус, результат и история комментариев |
| `GET /student/enrollments/{enrollment_id}/steps/{step_id}/submissions` | student | История попыток по шагу, включая последний статус |
| `GET /student/enrollments/{enrollment_id}/steps/{step_id}/questions` | student | Свои вопросы и ответы по шагу назначения |
| `POST /student/enrollments/{enrollment_id}/steps/{step_id}/questions` | student | Задать вопрос закреплённому куратору |

Создание сдачи для разных типов шага использует один endpoint. Поля `answer`,
`code`, `file` и `url` разрешаются валидатором конкретного `type_key`; лишние
поля отклоняются. `theory` завершается сдачей `{ "action": "complete" }` после
открытия материала; это не контрольный вопрос. Сервер проверяет, что `step_id`
принадлежит опубликованной версии из `enrollment_id` и что назначение
принадлежит текущему ученику. Принятый шаг повторно не оценивается.

```json
{ "code": "a, b = map(int, input().split()); print(a + b)" }
```

Для файла запрос — `multipart/form-data` с полем `file`; размер и формат
проверяются до создания попытки. Повторная сдача после `incorrect`, `returned`
или `error` всегда создаёт новую `Submission`, старые попытки не
перезаписываются. Пока попытка находится в `queued`, `checking` или
`pending_review`, повторная сдача того же шага возвращает `409`. Для защиты от
двойного клика клиент передаёт `Idempotency-Key`: повтор с тем же ключом,
учеником, маршрутом и телом возвращает исходную попытку; тот же ключ с другим
телом возвращает `409`.

Ответ сдачи:

```json
{
  "data": {
    "id": "uuid",
    "step_id": "uuid",
    "status": "queued",
    "attempt_number": 1,
    "score": null,
    "max_score": 10,
    "feedback": null,
    "created_at": "2026-09-25T12:00:00Z"
  }
}
```

Для автоматической проверки фронтенд опрашивает `GET /student/submissions/{id}`
с backoff до терминального статуса. В ответе остаются безопасные для ученика
диагностика и число пройденных тестов; скрытые входные данные и правильные
ответы не возвращаются. WebSocket в MVP не нужен. Вопросы и ответы относятся к
паре «назначение + шаг версии», чтобы не смешивать разных учеников и выпуски
курса.

Прогресс:

```json
{
  "data": {
    "completed_steps": 2,
    "total_steps": 5,
    "earned_points": 15,
    "available_points": 40,
    "completion_percent": 40,
    "rating_percent": 37,
    "next_step_id": "uuid",
    "next_action": "complete_step",
    "steps": [
      { "step_id": "uuid", "title": "Теория", "status": "accepted", "earned_points": 5, "max_points": 5 },
      { "step_id": "uuid", "title": "Python", "status": "incorrect", "earned_points": 0, "max_points": 10 }
    ]
  }
}
```

В примере показаны два принятых шага из пяти, 15 баллов из 40:
`completion_percent = floor(2/5 × 100) = 40`,
`rating_percent = floor(15/40 × 100) = 37`. Непоказанные в сокращённом примере
шаги также входят в итоговый список. Баллы за шаг выдаются один раз при первой
принятой попытке, независимо от механизма проверки. `next_action` принимает
`complete_step`, `revise_submission`, `await_review` или `course_complete`;
`next_step_id` равен `null`, когда доступного действия по шагу нет. Рекомендация
выбирает первый незачтённый шаг без ожидающей проверки; открывать опубликованные
шаги повторно можно в любом порядке. Публикация требует хотя бы один шаг и
положительную сумму `max_score`.

## 4. Контур куратора

| Метод и путь | Роль | Назначение |
|---|---|---|
| `GET /curator/students` | curator | Закреплённые ученики и признаки отставания |
| `GET /curator/students/{student_id}/enrollments/{enrollment_id}/progress` | curator | Прогресс закреплённого ученика и основания сигналов |
| `GET /curator/reviews?status=pending_review` | curator | Очередь ручной проверки |
| `GET /curator/submissions/{submission_id}` | curator | Работа, файлы/ссылки и история попыток |
| `POST /curator/submissions/{submission_id}/review` | curator | Принять или вернуть работу |
| `GET /curator/questions?status=unanswered` | curator | Вопросы закреплённых учеников с контекстом назначения и шага |
| `POST /curator/questions/{question_id}/answer` | curator | Ответить на вопрос |

Решение по ручной проверке:

```json
{ "decision": "accepted", "comment": "Результат соответствует заданию" }
```

`decision` — `accepted` или `returned`. Комментарий обязателен при `returned`;
баллы в MVP вычисляет сервер: `max_score` за принятую работу, ноль за возврат.
Поле `score` от клиента отклоняется. Решение допускается только для
`pending_review`; повторное или конкурентное решение возвращает `409`. Куратор
может работать только с закреплёнными учениками. В списке учеников сервер
возвращает `lag_signals` с причиной и временем: 72 часа без зачёта, две
неверные попытки на одном шаге за 24 часа или возврат без пересдачи 24 часа.

## 5. Контур администратора

| Метод и путь | Роль | Назначение |
|---|---|---|
| `GET /admin/courses` | admin | Курсы и их черновики/версии |
| `POST /admin/courses` | admin | Создать курс |
| `GET /admin/courses/{course_id}` | admin | Открыть курс и текущий draft |
| `GET /admin/courses/{course_id}/preview` | admin | Предпросмотр draft без публикации и скрытых ответов ученику |
| `PATCH /admin/courses/{course_id}` | admin | Изменить draft курса |
| `POST /admin/courses/{course_id}/steps` | admin | Добавить шаг в draft |
| `PATCH /admin/courses/{course_id}/steps/{step_id}` | admin | Изменить шаг |
| `DELETE /admin/courses/{course_id}/steps/{step_id}` | admin | Удалить шаг из draft |
| `POST /admin/courses/{course_id}/publish` | admin | Опубликовать новую неизменяемую версию |
| `GET /admin/course-types` | admin | Доступные `type_key` и версии схем |
| `GET /admin/users?role={student|curator}` | admin | Синтетические пользователи для назначения |
| `GET /admin/enrollments` | admin | Список назначений с фильтрами по курсу и участнику |
| `POST /admin/enrollments` | admin | Назначить курс ученику и куратора |
| `PATCH /admin/enrollments/{enrollment_id}` | admin | Изменить куратора/состояние назначения |

Пример шага в draft:

```json
{
  "type_key": "algorithm.python",
  "schema_version": 1,
  "position": 3,
  "title": "Сумма двух чисел",
  "content": {
    "statement": "...",
    "tests": [{ "input": "2 3", "output": "5" }],
    "time_limit_ms": 1000,
    "memory_limit_mb": 128
  },
  "max_score": 10
}
```

Скрытые тесты и правильные ответы хранятся только на сервере и не попадают в
ответ ученику или публичный preview. `publish` атомарно валидирует весь draft,
включая обязательные теорию и контрольный вопрос, создаёт `CourseRevision`
и `StepRevision`, после чего опубликованная версия не редактируется. Ошибка
валидации возвращает список проблем по шагам и не создаёт частичную версию.

## 6. Модель состояний

`Submission.status`:

```text
queued -> checking -> accepted | incorrect | error
queued -> accepted | incorrect (быстрая проверка или теория)
queued -> pending_review -> accepted | returned
incorrect | returned | error -> queued (только новая попытка)
```

Автоматические типы (`quiz.single_choice`, `answer.exact`, `algorithm.python`)
переходят в `checking` или сразу в `accepted/incorrect`; `error` означает
технический сбой, который не считается неверным ответом. `theory` принимается
после действия `complete`. Ручные типы (`artifact.scratch`,
`artifact.minecraft`) переходят в `pending_review`. Принятый шаг начисляет
баллы один раз; прогресс строится из принятых сдач. Состояния попытки после
решения не меняются; пересдача — новая строка с собственным статусом.

## 7. Минимальный демонстрационный сценарий

1. `admin` создаёт draft из `theory`, `quiz.single_choice`, `answer.exact`,
   `algorithm.python`, `artifact.scratch` и `artifact.minecraft`, публикует его и назначает
   ученика с куратором.
2. `student` получает курс, проходит theory/quiz/задачу с ответом, отправляет Python-код и видит
   результат проверки.
3. `student` отправляет Scratch-ссылку; `curator` видит её в очереди и возвращает
   с комментарием.
4. `student` пересдаёт; `curator` принимает работу.
5. `student` видит прогресс и разбивку баллов, `curator` — обновлённое состояние.
6. `admin` публикует новую версию; старая попытка остаётся привязанной к старой
   версии курса.

## 8. Вне контракта MVP

Оплата, CRM, заявки, расписание и посещаемость, общий мессенджер, видеосвязь,
встроенные редакторы Scratch/Minecraft, публичные профили и продуктовые
AI-функции не входят в этот API.
