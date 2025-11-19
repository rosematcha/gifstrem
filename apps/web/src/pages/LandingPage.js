import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link, useNavigate } from 'react-router-dom';
import { getToken } from '../lib/auth';
const LandingPage = () => {
    const navigate = useNavigate();
    const handleLoginClick = (event) => {
        if (getToken()) {
            event.preventDefault();
            navigate('/dashboard');
        }
    };
    return (_jsx("main", { className: "min-h-screen bg-charcoal text-white flex items-center", children: _jsxs("div", { className: "mx-auto flex max-w-4xl flex-col gap-l px-6 py-16 text-center", children: [_jsxs("div", { children: [_jsxs("h1", { className: "text-7xl sm:text-8xl font-display tracking-tight", children: [_jsx("span", { className: "text-white", children: "GIF" }), _jsx("span", { className: "text-violet", children: "strem" })] }), _jsx("p", { className: "mt-6 text-lg text-coolGray max-w-2xl mx-auto", children: "Turn your stream into a community bulletin board with crowd-sourced, moderated GIFs. Now in open alpha!" })] }), _jsxs("div", { className: "flex flex-col items-center justify-center gap-4 sm:flex-row", children: [_jsx(Link, { to: "/auth/signup", className: "rounded-btn bg-violet px-6 py-[10px] font-semibold text-white shadow-medium hover:bg-softViolet hover:-translate-y-[1px] active:bg-deepViolet active:translate-y-0", children: "Create streamer account" }), _jsx(Link, { to: "/auth/login", className: "text-sm font-semibold text-softViolet hover:text-white", onClick: handleLoginClick, children: "Already using it? Login" })] }), _jsxs("p", { className: "text-sm text-dimGray", children: [_jsx("span", { className: "text-violet", children: "GIFstrem" }), " is", ' ', _jsx("a", { href: "https://github.com/rosematcha/gifstrem", target: "_blank", rel: "noopener noreferrer", className: "text-violet hover:text-softViolet underline", children: "open source!" })] })] }) }));
};
export default LandingPage;
