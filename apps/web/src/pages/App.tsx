import { Route, Routes } from 'react-router-dom';
import LandingPage from './LandingPage';
import SubmissionPage from './SubmissionPage';
import LoginPage from './LoginPage';
import SignupPage from './SignupPage';
import DashboardPage from './DashboardPage';
import OverlayPage from './OverlayPage';
import AccountSettingsPage from './AccountSettingsPage';
import { ProtectedRoute } from '../components/ProtectedRoute';

const App = () => {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/auth/login" element={<LoginPage />} />
      <Route path="/auth/signup" element={<SignupPage />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <AccountSettingsPage />
          </ProtectedRoute>
        }
      />
      <Route path="/overlay" element={<OverlayPage />} />
      <Route path="/:slug" element={<SubmissionPage />} />
    </Routes>
  );
};

export default App;
