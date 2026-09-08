# W2-D4~D7 · T4 Claude Code 行为层研究（不开源码，研究设计决策）

> **⚠️ 前置说明**：原计划的 T3 smolagents 已搁置（学习者判断"代码派 vs JSON 派"是伪对立，
> 现实系统是工具优先 + 代码兜底混合形态）。直接从 D4 开始。
>
> **对应理论**：`02-Agent架构理论清单.md` #2 Plan-and-Execute · #11 CLAUDE.md 记忆 ·
> #18 权限模型 · #14 评审/子代理 · #12 Workflow
> **产出**：`notes/claude-code-设计解剖.md`——"生产级 agent 设计决策清单"，
> 作为 W5 读 DSH 前的对照表
> **预计**：D4~D7（2~3 天，每天 2h）
> **方法**：Claude Code **闭源**，读不了代码。研究"行为层"：官方文档（权威）+ 社区逆向
> 系统提示词（谁写的、怎么组织的）。这本身就是 W5 读 DSH 前的"心理准备"——学会
> 把黑盒当系统解剖，只看输入输出和设计意图。

---

## 目标

1. 建立"生产级单 agent 系统"的设计决策清单：每个决策解决什么问题、取舍是什么；
2. 把你 fork（teenycode）的设计和它逐项对照——哪些你已经有了、哪些是它独有的；
3. **关键心法**：Claude Code 的每个设计，在 DSH 里几乎都有对应物。这份清单 = W5 读 DSH 时的对照表。

## 一、先建立"研究什么"的地图（D4）

Claude Code 值得研究的六个主题，每个都有官方中文文档：

