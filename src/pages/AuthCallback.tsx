import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { completeSignIn } from "../api/auth";

/** Where the sign-in provider returns the browser; finishes the sign-in and moves on. */
export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  // The authorization code is single-use; StrictMode would otherwise redeem it twice.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    completeSignIn()
      .then((returnTo) => navigate(returnTo, { replace: true }))
      .catch((failure: Error) => setError(failure.message));
  }, [navigate]);
  if (!error) return <div className="empty">Signing in…</div>;
  return (
    <div className="empty" role="alert">
      Sign-in failed: {error}{" "}
      <a href="/" style={{ color: "var(--text)" }}>
        Back to the studio
      </a>
    </div>
  );
}
