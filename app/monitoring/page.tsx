import { PageShell } from "@/components/PageShell";

export default function MonitoringPage() {
  return (
    <PageShell active="monitoring">
      <div className="rounded-xl border border-dashed border-[#e7e3dc] bg-white p-12 text-center">
        <h2 className="text-base font-medium text-gray-900">日常运营监控</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
          这一页留作 v2：接入实际业务数据后，展示当周诊次完成数、no-show
          率、滴定 → 维持转化、按人产出等运营指标。
        </p>
        <p className="mt-4 text-xs text-gray-400">v0 仅做招聘判断，未实现。</p>
      </div>
    </PageShell>
  );
}
