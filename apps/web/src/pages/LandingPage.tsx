import { MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getToken } from '../lib/auth';

const LandingPage = () => {
  const navigate = useNavigate();

  const handleLoginClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (getToken()) {
      event.preventDefault();
      navigate('/dashboard');
    }
  };

  return (
    <main className="min-h-screen bg-charcoal text-white flex items-center">
      <div className="mx-auto flex max-w-4xl flex-col gap-l px-6 py-16 text-center">
        <div>
          <h1 className="text-7xl sm:text-8xl font-display tracking-tight">
            <span className="text-white">GIF</span>
            <span className="text-violet">strem</span>
          </h1>
          <p className="mt-6 text-lg text-coolGray max-w-2xl mx-auto">
            Turn your stream into a community bulletin board with crowd-sourced, moderated GIFs and still images. Now in open alpha!
          </p>
        </div>
        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            to="/auth/signup"
            className="rounded-btn bg-violet px-6 py-[10px] font-semibold text-white shadow-medium hover:bg-softViolet hover:-translate-y-[1px] active:bg-deepViolet active:translate-y-0"
          >
            Create streamer account
          </Link>
          <Link to="/auth/login" className="text-sm font-semibold text-softViolet hover:text-white" onClick={handleLoginClick}>
            Already using it? Login
          </Link>
        </div>
        <p className="text-sm text-dimGray">
          <span className="text-violet">GIFstrem</span> is{' '}
          <a
            href="https://github.com/rosematcha/gifstrem"
            target="_blank"
            rel="noopener noreferrer"
            className="text-violet hover:text-softViolet underline"
          >
            open source!
          </a>
        </p>
      </div>
    </main>
  );
};

export default LandingPage;
