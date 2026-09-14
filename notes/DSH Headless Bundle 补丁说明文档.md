# DSH Headless Bundle 补丁说明文档

> 本文档说明 `dsh-headless` bundle 补丁：直接构建在 `dsh-base` 之上的**一次性任务模式（one-shot task mode）**，并翻译其注释。

---

## 一、概述（来自文件头部注释）

> `dsh-headless` bundle 补丁：直接构建在 `dsh-base` 之上的**一次性任务模式**。它**不挂载** Host、HTTP 服务器、Web 运行时或浏览器插件。一个普通的 provider 插件注入 `cmdlineArgs`，解析任务位置参数（`dsh --profile headless "<task>"`）以及本 app 的 `--help`，然后由 **direct driver** 通过 core registry 创建一个 Agent，并打印其持久化结果。

**要点：**

- **定位**：headless = 无界面、跑一次就结束的任务模式。

- **最小依赖**：没有 Host / HTTP / Web runtime / 浏览器插件。

- **输入路径**：provider 插件负责注入 `cmdlineArgs`，解析位置参数 `<task>` 与 `--help`。

- **执行路径**：direct driver → core registry → 创建 Agent → 打印持久化结果。

---

## 二、配置变更（Config Overrides）

### 1. `system-prompt`（覆盖 base 中的系统提示）

yaml

- id: system-prompt
  config:
    personaSuffix: Your working directory is {{cwd}}.
    personaPrefix: >-
  
      You are a coding agent powered by the {{model}} model.

**注释翻译 / 说明：**

- `personaSuffix`：`Your working directory is {{cwd}}.`（你的工作目录是 `{{cwd}}`。）

- `personaPrefix`：`You are a coding agent powered by the {{model}} model.`（你是一个由 `{{model}}` 模型驱动的编码 agent。）

> 这里覆盖了 `dsh-base` 中 `system-prompt` 行的整个 `config`，设置 headless 模式的 persona 前缀与后缀，并用模板变量 `{{cwd}}`、`{{model}}` 动态填充。

### 2. `tools`（工具模式）

yaml

- id: tools
  config:
  
  # Keep the same temporary process-wide PTC mode opt-in as the Web surface.
  
    mode: !!js process.env.DSH_TOOLS_MODE

**注释翻译：**

> 保持与 Web 界面相同的、临时的、进程级 PTC 模式 opt-in。

**说明：**

- 通过环境变量 `DSH_TOOLS_MODE` 控制工具展示/执行模式。

- 与 Web surface 保持一致的 opt-in 行为（临时、进程级）。

---

## 三、新增插件（insert）

### 1. `code-runtime`

yaml

- id: code-runtime
  name: '@deepseek-ai/dsh-code-runtime-worker-thread'

**注释翻译：**

> PTC 模式是核心执行能力，不是 Web 组件。

**说明：**

- 挂载 worker-thread 代码运行时。

- 强调 PTC（可能是 "Programmatic Tool Calling" 或类似执行模式）属于核心能力，与 Web 无关，因此放在 headless bundle 中。

### 2. `headless-startup`

yaml

- id: headless-startup
  name: '@deepseek-ai/dsh-headless/startup'

**说明：**

- headless 启动 provider，负责提供 `headlessStartup` 服务（其中包含解析出的 `task`）。

### 3. `headless-runner`

yaml

- id: headless-runner
  name: '@deepseek-ai/dsh-headless'
  inject: [headlessStartup]
  config:
    task: !!js ctx.headlessStartup.task

**注释翻译：**

> 从普通的 `headlessStartup` provider 读取它的任务。

**说明：**

- 依赖注入：`inject: [headlessStartup]`，声明需要 `headlessStartup` 服务。

- 任务来源：`task: !!js ctx.headlessStartup.task`，即从 `ctx.headlessStartup` 中取出 `task`。

- 这是 headless 模式的**执行主体**：拿到任务后创建 Agent 并运行。

---

## 四、完整流程

text

用户执行:
  dsh --profile headless "<task>"
        │
        ▼
provider 插件注入 cmdlineArgs
        │
        ├─ 解析位置参数 <task>
        └─ 解析 --help
        │
        ▼
headless-startup (dsh-headless/startup)
        │  提供 headlessStartup.task
        ▼
headless-runner (dsh-headless)
        │  inject: [headlessStartup]
        │  task: ctx.headlessStartup.task
        ▼
direct driver → core registry → 创建 Agent
        │
        ▼
打印持久化结果（durable result）

---

## 五、与 dsh-base 的关系

