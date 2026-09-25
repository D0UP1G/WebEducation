# API-контракт WebEducation

**Актуальный Python-контракт (ветка `codex/python-server-runner`, 25.09):** локальная самопроверка получает один открытый пример через `GET .../python-sample`; официальная сдача принимает только `{ "code": "..." }`. Код исполняется отдельным runner-контейнером, который возвращает серверный статус. После merge этой ветки в `develop` старый `python-challenge` и подпись результатов браузера больше не действуют. Остальные контракты v1, включая составные ручные доказательства, сохраняются.

Контракт спроектирован под модульный монолит Django + Django REST Framework,
PostgreSQL и React-клиент из `ARCHITECTURE.md`. Все данные в демо синтетические.

## 1. Общие правила

- Base URL: `/api/v1`.
- Формат: JSON; даты и время — ISO 8601 в UTC.
- Авторизация: сессия Django. Для state-changing запросов из браузера передаётся
  CSRF-токен в `X-CSRFToken`.
- Каждый ответ содержит заголовок `X-Request-ID`; то же значение повторяется в
  `meta.request_id` и используется для поиска записи запроса в логах.
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
`500` — внутренняя ошибка, `503` — временно недоступен Python-runner.

При превышении `MAX_UPLOAD_SIZE` API отвечает `413` с
`error.code = "file_too_large"`. Прокси может отклонить слишком большое тело
запроса ещё раньше тем же HTTP-статусом.

Для `409` сервер возвращает `error.code = "state_conflict"`. Клиент должен
обновить данные ресурса перед повторным действием. Это правило используется для
дублирующего назначения курса, активной повторной сдачи и конкурентного решения
куратора.

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

Пять неудачных попыток за 15 минут по IP или логину временно блокируют вход
(`429 rate_limited`); лимит хранится в БД и действует для всех web-процессов.
Ошибки неверного и неизвестного логина одинаковы. При работе за доверенным
Compose-прокси IP берётся из перезаписываемого Nginx заголовка `X-Real-IP`.
Старые счётчики удаляются командой `manage.py prune_login_attempts`; запускать
её раз в день на стенде.

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
| `GET /student/enrollments/{enrollment_id}/steps/{step_id}/python-sample` | student | Получить один открытый пример и лимиты для локальной самопроверки |
| `GET /student/submissions/{submission_id}` | student | Статус, результат и история комментариев |
| `GET /student/enrollments/{enrollment_id}/steps/{step_id}/submissions` | student | История попыток по шагу, включая последний статус |
| `GET /student/enrollments/{enrollment_id}/steps/{step_id}/questions` | student | Свои вопросы и ответы по шагу назначения |
| `POST /student/enrollments/{enrollment_id}/steps/{step_id}/questions` | student | Задать вопрос закреплённому куратору |

Создание сдачи для разных типов шага использует один endpoint. Поля `answer`,
`code`, `file`, `url` и `explanation` разрешаются валидатором конкретного `type_key`; лишние
поля отклоняются. `theory` завершается сдачей `{ "action": "complete" }` после
открытия материала; это не контрольный вопрос. Сервер проверяет, что `step_id`
принадлежит опубликованной версии из `enrollment_id` и что назначение
принадлежит текущему ученику. Уже принятые шаги нельзя отправлять повторно,
кроме `algorithm.python`: каждый новый вариант кода создаёт попытку и проходит
проверку серверным runner. После первого зачёта Python-шаг и баллы остаются
принятыми, даже если следующая исследовательская попытка неверна. Открытый
пример для Python остаётся доступен и после зачёта.

Для `algorithm.python` кнопка «Проверить локально» делает `GET .../python-sample`.
Сервер возвращает один намеренно открытый пример (первый `content.examples`,
если он задан, иначе первый тест) и объект `limits`:

```json
{
  "sample": { "input": "2 3\n", "output": "5\n" },
  "limits": { "time_limit_ms": 1000, "memory_limit_mb": 128, "output_limit_bytes": 65536 }
}
```

Pyodide запускается в Web Worker из локально обслуживаемых статических файлов.
Самопроверка показывает `stdout`, ошибку и время на открытом примере, но не
создаёт `Submission` и не начисляет баллы. Закрытые тесты в этот ответ не входят.

