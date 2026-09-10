import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { verifyOrder, verifyMbdOrder, verifyAfdianOrder } from './services/payment_verifier.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.join(__dirname, '.env') })

const PORT = Number(process.env.PORT || 3005)
const DB_FILE = path.join(__dirname, 'data', 'api-db.json')

// 保证数据库文件存在
function ensureDb() {
  const dir = path.dirname(DB_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(
      DB_FILE,
      JSON.stringify(
        {
          cards: {
            'sk-aurora-demo-8888': {
              code: 'sk-aurora-demo-8888',
              status: 'ACTIVE',
              totalTokens: 2000000,
              remainingTokens: 2000000,
              usedTokens: 0,
              remark: '首发体验密钥 (200万 Tokens)',
              createdAt: new Date().toISOString(),
            },
          },
          orders: {},
        },
        null,
        2
      )
    )
  }
}

function readDb() {
  ensureDb()
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'))
  } catch (err) {
    console.error('读取数据库异常:', err)
    return { cards: {}, orders: {} }
  }
}

function writeDb(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2))
}

// 智能分层上游密钥池配置 (阿福分组精确定向)
const TIER_KEYS = {
  // 海外特惠 (0.08x)
  discount: (process.env.AFU_KEY_DISCOUNT || '').split(',').map((k) => k.trim()).filter(Boolean),
  // 海外低价 (0.12x)
  low: (process.env.AFU_KEY_LOW || '').split(',').map((k) => k.trim()).filter(Boolean),
  // 海外特价 (0.20x)
  special: (process.env.AFU_KEY_SPECIAL || '').split(',').map((k) => k.trim()).filter(Boolean),
  // 国产特价 (0.50x)
  domestic: (process.env.AFU_KEY_DOMESTIC || '').split(',').map((k) => k.trim()).filter(Boolean),
  // 默认保底 (1.00x)
  default: (process.env.AFU_KEY_DEFAULT || process.env.AFU_API_KEY || '').split(',').map((k) => k.trim()).filter(Boolean),
}

// 侦测请求体中是否包含图片 (多模态视觉意图识别)
function hasImageContent(messages = []) {
  if (!Array.isArray(messages)) return false
  for (const msg of messages) {
    if (!msg || !msg.content) continue
    if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part && (part.type === 'image_url' || part.image_url || part.type === 'image')) {
          return true
        }
      }
    } else if (typeof msg.content === 'string') {
      if (msg.content.includes('data:image/') || (msg.content.includes('http') && /\.(jpg|jpeg|png|webp|gif)/i.test(msg.content))) {
        // 轻量视觉探测
      }
    }
  }
  return false
}

// 智能路由调度器：根据用户请求模型与是否包含图片，精准分配最佳上游模型与对应最低倍率的分组 Key
function routeUpstreamTarget(reqModel = '', messages = []) {
  const isImage = hasImageContent(messages)
  const low = (reqModel || '').toLowerCase().trim()

  // 1. 如果用户传了图片，但选的模型是纯文本模型：无感自动升配至支持多模态的视觉通道！
  if (isImage) {
    const isVisionCapable =
      low.includes('gemini') ||
      low.includes('gpt-4o') ||
      low.includes('gpt-5') ||
      low.includes('gpt-6') ||
      low.includes('claude-3') ||
      low.includes('claude-sonnet') ||
      low.includes('claude-opus')

    if (!isVisionCapable) {
      console.log(`[智能视觉升配] 检测到图片输入，原模型【${reqModel}】自动升配为【gemini-3.7-flash】视觉通道`)
      return {
        upstreamModel: 'gemini-3.7-flash',
        keyGroup: 'default',
        tokenMultiplier: 1.5,
        routedNote: '自动升配多模态视觉 (default)',
      }
    }
  }

  // 2. GPT-6 / GPT-5 系列 ➔ 优选【海外特惠组 (0.08x)】，阿福扣费超低，我们收取 2.0x~3.0x，产生 25~37 倍暴利！
  if (low.includes('gpt-6') || low.includes('astra')) {
    return {
      upstreamModel: 'gpt-6-astra',
      keyGroup: 'discount',
      tokenMultiplier: 3.0,
      routedNote: 'GPT-6 旗舰工程 (海外特惠 0.08x)',
    }
  }

  if (low.includes('gpt-5') || low.includes('5.6') || low.includes('5.5') || low.includes('pro')) {
    return {
      upstreamModel: 'gpt-5.5',
      keyGroup: 'discount',
      tokenMultiplier: 2.0,
      routedNote: 'GPT-5.5 旗舰思考 (海外特惠 0.08x)',
    }
  }

  // 3. Claude 全系 ➔ 优选【海外特价组 (0.20x)】，专跑 Claude 3.5 Sonnet / Opus
  if (low.includes('claude')) {
    let target = 'claude-sonnet-4-6'
    if (low.includes('opus')) target = 'claude-opus-4-7'
    return {
      upstreamModel: target,
      keyGroup: 'special',
      tokenMultiplier: 2.0,
      routedNote: 'Claude 3.5 Sonnet (海外特价 0.20x)',
    }
  }

  // 4. 国产特价模型 ➔ 优选【国产特价组 (0.50x)】与豆包
  if (low.includes('doubao') || low.includes('seed')) {
    return {
      upstreamModel: 'doubao-seed-2-0-pro-260215',
      keyGroup: 'domestic',
      tokenMultiplier: 1.0,
      routedNote: '豆包中文特调 (国产特价 0.50x)',
    }
  }

  if (low.includes('deepseek')) {
    return {
      upstreamModel: 'doubao-seed-2-0-pro-260215',
      keyGroup: 'domestic',
      tokenMultiplier: 1.0,
      routedNote: 'DeepSeek 高可用兼容通道 (国产特价 0.50x)',
    }
  }

  // 5. 经典兼容别名 (gpt-4o / gpt-4o-mini / aurora-coder / aurora-chat)
  // 如果是编程/对话，打特惠组 gpt-5.5 或 default 组
  if (low.includes('coder') || low.includes('gpt-4o') || low.includes('chat')) {
    return {
      upstreamModel: 'gpt-5.5',
      keyGroup: 'discount',
      tokenMultiplier: 1.0,
      routedNote: '极光编程与全栈专线 (特惠组 0.08x)',
    }
  }

  // 6. 兜底回退
  return {
    upstreamModel: 'gpt-5.5',
    keyGroup: 'discount',
    tokenMultiplier: 1.0,
    routedNote: '全局特惠保底通道 (0.08x)',
  }
}

