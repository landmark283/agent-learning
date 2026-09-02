# 学习teenycode
这个东西基本上就是一个最简的能够调用工具的agent。一定程度上，就是在我自己写的agent.js的基础上稍稍扩展了一下：
1. 使用ts编写，更加规范，有类型提示。
2. 规范了tools，使用zod来写tool，把tool的实际执行函数，与描述文本绑定在一起，统一加载，并且提供输入校验。解耦彻底，代码规范，便于修改。
3. 不再手写fetch，而是调openai库来进行client网络操作，可读性高。


## 修改
为了方便使用，我稍微修改了一下teenycode的源码。
### 支持使用其他模型（仅支持openai格式）
参考 '概念：相关包简介.md' 或 官方文档。
修改了创建client的代码。现在需要在根目录下的 .env 文件中提供以下环境变量：
'''
BASE_URL=https://api.deepseek.com
API_KEY=sk-...
MODEL=deepseek-v4-pro
'''