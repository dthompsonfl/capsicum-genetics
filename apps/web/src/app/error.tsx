'use client';

import Link from 'next/link';
import { useEffect } from 'react';

interface ApplicationErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ApplicationErrorBoundary({
  error,
  reset,
}: ApplicationErrorBoundaryProps) {
  useEffect(() => {
    console.error(
      JSON.stringify({
        digest: error.digest,
        errorName: error.name,
        event: 'ui.route_error',
      }),
    );
  }, [error]);

  return (
    <section className="card empty-state" role="alert">
      <span className="eyebrow">Something went wrong</span>
      <h1>This screen could not be loaded.</h1>
      <p className="lede">
        Your saved breeding records were not changed. Try the screen again. If it keeps failing,
        give the system administrator the reference below.
      </p>
      {error.digest ? <p className="mono break-all">Reference: {error.digest}</p> : null}
      <div className="button-row" style={{ justifyContent: 'center' }}>
        <button className="button" type="button" onClick={reset}>
          Try again
        </button>
        <Link className="button secondary" href="/">
          Return home
        </Link>
      </div>
    </section>
  );
}