// 多层轮询故障转移引擎：优先使用对应低价分组，故障时自动无缝降级到 default 组保底
async function fetchAfuWithTieredRouting(url, options = {}, preferredGroup = 'default') {
  // 构建尝试优先级队列
  const candidateKeys = [
    ...(TIER_KEYS[preferredGroup] || []),
    ...(preferredGroup !== 'default' ? TIER_KEYS.default || [] : []),
  ]

  let lastError = null
  for (let i = 0; i < candidateKeys.length; i++) {
    const currentKey = candidateKeys[i]
    try {
      const headers = {
        ...(options.headers || {}),
        Authorization: `Bearer ${currentKey}`,
      }
      const res = await fetch(url, { ...options, headers })

      if (!res.ok) {
        const cloned = res.clone()
        const errText = await cloned.text()
        const isQuotaOrAuth =
          res.status === 401 ||
          res.status === 429 ||
          res.status === 403 ||
          errText.includes('quota') ||
          errText.includes('insufficient') ||
          errText.includes('balance')

        if (isQuotaOrAuth && i < candidateKeys.length - 1) {
          console.warn(`[智能路由] 分组 Key #${i + 1} 额度不足或受限，顺延切换至备用 Key #${i + 2}...`)
          lastError = new Error(`Key #${i + 1} 额度不足: ${errText}`)
          continue
        }
      }

      return res
    } catch (err) {
      console.warn(`[智能路由] Key #${i + 1} 网络异常:`, err.message)
      lastError = err
      if (i < candidateKeys.length - 1) continue
    }
  }

  throw lastError || new Error('所有配置的分组 API Key 均不可用')
}

// 内存频控限流
const rateLimitMap = new Map()
function checkRateLimit(token, maxPerMinute = 80) {
  const now = Date.now()
  const record = rateLimitMap.get(token) || { count: 0, resetAt: now + 60000 }
  if (now > record.resetAt) {
    record.count = 1
    record.resetAt = now + 60000
    rateLimitMap.set(token, record)
    return { ok: true, remaining: maxPerMinute - 1 }
  }
  if (record.count >= maxPerMinute) {
    return { ok: false, retryAfter: Math.ceil((record.resetAt - now) / 1000) }
  }
  record.count += 1
  rateLimitMap.set(token, record)
  return { ok: true, remaining: maxPerMinute - record.count }
}

// 精选模型矩阵
const AURORA_MODELS = [
  {
    id: 'aurora-coder',
    name: '极光·全栈编程与算法大师',
    desc: 'Python、TS、Vue/React、Cursor/VSCode 编程专线 (实测高可用)',
    category: '代码大模型',
    upstreamModel: 'gemini-3.7-flash',
    tokenMultiplier: 1.0, // 1倍 Token 计费
  },
  {
    id: 'aurora-chat',
    name: '极光·极速通用智能助手',
    desc: '日常问答、长文写作、翻译润色、知识问答',
    category: '通用大模型',
    upstreamModel: 'gemini-3.7-flash',
    tokenMultiplier: 1.0,
  },
  {
    id: 'aurora-deepseek',
    name: '极光·超能逻辑推理专家',
    desc: '数理逻辑证明、复杂算法分析、深度推演',
    category: '深度推理模型',
    upstreamModel: 'gemini-3.8-flash',
    tokenMultiplier: 1.2,
  },
  {
    id: 'aurora-doubao',
    name: '极光·豆包中文爆款特调',
    desc: '爆款网感文案、短视频脚本、地道中文创作',
    category: '中文特调模型',
    upstreamModel: 'doubao-seed-2-0-pro-260215',
    tokenMultiplier: 1.0,
  },
  {
    id: 'aurora-pro',
    name: '极光·旗舰思考与超级决策',
    desc: '超长上下文感知、跨领域顶尖多模态推理',
    category: '顶配思考模型',
    upstreamModel: 'gpt-5.2',
    tokenMultiplier: 2.0,
  },
  {
    id: 'aurora-claude',
    name: '极光·Claude 商业文学专家',
    desc: '顶级行文质感、专业商业策划、长篇巨著创作',
    category: '商业文学模型',
    upstreamModel: 'claude-sonnet-4-6',
    tokenMultiplier: 2.5,
  },
  {
    id: 'aurora-image',
    name: '极光·超清商业绘画引擎',
    desc: 'OpenAI 商业级视觉生成 (/v1/images/generations)',
    category: 'AI 绘画生成',
    upstreamModel: 'gpt-image-2',
    tokenMultiplier: 1.0,
  },

  // 主流第三方兼容别名
  {
    id: 'gpt-4o',
    name: 'GPT-4o (兼容通道)',
    desc: '无感兼容第三方预设 gpt-4o',
    category: 'OpenAI 兼容',
    upstreamModel: 'gemini-3.7-flash',
    tokenMultiplier: 1.0,
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini (兼容通道)',
    desc: '无感兼容轻量级预设',
    category: 'OpenAI 兼容',
    upstreamModel: 'gemini-3.7-flash',
    tokenMultiplier: 1.0,
  },
  {
    id: 'deepseek-chat',
    name: 'DeepSeek-Chat (标准通道)',
    desc: '兼容 DeepSeek V3 协议',
    category: 'DeepSeek 兼容',
    upstreamModel: 'gemini-3.8-flash',
    tokenMultiplier: 1.0,
  },
  {
    id: 'deepseek-reasoner',
    name: 'DeepSeek-Reasoner (深度推理)',
    desc: '兼容 DeepSeek R1 满血推理协议',
    category: 'DeepSeek 兼容',
    upstreamModel: 'gemini-3.8-flash',
    tokenMultiplier: 1.2,
  },
  {
    id: 'claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet (兼容通道)',
    desc: '兼容 Claude 官方客户端预设',
    category: 'Claude 兼容',
    upstreamModel: 'claude-sonnet-4-6',
    tokenMultiplier: 2.5,
  },
  {
    id: 'dall-e-3',
    name: 'DALL·E 3 (生图兼容通道)',
    desc: '兼容标准 OpenAI 生图接口',
    category: 'AI 绘画生成',
    upstreamModel: 'gpt-image-2',
    tokenMultiplier: 1.0,
  },
]

