# ADHD Clinic — Hiring Capacity Dashboard

一个回答**"现在要不要招人？招哪种？"** 的最小可用看板（v0）。

## 当前版本（v0）

- **数据来源**：mock 假数据，写在 `data/*.json` 里
- **核心逻辑**：`lib/model.ts`（纯函数，可单测）
- **界面**：单页 + 一个 `/monitoring` 占位
- **访问控制**：单密码登录（环境变量 `DASHBOARD_PASSWORD`）

## 本地开发

1. 安装 Node.js LTS（https://nodejs.org/zh-cn/download）
2. 安装依赖：
   ```bash
   npm install
   ```
3. 复制环境变量样例并改一个密码：
   ```bash
   copy .env.local.example .env.local
   ```
   编辑 `.env.local`，把 `changeme` 改成真实密码。
4. 启动开发服务器：
   ```bash
   npm run dev
   ```
5. 浏览器访问 http://localhost:3000，输入密码进入。

## 部署到 Vercel

1. 把仓库推到 GitHub。
2. 在 https://vercel.com/new 导入这个 repo。
3. 在 **Project Settings → Environment Variables** 添加 `DASHBOARD_PASSWORD`。
4. 点击 Deploy。

## 目录结构

```
app/
  page.tsx              # 主页：招聘判断
  monitoring/page.tsx   # 占位（日常监控，留作 v2）
  login/page.tsx        # 登录页
  api/login/route.ts    # 验证密码 + 写 cookie
lib/
  model.ts              # 核心计算（纯函数）
  dataSource.ts         # 读数据（v0 读 JSON，v1 换 Google Sheets）
  types.ts              # 共享类型
  auth.ts               # 密码 / cookie 校验
components/
  GapChartCard.tsx      # 需求 vs 产能 时序图 + 周/月切换
  PatientDonut.tsx      # 患者阶段环形图
  StaffBars.tsx         # 在岗人员构成柱状图
  StatusList.tsx        # 按周状态彩点列表
  PageShell.tsx         # 头部 + 导航
data/
  constants.json        # 诊次时长、冗余%、lead time 等
  staff.json            # 在岗 MD/NP
  patients.json         # 当前在册患者阶段分布
  demand.json           # 未来 N 周新预约预测
  history.json          # 历史 N 周的预约量 / 患者池快照
middleware.ts           # 没登录就跳 /login
```

## v0 → v1 升级路径

- **v0**：JSON + 手动更新
- **v1**：把 `lib/dataSource.ts` 换成读 Google Sheets API，其他不动
- **v2**：接业务系统真实数据，加 `/monitoring` 页

## 模型核心约束

- **初诊**只能 MD（45 min）
- **复诊**（原"滴定"，调整剂量阶段）MD-full-flow 或 NP 都可以（30 min）
- **维持**MD-full-flow 或 NP 都可以（15 min）
- MD 内部分两类：`initial_only`（只做初诊）vs `full_flow`（全流程）
- MD lead time = 4 周；NP lead time = 2 周
- 看未来 4 周（MD）/ 2 周（NP）的需求
