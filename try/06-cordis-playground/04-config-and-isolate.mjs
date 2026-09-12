/**
 * W4·D5-7 · 实验 4：配置校验（schemastery）与服务隔离（isolate）
 *
 * 对应材料：
 *   - deepseek-harness/docs/cordis-tutorial/05-config.zh.md
 *   - 源码：cordis/src/fiber.ts:50 resolveConfig、context.ts:121 isolate
 *
 * 运行：D:\nvm\v22.19.0\node.exe 04-config-and-isolate.mjs
 */
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

let failed = 0
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failed++
  console.log(`${ok ? '  ✅' : '  ❌'} ${label}: ${JSON.stringify(actual)}${ok ? '' : ` （期望 ${JSON.stringify(expected)}）`}`)
}

console.log('【1】配置校验：配错了在 apply 之前就拦下')
const Config = z.object({
  message: z.string().default('默认消息'),
  times: z.number().default(1),
})
let applied = 0
// 注意赋值顺序：先把箭头函数绑到变量（name 自然为 'echo'），再挂 Config。
// 不要写 Object.assign(fn, { name: 'echo' }) —— 函数的 name 只读，会抛 TypeError。
const echo = (ctx, config) => {
  applied++
  console.log(`  apply 收到 config = ${JSON.stringify(config)}`)
}
echo.Config = Config

const root = new Context()

// 1a. 不传 config：走 schema 默认值
await root.plugin(echo)
check('缺省配置被补全', applied, 1)

// 1b. 传错类型：resolveConfig 抛 ValidationError，apply 不执行
const before = applied
let message = ''
try {
  await root.plugin(echo, { times: '不是数字' })
} catch (error) {
  message = error.message
}
check('错误配置没有进入 apply', applied, before)
check('抛出的错误类型名', message.startsWith('invalid config:'), true)
console.log('  错误原文：')
for (const line of message.split('\n')) console.log(`    ${line}`)
console.log('  → 这就是"明确报错"：不是静默用错值，而是指出哪个字段错了')

// 1c. 正常配置生效
await root.plugin(echo, { message: '你好', times: 3 }).then(() => {}, () => {})
console.log('')

console.log('【2】isolate：同名服务、不同实现，互不干扰')
class DbService extends Service {
  constructor(ctx, impl) {
    super(ctx, 'db')
    this.impl = impl
  }
  query() { return this.impl }
}
const seen = []
// 注意：读 ctx.db 必须声明 inject。不声明的话代理会直接抛
// `cannot get property "db" without inject`（reflect.ts:144）——
// 这是 fail-fast，而不是悄悄给你 undefined。
const user = (ctx) => {
  ctx.effect(() => {
    seen.push(ctx.db.query())
  })
}
user.inject = ['db']

const iso = new Context()
const scA = iso.isolate('db')
const scB = iso.isolate('db')
await scA.plugin(class extends DbService { constructor(ctx) { super(ctx, 'postgres') } })
await scB.plugin(class extends DbService { constructor(ctx) { super(ctx, 'sqlite') } })
await scA.plugin(user)
await scB.plugin(user)
check('两个作用域各读到自己的实现', seen.sort(), ['postgres', 'sqlite'])

console.log('【3】同一个 label = 同一个作用域（两个子上下文共享）')
const shared = Symbol('shared-db')
const sharedSeen = []
const s1 = iso.isolate('db', shared)
const s2 = iso.isolate('db', shared)
await s1.plugin(class extends DbService { constructor(ctx) { super(ctx, '共享库') } })
const sharedUser = (ctx) => {
  ctx.effect(() => {
    sharedSeen.push(ctx.db.query())
  })
}
sharedUser.inject = ['db']
await s2.plugin(sharedUser)
check('未在 s2 提供 db，却读到了 s1 的', sharedSeen, ['共享库'])
console.log('  → 想读一个"可有可无"的服务，别用 inject，用 ctx.get(\'db\') 探测（服务不存在时返回 undefined）')

console.log('【4】inject 之后依然跟踪依赖：提供者消失 → 消费者退回 PENDING')
const dep = new Context()
const STATE = ['PENDING', 'LOADING', 'ACTIVE', 'FAILED', 'DISPOSED', 'UNLOADING']
const consumer = (ctx) => {
  ctx.effect(() => {})
}
consumer.inject = ['db']
const cf = dep.plugin(consumer)
const pf = dep.plugin(class extends DbService { constructor(ctx) { super(ctx, 'x') } })
await pf
await cf.await()
check('提供者就位后变 ACTIVE', STATE[cf.state], 'ACTIVE')
await pf.dispose()
check('提供者被卸载后回到 PENDING（等待依赖回来）', STATE[cf.state], 'PENDING')

for (const ctx of [root, iso, dep]) await ctx.fiber.dispose()
console.log(failed === 0 ? '\n实验 4 全部通过 ✅' : `\n实验 4 有 ${failed} 条不符合预期 ❌`)
process.exit(failed === 0 ? 0 : 1)