function resolveModel(reqModel) {
  if (!reqModel) return AURORA_MODELS[0]
  const exact = AURORA_MODELS.find((m) => m.id.toLowerCase() === reqModel.toLowerCase())
  if (exact) return exact

  const low = reqModel.toLowerCase()
  if (low.includes('deepseek')) {
    return { id: reqModel, upstreamModel: 'gemini-3.8-flash', tokenMultiplier: 1.2, name: reqModel }
  }
  if (low.includes('claude')) {
    return { id: reqModel, upstreamModel: 'claude-sonnet-4-6', tokenMultiplier: 2.5, name: reqModel }
  }
  if (low.includes('doubao')) {
    return { id: reqModel, upstreamModel: 'doubao-seed-2-0-pro-260215', tokenMultiplier: 1.0, name: reqModel }
  }
  if (low.includes('pro') || low.includes('5.2')) {
    return { id: reqModel, upstreamModel: 'gpt-5.2', tokenMultiplier: 2.0, name: reqModel }
  }
  if (low.includes('dall') || low.includes('image')) {
    return { id: reqModel, upstreamModel: 'gpt-image-2', tokenMultiplier: 1.0, name: reqModel }
  }

  return { id: reqModel, upstreamModel: reqModel, tokenMultiplier: 1.0, name: reqModel }
}

// 充值算力套餐配置 (支持绑定爱发电/面包多商品直达链接)
const AFDIAN_HOME = process.env.AFDIAN_URL || 'https://afdian.com/a/aurora_api'

const TOKEN_PACKAGES = [
  {
    id: 'pkg_test',
    name: '🧪 1元极速联调包',
    price: 1.0,
    tokens: 300000, // 30万 Tokens
    desc: '仅供联调验证支付与发卡链路 · 扫码 1 元即刻体验',
    tag: '联调测试',
    payUrl: process.env.PAY_URL_TEST || 'https://mbd.pub/o/bread/mbd-YZaVlJtrag==',
  },
  {
    id: 'pkg_trial',
    name: '🚀 极客体验包',
    price: 5.0,
    tokens: 2000000, // 200万 Tokens
    desc: '约折合 200 万 Tokens · 适合个人轻量代码与对话尝鲜',
    tag: '入门尝鲜',
    payUrl: process.env.PAY_URL_TRIAL || 'https://afdian.com/order/create?plan_id=cfd2eac0acc111f1bf675254001e7c00&product_type=0',
  },
  {
    id: 'pkg_standard',
    name: '🔥 主力畅享包',
    price: 15.0,
    tokens: 7000000, // 700万 Tokens
    desc: '约折合 700 万 Tokens · 适合重度编程、论文与日常主力',
    tag: '热销推荐',
    highlight: true,
    payUrl: process.env.PAY_URL_STANDARD || 'https://afdian.com/order/create?plan_id=d46f4952acc111f1a22652540025c377&product_type=0',
  },
  {
    id: 'pkg_pro',
    name: '⚡ 极客狂飙包',
    price: 29.9,
    tokens: 16000000, // 1600万 Tokens
    desc: '约折合 1600 万 Tokens · 程序员 Cursor 深度重构专享',
    tag: '超高性价比',
    payUrl: process.env.PAY_URL_PRO || 'https://afdian.com/order/create?plan_id=d5438910acc111f1ba6852540025c377&product_type=0',
  },
  {
    id: 'pkg_team',
    name: '👑 团队尊享包',
    price: 69.9,
    tokens: 42000000, // 4200万 Tokens
    desc: '约折合 4200 万 Tokens · 小团队/工作室多端共享无忧',
    tag: '团队无忧',
    payUrl: process.env.PAY_URL_TEAM || 'https://afdian.com/order/create?plan_id=d628e1c2acc111f1a90052540025c377&product_type=0',
  },
]

// 智能根据金额或爱发电方案 ID 匹配对应套餐
function matchPackageByAmountOrPlan(amountYuan, planId = '') {
  const priceNum = parseFloat(amountYuan)
  if (planId) {
    const pkgByPlan = TOKEN_PACKAGES.find((p) => (p.payUrl || '').includes(planId))
    if (pkgByPlan) return pkgByPlan
  }
  if (!isNaN(priceNum)) {
    const pkgByPrice = TOKEN_PACKAGES.find((p) => Math.abs(p.price - priceNum) < 0.1)
    if (pkgByPrice) return pkgByPrice
  }
  return TOKEN_PACKAGES[0]
}

// 初始化 Express 实例
const app = express()
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    exposedHeaders: ['X-Remaining-Tokens', 'X-Consumed-Tokens', 'X-Remaining-Credits'],
  })
)
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// 全局请求调试日志
app.use((req, res, next) => {
  console.log(`[HTTP Request] ${req.method} ${req.url}`)
  next()
})

app.use(express.static(path.join(__dirname, 'public')))

// ----------------------------------------------------
// 1. OpenAI 官方规范兼容接口群
// ----------------------------------------------------

// 获取模型列表
app.get('/v1/models', (_req, res) => {
  res.json({
    object: 'list',
    data: AURORA_MODELS.map((m) => ({
      id: m.id,
      object: 'model',
      created: 1700000000,
      owned_by: 'aurora-api',
      permission: [],
      root: m.id,
      parent: null,
      description: m.desc,
      category: m.category,
      tokenMultiplier: m.tokenMultiplier,
    })),
  })
})

// 单个模型详情
app.get('/v1/models/:model', (req, res) => {
  const m = resolveModel(req.params.model)
  res.json({
    id: m.id,
    object: 'model',
    created: 1700000000,
    owned_by: 'aurora-api',
    permission: [],
    root: m.id,
    parent: null,
    description: m.desc || m.name,
    tokenMultiplier: m.tokenMultiplier || 1.0,
  })
})

