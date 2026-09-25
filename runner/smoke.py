"""Run inside the Compose runner container to verify privilege drop and isolation."""

from execute import execute


limits = {"time_limit_ms": 1000, "memory_limit_mb": 128, "output_limit_bytes": 65536}
result = execute({
    "code": "import os; a,b=map(int,input().split()); print(a+b); print(os.getuid()); "
            "print(next(line.split()[1] for line in open('/proc/self/status') "
            "if line.startswith('CapEff:')))",
    "tests": [{"input": "2 3\n", "output": "5\n10001\n0000000000000000\n"}],
    "limits": limits,
})
assert result["status"] == "accepted", result

network = execute({
    "code": "import socket; s=socket.socket(); s.settimeout(0.2)\n"
            "try: s.connect(('1.1.1.1', 53)); print('network')\n"
            "except OSError: print('isolated')",
    "tests": [{"input": "", "output": "isolated\n"}],
    "limits": limits,
})
assert network["status"] == "accepted", network

timeout = execute({
    "code": "while True: pass",
    "tests": [{"input": "", "output": ""}],
    "limits": {**limits, "time_limit_ms": 100},
})
assert (timeout["status"], timeout["reason"]) == ("incorrect", "time_limit"), timeout
print("runner container: privilege drop, network isolation and timeout cleanup OK")
