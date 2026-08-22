# 02 · Agent 架构理论清单（需要掌握的架构与设计思路）

> 配套文件：`01-学习路径.md` 是**实践线**（学习顺序），本文件是**理论线**（架构清单）。
> 用法：每条都标注"实践落点"（第一次动手/读代码接触它的环节，见 01 的映射表）；
> 生成任何单个环节的学习文档时，必须带"对应架构"标注。
> 分级：【必学】= 必须能讲清并用得上；【了解】= 知道存在、知道取舍即可。

---

## 一、认知循环架构（agent 怎么"想"）

1. **ReAct（Reason + Act）**【必学】
   - 一句话：思考与工具调用**交替进行**的循环（想→做→看→再想），agent 的原型。
   - 为什么存在：模型单次生成不可靠，需要"行动-观察-反馈"的闭环来纠错。
   - 代表实现：几乎所有 agent——teenycode、OpenHands、DSH 的 `dsh-agent-loop`。
   - 实践落点：W1-D1（T0 最小 agent 就是手写一个 ReAct）。

2. **Plan-and-Execute（先规划再执行）**【必学】
   - 一句话：先产出完整计划再逐步执行，执行中可修订计划。
   - 为什么存在：长任务里"边想边做"容易迷失、烧 token；先规划减少来回，也给人类留出确认点。
   - 代表实现：Devin、Claude Code 的 plan mode、DSH 的 `dsh-plan-mode`。
   - 实践落点：W2-D4~7（T4 研究 Claude Code 的 plan mode）。

3. **CodeAgent（代码即动作）**【必学】
   - 一句话：让 agent **写代码来执行动作**，而不是输出 JSON 工具调用（"动作派" vs "JSON 派"）。
   - 为什么存在：动作表达力更强、token 更省、天然可调试，还能复用语言本身的组合能力。
   - 代表实现：HuggingFace smolagents。
   - 实践落点：W2-D1~3（T3）。

4. **Reflexion（自我反思）**【了解】
   - 一句话：失败后把教训总结成文字写回上下文，下次避免重犯。
   - 为什么存在：让错误成本转化为记忆，而不是每次从零开始。
   - 实践落点：无独立环节；W1 升级 B 的"改错-再试"里自然会出现它的雏形。

5. **Tree of Thoughts / 搜索式探索**【了解】
   - 一句话：多分支思考并回溯（偏研究范式，工业落地少）。
   - 实践落点：无需动手，知道存在即可。

---

## 二、工具与外部世界交互

6. **Function Calling / 结构化工具调用**【必学】
   - 一句话：模型按 JSON Schema 输出工具调用，非法输出被拒绝重试——从机制上堵住自由发挥。
   - 为什么存在：结构化约束是防幻觉与可验证的第一步。
   - 实践落点：W1-D1 起贯穿（第一个工具）；W5-D3 看 DSH 工具注册。

7. **MCP（Model Context Protocol）**【必学】（2025 年的事实标准）
   - 一句话：工具/资源/提示的统一协议，写一次到处接。
   - 为什么存在：避免每个 agent 重造工具轮子，生态可复用。
   - 代表实现：Anthropic 提出，各大工具链接入；DSH 有 `dsh-mcp-client`。
   - 实践落点：W2 之后穿插了解，W5-D3 看 DSH 的 MCP 客户端。

8. **RAG / 接地（Grounding）**【必学】
   - 一句话：先检索再把真实内容放进上下文，让输出有依据（防幻觉的核心手段之一）。
   - 最小形态：grep 工具；完整形态：向量检索 + 仓库索引。
   - 实践落点：W1-D7（升级 F 最小形态）；W3 T5a 看 Aider 的仓库索引。

