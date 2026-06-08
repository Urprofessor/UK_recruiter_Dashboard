# 供需 / 招聘模型流程图

> 三张图：① 病人临床流程 ② 角色与任务匹配 ③ 招聘判断逻辑。
> GitHub、VSCode、Notion 都能直接渲染 Mermaid 代码块。

---

## ① 病人临床流程

患者从新预约到长期维持的全路径，以及每个阶段由谁负责。

```mermaid
flowchart LR
    A([新预约]) --> B[首诊<br/>45 min]
    B -->|留存| C[复诊<br/>调剂量阶段<br/>30 min × 每 2 周]
    B -.no-show.-> X1([流失])
    C --> D{症状稳定?<br/>≥ 3 个月}
    D -->|否| C
    D -->|是| E[维持<br/>长期复查<br/>15 min × 每 12 周]
    E -.复发/换药.-> C
    E -.流失.-> X2([离开])

    classDef stage1 fill:#fef3c7,stroke:#f59e0b,color:#92400e
    classDef stage2 fill:#dbeafe,stroke:#3b82f6,color:#1e40af
    classDef stage3 fill:#d1fae5,stroke:#10b981,color:#065f46
    classDef neutral fill:#f3f4f6,stroke:#9ca3af,color:#4b5563

    class B stage1
    class C stage2
    class D stage2
    class E stage3
    class A,X1,X2 neutral
```

**关键点**
- 三阶段单向推进，但维持期可回流到复诊（复发 / 换药）
- 流失节点 = 模型里的 churn，v0 暂未单独建模
- 时长是模型常数，存在 `data/constants.json` → `appointmentMinutes`

---

## ② 角色与任务匹配

谁能干什么活——决定产能怎么分配。

```mermaid
flowchart LR
    subgraph MDPool["MD 医生池"]
        M1["MD - 仅初诊<br/>e.g. 5 人"]
        M2["MD - 全流程<br/>e.g. 3 人"]
    end

    subgraph NPPool["NP 护士池"]
        N1["NP（IP-NP）<br/>e.g. 5 人"]
    end

    M1 ==> T1[初诊]
    M2 ==> T1
    M2 ==> T2[复诊]
    M2 ==> T3[维持]
    N1 ==> T2
    N1 ==> T3

    classDef md fill:#ede9fe,stroke:#7c3aed,color:#5b21b6
    classDef np fill:#ccfbf1,stroke:#0d9488,color:#115e59
    classDef task1 fill:#fef3c7,stroke:#f59e0b,color:#92400e
    classDef task2 fill:#dbeafe,stroke:#3b82f6,color:#1e40af
    classDef task3 fill:#d1fae5,stroke:#10b981,color:#065f46

    class M1,M2 md
    class N1 np
    class T1 task1
    class T2 task2
    class T3 task3
```

**关键约束**
- **初诊只能 MD**（NP 无诊断权）
- **全流程 MD 是双面手**：他们的时间按 `constants.fullFlowMdSplit` 拆给初诊 / 非初诊两边（v0 默认 50/50）
- **NP 必须是 IP-NP**（独立处方权）才能开 ADHD 兴奋剂（Schedule 2 受控药）

---

## ③ 招聘判断逻辑

模型每次跑出来回答两个问题：**MD 初诊够不够？复诊+维持够不够？**

```mermaid
flowchart TD
    Start([每周自动跑]) --> Parallel{并行两条独立判断}

    %% ---- MD 初诊线 ----
    Parallel --> MDBranch["🟦 MD 初诊瓶颈<br/>看未来 4 周（= MD lead time）"]
    MDBranch --> MDDemand["需求 = Σ 未来 4 周<br/>预约 × (1-no_show) × 45min"]
    MDBranch --> MDCap["产能 = 全 MD 可用时间<br/>(全流程 MD 只贡献 50%)"]
    MDDemand --> MDGap{"产能 ≥ 需求 × (1 + 20%)?"}
    MDCap --> MDGap

    MDGap -->|是| MD_OK([✅ 够用])
    MDGap -->|"≥ 需求<br/>但吃掉冗余"| MD_Tight([⚠️ 紧张<br/>本周内启动 MD 招聘])
    MDGap -->|否| MD_Short([🔴 不够<br/>立即发 JD<br/>建议新增 N 名 MD])

    %% ---- 复诊+维持线 ----
    Parallel --> NIBranch["🟪 复诊 + 维持瓶颈<br/>看未来 2 周（= NP lead time）"]
    NIBranch --> NIDemand["需求 = 复诊人数/2周 × 30min<br/>+ 维持人数/12周 × 15min"]
    NIBranch --> NICap["产能 = 全流程 MD × 50%<br/>+ 全部 NP"]
    NIDemand --> NIGap{"产能 ≥ 需求 × (1 + 20%)?"}
    NICap --> NIGap

    NIGap -->|是| NI_OK([✅ 够用])
    NIGap -->|"≥ 需求<br/>但吃掉冗余"| NI_Tight([⚠️ 紧张<br/>本周启动 NP 招聘])
    NIGap -->|否| NI_Short([🔴 不够<br/>立即招 NP<br/>或全流程 MD])

    classDef ok fill:#d1fae5,stroke:#059669,color:#065f46
    classDef tight fill:#fef3c7,stroke:#d97706,color:#92400e
    classDef short fill:#fee2e2,stroke:#dc2626,color:#991b1b
    classDef branch fill:#e0e7ff,stroke:#6366f1,color:#3730a3

    class MD_OK,NI_OK ok
    class MD_Tight,NI_Tight tight
    class MD_Short,NI_Short short
    class MDBranch,NIBranch branch
```

**为什么是"两条独立判断"而不是"一个总判断"**
- 招的人不一样：MD 紧张 → 招 MD；非初诊紧张 → 招 NP（成本更低）
- 反应时间不一样：MD lead time 4 周 vs NP 2 周
- 看的窗口也不一样：分别匹配各自的 lead time，刚好"今天发 JD，人到岗时缺口正好被填上"

**冗余 (20%) 的意义**
- 不是为了过度保守，是给"招聘 + onboarding 期间需求继续增长"留缓冲
- 一旦 capacity 跌破 `需求 × 1.2`，说明缓冲在吃了，再不动手就来不及

---

## 数据流速查

| 图上的"X" | 在代码里叫什么 | 在数据里写在哪 |
|----------|---------------|---------------|
| 未来 4 周预约 | `demand.newInitialBookings` | `data/demand.json` |
| no-show 率 | `demand.noShowRate` | `data/demand.json` |
| MD 列表 + 是否全流程 | `staff.md[].subtype` | `data/staff.json` |
| NP 列表 | `staff.np[]` | `data/staff.json` |
| 复诊 / 维持在册人数 | `patients.inFollowup` / `inMaintenance` | `data/patients.json` |
| 历史 23 周快照 | `history.weekly[]` | `data/history.json` |
| 诊次时长 / 冗余 / Lead time | `constants.*` | `data/constants.json` |
| 全流程 MD 时间分配 | `constants.fullFlowMdSplit` | `data/constants.json` |

模型算法本身在 `lib/model.ts`，三个核心函数：
- `mdInitialCapacityMinPerWeek(staff, c)` — MD 初诊产能
- `nonInitialCapacityMinPerWeek(md, np, c)` — 复诊+维持产能
- `computeDecision(data)` — 串起来出招聘判断
