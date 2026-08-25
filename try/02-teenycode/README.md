# W1-D2 · T1：读 teenycode（200 行编码 agent）

> **对应理论**：`02-Agent架构理论清单.md` #1 ReAct、#22 线性循环
> **前置**：已完成 W1-D1（你的 `agent.js` 整合版已经跑通）
> **源码位置**：`source/teenycode/`（已 clone）
> **产出**：`notes/teenycode.md` 一页纸笔记
> **预计**：2~3 小时

---

## 目标

1. 读懂一个"真实但极小"的编码 agent 的完整组织；
2. 和你的 `agent.js` 逐点对照，找出它**比你多做了哪些事**；
3. 学会批判性阅读：找到它不如你的地方。

## 一、先看整体：四个文件各干什么

```
teenycode/
├── src/index.ts    (33行) 入口：校验 API key → 启动 agent
├── src/agent.ts    (117行) 双层循环：外层等你输入，内层让模型调工具
├── src/tools.ts    (159行) 三个工具的定义 + 实现 + 转 OpenAI schema
├── src/env.ts      (18行)  自动加载 .env 文件
├── AGENTS.md              ← 给 agent 看的项目说明（理论 #11 记忆文件的实例！）
└── src/tests/             ← 工具都有测试（验证回路思想）
```

> 对比你的结构：你的 `agent.js` 一个文件 110 行搞定；它拆成 4 个文件。
> 规模相近，但组织方式已经"生产化"——这就是 200 行和 60 行的差别之一。

## 二、和你 agent.js 的对照（核心）

### ① 双层循环：你俩一模一样 ✅

它的 `agent.ts` 结构：外层 `while(true)` 等你输入 → push user 消息 → 内层 `while(true)` 让模型调工具 → 执行 → 结果回喂 → 直到模型输出纯文本 → 打印 → 回到外层。

**这正是你自己整合出来的结构**（chat.js 外壳 + agent.js 内核）。你的架构直觉和 200 行生产代码一致——这不是巧合，这是 agent 的标准骨架。先给自己记一分。

> **什么叫"线性循环"？（映射表里的理论 #22）** "线性"不是指代码长得像直线，
> 而是指**程序的推进方式**：整个 `agent.ts` 只有一条执行路径，每一步都 `await`
> 上一步彻底完成再走下一步（等输入 → 等模型 → 等工具 → 结果回喂）。三个特征：
> ① 没有并发（同一时刻只有一件事在跑）；② 没有事件/回调（全是"主动调用→等结果"）；
> ③ 状态全显式（对话状态就是 `messages` 数组，显式 push）。
> 对照 #22 的另一半"事件驱动"（OpenHands、DSH 的架构）：程序不"调用"组件，
> 而是"发布事件"（如"用户消息到达""工具结果就绪"），各组件订阅后各自响应、
> 互不相识——执行路径是多股流在事件总线里交汇。"线性"对 200 行 toy 够用且好懂；
> 系统一大，事件驱动的"解耦"才回本。W3 读 OpenHands 时你会有直观感受。

### ② 工具组织：声明式 vs 你的命令式 ⚠️ 重点

你的写法（命令式）：

```js
const tools = [ { type: 'function', function: { name: 'get_current_time', ... } } ]  // 说明书
function runTool(name, args) { switch (name) { case 'get_current_time': ... } }       // 实现
```

它的写法（声明式）：

```ts
export type Tool = {
  name: string
  description: string
  schema: z.ZodTypeAny        // zod 校验输入
  execute: (input) => Promise<string>   // 实现
}
// 说明书和实现绑在一个对象里
const readFile: Tool = { name: 'read_file', description: '...', schema: ..., execute: async (input) => {...} }
```

差别在哪？**加一个新工具时**：

- 你的：改 `tools` 数组 + 改 `switch` 加一个 case（两处）；
- 它的：新建一个 `Tool` 对象 + 塞进 `tools` 数组（一处，不需要动任何其他代码）。

这就是"开闭原则"（对扩展开放、对修改关闭）的雏形。更重要的是：**这就是 DSH 插件化的思想萌芽**——每个 `dsh-tool-*` 插件本质上就是"注册一个带名字、描述、schema、实现的工具"，DSH 只是把"数组"换成了"Cordis 插件系统"（W4 你会看到）。

### ③ 错误处理：回喂 vs 崩溃 ⚠️ 重点

你的 `runTool` 遇到未知工具：`throw new Error(...)` → 整个程序崩掉。

它的处理（agent.ts 第 97~110 行）：

```ts
try {
  if (!tool) throw new Error(`Unknown tool: ${call.function.name}`)
  const args = JSON.parse(call.function.arguments)
  result = await tool.execute(args)
} catch (err) {
  result = `ERROR: ${(err as Error).message}`   // 把错误变成工具结果
}
messages.push({ role: "tool", tool_call_id: call.id, content: result })  // 回喂给模型
```

