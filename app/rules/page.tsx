import { PageShell } from "@/components/PageShell";

export const metadata = { title: "规则说明 — ADHD Clinic Capacity" };

export default function RulesPage() {
  return (
    <PageShell active="rules">
      <div className="mx-auto max-w-4xl space-y-8">
        {/* Intro */}
        <section className="rounded-xl border border-[#f0eeea] bg-white p-6">
          <h1 className="text-lg font-semibold text-gray-900">业务规则与模型说明</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-gray-600">
            这一页是给 leader / 跨部门同事用的业务参考——把"我们的供需模型基于哪些假设、哪些公式"说清楚。
            数字与判断在<a className="text-gray-900 underline" href="/">招聘判断</a>页，参数调整在<a className="text-gray-900 underline" href="/balance-sheet">平衡表</a>页。
          </p>
        </section>

        {/* §1 患者生命周期 */}
        <Section number="§1" title="患者生命周期" hint="一个新患者从首次预约到长期维持的全路径">
          <PatientFlow />
          <ul className="mt-5 space-y-2 text-[13px] text-gray-700">
            <li>● <strong>初诊</strong>：45 min，只能 MD 做（NP 没诊断权）。每个新患者<strong>一次</strong>。</li>
            <li>● <strong>复诊（Drug Initiation）</strong>：30 min，MD 或 Titration Team 都可以。首诊后约 2 周做一次，<strong>一次</strong>。</li>
            <li>● <strong>维持（Follow-up）</strong>：15 min，反复进行。频率由 leader 决定（默认 fu_rate = 0.5 次/周，即每 2 周一次）。</li>
            <li className="text-gray-500">流失/复发：维持期患者可能流失，或复发后回流到复诊。v0 暂未单独建模。</li>
          </ul>
        </Section>

        {/* §2 人员角色 */}
        <Section number="§2" title="人员角色与分工" hint="谁能做什么活——决定产能怎么分配">
          <div className="grid gap-3 md:grid-cols-3">
            <RoleCard
              name="全流程 MD"
              colorClass="bg-indigo-50 border-indigo-200 text-indigo-900"
              dotClass="bg-indigo-500"
              capabilities={["初诊", "复诊", "维持"]}
              note="病人在自己的 panel 内一条龙跟到底。能力全面但人力稀缺，是最贵的资源。"
            />
            <RoleCard
              name="纯诊断 MD"
              colorClass="bg-pink-50 border-pink-200 text-pink-900"
              dotClass="bg-pink-500"
              capabilities={["初诊"]}
              note="只做首次诊断。患者诊断完即转 Titration Team 接管。不维护 panel。"
            />
            <RoleCard
              name="Titration Team（NP）"
              colorClass="bg-teal-50 border-teal-200 text-teal-900"
              dotClass="bg-teal-500"
              capabilities={["复诊", "维持"]}
              note="接管纯诊断 MD 的患者：做 drug initiation + 长期维持 fu。需为 IP-NP（独立处方权）才能开 ADHD 受控药。"
            />
          </div>
        </Section>

        {/* §3 关键约束 */}
        <Section number="§3" title="关键约束" hint="模型必须遵守的硬规则">
          <ul className="space-y-2 text-[13px] text-gray-700">
            <li>1. <strong>初诊只能 MD</strong>——NP 无诊断权。</li>
            <li>2. <strong>NP 必须是 IP-NP</strong>（Independent Prescriber Nurse）才能开 ADHD 兴奋剂（Schedule 2 受控药）。</li>
            <li>3. <strong>单 MD panel 上限 150-250 人</strong>——超过会自动飞书预警，并暂时关闭 new patient toggle，直到人数回落。</li>
            <li>4. <strong>复诊 = 一次性事件</strong>——不是反复的"调药期"，是初诊后大约 2 周做的 1 次 drug init visit。</li>
            <li>5. <strong>维持 = 反复进行</strong>——频率参数化（默认 fu_rate = 0.5 次/周）。</li>
            <li>6. <strong>Lead time</strong>：MD 12 周（发 JD 到上岗），Titration Team / NP 8 周。模型默认看相同长度的前瞻窗口。</li>
          </ul>
        </Section>

        {/* §4 公式 */}
        <Section number="§4" title="核心公式" hint="平衡表上的数字怎么算出来的">
          <Sub title="① 单人每周可看病小时数（每个角色单独配）">
            <Code>{`H_full = h_full × u        （全流程 MD 工时/人 × 利用率）
H_pure = h_pure × u        （纯诊断 MD 工时/人 × 利用率）
H_NP   = h_NP   × u        （NP 工时/人 × 利用率）`}</Code>
            <p className="mt-1 text-[11px] text-gray-500">
              三类角色的实际工时可能不一样（比如 NP 全职 25h、纯诊断 MD 兼职 15h），所以分开配置。利用率默认 85%（医生不按 100% 排满）。
            </p>
          </Sub>

          <Sub title="② 全流程 MD 桶">
            <Code>{`Step 1  现有 panel 维持小时数
        D_full_existing = Pnl_full × fu_rate × τ_fu

Step 2  剩余可分配小时数
        Free_full = (n_full × H_full) − D_full_existing

Step 3  可接新患者数（每个新患者 = 初诊 45min + drug init 30min = 1.25h）
        NewCap_full = max(0, Free_full) / 1.25`}</Code>
          </Sub>

          <Sub title="③ 纯诊断 MD + NP（Titration Team）桶">
            <Code>{`Step 1  NP 维持现有 panel 所需小时数
        D_tit_existing = Pnl_tit × fu_rate × τ_fu

Step 2  纯诊断 MD 可做的初诊数
        DxCap = (n_pure × H_pure) / 0.75     （τ_init = 0.75h）

Step 3  NP 可做的 drug init 数
        Free_tit = max(0, (n_NP × H_NP) − D_tit_existing)
        TitCap   = Free_tit / 0.5            （τ_drug = 0.5h）

Step 4  这一桶的新患者上限 = 两端最小（任一不够都做不成）
        NewCap_B = min(DxCap, TitCap)`}</Code>
          </Sub>

          <Sub title="④ 全院新患者周容量">
            <Code>{`NewCap_total = NewCap_full + NewCap_B`}</Code>
          </Sub>

          <Sub title="⑤ 判断状态（与预测对比）">
            <Code>{`Coverage = NewCap_total / 预期新预约
≥ 1.20  → ✅ 充裕
1.00 .. 1.20 → ⚠️ 紧张（吃掉冗余，本周启动招聘）
< 1.00  → 🔴 不够（立刻发 JD）`}</Code>
          </Sub>
        </Section>

        {/* §5 Changelog */}
        <Section number="§5" title="模型变更记录" hint="每次业务理解校正都在这里登记，便于回溯">
          <div className="overflow-hidden rounded-lg border border-[#f0eeea]">
            <table className="w-full text-[12px]">
              <thead className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2 w-24">版本</th>
                  <th className="px-3 py-2 w-32">日期</th>
                  <th className="px-3 py-2">变更内容</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f5f3ef]">
                <tr>
                  <td className="px-3 py-2 font-medium text-gray-700 align-top">v0.3（当前）</td>
                  <td className="px-3 py-2 text-gray-500 align-top">2026-06-08</td>
                  <td className="px-3 py-2 text-gray-700">
                    <ul className="space-y-1">
                      <li>● 引入"小时供给平衡"框架（PDF MVP），输出由"Coverage"扩展为"本周可接新患者数"。</li>
                      <li>● 增加 <strong>Titration Team</strong> 角色（之前的 NP）+ 区分 <strong>全流程 / 纯诊断 MD</strong> 两类。</li>
                      <li>● 纠正：<strong>复诊为一次性事件</strong>（之前误认为是反复每 2 周一次的滴定期）。</li>
                      <li>● 患者数据结构改为按 panel 拆分：<code className="font-mono text-[11px]">panelFullFlow</code> + <code className="font-mono text-[11px]">panelTitration</code>。</li>
                      <li>● 加 Panel Limit 软约束（默认 200，超过 150-250 区间预警）。</li>
                    </ul>
                  </td>
                </tr>
                <tr>
                  <td className="px-3 py-2 font-medium text-gray-700 align-top">v0.2</td>
                  <td className="px-3 py-2 text-gray-500 align-top">2026-06-08</td>
                  <td className="px-3 py-2 text-gray-700">
                    <ul className="space-y-1">
                      <li>● 术语订正：滴定 → 复诊。患者三阶段 = 初诊 → 复诊 → 维持。</li>
                      <li>● 参数对齐 Excel MVP：利用率 85%、MD lead time 12w、NP 8w、25h/周 effective。</li>
                      <li>● 平衡表页 25 个参数全部可调 + 保存到 localStorage。</li>
                    </ul>
                  </td>
                </tr>
                <tr>
                  <td className="px-3 py-2 font-medium text-gray-700 align-top">v0.1</td>
                  <td className="px-3 py-2 text-gray-500 align-top">2026-06-08</td>
                  <td className="px-3 py-2 text-gray-700">
                    初始版本：基于"需求 vs 产能"的 Coverage 模型，MD 分仅初诊 / 全流程两类，NP 单一角色。
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Section>

        <p className="px-1 pb-4 text-center text-[11px] text-gray-400">
          以上规则随业务理解迭代会持续更新，每次改动都会登记到 §5。
        </p>
      </div>
    </PageShell>
  );
}

