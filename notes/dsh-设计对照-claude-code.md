# DSH 设计对照 · Claude Code（W2-D4~D7 产出物之一）

> 用途：把你笔记（`notes/学习claude-code.md`）里"DSH 对应物（W5 填）"那栏提前填上。
> 方法：按主题派子代理精读本地 DSH 包 README（`node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/`），
> 每主题产出"DSH 怎么处理 + 给 fork 的启示"。
> 状态：子代理研究中，逐步填充 ↓

## 1. 主循环与工具执行（dsh-agent-loop）

**Claude Code 侧**：代理循环 = 循环内特定点触发的回调；并行工具执行；推理级别设置。

**DSH 侧**：
- `dsh-agent-loop` 是 DSH 唯一的具象 agent 驱动器，驱动「轮次(turn)/步骤(step)」两级生命周期：领取提示词 → 组装请求 → 流式收模型响应 → 分发工具调用 → 把结果**追加回持久会话日志**。一个 step = 一次模型调用及其工具调用。
- **并行工具执行**：`maxParallelToolCalls`（默认 10，=1 即串行）限制每步并行数；工具用 `defineTool` 的 `executionMode` 声明并行安全分类——并行安全调用进有界滚动池重叠执行，**独占调用单独运行并构成排序屏障**。对应 Claude Code "reads 并行"，且按工具分类而非一刀切。
- **循环终止**：关键——**没有内置轮次预算**。限制失控轮次要靠生命周期扩展点（如 agent/turn-stopping）执行取消。对比 fork 手写 max_tool_calling，DSH 刻意不把它写进循环核心，而是暴露取消/事件挂钩由上层策略实现。
- **与 teenycode 线性 while 的本质区别**：DSH 是事件驱动 Cordis 插件架构——状态落为持久会话日志（可恢复、可压缩、请求可从日志重建）；每步是显式状态机边界，可被 pre-step/turn-stopping 事件拦截改写；工具调度 = 独占屏障 + 并发池。
- 推理级别：`agents[].reasoningEffort`（如 high）声明式配置，`ctx.llm.prepareCall()` 在每轮解析。

**给 fork 的启示**（不必照搬事件架构，搬三条收益最大）：①工具结果先持久追加再派生下一步（非纯内存回填）；②按 executionMode 分类的并发池 + 独占屏障；③把轮数上限做成可注入/可覆写的策略点，而非 while 里写死的计数器。

## 2. 子代理（dsh-subagent / dsh-tool-subagent）

**Claude Code 侧**：主 agent 生成提示词交给子代理，无先前消息历史，只加载自己的系统提示与 CLAUDE.md；子代理只拿部分工具；按任务设 effect-level。

**DSH 侧**：
- 结构：`dsh-subagent` 是"服务 seam"（提供方注册表 + 启动/继续 API + 生命周期事件），本身不改变行为；配两个兄弟包——提供方后端（spawn-in-process / fork-in-process 等）+ 面向模型的工具 `dsh-tool-subagent`。模型以**普通工具调用**方式启动子代理（工具名默认 `subagent`），一次调用可并行多个。
- **spawn vs fork（对应 Claude Code"无历史"的核心设计）**：spawn（默认）= 全新子代理，**零父级历史**，只带自己的系统提示/描述符；fork = 把父级**已完成的轮次前缀**作快照当初始内容（不含进行中轮次），适合"在对话上继续"的任务（审查/延续分析）。
- 工具/权限：子代理拿到**全新扁平注册作用域**，父级工具限制与权限不继承（fork 只传对话）。限制手段 = 每实例配置：`toolFilter`（工具过滤）、`persona`（遮蔽系统提示）、`maxDepth`（委派深度上限，默认 3）、`agentOptions`（子级 model/reasoningEffort/maxTokens）。
- **无内置角色枚举**（对比 Claude Code 的 Explore/Plan/general-purpose）：角色 = 配置组合——不同 toolName 实例绑定不同 persona+toolFilter+model。
- 结果回传：one-shot 前台只回**最终文本**，中间步骤绝不进父级上下文；one-shot 后台返回 job id（父级用 job_output/job_kill 收集）；continuable（可继续）子代理保留持久会话 + 稳定 id，可 sendMessage 继续、可中断不销毁——**超出 Claude Code 每次 fresh 的 Task 语义**，更像带上下文种子的可对话 worker。
- 隔离：同进程运行，隔离来自全新作用域 + 固定"delegated subagent"权限声明（权限启动时固定、不可加宽、被拒不得换法重试）+ 崩溃不破坏父会话。

