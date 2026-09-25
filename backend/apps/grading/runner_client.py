"""Call the isolated Python runner over a Unix socket."""

import json
import os
import socket
import struct
import fcntl

from rest_framework.exceptions import APIException


class RunnerUnavailable(APIException):
    status_code = 503
    default_detail = "Проверка Python временно недоступна; попробуйте позже"


def _read_exact(connection, count):
    data = bytearray()
    while len(data) < count:
        part = connection.recv(count - len(data))
        if not part:
            raise ConnectionError("Incomplete runner response")
        data.extend(part)
    return bytes(data)


def grade_python(*, code, tests, limits):
    path = os.environ.get("RUNNER_SOCKET", "/run/runner/grading.sock")
    request = json.dumps({"code": code, "tests": tests, "limits": limits}, ensure_ascii=False).encode("utf-8")
    try:
        # One official run at a time. Fail fast instead of occupying every
        # Gunicorn worker while the single runner processes another request.
        with open(path + ".lock", "a+b") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with socket.socket(socket.AF_UNIX) as connection:
                connection.settimeout(48)
                connection.connect(path)
                connection.sendall(struct.pack("!I", len(request)) + request)
                size = struct.unpack("!I", _read_exact(connection, 4))[0]
                if size > 4096:
                    raise ValueError("Oversized runner response")
                result = json.loads(_read_exact(connection, size))
        if (result.get("status") not in {"accepted", "incorrect", "error"}
                or result.get("reason") not in {None, "wrong_answer", "runtime_error", "time_limit",
                                               "memory_limit", "output_limit", "environment_error"}
                or type(result.get("passed_tests")) is not int
                or type(result.get("total_tests")) is not int
                or not 0 <= result["passed_tests"] <= result["total_tests"] == len(tests)):
            raise ValueError("Invalid runner response")
        if result["status"] == "accepted" and (result["passed_tests"] != len(tests) or result["reason"] is not None):
            raise ValueError("Inconsistent runner response")
        return result
    except (OSError, ConnectionError, ValueError, TypeError, KeyError, json.JSONDecodeError) as exc:
        raise RunnerUnavailable() from exc
