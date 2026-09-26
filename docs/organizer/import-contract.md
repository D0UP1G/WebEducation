# Контракт импорта учебного пакета

Импорт преобразует [curriculum-map.json](curriculum-map.json) в draft курсов,
модулей и шагов. Команды запускаются из каталога `backend`:

```bash
../.venv/bin/python manage.py preflight_curriculum_import
../.venv/bin/python manage.py import_curriculum --owner admin_demo --publish
```

## Идентичность и порядок

- `source_id` курса, модуля и шага — стабильный внешний ключ;
- порядок курсов, модулей и шагов берётся из карты;
- `type_key`, заголовок и версия схемы становятся полями шага;
- пользовательские курсы без `source_id` импорт не изменяет;
- повторный импорт обновляет канонические draft-записи и не создаёт дубликаты;
- новая опубликованная ревизия появляется только при изменении draft.

## Видимость данных

`student_content` преобразуется в содержимое, доступное ученику. Поля
`private_assessment`, исходные блоки, метаданные источника, правильные ответы,
тесты и эталонные решения остаются на сервере. Sanitizer типа шага не должен
выдавать их в ученическом API.

| `type_key` | Основные публичные поля | Закрытые поля проверки |
| --- | --- | --- |
| `theory` | `body` | нет |
| `quiz.single_choice` | `question`, `choices` | `correct_option_id` |
| `quiz.multiple_choice` | `question`, `choices` | `correct_option_ids` |
| `answer.exact` | `prompt` | `accepted_answers` |
| `scratch.numeric_answer` | `prompt` | `accepted_answers`, optional feedback |
| `algorithm.python` | `statement`, `examples`, лимиты | `tests` с ожидаемыми выходами |
| `artifact.scratch` | `instructions`, `required_evidence` | `review_criteria` |
| `artifact.minecraft` | `instructions`, `required_evidence` | `review_criteria` |
| `artifact.project` | `instructions`, `required_evidence` | `review_criteria` |

Для ручных шагов `required_evidence` задаёт обязательные поля одной попытки.
Критерии куратора хранятся в закрытом `content.review_criteria`. Подсказка
Scratch для неверного ответа возвращается только в feedback этой попытки.

## Python-задачи

В runtime-тесты попадают только входы и ожидаемые выходы. Эталонное решение и
служебные поля карты не копируются в публичное содержимое. Локальный запуск в
браузере предназначен для открытого примера; официальный код проверяется
изолированным runner после отправки на сервер.

## Политика баллов

Исходный пакет не задаёт баллы. Для текущего импорта каждому из 30 шагов
назначен `max_score = 1`, поэтому курсы получают 10, 8 и 12 баллов. Импортёр
отклоняет пустой, нулевой или отрицательный балл.

## Проверки

Команда preflight сверяет контрольную сумму DOCX, структуру карты, типы шагов,
обязательные доказательства и специальные поля Scratch. Тесты backend проверяют
3 курса, 9 модулей, 30 шагов, повторный импорт, видимость закрытых полей и
сохранность пользовательского курса.
