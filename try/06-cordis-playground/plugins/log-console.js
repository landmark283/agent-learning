import { Logger } from '@deepseek-ai/cordis'

export const name = 'log-console'

/**
 * 把日志接到控制台。
 *
 * 这个插件存在的唯一理由，是证明一句反直觉的话：
 * **连"日志输出到哪"都是一根可插拔的插件**。
 * cordis 自带的 exporter 只把日志写进内存环形缓冲（logger.ts:195 bufferSize = 1000），
 * 控制台导出器是独立包 cordis-plugin-logger-console。
 *
 * 另一个细节：日志是**结构化记录**（Message），printf 风格的格式化由导出器负责
 * （logger.ts:99 Logger.format）。所以自己写导出器时别忘了调它，
 * 否则会看到 `%s plugin %C` 这种没被替换的原始格式串。
 */
export function apply(ctx) {
  // ctx.logger.exporter() 本身是一次 effect：本插件卸载时导出器自动消失
  ctx.logger.exporter({
    colors: false,
    export(message) {
      console.log(Logger.format(this, message))
    },
  })
}
