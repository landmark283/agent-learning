import { defineTool } from '@deepseek-ai/dsh-tools'
import { brandString } from '@deepseek-ai/dsh-brand'

export const name = 'greet-tool'
// 等工具注册表就绪才启动——这就是 DSH 里每个 dsh-tool-* 插件的开头三行
export const inject = ['tools']

/**
 * 把一个「模型可调用的工具」注册进 DSH 的 tools 服务。
 * 对照真实插件：dsh-tool-present/lib/index.js 的 apply 一模一样是
 *   ctx.tools.register(defineTool({ name, description, parameters, output, execute }))
 * 区别只在于那边多了权限、会话、FS 等生产级细节。
 */
export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: 'greet',
    description: 'Greet the named person.',
    parameters: {
      name: { type: 'string', required: true, description: 'Who to greet' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      return `Hello, ${args.name}!`
    },
  }))

  // 教程第 7 章的做法：自己扮演模型，把一次调用推进真实执行流水线
  void (async () => {
    const result = await ctx.tools.execute({
      callId: brandString('demo-1'),
      name: 'greet',
      arguments: { name: 'Cordis' },
      signal: new AbortController().signal,
    })
    console.log('tool replied:', JSON.stringify(result.content))
  })()
}
