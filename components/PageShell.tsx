import Link from "next/link";

export function PageShell({
  children,
  active,
}: {
  children: React.ReactNode;
  active?: "hiring" | "monitoring";
}) {
  return (
    <div className="px-4 py-6 md:px-6 md:py-8">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gray-900 text-xs font-semibold text-white">
            A
          </div>
          <div>
            <h1 className="text-[15px] font-semibold leading-tight text-gray-900">
              ADHD Clinic — Hiring Capacity
            </h1>
            <p className="text-[11px] text-gray-500">招聘容量判断 · v0（mock 数据）</p>
          </div>
        </div>
        <nav className="flex shrink-0 gap-1 rounded-lg border border-[#f0eeea] bg-white p-1 text-xs">
          <Link
            href="/"
            className={
              "rounded-md px-3 py-1.5 transition-colors " +
              (active === "hiring"
                ? "bg-gray-900 text-white"
                : "text-gray-600 hover:bg-gray-100")
            }
          >
            招聘判断
          </Link>
          <Link
            href="/balance-sheet"
            className={
              "rounded-md px-3 py-1.5 transition-colors " +
              (active === "monitoring"
                ? "bg-gray-900 text-white"
                : "text-gray-600 hover:bg-gray-100")
            }
          >
            平衡表
          </Link>
        </nav>
      </header>
      {children}
    </div>
  );
}
