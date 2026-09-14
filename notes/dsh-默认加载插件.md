# DSH Base 插件清单简介

> 以下内容由ai读取cordis.patch.yml生成。
> 
> 下面两段是cordis.patch.yml开头注释的翻译

这个 `dsh-base` 补丁是每个 base-backed profile 的**共享核心**，以「一次 insert」的方式应用到空的 profile 根上。后续的 bundle 补丁和用户的 `cordis.patch.yml` 会按 `id` 定位这些行，**后写覆盖先写**（按行覆盖）。

补丁是**整体替换目标行的 `config`**，而不是合并进去，所以「值因模式而异」的行不放在这里，而是归属于各个 mode bundle。下面带默认值的行只是共享插件身份 + 中立默认值，每个 mode bundle 会重新声明自己完整的配置。

---

## 一、加载了哪些插件（按分组）

### 1. 基础/运行时

| id      | 插件                    | 说明                                |
| ------- | --------------------- | --------------------------------- |
| `timer` | `cordis-plugin-timer` | 定时器                               |
| `hmr`   | `cordis-plugin-hmr`   | 模块热重载（默认 `disabled: true`，opt-in） |

### 2. LLM 与会话

| id                                            | 插件                                                              | 说明                                                                       |
| --------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `llm`                                         | `dsh-llm`                                                       | LLM 核心                                                                   |
| `deepseek-llm-api-extensions`                 | `dsh-deepseek-llm-api-extensions`                               | DeepSeek LLM API 扩展                                                      |
| `session`                                     | `dsh-session`                                                   | 会话                                                                       |
| `session-log-deepseek`                        | `dsh-session-log-deepseek`                                      | DeepSeek 会话日志                                                            |
| `typert` / `typert-loader` / `typert-gateway` | `dsh-typert-registry` / `dsh-typert-loader` / `dsh-api-gateway` | 类型化注册表 / 加载器 / API 网关                                                    |
| `session-title`                               | `dsh-session-title`                                             | 会话标题（回退最大 5 词 / 40 字节，标题最大 80 字节）                                        |
| `session-title-llm`                           | `dsh-session-title-first-prompt-llm`                            | 用首个 prompt 生成标题（目标 5 词 / 10 个 CJK 字符等）                                   |
| `user-questions`                              | `dsh-user-questions`                                            | 用户提问                                                                     |
| `llm-retry`                                   | `dsh-llm-retry`                                                 | LLM 重试                                                                   |
| `agent`                                       | `dsh-agent`                                                     | Agent 核心                                                                 |
| `plugin-package-inventory-deepseek`           | `dsh-plugin-package-inventory-deepseek`                         | 插件包清单                                                                    |
| `agent-default-model`                         | `dsh-agent-default-model`                                       | 入口点创建 Agent 的默认模型（provider: `deepseek-official`，model: `deepseek-flash`） |
| `jobs`                                        | `dsh-jobs-local`                                                | 本地任务                                                                     |
| `settings`                                    | `dsh-settings-file`                                             | 用户设置文档（`$DSH_HOME/settings.yaml`，热重载）                                    |
| `credentials`                                 | `dsh-credentials-local`                                         | 凭据来源（环境变量 + 托管 `.credentials.yaml` + `.env` 回退）                          |
| `llm-pi-ai`                                   | `dsh-llm-pi-ai`                                                 | pi-ai 多 provider 孪生，默认休眠（零路由），由 `llm-pi-ai:` 设置段激活                       |
| `llm-deepseek`                                | `dsh-llm-deepseek`                                              | 原生 DeepSeek adapter，key/endpoint 均按请求解析                                  |

### 3. 会话持久化 / 存储

| id                                            | 插件                                                        | 说明                                                  |
| --------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------- |
| `session-persistence-jsonl`                   | `dsh-session-persistence-jsonl`                           | 会话持久化（JSONL，root 为 `dshHomePath('sessions')`）       |
| `attachment-local`                            | `dsh-attachment-local`                                    | 图片字节持久存储（内容寻址）                                      |
| `session-query-sqlite`                        | `dsh-session-query-sqlite`                                | 全文会话搜索（默认 `openAt: never`，即关闭；`path: ':memory:'`）   |
| `session-projection`                          | `dsh-session-projection`                                  | 共享投影注册表                                             |
| `storage` / `storage-json` / `storage-domain` | `dsh-storage` / `dsh-storage-json` / `dsh-storage-domain` | 持久 KV 存储栈（json 后端，root 为 `dshHomePath('storages')`） |
| `session-projection-cache`                    | `dsh-session-projection-cache`                            | 持久投影缓存（每 200 事件 / 5 秒写一次）                           |
| `session-telemetry-otel`                      | `dsh-session-telemetry-otel`                              | OTel 遥测（仅在用户显式反馈后释放会话日志前缀）                          |