**给 fork 的启示**：最小骨架 = 服务层（注册表+启动/继续/结算）+ 一个工具把"子代理=工具调用"暴露给模型；用 seed 有无区分 spawn/fork、用 toolFilter+persona+agentOptions 做角色化、只回传最终文本保父级上下文干净。

## 3. 会话与消息管理（dsh-session / -persistence / -projection）

**Claude Code 侧**：五种消息类型 + subtype（init / compact_boundary / informational…）；会话 id 自动生成。

**DSH 侧**：
- **会话 = 事件溯源的仅追加日志**，单一真源：Session = 类型化 SessionEvent 序列 + SessionHeader（cwd、isSeeded、fork 血缘）+ 连续 seq。模型历史不另存，由 `deriveMessages()` 增量派生。fork(source, boundary?) 从稳定前缀切谱系子会话。
- **事件 vs 消息不是一回事**：事件 = 持久单元，消息 = surface 投影。仅三类 surface 事件产出消息（user/message、assistant/message、tool/result），其余只作日志（assistant/chunk、tool/call、turn/end、request/header…）。对照 Claude Code subtype：init ≈ request/header(initial)；compact_boundary ≈ surface replace 遮蔽 + 边界事件；informational ≈ 仅日志事件。崩溃恢复追加合成 tool/result（TOOL_NOT_STARTED/TOOL_OUTCOME_UNKNOWN）。
- 持久化：JSONL 后端，每会话一份仅追加文件，首行 header 编码血缘；写入 = write-behind（200ms 聚合窗口）+ flush 屏障，append 持久后才返回。
- **投影（对应你笔记"不要的文字只能不加入上下文"的痛点）**：`dsh-session-projection` 是面向客户端载体的读模型；真正决定"发给模型子集"的是 surface 的 **replace 操作**——遮蔽条目使其从未来派生消息消失，但保留原始日志。仅追加可回放 + 遮蔽控 token + KV 前缀从遮蔽点才失效。
- checkpoint：`ctx.sessions.flush()` 持久检查点；**无回滚**——日志不可重写，回看 = fork 到稳定前缀。

**给 fork 的启示**：只需学三件事——①日志与"模型历史"分离（append-only 事件源 + deriveMessages 派生）；②遮蔽代替删除（replace 不删日志）；③load 时补崩溃 closer。消息管理就从"JSON 行 + role 字段硬顶"升级为"事件流 + 投影规则"。

## 4. MCP 支持（dsh-mcp-client）

**Claude Code 侧**：外部工具接入协议。

**DSH 侧**：
- 每台服务器一条 YAML 插件配置即可接入（transport 必填：stdio 或 streamable-http；另有 env/headers、toolCallTimeoutMs 默认 60s、自动重连退避）。
- 工具进**共享工具注册表**，模型视角与原生工具无差别：命名固定 `mcp__<serverName>__<tool>`（与 Claude Code/Codex 同形态），serverName 是本地配置（绝不用远程不可信名），同名前缀天然共存（两个 search 工具互不冲突）。
- 权限/沙箱：副作用在 harness 进程外执行（spawn 子进程或 HTTP 端点），不在 ctx.fs 文件沙箱内；仅 stdio 子进程环境被清洗（剔除匹配 KEY/PASSWORD/SECRET/TOKEN 与所有 DSH_* 的环境变量）防密钥泄露。只桥接 tools，resources 与 prompts 不支持。
- 工具集"整代原子交换"：重复 serverName 加载即失败、冲突更新整体拒绝，绝无部分工具集。

**给 fork 的启示**：MCP 工具 = "注册进共享表 + 前缀命名 + 环境清洗"三条，命名约定（`mcp__server__tool`）值得直接抄。

## 5. Hooks（dsh-hook-protocol / dsh-hooks-claude-code）

**Claude Code 侧**：工具运行前/后、代理完成时的回调，方便不改核心代码加功能。

