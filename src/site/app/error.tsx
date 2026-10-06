"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="shell page-message">
      <h1>Unable to load</h1>
      <p>Please try again.</p>
      <button onClick={reset}>Try again</button>
    </main>
  );
}
