# 概念：简易 DeepSeek 输出格式（Chat Completions 响应）

> 来源：`try/01-agent-from-zero/chat.js` 的 `callLLM()`；接口为 OpenAI 兼容格式
> 一句话：非流式返回一个大 JSON，回答在 `choices[0].message.content`，计费在 `usage`
> 官方文档：https://api-docs.deepseek.com/zh-cn/api/create-chat-completion

---

## 一、完整响应示例（非流式，`stream: false`）

```json
{
  "id": "chatcmpl-8f8d9f1a-...",
  "object": "chat.completion",
  "created": 1730000000,
  "model": "deepseek-v4-flash",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "你好！有什么可以帮你的吗？"
      },
      "logprobs": null,
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 35,
    "completion_tokens": 8,
    "total_tokens": 43,
    "prompt_cache_hit_tokens": 0,
    "prompt_cache_miss_tokens": 35
  },
  "system_fingerprint": "fp_3a5770e1b4"
}
```

## 二、字段速查表

| 字段 | 含义 | 备注 |
|---|---|---|
| `id` | 本次请求唯一 ID | 排障时用 |
| `object` | 固定 `"chat.completion"` | 标识结果类型 |
| `created` | 生成时间戳（Unix 秒） | |
| `model` | 实际生效的模型名 | |
| `choices` | **回答主体，数组** | 非流式通常只有 1 个元素 |
| `choices[i].index` | 该候选的序号 | 从 0 开始 |
| `choices[i].message` | 模型生成的消息 | 核心：`role` + `content` |
| `choices[i].message.content` | **模型回答的正文** | 我们要取的就是它 |
| `choices[i].finish_reason` | 结束原因 | `"stop"` 正常 / `"length"` 超长被截断 / `"tool_calls"` 要调工具 |
| `usage` | token 计费 | DeepSeek 多了缓存命中字段（命中的更便宜） |

## 三、chat.js 怎么取值

```js
const data = await res.json()
return data.choices[0].message.content
// 取值链路：choices 数组第 1 个 → message → content
```

## 四、什么时候格式会变

1. **Function Calling（工具调用）时**：
   `choices[0].message` 里会多一个 `tool_calls` 字段（形如 `{ name, arguments }`），
   而 `content` 可能为 `null`。判断"模型想不想调工具"就看 `tool_calls` 在不在。
   → W1-D1 的 `agent.js` 会用上。

2. **流式输出（`stream: true`）时**：
   不再返回上面这个大 JSON，而是**多行小 JSON**（SSE 格式），每行只有
   `choices[0].delta`（增量内容）。此时不能一次 `res.json()` 读完，要逐行解析。
   → 后面的 D2 内容，先有印象即可。

## 五、常见疑问

- **为什么 `choices` 是数组？** 兼容"一个请求生成多个候选答案"的设计，虽然我们只用第 1 个。
- **`finish_reason` 为什么重要？** `"length"` 说明回答被截断了——不是模型说完，是字数到顶被掐了，要留意内容不完整。
- **`prompt_cache_*` 是什么？** DeepSeek 对相同前缀输入的缓存命中统计，命中的 token 计费更便宜，不影响返回内容。

## 六、疑问

（留空，遇到再回来补）
