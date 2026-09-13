# 学习cordis

## 主要内容

## 杂念
这里主要记录我对dsh和cordis学习过程当中的一些思考和理解。
另外，也是学习生产级代码怎样进行项目的管理，包括代码风格，框架设计，使用哪些开发工具等等。

### cordis的事件机制为什么要闭集
可以很容易发现，cordis传递信息的机制其实和游戏里面常见的msgManager是几乎一样的，就是一个表，on可以向表里面加入一个函数，emit会检查表里面有没有事件名称相同的，有的话就触发对应的函数，找不到就跳过。

#### 运行层
EventsService（vendor/cordis/src/events.ts:131）的全部状态就是一张字符串表：
```ts
_hooks: Record<keyof any, Hook[]> = {}
```
它的方法签名全是 (...args: any[])（emit 在 :194，on 在 :288）。它不认识任何具体的事件名。这一层就是 msgManager。

#### 类型层：框架给的是"机制"，不是"名单"。

events.ts:34-109 有独立的一段 declare module './context.ts'，把 6 个方法挂到 Context 上，每个都是这个形状：
```ts
emit<K extends keyof Events>(name: K, ...args: Parameters<Events[K]>): void
on<K extends keyof Events>(name: K, listener: Events[K], options?: boolean | EventOptions): () => boolean
```
而 Events 本体在 events.ts:329，Cordis 自己只填了 9 个 internal/* 事件（internal/plugin、internal/status、internal/config……）。

ctx.emit/ctx.on 的"完整类型"不是框架预置的，而是从 Events 这张表推导出来的。 K extends keyof Events 取名字，Parameters<Events[K]> 取参数，ReturnType<Events[K]> 取返回值。框架提供的是这个推导机制；名单必须由使用方填——因为 Cordis 是框架，它不可能知道你有哪些业务事件。

如此一来，如果你的某个插件emit了一个没有标注的事件名，那么在编译的时候ts就会报错，方便开发者快速定位到错误的地方。如果不增加这个类型检查的功能，那么开发者相对不容易发现这样的问题，因为msgManager找不到事件名称就会直接跳过这个事件。

#### waterfall 介绍
waterfall最大的特点，就是多个通过ctx.on('name',fun)注册的函数，可以只触发其中一部分。与之相对应的，emit会简单粗暴的直接全部触发。
waterfall 是实现拦截的模式。每个监听器都会收到参数和一个 `next()` continuation；它可以转换 `next()` 的返回值，也可以不调用 `next()` 就直接返回，从而短路链条的其余部分。Cordis 文档把后一种行为称为否决。
——来自官方文档

waterfall用于可组合的“处理管道”：当你需要对一个数据或决策进行层层加工、拦截或修改时，waterfall 就派上用场了。它允许你写出像 “权限检查 → 限流 → 日志 → 实际业务逻辑” 这样的处理链，每一层都可以选择继续、修改结果或中断流程。
```js
ctx.on(name,onfun)                //注册监听函数

ctx.emit(name)                  //调用监听函数
ctx.waterfall(name, input, fun) //这里fun是一个async函数
//如果这个事件没有onfun注册
//ctx.waterfall(name, input, fun) 就等价于 fun(input)
```
具体介绍一下waterfall当中的各个参数：
name，同emit当中的name，是要触发的事件名称。
input，是将要传给onfun的参数。
fun，是所有onfun执行结束后会调用的默认函数（如果这个事件没有onfun注册，那么waterfall将会直接调用fun）

示例代码：
```js
import type { Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Events {
    'demo/transform'(input: string, next: () => Promise<string>): Promise<string>
  }
}

export const name = 'waterfall-demo'

export function apply(ctx: Context) {
  // Listener 1: wrap the downstream result.
  ctx.on('demo/transform', async (input, next) => {
    const downstream = await next()
    return downstream.toUpperCase()
  })

  // Listener 2: short-circuit when it owns the decision.
  ctx.on('demo/transform', async (input, next) => {
    if (input.includes('blocked')) return '** blocked **'
    return next()
  })

  void (async () => {
    console.log(await ctx.waterfall('demo/transform', 'world', async () => 'hello world!'))    //1
    console.log(await ctx.waterfall('demo/transform', 'blocked', async () => 'blocked words')) //2
  })()

//   1实际调用过程就是：
// 'world'传给Listener 1，Listener 1 调用next(), 
// 把input传到 Listener 2 ，Listener 2接着调用next()，此时没有下一个注册好的Listener函数了，
// 于是调用默认函数async () => 'hello world!'，返回'hello world!'，
// 最后返回'hello world!'.toUpperCase()，也就是'HELLO WORLD!'

// 2实际调用过程就是，'blocked'是input，传给Listener 1，
// Listener 1 调用next(), 把input传到 Listener 2 ，
// Listener 2发现input.includes('blocked')返回true，直接返回'** blocked **'，
// 最后返回'** blocked **'.toUpperCase()，也就是 '** blocked **'
// 注意这个过程没有调用我们传入的async () => 'blocked words'))，也就是next传递链条是可以切断的。
}
```