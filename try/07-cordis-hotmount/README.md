# W5·D0 实验：让运行中的 DSH 热挂一个插件

> **对应理论**：#21 插件化框架（Cordis 式）、#22 事件驱动；附带 #17 沙箱、#18 权限门控
> **前置**：W4 全部（Cordis 五机制 + `try/06-cordis-playground` 验收通过）+ 官方 Cordis 教程 7 章
> **位置**：W5 之前的一天实验。做完再进 `try/08-dsh-assembly/`（W5-D1 装配层）

---

## 0 一句话

DSH 自带一套「动态 Cordis」工具集：模型可以在**运行中的进程内存里**定义并挂载一个纯 JS 插件，用完卸掉，重启即消失。你要做的，就是亲手挂一个、验证它生效、再卸掉、验证它消失。

---

## 1 为什么先做这个，而不是继续读文档

你的终点是「自用魔改 DSH 插件」。魔改最快见效的路径不是改仓库源码，是**在活进程里挂**——改错了直接卸掉，不留痕迹。

这个实验的价值在于它逼你把 W4 的每一条从「读过」变成「用过」：

- 挂载 → 你亲眼看到 fiber 从 PENDING 到 ACTIVE；
- 卸载 → 你亲眼看到工具注册（一个 effect）被撤销、工具从模型视野里消失；
- 沙箱里**没有类型**，你被迫先去 `cordis_inspect_query` 查精确签名——这是 `ctx.xxx` 依赖检索的真身；
- 想改行为 → 你发现不用改代码，改装配就行（5.1 节会先给你看一眼）。

---

## 2 概念：三个角色

| 角色 | 包 | 职责 |
|---|---|---|
| **工具层**（面向模型） | `@deepseek-ai/dsh-tool-cordis` | 7 个工具 + `tool:cordis` 系统提示词章节 + `@pluginId` 上下文注入 |
| **Host runner** | `@deepseek-ai/dsh-cordis-host-runner` | 注册表、vm 沙箱、运行往返。工具全在它之上做委托 |
| **Client runner + UI**（只有带浏览器半的包才需要） | `@deepseek-ai/dsh-cordis-client-runner`、`@deepseek-ai/dsh-ui-cordis` | 应答运行请求、装载浏览器半代码、提供面板与卡片 |

**关键**：任何已发布的组合包都**不会**默认挂这套工具集。web profile 已挂 host runner 与浏览器侧组件，但**工具行要你显式插入**。

---

## 3 四个约定（先记住，能省一半时间）

1. **存续**——定义只存在于进程内存；DSH 重启即消失。本包不写仓库文件、不装依赖、不改 `cordis.yml`。
2. **失败恢复**——**包版本不可变**。包失败后不能就地改，要追加一个新版本，再把运行版本 update 过去。
3. **边界**——定义以**会话**为界、以**进程**为生命：只在定义它的会话里可见可控，可跨后续轮次存活，运行时也可能影响同一进程中的其他会话。
4. **安全**——沙箱隔离全局变量，**但不是安全边界**。"对待动态包要像对待 bash 访问一样，加载本插件时也要像授予 bash 工具那样慎重。"

---

## 4 七个工具

**3 个只读检查**：

- `cordis_inspect_list`——列出 Inspect Provider 及其查询方法
- `cordis_inspect_query`——执行一次提供方查询：服务方法、**事件模式**、builtin 签名、工具 schema、主题 token、实时 slot 树
- `cordis_inspect_self`——本会话的动态插件：版本指针、最近一次运行、源码与运行时诊断

**4 个生命周期**：

- `cordis_define`——登记一个包（新插件 `plugin.kind:"new"` + 3~6 字母 `idPrefix`；既有插件新版本 `plugin.kind:"existing"` + `pluginId`）。**只校验参数与语法，不运行、不请求审批**
- `cordis_run`——激活（`mode:"run"` 首次/重启，`mode:"update"` 换版本）。从不等待最终结果
- `cordis_stop`——停止运行并取消待审批请求，**保留**插件与全部版本
- `cordis_undefine`——停止并彻底移除插件及其全部版本