// 客户端订阅余额查询
app.get('/v1/dashboard/billing/subscription', (req, res) => {
  const db = readDb()
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim()
  const card = db.cards[token]

  if (!card) {
    return res.status(401).json({ error: { message: 'Invalid API Key', code: 'invalid_api_key' } })
  }

  const remainingTokens = card.remainingTokens ?? (card.remainingCredits ? card.remainingCredits * 20000 : 0)
  const totalTokens = card.totalTokens ?? (card.totalCredits ? card.totalCredits * 20000 : 0)

  // 100万 Tokens 换算为 5 USD/CNY 展示
  const limitUsd = Number((totalTokens / 200000).toFixed(2))
  const remainingUsd = Number((remainingTokens / 200000).toFixed(2))

  res.setHeader('X-Remaining-Tokens', remainingTokens)
  res.json({
    object: 'billing_subscription',
    has_payment_method: true,
    canceled: false,
    currency: 'CNY',
    system_hard_limit_usd: limitUsd,
    hard_limit_usd: limitUsd,
    soft_limit_usd: remainingUsd,
    account_name: `极光开发者 (${card.code})`,
    plan: { title: '极光 AI 算力专线', id: 'aurora-standard' },
    access_until: 1893456000,
  })
})

app.get('/v1/dashboard/billing/usage', (req, res) => {
  const db = readDb()
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim()
  const card = db.cards[token]
  const used = card ? (card.usedTokens || 0) : 0
  res.json({ object: 'list', total_usage: Math.round(used / 1000) })
})

// 极简余额查询
app.get('/v1/user/balance', (req, res) => {
  const db = readDb()
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim() || req.query.key || ''
  const card = db.cards[token]

  if (!card) {
    return res.status(401).json({ ok: false, error: { message: 'Key 无效或未提供' } })
  }

  const remainingTokens = card.remainingTokens ?? (card.remainingCredits ? card.remainingCredits * 20000 : 0)
  res.setHeader('X-Remaining-Tokens', remainingTokens)
  res.json({
    ok: true,
    code: card.code,
    status: card.status,
    remainingTokens,
    totalTokens: card.totalTokens || remainingTokens,
    usedTokens: card.usedTokens || 0,
    remark: card.remark || '极光专属算力密钥',
  })
})

// 核心对话与代码生成接口 (按实际 Token 扣费)
// 统一 OpenAI 官方错误结构输出
function sendOpenAIError(res, status, message, type = 'invalid_request_error', code = null) {
  return res.status(status).json({
    error: {
      message,
      type,
      param: null,
      code,
    },
  })
}

// 根健康探针
app.get('/v1', (_req, res) => {
  res.json({
    status: 'healthy',
    gateway: 'Aurora API Hub',
    protocol: 'OpenAI Compatibility Layer v1.0',
    endpoints: [
      '/v1/chat/completions',
      '/v1/models',
      '/v1/models/:model',
      '/v1/images/generations',
      '/v1/dashboard/billing/subscription',
      '/v1/dashboard/billing/usage',
      '/v1/user/balance',
    ],
  })
})

