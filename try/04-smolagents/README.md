# W2-D1~D3 · T3 smolagents：让 agent 用代码当动作（CodeAgent）

> **对应理论**：`02-Agent架构理论清单.md` #3 CodeAgent（代码即动作）——与 JSON 派的分叉点
> **前置**：W1 全部完成（你已亲手写过：最小循环、teenycode fork 补全①~⑧，含 web_search）
> **源码位置**：`source/smolagents/`（已通过代理抓取，HuggingFace 官方仓库）
> **产出**：`notes/smolagents.md` 一页纸笔记
> **预计**：D1~D3（2~3 天，每天 2h）

---

## 目标

1. 理解 **CodeAgent**：让 agent **直接写 Python 代码当动作**，而不是输出 JSON 工具调用；
2. 弄懂"代码当动作"是怎么实现的：代码从哪来 → 怎么执行 → 结果怎么回喂；
3. 和你的 teenycode（JSON 工具调用派）逐点对照，形成两大流派的谱系认知；
4. 批判性阅读：它哪里设计得好、哪里你以后写 DSH 插件时可以借鉴。

## 一、先看整体：为什么会有"代码派"（5 分钟）

### 两大流派之争（业界背景）

2024 年底以来，agent 的动作表示分成了两派：

| | JSON 派（你的 teenycode） | 代码派（smolagents CodeAgent） |
|---|---|---|
| 模型输出 | `{"name":"read_file","arguments":{...}}` | ```python\ncontent = read_file("a.py")``` |
| 循环里发生什么 | 解析 JSON → 查表 → 逐个 execute | 解析代码块 → Python 解释器执行 |
| 表达力 | 受限于预定义工具 | **工具只是函数，任意 Python 组合** |
| 典型代表 | OpenAI Function Calling、DSH、Claude Code | smolagents、CodeAct（论文） |