9. **ACI（Agent-Computer Interface）**【必学】（设计思路）
   - 一句话：**为 agent 设计接口**，而不是为人类——命令别名、文件查看器、diff 视图，处处为 token 效率设计。
   - 为什么存在：SWE-agent 证明接口设计对效果的影响不亚于模型本身。
   - 代表实现：SWE-agent 的 ACI、Aider 的 Repo Map 与 SEARCH/REPLACE。
   - 实践落点：W3-D1~4（T5a 读 Aider 时对照）。

---

## 三、记忆与上下文

10. **上下文工程（Context Engineering）**【必学】
    - 一句话：管理有限的上下文窗口——token 计量、压缩（摘要）、投影（只留相关子集）、结果修剪、溢出落盘。
    - 为什么存在：窗口有限而对话无限，不管理就会"忘"或"爆"。
    - DSH 对应：`dsh-token-meter`、`dsh-compaction-basic`、`dsh-session-projection`、`dsh-compaction-tool-result-pruner`、`dsh-spill-*`。
    - 实践落点：W1-D5（升级 C 手写压缩）；W5-D4 精读。

11. **记忆分层 + 显式记忆文件**【必学】
    - 一句话：短期记忆=对话窗口；长期记忆=外部存储（文件/向量库）。**CLAUDE.md / AGENTS.md** 模式：项目级指令文件，每次启动自动读入。
    - 为什么存在：模型无持久记忆，靠外部载体补；显式文件最简单可靠。
    - 实践落点：W1-D7（升级 E）；W2-D4~7 研究 Claude Code 的 CLAUDE.md。

---

## 四、编排与多智能体

12. **Workflow vs Agent 之分**【必学】（Anthropic 提出的著名划分）
    - 一句话：**Workflow** = 确定性管道（人设计好流程，LLM 只填空）；**Agent** = 自主决策循环（LLM 决定下一步）。
    - Workflow 的常见子模式：prompt chaining（链式）、routing（路由分发）、parallelization（并行）、orchestrator-workers（主管-工人）、evaluator-optimizer（评审-优化）。
    - 为什么存在：能用确定性管道解决的就别用自由 agent——可预测、省钱、好调试。
    - 代表实现：Anthropic《Building effective agents》的范例；LangGraph 等框架。
    - 实践落点：W2（对照理论）；W5-D6 看 DSH 的 `dsh-workflow`。

13. **Orchestrator-Workers（主管-工人）**【必学】
    - 一句话：主管分解任务→分发给工人 agent→汇总结果。
    - 为什么存在：任务可并行分解时大幅提速，且每个工人上下文更小更专注。
    - DSH 对应：`dsh-subagent`、`dsh-tool-subagent`。
    - 实践落点：W5-D6。

14. **Evaluator-Optimizer（评审-优化）**【必学】
    - 一句话：一个 agent 生成，另一个评审，迭代到合格——"第二双眼睛"模式。
    - 为什么存在：生成者容易自嗨，评审者从不同角度抓错。
    - 代表实现：code review agent（如 CodeRabbit）；Claude Code 的 subagent 审查。
    - 实践落点：W2-D4~7（T4 研究 subagent）；W5-D6 看 DSH 对应物。

15. **多 agent 角色化协作（Swarm 风格）**【了解】
    - 一句话：多个 agent 扮演角色对话协作（一度热门，工业落地有限）。
    - 实践落点：了解取舍即可。

---

## 五、可靠性与安全（防幻觉、防事故）

16. **验证回路（Verification Loop）**【必学】（防幻觉第一课）
    - 一句话：改完代码自动跑测试/lint/类型检查/build，把报错原样喂回直到通过——**环境当裁判，模型当选手**。
    - 为什么存在：模型会自信地错，而编译器与测试不会说谎。
    - 实践落点：W1-D4（升级 B 亲手实现）；此后贯穿所有环节。

17. **沙箱隔离（Sandboxing）**【必学】
    - 一句话：在受限环境里执行 agent 的命令（容器/权限受限 shell），炸了也不影响宿主机。
    - DSH 对应：`dsh-sandbox-*`、`dsh-fs-observation-policy`、`dsh-pwsh-sandbox`。
    - 实践落点：W3-D5~7（T5b OpenHands 的沙箱）；W5-D5 精读。