| # | 主题 | 官方文档 | 你的 fork 对应 | 理论 |
|---|---|---|---|---|
| 1 | **代理循环**（agent loop） | [agent-loop](https://code.claude.com/docs/zh-CN/agent-sdk/agent-loop) | agent.ts 内外双层循环 | #1 ReAct |
| 2 | **CLAUDE.md 记忆** | [设置/记忆](https://code.claude.com/docs/zh-CN/settings) | buildSystemContent 读 AGENTS.md | #11 |
| 3 | **权限模型**（默认放行 / plan mode / 危险确认） | [permissions](https://code.claude.com/docs/zh-CN/agent-sdk/permissions) | checkPermission 白/黑名单+HITL | #18 |
| 4 | **subagents（子代理）** | [sub-agents](https://code.claude.com/docs/zh-CN/agent-sdk/subagents) | 暂无（→ W5 看 dsh-subagent） | #13 #14 |
| 5 | **hooks（钩子）** | [hooks](https://code.claude.com/docs/zh-CN/agent-sdk/hooks) | 暂无 | 生命周期 |
| 6 | **输出格式约定 + 可观测性** | [observability](https://code.claude.com/docs/zh-CN/agent-sdk/observability) | console.log | #24 |

## 二、社区逆向的系统提示词（D5 主角）

Claude Code 的系统提示词被人从安装包里挖出来了，两个仓库：

- **[acelest/claude-code-playbook](https://github.com/acelest/claude-code-playbook)**（推荐先读）
  结构化最好：系统提示词解剖、guardrails、子代理提示词、SKILL.md 格式、master prompt 模板。
- **[zep-us/claude-system-prompt](https://github.com/zep-us/claude-system-prompt)**
  更贴近原始文本，且与 Anthropic 官方公布的提示词交叉验证过。

### playbook 里最有价值的发现（我已验证内容，先给你剧透一半）

1. **系统提示词分两层：静态 + 动态**，中间有 `__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__`：
   ```
   [STATIC — 可缓存]
     identity → system rules → doing tasks → actions → tools → tone → efficiency
   [DYNAMIC — 每次会话不同]
     session guidance → memory (MEMORY.md) → env info → MCP instructions
   ```
   **为什么？** 静态层每次都一样 → provider 的 KV cache 可以命中 → 省钱省延迟。
   这正是你 W1-D5 学"KV cache 复用"时的生产级实例！DSH 也这么干（W5 你会看到）。

2. **关键约束在开头 AND 结尾重复出现**："NO TOOLS""READ-ONLY"这类规则写两遍。
   为什么？长上下文里模型注意力会漂移（lost in the middle），首尾是注意力最强处。

3. **`<analysis>` scratchpad + `<summary>` 输出**：模型先私下推理，只有 summary 进上下文。
   这是"思考压缩"的雏形——Claude Code 的 thinking 块不占长期记忆。

4. **并行工具调用是显式指令**："Turn 1: all reads in parallel. Turn 2: all writes in parallel."
   你的 teenycode 工具是串行 for 循环（agent.ts），Claude Code 显式教模型并行读。

5. **子代理三件套**（playbook 的 agents/ 目录）：
   | Agent | 模型 | 职责 |
   |---|---|---|
   | general-purpose | 默认 | 研究、多步任务、写代码 |
   | Explore | haiku（快+便宜） | 只读代码库搜索 |
   | Plan | 继承主模型 | 软件架构师，只读规划 |
   
   注意 Explore 用 haiku、Plan 只读——**子代理按"任务难度"分派不同模型 + 只读权限**，
   这就是 DSH `dsh-subagent` 的思想前身（W5 见）。

## 三、动手研究法：怎么产出"设计决策清单"（D5~D6）

不要通读文档，**按问题清单找答案**。每个问题找到答案后，填一页纸：

```markdown
## 设计决策：<名字>
- **解决什么问题**：一句话
- **怎么做的**：机制/默认值/边界
- **取舍（代价）**：它放弃了什么
- **我的 fork 有没有**：有→在哪；没有→差距
- **DSH 对应物**：包名（先空着，W5 填）
```

### 必答问题清单

1. **循环**：Claude Code 的 agent loop 有哪几步？什么时候停？（对比你 while + max_tool_calling）
2. **记忆**：CLAUDE.md 何时被读入？哪些工具/子代理会跳过它（`omitClaudeMd`）？为什么？
3. **权限**："默认允许、plan mode、危险操作确认"三档具体怎么分？哪些操作属于"危险"？
   （对比你 DENY_PREFIXES 里那几条——它比你的清单全在哪？）
4. **plan mode**：和普通执行模式什么关系？"先规划再执行"在哪一步切换？（理论 #2）
5. **子代理**：为什么 Explore 用 haiku 而不用主模型？省的是什么、牺牲的是什么？
6. **hooks**：PostToolUse/PreToolUse 这些钩子让用户能干什么？（想想你在 fork 里手动做的事，
   哪些其实该做成 hook？）
7. **checkpointing**：文件改动怎么回滚？（对比 git，为什么 agent 需要自己的版本？）

## 四、验收标准

- [ ] `notes/claude-code-设计解剖.md` 存在，含 ≥6 个"设计决策"一页纸；
- [ ] 每个决策都标了"我的 fork 有没有 + DSH 对应物（可留空）"；
- [ ] 能不看文档讲出：为什么系统提示词要分静态/动态？为什么约束首尾重复？
- [ ] 完成所有 git commit，学习日志表更新。

## 参考链接

- [Claude Code · 代理循环如何工作（官方中文）](https://code.claude.com/docs/zh-CN/agent-sdk/agent-loop)
- [Claude Code · 权限（官方中文）](https://code.claude.com/docs/zh-CN/agent-sdk/permissions)
- [Claude Code · 子代理（官方中文）](https://code.claude.com/docs/zh-CN/agent-sdk/subagents)
- [Claude Code · hooks（官方中文）](https://code.claude.com/docs/zh-CN/agent-sdk/hooks)
- [Claude Code · 可观测性（官方中文）](https://code.claude.com/docs/zh-CN/agent-sdk/observability)
- [acelest/claude-code-playbook（社区逆向，结构化最佳）](https://github.com/acelest/claude-code-playbook)
- [zep-us/claude-system-prompt（社区逆向，原文向）](https://github.com/zep-us/claude-system-prompt)
- [Steering Claude Code: skills, hooks, subagents（Anthropic 官方博客）](https://claude.com/blog/steering-claude-code-skills-hooks-rules-subagents-and-more)
