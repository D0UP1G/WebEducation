"""Small Unix socket protocol; the runner has no network or database access."""

import json
import os
import socketserver
import struct

try:
    from .execute import execute
except ImportError:  # Running as /runner/server.py in the container.
    from execute import execute

SOCKET = os.environ.get("RUNNER_SOCKET", "/run/runner/grading.sock")
MAX_REQUEST = 8 * 1024 * 1024


def read_exact(stream, count):
    data = bytearray()
    while len(data) < count:
        part = stream.recv(count - len(data))
        if not part:
            raise ConnectionError("Incomplete runner request")
        data.extend(part)
    return bytes(data)


class Handler(socketserver.BaseRequestHandler):
    def handle(self):
        payload = None
        try:
            length = struct.unpack("!I", read_exact(self.request, 4))[0]
            if length > MAX_REQUEST:
                raise ValueError("Request too large")
            payload = json.loads(read_exact(self.request, length))
            result = execute(payload)
        except Exception as exc:
            print(f"runner error: {type(exc).__name__}: {exc}", flush=True)
            tests = payload.get("tests", []) if isinstance(payload, dict) else []
            result = {"status": "error", "passed_tests": 0,
                      "total_tests": len(tests) if isinstance(tests, list) else 0,
                      "reason": "environment_error"}
        response = json.dumps(result).encode("utf-8")
        self.request.sendall(struct.pack("!I", len(response)) + response)


if __name__ == "__main__":
    os.makedirs(os.path.dirname(SOCKET), exist_ok=True)
    if os.path.exists(SOCKET):
        os.unlink(SOCKET)
    with socketserver.UnixStreamServer(SOCKET, Handler) as server:
        os.chmod(SOCKET, 0o600)
        server.serve_forever()
