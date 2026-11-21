import "./App.css";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import { PrivacyProvider } from "./components/Money";

// Nothing but the login page is rendered until the user is signed in.
function Gate() {
  const { user, loading } = useAuth();
  if (loading) return <div className="state-msg full">Loading…</div>;
  return user ? <DashboardPage /> : <LoginPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <PrivacyProvider>
        <Gate />
      </PrivacyProvider>
    </AuthProvider>
  );
}
