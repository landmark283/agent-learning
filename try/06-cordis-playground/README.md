# W4 · T6：Cordis 框架 —— 一切皆插件

> **对应**：`01-学习路径.md` 第 4 周 · 理论 **#21 插件化框架（Cordis 式）**、**#22 事件驱动**
> **产物**：本目录 5 个可运行实验（零安装）+ `notes/cordis.md` 一页纸（你自己写）
> **为什么现在学**：W5 要读的 DSH 是 196 个包的 Cordis 插件集合；不懂 Fiber/Service/effect，
> 读 DSH 源码会像读一份没有语法的语言。

---

## 0. 一句话

**Cordis = 一个「一切皆插件」的依赖注入容器**：Context（依赖容器）+ Service（可注入能力）
+ Fiber（生命周期）+ 事件总线 + 配置驱动加载。DSH 里**每一项能力**——工具、LLM 适配器、
文件访问、甚至 agent loop 本身——都是挂到共享 Context 上的插件。

## 1. 为什么需要它（先讲为什么）

拿你自己的 teenycode fork 对照，差别一眼可见：

| | 你的 fork（teenycode） | Cordis / DSH |
|---|---|---|
| 加一个工具 | 改 `src/tools.ts`，往 `tools` 数组里 push，重新编译 | `cordis.yml` 里加一行，重启即生效 |
| 卸载一个工具 | 做不到（只能改代码） | 卸载即干净撤销（监听器、注册、资源全清） |
| 权限/记忆/压缩 | 写死在 `agent.ts` 里 | 各自是插件，能按需组装、能替换实现 |
| 谁依赖谁 | 靠 import 硬连接 | 声明 `inject: ['tools']`，**依赖驱动启动顺序** |

一句话：零件多了以后，**"改代码才能换零件"是最大的成本**，插件化是解药。

## 2. 材料地图（含一条重要修正）

