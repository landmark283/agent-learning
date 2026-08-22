# W1-D1 · T0：最小 agent（零框架，先跑起来）

> **对应理论**：`02-Agent架构理论清单.md` #1 ReAct、#6 Function Calling
> **前置**：Node 18+（原生 fetch，不用装任何依赖）；一个 DeepSeek API key
> **预计**：1.5~2 小时
> **产出**：`agent.js`——你的第一个 agent，一个 60 行的 ReAct 循环

---

## 目标

1. 亲手写出"想→做→看→再想"的循环（ReAct），不用任何框架；
2. 理解 Function Calling 到底是怎么一回事；
3. 亲眼看到幻觉是怎么发生的、工具是怎么把它治住的。

---

## 一、为什么需要"循环 + 工具"？（先看为什么）

LLM 本质上是一个**知识截止日期的闭卷考生**：

- 它不知道"现在几点"——它的训练数据里没有"现在"这个概念；
- 它不能执行代码——它只会"说"代码；
- 它会**自信地编造**——问它现在几点，它会一本正经地给你一个时间。

试想：你让一个不戴表、没日历、还嘴硬的助手去报时。它唯一诚实的回答是"我不知道"，
但模型没有"我不知道"这个选项，它只会编。**这就是幻觉的来源之一：没有工具，只能编。**

解决办法：给它**手脚**（工具）和**闭环**（循环）——不知道就查，查完再说。
这一课，我们给模型装一只手：一个 `get_current_time` 工具。

## 二、两个核心概念（是什么）

### 1. ReAct（Reason + Act）

一个循环，四步重复：

```
模型"想"下一步 → 程序执行它要求的工具 → 把结果放回对话 → 模型再看结果继续想
     ↑______________________ 直到模型说"我答完了" ______________________↓
```

关键：**执行权在程序手里，模型只是"提议"**。它说"我想调 get_current_time"，程序才去调，
结果由程序放回对话。模型永远在"说话"，程序永远在"做事"。

> 对照：这个 while 循环，就是 DSH 里 `dsh-agent-loop` 的核心骨架（W5 你会读到完整版）。

### 2. Function Calling（结构化工具调用）

模型不会"调用"函数——它只是**输出一段 JSON**：

```json
{ "name": "get_current_time", "arguments": "{}" }
```

流程是：

1. 你通过 `tools` 参数把工具说明书（JSON Schema）发给模型；
2. 模型判断"这题需要工具"，输出上面的 JSON；
3. **程序**解析 JSON、执行真实函数、把结果以 `role: "tool"` 的消息放回对话；
4. 模型看到结果，继续作答。

> 对照：`tools` 数组就是工具注册表；DSH 里每个 `dsh-tool-*` 插件注册的就是这种东西。

## 三、动手（怎么用）

### 步骤 0：准备 API key

```powershell
# PowerShell：设置环境变量（只对当前窗口有效，不会写进代码）
$env:DEEPSEEK_API_KEY = "sk-你的key"
```

> 安全提醒：key 永远走环境变量，别写进代码或提交到 git。

### 步骤 1：建文件

把下面的 `agent.js` 保存到本目录（`try/01-agent-from-zero/agent.js`）。

### 步骤 2：跑起来

```powershell
node agent.js "现在几点？请用中文回答。"
```

如果一切正常，你会看到模型请求了工具、拿到了时间、给出了答案。**先跑通，再看代码。**

### 步骤 3：看懂循环（逐段讲解）

看 `agent.js`，五个部分对应五个问题：

| 代码段 | 回答的问题 |
|---|---|
| `tools` 数组 | 模型的"工具说明书"长什么样？（JSON Schema） |
| `runTool()` | 程序怎么执行工具？不认识的工具怎么办？ |
| `callLLM()` | 一次"想"是怎么发出的？（POST + tools 参数） |
| `for` 循环 | 循环什么时候该停？（没有 `tool_calls` 就停 + 轮数上限） |
| `role: "tool"` 消息 | 结果是怎么"看"给模型的？ |

> 重点看 `for` 循环里的顺序：把模型消息**完整**放回对话（含 tool_calls），
> 再把工具结果接在后面——模型"看到"的全过程都在 messages 数组里。

### 步骤 4：对比实验（幻觉 vs 工具）

这是本课最重要的一步，两个实验对照着做：

- **实验 A（有工具）**：`node agent.js "现在几点？"` → 模型调用工具，答案正确；
- **实验 B（没工具）**：临时把 `callLLM` 里 body 的 `tools, tool_choice` 删掉再跑
  → **模型开始编时间**。这就是幻觉现场，也是"工具 + 循环"存在的全部理由。

做完把代码改回来。

## 四、验收标准

- [ ] 能跑通，模型通过调用 `get_current_time` 回答了"现在几点"；
- [ ] 能说出循环的终止条件是什么、为什么还要加轮数上限；
- [ ] 能解释"为什么模型说'我想调工具'时，程序才去执行"（执行权在哪）；
- [ ] 完成对比实验，亲眼见过一次幻觉；
- [ ] 完成后 git commit（你的第一个 agent，值得留档）：

```powershell
git add try/01-agent-from-zero/
git commit -m "W1-D1: 最小 ReAct agent 跑通（get_current_time 工具）"
```

## 五、扩展挑战（可选，做完更赚）

1. **加第二个工具** `read_file`：给模型"读本目录文件"的能力，让它读 `agent.js` 并总结自己——体会"模型读代码"是怎么发生的；
2. **改工具描述**：把 `get_current_time` 的 description 改得含糊（如"获取时间"）再跑，观察模型使用工具的准确率变化——体会"工具说明书的质量=模型的能力边界"；
3. **思考题**：如果模型输出了一个**不存在的工具名**（非法调用），现在的代码会怎样？真实的系统（如 DSH）会怎么做？（提示：拒绝重试、报错回喂）

## 六、参考链接

- [阿里云《不使用框架，手写一个最小 Agent》](https://developer.aliyun.com/article/1757224)
- [DeepSeek API 文档：Function Calling](https://api-docs.deepseek.com/zh-cn/guides/function_calling)
- [Manning《Build an AI Agent from Scratch》第 4 章 ReAct](https://livebook.manning.com/book/build-an-ai-agent-from-scratch/chapter-4)
- [Anthropic：Agent 循环官方文档](https://code.claude.com/docs/zh-CN/agent-sdk/agent-loop)（提前看一眼生产级循环长什么样）

---

**下一步预告（W1-D2）**：读 [teenycode](https://github.com/yangshun/teenycode)（200 行编码 agent），
看"生产级"的循环比你的多了什么。跑完本课记得 git commit。
