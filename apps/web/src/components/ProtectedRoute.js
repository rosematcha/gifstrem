import { jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { Navigate } from 'react-router-dom';
import { getToken } from '../lib/auth';
export function ProtectedRoute({ children }) {
    const token = getToken();
    if (!token) {
        return _jsx(Navigate, { to: "/auth/login", replace: true });
    }
    return _jsx(_Fragment, { children: children });
}
