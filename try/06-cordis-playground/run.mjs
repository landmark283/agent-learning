/**
 * W4·D5-7 · 启动器：等价于 vendored Cordis 的 bin.js
 *
 * 原文件只有 15 行：node_modules/@deepseek-ai/cordis/bin.js
 * 这就是 DSH 的引导模型 —— 代码里一个插件名都不写，
 * 万事万物（有哪些插件、怎么配）都来自 ./cordis.yml。
 *
 * 与官方教程唯一差别：教程用 `node --import tsx` 直接跑 .ts；
 * 这里用纯 .js，所以零安装、零构建。
 *
 * 运行：D:\nvm\v22.19.0\node.exe run.mjs
 */
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { pathToFileURL } from 'node:url'

const STATE = ['PENDING', 'LOADING', 'ACTIVE', 'FAILED', 'DISPOSED', 'UNLOADING']

const ctx = new Context()
ctx.baseUrl = pathToFileURL(process.cwd()).href + '/'

await ctx.plugin(Loader)
await ctx.loader.create({
  name: '@deepseek-ai/cordis-plugin-include',
  config: {
    path: './cordis.yml',
    enableLogs: true,
  },
})

// ── 观测：YAML 里的每一行到底变成了什么 ──────────────────────────────
await ctx.loader.await()
console.log('\n──────── 装载结果（来自 cordis.yml）────────')
for (const [, runtime] of ctx.registry.entries()) {
  for (const fiber of runtime.fibers) {
    const entry = fiber.entry
    console.log(`  ${String(entry?.id ?? runtime.name).padEnd(14)} ← ${runtime.name}  状态=${STATE[fiber.state]}`)
  }
}
console.log('───────────────────────────────────────────\n')

// 让 loader 把"始终装不上的插件"点出来（教程第 6 章的诊断手段）
const pending = ctx.loader.getTasks?.() ?? []
if (pending.length) console.log(`还有 ${pending.length} 个导入任务未完成（可能在等依赖）`)

// 给插件里 fire-and-forget 的演示代码（如 greet-tool 自导自演的一次工具调用）
// 一点时间把 microtask/IO 走完，再让进程自然退出。
await new Promise((resolve) => setTimeout(resolve, 100))
