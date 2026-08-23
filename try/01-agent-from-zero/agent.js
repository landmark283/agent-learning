// W1-D1 最小 ReAct agent（零框架，Node 18+ 原生 fetch）
// 运行：node agent.js "现在几点？请用中文回答。"
// 需要先设置环境变量 DEEPSEEK_API_KEY
const readline = require('node:readline/promises')

const API_KEY = process.env.DEEPSEEK_API_KEY
if (!API_KEY) {
  console.error('缺少 DEEPSEEK_API_KEY，请先设置环境变量（PowerShell: $env:DEEPSEEK_API_KEY="sk-..."）')
  process.exit(1)
}

const API_URL = 'https://api.deepseek.com/chat/completions'
const MODEL = 'deepseek-chat'
const ROUND_MAX = 10
const messages = [
  { role: 'system', content: 'You are a helpful assistant.' },
]
// ── 1. 工具说明书（JSON Schema）：这是给模型看的 ──────────────
// description 越清楚，模型用对的概率越高（扩展挑战 #2 会让你亲自验证）
const tools = [
  {
    type: 'function',
    function: {
      name: 'get_current_time',
      description: '获取当前时间。模型不知道现在是几点几分，回答时间类问题时必须调用这个工具。',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
]

// ── 2. 工具实现：这是程序真正执行的代码 ─────────────────────
// 模型只"提议"，真正执行的是这里（执行权在程序手里）
function runTool(name, args) {
  switch (name) {
    case 'get_current_time':
      return new Date().toISOString()
    default:
      throw new Error(`未知工具: ${name}（模型说了个不存在的工具）`)
  }
}

// ── 3. 一次"想"：把整个对话发给模型 ─────────────────────────
async function callLLM() {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    // tools 让模型"知道有工具可用"；tool_choice: 'auto' 让模型自己决定用不用
    body: JSON.stringify({ model: MODEL, messages, tools, tool_choice: 'auto' }),
  })
  if (!res.ok) throw new Error(`API 错误 ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.choices[0].message
}

// ── 4. ReAct 主循环：想 → 做 → 看 → 再想 ────────────────────
// 同时处理工具部分的对话拼接
async function run() {
  // 轮数上限：防止模型陷入"调用工具→报错→再调用"的无限循环
  for (let round = 0; round < ROUND_MAX; round++) {
    const msg = await callLLM()
    messages.push(msg) // 模型的话（可能含 tool_calls）完整放回对话

    if (msg.tool_calls) {
      // 做：执行模型提议的每个工具
      const names = []
      for (const tc of msg.tool_calls) {
        const result = runTool(tc.function.name, JSON.parse(tc.function.arguments))
        names.push(tc.function.name)
        // 看：把结果以 role:'tool' 放回对话，用 tool_call_id 对应到那次调用
        messages.push({ role: 'tool', tool_call_id: tc.id, content: String(result) })
      }
      console.log(`[第 ${round + 1} 轮] 模型请求工具: ${names.join(', ')}，结果已回喂`)
      continue // 带着工具结果，进入下一轮"想"
    }

    // 模型没有再请求工具 = 它认为可以回答了，循环终止
    console.log('[完成]', msg.content)
    return msg.content
  }
  throw new Error('达到最大轮数：模型可能陷入了循环')
}

// 入口，多轮对话
async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    console.log('开始对话（输入 exit 退出，输入 history 查看完整历史）')
  
    while (true) {
      const input = await rl.question('你: ')
      if (input.trim().toLowerCase() === 'exit') break
      if (input.trim().toLowerCase() === 'history'){
        messages.forEach(mes => {
          console.log(`${mes.role}: ${mes.content}`)
        })
        continue
      }
  
      messages.push({ role: 'user', content: input })       // ① 拼上用户的话
      const reply = await run()                             // ② 带着全部历史问模型
      console.log('AI: ' + reply)
    }
    rl.close()
}
main().catch(e =>{
  console.error(e)
  process.exit(1)
})
