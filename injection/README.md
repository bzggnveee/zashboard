# 规则注入数据源

构建 zashboard 时会从此目录（或上级 `mih/` 目录）读取以下文件，在「更新代理提供商」时注入到主配置 `rules:` 段：

- `Clash配置.yaml` — 主配置模板
- `rule_providers/userProxy.yaml` — 追加 `,代理`（无策略时）
- `rule_providers/AWAvenue-Ads-Rule-Clash.yaml` — 追加 `,REJECT`（无策略时）

修改这些文件后：

- **开发**：`pnpm dev` 会自动热重载
- **生产 / GitHub Actions**：需重新 `pnpm build`

可将 `mih/` 下的同名文件复制到本目录以保持同步。主配置可能含敏感信息，提交前请自行检查。

## 磁盘上的 Clash配置.yaml

mihomo 的 `PUT /configs` **只更新内存**，不会自动改磁盘上的主配置。注入成功后：

- **设置 → 后端 → 规则注入**：填写主配置绝对路径；用 `pnpm dev` 打开面板时可写回磁盘。
- **从 mihomo 内置 UI 打开面板**：会下载 `Clash配置-injected.yaml`，请覆盖保存到主配置，再重载。
- **命令行写盘**：在 `zashboard` 目录执行 `pnpm persist-injection`（默认写入 `../Clash配置.yaml`）。

注入标记在 YAML 中为 `# >>> zashboard auto-injected rules`，在规则页的 `DOMAIN` 列表中可搜索 `httpdns.bilivideo.com` 验证。