// 核心对话与代码生成接口 (按实际 Token 扣费，100% 原生透传 OpenAI 全参数)
app.post('/v1/chat/completions', async (req, res) => {
  const db = readDb()
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim()

  if (!token) {
    return sendOpenAIError(res, 401, '未提供 API Key！请将您的极光密钥作为 Bearer Token 填入 Authorization 请求头。', 'invalid_request_error', 'missing_api_key')
  }

  const card = db.cards[token]
  if (!card) {
    return sendOpenAIError(res, 401, `API Key【${token}】无效或不存在，请检查后重试。`, 'invalid_request_error', 'invalid_api_key')
  }
  if (card.status !== 'ACTIVE') {
    return sendOpenAIError(res, 403, '该 API Key 处于冻结停用状态，请联系管理员或重新充值。', 'permission_error', 'key_disabled')
  }

  const remainingTokens = card.remainingTokens ?? (card.remainingCredits ? card.remainingCredits * 20000 : 0)
  if (remainingTokens <= 0) {
    return sendOpenAIError(res, 402, '您的算力 Tokens 已用尽！请前往极光平台充值算力包。', 'insufficient_quota', 'quota_exhausted')
  }

  const rate = checkRateLimit(token, 80)
  if (!rate.ok) {
    return sendOpenAIError(res, 429, `请求频次过高触发防刷保护，请在 ${rate.retryAfter} 秒后再发起。`, 'rate_limit_error', 'rate_limit_exceeded')
  }

  // 100% 完整支持所有 OpenAI 原生请求体参数 (tools, functions, max_tokens, json_object, etc.)
  const { model = 'aurora-coder', stream = false, messages = [], ...restParams } = req.body || {}

  // 🚀 核心智能路由：自动根据请求模型 + 是否传图片，精准分流至阿福最低成本分组 Key！
  const route = routeUpstreamTarget(model, messages)
  const afuBase = process.env.AFU_API_BASE || 'https://api.afugpt.cn/v1'

  const upstreamPayload = {
    ...restParams,
    messages,
    model: route.upstreamModel,
    stream,
  }

  try {
    const upstreamResp = await fetchAfuWithTieredRouting(
      `${afuBase}/chat/completions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(upstreamPayload),
      },
      route.keyGroup
    )

    if (!upstreamResp.ok) {
      const errText = await upstreamResp.text()
      try {
        const parsed = JSON.parse(errText)
        return res.status(upstreamResp.status).json(parsed)
      } catch {
        return sendOpenAIError(res, upstreamResp.status, `上游响应错误: ${errText}`, 'upstream_error', 'upstream_failed')
      }
    }

    if (stream) {
      // 流式 SSE 输出
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      res.setHeader('X-Accel-Buffering', 'no')

      let streamEstimatedTokens = 0
      let emittedChars = 0

      if (upstreamResp.body) {
        const { Readable } = await import('stream')
        const nodeStream = Readable.fromWeb(upstreamResp.body)

        nodeStream.on('data', (chunk) => {
          const text = chunk.toString()
          emittedChars += text.length

          // 尝试读取包含 usage 的 chunk
          if (text.includes('"usage":')) {
            try {
              const match = text.match(/"total_tokens":\s*(\d+)/)
              if (match && match[1]) streamEstimatedTokens = parseInt(match[1], 10)
            } catch {}
          }

          // 替换 chunk 中的真实模型名，对客户端做 100% 品牌脱敏
          if (text.includes(`"model":"${route.upstreamModel}"`)) {
            const maskedText = text.replaceAll(`"model":"${route.upstreamModel}"`, `"model":"${model}"`)
            res.write(maskedText)
          } else {
            res.write(chunk)
          }
        })

        nodeStream.on('end', () => {
          // 若上游流未返回 usage，根据吐字字数 + 基础 prompt 精准估算
          if (streamEstimatedTokens <= 0) {
            streamEstimatedTokens = Math.max(100, Math.round(emittedChars / 3.0) + 120)
          }

          const finalCostTokens = Math.round(streamEstimatedTokens * (route.tokenMultiplier || 1.0))
          card.remainingTokens = Math.max(0, (card.remainingTokens || 0) - finalCostTokens)
          card.usedTokens = (card.usedTokens || 0) + finalCostTokens
          writeDb(db)
          console.log(`[极光API] Key ${card.code} 流式调用 ${model} (${route.routedNote}) 扣除 ${finalCostTokens} Tokens，剩余 ${card.remainingTokens}`)
          res.end()
        })

        nodeStream.on('error', (err) => {
          console.error('[流式传输异常]:', err)
          if (!res.headersSent) {
            sendOpenAIError(res, 500, `流式传输中断: ${err.message}`, 'stream_error', 'stream_broken')
          }
        })
      } else {
        res.end()
      }
    } else {
      // 非流式响应：精准读取 usage.total_tokens
      const data = await upstreamResp.json()
      const actualTokens = data?.usage?.total_tokens || 500
      const finalCostTokens = Math.round(actualTokens * (route.tokenMultiplier || 1.0))

      card.remainingTokens = Math.max(0, (card.remainingTokens || 0) - finalCostTokens)
      card.usedTokens = (card.usedTokens || 0) + finalCostTokens
      writeDb(db)

      if (data && data.model) data.model = model // 100% 隐藏真实上游
      res.setHeader('X-Remaining-Tokens', card.remainingTokens)
      res.setHeader('X-Consumed-Tokens', finalCostTokens)
      res.json(data)
    }
  } catch (err) {
    console.error('[极光网关异常]:', err)
    return sendOpenAIError(res, 500, `网关连接上游异常: ${err.message}`, 'api_error', 'gateway_error')
  }
})

// 生图接口 (POST /v1/images/generations)
app.post('/v1/images/generations', async (req, res) => {
  const db = readDb()
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim()
  const card = db.cards[token]

  if (!card || card.status !== 'ACTIVE') {
    return sendOpenAIError(res, 401, 'API Key 无效或未提供', 'invalid_request_error', 'invalid_api_key')
  }

  const costTokens = 20000 // 生图固定扣 2 万 Tokens (约 0.1 元成本)
  if ((card.remainingTokens || 0) < costTokens) {
    return sendOpenAIError(res, 402, '算力不足，生成一张图片需要 20,000 Tokens', 'insufficient_quota', 'quota_exhausted')
  }

  const { prompt, n = 1, size = '1024x1024' } = req.body || {}
  const afuBase = process.env.AFU_API_BASE || 'https://api.afugpt.cn/v1'

  try {
    const upstreamResp = await fetchAfuWithFallback(`${afuBase}/images/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, n, size, model: 'gpt-image-2' }),
    })

    if (!upstreamResp.ok) return res.status(upstreamResp.status).send(await upstreamResp.text())
    const data = await upstreamResp.json()

    card.remainingTokens = Math.max(0, card.remainingTokens - costTokens)
    card.usedTokens = (card.usedTokens || 0) + costTokens
    writeDb(db)

    res.setHeader('X-Remaining-Tokens', card.remainingTokens)
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: { message: `生图通道异常: ${err.message}` } })
  }
})

// ----------------------------------------------------
// 2. 易支付全自动收款与发 Key 闭环
// ----------------------------------------------------

function signEpayParams(params, epayKey) {
  const keys = Object.keys(params)
    .filter((k) => k !== 'sign' && k !== 'sign_type' && params[k] !== '' && params[k] !== undefined && params[k] !== null)
    .sort()
  const queryStr = keys.map((k) => `${k}=${params[k]}`).join('&')
  return crypto.createHash('md5').update(`${queryStr}${epayKey}`).digest('hex')
}

// 获取充值套餐
app.get('/api/packages', (_req, res) => {
  res.json({ ok: true, packages: TOKEN_PACKAGES })
})

// ----------------------------------------------------
// 2. 面包多卡密兑换 / 激活体系 (零门槛免执照收款)
// ----------------------------------------------------

// 卡密激活与充值 (买家在面包多付款后在此兑换)
app.post('/api/card/redeem', (req, res) => {
  const { code = '', targetKey = '' } = req.body || {}
  const trimCode = String(code).trim()

  if (!trimCode) {
    return res.status(400).json({ ok: false, error: '请输入有效的卡密兑换码' })
  }

  const db = readDb()
  const card = db.cards[trimCode]

  if (!card) {
    return res.status(404).json({ ok: false, error: `卡密【${trimCode}】不存在，请检查是否复制完整` })
  }
  if (card.status !== 'ACTIVE') {
    return res.status(400).json({ ok: false, error: '该卡密已被兑换或处于停用状态' })
  }

  // 场景 A: 充值到现有账号 targetKey
  const activeTarget = targetKey && targetKey.trim() !== trimCode && db.cards[targetKey.trim()] ? targetKey.trim() : null

  if (activeTarget) {
    const tokensToAdd = card.remainingTokens || 0
    db.cards[activeTarget].totalTokens = (db.cards[activeTarget].totalTokens || 0) + tokensToAdd
    db.cards[activeTarget].remainingTokens = (db.cards[activeTarget].remainingTokens || 0) + tokensToAdd
    // 将已兑换的卡销毁/标记
    card.status = 'REDEEMED'
    card.remainingTokens = 0
    card.redeemedTo = activeTarget
    card.redeemedAt = new Date().toISOString()
    writeDb(db)
    return res.json({
      ok: true,
      mode: 'topup',
      activeKey: activeTarget,
      addedTokens: tokensToAdd,
      remainingTokens: db.cards[activeTarget].remainingTokens,
      message: `🎉 充值成功！已为您的密钥增加 ${(tokensToAdd / 1000000).toFixed(1)} 百万 Tokens`,
    })
  }

  // 场景 B: 直接以该卡密本身作为活跃 Key 使用
  return res.json({
    ok: true,
    mode: 'activate',
    activeKey: card.code,
    remainingTokens: card.remainingTokens,
    totalTokens: card.totalTokens,
    message: `🎉 密钥激活成功！当前可用算力：${(card.remainingTokens / 1000000).toFixed(1)} 百万 Tokens`,
  })
})

