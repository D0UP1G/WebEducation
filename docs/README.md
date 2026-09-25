# Документация WebEducation

Актуальный порядок чтения для разработки:

1. [Аудит соответствия кейсу и план задач от 25.09](case-compliance-and-task-plan-2026-09-25.md) — статусы и следующая задача.
2. [Архитектура](../ARCHITECTURE.md) и [API-контракт](api-contract.md) — границы компонентов и форматы запросов.
3. [Аудит Python-runner](python-runner-audit-2026-09-25.md) — реализованный путь, проверки и ограничения.
4. [Материалы организатора](organizer/README.md) и [карта 30 шагов](organizer-step-map.md) — источник данных для импорта.
5. [План стенда на одном хосте](single-agent-demo-plan.md) — Compose, Cloudflare Tunnel и E2E.
6. [Сверка с кейсом](case-alignment.md), [ROADMAP](../ROADMAP.md) и [пользовательские потоки](user-flows.md).

Официальный брендбук v1.1 находится в
[материалах](assets/brandbook-educational-platform-v1.1.pdf), CSS-токены —
в [design/brand-tokens.css](../design/brand-tokens.css). Исходный учебный
DOCX содержит ответы и опубликован в публичном Git по решению владельца.
Его тесты не следует считать секретными.

[Старый командный план](team-work-plan.md), [DEV-3 handoff](dev3-handoff.md),
[backend handoff](backend-handoff.md) и [аудит 24.09](case-compliance-audit-2026-09-24.md)
сохраняют историю решений. Фактическое состояние определяется кодом текущей
ветки и аудитом от 25.09, а не статусами прошлых срезов.

Работа ведётся одним агентом по GitFlow: новая ветка от `develop`, тесты и
запись проверки, PR обратно в `develop`; `main` обновляется через релизный PR.
