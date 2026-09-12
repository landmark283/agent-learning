/**
 * W4·D1-2 · 实验 2：可逆性（reversibility）是 Cordis 的灵魂
 *
 * 对应材料：
 *   - deepseek-harness/docs/cordis-tutorial/02-lifecycle-and-effects.zh.md
 *   - deepseek-harness/docs/user/develop/framework/index.md（生命周期状态机）
 *   - 源码：cordis/src/fiber.ts:415 effect()、:675 _unload()
 *   - Koishi 文档「可逆插件系统」
 *
 * 本脚本用断言验收：任何一条不符合预期就以非 0 退出。
 * 运行：D:\nvm\v22.19.0\node.exe 02-reversible.mjs
 */
import { Context } from '@deepseek-ai/cordis'

const STATE = ['PENDING', 'LOADING', 'ACTIVE', 'FAILED', 'DISPOSED', 'UNLOADING']
const st = (fiber) => STATE[fiber.state]

let failed = 0
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failed++
  console.log(`${ok ? '  ✅' : '  ❌'} ${label}: ${JSON.stringify(actual)}${ok ? '' : ` （期望 ${JSON.stringify(expected)}）`}`)
}

console.log('【A】同一个插件装两次 = 两个 fiber，共用一个 runtime')
const seen = []
// 注意：不要用 Object.assign(fn, { name }) —— 函数的 name 是只读属性，
// 会抛 TypeError。用函数声明让 name 自然等于标识符即可。
function ticker(ctx) {
  ctx.on('tick', () => seen.push(ctx.fiber.uid))
}

const root = new Context()
const a = root.plugin(ticker)
const b = root.plugin(ticker)
await a.await()
await b.await()
console.log(`  a.uid = ${a.uid}   b.uid = ${b.uid}`)
check('两个 fiber 的 uid 不同', a.uid !== b.uid, true)
check('同一个插件只登记一个 runtime', root.registry.size, 1)

root.emit('tick')
check('一个事件被两个实例各收一次', seen.length, 2)

console.log('【B】卸载其中一个实例：只影响它自己')
seen.length = 0
await a.dispose()
root.emit('tick')
check('卸载 a 后只剩 b 收到', seen, [b.uid])
check('a 已进入 DISPOSED', st(a), 'DISPOSED')

console.log('【C】fiber 卸载后不可再注册（fail-fast）')
try {
  a.ctx.effect(() => {})
  check('已卸载的 fiber 再注册应抛错', 'no error', 'INACTIVE_EFFECT')
} catch (error) {
  check('抛的错带稳定 code', error.code, 'INACTIVE_EFFECT')
}

console.log('【D】同一 fiber 内多个 effect：注册正序，卸载逆序')
const order = []
const noisy = (ctx) => {
  for (const n of [1, 2, 3]) {
    ctx.effect(() => {
      order.push(`register-${n}`)
      return () => order.push(`dispose-${n}`)
    }, `e${n}`)
  }
}
const nf = root.plugin(noisy)
await nf.await()
check('注册顺序', order, ['register-1', 'register-2', 'register-3'])
order.length = 0
await nf.dispose()
check('卸载顺序（逆序）', order, ['dispose-3', 'dispose-2', 'dispose-1'])

console.log('【E】父子插件：父卸载 → 子被递归卸载')
const nested = []
const child = (ctx) => {
  ctx.effect(() => {
    nested.push('child register')
    return () => nested.push('child dispose')
  })
}
const parent = (ctx) => {
  ctx.effect(() => {
    nested.push('parent register')
    return () => nested.push('parent dispose')
  })
  ctx.plugin(child)
}
const pf = root.plugin(parent)
await pf.await()
check('装载顺序：父先，子后', nested, ['parent register', 'child register'])
nested.length = 0
await pf.dispose()
check('卸载：子先被递归卸载', nested.includes('child dispose'), true)

console.log('【F】ctx.on 注册的监听器 = 自动成为 effect')
let hits = 0
const listenerPlugin = (ctx) => {
  ctx.on('ping', () => hits++)
}
const lf = root.plugin(listenerPlugin)
await lf.await()
root.emit('ping')
const afterMount = hits
await lf.dispose()
root.emit('ping')
check('卸载后监听器不再触发', [afterMount, hits], [1, 1])

console.log('【G】应用级收尾：root.fiber.dispose() 会卸载全部子插件')
// 预测 vs 实际（实测修正）：root 的 dispose 并不是"关掉应用"。
// fiber.ts:331 —— root fiber（runtime === null）的 dispose = () => this.restart()：
// 先 _unload() 掉所有子插件，再把自己重新加载回 ACTIVE。
await root.fiber.dispose()
check('root 收尾后又回到 ACTIVE（dispose 被实现为 restart）', st(root.fiber), 'ACTIVE')
check('ticker 实例 b 已卸载', st(b), 'DISPOSED')
check('子插件不会被 restart 重新创建（效果是一次性的）', root.registry.size, 0)
console.log('  → 想真正"关停"，要用子 fiber 的 dispose，或让进程退出；'
  + '这也解释了 launcher 为什么靠事件循环自然退出来结束运行')

console.log(failed === 0 ? '\n实验 2 全部通过 ✅  可逆性 = 卸载时把注册过的东西全部撤销' : `\n实验 2 有 ${failed} 条不符合预期 ❌`)
process.exit(failed === 0 ? 0 : 1)
