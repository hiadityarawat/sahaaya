export default function NotFound() {
  return (
    <main className="error-page">
      <span>404</span>
      <h1>That response page was not found.</h1>
      <p>
        The link may be outdated, or the request may no longer be publicly
        visible.
      </p>
      <Link href="/">Return to response overview</Link>
    </main>
  );
}
import Link from "next/link";
