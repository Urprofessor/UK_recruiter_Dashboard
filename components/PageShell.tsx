import Link from "next/link";

export function PageShell({
  children,
  active,
}: {
  children: React.ReactNode;
  active?: "hiring" | "monitoring";
}) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-10">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900 md:text-lg">
            ADHD Clinic — Hiring Capacity Dashboard
          </h1>
          <p className="mt-1 text-xs text-gray-500">招聘容量判断 · v0（mock 数据）</p>
        </div>
        <nav className="flex shrink-0 gap-1 rounded-md border border-gray-200 bg-white p-1 text-xs">
          <Link
            href="/"
            className={
              "rounded px-3 py-1.5 " +
              (active === "hiring"
                ? "bg-gray-900 text-white"
                : "text-gray-600 hover:bg-gray-100")
            }
          >
            招聘判断
          </Link>
          <Link
            href="/monitoring"
            className={
              "rounded px-3 py-1.5 " +
              (active === "monitoring"
                ? "bg-gray-900 text-white"
                : "text-gray-600 hover:bg-gray-100")
            }
          >
            日常监控
          </Link>
        </nav>
      </header>
      {children}
    </div>
  );
}