// ============================================================
// 子组件
// ============================================================

function Section({
  number,
  title,
  hint,
  children,
}: {
  number: string;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[#f0eeea] bg-white p-6">
      <header className="mb-4">
        <h2 className="flex items-baseline gap-2 text-base font-semibold text-gray-900">
          <span className="text-gray-400">{number}</span>
          <span>{title}</span>
        </h2>
        {hint && <p className="mt-1 text-[12px] text-gray-500">{hint}</p>}
      </header>
      {children}
    </section>
  );
}

function Sub({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 first:mt-0">
      <h3 className="mb-1.5 text-[13px] font-medium text-gray-800">{title}</h3>
      {children}
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-md bg-gray-50 px-3 py-2.5 font-mono text-[11.5px] leading-relaxed text-gray-800">
      {children}
    </pre>
  );
}

function RoleCard({
  name,
  capabilities,
  note,
  colorClass,
  dotClass,
}: {
  name: string;
  capabilities: string[];
  note: string;
  colorClass: string;
  dotClass: string;
}) {
  return (
    <div className={`rounded-lg border p-4 ${colorClass}`}>
      <div className="flex items-center gap-2">
        <span className={`inline-block h-2 w-2 rounded-full ${dotClass}`} />
        <h3 className="text-[13px] font-semibold">{name}</h3>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1">
        {capabilities.map((c) => (
          <span key={c} className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-medium">
            {c}
          </span>
        ))}
      </div>
      <p className="mt-3 text-[11.5px] leading-relaxed text-gray-700">{note}</p>
    </div>
  );
}

function PatientFlow() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 rounded-lg bg-gray-50 p-5 text-[12px]">
      <FlowNode label="新预约" color="bg-gray-200 text-gray-700" />
      <Arrow />
      <FlowNode label="初诊 45min（MD）" color="bg-amber-100 text-amber-900 ring-1 ring-amber-200" />
      <Arrow label="≈2 周" />
      <FlowNode label="复诊 30min（MD or Titration）" color="bg-blue-100 text-blue-900 ring-1 ring-blue-200" />
      <Arrow />
      <FlowNode label="维持 15min × 反复（Titration Team）" color="bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200" />
    </div>
  );
}

function FlowNode({ label, color }: { label: string; color: string }) {
  return (
    <span className={`inline-block rounded-md px-3 py-2 font-medium ${color}`}>
      {label}
    </span>
  );
}

function Arrow({ label }: { label?: string }) {
  return (
    <span className="flex flex-col items-center text-gray-400">
      <span className="text-base leading-none">→</span>
      {label && <span className="text-[10px]">{label}</span>}
    </span>
  );
}