Официальная сдача — `POST .../submissions`:

```json
{ "code": "a, b = map(int, input().split()); print(a + b)" }
```

Любые `results`, `stdout`, `challenge_token`, клиентские показатели времени или
памяти отклоняются как лишние поля. Django передаёт код и закрытые тесты
изолированному runner через Unix-сокет. Только его результат определяет
`accepted` (все тесты пройдены), `incorrect` (неверный ответ, ошибка кода или
лимит) либо `error` (сбой среды). В `safe_diagnostics` выдаются только
`passed_tests`, `total_tests`, `reason`: `wrong_answer`, `runtime_error`,
`time_limit`, `memory_limit`, `output_limit`, `environment_error` или `null`.
Недоступность или занятость runner возвращает HTTP 503 без создания попытки. Проверка
синхронная, с общим бюджетом 45 секунд; `queued` и `checking` зарезервированы
для будущей очереди. На тест допустимы 100–30000 мс и 16–512 МБ, на задание
1–50 тестов и суммарный бюджет до 45 секунд. Размер кода, входа и выхода
ограничен 64 КБ.

Для `artifact.scratch`, `artifact.minecraft` и `artifact.project` можно отправить `file`, `url`
или оба поля сразу; минимум одно из них обязательно. Короткое текстовое
`explanation` до 5000 символов необязательно и не заменяет файл/ссылку.
Для файла запрос — `multipart/form-data`; совместная сдача отправляет
`file`, `url` и `explanation` одним запросом. Размер и формат файла
проверяются до создания попытки. Ответы ученику и куратору содержат
`artifact_url`, защищённый `download_url` и `explanation` (пустую строку,
если текста нет). Пример для Minecraft:

```text
POST /api/v1/student/enrollments/{enrollment_id}/steps/{step_id}/submissions
Content-Type: multipart/form-data

file=<world.png>
url=https://example.org/minecraft/project
explanation=Снимок мира и ссылка на проект
```

Без явных требований шага валидатор принимает любой из этих наборов для всех
трёх ручных типов. Один файл или одна ссылка сохраняют совместимость со старыми курсами.
Повторная сдача после `incorrect`, `returned`
или `error` всегда создаёт новую `Submission`, старые попытки не
перезаписываются. Пока попытка находится в `queued`, `checking` или
`pending_review`, повторная сдача того же шага возвращает `409`. Для защиты от
двойного клика клиент передаёт `Idempotency-Key`: повтор с тем же ключом,
учеником, маршрутом и телом возвращает исходную попытку; тот же ключ с другим
телом возвращает `409`.

Дополнение DEV-3 в PR #36: `content.required_evidence`
ручного шага задаёт обязательные поля одной попытки (`file`, `url`, `explanation`).
Например, для Minecraft — `["file", "url"]`, для проекта моста —
`["file", "url", "explanation"]`. Без этого поля действует прежнее правило
«файл или ссылка». `content.review_criteria` хранит критерии куратора;
ученические ответы API скрывают это поле, а закреплённый куратор видит его в
очереди и карточке проверки. Полный контракт и шесть соответствий — в
[DEV-3 handoff](dev3-evidence-handoff.md). Проверка действует и для
`artifact.project`.

Ответ сдачи:

```json
{
  "data": {
    "id": "uuid",
    "step_id": "uuid",
    "status": "accepted",
    "attempt_number": 1,
    "score": 10,
    "max_score": 10,
    "feedback": "Все тесты пройдены",
    "created_at": "2026-09-25T12:00:00Z"
  }
}
```

