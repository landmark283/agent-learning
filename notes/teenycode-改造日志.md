# teenycode-改造日志
## 学习teenycode
这个东西基本上就是一个最简的能够调用工具的agent。一定程度上，就是在我自己写的agent.js的基础上稍稍扩展了一下：
1. 使用ts编写，更加规范，有类型提示。
2. 规范了tools，使用zod来写tool，把tool的实际执行函数，与描述文本绑定在一起，统一加载，并且提供输入校验。解耦彻底，代码规范，便于修改。
3. 不再手写fetch，而是调openai库来进行client网络操作，可读性高。


## 修改
为了方便使用，我稍微修改了一下teenycode的源码。
### 一、支持使用其他模型（仅支持openai格式）
参考 '概念：相关包简介.md' 或 官方文档。
修改了创建client的代码。现在需要在根目录下的 .env 文件中提供以下环境变量：
'''
BASE_URL=https://api.deepseek.com
API_KEY=sk-...
MODEL=deepseek-v4-pro
'''

### 二、补充工具
补充了teenycode没有的一些工具：
1. grep（是自己简易实现的，效率较低，后续需要使用真正的生产级库进行替换）
2. run_command 使用js的exec实现，需要加上权限控制才能安全使用
3. getCurrentTime 获取当前时间
4. webSearch 这里为了方便，我们妥协，调用deepseek的官方搜索api来完成搜索。
webSearch非常难做，如果我们使用让模型通过fetch，先通过搜索引擎搜索，再逐一读取网页，那么将面临两个问题：1.不安全，2.费token。两个问题解决起来都很麻烦，于是我们直接用官方api作为替代。
（注：当时日志先写了意图、代码尚未落地；补全⑧ 已真正实现，见文末第五节。）

### 三、完善上下文管理
1. 增加了压缩上下文的功能。该功能的实现意外的简单：把完整对话发给llm，让它代为总结。目前的使用需求还暂时不需要特殊的返回格式。
2. 增加了上下文持久化的功能。所有的对话会记录到日志当中，压缩对话只是在日志后面接着写入总结内容，不破坏已有的日志，支持从日志读取上下文恢复对话。
3. 增加相关指令来查看完整上下文。
这部分内容做得比较简陋，代码也写的比较丑陋。后续有时间会改成用json来传递有关参数。

### 四、补充权限控制
1. 增加了目录检查，防止模型访问工作目录外的目录。
2. 使用白名单和黑名单来辅助管理run_command的权限。
3. 支持询问用户来决定是否run_command。
补充权限控制之后，我们的agent做出破坏文件的行为的可能性就大大降低了。但是最好还是在虚拟机当中运行我们的实验agent。

### 五、webSearch 补全⑧（真正实现联网搜索）

> 对应理论：#8 接地（Grounding）的完整形态——之前只有 grep（本地检索），现在是外部世界检索。

#### 为什么改
整理时发现第四节里写了 webSearch，但 `tools.ts` 里其实没有这个工具——知识截止问题一直没解决。

#### 怎么改（一次搜索 = 一次 DeepSeek Messages 模型调用）
DeepSeek 没有独立搜索端点，但它提供 Anthropic 兼容的 Messages API
（`https://api.deepseek.com/anthropic/v1/messages`），原生支持 `web_search_20250305`
**server tool**：模型收到搜索指令后，DeepSeek 在服务端完成搜索并返回**结构化**
的 `web_search_tool_result` 块（url/title/page_age），不用自己抓网页、不费 token。

```ts
const res = await fetch(`${SEARCH_BASE_URL}/messages`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-api-key": API_KEY,
             "authorization": `Bearer ${API_KEY}`, "anthropic-version": "2023-06-01" },
  body: JSON.stringify({
    model: SEARCH_MODEL, max_tokens: 4096,
    messages: [{ role: "user", content: [{ type: "text",
                text: `Perform a web search for the query: ${query}` }] }],
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
  }),
});
```

- `SEARCH_BASE_URL`/`SEARCH_MODEL` 独立环境变量可覆盖（搜索走 Anthropic 端点，
  与 chat-completions 的 BASE_URL 是两套 base 不能混用）；默认复用 MODEL。
- 解析：找 `content[]` 里 `web_search_tool_result` 块 → 取 `web_search_result`
  条目（去重、最多 8 条）；snippet 从 text block 的 citations 按 url 关联。
- 同步更新 `src/tests/tools.test.ts`：工具数 6 → 7（注册清单是公开契约，改功能必改测试）。

