from flask import Flask
from flask_cors import CORS
from app.routes.auth import auth_bp
from app.routes.customers import customers_bp
from app.routes.rfqs import rfqs_bp
from app.routes.quotations import quotations_bp
from app.routes.jobs import jobs_bp
from app.routes.invoices import invoices_bp
from app.routes.payments import payments_bp
from app.routes.dashboard import dashboard_bp
from app.routes.reports import reports_bp

def create_app():
    app = Flask(__name__)

    # Secret key for Flask session
    app.config["SECRET_KEY"] = "vendorflow-secret-key-2026"

    CORS(app, supports_credentials=True)

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(customers_bp)
    app.register_blueprint(rfqs_bp)
    app.register_blueprint(quotations_bp)
    app.register_blueprint(jobs_bp)
    app.register_blueprint(invoices_bp)
    app.register_blueprint(payments_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(reports_bp)

    @app.route("/")
    def home():
        return {"message": "VendorFlow Backend Running"}

    return app