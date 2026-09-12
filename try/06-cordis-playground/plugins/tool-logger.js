// 这行裸导入只为引入 dsh-tools 的「声明合并」，让 'tools/result' 事件有类型。
// 纯 JS 运行时可省，但保留它能让你知道事件类型从哪来。
import '@deepseek-ai/dsh-tools'

export const name = 'tool-logger'
export const inject = ['tools']

/**
 * 一个「只观察、不参与」的插件：监听从 DSH 工具流水线里发出的 tools/result 事件。
 * 它和 greet-tool.js 互不认识——两者由注册表服务（tools）与事件连接起来。
 */
export function apply(ctx) {
  ctx.on('tools/result', (exec, result) => {
    const text = result.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('')
    console.log(`[tool-logger] ${exec.name} -> ${text}`)
  })
}
