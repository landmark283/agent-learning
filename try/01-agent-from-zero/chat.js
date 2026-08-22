// 多轮对话客户端：自己手动实现上下文的拼接
// 核心思想：messages 数组就是模型的全部"记忆"，每次请求把它完整发出去
//
// 运行（在 01-agent-from-zero 目录下）：
//   $env:DEEPSEEK_API_KEY = "sk-..."   # 设置 key（每次新开终端都要设）
//   node chat.js                        # 开始对话，输入 exit 退出

const readline = require('node:readline/promises')

const API_KEY = process.env.DEEPSEEK_API_KEY
if (!API_KEY) {
  console.error('缺少 DEEPSEEK_API_KEY，请先设置环境变量（PowerShell: $env:DEEPSEEK_API_KEY="sk-..."）')
  process.exit(1)
}

const API_URL = 'https://api.deepseek.com/chat/completions'
// V4 时代模型名：deepseek-v4-flash / deepseek-v4-pro；deepseek-chat 是通用别名。
// 如果报模型不存在，换成 deepseek-chat 试试。
const MODEL = 'deepseek-v4-flash'

// ── 上下文拼接的核心：messages 数组 ──────────────────────────
// 多轮对话 = 不断往这个数组里 push 新消息（用户说的、模型答的）
const messages = [
  { role: 'system', content: 'You are a helpful assistant.' },
]

async function callLLM() {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages, // 整个历史 + 最新用户消息，一起发给模型
      stream: false,
    }),
  })
  if (!res.ok) throw new Error(`API 错误 ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.choices[0].message.content
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  console.log('开始对话（输入 exit 退出）')

  while (true) {
    const input = await rl.question('你: ')
    if (input.trim().toLowerCase() === 'exit') break

    messages.push({ role: 'user', content: input })       // ① 拼上用户的话
    const reply = await callLLM()                          // ② 带着全部历史问模型
    messages.push({ role: 'assistant', content: reply })   // ③ 把回答也存进历史
    console.log('AI: ' + reply)
  }
  rl.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