18. **权限门控 / 人类在环（HITL）**【必学】
    - 一句话：危险操作（删文件、push、装依赖）先问人类；plan mode 先确认再执行。
    - 为什么存在：自主性要有边界，关键决策留给人类。
    - DSH 对应：`dsh-user-approval`、`dsh-tool-ask-user`。
    - 实践落点：W1-D6（升级 D 亲手实现）。

19. **结构化输出约束**【必学】
    - 一句话：schema 校验 + 失败重试 + 格式受限，让模型没有"自由发挥"的空间。
    - 实践落点：W1 起贯穿；W5-D3 看 DSH 工具 schema 定义。

20. **置信度与降级策略**【了解】
    - 一句话：不确定时"问/停/降级"而不是硬编；重复尝试要有上限。
    - 实践落点：W1-D6 的自然延伸；W5 看 DSH 的重试与超时（`dsh-llm-retry`、`dsh-timeout`）。

---

## 六、系统级架构（把 agent 变成产品）

21. **插件化框架（Cordis 式）**【必学】（你的终点核心）
    - 一句话：以 Context（依赖容器）+ Service（可注入服务）+ Fiber（生命周期）+ 事件 + 配置驱动加载 组织系统——功能即插件，可装卸、可组合。
    - 为什么存在：agent 系统零件太多（工具/记忆/沙箱/UI），插件化才能让人独立开发、按需组装。
    - 代表实现：Cordis（DSH 即其最大宿主）、Koishi 生态。
    - 实践落点：W4（T6 整个阶段）。

22. **事件驱动 vs 线性循环**【必学】
    - 一句话：简单 agent 是 while 循环；复杂系统用事件流（发事件、监听者响应），解耦各子系统。
    - 代表实现：OpenHands 的事件流 vs teenycode 的线性循环。
    - 实践落点：W1-D2（对照 teenycode）→ W3-D5~7（OpenHands）。

23. **会话与状态管理**【了解】
    - 一句话：session 生命周期、checkpoint、持久化（存哪、怎么恢复）。
    - DSH 对应：`dsh-session-*`、`dsh-session-persistence-*`。
    - 实践落点：W5-D4 顺带。

24. **可观测性与评估（Evals）**【了解】
    - 一句话：轨迹（trajectory）记录、日志、基准评测（如 SWE-bench）——没有评估就不知道改动好坏。
    - 实践落点：W5 顺带；W6 毕业项目收尾自评。

---

## 速查：必学 vs 了解

- **必学（18）**：1 ReAct · 2 Plan-and-Execute · 3 CodeAgent · 6 Function Calling · 7 MCP · 8 RAG · 9 ACI · 10 上下文工程 · 11 记忆分层 · 12 Workflow vs Agent · 13 Orchestrator-Workers · 14 评审-优化 · 16 验证回路 · 17 沙箱 · 18 权限门控 · 19 结构化输出 · 21 插件化框架 · 22 事件驱动
- **了解（6）**：4 Reflexion · 5 ToT · 15 Swarm · 20 置信度降级 · 23 会话状态 · 24 可观测性

## 来源

- [Anthropic：Building effective agents](https://claude.com/blog/common-workflow-patterns-for-ai-agents-and-when-to-use-them)（Workflow vs Agent、五个子模式）
- [HuggingFace：Introducing smolagents](https://huggingface.co/blog/smolagents)（CodeAgent）
- [SWE-agent：Agent-Computer Interface](https://swe-agent.com/)（ACI）
- [MCP 官方文档](https://modelcontextprotocol.io/)（工具协议标准）
- [Koishi 文档·可逆插件系统](https://koishi.chat/zh-CN/cookbook/design/disposable)（Cordis 设计理念）