### 4. 执行 / 沙箱 / 权限

| id               | 插件                       | 说明                                                     |
| ---------------- | ------------------------ | ------------------------------------------------------ |
| `subprocess`     | `dsh-subprocess-local`   | 本地子进程                                                  |
| `sandbox`        | `dsh-sandbox-local`      | 本地沙箱                                                   |
| `sandbox-policy` | `dsh-sandbox-policy`     | 沙箱策略（默认 `workspace-write`，workspaceRoot 为 cwd）         |
| `bash-sandbox`   | `dsh-bash-sandbox`       | bash 沙箱（Windows 下禁用，timeout 60s）                       |
| `pwsh-sandbox`   | `dsh-pwsh-sandbox`       | PowerShell 沙箱（非 Windows 下禁用）                           |
| `approval`       | `dsh-user-approval`      | 用户审批（`danger-full-access` 时 `never`，否则 `ask`）          |
| `permission`     | `dsh-permission-presets` | 权限预设（read-only / workspace-write / danger-full-access） |
| `shell-env`      | `dsh-shell-env`          | shell 环境                                               |

### 5. 工具（Tools）

| id                                                                                             | 插件                                                                                   | 说明                           |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------- |
| `tool-bash` / `tool-pwsh`                                                                      | `dsh-tool-bash` / `dsh-tool-pwsh`                                                    | bash / PowerShell 工具（按平台禁用）  |
| `tool-jobs`                                                                                    | `dsh-tool-jobs`                                                                      | 任务工具                         |
| `fs-observation-policy`                                                                        | `dsh-fs-observation-policy`                                                          | 文件系统观察策略                     |
| `tool-fs` / `tool-fs-search`                                                                   | `dsh-tool-fs` / `dsh-tool-fs-search`                                                 | 文件系统 / 搜索工具                  |
| `agent-instructions`                                                                           | `dsh-agent-instructions`                                                             | Agent 指令（maxBytes 65536）     |
| `skill` / `skill-filesystem` / `skill-badge` / `tool-skill`                                    | `dsh-skill` / `dsh-skill-filesystem` / `dsh-skill-badge`（默认禁用）/ `dsh-tool-skill`     | 技能相关                         |
| `commands` / `command-feedback` / `command-goal` / `command-compact`                           | `dsh-commands` / `dsh-command-feedback` / `dsh-command-goal` / `dsh-command-compact` | 命令系统（含 `/goal`、`/compact`）   |
| `goal` / `goal-round-driver` / `tool-goal`                                                     | `dsh-goal` / `dsh-goal-round-driver` / `dsh-tool-goal`                               | 目标相关                         |
| `plan-mode`                                                                                    | `dsh-plan-mode`                                                                      | 计划模式（内含一大段 plan mode 系统提示）   |
| `token-meter`                                                                                  | `dsh-token-meter`                                                                    | Token 计量                     |
| `compaction-basic`                                                                             | `dsh-compaction-basic`                                                               | 基础压缩                         |
| `subagent` / `subagent-spawn-in-process` / `subagent-fork-in-process`                          | `dsh-subagent` / `dsh-subagent-spawn-in-process` / `dsh-subagent-fork-in-process`    | 子代理                          |
| `tool-subagent-control` / `tool-subagent-list-agents` / `tool-subagent` / `tool-subagent-fork` | 同名前缀                                                                                 | 子代理控制 / 列表 / spawn / fork    |
| `workflow-worker-thread` / `tool-workflow`                                                     | `dsh-workflow-worker-thread` / `dsh-tool-workflow`                                   | 工作流                          |
| `timeout-policy`                                                                               | `dsh-tool-call-timeout-policy`                                                       | 工具调用超时策略                     |
| `spill-local` / `spill-policy`                                                                 | `dsh-spill-local` / `dsh-spill-policy`                                               | 溢出策略（maxInlineBytes 50000）   |
| `session-checkpoint-policy`                                                                    | `dsh-session-checkpoint-policy`                                                      | 会话检查点策略                      |
| `tool-result-pruner`                                                                           | `dsh-compaction-tool-result-pruner`                                                  | 工具结果裁剪（阈值 8192 字符等）          |
| `tool-todo`                                                                                    | `dsh-tool-todo`                                                                      | Todo 工具（允许并行 in-progress）    |
| `tool-ralph`                                                                                   | `dsh-tool-ralph`                                                                     | Ralph 迭代（spawn，maxRounds 64） |
| `repeat-tool-reminder`                                                                         | `dsh-repeat-tool-reminder`                                                           | 重复工具提醒（阈值 [3,5,8]）           |

### 6. Web / 搜索