Автоматическая проверка завершается в том же POST; ручная работа получает
`pending_review`. Фронтенд может опрашивать `GET /student/submissions/{id}`
для обновления статуса ручной проверки. В ответе остаются безопасные для ученика
диагностика и число пройденных тестов; ожидаемые ответы не возвращаются.
У `scratch.numeric_answer` необязательное закрытое поле
`content.feedback_after_incorrect` (непустая строка до 5000 символов).
В содержимом шага ученика и preview его нет. При неверной сдаче этот текст
становится `Submission.feedback` и виден в ответе POST и истории собственных
попыток; при верной сдаче `feedback` равен «Верно». Если поле не задано,
неверная сдача возвращает «Попробуйте ещё раз». Администратор может редактировать
поле в draft; публичность исходного DOCX ограничивает секретность самого текста.
Вопросы и ответы относятся к
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
шаги повторно можно в любом порядке. Публикация требует шаг `theory`, хотя бы
один контрольный вопрос (`quiz.single_choice` или `quiz.multiple_choice`) и
положительную сумму `max_score`. `answer.exact` сам по себе не заменяет
контрольный вопрос. Это правило §04 кейса подтверждено владельцем 24.09.

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
{ "decision": "accepted" }
```

`decision` — `accepted` или `returned`. При `accepted` поле `comment`
необязательно и может быть пустым; при `returned` нужен непустой комментарий.
Пример возврата: `{ "decision": "returned", "comment": "Проверьте шаг 2" }`.
Правило проверено через API, см. [handoff DEV-3](dev3-handoff.md);
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
| `GET /admin/users?role={student|curator}` | admin | Активные пользователи для назначения; `include_inactive=1` добавляет отключённых |
| `POST /admin/users` | admin | Создать ученика/куратора с проверкой пароля |
| `PATCH /admin/users/{user_id}` | admin | Отключить/активировать пользователя (`is_active`) |
| `GET /admin/enrollments` | admin | Список назначений с фильтрами по курсу и участнику |
| `POST /admin/enrollments` | admin | Назначить курс ученику и куратора |
| `PATCH /admin/enrollments/{enrollment_id}` | admin | Изменить куратора/состояние назначения |

Создание назначения берёт последнюю опубликованную ревизию курса под блокировкой
курса. Поэтому публикация и назначение не могут закрепить разные значения
`latest_revision` из-за гонки. Для одной пары `student + course revision`
создаётся только один Enrollment; повтор возвращает `409 state_conflict`.

`POST /admin/users` принимает только `username`, `display_name`, `role`
(`student` или `curator`) и `password`; в ответ пароль не возвращается.
Отключение куратора с активными назначениями запрещено до переназначения.

`position` управляет порядком draft-шагов без промежуточного состояния.
`POST .../steps` принимает позицию от `1` до `число шагов + 1` или ставит шаг в
конец, если поле опущено. `PATCH .../steps/{step_id}` перемещает шаг на позицию
от `1` до числа текущих шагов и атомарно сдвигает остальные. `DELETE` удаляет
шаг и уплотняет порядок до непрерывного диапазона, начинающегося с `1`.
Невозможная позиция возвращает `400 validation_error`; при любой ошибке порядок
не меняется. Клиент выполняет перестановку одним `PATCH`.

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

Публичный preview не содержит закрытые тесты. `python-sample` выдаёт
только один открытый пример; оригинальный DOCX в публичном Git уже содержит
эталонные ответы, поэтому он не считается источником секретных тестов. `publish` атомарно валидирует весь draft,
включая обязательную теорию, создаёт `CourseRevision`
и `StepRevision`, после чего опубликованная версия не редактируется. Ошибка
валидации возвращает список проблем по шагам и не создаёт частичную версию.

## 6. Модель состояний

`Submission.status`:

```text
автоматическая проверка -> accepted | incorrect | error
ручная проверка -> pending_review -> accepted | returned
incorrect | returned | error -> новая попытка с собственным статусом
```

Автоматические типы (`quiz.single_choice`, `quiz.multiple_choice`, `answer.exact`,
`scratch.numeric_answer`, `algorithm.python`)
создаются сразу в `accepted/incorrect/error`; `queued` и `checking` есть в
модели как резерв для асинхронной проверки, но сейчас не используются.
`error` означает
технический сбой, который не считается неверным ответом. `theory` принимается
после действия `complete`. Ручные типы (`artifact.scratch`,
`artifact.minecraft`, `artifact.project`) переходят в `pending_review`. Принятый шаг начисляет
баллы один раз; прогресс строится из принятых сдач. Состояния попытки после
решения не меняются; пересдача — новая строка с собственным статусом.

## 7. Минимальный демонстрационный сценарий

1. `admin` создаёт draft из `theory`, `quiz.single_choice`, `quiz.multiple_choice`, `answer.exact`,
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