#### 验证结果
1. `vp test`：7 过 6 败 1——败的是 `list_files` 的 Windows 路径分隔符问题
   （`git stash` 跑基线确认是改动前就存在的平台问题，与本次无关）。
2. `tsc --noEmit` 通过。
3. 冒烟直调 execute 搜 "DeepSeek v4 最新发布"：返回 8 条真实结果（标题+URL），6.3s。

#### 预测 vs 实际（差距）
| 预测 | 实际 |
|---|---|
| Anthropic 端点模型名可能不可用 | `deepseek-v4-flash` 直接可用（HTTP 200） |
| 能从响应拼出摘要 snippet | **item 字段是 encrypted_content（加密），citations 常为 0** → 大多结果只有标题+URL。与 DSH 官方 `dsh-web-search-deepseek` 行为一致（README 明说 "Uncited results carry no snippet"），不是解析 bug |

#### 可改进
- 想要正文：将来加 `fetch_url` 工具，让模型选 1~2 个链接抓正文（网页抓取是另一课）；
- `max_uses: 5` 会让服务端搜多轮、token 更贵，暂未暴露给模型调节。

### 六、架构重构：抽出 runTask + 权限判定系统（补全⑨，子代理的地基）

> 对应理论：#18 权限门控的 DSH 形态（工具自决 + 审批 seam + fail-closed）；
> 为将来的子代理（#13/14）铺路——runTask = dsh-agent-loop 的最小对应物。

#### 为什么改
研究 DSH 权限模型后发现自己 fork 的差距：
1. 权限判定**硬编码在循环里只认 run_command**（`if tool.name === "run_command"` 特判），
   加新危险工具要改循环；
2. 核心循环和终端 I/O/权限询问/会话日志**耦合在一个 runAgent 巨型函数**里，
   无法被复用——想加子代理（本质 = 用另一组工具再跑一遍循环）无从下手。

#### 怎么改（两处）
**① tools.ts —— 权限从"循环特判"下沉为"工具自述"**
- `Tool` 类型加 `approval?: "ask"` 与可选 `approvalSummary(input)`（给用户看什么）；
- `run_command` 声明 `approval: "ask"` + summary 返回命令本身。
- 加新危险工具 = 标一行，不动循环。

**② agent.ts —— 抽出 `runTask(options)`，runAgent 变薄**
- 核心循环（原 @123-205）整体搬进 `runTask`，I/O 全参数化：
  `client/model/tools/messages/maxToolCalls` + 三个注入点
  `askUser?`（审批应答者）、`persist?`（落盘）、`onToolCall?/onFinal?`（展示）。
- 审批 gate 内联在 runTask 的工具执行前：`approval==="ask"` → `askUser ? await askUser(summary) : "deny"`。
  **deny = 拒绝消息回喂，绝不执行**；无应答者 = fail-closed。
- 白名单/黑名单从循环挪进 runAgent 的 askUser 实现——**策略属于应答者，不属于循环**。
- runAgent 现在是 runTask 的一个调用方：外层 while 读 stdin → push 用户消息 → runTask → 打印。

#### 验证结果
- `tsc --noEmit` 通过；`vp test` 6/7（唯一失败仍是既有 Windows 路径问题，与本次无关）；
- 端到端三场景：
  1. 白名单命令（node --version）→ 自动放行执行 ✅
  2. 黑名单/用户拒绝（权限确认答 n）→ gate 拒绝，模型收到"用户拒绝了操作"并自愈（不再尝试）✅
  3. 顺带修了个真 bug：stdin EOF 时权限询问抛 `ERR_USE_AFTER_CLOSE` 被吞成误导性工具错误
     → askUser 捕获询问失败按 deny 处理（fail-closed 的应答者失联形态）。

#### 预测 vs 实际
| 预测 | 实际 |
|---|---|
| 加 approval 声明字段即可 | 同；另发现需要 approvalSummary 让用户看到"命令本身"而非 schema JSON |
| 抽 runTask + 参数注入点 | 同；persist 注入比预想重要——子代理不落盘靠它实现 |
| 黑名单挪进 askUser | 同；且 askUser 要 try/catch 询问失败 = 一个没想到的 fail-closed 面 |

#### 子代理的位置（这次没做，架构已留好）
将来加 subagent 工具只需：`execute` 里调 `runTask({ tools: 只读子集, messages: 新数组, askUser: undefined /* 无审批权 */ })`——
递归 + fresh 上下文 + 无应答者 fail-closed 三件事参数注入就齐了。