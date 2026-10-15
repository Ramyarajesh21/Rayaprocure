"""Optional in-process daily reminder runner (REMINDER_SCHEDULER=1).

A plain background thread that wakes up hourly and runs the reminder job once
the configured hour has passed.  For production prefer cron/Task Scheduler +
``python run_reminders.py``; the unique reminder keys make both safe together.
"""

import os
import threading
import time
from datetime import date, datetime

from app.db import get_db_connection
from app.reminders import run_all


def start_reminder_scheduler(app):
    run_hour = int(os.getenv("REMINDER_HOUR", "9"))
    state = {"last_run": None}

    def loop():
        while True:
            now = datetime.now()
            if now.hour >= run_hour and state["last_run"] != date.today():
                try:
                    results = run_all(get_db_connection)
                    app.logger.info("Reminder run finished: %s", results)
                    state["last_run"] = date.today()
                except Exception as error:
                    app.logger.warning("Reminder run failed: %s", error)
            time.sleep(3600)

    # In debug mode Flask's reloader starts two processes; only run in the child.
    if os.environ.get("WERKZEUG_RUN_MAIN") == "true" or not app.debug:
        threading.Thread(target=loop, name="reminder-scheduler", daemon=True).start()