// 自动发卡/自提接口：接入面包多 & 爱发电官方验真，凭有效付款订单号核发独立专属 Key
app.post('/api/card/claim', async (req, res) => {
  const { orderId = '', packageId = 'pkg_test', platform = 'auto' } = req.body || {}
  const trimOrder = String(orderId || '').trim()

  if (!trimOrder || trimOrder.length < 5) {
    return res.status(400).json({
      ok: false,
      error: '请正确输入您付款成功的订单号（可从微信/支付宝账单、面包多已购或爱发电中查看）',
    })
  }

  const db = readDb()

  // 1. 检查该订单号是否已经领过卡密 (如果已领，直接返回当初绑定的同一张，保证绝对幂等且不重复出卡)
  const existingCard = Object.values(db.cards || {}).find(
    (c) => c.boundOrderId === trimOrder || c.orderId === trimOrder
  )
  if (existingCard) {
    return res.json({
      ok: true,
      key: existingCard.code,
      tokens: existingCard.totalTokens,
      remainingTokens: existingCard.remainingTokens,
      packageName: existingCard.packageName,
      createdAt: existingCard.createdAt,
      isReclaimed: true,
      message: `🎉 订单【${trimOrder}】已绑定专属密钥，已为您重新呈现！`,
    })
  }

  // 2. 调用面包多 / 爱发电官方接口实时验真
  const verifyRes = await verifyOrder(trimOrder, platform)

  // 若平台未配置凭证，给出明确指引；若启用了测试模拟模式则允许放行
  if (!verifyRes.ok) {
    if (
      (verifyRes.error === 'MBD_CREDENTIALS_MISSING' || verifyRes.error === 'AFDIAN_CREDENTIALS_MISSING') &&
      process.env.ALLOW_DEV_MOCK_CLAIM === 'true'
    ) {
      console.warn(`[DEV MOCK] 允许未配置官方凭证下的测试提卡: ${trimOrder}`)
    } else {
      let errMsg = verifyRes.message || '未查询到官方有效付款凭证，请核对订单号或稍后重试'
      if (verifyRes.error === 'ORDER_NOT_FOUND') {
        errMsg = `官方系统未查到订单【${trimOrder}】，请核对您输入的订单号或商户单号是否正确。`
      } else if (verifyRes.error === 'ORDER_NOT_PAID') {
        errMsg = `订单【${trimOrder}】尚未完成支付，请支付成功后再来提卡。`
      } else if (verifyRes.error === 'MBD_CREDENTIALS_MISSING' && !process.env.AFDIAN_USER_ID) {
        errMsg = '服务器尚未配置面包多或爱发电开发者 API 凭证，请管理员在 .env 中填入 MBD_APP_ID 与 MBD_APP_KEY。'
      }

      return res.status(400).json({
        ok: false,
        error: errMsg,
        code: verifyRes.error,
      })
    }
  }

  // 3. 验真通过！根据实际支付金额或方案智能匹配对应算力包
  const paidAmount = verifyRes.ok ? verifyRes.amountYuan : null
  const planId = verifyRes.ok ? verifyRes.planId : ''
  const matchedPkg = (paidAmount ? matchPackageByAmountOrPlan(paidAmount, planId) : null) ||
    TOKEN_PACKAGES.find((p) => p.id === packageId) ||
    TOKEN_PACKAGES[0]

  // 4. 签发一张全新独立的 Key
  const newKey = `sk-aurora-${crypto.randomBytes(8).toString('hex')}`
  const targetCard = {
    code: newKey,
    status: 'ACTIVE',
    packageId: matchedPkg.id,
    packageName: matchedPkg.name,
    totalTokens: matchedPkg.tokens,
    remainingTokens: matchedPkg.tokens,
    usedTokens: 0,
    boundOrderId: trimOrder,
    boundPlatform: verifyRes.platform || 'manual',
    paidAmount: paidAmount || matchedPkg.price.toFixed(2),
    claimedAt: new Date().toISOString(),
    remark: `官方验真履约·${matchedPkg.name}`,
    createdAt: new Date().toISOString(),
  }
  db.cards[newKey] = targetCard

  // 若存在内部订单映射，同步其状态
  if (db.orders && db.orders[trimOrder]) {
    db.orders[trimOrder].status = 'PAID'
    db.orders[trimOrder].assignedKey = newKey
    db.orders[trimOrder].paidAt = new Date().toISOString()
  }

  writeDb(db)
  console.log(`[发卡成功] 订单 ${trimOrder} (${verifyRes.platform || 'mock'}, ¥${targetCard.paidAmount}) 验证通过，已成功核发专属 Key: ${newKey}`)

  return res.json({
    ok: true,
    key: targetCard.code,
    tokens: targetCard.totalTokens,
    remainingTokens: targetCard.remainingTokens,
    packageName: targetCard.packageName,
    createdAt: targetCard.createdAt,
    isReclaimed: false,
    message: `🎉 订单【${trimOrder}】官方验证通过！已成功为您签发专属独立 API Key！`,
  })
})

// 面包多买家自提页面
app.get('/claim', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'claim.html'))
})

