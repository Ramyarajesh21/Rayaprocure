import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import MobileNav from "../components/MobileNav";

function MainLayout({ children }) {
    return (
        <div className="app-layout">
            <Sidebar />
            <MobileNav />

            <div className="main-area">
                <Navbar />

                <main className="page-content">
                    {children}
                </main>
            </div>
        </div>
    );
}

export default MainLayout;