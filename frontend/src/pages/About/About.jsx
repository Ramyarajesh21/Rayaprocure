import MainLayout from "../../layouts/MainLayout";
import "./About.css";

function About() {
    return (
        <MainLayout>
            <div className="about-page">

                {/* Hero Section */}
                <section className="about-hero">

                    <div className="about-hero-content">

                        <span className="about-eyebrow">
                            ABOUT RAYAPROCURE
                        </span>

                        <h1>
                            Smarter vendor operations,
                            <span> beautifully organized.</span>
                        </h1>

                        <p>
                            Rayaprocure is a modern vendor operations
                            management platform designed to simplify
                            the complete journey from customer requests
                            to quotations, jobs, invoices and payments.
                        </p>

                        <div className="about-hero-meta">
                            <div>
                                <strong>01</strong>
                                <span>Vendor Operations</span>
                            </div>

                            <div>
                                <strong>02</strong>
                                <span>Work Management</span>
                            </div>

                            <div>
                                <strong>03</strong>
                                <span>Business Visibility</span>
                            </div>
                        </div>

                    </div>

                    <div className="about-hero-card">

                        <div className="hero-card-glow"></div>

                        <div className="hero-card-content">

                            <span>RAYAPROCURE</span>

                            <strong>
                                Vendor Operations
                            </strong>

                            <p>
                                One workspace.
                                Complete operational visibility.
                            </p>

                        </div>

                    </div>

                </section>


                {/* About Company */}
                <section className="about-company">

                    <div className="section-heading">

                        <span>
                            WHO WE ARE
                        </span>

                        <h2>
                            Built around the way
                            <br />
                            vendor businesses work.
                        </h2>

                    </div>

                    <div className="company-description">

                        <p>
                            Rayaprocure brings essential vendor operations
                            into one organized workspace. Instead of
                            managing customers, requests, quotations,
                            jobs, invoices and payments across separate
                            records, teams can follow the complete workflow
                            from one place.
                        </p>

                        <p>
                            The platform is designed with simplicity,
                            visibility and operational control in mind —
                            helping businesses keep their work organized
                            while giving decision-makers a clear view of
                            ongoing activities.
                        </p>

                    </div>

                </section>


                {/* Workflow */}
                <section className="about-workflow">

                    <div className="section-heading centered">

                        <span>
                            OUR WORKFLOW
                        </span>

                        <h2>
                            From request to payment.
                        </h2>

                        <p>
                            A connected workflow for everyday vendor operations.
                        </p>

                    </div>

                    <div className="workflow-line">

                        <div className="workflow-item">
                            <div className="workflow-number">
                                01
                            </div>
                            <strong>Customer</strong>
                            <span>Manage customer information</span>
                        </div>

                        <div className="workflow-arrow">
                            →
                        </div>

                        <div className="workflow-item">
                            <div className="workflow-number">
                                02
                            </div>
                            <strong>RFQ</strong>
                            <span>Track customer requests</span>
                        </div>

                        <div className="workflow-arrow">
                            →
                        </div>

                        <div className="workflow-item">
                            <div className="workflow-number">
                                03
                            </div>
                            <strong>Quotation</strong>
                            <span>Prepare business quotations</span>
                        </div>

                        <div className="workflow-arrow">
                            →
                        </div>

                        <div className="workflow-item">
                            <div className="workflow-number">
                                04
                            </div>
                            <strong>Job</strong>
                            <span>Manage active work</span>
                        </div>

                        <div className="workflow-arrow">
                            →
                        </div>

                        <div className="workflow-item">
                            <div className="workflow-number">
                                05
                            </div>
                            <strong>Invoice</strong>
                            <span>Track billing information</span>
                        </div>

                        <div className="workflow-arrow">
                            →
                        </div>

                        <div className="workflow-item">
                            <div className="workflow-number">
                                06
                            </div>
                            <strong>Payment</strong>
                            <span>Monitor received payments</span>
                        </div>

                    </div>

                </section>


                {/* Features */}
                <section className="about-features">

                    <div className="section-heading centered">

                        <span>
                            PLATFORM CAPABILITIES
                        </span>

                        <h2>
                            Everything important,
                            in one place.
                        </h2>

                    </div>

                    <div className="feature-grid">

                        <div className="feature-card">
                            <div className="feature-icon">
                                CM
                            </div>
                            <h3>Customer Management</h3>
                            <p>
                                Keep customer information organized
                                and accessible whenever your team needs it.
                            </p>
                        </div>

                        <div className="feature-card">
                            <div className="feature-icon">
                                RF
                            </div>
                            <h3>RFQ Management</h3>
                            <p>
                                Capture and track incoming requests
                                through a structured workflow.
                            </p>
                        </div>

                        <div className="feature-card">
                            <div className="feature-icon">
                                QT
                            </div>
                            <h3>Quotation Management</h3>
                            <p>
                                Create and manage quotations while
                                keeping them connected to customer requests.
                            </p>
                        </div>

                        <div className="feature-card">
                            <div className="feature-icon">
                                JB
                            </div>
                            <h3>Job Management</h3>
                            <p>
                                Monitor ongoing and completed work
                                from a centralized workspace.
                            </p>
                        </div>

                        <div className="feature-card">
                            <div className="feature-icon">
                                IN
                            </div>
                            <h3>Invoice Tracking</h3>
                            <p>
                                Keep invoice information visible and
                                connected to completed business work.
                            </p>
                        </div>

                        <div className="feature-card">
                            <div className="feature-icon">
                                PY
                            </div>
                            <h3>Payment Tracking</h3>
                            <p>
                                Record payments and monitor outstanding
                                amounts without unnecessary complexity.
                            </p>
                        </div>

                    </div>

                </section>


                {/* Technology */}
                <section className="about-technology">

                    <div className="technology-content">

                        <span className="about-eyebrow">
                            TECHNOLOGY
                        </span>

                        <h2>
                            Simple technology.
                            <br />
                            Reliable foundation.
                        </h2>

                        <p>
                            Rayaprocure is built using a practical,
                            maintainable technology stack focused on
                            performance, usability and future growth.
                        </p>

                    </div>

                    <div className="technology-stack">

                        <div className="tech-item">
                            <span>Frontend</span>
                            <strong>
                                React.js · JavaScript · HTML · CSS
                            </strong>
                        </div>

                        <div className="tech-item">
                            <span>Backend</span>
                            <strong>
                                Python · Flask
                            </strong>
                        </div>

                        <div className="tech-item">
                            <span>Database</span>
                            <strong>
                                MySQL
                            </strong>
                        </div>

                        <div className="tech-item">
                            <span>Development</span>
                            <strong>
                                Git · GitHub · VS Code · Postman
                            </strong>
                        </div>

                    </div>

                </section>


                {/* Leadership */}
                <section className="about-leadership">

                    <div className="leadership-photo">

                        <img
                            src="https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=900&q=85"
                            alt="Professional Rayaprocure executive"
                        />

                        <div className="photo-caption">
                            <span>RAYAPROCURE</span>
                            <strong>Operations & Strategy</strong>
                        </div>

                    </div>

                    <div className="leadership-content">

                        <span className="about-eyebrow">
                            OUR APPROACH
                        </span>

                        <h2>
                            Professional operations
                            should feel simple.
                        </h2>

                        <p>
                            Rayaprocure is designed around a straightforward
                            idea: business teams should spend less time
                            searching for information and more time getting
                            work done.
                        </p>

                        <p>
                            Every module is connected to the operational
                            journey, giving teams a consistent workspace
                            from the first customer request through
                            payment tracking.
                        </p>

                        <div className="leadership-signature">
                            <strong>
                                Rayaprocure Team
                            </strong>
                            <span>
                                Operations & Business Solutions
                            </span>
                        </div>

                    </div>

                </section>


                {/* Contact */}
                <section className="about-contact">

                    <div className="contact-intro">

                        <span className="about-eyebrow">
                            GET IN TOUCH
                        </span>

                        <h2>
                            Let’s build better
                            vendor operations.
                        </h2>

                        <p>
                            Have a question about Rayaprocure?
                            Our team would be happy to hear from you.
                        </p>

                    </div>

                    <div className="contact-details">

                        <div className="contact-item">
                            <span>Email</span>
                            <strong>
                                hello@rayaprocure.com
                            </strong>
                        </div>

                        <div className="contact-item">
                            <span>Phone</span>
                            <strong>
                                +91 98765 43210
                            </strong>
                        </div>

                        <div className="contact-item">
                            <span>Office</span>
                            <strong>
                                Chennai, Tamil Nadu, India
                            </strong>
                        </div>

                    </div>

                </section>


                {/* Footer */}
                <section className="about-footer">

                    <div>
                        <strong>
                            Rayaprocure
                        </strong>

                        <span>
                            Vendor Operations Management System
                        </span>
                    </div>

                    <p>
                        © 2026 Rayaprocure. All rights
                        reserved. Developed by the Rayaprocure Team.
                    </p>
                    </section> </div> </MainLayout> ); } export default About;