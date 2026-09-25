# Контракт преобразования пакета для импорта

Этот документ фиксирует подготовку одного шага из [карты курса](curriculum-map.json) в draft-представление приложения. Реализованы database-independent преобразователь плана, предварительная проверка `python manage.py preflight_curriculum_import` и транзакционный импорт `python manage.py import_curriculum --publish` из каталога `backend`. Preflight в репозитории и CI сверяет SHA-256 DOCX с картой и валидирует все шаги. Runtime-импорт использует уже подготовленную карту, поэтому backend image не содержит исходный DOCX. Импорт сохраняет паспорт и группировку модулей, а повторный запуск обновляет только записи с известными ключами и не создаёт дубликаты.

## Общие правила

- `source_id` курса, модуля и шага — внешний стабильный ключ импорта. Сохранять исходный порядок курсов, модулей и шагов; пользовательские записи без `source_id` импорт не изменяет.
- `type_key`, `title` и версия схемы типа становятся полями шага. Все типы карты используют версию `1`.
- Поля `student_content` и проверочные данные из `private_assessment` собираются в серверный `content` по таблице ниже. В ученический API отдаётся только прошедшее через sanitizer типа шага представление.
- `source_blocks`, `source_metadata`, `source_checking`, `source_type`, `student_submits`, `score_note` и эталонные решения остаются в манифесте для аудита; не копировать их в публичное содержимое шага.
- Организатор не указал баллы. По решению владельца от 24.09.2026 каждому из 30 шагов назначен `max_score = 1`; максимальная сумма трёх курсов — 30 баллов (10, 8 и 12 по курсам). Преобразователь отклоняет пустой, нулевой или отрицательный балл до записи в БД.

## Сопоставление содержимого

| `type_key` | `content` для draft шага |
|---|---|
| `theory` | `student_content.body` |
| `quiz.single_choice` | `question`, `choices` из `student_content`; единственное значение `private_assessment.correct_option_ids[0]` становится `correct_option_id`. Если правильных id не ровно один — остановить импорт. |
| `quiz.multiple_choice` | `question`, `choices` из `student_content` и `correct_option_ids` из `private_assessment` |
| `answer.exact`, `scratch.numeric_answer` | `prompt` из `student_content` и `accepted_answers` из `private_assessment`. Только для `scratch.numeric_answer`: непустой список `private_assessment.feedback_after_incorrect`, если задан, соединяется переводами строк в закрытое строковое поле `content.feedback_after_incorrect`. |
| `algorithm.python` | `statement`, публичные `examples`, `time_limit_ms`, `memory_limit_mb` из `student_content`; все `private_assessment.test_cases` преобразовать в `tests` с ключами `input` и `output` (значение `expected_output`). `reference_solution` не импортировать. |
| `artifact.scratch`, `artifact.minecraft`, `artifact.project` | `instructions` и `required_evidence` из `student_content`; упорядоченный список `private_assessment.curator_criteria` соединить переводами строк в закрытый `review_criteria`. |

Для Scratch 1.1.3 подсказка хранится в серверном `content`, но sanitizer скрывает её в ученическом содержимом шага, списке назначения и preview. Только после неверной сдачи сервер возвращает её как `Submission.feedback`; она остаётся в истории этой попытки. При верном ответе возвращается «Верно». Для старых Scratch-шагов без подсказки действует «Попробуйте ещё раз». Администратор видит её в draft для редактирования; исходный DOCX и карта уже публичны, поэтому ролевой API сам по себе не делает исходный текст секретным.

У Python-тестов `source_visibility` и `source_case` — метаданные аудита; в runtime `tests` нужны только входы и ожидаемые выходы. Пометка «скрытый» в оригинальном DOCX не является секретом, поскольку оригинал доступен в публичном Git.

## Границы реализованного импортёра

1. `Course`/`CourseRevision` хранят паспорт и `source_id`; `Module`/`ModuleRevision` сохраняют иерархию 9 модулей.
2. Импорт сопоставляет курсы и шаги по `source_id`, обновляет пакет в draft и не меняет пользовательские курсы без ключа источника.
3. При `--publish` создаётся новая ревизия только при изменении draft; повторный запуск оставляет текущую ревизию без дубля.
4. PR #36 интегрировал `required_evidence` и скрытый `review_criteria`; API сохраняет ролевые ограничения.

Тесты проверяют 3 курса / 9 модулей / 30 шагов, суммы 10/8/12 баллов, группировку ревизий, повторный импорт и неприкосновенность пользовательского курса. Серверный Python-runner уже реализован в PR #50; остаются E2E импортированных курсов и публичный стенд.
