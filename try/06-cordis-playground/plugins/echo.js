import z from '@deepseek-ai/schemastery'

export const name = 'echo'

/**
 * 插件配置用 schemastery 声明（DSH 各包的 z.object(...) 就是它）。
 * 校验发生在 apply 之前（fiber.ts:50 resolveConfig）：
 * 配错了根本不会进入 apply，而是抛 ValidationError 并逐条列出问题。
 */
export const Config = z.object({
  message: z.string().default('（未配置 message）'),
  times: z.number().default(1),
})

export function apply(ctx, config) {
  for (let i = 0; i < config.times; i++) {
    ctx.logger('echo').info(config.message)
  }
}
