import os
from pathlib import Path

from flask import Flask, jsonify, request, session
from flask_cors import CORS
from dotenv import load_dotenv
from app.routes.auth import auth_bp
from app.routes.customers import customers_bp
from app.routes.rfqs import rfqs_bp
from app.routes.quotations import quotations_bp
from app.routes.jobs import jobs_bp
from app.routes.invoices import invoices_bp
from app.routes.payments import payments_bp
from app.routes.dashboard import dashboard_bp
from app.routes.reports import reports_bp
from app.routes.company import company_bp
from app.routes.users import users_bp
from app.routes.attachments import attachments_bp
from app.routes.notifications import notifications_bp
from app.routes.audit_logs import audit_logs_bp
from app.routes.catalog import catalog_bp
from app.routes.email_routes import email_bp
from app.routes.public import public_bp
from app.routes.reminders import reminders_bp
from app.routes.templates import templates_bp
from app.security import ROLE_ACCESS
from app.audit import record_audit
from app.db import get_db_connection

def create_app():
    # Load the shared project configuration when the backend is started directly.
    project_root = Path(__file__).resolve().parents[2]
    load_dotenv(project_root / ".env")

    app = Flask(__name__)

    app.config.update(
        SECRET_KEY=os.getenv("SECRET_KEY"),
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=os.getenv("SESSION_COOKIE_SECURE") == "1",
        MAX_CONTENT_LENGTH=10 * 1024 * 1024,
    )

    if not app.config["SECRET_KEY"]:
        raise RuntimeError("SECRET_KEY must be set before starting the API.")

    allowed_origins = os.getenv(
        "FRONTEND_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    CORS(app, origins=[origin.strip() for origin in allowed_origins], supports_credentials=True)

    @app.before_request
    def enforce_api_access():
        """Apply backend role checks to every business API endpoint."""
        if request.method == "OPTIONS" or request.endpoint in {"home", "auth.login", "auth.register"}:
            return None

        blueprint = request.blueprint
        allowed_roles = ROLE_ACCESS.get(blueprint)

        if not allowed_roles:
            return None

        user = session.get("user")
        if not user:
            return jsonify({"message": "Authentication required."}), 401

        if user.get("role") not in allowed_roles:
            return jsonify({"message": "You do not have permission for this action."}), 403

    @app.after_request
    def record_mutation_audit(response):
        """Audit successful create, edit, and delete requests without affecting them."""
        if (
            response.status_code >= 400
            or request.method not in {"POST", "PUT", "PATCH", "DELETE"}
            or request.blueprint not in ROLE_ACCESS
        ):
            return response

        connection = get_db_connection()
        if not connection:
            return response

        cursor = connection.cursor()
        try:
            view_args = request.view_args or {}
            entity_id = next(iter(view_args.values()), None)
            record_audit(
                cursor,
                request.method.title(),
                request.blueprint.title(),
                entity_id,
                {"path": request.path},
            )
            connection.commit()
        except Exception as error:
            connection.rollback()
            app.logger.warning("Could not write audit entry: %s", error)
        finally:
            cursor.close()
            connection.close()

        return response

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(customers_bp)
    app.register_blueprint(rfqs_bp)
    app.register_blueprint(quotations_bp)
    app.register_blueprint(jobs_bp)
    app.register_blueprint(invoices_bp)
    app.register_blueprint(payments_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(reports_bp)
    app.register_blueprint(company_bp)
    app.register_blueprint(users_bp)
    app.register_blueprint(attachments_bp)
    app.register_blueprint(notifications_bp)
    app.register_blueprint(audit_logs_bp)
    app.register_blueprint(catalog_bp)
    app.register_blueprint(email_bp)
    app.register_blueprint(public_bp)
    app.register_blueprint(reminders_bp)
    app.register_blueprint(templates_bp)

    if os.getenv("REMINDER_SCHEDULER") == "1":
        from app.scheduler import start_reminder_scheduler
        start_reminder_scheduler(app)

    @app.route("/")
    def home():
        return {"message": "RayaProcure API running"}

    return app
