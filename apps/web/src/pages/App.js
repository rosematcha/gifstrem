import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Route, Routes } from 'react-router-dom';
import LandingPage from './LandingPage';
import SubmissionPage from './SubmissionPage';
import LoginPage from './LoginPage';
import SignupPage from './SignupPage';
import DashboardPage from './DashboardPage';
import OverlayPage from './OverlayPage';
import { ProtectedRoute } from '../components/ProtectedRoute';
const App = () => {
    return (_jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(LandingPage, {}) }), _jsx(Route, { path: "/auth/login", element: _jsx(LoginPage, {}) }), _jsx(Route, { path: "/auth/signup", element: _jsx(SignupPage, {}) }), _jsx(Route, { path: "/dashboard", element: _jsx(ProtectedRoute, { children: _jsx(DashboardPage, {}) }) }), _jsx(Route, { path: "/overlay", element: _jsx(OverlayPage, {}) }), _jsx(Route, { path: "/:slug", element: _jsx(SubmissionPage, {}) })] }));
};
export default App;
