# DEV-2 frontend: handoff и сверка с планом

Обновлено: 23 сентября 2026. Документ описывает текущую feature-ветку DEV-2 и
результаты повторной сверки интерфейса с архитектурой, roadmap, user-flows, API
контрактом и исходным кейсом. Это handoff для следующего участника; он не
заменяет API-контракт и не означает, что сквозной сценарий уже готов.

## Текущее состояние Git

- Рабочая ветка: `feature/role-ui`, создана от `develop` (`25cfb9b`).
- PR: [#9 в develop](https://github.com/D0UP1G/WebEducation/pull/9), открыт и
  помечен GitHub как mergeable на момент обновления этого документа.
- Основные коммиты: `e10bae8` (frontend) и `308d205` (локальный запуск/CSRF).
- Не вливать напрямую в `main` или `develop`; новые изменения этой задачи
  отправлять в тот же PR, если они остаются частью DEV-2.
- В `README.md` и `docker-compose.yml` есть изменения для запуска frontend.
  По `docs/team-work-plan.md` эти общие файлы принадлежат DEV-1, поэтому
  попросить DEV-1 просмотреть их перед merge.

## Что реализовано

### Основа приложения

- React + TypeScript + Vite в `frontend/`; production bundle создаётся через
  `npm run build`.
- Одна SPA с маршрутами по роли, общий layout, имя пользователя, выход и
  перенаправление пользователя без доступа на домашнюю страницу его роли.
- API клиент работает с envelope `data/meta/error`, сессионными cookies,
  CSRF, `Idempotency-Key`, JSON и multipart. При истечении сессии UI возвращает
  пользователя на вход.
- Общие loading/error/empty состояния и навигация страниц списков.
- Для browser разработки в README указан `DJANGO_CSRF_TRUSTED_ORIGINS` с
  адресами Vite. Без этого браузерный POST login на `:5173` получал CSRF 403.

### Ученик

- `/student/courses`: назначенные курсы, процент и баллы.
- `/student/courses/:enrollmentId`: описание курса, прогресс по шагам, статус,
  баллы и рекомендуемый следующий шаг.
- `/student/courses/:enrollmentId/steps/:stepId`: содержание шага и форма сдачи.
- Рендер и форма редактора поддерживают все шесть `type_key`: theory, quiz,
  exact answer, Python, Scratch и Minecraft Education.
- Поддержаны теория как `{action: "complete"}`, quiz/exact как `{answer}`,
  Python как `{code}`, артефакт как `{url}` либо multipart `{file}`.
- Есть история попыток, обновление прогресса, опрос статуса с backoff и вопросы
  по шагу. Функции отправки/опроса/вопросов пока не пройдут до конца без API DEV-3.

### Администратор

- `/admin/courses`: список и создание курса.
- `/admin/courses/:courseId/edit`: редактирование метаданных и draft шагов,
  выбор типа, добавление/изменение/удаление/перестановка, preview и публикация.
- `/admin/assignments`: назначение опубликованного курса ученику и куратору,
  список назначений и обновление статуса/куратора.
- Подборки пользователей и списки используют контрактную пагинацию.

### Куратор

- `/curator`: сводка по ученикам, ручным проверкам и вопросам.
- `/curator/students`: ученики, сигналы отставания и раскрываемый прогресс.
- `/curator/reviews` и `/curator/submissions/:id`: очередь и форма принять /
  вернуть; возврат требует комментарий.
- `/curator/questions`: ответы на вопросы учеников.
- Пока это UI-контур: реальные curator routes в backend ещё не реализованы.

### Production-раздача

- `deploy/nginx/Dockerfile` собирает frontend и копирует bundle в nginx image.
- Nginx отдаёт SPA fallback на `index.html`, `/api/` продолжает проксироваться в
  Django; proxy service в Compose собирается из нового Dockerfile.

## Что работает с текущим backend и что блокирует DEV-3

Текущие живые группы: auth, admin core, список/детали назначенного курса,
студенческий шаг и core progress. UI курсов администратора и чтения ученика
проверен на локальном синтетическом seed.

В `backend/apps/grading/student_urls.py`, `backend/apps/mentoring/urls.py` и
`backend/apps/progress/student_urls.py` пока пустые `urlpatterns`. Поэтому
пока не работают на backend:

- создание/чтение/история сдач, идемпотентность и авто-проверка quiz/exact;
- изолированный Python runner и результат прогона;
- upload validation и защищённое скачивание;
- очередь/детали/review для куратора, вопросы/ответы, lag signals;
- пересчёт progress из фактических submissions.

Не утверждать, что полный путь защиты готов, пока не интегрированы DEV-3
эндпоинты и sandbox. Worker scaffold не является безопасным runner.

## Самопроверка по проектным документам

Общее направление соответствует `ARCHITECTURE.md` и DEV-2 части
`docs/team-work-plan.md`: React/TypeScript SPA, общий API клиент, три роли,
шесть типов шагов, CSRF, отсутствие бизнес-оценки на клиенте, feature PR в
`develop`. Дизайн и токены намеренно не реализованы: команда ждёт готовый handoff.

Известные frontend расхождения с `docs/user-flows.md`:

1. На странице шага после принятия нет прямой ссылки на следующий шаг; сейчас
   ученик возвращается к курсу.
2. Экран проверки куратора показывает базовые метаданные/артефакт/историю, но
   не рендерит инструкцию задания. Экран вопроса показывает название шага и
   вопрос, но не даёт перейти к содержанию шага.
3. Публикация сразу выполняет POST без отдельного подтверждения.
4. Перестановка использует три последовательных PATCH с временной позицией.
   Если второй/третий запрос завершится ошибкой, позиции могут остаться
   временно изменёнными; серверного атомарного reorder endpoint в контракте нет.
5. Фильтры очереди куратора пока отсутствуют; roadmap относит поиск и фильтры
   к P1, но user-flows перечисляет их на странице очереди.
6. Контракт содержит маршруты куратора, но не полные примеры JSON для detail,
   review queue, questions и students. Опциональные поля `CuratorStudent`,
   `CuratorReviewItem`, `Submission` и `StepQuestion` во frontend пока нужно
   согласовать с DEV-3 до интеграции; не превращать эти предположения в новый
   API-контракт без DEV-1.

Актуализация docs также нужна после merge: `docs/team-work-plan.md`,
`docs/user-flows.md`, `docs/backend-handoff.md`, `docs/case-alignment.md` и
`docs/README.md` всё ещё описывают frontend как отсутствующий/в работе.
Документы следует менять после подтверждения фактических API и владельцем DEV-1,
а не объявлять неподтверждённые функции готовыми.

## Проверки, выполненные на текущем состоянии

- `cd frontend && npm ci --no-audit --no-fund` — успешно.
- `cd frontend && npm test` — 25 тестов в 6 файлах прошли. Они покрывают API
  client, routing/login/role redirect, пагинацию, формы шести шагов, multipart и
  решение куратора. Большинство backend вызовов замокано; это не E2E.
- `cd frontend && npm run build` — typecheck и production build прошли.
- `cd backend && ../.venv/bin/python manage.py check` — без замечаний.
- `cd backend && ../.venv/bin/python manage.py makemigrations --check --dry-run`
  — изменений миграций нет.
- `cd backend && ../.venv/bin/python manage.py test` — 7 тестов прошли.
- Vite root и вложенный маршрут отдавали HTTP 200; через Vite proxy проверены
  health, CSRF/login, `/auth/me` и список курса ученика.
- Полный Docker/Compose smoke и публичный HTTPS стенд не проверены: Docker
  daemon в рабочем окружении недоступен.

## Как повторить локальный запуск

В корне репозитория, если зависимости ещё не установлены:

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cd backend
../.venv/bin/python manage.py migrate
../.venv/bin/python manage.py seed_demo
DJANGO_CSRF_TRUSTED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173 ../.venv/bin/python manage.py runserver
```

Во втором терминале:

```bash
cd frontend
npm ci
npm run dev
```

Открыть `http://localhost:5173/`. Синтетические учётки: `student_demo`,
`curator_demo`, `admin_demo`; пароль `demo`. Локальный `backend/db.sqlite3`
создаётся миграциями и игнорируется Git.

## Ближайший порядок продолжения

1. DEV-1 просматривает общие изменения `README.md`/Compose в PR #9; PR остаётся
   направлен в `develop`.
2. DEV-3 реализует и фиксирует shape ответов submissions, curator, questions и
   progress, включая права, состояния и sandbox. Не принимать mock success за
   готовый сценарий.
3. DEV-2 согласует точные JSON shapes, добавляет контекст задания куратору,
   переход к следующему шагу и подтверждение публикации; отдельно решить с DEV-1
   атомарное изменение порядка.
4. Обновить статусы документов и провести интеграционный E2E:
   publish → assign → auto submit → Python result → artifact → return → resubmit
   → accept → progress/questions, затем проверить Docker и стенд.