**关键区别**：它把错误当成**正常反馈**喂回给模型——模型看到 `ERROR: old_str not found in xxx`，会自己调整参数重试。**这就是自愈**：错误不是终点，是下一轮"想"的输入。

> 对照理论 #16 验证回路：报错 → 回喂 → 修正，teenycode 已经在用最小形态。
> 你的程序一错就死，它的程序错了会"被模型修好"——这是 toy 和生产的分水岭之一。

### ④ 参数校验：zod vs 裸 JSON.parse

模型传的参数是**它自己生成的 JSON**——你不能信任它。teenycode 用 zod 在 execute 里校验（`readFileInput.parse(input)`），参数不对直接抛错（然后被 ③ 机制回喂）。你的代码 `JSON.parse` 后直接拿去用，模型传错字段就出怪问题。

### ⑤ 边缘情况：你没想到的

`agent.ts` 里随手处理的细节：Ctrl-C 优雅退出、`exit`/`quit`/`:q`/Ctrl-D 都能退出、空行忽略、模型 content 为空时 `msg.content ?? ""`。**生产代码的差别往往不在主流程，在这些边角**。

## 三、三个值得专门琢磨的点

### 1. edit_file 的"唯一匹配"防呆（ACI 设计，理论 #9）

```ts
const occurrences = content.split(old_str).length - 1
if (occurrences === 0) throw new Error(`old_str not found in ${p}`)
if (occurrences > 1) throw new Error(`old_str matched ${occurrences} times; must be unique`)
```

**为什么要求唯一匹配？** 如果同一段文字出现两次，模型只想改第一处，整文件替换会误改第二处。强制"必须唯一"让编辑**可预测、可审查**——模型要么改得准，要么报错重来。这就是 Aider 的 SEARCH/REPLACE 思路（W3 你会再见它），也是"为 agent 设计接口"（ACI）的经典例子：**用约束换来可靠性**。

### 2. 系统提示词里全是设计（agent.ts 第 27~33 行）

```text
You are a helpful coding agent with access to tools for reading, listing, and
editing files... Use the tools whenever they would let you answer more accurately
than guessing. Prefer reading a file over asking the user to paste its contents.
When editing, make the smallest change that satisfies the request. Keep replies short.
```

每一句都是一个设计决策：`比猜更准就用工具`（防幻觉）→ `读文件而不是让用户粘贴`（接地）→ `最小修改`（防误伤）→ `回复简短`（省 token）。**提示词不是废话，是行为规范**。

### 3. AGENTS.md：项目自带的"记忆文件"（理论 #11 实例）

teenycode 仓库根目录有个 `AGENTS.md`——给 agent 看的项目说明（你刚才就被注入了它的内容：Vite+ 工具链规范）。读代码的 agent 一进来就知道"这个项目怎么构建、有哪些坑"。这就是 CLAUDE.md/AGENTS.md 模式：**把项目知识固化进文件，让每个 agent 会话都站在同一起点**。

## 四、批判性阅读：它哪里不如你

读源码不只是学优点，还要找毛病（这也是 W5 读 DSH 时要用的技能）：

1. **内层循环没有轮数上限**：`while(true)` 如果模型陷入"调工具→再调工具"的循环，程序永远不退出。你的 `ROUND_MAX = 10` 比它安全——**你的版本在这方面更专业**。
2. **list_files 会递归整个目录树**：对大项目可能返回巨量文件、烧光上下文。没有深度限制。

这两个都是真实缺陷。带着"找茬"的心态读代码，收获是双倍的。

## 五、对照作业（写进 `notes/teenycode.md`）

1. 画它的双层循环图（参照 notes/README.md 模板）；
2. 列出 **3 个"我没想到的细节"**（可从第二、三节的 ⚠️ 和专门点里选）；
3. 回答：如果让你给 `agent.js` 加"错误回喂"，代码怎么改？（提示：try/catch 包住 runTool，catch 里返回错误字符串而不是 throw）
4. 记一个疑问（没看懂的地方，留白下次回来补）。

## 六、验收标准

- [ ] 能说出 teenycode 的四个文件各干什么；
- [ ] 能讲清"声明式工具注册"和"命令式 switch"的区别，以及为什么前者更好扩展；
- [ ] 能解释"错误回喂"为什么能让 agent 自愈；
- [ ] 完成对照作业，`notes/teenycode.md` 已提交；
- [ ] 指出 teenycode 至少一个真实缺陷。

## 七、参考链接

- [yangshun/teenycode（GitHub）](https://github.com/yangshun/teenycode)
- [OpenAI Function Calling 官方文档](https://platform.openai.com/docs/guides/function-calling)（`tools` 参数规范）
- [Zod（参数校验库）](https://zod.dev/)（`z.object` / `z.toJSONSchema`）
- [AGENTS.md 规范说明](https://agents.md/)（显式记忆文件的生态标准）

---

**下一步预告（W1-D3）**：给 `agent.js` 加 `read_file` / `run_command` 工具，让它真正"会读文件、会跑命令"——顺便把今天学的"错误回喂"用上。
