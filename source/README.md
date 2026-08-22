# source/ — 源码阅读区

这里用来 `git clone` 开源 Agent 项目进行阅读。

> ⚠️ 本文件夹被 `.gitignore` 忽略（除本文件外）：
> 克隆进来的项目自带 git，由它们自己管理，与父仓库互不干扰。

## 推荐阅读顺序（按代码量从少到多）

1. **[Aider](https://github.com/Aider-AI/aider)** —— 结对编程助手，率先提出 Repo Map；
2. **[OpenHands](https://github.com/All-Hands-AI/OpenHands)** —— 沙箱里运行的自主 Agent，SWE-bench 强队，架构透明；
3. 其它：Claude Code（不开源但可观察行为）、Cursor 相关生态。

## 用法示例

```bash
git clone --depth 1 https://github.com/Aider-AI/aider.git aider
```

克隆后用你习惯的方式读（IDE、`git log` 看演进、`git blame` 看设计决策）。

## 阅读日志建议

每读完一个项目，在 `00-入门笔记.md` 的"学习日志"或这里补一个 `.md` 小结：
- 它的循环长什么样？（几步、验证点在哪）
- 它的 system prompt 怎么写的？
- 它的工具 schema 如何设计？怎么防模型乱来？
- 如果让你重写，你会改什么？
