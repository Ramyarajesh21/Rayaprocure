"""Send due reminders for every company (run this daily).

    python run_reminders.py

Schedule it with cron (Linux) or Task Scheduler (Windows), e.g. every morning
at 09:00.  It is safe to run more often: a reminder is never sent twice.
Alternatively set REMINDER_SCHEDULER=1 to run it inside the API process.
"""

import json
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from app.db import get_db_connection  # noqa: E402
from app.reminders import run_all  # noqa: E402


def main():
    results = run_all(get_db_connection)
    print(json.dumps(results, indent=2, default=str))
    failed = any(result.get("failed") or result.get("errors") for result in results.values())
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
