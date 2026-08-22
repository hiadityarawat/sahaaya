"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="error-page">
      <span>!</span>
      <h1>The coordination view could not load.</h1>
      <p>
        No emergency request was lost. Retry the view or return to the
        operational overview.
      </p>
      <button onClick={reset}>Retry safely</button>
      <Link href="/">Return to overview</Link>
    </main>
  );
}