**推荐顺序**：先 inspect、再 define、后 run。

**代码限制**：动态包是**纯 JavaScript**，不做任何转换——没有 TypeScript、JSX、`import`；沙箱也不提供 `require`、`setTimeout`、`fetch`。文件、网络、进程工作要重定向到 Cordis 服务。

---

## 5 动手步骤

### 5.1 先做不需要凭据的一步：看 overlay 到底插了什么

```powershell
cd agent-learning\source\deepseek-harness\deepseek-harness
pnpm dsh web --patch apps/cli/config/examples/cordis/cordis.yml --dump-config
```

在输出里找这一段（**我实测过，逐字如下**）：

```
# == D:\...\apps\cli\config\examples\cordis\cordis.yml
- id: cordis-host-runner
  name: '@deepseek-ai/dsh-cordis-host-runner'
- id: tool-cordis
  name: '@deepseek-ai/dsh-tool-cordis'
```

同时它把 `webserver` 的端口从 3080 改成了 **3081**——这是刻意的，避免和你常驻的 3080 GUI 冲突。

> 这一步顺带剧透了 W5-D1：`--patch` 只是**又叠一层**。装配层的故事在 `try/08-dsh-assembly/`。

### 5.2 启动

```powershell
pnpm dsh web --patch apps/cli/config/examples/cordis/cordis.yml
```

打开 **http://127.0.0.1:3081**（不是 3080）。需要模型凭据，即仓库根 `.env` 里的 `DEEPSEEK_API_KEY`。

### 5.3 让模型走一遍（一条一条发，别一次全发）

1. **查提供方**
   > 用 `cordis_inspect_list` 列出可用的 Inspect Provider 和它们的查询方法。

2. **查精确签名**——这一步替代不了，沙箱里没有类型信息
   > 用 `cordis_inspect_query` 查 `ctx.tools` 的精确方法签名。

3. **定义**（先别运行）
   > 用 `cordis_define` 定义一个 `idPrefix` 为 `demo` 的新插件：`inject: ['tools']`，注册一个名为 `hello_hot` 的工具，参数 `who: string`，返回 `"hot hello, <who>"`。只登记，先别运行。

4. **运行**
   > 用 `cordis_run` 运行它。

5. **验证生效**——新开一轮对话
   > 调用 `hello_hot`，参数 who = "cordis"。

6. **卸载并再次验证**
   > 用 `cordis_stop` 停掉它。

   然后再问一次：`hello_hot` 还在吗？**应当不存在了。**

**第 5 步和第 6 步是这个实验的全部价值**：你在活进程里看到「注册 = effect，卸载 = 撤销」这一条 W4 结论成立。

### 5.4 观察 fiber 与诊断

> 用 `cordis_inspect_self` 查看本会话的动态插件：版本指针、最近一次运行，以及（对某个精确包而言）源码与运行时诊断。

对照你在 `try/06-cordis-playground/02-reversible.mjs` 里写过的断言：挂载 = `PENDING → ACTIVE`，卸载 = `ACTIVE → DISPOSED`，effect **逆序**撤销。

### 5.5 故意搞坏一次（对应 W4 第 1 章的「尝试制造错误」）

1. `cordis_define` 一个**语法错误**的包 → 观察它在拿到 id **之前**就被拒（define 用与沙箱相同的包装器做语法预检）。
2. `cordis_run` 一个**在 `apply` 里 throw** 的包 → 观察会话出现诊断，而**不是整个 DSH 崩掉**。
3. 追加一个新版本，用 `cordis_run mode: "update"` 修好它——体会「版本不可变」这条约定怎么支撑失败恢复。

---

## 6 验收标准

