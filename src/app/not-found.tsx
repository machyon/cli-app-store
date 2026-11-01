import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-24">
      <pre className="mb-6 font-mono text-sm text-mute">
        <span className="text-accent">$</span> which app{"\n"}app not found
      </pre>
      <h1 className="mb-3 text-3xl font-bold tracking-tight">That app isn’t in the catalog.</h1>
      <p className="mb-6 text-mute">It may have been renamed or unpublished.</p>
      <Link href="/" className="border border-ink px-3 py-1.5 text-sm hover:bg-ink hover:text-bg">
        Browse all apps
      </Link>
    </div>
  );
}