| id                    | 插件                        | 说明                                                            |
| --------------------- | ------------------------- | ------------------------------------------------------------- |
| `web`                 | `dsh-web`                 | Web 工具（searchProvider: deepseek-official，fetchProvider: http） |
| `web-search-deepseek` | `dsh-web-search-deepseek` | DeepSeek 搜索（apiKeyEnv: DEEPSEEK_API_KEY）                      |
| `web-fetch-http`      | `dsh-web-fetch-http`      | HTTP 抓取                                                       |
| `tool-web`            | `dsh-tool-web`            | Web 工具（fetch true，searchTimeoutMs 60000）                      |

### 7. 每个模式都挂载、值由各 overlay 决定的行

| id              | 插件                  | 说明                                    |
| --------------- | ------------------- | ------------------------------------- |
| `tools`         | `dsh-tools`         | 工具注册表（展示模式为部署选择，默认 native）            |
| `system-prompt` | `dsh-system-prompt` | 系统提示（personaPrefix 为空）                |
| `agent-loop`    | `dsh-agent-loop`    | 启动时创建的 Agent（base 为空）                 |
| `fs-sandbox`    | `dsh-fs-sandbox`    | 沙箱文件系统 provider（cwd 默认 process.cwd()） |
| `llm-deepseek`  | `dsh-llm-deepseek`  | 原生 DeepSeek adapter                   |

---

## 二、注释翻译（逐段）

**文件头部：**

> `dsh-base` bundle 补丁：每个 base-backed profile 的共享核心，以**一次 insert** 的方式应用到空的 profile 根上。后续的 bundle 补丁和用户的 `profile cordis.patch.yml` 会按 id 定位这些行，**按行后写覆盖先写**。
> 
> 补丁会**整体替换目标行的整个 `config`**，而不是合并进去，所以「值因模式而异」的行**不**放在这里：它属于各个 mode bundle，从而让任何单行只保留一个 bundle 层加用户层。模式专属的行只在下面以**共享插件身份 + 中立默认值**出现；每个 mode bundle 会重新声明自己完整的配置。
> 
> 行的顺序不承载加载语义（激活由服务可用性驱动）；分组只是为了方便阅读。

**各插件注释：**

- **hmr**：模块重载是每个 profile 可选的。`patchReload: live` 配置监听使用启动器的 watch-only 回退，**不**需要这一行。

- **agent-default-model**：入口点所创建 Agent 的、与传输无关的默认值。设置可提供已保存的选择；消费者在创建时读取它。

- **settings**：用户设置文档（`$DSH_HOME/settings.yaml`，热重载）：其中的 `llm-deepseek:` 或 `llm-pi-ai:` 段会**无需重启**地覆盖下面的 adapter 条目，Web 的 Models 页面写的就是它。

- **credentials**：凭据来源：继承的环境变量优先于托管的 `$DSH_HOME/.credentials.yaml`，并有项目级和用户级 `.env` 回退。Adapter 按请求解析引用；Models 页面只写托管文档，托管文档**从不**物化进进程环境。

- **llm-pi-ai**：pi-ai 多 provider 孪生，**休眠挂载**：在 `llm-pi-ai:` 设置段提供 provider profile 之前，零路由（picker 里也没有额外模型）——之后这些路由**实时注册**，key 通过各自的 `apiKeyEnv` 引用按请求解析；段清空后路由又消失。提供这些 profile 正是 Web Models 页面所做的事。**存在哪些 adapter 是组合；运行哪些 provider 是用户的设置文档。**

- **session-persistence-jsonl**：持久图片字节存放在 append-only 会话日志之外。消息保留内容寻址引用，由这个共享后端为 provider 请求和授权历史读取解析。

- **session-query-sqlite**：全文会话搜索是**可选**的。`openAt: never` 让 `ctx.sessionQuery` 保持挂载——精确读取、标题、血缘追踪（会话导出、子代理 fork 的 Workspace 继承）仍可用——而搜索调用以 `SESSION_QUERY_SEARCH_DISABLED` 失败，SQLite 从不打开；Web 侧边栏搜索只匹配标题和 workspace 名。启用内容搜索的部署在后续补丁层（profile `cordis.patch.yml` 或 `--patch` overlay）把 `openAt` 覆盖为 `first-search` 或 `startup`，通常配一个持久 `path`。

- **session-projection**：共享投影注册表：子代理目录身份（mode/label）通过其注册单元折叠，所以下面的 `list_agents` 界面**没有它会响亮失败**；Web 层复用同一挂载做列表行。

- **storage**：持久 KV 存储：storage hub、json 后端、以及在其上做 schema 校验的 domain 形式。会话层持久化（下面的投影缓存；Web 层的 workspace）经由这个栈路由，所以它属于共享 base。

