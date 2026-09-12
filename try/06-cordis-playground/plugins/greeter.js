import { Service } from '@deepseek-ai/cordis'

export const name = 'greeter'

/**
 * Service：一个具名能力，注册到 ctx 上供别的插件消费。
 * `super(ctx, 'greeter')` 是运行时注册；卸载时自动注销。
 */
class GreeterService extends Service {
  constructor(ctx) {
    super(ctx, 'greeter')
    ctx.logger('greeter').info('服务已注册')
  }

  greet(who) {
    return `Hello, ${who}!`
  }
}

export function apply(ctx) {
  // Service 子类本身就是"类形态插件"
  ctx.plugin(GreeterService)
}