| 方面                                | dsh-base            | dsh-headless                           |
| --------------------------------- | ------------------- | -------------------------------------- |
| 定位                                | 共享核心                | 一次性任务模式                                |
| Host / HTTP / Web runtime / 浏览器插件 | 视模式而定               | **不挂载**                                |
| 系统提示                              | `personaPrefix: ''` | 覆盖为 coding agent persona               |
| 工具模式                              | 默认 native           | 由 `DSH_TOOLS_MODE` 控制                  |
| 代码运行时                             | —                   | 新增 `code-runtime`（worker-thread）       |
| 启动方式                              | —                   | `headless-startup` + `headless-runner` |
| 结果输出                              | —                   | 打印持久化结果                                |

---

## 六、要点速记

- **headless = 一次性任务模式**，跑完即止，无界面、无 HTTP、无浏览器。

- **输入**：通过 `cmdlineArgs` 注入并解析 `dsh --profile headless "<task>"`。

- **执行**：`headless-startup` 提供任务 → `headless-runner` 读取并驱动 Agent。

- **PTC 是核心能力**：`code-runtime` 放在这里，而非 Web 组件。

- **persona 覆盖**：`system-prompt` 被改写为 coding agent + 工作目录后缀。

- **工具模式**：与 Web 一致，由 `DSH_TOOLS_MODE` 环境变量 opt-in。

---

**一句话总结**：`dsh-headless` 在 `dsh-base` 之上叠加了一个无界面的单次任务执行路径——provider 解析命令行任务，`headless-startup` 提供任务，`headless-runner` 驱动 core registry 创建 Agent 并打印持久化结果。

## 配置文件中的js脚本运行机制

### 具体机制

`!!js` 标签在你的 YAML 中会被 YAML 解析器识别为 `{__jsExpr: data}` 节点，但**解析只产生语法节点，不求值**[1](https://github.com/omdsh-dev/DSH-better-sidebar/pull/200#1)[2](https://gist.github.com/Disdjj/1651fede2505642859ed6628a207a879#3)。真正的求值逻辑在 Loader 内部，只对**两个位置**生效[3](https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/05-config)[4](https://github.com/deepseek-ai/deepseek-harness/blob/141eb6fe/.agents/notes/implemented/architecture/2026-08-11-loader-entry-disabled-interpolation.md?plain=1#1)[5](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/cordis-tutorial/05-config.md#1)：

1. **插件的 `config` 块**：在插件自己的 fiber 上下文中，声明了 `inject` 的服务激活之后才做插值。这解释了为什么 `headless-runner` 能写 `task: !!js ctx.headlessStartup.task` —— Loader 确认 `headlessStartup` 已 provide 之后，才在 runner 的上下文里执行这个表达式[6](https://gist.github.com/Disdjj/1651fede2505642859ed6628a207a879#3)。

2. **条目的 `disabled` 字段**：在每次挂载决策时，基于 **Loader 上下文**求值。所以你可以用 `disabled: !!js process.platform === 'win32'` 来做平台门控，表达式里能访问 `ctx.loader.entries()` 看到当前有哪些行[7](https://github.com/omdsh-dev/DSH-better-sidebar/pull/200#1)[8](https://github.com/deepseek-ai/deepseek-harness/blob/141eb6fe/.agents/notes/implemented/architecture/2026-08-11-loader-entry-disabled-interpolation.md?plain=1#1)[9](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/architecture/2026-08-11-loader-entry-disabled-interpolation.zh.md#1)。

其他元数据字段（`id`、`name`、`inject`、`group`、`intercept`）**保持字面量，不允许 `!!js`**，否则门控脚本 `verify-cordis-config` 会直接报错[12](https://github.com/deepseek-ai/deepseek-harness/blob/141eb6fe/.agents/notes/implemented/architecture/2026-08-11-loader-entry-disabled-interpolation.md?plain=1#1)[10](https://gist.github.com/Disdjj/1651fede2505642859ed6628a207a879#3)。

### 求值环境

Loader 求值时会把 Loader 的上下文暴露为 `ctx`，你的表达式实际是在这个上下文里 eval 的。`packages/boot/app-boot` 会创建根上下文，并向 `!!js` 表达式暴露 `dshHomePath(...)` 这样的辅助函数[11](https://github.com/deepseek-ai/deepseek-harness/commit/e27d38efd6d3fe6397ac65640b7417b3c967bc44#2)。所以 `config: { root: !!js dshHomePath('sessions') }` 才能算出正确的路径[13](https://www.npmjs.com/package/@morlay/session-rdb#1)。

**一句话**：YAML 解析器把 `!!js` 变成待求值的节点，Cordis Loader 在构建配置树/决定挂载时，在合适的上下文中执行这些表达式。