- **session-projection-cache**：持久投影缓存：在 `session_projcache` domain 上做节流 write-behind（按记录布局——每个会话一个带版本戳的检查点文档），服务会话列表的投影列。

- **session-telemetry-otel**：OTel 只在**显式用户反馈**之后释放 Session-log 前缀，无论模型 provider 是什么。普通活动**从不**触发采集。`DSH_TELEMETRY_OTLP_URL` 覆盖生产端点。非空 `DSH_TELEMETRY_DISABLED`——任何值，包括 `'0'`/`'false'`——让进程选择退出（启动器把该行 patch 为 disabled；config 无法禁用一行）。导出携带 harness home 的匿名用户 id（`$DSH_HOME/.anonymous-user-id`，随机 UUID；删除文件即可重置身份）作为 Resource 的 `user.id`。exporter/processor 的值通常把关闭排空限制在约 1 秒（面对不可达 collector）：`exporter.timeoutMillis` 既是每次尝试的 socket 超时也是重试截止时间（1 秒实际上禁用 SDK 的 5 次退避），而 `maxExportBatchSize == maxQueueSize`（两者都显式）让排空变成单批。SDK 在 `exportTimeoutMillis` 之外 await `exporter.forceFlush()`，所以当传输 promise 永不 settle 时，后端的 `shutdownTimeoutMillis`（3 秒）是承重的外层界限。每个 CLI 退出路径都通过在 SIGINT/SIGTERM 时 dispose 根来排空它。

- **sandbox**：每个随附 CLI 模式都以相同的文件效果边界启动。环境变量仍是显式的部署覆盖；否则新会话通过下面的权限服务固定为 workspace-write + ask。

- **plan-mode**：`section` 是一大段 plan mode 系统提示（内容见原文，讲的是：保持 plan mode 直到 `exit_plan_mode` 成功或用户切换模式；先探索、只做非变更读；工具目录跨模式保持一致以稳定请求缓存；用 `exit_plan_mode` 提交完整计划等）。

- **tool-subagent-fork**：Fork 省略模型选择，让 provider/model 与父级相等，使继承的历史仍有资格复用 KV Cache。这个 base 行保持 one-shot；preset 层可选择 continuable 模式，而无需在那段历史之前加入仅子级的系统提示段或工具 schema。参见 `.agents/notes/.../2026-08-18-model-selected-subagent-routes.md` 和 `.agents/notes/.../2026-08-10-fork-children-stay-one-shot.md`。

- **session-checkpoint-policy**：每次模型请求和顶层派发之前的持久性检查点。

- **tool-result-pruner**：在更广的对话压缩器运行之前，先压缩过大的工具结果，在配置的预算内保留模型可见的结果。

- **tool-goal**：持久化的同会话目标在这里到达模型和 slash 菜单；domain、driver 和 `/goal` 命令在上面。

- **tool-ralph**：对 build-time 固定脚本的全新 Agent Ralph 迭代。

- **repeat-tool-reminder**：工具链上的连续重复提醒。

- **web**：共享 base 启用稳定的、面向模型的 `web_search` 和 `web_fetch` 工具。Web 应用禁用这个 host 行，并按 agent preset 组合两个工具；有更严格网络策略的产品覆盖 `tool-web`。DeepSeek 搜索在每次搜索时解析 Models 页面为 chat 管理的同一个 `DEEPSEEK_API_KEY` 凭据；其 Messages 端点与 chat-completions 端点分离，所以有自己的 base-URL 覆盖。匿名 fetch 只接受公共 HTTP(S) 目的地，解析并校验每个目的地，并 pin 住每个实际连接。搜索是一次带服务端检索的完整辅助模型请求，所以这个随附的 DeepSeek 路由给 60 秒，而 provider 中立的工具默认仍是 30 秒。

- **tools**：工具注册表。展示模式是部署选择；这里省略它保持 schema 默认（native）。

- **system-prompt**：部署 persona 是部署选择；plan-mode 和工具插件拥有各自的提示段。

- **agent-loop**：启动时创建的 Agent。base 保持为空；raw overlay 可以创建 agent，而 Web 按客户端请求创建会话。

- **fs-sandbox**：沙箱文件系统 provider。`cwd` 默认 `process.cwd()`；overlay 可 pin 另一个 workspace。

- **llm-deepseek**：原生 DeepSeek adapter。没有内联 key 或 endpoint：两者都按请求从 `llm-deepseek:` 设置段解析并覆盖此条目，key 来自下面的凭据存储。Thinking 默认值是部署选择。

---

如果需要我把这些整理成一张「插件 → 所属层（base / mode / user）」的表格，或重点展开某一组（比如 session/storage 栈、subagent、沙箱权限），可以告诉我。

本回答由 AI 生成，内容仅供参考，请仔细甄别。

# 
