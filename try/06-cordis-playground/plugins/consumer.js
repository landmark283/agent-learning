export const name = 'consumer'
// inject 声明硬依赖：greeter 不可用时本插件保持 PENDING，apply 根本不会执行
export const inject = ['greeter']

export function apply(ctx) {
  ctx.logger('consumer').info(ctx.greeter.greet('world'))

  // 顺带演示：插件间还能用事件通信，不必经由共享服务
  ctx.on('greeter/hello', (who) => {
    ctx.logger('consumer').info(ctx.greeter.greet(who))
  })
}