**DSH 侧**：
- `dsh-hook-protocol` 是**共享规则层**（matcher → dsh-shell spawn → codec → merge → hook/* 事件），不直接安装。事件点沿用 Claude Code 命名：SessionStart / UserPromptSubmit / PreToolUse / PostToolUse / Stop / SubagentStart / SubagentStop。**注册 = 配置声明**（hooks.json 的 command 形态），不是 Cordis 事件注册。
- `dsh-hooks-claude-code` 是**兼容适配器**：读 hooks.json/settings，逐事件映射到 harness 扩展点（agent/session-start、agent/pre-step、tools/pre-execute、tools/post-execute、agent/turn-stopping、subagent/start|end）。hook = **子进程命令**（经 ctx.shell 执行），stdin 传 payload，支持 ${CLAUDE_PLUGIN_ROOT}/${CLAUDE_PROJECT_DIR} 替换。
- **与 Cordis 的关系**：hooks 不是事件的薄封装，而是三层——协议纯函数流水线 + 桥接把配置翻译成注册在扩展点事件上的监听器（触发子进程）+ hook/invoked|result 仅作日志持久事件。事件是机制，hook 是**进程边界适配层**。
- 退出码语义：exit 2 = 阻塞带消息（映射 deny）；其他 = 仅记录；PreToolUse 可 ask；Stop 经 steer() 强制续步。
- 典型用途：拦截工具/提示词、PreToolUse 确认、注入模型可见上下文（SessionStart/PostToolUse/SubagentStart）、审计日志、**复用存量 Claude Code 配置**（30 个事件只支持 7 个、只跑 command handler、串行）。

**给 fork 的启示**：最小方案 = 5 个扩展点事件 + spawn/exit2/stdout 三条规则即可兼容两大 CLI 生态；价值在 payload 方言保真而非机制本身。

## 6. 权限模型（dsh-permission-presets / dsh-user-approval / dsh-tool-ask-user）

**Claude Code 侧**：六档权限模式（default/acceptEdits/plan/dontAsk/auto/bypassPermissions）+ canUseTool 回调 + 权限规则。

**DSH 侧**：
- **先纠正一个名字陷阱**：`dsh-authorization` 不是权限引擎——它管的是"配置拿不到、必须和人对话才取得的凭据"（OAuth/一次性码），是 flow 注册表。对照权限要找 `dsh-permission-presets` + `dsh-user-approval`。
- **不是档位也不是规则引擎——两个正交旋钮 + 命名预设**：DSH 把"能否执行"拆成①沙箱模式（`dsh-sandbox-policy`，执行能力）②审批策略（`dsh-user-approval` 的 ask/never）。`dsh-permission-presets` 只做 UI 捆绑：默认 workspace-write+ask 与 danger-full-access+never 两个命名预设。**无规则引擎、无 per-tool 规则、无 canUseTool 回调**；审批结果只有一次性 allowed-once（无 allow-always、无规则记忆）。
- 判定次序：消费者执行前判定"需审批"→ 调 `ctx.approval.request` → 策略短路（never 确定性拒绝、ask 委托应答者 waterfall，无应答者一律 unavailable 关闭）。
- HITL 是**同步阻塞的一次性审批 seam**：结果词汇 allowed-once/rejected/cancelled/unavailable；应答者由部署组合（UI 给人、ACP 桥给自动化 agent），服务自身绝不提示人。
- **agent 主动提问：有**——`dsh-tool-ask-user` 提供 `ask_user_question` 工具（对应 AskUserQuestion），模型发 questions 数组，工具阻塞到 answerer 接受，回答作为普通工具结果返回。
- 门控发生位置：**工具实现内部、执行之前**的 seam（`ctx.approval`），与通道无关；沙箱模式在 bash 执行器层强制。**门控与执行是解耦的两个旋钮**，预设只是捆绑视图。
- **对照 Claude Code 六档**：CC 把执行能力/审批粒度/模型纪律混在一根轴上；DSH 拆成正交两轴，无一一对应。default ≈ ask+受限沙箱；ask+自动应答者 ≈ auto；bypassPermissions ≈ danger-full-access+never（但 DSH 的 never 是"确定性拒绝"不是自动放行）；**plan 只读档不存在**（DSH 没有 plan 模式模型纪律，只读是沙箱能力档位）；acceptEdits/dontAsk 的"部分工具免问+记住规则"明确不存在。

**给 fork 的启示**：把单一 checkPermission 拆成"沙箱能力 + ask/never 策略短路 + 一次性 HITL seam"三个正交件——never 短路于任何询问之前、无应答者一律 fail-closed、批准绝不沉淀为规则——就比白名单/黑名单/y-N 单函数更接近 DSH 形态。

## 7. 记忆与指令文件（dsh-agent-instructions）

**Claude Code 侧**：CLAUDE.md 自动读入，子代理可选 omitClaudeMd。

**DSH 侧**：
- 把 AGENTS.md 兼容的工作区指令作为**持久对话内容注入**模型，替代启动时硬编码拼进 system content（对比 fork 的 buildSystemContent 启动读一次）。
- 来源三级：①用户全局 `$DSH_HOME/AGENTS.md`；②项目指令链（项目根 → 会话 cwd 每个目录的所有现存候选，从宽到具体）；③本地 overlay `AGENTS.local.md`/`CLAUDE.local.md`。候选默认**同时认 AGENTS.md 与 CLAUDE.md**（两格式并存兼容）。无 settings 来源；maxBytes 必填（dsh-base 默认 65,536 字节预算，先省略较宽泛文件、最后截断最具体文件）。
- **时机与缓存（和 fork 差距最大）**：不是启动读一次——基线在会话首个 agent/pre-step **惰性组合**，作为 user 角色 + system-reminder 包装的持久消息进首次请求；刷新由 **fs touch 驱动**（成功的 read/write/edit 到达更深目录 → 下次请求注入新增嵌套指令）；SHA-1 digest 缓存，路径与摘要未变的内容绝不重复注入。无文件 watcher。
- 层级记忆比 CLAUDE.md 单文件粒度更细；刻意不解释 .claude/rules/、@path import 等（候选语义保持简单）。

**给 fork 的启示**：把"启动时读一次 AGENTS.md"换成"首次请求惰性基线 + fs touch 驱动增量刷新 + digest 去重"，并同时认 AGENTS.md/CLAUDE.md/.local.md 多级候选，即是最小可落地的对齐方案。

## 8. 可观测性与压缩（dsh-session-telemetry-otel / dsh-compaction-basic / dsh-token-meter）

**Claude Code 侧**：OpenTelemetry 三信号（trace/metrics/logs），token/成本统计。

**DSH 侧**：
- **可观测性：只导出 OTel「logs」一个信号**（LoggerProvider → BatchLogRecordProcessor → OTLP/HTTP），每条带 seq 的会话事件 = 一条 LogRecord。**无 traces、无 OTel metrics**。对照 Claude Code 三信号：logs 有、metrics 半有（token/成本数据存在但只以 projection 供 UI，不落 OTel metric）、traces 无。记录含完整 event.data，API key 结构性缺席。三 mode：FULL / FEEDBACK_ONLY（仅反馈时回放权威日志前缀）/ DISABLED（默认）。
- **压缩（对比你 fork 手写的简化版）**：触发 = 上下文窗口 80%（thresholdRatio 0.8），agent/pre-step 派生前查压；另有**溢出恢复路径**（CONTEXT_WINDOW_EXCEEDED → 最大头部缩减后重试，maxOverflowRetries=1）；保留 retainRatio 0.16 逐字尾部；摘要 = 单条 `<compacted-summary>` 框定的 user 消息**替换**旧区，固定 8 节 Markdown，强制"必须缩小"校验；摘要调用**逐字回放上次请求的系统提示词/工具/遮蔽消息 → 复用提供方热前缀 KV-cache**。
- **压缩是事务**：先记录标记（compaction/start → 摘要 → compaction/end 恰一次），崩溃遗留未匹配 start = 持久锁。你 fork 用"追加检查点标记行"已有雏形，但缺锁语义。
- token-meter：无精确 tokenizer，固定启发式「4 字符 ≈ 1 token + 块/角色开销」；提供方报告用量只在 envelope 完全匹配时复用（勿自拍 token 数）；**CJK 文本与 JSON schema 在 4 字符/token 下严重低估**。

**给 fork 的启示**：补"先记标记后替换的事务 + 锁"、替换前强制缩小校验、压缩与计量共享同一回放、按 envelope 匹配复用提供方真实用量、token/成本统计做成日志回放派生而非即时计数。
