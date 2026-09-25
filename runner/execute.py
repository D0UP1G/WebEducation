"""Execute untrusted Python in the dedicated, networkless runner container."""

import math
import os
import resource
import signal
import subprocess
import sys
import tempfile
import time

MAX_TOTAL_SECONDS = 45
MAX_OUTPUT_BYTES = 65536


def _child_limits(memory_mb, time_ms, output_bytes, uid):
    def apply():
        memory = memory_mb * 1024 * 1024
        cpu = max(1, math.ceil(time_ms / 1000))
        resource.setrlimit(resource.RLIMIT_AS, (memory, memory))
        resource.setrlimit(resource.RLIMIT_CPU, (cpu, cpu + 1))
        resource.setrlimit(resource.RLIMIT_FSIZE, (output_bytes, output_bytes))
        resource.setrlimit(resource.RLIMIT_NOFILE, (32, 32))
        resource.setrlimit(resource.RLIMIT_NPROC, (16, 16))
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        if uid is not None:
            os.setgroups([])
            os.setgid(uid)
            os.setuid(uid)
    return apply


def _one_test(code, test_input, limits, remaining, uid):
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="webeducation-test-") as directory:
        if uid is not None:
            os.chown(directory, uid, uid)
        with tempfile.TemporaryFile() as output, tempfile.TemporaryFile() as errors:
            process = subprocess.Popen(
                [sys.executable, "-I", "-S", "-B", "-c", code],
                stdin=subprocess.PIPE, stdout=output, stderr=errors,
                cwd=directory, env={"PATH": "/usr/local/bin:/usr/bin", "HOME": directory,
                                    "TMPDIR": directory, "PYTHONIOENCODING": "utf-8"},
                preexec_fn=_child_limits(limits["memory_limit_mb"], limits["time_limit_ms"],
                                          limits["output_limit_bytes"], uid),
                start_new_session=True,
            )
            try:
                process.communicate(input=test_input.encode("utf-8"),
                                    timeout=min(limits["time_limit_ms"] / 1000, remaining))
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.communicate()
                return "time_limit", ""
            output.seek(0)
            stdout = output.read(MAX_OUTPUT_BYTES + 1)
            errors.seek(0)
            stderr = errors.read(4096)
            if (len(stdout) > limits["output_limit_bytes"]
                    or len(stdout) >= limits["output_limit_bytes"] and process.returncode != 0):
                return "output_limit", ""
            if process.returncode == -signal.SIGXCPU:
                return "time_limit", ""
            if process.returncode == -signal.SIGXFSZ:
                return "output_limit", ""
            if process.returncode == -signal.SIGKILL or b"MemoryError" in stderr:
                return "memory_limit", ""
            if process.returncode != 0:
                return "runtime_error", ""
            if time.monotonic() - started > limits["time_limit_ms"] / 1000:
                return "time_limit", ""
            try:
                return None, stdout.decode("utf-8")
            except UnicodeDecodeError:
                return "runtime_error", ""


def execute(payload, *, uid=10001):
    """Return safe grading data; reference outputs never leave this process."""
    code = payload["code"]
    tests = payload["tests"]
    limits = payload["limits"]
    if (not isinstance(code, str) or not 0 < len(code.encode("utf-8")) <= 65536
            or not isinstance(tests, list) or not 1 <= len(tests) <= 50
            or type(limits.get("memory_limit_mb")) is not int
            or not 16 <= limits["memory_limit_mb"] <= 512
            or type(limits.get("time_limit_ms")) is not int
            or not 100 <= limits["time_limit_ms"] <= 30000
            or limits["output_limit_bytes"] != MAX_OUTPUT_BYTES):
        raise ValueError("Invalid runner request")
    passed = 0
    started = time.monotonic()
    for test in tests:
        if (not isinstance(test, dict) or not isinstance(test.get("input"), str)
                or not isinstance(test.get("output"), str)
                or len(test["input"].encode("utf-8")) > 65536
                or len(test["output"].encode("utf-8")) > 65536):
            raise ValueError("Invalid test")
        remaining = MAX_TOTAL_SECONDS - (time.monotonic() - started)
        if remaining <= 0:
            return {"status": "incorrect", "passed_tests": passed, "total_tests": len(tests), "reason": "time_limit"}
        reason, stdout = _one_test(code, test["input"], limits, remaining, uid)
        if reason is None and stdout.rstrip() == test["output"].rstrip():
            passed += 1
            continue
        return {"status": "incorrect", "passed_tests": passed, "total_tests": len(tests),
                "reason": reason or "wrong_answer"}
    return {"status": "accepted", "passed_tests": passed, "total_tests": len(tests), "reason": None}
