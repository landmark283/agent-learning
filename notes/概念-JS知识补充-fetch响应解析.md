# 概念：JS 知识补充 — fetch 响应解析（res.json()）

> 来源：`try/01-agent-from-zero/chat.js` 的 `callLLM()`，第 28~42 行
> 一句话：**fetch 返回的不是 JSON，是 Response 包装；`res.json()` 负责"读字节 → 解析成对象"**

---

## 一、fetch 到底返回了什么

```js
const res = await fetch(API_URL, { method: 'POST', headers: {...}, body: JSON.stringify({...}) })
```

`res` 是一个 **`Response` 对象**，不是 JSON，也不是字符串。它包含：

| 部分 | 例子 | 说明 |
|---|---|---|
| 状态码 | `res.status`（200 / 400 / 401...） | `res.ok` = 状态码在 200~299 之间 |
| 响应头 | `res.headers` | 如 `Content-Type: application/json` |
| **body 字节流** | 还没被读取 | JSON 文本就躺在里面，是个"流"，不是现成数据 |

关键点：**body 是流（stream），只能被读取一次**。读完之后流就空了。

## 二、res.json() 做了什么

```js
const data = await res.json()
```

`res.json()` 依次完成三步：

1. **读出**整个 body 字节流；
2. 按 **UTF-8 解码**成字符串；
3. **`JSON.parse`** 成普通 JS 对象 → 之后就能 `data.choices` 这样点号访问。

它是**异步**的（读流需要时间），返回的是 Promise，所以必须 `await`。

等价写法：

```js
const data = JSON.parse(await res.text())
//  res.text()  = 第 1、2 步（读出字符串）
//  JSON.parse = 第 3 步（字符串 → 对象）
```

## 三、配套的几个坑 / 细节

1. **`res.json()` 只能调用一次**：body 流被读一次就没了，再调会报错（或拿到空结果）。所以 `chat.js` 里错误分支用 `res.text()`、正常分支用 `res.json()`，二者只走其一，不冲突。
2. **JSON 解析失败会 throw**：如果服务器返回的不是合法 JSON（比如返回了 HTML 错误页），`res.json()` 会抛异常。
3. **网络层面失败**：断网、域名错误时，`fetch` 本身就会 reject（根本走不到 `res.json()`）。
4. **先检查再解析**：`chat.js` 第 40 行 `if (!res.ok) throw ...` 就是在解析前先拦掉错误状态码——HTTP 200 也不一定代表业务成功，但 4xx/5xx 一定失败。

## 四、chat.js 对照（完整链路）

```js
const res = await fetch(API_URL, {...})        // ① 发出请求，拿到 Response 包装
if (!res.ok) throw new Error(...)               // ② 状态码不对，提前失败
const data = await res.json()                   // ③ 读流 + 解析 → JS 对象
return data.choices[0].message.content          // ④ 按结构取字段（下一份笔记）
```

## 五、小实验

把 `chat.js` 里 `const data = await res.json()` 下面加一行：

```js
console.log(JSON.stringify(data, null, 2))  // 打印完整响应，亲眼看看结构
```

跑一次对话，对比打印结果和"简易 DeepSeek 输出格式"笔记里的字段表。

## 六、疑问

（留空，跑实验时遇到了再回来补）