- [ ] 能说出 `tool-cordis` 与 `cordis-host-runner` 各自职责，以及为什么 profile 默认不挂工具行
- [ ] 在 `--dump-config` 输出里指出 overlay 插入的两行，以及端口改动
- [ ] 模型成功调用你热挂的 `hello_hot` 工具（**留档**：截图或会话日志）
- [ ] `cordis_stop` 之后该工具消失（**留档**）
- [ ] 至少用 `cordis_inspect_self` 读到过一次诊断
- [ ] 能解释「沙箱不是安全边界」这句话的含义
- [ ] 在 `notes/cordis.md`（或新建 `notes/dsh.md`）补一节「动态包 vs 仓库插件」

---

## 7 踩坑表

| 现象 | 原因 | 处理 |
|---|---|---|
| 工具列表里没有 `cordis_*` | 没加 overlay。工具行必须显式插入 | 用 `--patch apps\cli\config\examples\cordis\cordis.yml` |
| 打开的是旧界面 / 端口冲突 | 默认 3080 是你常驻的 GUI | overlay 已改成 3081 |
| 插件里写 TS / `import` / `fetch` 报错 | 动态包**不做任何转换**，沙箱不提供 Node 全局变量 | 改写纯 JS，文件与网络走 Cordis 服务 |
| 改了包代码还是老行为 | **包版本不可变**，同 id 同版本不会重新编译 | define 新版本 + `cordis_run mode:"update"` |
| 带浏览器半的包一直 `awaiting-approval` | 需要有人批准；`cordis_run` 从不等待最终结果 | 在 UI 面板里批准 |
| 重启 DSH 后插件没了 | 定义只在进程内存里 | 想常驻就写成仓库插件（W6 毕业项目） |
| 动态包影响了另一个会话 | 定义以会话为界、以**进程**为生命 | 用完就 `cordis_undefine` |

---

## 8 回看 W4：同一套机制在活 DSH 里的样子

| W4 里学的 | 在活 DSH 里 |
|---|---|
| Fiber 状态机 | `cordis_inspect_self` 里的版本指针与运行状态 |
| 注册即 effect、逆序撤销 | `cordis_stop` 之后工具与提示词贡献一起消失 |
| `inject` 依赖检索 | 沙箱里没有类型，必须先 `cordis_inspect_query` 查签名 |
| 配置驱动装配 | `--patch` 又叠一层；端口就是这么改的 |
| `ctx.on` 事件 | 动态包可以监听事件改变后续请求 |
| 沙箱边界 | vm 约束**诚实代码**，不是安全边界 |

---

## 9 参考链接

- 官方实战：[`docs/user/develop/practice/dynamic-cordis.zh.md`](../../source/deepseek-harness/deepseek-harness/docs/user/develop/practice/dynamic-cordis.zh.md)
- 包参考（四类约定全文）：[`packages/extensions/tool-cordis/README.zh.md`](../../source/deepseek-harness/deepseek-harness/packages/extensions/tool-cordis/README.zh.md)
- Host runner：[`packages/extensions/cordis-host-runner/README.zh.md`](../../source/deepseek-harness/deepseek-harness/packages/extensions/cordis-host-runner/README.zh.md)
- 设计居所：[自引用 Cordis 工具集 Agent Note](../../source/deepseek-harness/deepseek-harness/.agents/notes/implemented/feature/2026-07-08-self-referential-cordis-toolset.zh.md)
- 模型收到的确切 schema：[`docs/tool-catalog.zh.md`](../../source/deepseek-harness/deepseek-harness/docs/tool-catalog.zh.md)
- overlay 原文：[`apps/cli/config/examples/cordis/cordis.yml`](../../source/deepseek-harness/deepseek-harness/apps/cli/config/examples/cordis/cordis.yml)
- 概念精简参考：[`docs/cordis-primer.zh.md`](../../source/deepseek-harness/deepseek-harness/docs/cordis-primer.zh.md)

---

## 10 下一步

W5-D1 装配层 → [`try/08-dsh-assembly/README.md`](../08-dsh-assembly/README.md)

**收尾：`git commit`**——把留档、笔记和这个实验的结论一起提交。
