"""Synthetic lesson fixtures shared by backend tests, never loaded by seed_demo."""

DEMO_STEPS = [
    ("theory", "Что такое алгоритм", {"body": "Алгоритм — точная последовательность действий."}, 5),
    (
        "quiz.single_choice",
        "Свойства алгоритма",
        {
            "question": "Какое свойство означает завершение за конечное число шагов?",
            "choices": [
                {"id": "a", "text": "Дискретность"},
                {"id": "b", "text": "Конечность"},
                {"id": "c", "text": "Массовость"},
            ],
            "correct_option_id": "b",
        },
        5,
    ),
    ("answer.exact", "Двоичная система", {"prompt": "Запишите 5 в двоичной системе", "accepted_answers": ["101"]}, 5),
    (
        "algorithm.python",
        "Сумма двух чисел",
        {
            "statement": "Прочитайте два целых числа и выведите их сумму.",
            "tests": [{"input": "2 3\n", "output": "5\n"}, {"input": "-4 7\n", "output": "3\n"}],
            "time_limit_ms": 1000,
            "memory_limit_mb": 128,
        },
        10,
    ),
    (
        "artifact.scratch",
        "Scratch: движение спрайта",
        {"instructions": "Создайте проект, где спрайт проходит квадрат, и приложите ссылку или файл."},
        10,
    ),
    (
        "artifact.minecraft",
        "Minecraft Education: мост",
        {"instructions": "Постройте мост по алгоритму и приложите снимок или файл мира."},
        10,
    ),
]