// 管理员批量生成卡密并输出纯文本 (一键复制到面包多卡密库)
app.post('/api/admin/cards/generate', (req, res) => {
  const { count = 10, packageId = 'pkg_trial', remark = '面包多上架' } = req.body || {}
  const pkg = TOKEN_PACKAGES.find((p) => p.id === packageId) || TOKEN_PACKAGES[0]
  const db = readDb()
  const createdKeys = []

  const num = Math.min(100, Math.max(1, parseInt(count, 10) || 1))
  for (let i = 0; i < num; i++) {
    const key = `sk-aurora-${crypto.randomBytes(8).toString('hex')}`
    db.cards[key] = {
      code: key,
      status: 'ACTIVE',
      packageId: pkg.id,
      packageName: pkg.name,
      totalTokens: pkg.tokens,
      remainingTokens: pkg.tokens,
      usedTokens: 0,
      remark: `${remark}·${pkg.name}`,
      createdAt: new Date().toISOString(),
    }
    createdKeys.push(key)
  }
  writeDb(db)

  res.json({
    ok: true,
    count: createdKeys.length,
    package: pkg.name,
    price: pkg.price,
    tokensPerKey: pkg.tokens,
    keys: createdKeys,
    rawText: createdKeys.join('\n'), // 专门为面包多准备的纯文本行
  })
})

// 查询所有卡密概况
app.get('/api/admin/cards', (_req, res) => {
  const db = readDb()
  const list = Object.values(db.cards || {}).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  res.json({ ok: true, total: list.length, cards: list })
})

// ----------------------------------------------------
// 3. 易支付备用通道 (待个体户执照与域名过白后启用)
// ----------------------------------------------------

// 创建支付订单
app.post('/api/pay/create', async (req, res) => {
  const { packageId, payType = 'wxpay', existingKey = '' } = req.body || {}
  const pkg = TOKEN_PACKAGES.find((p) => p.id === packageId) || TOKEN_PACKAGES[0]

  const db = readDb()
  const outTradeNo = `AURORA_${Date.now()}_${Math.floor(Math.random() * 1000)}`
  const assignedKey = existingKey || `sk-aurora-${crypto.randomBytes(8).toString('hex')}`

  const epayUrl = process.env.EPAY_API_URL || 'https://pay.v8jisu.cn'
  const pid = process.env.EPAY_PID || '29324'
  const key = process.env.EPAY_KEY || 'GA44Oo2j2QOv2uy24qu24qu062yp6ATt'

  const notifyUrl = `${req.protocol}://${req.get('host')}/api/pay/notify`
  const returnUrl = `${req.protocol}://${req.get('host')}/?paid=true&trade_no=${outTradeNo}`

  const params = {
    pid,
    type: payType,
    out_trade_no: outTradeNo,
    notify_url: notifyUrl,
    return_url: returnUrl,
    name: `极光AI算力包-${pkg.name}`,
    money: pkg.price.toFixed(2),
  }
  const sign = signEpayParams(params, key)

  const order = {
    outTradeNo,
    packageId: pkg.id,
    packageName: pkg.name,
    tokens: pkg.tokens,
    price: pkg.price,
    assignedKey,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
  }
  db.orders[outTradeNo] = order
  writeDb(db)

  // 请求收银台或聚合接口
  const paySubmitUrl = `${epayUrl}/submit.php?${new URLSearchParams({ ...params, sign, sign_type: 'MD5' }).toString()}`
  res.json({
    ok: true,
    orderId: outTradeNo,
    payUrl: paySubmitUrl,
    assignedKey,
    packageName: pkg.name,
    tokens: pkg.tokens,
    price: pkg.price,
  })
})

// 支付结果异步通知 Webhook
app.all('/api/pay/notify', (req, res) => {
  const query = { ...req.query, ...req.body }
  const { out_trade_no, trade_status, sign } = query
  const key = process.env.EPAY_KEY || 'GA44Oo2j2QOv2uy24qu24qu062yp6ATt'

  const calculated = signEpayParams(query, key)
  if (calculated !== sign) {
    return res.status(400).send('fail_sign')
  }

  if (trade_status === 'TRADE_SUCCESS') {
    const db = readDb()
    const order = db.orders[out_trade_no]
    if (order && order.status !== 'PAID') {
      order.status = 'PAID'
      order.paidAt = new Date().toISOString()

      // 激活或充值 Key
      const cardKey = order.assignedKey
      if (!db.cards[cardKey]) {
        db.cards[cardKey] = {
          code: cardKey,
          status: 'ACTIVE',
          totalTokens: order.tokens,
          remainingTokens: order.tokens,
          usedTokens: 0,
          remark: `在线充值·${order.packageName}`,
          createdAt: new Date().toISOString(),
        }
      } else {
        db.cards[cardKey].totalTokens = (db.cards[cardKey].totalTokens || 0) + order.tokens
        db.cards[cardKey].remainingTokens = (db.cards[cardKey].remainingTokens || 0) + order.tokens
      }
      writeDb(db)
      console.log(`[支付成功] 订单 ${out_trade_no} 支付完成，Key ${cardKey} 增加 ${order.tokens} Tokens`)
    }
  }

  res.send('success')
})

// 轮询订单状态（已加固：严禁未支付前泄露 Key，支持服务端主动验真双保险）
app.get('/api/pay/check-order/:orderId', async (req, res) => {
  const db = readDb()
  const orderId = req.params.orderId
  const order = db.orders[orderId]
  if (!order) return res.status(404).json({ ok: false, error: '订单不存在' })

  // 1. 如果本地状态还是 PENDING，触发主动查询双保险（哪怕 Webhook 因本地开发未能送达，也能立刻验真生效！）
  if (order.status !== 'PAID') {
    try {
      const verifyRes = await verifyOrder(order.outTradeNo || orderId)
      if (verifyRes.ok) {
        order.status = 'PAID'
        order.paidAt = new Date().toISOString()
        const cardKey = order.assignedKey || `sk-aurora-${crypto.randomBytes(8).toString('hex')}`
        order.assignedKey = cardKey

        if (!db.cards[cardKey]) {
          db.cards[cardKey] = {
            code: cardKey,
            status: 'ACTIVE',
            packageId: order.packageId,
            packageName: order.packageName,
            totalTokens: order.tokens,
            remainingTokens: order.tokens,
            usedTokens: 0,
            boundOrderId: order.outTradeNo,
            boundPlatform: verifyRes.platform,
            paidAmount: verifyRes.amountYuan,
            claimedAt: new Date().toISOString(),
            remark: `轮询主动验真·${order.packageName}`,
            createdAt: new Date().toISOString(),
          }
        }
        writeDb(db)
        console.log(`[主动验真成功] 订单 ${orderId} 验证已到账，立即放行并绑定 Key: ${cardKey}`)
      }
    } catch (e) {
      // 忽略偶发网络查询异常
    }
  }

  // 2. 安全防线：未支付绝不暴露密钥！
  if (order.status !== 'PAID') {
    return res.json({
      ok: true,
      status: 'PENDING',
      packageName: order.packageName,
      tokens: order.tokens,
      price: order.price,
    })
  }

  // 3. 已支付返回 Key
  return res.json({
    ok: true,
    status: 'PAID',
    key: order.assignedKey,
    tokens: order.tokens,
    packageName: order.packageName,
  })
})

