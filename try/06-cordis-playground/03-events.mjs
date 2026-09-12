/**
 * W4·D3-4 · 实验 3：事件系统 —— 五种分发语义
 *
 * 对应材料：
 *   - deepseek-harness/docs/cordis-tutorial/04-events.zh.md
 *   - 源码：cordis/src/events.ts:32 DispatchMode、:183-243 五个分发实现
 *
 * 为什么需要五种？因为"发事件"在不同场景要的语义完全不同：
 *   广播（emit/parallel）/ 短路（bail/serial）/ 环绕包装（waterfall）。
 * DSH 里 `tools/result` 用 emit（纯广播），`internal/update` 用 waterfall（可否决）。
 *
 * 运行：D:\nvm\v22.19.0\node.exe 03-events.mjs
 */
import { Context } from '@deepseek-ai/cordis'

let failed = 0
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failed++
  console.log(`${ok ? '  ✅' : '  ❌'} ${label}: ${JSON.stringify(actual)}${ok ? '' : ` （期望 ${JSON.stringify(expected)}）`}`)
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const root = new Context()

// ── 先装一个"监听器观察器"：internal/dispatch 能看到每一次分发 ────────
const trace = []
root.on('internal/dispatch', (mode, name, args) => {
  trace.push(`${mode}→${name}(${args.join(',')})`)
})

// 三个监听器：每个记录顺序，返回不同值（返回值决定 bail/serial 是否短路）
const order = []
const mk = (id, ret) => (ctx) => ctx.on('demo', (x) => {
  order.push(id)
  return ret
})
for (const [id, ret] of [['L1', undefined], ['L2', 'BAIL'], ['L3', undefined]]) {
  const fiber = root.plugin(mk(id, ret))
  await fiber.await()
}

console.log('【1/5】emit —— 同步跑完所有监听器，忽略返回值、不等 Promise')
order.length = 0
root.emit('demo', 1)
check('三个监听器都跑了（不被 BAIL 打断）', order, ['L1', 'L2', 'L3'])

let asyncDone = false
const asyncListener = async (ctx) => {
  ctx.on('demo', async () => {
    await sleep(5)
    asyncDone = true
  })
}
const af = root.plugin(asyncListener)
await af.await()
root.emit('demo', 1)
check('emit 返回时，异步监听器还没结束', asyncDone, false)
await sleep(10)
check('一个 tick 之后它才结束（emit 没有 await 它）', asyncDone, true)

console.log('【2/5】parallel —— 全部并发，等所有监听器 settle')
order.length = 0
await root.parallel('demo', 2)
check('并发模式下三个都跑了', order, ['L1', 'L2', 'L3'])

console.log('【3/5】serial —— 顺序 await，遇到「bail 值」立即停止')
order.length = 0
const bailValue = await root.serial('demo', 3)
check('L2 返回 BAIL 后 L3 不再执行', order, ['L1', 'L2'])
check('serial 把该 bail 值返回给调用者', bailValue, 'BAIL')

console.log('【4/5】bail —— 同步版 serial（不 await）')
order.length = 0
const bailSync = root.bail('demo', 4)
check('同样在 L2 处短路', order, ['L1', 'L2'])
check('返回值相同', bailSync, 'BAIL')
console.log(`  何为 bail 值：非 null / 非 false / 非 undefined（events.ts:13 isBailed）`)

console.log('【5/5】waterfall —— 每个监听器包住"剩下的链条"，不调 next 即否决')
const wf = new Context()
const inner = (x) => x // 最内层的"内建行为"，作为 waterfall 的最后一个实参
const double = (ctx) => ctx.on('compute', (x, next) => next(x) * 2)
const plusOne = (ctx) => ctx.on('compute', (x, next) => next(x) + 1)
await wf.plugin(double)
await wf.plugin(plusOne)
// 先注册的是最外层：double( plusOne( inner ) )
check('(10 + 1) * 2 = 22', wf.waterfall('compute', 10, inner), 22)

// 换一个顺序：plusOne 在外层 → (10 * 2) + 1 = 21
const wf2 = new Context()
await wf2.plugin(plusOne)
await wf2.plugin(double)
check('(10 * 2) + 1 = 21（注册顺序决定包装顺序）', wf2.waterfall('compute', 10, inner), 21)

// 否决：监听器不调用 next()，内建行为永远不执行
let innerRan = false
const wf3 = new Context()
await wf3.plugin((ctx) => ctx.on('gate', (x, next) => 'vetoed'))
check('不调 next() 即否决，返回该监听器的值', wf3.waterfall('gate', 10, () => { innerRan = true; return 'inner' }), 'vetoed')
check('内建行为没有执行', innerRan, false)
console.log('  → DSH 的 internal/update 就是 waterfall：任何监听器不调 next() 就能拦下一次配置更新')

console.log('【附加】once / prepend / 内部事件不外泄')
const p = new Context()
const seq = []
await p.plugin((ctx) => {
  ctx.on('e', () => seq.push('normal'))
  ctx.on('e', () => seq.push('prepended'), true) // 布尔实参 = prepend
  ctx.once('e', () => seq.push('once'))
})
p.emit('e')
check('prepend 插到最前', seq[0], 'prepended')
p.emit('e')
check('once 只触发一次', seq.filter((x) => x === 'once').length, 1)

check('internal/* 事件不会被 internal/dispatch 观察到', trace.some((t) => t.includes('internal/')), false)
console.log(`  实际观察到的分发：${JSON.stringify(trace.slice(0, 4))} …（internal/* 自身被排除，events.ts:168）`)

// ── 收尾 ─────────────────────────────────────────────────────────────
for (const ctx of [root, wf, wf2, wf3, p]) await ctx.fiber.dispose()
console.log(failed === 0 ? '\n实验 3 全部通过 ✅' : `\n实验 3 有 ${failed} 条不符合预期 ❌`)
process.exit(failed === 0 ? 0 : 1)