> ⚠️ **修正过期假设**：之前以为"读包内 `docs/` 教程"即可。实测——
> **npm 包只发布编译后的 `lib/`**，真 TS 源码与文档都在
> [deepseek-harness 仓库](https://github.com/deepseek-ai/deepseek-harness)里
> （Cordis 是 `vendor/cordis`，被 vendor 进该仓库，`package.json` 的
> `repository.directory` 写着 `vendor/cordis`）。仓库约 **179 MB**，W5 再克隆。

本地**零安装就能读/跑**的部分（本实验场已配好 junction，见 `node_modules/`）：

| 材料 | 路径（在 `@deepseek-ai/dsh/node_modules/@deepseek-ai/` 下） | 价值 |
|---|---|---|
| Cordis 真 TS 源码 | `cordis/src/`，**只有 9 个文件**：`context.ts` `events.ts` `fiber.ts` `index.ts` `logger.ts` `reflect.ts` `registry.ts` `service.ts` `utils.ts` | 主教材，约 2900 行 |
| Cordis README | `cordis/README.md`（101 行，含 Quick Start） | 5 分钟建立印象 |
| **官方 7 章中文教程** | 仓库 `docs/cordis-tutorial/`：`01-first-plugin` `02-lifecycle-and-effects` `03-services` `04-events` `05-config` `06-composition-and-hmr` `07-into-the-harness`（每章都有 `.zh.md`） | **最佳教程**，见下方链接 |
| DSH 框架开发指南 | 仓库 `docs/user/develop/framework/index.zh.md`：生命周期状态机、依赖驱动、自动清理 | 和 DSH 语言一致 |
| loader / include 源码 | `cordis-plugin-loader/src/`（含 `config/entry.ts`）、`cordis-plugin-include/src/index.ts` | 配置驱动怎么实现 |
| 真实 DSH 插件样例 | `dsh-tool-present/lib/index.js`（123 行，编译产物） | 一个工具插件的完整形态 |
| DSH base profile | 仓库 `packages/bundle/base/cordis.patch.yml`（19.5 KB） | **整个 DSH 底座就是一份 Cordis 配置** |

官方教程（中文，`master` 分支 raw 链接）：
[index](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/cordis-tutorial/index.zh.md) ·
[01 第一个插件](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/cordis-tutorial/01-first-plugin.zh.md) ·
[02 生命周期与 effect](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/cordis-tutorial/02-lifecycle-and-effects.zh.md) ·
[03 服务](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/cordis-tutorial/03-services.zh.md) ·
[04 事件](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/cordis-tutorial/04-events.zh.md) ·
[05 配置](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/cordis-tutorial/05-config.zh.md) ·
[06 组合与 HMR](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/cordis-tutorial/06-composition-and-hmr.zh.md) ·
[07 进入 harness](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/cordis-tutorial/07-into-the-harness.zh.md)

## 3. 五个核心机制（读 `src/` 的收获，都带行号）

### 3.1 Context 是一个 Proxy —— 读服务 = 依赖检索

`Context` 不是普通对象：`new Context()` 的最后一步把自己包进 Proxy
（`context.ts:74` → `ReflectService.handler`，`reflect.ts:135`）。
于是 `ctx.tools` 这种属性读取**会沿着「自己 → 父 fiber」逐层找服务实现**
（`reflect.ts:153-166`）。

**反直觉的后果（实测踩到）**：读一个没在 `inject` 里声明的服务**不是**给你 `undefined`，
而是直接抛 `cannot get property "db" without inject`（`reflect.ts:144`）——fail-fast。
临时/可选依赖要用 `ctx.get('name')` 探测（`reflect.ts:17`）。

```js
ctx.db.foo()          // ❌ 没声明 inject：抛错
ctx.get('db')?.foo()  // ✅ 可选依赖：服务不存在时 undefined
```

### 3.2 Service：能力即服务，注册在 `super` 里

```js
class GreeterService extends Service {
  constructor(ctx) { super(ctx, 'greeter') }   // ← 运行时注册（内部 ctx.reflect.provide）
  greet(who) { return `Hello, ${who}!` }
}
```
`Service` 子类**本身就是插件**（类形态），所以 `ctx.plugin(GreeterService)` 就能装。
注册是一次 effect，**卸载时自动注销**（`service.ts:42-59`、`reflect.ts:277`）。
TypeScript 里还要 `declare module` 合并声明让 `ctx.greeter` 有类型，但那不产生运行时代码。

### 3.3 Fiber：插件的运行时实例 + 状态机

```
PENDING → LOADING → ACTIVE
                 ↘ FAILED
ACTIVE → UNLOADING → DISPOSED
```

- **依赖驱动**：`inject: ['counter']` 的服务没就位，插件就一直 PENDING，`apply` 根本不会跑
  （`fiber.ts:611-623 _refresh`）。**所以配置文件里写插件的顺序无关紧要**。
- **依赖会被持续跟踪**：提供者被卸载 → 依赖方自动卸载回到 **PENDING**（不是 DISPOSED），
  服务回来后自动重新加载（实测见 `01-minimal.mjs`、`04-config-and-isolate.mjs`）。
- 同一插件装两次 = **两个 fiber、共用一个 runtime**（`registry.ts:322-336`），生命周期各自独立。

### 3.4 effect：可逆性的实现（Cordis 的灵魂）

**凡是经 `ctx` 做过的注册，都是 effect**：`ctx.on(...)` 监听器、`ctx.tools.register(tool)`、
`ctx.provide(...)`、`ctx.logger.exporter(...)`、`ctx.effect(() => cleanup)`。
fiber 卸载时**逆序**执行它们的 disposer（`fiber.ts:431` 的 `.reverse()`，实测已验证）。

```js
ctx.effect(() => {
  const conn = createConnection()
  return () => conn.close()      // ← 卸载时自动调用
})
```
> 实测修正一个想当然：**`root.fiber.dispose()` 不等于"关停应用"**。
> root fiber（`runtime === null`）的 dispose 被实现成 `() => this.restart()`
> （`fiber.ts:331`）：先卸载所有子插件，再把自己重新加载回 ACTIVE。
> 真正的收尾靠子 fiber 的 `dispose()` 或让进程退出。

### 3.5 事件有五种分发语义（理论 #22）

| 模式 | 语义 | DSH 里的用例 |
|---|---|---|
| `emit` | 同步跑完所有监听器，忽略返回值、**不 await** Promise | `tools/result`（纯广播） |
| `parallel` | 全部并发，等所有 settle | 多路通知 |
| `serial` | 顺序 await，遇到「bail 值」立即停 | 需要短路 |
| `bail` | 同步版 serial | 同步拦截 |
| `waterfall` | 每个监听器**包住剩下的链条**，不调 `next()` 即否决 | `internal/update`（可否决一次配置更新）、`internal/get` |

「bail 值」= 非 `null`/非 `false`/非 `undefined`（`events.ts:13`）。
还有 `once`、`prepend`（`ctx.on(name, cb, true)`）、`global`（绕过作用域过滤）三个开关。
`internal/dispatch` 是所有**公开**事件的观测钩子（`internal/*` 自身被排除，`events.ts:168`）
——DSH 的轨迹记录就挂在这类钩子上。

### 3.6 配置驱动：15 行的引导模型

`cordis/bin.js` 全文（这就是 DSH 的启动模型，代码里一个插件名都不写）：

```js
const ctx = new Context()
ctx.baseUrl = pathToFileURL(process.cwd()).href + '/'
await ctx.plugin(Loader)
await ctx.loader.create({
  name: '@deepseek-ai/cordis-plugin-include',
  config: { path: './cordis.yml' },
})
```

`cordis.yml` 里每一行的字段（`loader/src/config/entry.ts:9-22`）：

| 字段 | 含义 |
|---|---|
| `id` | 条目 id；嵌套组用 `:` 连接（如 `tools:logger`） |
| `name` | 模块说明符，相对路径按 `baseUrl` 解析（`./plugins/x.js`），或包名 |
| `config` | 传给插件的配置，启动前经 schema 校验 |
| `group` | 标记为分组，`config` 变成子条目列表 |
| `disabled` | 停用该条目及其子树（支持 `!!js` 表达式） |
| `inject` | 为这个条目追加依赖 / 拦截配置 |

## 4. 动手（本目录已备好，按顺序跑）

```powershell
cd agent-learning\try\06-cordis-playground
powershell -ExecutionPolicy Bypass -File .\verify.ps1   # 或逐个跑下面的脚本
```

| 脚本 | 学什么 | 关键预期 |
|---|---|---|
| `01-minimal.mjs` | Context / Service / inject / 依赖驱动 | 先装消费者是 PENDING；提供 counter 后自动 ACTIVE；卸载提供者后消费者退回 PENDING；重装得到**全新的** Counter |
| `02-reversible.mjs` | 可逆性（13 条断言） | 同插件两 fiber 互不影响；effect 逆序卸载；父卸载子递归卸载；已卸载 fiber 再注册抛 `INACTIVE_EFFECT` |
| `03-events.mjs` | 五种分发语义（13 条断言） | `waterfall` 里 `(10+1)*2=22`，换注册顺序变 21；不调 `next()` 即否决 |
| `04-config-and-isolate.mjs` | schemastery 配置校验 + `isolate` 作用域 | 配错类型抛 `invalid config: - $.times expected number...`；两个隔离域各读自己的 `db` |
| `run.mjs` + `cordis.yml` + `plugins/` | **配置驱动 + 注册真实 DSH 工具** | `greet` 工具被真实流水线执行；`tool-logger` 先于 `tool replied` 触发 |

**`run.mjs` 的预期输出**（关键几行）：
```
服务已注册
配置来自 cordis.yml，而不是插件代码        ← echo 的 config 来自 YAML
apply plugin @deepseek-ai/dsh-tools
[tool-logger] greet -> Hello, Cordis!     ← 独立插件观察到 tools/result
tool replied: [{"type":"text","text":"Hello, Cordis!"}]
  0fd22774:tools ← ToolRuntime  状态=ACTIVE
  0fd22774:greet-tool ← greet-tool  状态=ACTIVE
```
注意 `tool-logger` **先于** `tool replied`：`tools/result` 在结果物化过程中发出，
早于 `execute` 的 promise 兑现。两个插件互不认识，由**注册表服务 + 事件**连接起来。

### 三个必须亲手做的改动

1. **改配置**：把 `cordis.yml` 里 `echo` 的 `times` 从 2 改成 3，重跑 → 日志变 3 条。
   再把它改成 `times: abc` → 观察 loader 抛出校验错误。
2. **删一个条目**：注释掉 `greeter` 那一行，重跑 → `consumer` 停在 PENDING、
   不输出、不崩溃（这就是"缺零件不是崩，而是等"）。
3. **加一个自己的插件**：在 `plugins/` 下写 `my-plugin.js`（`export const name` +
   `export function apply(ctx, config)`），在 `cordis.yml` 里加一行装上它。

## 5. 验收标准

- [ ] `powershell -ExecutionPolicy Bypass -File .\verify.ps1` 输出 **5 个脚本全部成功**；
- [ ] 能解释：为什么把 `inject` 拿掉后 `ctx.db` 会**抛错**而不是 `undefined`；
- [ ] 能解释：卸载服务提供者后，依赖方为什么停在 PENDING 而不是 DISPOSED；
- [ ] 亲手做完上面「三个必须做的改动」；
- [ ] 写出 `notes/cordis.md` 一页纸，只记四件事：**解决什么问题 / 核心机制 / 验证点在哪 / 差距点**。

## 6. 踩坑记录（都是真跑出来的）

| 坑 | 现象 | 原因 |
|---|---|---|
| 函数 `name` 只读 | `Object.assign(fn, { name: 'x' })` 抛 TypeError | 函数的 `name` 只读；先绑变量（`const f = ...`）再挂属性 |
| 读服务没声明 inject | `cannot get property "db" without inject` | `reflect.ts:144` 故意 fail-fast；可选依赖用 `ctx.get()` |
| 日志看不见 | `ctx.logger.info(...)` 毫无输出 | 自带 exporter 只写内存环形缓冲（`logger.ts:195`，1000 条），控制台导出器是**独立插件** |
| 自建日志导出器格式串没替换 | 打出 `%s plugin %C` | 日志是结构化记录，格式化归导出器管：要调 `Logger.format(this, message)`（`logger.ts:99`） |
| `root.fiber.dispose()` 没关停 | 跑完还是 ACTIVE | 被实现为 `restart()`（`fiber.ts:331`） |
| PATH 里的 node 是坏的 | `spawn C:\nvm4w\nodejs\node.exe ENOENT` | 该 shim 已悬空；用 `D:\nvm\v22.19.0\node.exe`（`verify.ps1` 会自动挑可用的） |
| 本机没有 `pwsh` | `pwsh : 无法将...识别为 cmdlet` | 本机只有 **Windows PowerShell 5.1**；脚本用 `powershell -File` 调用即可 |
| 含中文的 .ps1 报语法错 | 错误信息本身是乱码，如 `浠ヤ笅鑴氭湰澶辫触锛?` | PowerShell 5.1 按 **ANSI** 读取无 BOM 的脚本 → 脚本必须存为 **UTF-8 带 BOM**（`EF BB BF`），且避免在中文串里嵌 `$(...)` |

## 7. 与 DSH 的对应（W5 的钥匙）

| Cordis 概念 | DSH 对应物 |
|---|---|
| `ctx.tools` / `ctx.llm` / `ctx.agents` | 由 `dsh-tools` / `dsh-llm` / `dsh-agent` 提供的 Service |
| 插件三件套 `export { name, inject, apply }` | `dsh-tool-present/lib/index.js`：`const name='tool-present'`、`const inject=['tools','fs','sessionProjections']`、`function apply(ctx, config)` |
| `ctx.tools.register(defineTool({...}))` | 每个 `dsh-tool-*` 的注册方式（本实验场已复现） |
| `cordis.yml` + Loader + `patch` 叠加 | `packages/bundle/base/cordis.patch.yml`（base profile 层） |
| effect 自动清理 | 卸载插件即撤销注册：工具、事件监听、会话投影…… |
| 事件五种分发 | `tools/result`（emit）、`internal/update`（waterfall） |
| `isolate(name, label)` | 同一服务的多份实现划边界（多 workspace / 多用户） |

## 8. 参考

- [官方 Cordis 教程（中文，7 章）](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/cordis-tutorial/index.zh.md) —— 本仓实验与之逐章对应；它是唯一"官方口径"的 Cordis 讲解
- [DSH 开发指南：插件与生命周期](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/user/develop/framework/index.zh.md) —— Fiber 状态机、依赖驱动、自动清理（英文）
- Cordis `README.md` + `src/` 9 个文件（本地 `node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/cordis/`）
- [Koishi 文档 · 可逆插件系统](https://koishi.chat/zh-CN/cookbook/design/disposable) —— Cordis 作者 Shigma 同源项目，讲"为什么可逆性如此重要"
- [deepseek-harness 仓库](https://github.com/deepseek-ai/deepseek-harness)（MIT；Cordis 位于 `vendor/cordis`）

## 9. 下一步

1. `git commit` 记下 W4 轨迹；
2. 写 `notes/cordis.md` 一页纸概念图（**必须有**：Context/Service/Fiber/effect/事件/配置 六块怎么咬合）；
3. 想深入：克隆 `deepseek-harness`（179 MB）跟官方教程逐章跑 `tsx` 版本 + 读 `vendor/cordis`；
4. 然后进 **W5 · DSH 运行轨迹精读**——从这里开始，DSH 的每个包都只是"又一个插件"。