// ----------------------------------------------------
// 4. 面包多 (MBD) & 爱发电 (Afdian) 官方 Webhook 接收端
// ----------------------------------------------------

// 面包多支付成功异步通知
app.post('/api/webhooks/mbd', async (req, res) => {
  const { type, data } = req.body || {}
  console.log(`[Webhook 接收] 收到面包多通知: type=${type}`)

  if (type === 'charge_succeeded' && data) {
    const outTradeNo = data.out_trade_no
    console.log(`[面包多 Webhook] 订单 ${outTradeNo} 付款成功通知，正在执行官方接口二次核实...`)

    const verifyRes = await verifyMbdOrder(outTradeNo)
    if (verifyRes.ok) {
      const db = readDb()
      const existing = Object.values(db.cards || {}).find((c) => c.boundOrderId === outTradeNo)
      if (!existing) {
        const matchedPkg = matchPackageByAmountOrPlan(verifyRes.amountYuan)
        const newKey = `sk-aurora-${crypto.randomBytes(8).toString('hex')}`
        db.cards[newKey] = {
          code: newKey,
          status: 'ACTIVE',
          packageId: matchedPkg.id,
          packageName: matchedPkg.name,
          totalTokens: matchedPkg.tokens,
          remainingTokens: matchedPkg.tokens,
          usedTokens: 0,
          boundOrderId: outTradeNo,
          boundPlatform: 'mbd',
          paidAmount: verifyRes.amountYuan,
          claimedAt: new Date().toISOString(),
          remark: `面包多 Webhook 自动履约·${matchedPkg.name}`,
          createdAt: new Date().toISOString(),
        }

        if (db.orders && db.orders[outTradeNo]) {
          db.orders[outTradeNo].status = 'PAID'
          db.orders[outTradeNo].assignedKey = newKey
          db.orders[outTradeNo].paidAt = new Date().toISOString()
        }

        writeDb(db)
        console.log(`[面包多 Webhook] 成功为订单 ${outTradeNo} (¥${verifyRes.amountYuan}) 签发独立 Key: ${newKey}`)
      }
    } else {
      console.warn(`[面包多 Webhook] 二次校验未通过: ${verifyRes.message}`)
    }
  }

  res.json({ ok: true })
})

// 爱发电订单推送异步通知
app.post('/api/webhooks/afdian', async (req, res) => {
  const { data } = req.body || {}
  console.log(`[Webhook 接收] 收到爱发电通知:`, data ? data.type : '')

  if (data && data.type === 'order' && data.order) {
    const { out_trade_no, status, total_amount, plan_id } = data.order
    console.log(`[爱发电 Webhook] 订单 ${out_trade_no}, status=${status}, 金额=${total_amount}`)

    if (Number(status) === 2) {
      const db = readDb()
      const existing = Object.values(db.cards || {}).find((c) => c.boundOrderId === out_trade_no)
      if (!existing) {
        const matchedPkg = matchPackageByAmountOrPlan(total_amount, plan_id)
        const newKey = `sk-aurora-${crypto.randomBytes(8).toString('hex')}`
        db.cards[newKey] = {
          code: newKey,
          status: 'ACTIVE',
          packageId: matchedPkg.id,
          packageName: matchedPkg.name,
          totalTokens: matchedPkg.tokens,
          remainingTokens: matchedPkg.tokens,
          usedTokens: 0,
          boundOrderId: out_trade_no,
          boundPlatform: 'afdian',
          paidAmount: total_amount,
          claimedAt: new Date().toISOString(),
          remark: `爱发电 Webhook 自动履约·${matchedPkg.name}`,
          createdAt: new Date().toISOString(),
        }

        if (db.orders && db.orders[out_trade_no]) {
          db.orders[out_trade_no].status = 'PAID'
          db.orders[out_trade_no].assignedKey = newKey
          db.orders[out_trade_no].paidAt = new Date().toISOString()
        }

        writeDb(db)
        console.log(`[爱发电 Webhook] 成功为订单 ${out_trade_no} (¥${total_amount}) 签发独立 Key: ${newKey}`)
      }
    }
  }

  res.json({ ec: 200, em: '' })
})

// 5. 创建极光本地订单并获取支付信息
app.post('/api/pay/order/create', async (req, res) => {
  const { packageId = 'pkg_test' } = req.body || {}
  const pkg = TOKEN_PACKAGES.find((p) => p.id === packageId) || TOKEN_PACKAGES[0]

  const db = readDb()
  const outTradeNo = `AURORA_${Date.now()}_${Math.floor(Math.random() * 1000)}`
  const assignedKey = `sk-aurora-${crypto.randomBytes(8).toString('hex')}`

  const order = {
    outTradeNo,
    packageId: pkg.id,
    packageName: pkg.name,
    tokens: pkg.tokens,
    price: pkg.price,
    assignedKey,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
  }
  db.orders[outTradeNo] = order
  writeDb(db)

  res.json({
    ok: true,
    orderId: outTradeNo,
    payUrl: pkg.payUrl,
    packageName: pkg.name,
    price: pkg.price,
    tokens: pkg.tokens,
  })
})

app.listen(PORT, () => {
  console.log(`====================================================`)
  console.log(`🚀 极光 API 独立分发平台已启动: http://localhost:${PORT}`)
  console.log(`📡 OpenAI 兼容 Base URL: http://localhost:${PORT}/v1`)
  console.log(`====================================================`)
})
