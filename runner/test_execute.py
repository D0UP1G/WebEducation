import unittest

from runner.execute import execute


LIMITS = {"time_limit_ms": 1000, "memory_limit_mb": 128, "output_limit_bytes": 65536}
TESTS = [{"input": "2 3\n", "output": "5\n"}, {"input": "-4 7\n", "output": "3\n"}]


class ExecuteTest(unittest.TestCase):
    def grade(self, code, *, tests=TESTS, limits=LIMITS):
        return execute({"code": code, "tests": tests, "limits": limits}, uid=None)

    def test_correct_and_wrong_output(self):
        correct = self.grade("a,b=map(int,input().split()); print(a+b)")
        self.assertEqual((correct["status"], correct["passed_tests"]), ("accepted", 2))
        wrong = self.grade("print(5)")
        self.assertEqual((wrong["status"], wrong["reason"]), ("incorrect", "wrong_answer"))
        self.assertNotIn("stdout", wrong)

    def test_runtime_time_memory_and_output_limits(self):
        self.assertEqual(self.grade("raise ValueError('secret')")["reason"], "runtime_error")
        short = {**LIMITS, "time_limit_ms": 100}
        self.assertEqual(self.grade("while True: pass", limits=short)["reason"], "time_limit")
        small = {**LIMITS, "memory_limit_mb": 32}
        self.assertEqual(self.grade("bytearray(100_000_000)", limits=small)["reason"], "memory_limit")
        self.assertEqual(self.grade("print('x' * 100000)")["reason"], "output_limit")


if __name__ == "__main__":
    unittest.main()
