# 🌌 极光 API (Aurora API Hub)

> 专为开发者、程序员与大学生打造的高可用 AI 算力水龙头与平价分发中枢。

---

## 💡 产品特色

1. **100% 兼容 OpenAI 官方规范**：
   - 支持任意第三方客户端（Cursor、VS Code、NextChat、Cherry Studio、ChatBox、沉浸式翻译等）；
   - 无缝支持 `/v1/chat/completions`、`/v1/models`、`/v1/images/generations`、`/v1/dashboard/billing/*`；
   - 满血流式打字机（SSE Stream）支持。

2. **按百万 Token 精准计费**：
   - 毫秒级根据实际消耗的 `usage.prompt_tokens` 与 `usage.completion_tokens` 计算扣费；
   - 彻底告别一刀切扣次，公平透明，杜绝大长文本薅羊毛。

3. **易支付商业闭环**：
   - 微信 / 支付宝个人免签扫码；
   - 5元、15元、29.9元算力包自由充值，付款后秒级出 Key 并自动充入。

4. **100% 隐私与上游安全隔离**：
   - 客户端与用户永远看不到底层真实上游阿福 API 与主 Key；
   - 内置多 Key 自动顺延故障转移；
   - 内置单 Key 频控防刷保护。

---

## 🚀 本地启动与运行

```bash
cd standalone-api-hub
npm install # 安装依赖
node server.js # 启动服务
```

- **开发者控制台 Web 页面**：http://localhost:3005
- **OpenAI 兼容 Base URL**：http://localhost:3005/v1
- **初始测试 Key**：`sk-aurora-demo-8888` (自带 200 万 Tokens)

---

## 📱 客户端配置示范 (以 Cursor 为例)

1. 打开 Cursor ➔ Settings ➔ Models；
2. 开启 **Override OpenAI Base URL**；
3. **Base URL**：`http://localhost:3005/v1` (线上换成您的公网域名)；
4. **API Key**：填入您的专属 Key（如 `sk-aurora-demo-8888`）；
5. 添加模型：`aurora-coder`；
6. 即可畅快享受全速代码编写与智能重构！

---

## 📖 架构白皮书与知识库索引

- **阿福 API 价格体系、代码天梯榜与加量不加价升级全景知识库**：
  👉 [docs/AFU_API_KNOWLEDGE_BASE.md](./docs/AFU_API_KNOWLEDGE_BASE.md)
- **系统完整产品设计、成本算账与商业闭环指南**：
  👉 [docs/AURORA_PRODUCT_DESIGN.md](./docs/AURORA_PRODUCT_DESIGN.md)
- **商业化交付与发卡核心痛点陈述（寻求外部建议）**：
  👉 [docs/PAYMENT_FULFILLMENT_PROBLEM.md](./docs/PAYMENT_FULFILLMENT_PROBLEM.md)