为什么代码表达力更强？[官方博客](https://huggingface.co/blog/smolagents) 里的核心论证：
**代码就是天然的动作语言**——if/for/变量/函数调用本身就是"计划+执行+组合"，
模型不需要把"先用 a 再用 b 再组合"翻译成一条条 JSON 调用；而且代码可读、可复现、
可调试，token 更省（`read_file("a.py")` 比一坨 JSON schema 短得多）。

### smolagents 的仓库结构（先建立地图）

```
source/smolagents/
├── src/smolagents/
│   ├── agents.py               # 核心！三个 agent 类都在这里（见下）
│   ├── agent_types.py          # RunResult/ActionStep 等数据结构
│   ├── local_python_executor.py# ★ 代码派的心脏：Python 代码怎么被安全执行
│   ├── tools.py                # Tool 基类 + @tool 装饰器
│   ├── default_tools.py        # 内置工具（final_answer、python_interpreter…）
│   ├── models.py               # 模型封装（HfApiModel/OpenAIServerModel…）
│   ├── memory.py               # 记忆：TaskStep/ActionStep/SystemPromptStep
│   └── prompts/
│       ├── code_agent.yaml     # ★ CodeAgent 的系统提示词（教模型写代码）
│       ├── toolcalling_agent.yaml # JSON 派的系统提示词
│       └── structured_code_agent.yaml
├── examples/                   # 可运行示例（agent_from_any_llm.py 最适合你起步）
└── tests/                      # 大量测试（读测试是理解行为的捷径）
```

## 二、读代码：三个类的继承关系（核心，D1 半天）

打开 `src/smolagents/agents.py`（1813 行，比 teenycode 大 15 倍，但骨架一样）：

```
MultiStepAgent（基类，~300 行）
├── 所有 agent 的公共骨架：run() / step() / memory / tools / model
├── run()         @436  主入口：重置记忆 → 循环 step → 收集最终答案
├── _run_stream() @540  ★ 主循环：while not final_answer and step <= max_steps
└── step()        @782  执行一步（调用 _step_stream，子类各自实现）
    │
    ├── ToolCallingAgent（@1215）—— JSON 派：和你 teenycode 几乎一样！
    │     _step_stream 里：模型输出 JSON tool_calls → 逐个 execute → 回喂
    │
    └── CodeAgent（@1505）—— ★ 代码派：本次的主角
          _step_stream @1638：模型输出代码 → 解析 → 执行 → 观察回喂
```

> **对照点 1**：`MultiStepAgent._run_stream`（@540）的 while 循环，
> 和你 `agent.ts` 的内层 while 是同一个东西——"直到 final answer 或超步数"。
> 区别只是 teenycode 超限报错退出（你补的 ③），smolagents 用 `AgentMaxStepsError`。

### CodeAgent 的一步到底做了什么（重点精读 @1638~1764）

`_step_stream` 的五个阶段，对照你的 agent.ts 逐段看：

| 阶段 | smolagents 位置 | 干什么 | 你的 teenycode 对应 |
|---|---|---|---|
| ① 生成 | @1655 | 模型生成**代码文本**（不是 JSON） | `client.chat.completions.create` |
| ② 解析 | @1702~1708 | `parse_code_blobs()` 从输出里抠出 ```python 代码块 | `JSON.parse(arguments)` |
| ③ 包装 | @1715 | 把代码包成 `ToolCall(name="python_interpreter")` | 走 tool 分发 |
| ④ 执行 | @1725~1726 | `self.python_executor(code_action)` **跑代码** | `tool.execute(args)` |
| ⑤ 观察 | @1733, @1753 | 执行日志 + 最后输出 → 回喂 memory | `push(tool 消息)` |

**关键洞察**：smolagents 只有一个"真工具"——`python_interpreter`（Python 解释器）。
其他工具（web_search、read_file…）都变成**注入进解释器环境的 Python 函数**，
模型用普通 Python 语法直接调用它们。这就是"代码即动作"的实体化。

### final_answer：循环怎么终止的（精读 @1633 local_python_executor）

模型代码里调用 `final_answer(结果)` 来结束。实现很巧妙（`local_python_executor.py` @1633）：

```python
def final_answer(*args, **kwargs):
    raise FinalAnswerException(...)   # 用"异常"打断执行流！
```

执行器捕获这个专属异常 → 把结果标记为 `is_final_answer=True` → 主循环收到
`FinalAnswerStep` 退出。**用异常做控制流**——你写 agent 时很少想到的招。

### 工具怎么变成函数（如果 D1 有余力再看）

`default_tools.py` 里 `final_answer` 是这么定义成工具的；`agents.py` @492
`python_executor.send_tools({**self.tools, ...})` 把工具塞进执行环境。
读 `local_python_executor.py` @330 附近的 `state` 字典：解释器环境里预置了
工具函数和授权 import 列表。

## 三、对照作业（写进 `notes/smolagents.md`）

1. **画 CodeAgent 一步的流程图**（生成→解析→执行→观察→回喂，标出 agents.py 行号）；
2. **列出 3 个"我没想到的细节"**（提示：final_answer 用异常、stop_sequences、authorized_imports、executor 可换沙箱）；
3. **写一段代码对比**：同一个任务（"读取 a.txt 并把内容倒序写入 b.txt"），
   JSON 派模型要输出几步 tool_calls，代码派模型要输出几行 Python？哪个更短？
4. **批判性阅读**：CodeAgent 有什么隐患？（提示：让模型写任意代码 = 把执行权交给模型，
   authorized_imports 怎么限制？executor_type 的 local/e2b/docker 各是什么隔离级别？）
5. 记一个疑问留白。

## 四、动手（可选，D2 做）

仓库是 Python，你环境没有 smolagents 依赖，不强制跑通。想体验的话两个选择：

- **纯读**：`examples/agent_from_any_llm.py`——看它怎么把任意 OpenAI 兼容 API 接进来
  （和你 fork 做 DeepSeek 兼容是同一思路，读代码即可）；
- **想跑**：`pip install smolagents` 到独立 venv，参考
  [官方 guided tour](https://huggingface.co/docs/smolagents/main/en/guided_tour)，
  注意它默认连 HuggingFace Inference，你要像 DSH 接 DeepSeek 那样配 BASE_URL/API_KEY
  （模型封装在 `models.py` 的 `OpenAIServerModel`，和你熟悉的 openai SDK 同构）。

## 五、验收标准

- [ ] 能讲清"代码派 vs JSON 派"的本质差异和各自的取舍（不用背，讲清 trade-off）；
- [ ] 能说出 CodeAgent 一步循环的五个阶段，并指出它在 agents.py 的行号；
- [ ] 能解释 final_answer 为什么用异常实现；
- [ ] 能说出"工具变成 Python 函数"发生在哪一步、授权 import 限制了什么；
- [ ] 完成对照作业，`notes/smolagents.md` 已提交。

## 参考链接

- [Introducing smolagents（HuggingFace 官方博客，必读）](https://huggingface.co/blog/smolagents)
- [smolagents Guided tour（官方文档）](https://huggingface.co/docs/smolagents/main/en/guided_tour)
- [Agents Course · Code agents（HF 官方课程，有中文版）](https://huggingface.co/learn/agents-course/zh-CN/unit2/smolagents/code_agents)
- [CodeAct 论文（"代码当动作"的学术源头）](https://arxiv.org/abs/2402.01030)
- 本地源码：`source/smolagents/`（本文行号基于当前 main 分支快照）
