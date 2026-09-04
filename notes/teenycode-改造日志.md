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