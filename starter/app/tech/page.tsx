import Link from "next/link";

export default function TechLandingPage() {
  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Tech — field workflows</h1>
      </div>
      <nav className="grid gap-4 sm:grid-cols-2 max-w-xl" aria-label="Technician workflows">
        <WorkflowButton href="/tech/receive" title="Receive" />
        <WorkflowButton href="/tech/store" title="Store" />
        <WorkflowButton href="/tech/deploy" title="Deploy" />
        <WorkflowButton href="/tech/transfer" title="Custody transfer" />
      </nav>
    </div>
  );
}

function WorkflowButton({ href, title }: { href: string; title: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-center rounded-xl border-2 border-gray-200 bg-white px-6 py-10 min-h-[5.5rem] text-center text-xl font-semibold text-gray-900 shadow-sm transition hover:border-blue-500 hover:bg-blue-50/40 hover:text-blue-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
    >
      {title}
    </Link>
  );
}
