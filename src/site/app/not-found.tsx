import Link from "next/link";
export default function NotFound() {
  return (
    <main className="shell page-message">
      <h1>Page not found</h1>
      <Link href="/">Back to Freebin</Link>
    </main>
  );
}
