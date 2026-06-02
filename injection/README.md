# 规则注入数据源

构建 zashboard 时会从此目录（或上级 `mih/` 目录）读取以下文件，在「更新代理提供商」时注入到主配置 `rules:` 段：

- `Clash配置.yaml` — 主配置模板
- `rule_providers/userProxy.yaml` — 追加 `,代理`（无策略时）
- `rule_providers/AWAvenue-Ads-Rule-Clash.yaml` — 追加 `,REJECT`（无策略时）

修改这些文件后：

- **开发**：`pnpm dev` 会自动热重载
- **生产 / GitHub Actions**：需重新 `pnpm build`

可将 `mih/` 下的同名文件复制到本目录以保持同步。主配置可能含敏感信息，提交前请自行检查。
