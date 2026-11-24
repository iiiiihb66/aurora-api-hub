# 极光 API (aurora-api-hub) 凭证与本地恢复指引

> [!IMPORTANT]
> 本仓库（即使是 GitHub 私有仓库）**严禁提交任何明文 `.env`、API Key 或运营数据库**。
> 真实凭证已统一归档至本机凭证保险箱，并在个人第二大脑登记。

## 1. 缺失的私密文件与环境变量清单

恢复本地运行或重新部署前，需准备 `.env`（以及可选的本地历史数据备份 `data/api-db.json`），包含以下环境变量名：

- `PORT`
- `AFU_API_BASE`
- `AFU_KEY_DISCOUNT`
- `AFU_KEY_LOW`
- `AFU_KEY_SPECIAL`
- `AFU_KEY_DOMESTIC`
- `AFU_KEY_DEFAULT`
- `AFU_API_KEY`
- `IMAGE_API_BASE`
- `IMAGE_API_KEY`
- `GEMIAUDE_KEY_KIRO`
- `GEMIAUDE_KEY_GROK`
- `AFDIAN_URL`
- `AFDIAN_USER_ID`
- `AFDIAN_TOKEN`

## 2. 去哪里找回这些文件

1. **本机凭证保险箱**：`~/.secrets/projects/aurora-api-hub/`（含 `.env` 与 `data-api-db.backup.json`）
2. **跨项目公用 AI 密钥**：`~/.secrets/ai-providers.env`
3. **跨设备/遗忘查询（第二大脑）**：查看 `iiiiihb66/second-brain` 中的 `项目规范/项目归档与凭证台账.md` 与 `项目规范/API资源与计费逻辑.md`。

## 3. 一键恢复命令

```bash
git clone -b wip/2026-11-pause https://github.com/iiiiihb66/aurora-api-hub.git
cd aurora-api-hub
cp ~/.secrets/projects/aurora-api-hub/.env .env
# 如需恢复本地临时数据备份：
# cp ~/.secrets/projects/aurora-api-hub/data-api-db.backup.json data/api-db.json
npm install
```
