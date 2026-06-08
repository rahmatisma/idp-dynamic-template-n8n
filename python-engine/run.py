"""
run.py
------
Runner wrapper untuk Flask Python Engine.
Menyimpan semua output (stdout + stderr) ke storage/logs/flask_YYYYMMDD_HHMMSS.log
sambil tetap menampilkan output di console secara real-time.

Cara pakai:  python run.py
"""

import subprocess
import sys
import os
from datetime import datetime


def tee_stream(stream, *writers):
    """Baca stream baris per baris, tulis ke semua writers sekaligus."""
    for raw_line in iter(stream.readline, b""):
        line = raw_line.decode("utf-8", errors="replace")
        for w in writers:
            w.write(line)
            w.flush()


def main():
    # Reconfigure stdout/stderr ke UTF-8 agar karakter non-ASCII tidak crash di Windows
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

    script_dir = os.path.dirname(os.path.abspath(__file__))

    log_dir = os.path.join(script_dir, "storage", "logs")
    os.makedirs(log_dir, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_path = os.path.join(log_dir, f"flask_{timestamp}.log")

    print(f"[Logger] Log disimpan ke: {log_path}")
    print(f"[Logger] Memulai Flask...\n")
    sys.stdout.flush()

    env = os.environ.copy()
    # Nonaktifkan buffering output Python agar output real-time
    env["PYTHONUNBUFFERED"] = "1"
    # Paksa subprocess Flask juga pakai UTF-8 untuk stdout/stderr
    env["PYTHONIOENCODING"] = "utf-8"

    proc = subprocess.Popen(
        [sys.executable, "main.py"] + sys.argv[1:],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,   # gabungkan stderr ke stdout
        cwd=script_dir,
        env=env,
    )

    with open(log_path, "w", encoding="utf-8") as log_file:
        # Tulis header ke log file
        log_file.write(f"# Flask log - started at {datetime.now().isoformat()}\n")
        log_file.write(f"# Log file: {log_path}\n\n")
        log_file.flush()

        tee_stream(proc.stdout, sys.stdout, log_file)

    proc.wait()

    print(f"\n[Logger] Flask berhenti. Log tersimpan di: {log_path}")
    sys.exit(proc.returncode)


if __name__ == "__main__":
    main()
