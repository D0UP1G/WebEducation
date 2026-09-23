# DEV-1: журнал интеграции

Документ ведёт DEV-1 как владелец общих моделей, миграций, корневой
конфигурации и API-контракта. Он фиксирует состояние после merge и вопросы,
которые нужно разрешить до следующей интеграции.

## 23 сентября 2026 — backend core и frontend

- PR #8 `feature/platform-core` влит в `develop`: Django/DRF, модель курса и
  ревизий, роли, auth/CSRF, admin API, student read API, миграции, seed и Compose.
- PR #9 `feature/role-ui` влит в `develop`: React SPA, маршруты трёх ролей,
  API client, production nginx image и локальная инструкция запуска.
- DEV-1 проверил изменения DEV-2 в общих файлах: proxy теперь передаёт исходный
  `Host` с портом в Django. Это необходимо, чтобы same-origin CSRF корректно
  сопоставлял `Origin: http://localhost:8080` с host приложения.
- Текущая работа `feature/course-draft-ordering` заменяет три PATCH-запроса
  интерфейса на один. Сервер делает сдвиг позиций в транзакции, поэтому
  уникальное ограничение `(course, position)` сохраняется и опубликованные
  ревизии не меняются.

## Открытая интеграция DEV-3

PR #10 `feature/submission-grading` пока не влит. В нём нет изменений общих
моделей, миграций или корневых URL, поэтому формального конфликта с DEV-1 нет.

Есть архитектурное решение, которое нужно принять до merge: Python-код
запускается в браузерном Pyodide worker, а сервер принимает результаты тестов.
Такой подход не подтверждает, что код был исполнен, и пользователь может
подделать stdout, duration и memory. Он расходится с `ARCHITECTURE.md`,
`ROADMAP.md` и `team-work-plan.md`, где для Python указан отдельный изолированный
server-side worker без сети и доступа к БД.

До решения считать браузерную проверку допустимым только демонстрационным
режимом без доверенной оценки. Если требование изоляции остаётся P0, DEV-3 должен
вернуть worker в Compose и реализовать server-side sandbox до приёмки.

## Правила следующей интеграции

1. Вливать feature PR только в актуальный `develop` после `check`, тестов и
   `makemigrations --check --dry-run`.
2. До изменения `learning/models.py` или миграций описать инвариант, индекс и
   влияние на API в отдельном разделе handoff.
3. После merge обновлять `backend-handoff.md`, `api-contract.md`,
   `team-work-plan.md`, `user-flows.md` и `case-alignment.md` фактическим
   состоянием, не переносить утверждения о готовности из mock UI.
4. При изменении frontend proxy повторять browser CSRF smoke: csrf → login → me
   через порт, на котором опубликован reverse proxy.
