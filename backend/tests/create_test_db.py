"""Create (or rebuild) a throwaway MySQL database for the automated tests.

    python tests/create_test_db.py                # rayaprocure_test
    python tests/create_test_db.py my_scratch_db

It imports the base tables from schema.sql, then applies every migration, so it
also proves that a fresh install works end to end.  It never touches
``rayaprocure_db`` (the default application database).
"""

import os
import re
import subprocess
import sys
from pathlib import Path

import mysql.connector
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")

name = sys.argv[1] if len(sys.argv) > 1 else "rayaprocure_test"
if name in {"rayaprocure_db", "mysql", "sys", "information_schema", "performance_schema"}:
    raise SystemExit(f"Refusing to rebuild '{name}'.")
if not re.fullmatch(r"[A-Za-z0-9_]+", name):
    raise SystemExit("Database name may only contain letters, digits and underscores.")

connection = mysql.connector.connect(
    host=os.getenv("DB_HOST", "127.0.0.1"),
    port=int(os.getenv("DB_PORT", "3306")),
    user=os.getenv("DB_USER"),
    password=os.getenv("DB_PASSWORD"),
    use_pure=True,
)
cursor = connection.cursor()
cursor.execute(f"DROP DATABASE IF EXISTS `{name}`")
cursor.execute(f"CREATE DATABASE `{name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
cursor.execute(f"USE `{name}`")

schema = (ROOT / "schema.sql").read_text(encoding="utf-8")
schema = schema.split("-- Upgrade compatibility")[0].split("USE rayaprocure_db;")[1]
for statement in schema.split(";\n"):
    statement = re.sub(r"^\s*--.*$", "", statement, flags=re.M).strip()
    if statement:
        cursor.execute(statement)
connection.commit()
cursor.close()
connection.close()

env = dict(os.environ, DB_NAME=name)
result = subprocess.run([sys.executable, str(ROOT / "backend" / "migrate.py")], env=env, cwd=ROOT / "backend")
if result.returncode:
    raise SystemExit("Migrations failed.")
print(f"\nTest database '{name}' is ready. Run the tests with:")
print(f"  DB_NAME={name} python -m unittest discover -s tests -v   (from the backend folder)")
