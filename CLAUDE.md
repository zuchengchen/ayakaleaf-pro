# CLAUDE.md

本仓库是 [ayaka-notes/ayakaleaf-pro](https://github.com/ayaka-notes/ayakaleaf-pro)（Overleaf CE + Pro 功能）的 fork，
需要在保留本地定制的同时持续同步上游。

## Remote

- `origin`：自己的 fork `zuchengchen/ayakaleaf-pro`，可推送。
- `upstream`：`ayaka-notes/ayakaleaf-pro`，只读（push URL 设为 `DISABLED`），**永远不要推送到上游**。
- 已开启 `rerere.enabled` / `rerere.autoupdate`，重复冲突会自动复用之前的解决方式。

## 分支规则

| 分支 | 用途 | 规则 |
|---|---|---|
| `server-pro` | 上游镜像 | 只做 fast-forward 到 `upstream/server-pro`，**禁止在上面提交** |
| `main` | 本地开发与部署主分支 | 所有本地定制都在这里；定期合并 `server-pro` |
| `feat/*` | 单个功能 | 从 `main` 拉出，完成后合回 `main` |
| `pr/*` | 准备贡献给上游的改动 | 从 `server-pro` 拉出，不得夹带本地私有改动 |

- 新工作默认在 `main` 或从 `main` 拉出的 `feat/*` 上进行；发现当前在 `server-pro` 上要改代码时，先切走。
- 同步上游使用 merge，不用 rebase（`main` 是部署分支，避免 force push）。

## 同步上游

```bash
bin/sync-upstream          # 快进 server-pro → 推到 origin → 合并进 main
```

合并后先跑相关测试，再 `git push origin main`。冲突处理：

- `yarn.lock`：不手工合并，取上游版本后 `yarn install` 重新生成。
- 其它文件：保留上游的改动意图，再把本地定制重新套上去；拿不准时询问用户。

## 减少与上游冲突的约定

- 新功能优先做成独立模块 `services/web/modules/<name>`，尽量不改核心文件。
- 配置走环境变量、`.env`、`docker-compose.override.yml`（均已在 `.gitignore`）或 settings override，不直接改上游默认配置。
- 必须改上游文件时，改动保持小而集中，并在旁边加 `LOCAL:` 注释，方便合并时定位。
- 不修改 `.github/workflows/*`（上游的镜像构建/同步任务）；fork 上不需要的 Actions 在 GitHub 设置里禁用。
- 对上游也有价值的修复，走 `pr/*` 分支提 PR 回上游，合并后本地差异随之消失。
