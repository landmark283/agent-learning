/**
 * W4·D1-2 · 实验 1：Context / Service / inject —— 最小可运行
 *
 * 对应材料：
 *   - Cordis README「Quick Start」
 *   - deepseek-harness/docs/cordis-tutorial/03-services.zh.md
 *   - 源码：cordis/src/context.ts、service.ts、reflect.ts
 *
 * 关键点：**何时启动由依赖决定，而不是装载顺序**。
 * 运行：D:\nvm\v22.19.0\node.exe 01-minimal.mjs
 */
import { Context, Service } from '@deepseek-ai/cordis'

// FiberState 是 TS 的 `const enum`，编译后不一定是运行时值，这里手动映射
const STATE = ['PENDING', 'LOADING', 'ACTIVE', 'FAILED', 'DISPOSED', 'UNLOADING']
const st = (fiber) => STATE[fiber.state]

// ── 1. Service：一个「具名能力」，注册进 ctx ──────────────────────────
class Counter extends Service {
  value = 0

  constructor(ctx) {
    // 运行时：以名字 'counter' 注册（内部 ctx.reflect.provide），卸载时自动注销
    super(ctx, 'counter')
  }

  next() {
    return ++this.value
  }
}

// ── 2. 消费者：inject 声明硬依赖；依赖不齐就一直 PENDING ──────────────
const greeter = Object.assign((ctx) => {
  ctx.on('app/ready', (message) => {
    console.log(`[greeter] ${message} #${ctx.counter.next()}`)
  })
}, { inject: ['counter'] })

const root = new Context()
console.log(`root 初始状态 = ${st(root.fiber)}`)

// ── 3. 故意先装消费者：证明启动时机由依赖决定 ────────────────────────
const consumer = root.plugin(greeter)
console.log(`先装消费者 → ${st(consumer)}（还没有 counter，只能等）`)
console.log(`  root.get('counter') = ${root.get('counter')}  ← 服务还没被提供`)

// ── 4. 提供依赖 → 消费者自动启动 ─────────────────────────────────────
const provider = root.plugin(Counter)
await provider
await consumer.await()
console.log(`再装提供者 → 消费者 ${st(consumer)}`)
console.log(`  root.get('counter') = ${typeof root.get('counter')}  ← 服务可读了`)

root.emit('app/ready', 'started')

// ── 5. 日志去哪了？默认 exporter 只写内存 buffer ─────────────────────
const log = root.logger('demo')
log.info('这句日志不会出现在控制台')
console.log(`  logger.buffer 里有 ${root.logger.buffer.length} 条；最后一条 args = ${JSON.stringify(root.logger.buffer.at(-1).args)}`)
console.log('  原因：控制台导出器是独立插件 cordis-plugin-logger-console，本地未装 —— 连日志输出都是插件')

// ── 6. dispose 可逆：卸载提供者 → 消费者级联卸载 ─────────────────────
await provider.dispose()
console.log(`卸载 counter 后 → 消费者 ${st(consumer)}（自动卸载，回到等待状态）`)
console.log(`  root.get('counter') = ${root.get('counter')}  ← 服务已注销`)

// ── 7. 再装回来 → 消费者自动重新加载（完整闭环）──────────────────────
const provider2 = root.plugin(Counter)
await provider2
await consumer.await()
console.log(`重新装回 counter → 消费者 ${st(consumer)}`)

root.emit('app/ready', 'reloaded')
console.log('  注意上面是 #1 而不是 #2：重装得到的是**全新的 Counter 实例**')

await provider2.dispose()
await root.fiber.dispose()
console.log('实验 1 结束（全部 fiber 已卸载）')
