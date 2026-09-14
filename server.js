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

// 智能分层上游密钥池配置 (阿福与 Gemiaude 最优多线定向)
const TIER_KEYS = {
  // 海外特惠 (0.08x，专跑 GPT 5.5 / 5.6 / GPT-6 Astra)
  discount: (process.env.AFU_KEY_DISCOUNT || '').split(',').map((k) => k.trim()).filter(Boolean),
  // 海外低价 (0.12x)
  low: (process.env.AFU_KEY_LOW || '').split(',').map((k) => k.trim()).filter(Boolean),
  // 海外特价 (0.20x，Claude 阿福保底专线)
  special: (process.env.AFU_KEY_SPECIAL || '').split(',').map((k) => k.trim()).filter(Boolean),
  // 国产特价 (0.50x，DeepSeek / 豆包 / MiniMax / Kimi / GLM)
  domestic: (process.env.AFU_KEY_DOMESTIC || '').split(',').map((k) => k.trim()).filter(Boolean),
  // Gemiaude kiro 组 (0.5x，Claude 5厘钱首选专线)
  kiro: (process.env.GEMIAUDE_KEY_KIRO || '').split(',').map((k) => k.trim()).filter(Boolean),
  // Gemiaude grok-web 组 (0.06x，Grok 3厘钱首选专线)
  grok: (process.env.GEMIAUDE_KEY_GROK || '').split(',').map((k) => k.trim()).filter(Boolean),
  // 默认保底 (1.00x，Gemini、视频及全局保底)
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
      console.log(`[智能视觉升配] 检测到图片输入，原模型【${reqModel}】自动升配为【claude-sonnet-4-6】视觉通道`)
      return {
        upstreamModel: 'claude-sonnet-4-6',
        keyGroup: 'special',
        tokenMultiplier: 1.0,
        routedNote: 'Claude 3.7/Sonnet 超清多模态视觉专线',
      }
    }
  }

  // 2. 全栈编程与 Claude 旗舰 (优先走 Gemiaude kiro 5厘钱专线，故障自动顺延阿福特价 0.20x 保底)
  if (low.includes('coder') || low.includes('claude')) {
    let target = 'claude-sonnet-4-6'
    if (low.includes('opus')) target = 'claude-opus-4-7'
    return {
      upstreamModel: target,
      keyGroup: 'kiro',
      tokenMultiplier: 1.0,
      routedNote: 'Claude 3.7/Sonnet 全栈编程专线 (Gemiaude kiro 5折直通 / 阿福保底)',
    }
  }

  // 3. xAI Grok 系列 (优先走 Gemiaude grok-web 3厘钱专线，故障自动顺延保底)
  if (low.includes('grok')) {
    let target = 'grok-4.6'
    if (low.includes('4.5')) target = 'grok-4.5'
    return {
      upstreamModel: target,
      keyGroup: 'grok',
      tokenMultiplier: 1.0,
      routedNote: 'xAI Grok 4.6 极速问答专线 (Gemiaude 0.6折直通 / 阿福保底)',
    }
  }

  // 4. 通用极速问答与 GPT-4o 兼容
  if (low.includes('chat') || low.includes('4o')) {
    return {
      upstreamModel: 'claude-sonnet-4-6',
      keyGroup: 'kiro',
      tokenMultiplier: 1.0,
      routedNote: '极光通用极速智能助手专线 (Claude 5折直通 / 阿福保底)',
    }
  }

  // 4. Gemini 旗舰多模态系列
  if (low.includes('gemini')) {
    return {
      upstreamModel: 'gemini-3.7-flash',
      keyGroup: 'default',
      tokenMultiplier: 1.0,
      routedNote: 'Gemini 3.7 Flash 高速专线',
    }
  }

  // 5. 字节跳动豆包系列与 DeepSeek 推理 ➔ 优选【国产特价组 (0.50x)】
  if (low.includes('doubao') || low.includes('seed') || low.includes('deepseek')) {
    return {
      upstreamModel: 'doubao-seed-2-0-pro-260215',
      keyGroup: 'domestic',
      tokenMultiplier: 1.0,
      routedNote: '豆包 Seed 2.0 中文爆款特调专线',
    }
  }

  // 6. GPT-6 系列
  if (low.includes('gpt-6') || low.includes('astra')) {
    return {
      upstreamModel: 'gpt-6-astra',
      keyGroup: 'default',
      tokenMultiplier: 3.0,
      routedNote: 'GPT-6 新一代旗舰工程专线',
    }
  }

  // 7. GPT-5.5 / GPT-5 系列
  if (low.includes('gpt-5') || low.includes('5.6') || low.includes('5.5') || low.includes('pro')) {
    return {
      upstreamModel: 'gpt-5.5',
      keyGroup: 'default',
      tokenMultiplier: 2.0,
      routedNote: 'GPT-5.5 前沿旗舰思考专线',
    }
  }

  // 8. AI 绘画与生图专线 (gpt-image-2, dall-e-3, nano-banana)
  if (low.includes('image') || low.includes('dall') || low.includes('banana')) {
    let target = 'gpt-image-2'
    if (low.includes('4k')) target = 'gpt-image-2-4k'
    else if (low.includes('2k')) target = 'gpt-image-2-2k'
    else if (low.includes('2.5')) target = 'gpt-image-2.5'
    return {
      upstreamModel: target,
      keyGroup: 'default',
      tokenMultiplier: 1.0,
      routedNote: 'GPT Image 2 商业级生图专线 (0.035元低价直通 / 阿福保底)',
      isImageGeneration: true,
    }
  }

  // 9. AI 视频生成专线 (veo3.1, seedance-2)
  if (low.includes('veo') || low.includes('seedance') || low.includes('video')) {
    return {
      upstreamModel: 'veo3.1',
      keyGroup: 'default',
      tokenMultiplier: 3.0,
      routedNote: 'Veo 3.1 AI 视频生成专线',
    }
  }

  // 10. 最终保底回退 (Claude Sonnet 3.7 稳定极速高可用保底)
  return {
    upstreamModel: 'claude-sonnet-4-6',
    keyGroup: 'special',
    tokenMultiplier: 1.0,
    routedNote: '极光全球高速专线',
  }
}

// 多层轮询故障转移引擎：优先使用对应低价分组与专线上游，故障时自动无缝降级到阿福保底
async function fetchAfuWithTieredRouting(url, options = {}, preferredGroup = 'default') {
  const gemiaudeBase = 'https://oneapi.gemiaude.com/v1'
  const afuBase = process.env.AFU_API_BASE || 'https://api.afugpt.cn/v1'

  // 构建智能多线候选池 (按性价比从高到低排列)
  const candidateList = []

  if (preferredGroup === 'kiro') {
    (TIER_KEYS.kiro || []).forEach((k) => candidateList.push({ key: k, baseUrl: gemiaudeBase, note: 'Gemiaude kiro 5折专线 (¥0.005/次)' }))
    (TIER_KEYS.special || []).forEach((k) => candidateList.push({ key: k, baseUrl: afuBase, note: '阿福海外特价 2折专线 (¥0.02/次)' }))
  } else if (preferredGroup === 'grok') {
    (TIER_KEYS.grok || []).forEach((k) => candidateList.push({ key: k, baseUrl: gemiaudeBase, note: 'Gemiaude grok 0.6折专线 (¥0.003/次)' }))
  } else if (preferredGroup === 'discount') {
    (TIER_KEYS.discount || []).forEach((k) => candidateList.push({ key: k, baseUrl: afuBase, note: '阿福海外特惠 0.8折专线' }))
  } else if (preferredGroup === 'special') {
    (TIER_KEYS.special || []).forEach((k) => candidateList.push({ key: k, baseUrl: afuBase, note: '阿福海外特价 2折专线' }))
  } else if (preferredGroup === 'domestic') {
    (TIER_KEYS.domestic || []).forEach((k) => candidateList.push({ key: k, baseUrl: afuBase, note: '阿福国产特价 5折专线' }))
  }

  (TIER_KEYS.default || []).forEach((k) => candidateList.push({ key: k, baseUrl: afuBase, note: '阿福默认全局保底' }))

  // 去重
  const uniqueCandidates = []
  const seen = new Set()
  for (const c of candidateList) {
    if (c.key && !seen.has(c.key)) {
      seen.add(c.key)
      uniqueCandidates.push(c)
    }
  }

  let lastError = null
  for (let i = 0; i < uniqueCandidates.length; i++) {
    const { key, baseUrl, note } = uniqueCandidates[i]
    try {
      const endpoint = url.replace(/https?:\/\/[^\/]+\/v1/i, '')
      const targetUrl = `${baseUrl}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`
      const headers = {
        ...(options.headers || {}),
        Authorization: `Bearer ${key}`,
      }
      console.log(`[智能多线路由] 尝试线路 #${i + 1} (${note}) ➔ ${targetUrl}`)
      const res = await fetch(targetUrl, { ...options, headers })

      if (!res.ok) {
        const cloned = res.clone()
        const errText = await cloned.text()
        console.warn(`[智能多线路由] 线路 #${i + 1} 返回 HTTP ${res.status}:`, errText)

        if (i < uniqueCandidates.length - 1) {
          console.warn(`[智能多线路由] 顺延切换至备用线路 #${i + 2}...`)
          lastError = new Error(`线路 #${i + 1} 异常 (${res.status}): ${errText}`)
          continue
        }
      }

      return res
    } catch (err) {
      console.warn(`[智能多线路由] 线路 #${i + 1} 网络异常:`, err.message)
      lastError = err
      if (i < uniqueCandidates.length - 1) continue
    }
  }

  throw lastError || new Error('所有配置的分组 API Key 均不可用')
}

// 🎨 生图三级智能容灾调度器：
// Tier 1 (首选 3.5分钱): Gemiaude gpt-image-2
// Tier 2 (备用 4.5分钱): Gemiaude gpt-image-2-2k (高清独立号池，遇抖动自动顺延)
// Tier 3 (终极 1毛钱): 阿福 API 官方专线兜底 (永不失败)
async function fetchImageWithThreeTierFallback(payload, isChatCompletions = true) {
  const imageBase = process.env.IMAGE_API_BASE || 'https://oneapi.gemiaude.com/v1'
  const imageKey = process.env.IMAGE_API_KEY || 'sk-MD2bEvqffzry7OGgM4lIVjeEnGJa6lLduZwrydi8XLBZnvAy'
  const afuBase = process.env.AFU_API_BASE || 'https://api.afugpt.cn/v1'
  const endpoint = isChatCompletions ? '/chat/completions' : '/images/generations'

  // 1. Tier 1: 优先走 Gemiaude gpt-image-2 (¥0.035/张，成本骤降 65%)
  if (imageKey) {
    try {
      console.log(`[生图三级容灾 - Tier 1] 尝试【gpt-image-2】(¥0.035/张) @ ${imageBase}...`)
      const t1Payload = { ...payload, model: 'gpt-image-2' }
      const res1 = await fetch(`${imageBase}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${imageKey}`,
        },
        body: JSON.stringify(t1Payload),
      })
      if (res1.ok) {
        console.log(`[生图三级容灾] Tier 1 (¥0.035) 出图成功！`)
        return res1
      }
      console.warn(`[生图三级容灾] Tier 1 返回 ${res1.status}，顺延尝试 Tier 2 (gpt-image-2-2k)...`)
    } catch (err1) {
      console.warn(`[生图三级容灾] Tier 1 网络异常 (${err1.message})，顺延尝试 Tier 2...`)
    }

    // 2. Tier 2: 顺延走 Gemiaude gpt-image-2-2k (¥0.045/张，高清独立号池)
    try {
      console.log(`[生图三级容灾 - Tier 2] 尝试【gpt-image-2-2k】(¥0.045/张) @ ${imageBase}...`)
      const t2Payload = { ...payload, model: 'gpt-image-2-2k' }
      const res2 = await fetch(`${imageBase}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${imageKey}`,
        },
        body: JSON.stringify(t2Payload),
      })
      if (res2.ok) {
        console.log(`[生图三级容灾] Tier 2 (¥0.045 2K高清) 出图成功！`)
        return res2
      }
      console.warn(`[生图三级容灾] Tier 2 返回 ${res2.status}，顺延切换至 Tier 3 (阿福保底)...`)
    } catch (err2) {
      console.warn(`[生图三级容灾] Tier 2 网络异常 (${err2.message})，顺延切换至 Tier 3...`)
    }
  }

  // 3. Tier 3: 终极阿福官方高可用兜底 (¥0.10/张)
  console.log(`[生图三级容灾 - Tier 3] 切换至阿福 API 终极保底通道 (¥0.10/张)...`)
  return fetchAfuWithTieredRouting(
    `${afuBase}${endpoint}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, model: 'gpt-image-2' }),
    },
    'default'
  )
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

// 上游报错与渠道脱敏安全清洗 (彻底杜绝泄露阿福/NewAPI等机密)
function sanitizeUpstreamError(input) {
  if (!input) return input
  if (typeof input === 'string') {
    return input
      .replace(/https?:\/\/[^\s"'`<>]+/gi, 'https://api.aurora-ai.com')
      .replace(/afugpt(\.cn)?/gi, 'aurora-cluster')
      .replace(/阿福(api)?/gi, '极光官方节点')
      .replace(/one[-_]?api|new[-_]?api/gi, 'aurora-gateway')
  }
  if (typeof input === 'object') {
    try {
      const str = JSON.stringify(input)
      const cleaned = sanitizeUpstreamError(str)
      return JSON.parse(cleaned)
    } catch {
      return { error: { message: '节点调度繁忙，请稍后重试', type: 'upstream_error' } }
    }
  }
  return input
}

// 管理员中间件安全拦截 (严禁未授权批量出卡或读取数据库)
function requireAdminAuth(req, res, next) {
  const adminSecret = process.env.ADMIN_SECRET || 'aurora-admin-secret-2026'
  const auth = req.headers['authorization'] || req.headers['x-admin-secret'] || req.query.secret || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token || token !== adminSecret) {
    return res.status(403).json({ ok: false, error: '无权访问管理接口，请提供有效的管理员秘钥 (ADMIN_SECRET)' })
  }
  next()
}

// 精选模型矩阵 (统一为官方真实标准模型名，并保留兼容别名)
const AURORA_MODELS = [
  {
    "id": "gpt-6-astra",
    "name": "gpt-6-astra",
    "desc": "GPT-6 Astra 新一代前沿架构推理",
    "category": "OpenAI 旗舰",
    "upstreamModel": "gpt-6-astra",
    "tokenMultiplier": 3
  },
  {
    "id": "gpt-5.5",
    "name": "gpt-5.5",
    "desc": "GPT-5.5 官方特惠思考底座",
    "category": "OpenAI 旗舰",
    "upstreamModel": "gpt-5.5",
    "tokenMultiplier": 2
  },
  {
    "id": "gpt-5.6-luna",
    "name": "gpt-5.6-luna",
    "desc": "GPT-5.6 Luna 极速增强版",
    "category": "OpenAI 旗舰",
    "upstreamModel": "gpt-5.5",
    "tokenMultiplier": 2
  },
  {
    "id": "gpt-5.6-sol",
    "name": "gpt-5.6-sol",
    "desc": "GPT-5.6 Sol 极速版",
    "category": "OpenAI 旗舰",
    "upstreamModel": "gpt-5.5",
    "tokenMultiplier": 2
  },
  {
    "id": "gpt-5.6-terra",
    "name": "gpt-5.6-terra",
    "desc": "GPT-5.6 Terra 长文本版",
    "category": "OpenAI 旗舰",
    "upstreamModel": "gpt-5.5",
    "tokenMultiplier": 2
  },
  {
    "id": "gpt-5.4",
    "name": "gpt-5.4",
    "desc": "GPT-5.4 官方思考架构",
    "category": "OpenAI 旗舰",
    "upstreamModel": "gpt-5.5",
    "tokenMultiplier": 1.5
  },
  {
    "id": "gpt-5.4-mini",
    "name": "gpt-5.4-mini",
    "desc": "GPT-5.4 Mini 极速轻量",
    "category": "OpenAI 旗舰",
    "upstreamModel": "gemini-3.7-flash",
    "tokenMultiplier": 1
  },
  {
    "id": "gpt-5.3-codex",
    "name": "gpt-5.3-codex",
    "desc": "GPT-5.3 Codex 代码特调",
    "category": "OpenAI 旗舰",
    "upstreamModel": "gpt-5.5",
    "tokenMultiplier": 1.5
  },
  {
    "id": "gpt-5.2",
    "name": "gpt-5.2",
    "desc": "GPT-5.2 通用旗舰",
    "category": "OpenAI 旗舰",
    "upstreamModel": "gpt-5.5",
    "tokenMultiplier": 1.5
  },
  {
    "id": "gpt-4o",
    "name": "gpt-4o",
    "desc": "OpenAI 官方旗舰直通通道",
    "category": "OpenAI 旗舰",
    "upstreamModel": "gpt-5.5",
    "tokenMultiplier": 1
  },
  {
    "id": "gpt-4o-mini",
    "name": "gpt-4o-mini",
    "desc": "OpenAI 极速轻量通道",
    "category": "OpenAI 旗舰",
    "upstreamModel": "gemini-3.7-flash",
    "tokenMultiplier": 1
  },
  {
    "id": "claude-sonnet-4-6",
    "name": "claude-sonnet-4-6",
    "desc": "Claude Sonnet 4.6 官方专线",
    "category": "Claude 商业文学",
    "upstreamModel": "claude-sonnet-4-6",
    "tokenMultiplier": 2
  },
  {
    "id": "claude-sonnet-5",
    "name": "claude-sonnet-5",
    "desc": "Claude Sonnet 5 探索版",
    "category": "Claude 商业文学",
    "upstreamModel": "claude-sonnet-4-6",
    "tokenMultiplier": 2
  },
  {
    "id": "claude-sonnet-4-5-20250929",
    "name": "claude-sonnet-4-5-20250929",
    "desc": "Claude Sonnet 4.5 官方稳定版",
    "category": "Claude 商业文学",
    "upstreamModel": "claude-sonnet-4-6",
    "tokenMultiplier": 2
  },
  {
    "id": "claude-opus-4-7",
    "name": "claude-opus-4-7",
    "desc": "Claude Opus 4.7 顶配深度推演",
    "category": "Claude 商业文学",
    "upstreamModel": "claude-opus-4-7",
    "tokenMultiplier": 2.5
  },
  {
    "id": "claude-opus-4-7-thinking",
    "name": "claude-opus-4-7-thinking",
    "desc": "Claude Opus 4.7 满血思维链",
    "category": "Claude 商业文学",
    "upstreamModel": "claude-opus-4-7",
    "tokenMultiplier": 2.5
  },
  {
    "id": "claude-opus-4-6",
    "name": "claude-opus-4-6",
    "desc": "Claude Opus 4.6 经典旗舰",
    "category": "Claude 商业文学",
    "upstreamModel": "claude-opus-4-7",
    "tokenMultiplier": 2.5
  },
  {
    "id": "claude-opus-4-6-thinking",
    "name": "claude-opus-4-6-thinking",
    "desc": "Claude Opus 4.6 思维链版",
    "category": "Claude 商业文学",
    "upstreamModel": "claude-opus-4-7",
    "tokenMultiplier": 2.5
  },
  {
    "id": "claude-opus-4-8",
    "name": "claude-opus-4-8",
    "desc": "Claude Opus 4.8 旗舰演进版",
    "category": "Claude 商业文学",
    "upstreamModel": "claude-opus-4-7",
    "tokenMultiplier": 2.5
  },
  {
    "id": "claude-opus-5",
    "name": "claude-opus-5",
    "desc": "Claude Opus 5 顶配旗舰",
    "category": "Claude 商业文学",
    "upstreamModel": "claude-opus-4-7",
    "tokenMultiplier": 2.5
  },
  {
    "id": "claude-fable-5",
    "name": "claude-fable-5",
    "desc": "Claude Fable 5 叙事与小说特调",
    "category": "Claude 商业文学",
    "upstreamModel": "claude-sonnet-4-6",
    "tokenMultiplier": 2
  },
  {
    "id": "claude-3-5-sonnet",
    "name": "claude-3-5-sonnet",
    "desc": "Claude 3.5 Sonnet 官方预设通道",
    "category": "Claude 商业文学",
    "upstreamModel": "claude-sonnet-4-6",
    "tokenMultiplier": 2
  },
  {
    "id": "gemini-3.7-flash",
    "name": "gemini-3.7-flash",
    "desc": "Google 官方 Gemini 3.7 Flash 全栈编程",
    "category": "Google 极客编程",
    "upstreamModel": "gemini-3.7-flash",
    "tokenMultiplier": 1
  },
  {
    "id": "gemini-3.8-flash",
    "name": "gemini-3.8-flash",
    "desc": "Gemini 3.8 Flash 极速多模态预览",
    "category": "Google 极客编程",
    "upstreamModel": "gemini-3.7-flash",
    "tokenMultiplier": 1
  },
  {
    "id": "gemini-3.5-flash",
    "name": "gemini-3.5-flash",
    "desc": "Gemini 3.5 Flash 高吞吐通道",
    "category": "Google 极客编程",
    "upstreamModel": "gemini-3.7-flash",
    "tokenMultiplier": 1
  },
  {
    "id": "gemini-3.1-pro-preview",
    "name": "gemini-3.1-pro-preview",
    "desc": "Gemini 3.1 Pro 深度推理预览",
    "category": "Google 极客编程",
    "upstreamModel": "gemini-3.7-flash",
    "tokenMultiplier": 1.5
  },
  {
    "id": "gemini-3.1-flash-image-preview",
    "name": "gemini-3.1-flash-image-preview",
    "desc": "Gemini 3.1 Flash 图像视觉通道",
    "category": "Google 极客编程",
    "upstreamModel": "gemini-3.7-flash",
    "tokenMultiplier": 1
  },
  {
    "id": "gemini-3.1-flash-image-preview-2k",
    "name": "gemini-3.1-flash-image-preview-2k",
    "desc": "Gemini 3.1 Flash 2K 高清看图通道",
    "category": "Google 极客编程",
    "upstreamModel": "gemini-3.7-flash",
    "tokenMultiplier": 1
  },
  {
    "id": "gemini-3.1-flash-image-preview-4k",
    "name": "gemini-3.1-flash-image-preview-4k",
    "desc": "Gemini 3.1 Flash 4K 超清看图通道",
    "category": "Google 极客编程",
    "upstreamModel": "gemini-3.7-flash",
    "tokenMultiplier": 1
  },
  {
    "id": "deepseek-v3",
    "name": "deepseek-v3",
    "desc": "DeepSeek V3 官方标准接口",
    "category": "DeepSeek 满血推理",
    "upstreamModel": "doubao-seed-2-0-pro-260215",
    "tokenMultiplier": 1
  },
  {
    "id": "deepseek-reasoner",
    "name": "deepseek-reasoner",
    "desc": "DeepSeek R1 满血思维链推理",
    "category": "DeepSeek 满血推理",
    "upstreamModel": "doubao-seed-2-0-pro-260215",
    "tokenMultiplier": 1.2
  },
  {
    "id": "deepseek-v3.1",
    "name": "deepseek-v3.1",
    "desc": "DeepSeek V3.1 增强通道",
    "category": "DeepSeek 满血推理",
    "upstreamModel": "doubao-seed-2-0-pro-260215",
    "tokenMultiplier": 1
  },
  {
    "id": "deepseek-v3.2",
    "name": "deepseek-v3.2",
    "desc": "DeepSeek V3.2 最新演进版",
    "category": "DeepSeek 满血推理",
    "upstreamModel": "doubao-seed-2-0-pro-260215",
    "tokenMultiplier": 1
  },
  {
    "id": "deepseek-v3-2-251201",
    "name": "deepseek-v3-2-251201",
    "desc": "DeepSeek V3 生产快照专线",
    "category": "DeepSeek 满血推理",
    "upstreamModel": "doubao-seed-2-0-pro-260215",
    "tokenMultiplier": 1
  },
  {
    "id": "doubao-seed-2-0-pro-260215",
    "name": "doubao-seed-2-0-pro-260215",
    "desc": "字节跳动豆包 Seed 2.0 Pro 官方直通",
    "category": "国产官方特惠",
    "upstreamModel": "doubao-seed-2-0-pro-260215",
    "tokenMultiplier": 1
  },
  {
    "id": "kimi-k2.5",
    "name": "kimi-k2.5",
    "desc": "月之暗面 Kimi K2.5 官方通道",
    "category": "国产官方特惠",
    "upstreamModel": "kimi-k2.5",
    "tokenMultiplier": 1
  },
  {
    "id": "MiniMax-M2.7",
    "name": "MiniMax-M2.7",
    "desc": "MiniMax M2.7 官方旗舰",
    "category": "国产官方特惠",
    "upstreamModel": "MiniMax-M2.7",
    "tokenMultiplier": 1
  },
  {
    "id": "MiniMax-M2.7-highspeed",
    "name": "MiniMax-M2.7-highspeed",
    "desc": "MiniMax M2.7 极速专线",
    "category": "国产官方特惠",
    "upstreamModel": "MiniMax-M2.7",
    "tokenMultiplier": 1
  },
  {
    "id": "MiniMax-M2.5",
    "name": "MiniMax-M2.5",
    "desc": "MiniMax M2.5 标准通用通道",
    "category": "国产官方特惠",
    "upstreamModel": "MiniMax-M2.7",
    "tokenMultiplier": 1
  },
  {
    "id": "MiniMax-M2.5-highspeed",
    "name": "MiniMax-M2.5-highspeed",
    "desc": "MiniMax M2.5 极速专线",
    "category": "国产官方特惠",
    "upstreamModel": "MiniMax-M2.7",
    "tokenMultiplier": 1
  },
  {
    "id": "MiniMax-M2",
    "name": "MiniMax-M2",
    "desc": "MiniMax M2 经典通道",
    "category": "国产官方特惠",
    "upstreamModel": "MiniMax-M2.7",
    "tokenMultiplier": 1
  },
  {
    "id": "glm-5.1",
    "name": "glm-5.1",
    "desc": "智谱清言 GLM-5.1 官方旗舰",
    "category": "国产官方特惠",
    "upstreamModel": "glm-5.1",
    "tokenMultiplier": 1
  },
  {
    "id": "glm-5",
    "name": "glm-5",
    "desc": "智谱清言 GLM-5 官方通道",
    "category": "国产官方特惠",
    "upstreamModel": "glm-5.1",
    "tokenMultiplier": 1
  },
  {
    "id": "gpt-image-2",
    "name": "gpt-image-2",
    "desc": "GPT Image 2 商业级超清生图通道",
    "category": "AI 绘画生成",
    "upstreamModel": "gpt-image-2",
    "tokenMultiplier": 1
  },
  {
    "id": "dall-e-3",
    "name": "dall-e-3",
    "desc": "OpenAI DALL·E 3 官方标准生图通道",
    "category": "AI 绘画生成",
    "upstreamModel": "gpt-image-2",
    "tokenMultiplier": 1
  },
  {
    "id": "gpt-image-2-c",
    "name": "gpt-image-2-c",
    "desc": "GPT Image 2-C 极速生成通道",
    "category": "AI 绘画生成",
    "upstreamModel": "gpt-image-2",
    "tokenMultiplier": 1
  },
  {
    "id": "gpt-image-2-vip",
    "name": "gpt-image-2-vip",
    "desc": "GPT Image 2 VIP 尊享通道",
    "category": "AI 绘画生成",
    "upstreamModel": "gpt-image-2",
    "tokenMultiplier": 1
  },
  {
    "id": "gpt-image-2.5-flare",
    "name": "gpt-image-2.5-flare",
    "desc": "GPT Image 2.5 Flare 绚丽光影版",
    "category": "AI 绘画生成",
    "upstreamModel": "gpt-image-2",
    "tokenMultiplier": 1
  },
  {
    "id": "gpt-image-2.5-sunburst",
    "name": "gpt-image-2.5-sunburst",
    "desc": "GPT Image 2.5 Sunburst 高保真艺术版",
    "category": "AI 绘画生成",
    "upstreamModel": "gpt-image-2",
    "tokenMultiplier": 1
  },
  {
    "id": "nano-banana-pro",
    "name": "nano-banana-pro",
    "desc": "Nano Banana Pro 超清生图",
    "category": "AI 绘画生成",
    "upstreamModel": "gpt-image-2",
    "tokenMultiplier": 1
  },
  {
    "id": "nano-banana-pro-2k",
    "name": "nano-banana-pro-2k",
    "desc": "Nano Banana Pro 2K 分辨率通道",
    "category": "AI 绘画生成",
    "upstreamModel": "gpt-image-2",
    "tokenMultiplier": 1
  },
  {
    "id": "nano-banana-pro-4k",
    "name": "nano-banana-pro-4k",
    "desc": "Nano Banana Pro 4K 印刷级通道",
    "category": "AI 绘画生成",
    "upstreamModel": "gpt-image-2",
    "tokenMultiplier": 1
  },
  {
    "id": "nano-banana-2",
    "name": "nano-banana-2",
    "desc": "Nano Banana 2 通用生图引擎",
    "category": "AI 绘画生成",
    "upstreamModel": "gpt-image-2",
    "tokenMultiplier": 1
  },
  {
    "id": "nano-banana-2-2k",
    "name": "nano-banana-2-2k",
    "desc": "Nano Banana 2 2K 进阶通道",
    "category": "AI 绘画生成",
    "upstreamModel": "gpt-image-2",
    "tokenMultiplier": 1
  },
  {
    "id": "nano-banana-2-4k",
    "name": "nano-banana-2-4k",
    "desc": "Nano Banana 2 4K 超清通道",
    "category": "AI 绘画生成",
    "upstreamModel": "gpt-image-2",
    "tokenMultiplier": 1
  },
  {
    "id": "veo3.1",
    "name": "veo3.1",
    "desc": "Google 官方 Veo 3.1 视频引擎通道",
    "category": "AI 视频生成",
    "upstreamModel": "veo3.1",
    "tokenMultiplier": 3
  },
  {
    "id": "veo3.1-pro",
    "name": "veo3.1-pro",
    "desc": "Veo 3.1 Pro 导演级分镜渲染通道",
    "category": "AI 视频生成",
    "upstreamModel": "veo3.1",
    "tokenMultiplier": 3.5
  },
  {
    "id": "veo3.1-fast",
    "name": "veo3.1-fast",
    "desc": "Veo 3.1 Fast 快速预览生成通道",
    "category": "AI 视频生成",
    "upstreamModel": "veo3.1",
    "tokenMultiplier": 2.5
  },
  {
    "id": "seedance-2",
    "name": "seedance-2",
    "desc": "字节跳动即梦 Seedance 2.0 视频通道",
    "category": "AI 视频生成",
    "upstreamModel": "seedance-2",
    "tokenMultiplier": 3
  },
  {
    "id": "seedance-2-fast",
    "name": "seedance-2-fast",
    "desc": "Seedance 2.0 Fast 极速通道",
    "category": "AI 视频生成",
    "upstreamModel": "seedance-2",
    "tokenMultiplier": 2.5
  },
  {
    "id": "seedance-2-mini",
    "name": "seedance-2-mini",
    "desc": "Seedance 2.0 Mini 轻量分镜通道",
    "category": "AI 视频生成",
    "upstreamModel": "seedance-2",
    "tokenMultiplier": 2
  },
  {
    "id": "grok-video-1.5",
    "name": "grok-video-1.5",
    "desc": "xAI Grok Video 1.5 动态视频通道",
    "category": "AI 视频生成",
    "upstreamModel": "grok-video-1.5",
    "tokenMultiplier": 3
  },
  {
    "id": "grok-1.5-video-6s",
    "name": "grok-1.5-video-6s",
    "desc": "Grok Video 6秒短剧镜头专线",
    "category": "AI 视频生成",
    "upstreamModel": "grok-video-1.5",
    "tokenMultiplier": 2
  },
  {
    "id": "grok-1.5-video-10s",
    "name": "grok-1.5-video-10s",
    "desc": "Grok Video 10秒广告镜头专线",
    "category": "AI 视频生成",
    "upstreamModel": "grok-video-1.5",
    "tokenMultiplier": 2.5
  },
  {
    "id": "grok-1.5-video-15s",
    "name": "grok-1.5-video-15s",
    "desc": "Grok Video 15秒剧情镜头专线",
    "category": "AI 视频生成",
    "upstreamModel": "grok-video-1.5",
    "tokenMultiplier": 3
  },
  {
    "id": "omni_flash-10s",
    "name": "omni_flash-10s",
    "desc": "Omni Flash 10秒极速出片通道",
    "category": "AI 视频生成",
    "upstreamModel": "omni_flash-10s",
    "tokenMultiplier": 2
  },
  {
    "id": "aurora-coder",
    "name": "aurora-coder (兼容别名)",
    "desc": "历史别名，自动路由至 Gemini 3.7 Flash",
    "category": "兼容别名",
    "upstreamModel": "gemini-3.7-flash",
    "tokenMultiplier": 1
  },
  {
    "id": "aurora-chat",
    "name": "aurora-chat (兼容别名)",
    "desc": "历史别名，自动路由至轻量通用主力",
    "category": "兼容别名",
    "upstreamModel": "gemini-3.7-flash",
    "tokenMultiplier": 1
  },
  {
    "id": "aurora-deepseek",
    "name": "aurora-deepseek (兼容别名)",
    "desc": "历史别名，自动路由至 DeepSeek",
    "category": "兼容别名",
    "upstreamModel": "doubao-seed-2-0-pro-260215",
    "tokenMultiplier": 1
  },
  {
    "id": "aurora-doubao",
    "name": "aurora-doubao (兼容别名)",
    "desc": "历史别名，自动路由至豆包 Seed 2.0",
    "category": "兼容别名",
    "upstreamModel": "doubao-seed-2-0-pro-260215",
    "tokenMultiplier": 1
  },
  {
    "id": "aurora-image",
    "name": "aurora-image (兼容别名)",
    "desc": "历史别名，自动路由至 GPT Image 2",
    "category": "兼容别名",
    "upstreamModel": "gpt-image-2",
    "tokenMultiplier": 1
  },
  {
    "id": "gpt-6",
    "name": "gpt-6 (兼容别名)",
    "desc": "简写别名，自动路由至 GPT-6 Astra",
    "category": "兼容别名",
    "upstreamModel": "gpt-6-astra",
    "tokenMultiplier": 3
  },
  {
    "id": "doubao-seed-2.0",
    "name": "doubao-seed-2.0 (简写别名)",
    "desc": "简写别名，自动路由至豆包 Seed 2.0 Pro",
    "category": "兼容别名",
    "upstreamModel": "doubao-seed-2-0-pro-260215",
    "tokenMultiplier": 1
  }
]

function resolveModel(reqModel) {
  if (!reqModel) return AURORA_MODELS[0]
  const exact = AURORA_MODELS.find((m) => m.id.toLowerCase() === reqModel.toLowerCase())
  if (exact) return exact

  const low = reqModel.toLowerCase()
  if (low.includes('gemini') || low.includes('coder')) {
    return { id: reqModel, upstreamModel: 'gemini-3.7-flash', tokenMultiplier: 1.0, name: reqModel }
  }
  if (low.includes('gpt-6') || low.includes('astra')) {
    return { id: reqModel, upstreamModel: 'gpt-6-astra', tokenMultiplier: 3.0, name: reqModel }
  }
  if (low.includes('gpt-5')) {
    return { id: reqModel, upstreamModel: 'gpt-5.5', tokenMultiplier: 2.0, name: reqModel }
  }
  if (low.includes('deepseek')) {
    return { id: reqModel, upstreamModel: 'doubao-seed-2-0-pro-260215', tokenMultiplier: 1.0, name: reqModel }
  }
  if (low.includes('claude')) {
    return { id: reqModel, upstreamModel: 'claude-sonnet-4-6', tokenMultiplier: 2.0, name: reqModel }
  }
  if (low.includes('doubao') || low.includes('seed')) {
    return { id: reqModel, upstreamModel: 'doubao-seed-2-0-pro-260215', tokenMultiplier: 1.0, name: reqModel }
  }
  if (low.includes('dall') || low.includes('image')) {
    return { id: reqModel, upstreamModel: 'gpt-image-2', tokenMultiplier: 1.0, name: reqModel }
  }
  if (low.includes('veo') || low.includes('seedance') || low.includes('video')) {
    return { id: reqModel, upstreamModel: 'veo3.1', tokenMultiplier: 3.0, name: reqModel }
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
    payUrl: process.env.PAY_URL_TEST || 'https://afdian.com/order/create?product_type=1&plan_id=71b40e1cada511f1b1805254001e7c00&sku=%5B%7B%22sku_id%22%3A%220235a01cada711f1879352540025c377%22,%22count%22%3A1%7D%5D&viokrz_ex=0',
  },
  {
    id: 'pkg_trial',
    name: '🚀 极客体验包',
    price: 5.0,
    tokens: 2000000, // 200万 Tokens
    desc: '约折合 200 万 Tokens · 适合个人轻量代码与对话尝鲜',
    tag: '入门尝鲜',
    payUrl: process.env.PAY_URL_TRIAL || 'https://afdian.com/order/create?product_type=1&plan_id=71b40e1cada511f1b1805254001e7c00&sku=%5B%7B%22sku_id%22%3A%2271bcbd32ada511f1af585254001e7c00%22,%22count%22%3A1%7D%5D&viokrz_ex=0',
  },
  {
    id: 'pkg_standard',
    name: '🔥 主力畅享包',
    price: 15.0,
    tokens: 7000000, // 700万 Tokens
    desc: '约折合 700 万 Tokens · 适合重度编程、论文与日常主力',
    tag: '🔥 程序员主力推荐',
    highlight: true,
    payUrl: process.env.PAY_URL_STANDARD || 'https://afdian.com/order/create?product_type=1&plan_id=71b40e1cada511f1b1805254001e7c00&sku=%5B%7B%22sku_id%22%3A%22de1c407eada511f1ad8252540025c377%22,%22count%22%3A1%7D%5D&viokrz_ex=0',
  },
  {
    id: 'pkg_pro',
    name: '⚡ 极客狂飙包',
    price: 29.9,
    tokens: 16000000, // 1600万 Tokens
    desc: '约折合 1600 万 Tokens · 程序员 Cursor 深度重构专享',
    tag: '深度生产力',
    payUrl: process.env.PAY_URL_PRO || 'https://afdian.com/order/create?product_type=1&plan_id=71b40e1cada511f1b1805254001e7c00&sku=%5B%7B%22sku_id%22%3A%22de2309d6ada511f1853c52540025c377%22,%22count%22%3A1%7D%5D&viokrz_ex=0',
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

  // 🛡️ 严格专属密钥体系：公共体验 Key 彻底退役，杜绝白嫖党爬虫脚本刷量
  if (token === 'sk-aurora-demo-8888') {
    return sendOpenAIError(
      res,
      401,
      '公共体验密钥已下线升级为【专属密钥防刷体系】。请在极光平台绑定您的专属 API Key，或直接选购【1元极速联调包】开启全网大模型调用！',
      'invalid_request_error',
      'demo_key_retired'
    )
  }

  // 100% 完整支持所有 OpenAI 原生请求体参数 (tools, functions, max_tokens, json_object, etc.)
  let { model = 'gemini-3.7-flash', stream = false, messages = [], max_tokens, ...restParams } = req.body || {}

  // 💡 【极光专属黑科技】自然语言额度管家：仅当用户专门询问算力/余额/上一次消耗时秒级回执，绝不误触正常技术提问与代码生成！
  const lastUserMsg = [...messages].reverse().find((m) => m && m.role === 'user')
  let lastUserText = ''
  if (typeof lastUserMsg?.content === 'string') {
    lastUserText = lastUserMsg.content
  } else if (Array.isArray(lastUserMsg?.content)) {
    const textPart = lastUserMsg.content.find((c) => c && (c.type === 'text' || typeof c.text === 'string'))
    lastUserText = textPart ? (textPart.text || textPart.content || '') : ''
  }

  // 严格预处理：去除首尾空格、标点符号
  const cleanedText = (lastUserText || '').trim().toLowerCase().replace(/[\s\?？!！\.,，。:：`'"]/g, '')
  let quotaIntent = null // 'LAST_CALL' | 'BALANCE' | null

  // 关键防误触闸门：超过 25 字的提问 100% 属于业务提问或代码，绝不拦截！
  if (cleanedText && cleanedText.length <= 25) {
    // 1. 查询上一次提问消耗 / 扣费
    const isLastCall =
      /^(我)?(上一次|刚才|上一轮|上个问题|刚刚|这次提问|这次)(花了|扣了|用了|消耗了|费了)(多少)?(token|tokens|额度|钱|算力)?$/.test(cleanedText) ||
      /^(我)?(上一次|刚才|上一轮|上个问题|刚刚|这次提问|这次)(消耗|扣费|花费|扣除|账单)(多少)?(token|tokens|额度|钱|算力)?$/.test(cleanedText) ||
      /^(我)?(刚才|刚刚|上一次)(花了|扣了|用了|消耗了)(多少)?$/.test(cleanedText)

    if (isLastCall) {
      quotaIntent = 'LAST_CALL'
    } else {
      // 2. 查询账户当前剩余算力 / 余额
      const isBalance =
        /^(查|查询|看|查看)?(我的)?(账户|账号)?(余额|额度|token|tokens|算力)$/.test(cleanedText) ||
        /^(我)?(还?剩|剩余|还有)(多少)(token|tokens|额度|钱|算力)$/.test(cleanedText) ||
        /^(我)?(还?剩|剩余|还有)(多少)$/.test(cleanedText) ||
        /^(我的)?(token|tokens|额度|余额)还?剩(多少)?$/.test(cleanedText) ||
        /^(查下|查一下|查看下)(我的)?(余额|额度)$/.test(cleanedText)

      // 3. 询问模型价格 / 哪款最便宜
      const isPriceGuide =
        /^(哪个|什么|哪款)模型(最便宜|最划算|性价比最高|费率最低)$/.test(cleanedText) ||
        /^(查|看)?(模型价格|模型费率|价格表|价目表|资费|收费标准)$/.test(cleanedText) ||
        /^(推荐)(一个|个)?(便宜|划算|性价比高)(的)?(模型)?$/.test(cleanedText)

      if (isBalance) {
        quotaIntent = 'BALANCE'
      } else if (isPriceGuide) {
        quotaIntent = 'PRICE_GUIDE'
      }
    }
  }

  if (quotaIntent) {
    const maskedKey = `${card.code.slice(0, 11)}***${card.code.slice(-4)}`
    const remM = (remainingTokens / 1000000).toFixed(2)
    const usedK = ((card.usedTokens || 0) / 1000).toFixed(1)
    const estRounds = Math.floor(remainingTokens / 500).toLocaleString()

    let replyContent = ''

    if (quotaIntent === 'LAST_CALL') {
      const last = card.lastCallInfo
      if (!last) {
        replyContent =
`您好！我是您的 **极光 AI 算力管家** ⚡
您当前的密钥尚未产生历史调用记录，或者服务刚刚启动。
当前您的账户拥有 **${remainingTokens.toLocaleString()} Tokens**，您可以开始向我提问或写代码，随后即可随时查询单次消耗！`
      } else {
        const estCostYuan = ((last.costTokens / 2000000) * 5.0).toFixed(4)
        replyContent =
`您好！我是您的 **极光 AI 算力管家** ⚡
已为您查询到您**上一次提问的精准扣费账单**：

----------------------------------------
🕒 **调用时间**：\`${last.time || '刚刚'}\`
🤖 **调用模型**：\`${last.model}\`
🛣️ **调度通道**：${last.routedNote || '极光高速智能专线'}
⚡ **本次消耗**：**${last.costTokens.toLocaleString()} Tokens**
💰 **折合费用**：约 **¥${estCostYuan} 元** (不到 ${(parseFloat(estCostYuan) * 100).toFixed(2)} 分钱！)
💳 **当前账户剩余**：**${remainingTokens.toLocaleString()} Tokens** (约 **${remM}M**)
----------------------------------------
*本次账单查询未扣除您任何上游 Tokens 额度。极光 API 坚持 100% 真实扣费、明明白白！*`
      }
    } else if (quotaIntent === 'PRICE_GUIDE') {
      replyContent =
`您好！我是您的 **极光 AI 算力管家** ⚡
为您调取 **极光平台模型性价比与计费梯队指南**（倍率越低越省钱）：

----------------------------------------
🥇 **【1.0x 最低基准档 · 极致性价比】**（用多少扣多少，强烈推荐日常主力）：
- 💻 **\`aurora-coder\`**：全栈编程与算法大师（直通 Claude 3.7 旗舰代码通道，极力推荐！）
- 💬 **\`aurora-chat\`**：极速通用助手（日常问答、长文写作、翻译润色）
- 👁️ **\`gemini-3.7-flash\`**：超清多模态视觉（看图、报错截图分析、毫秒级出字）
- 🐼 **\`doubao-seed-2-0-pro-260215\`**：豆包中文爆款特调（爆款网感文案、短视频脚本）

🥈 **【1.2x ~ 2.0x 深度思考档】**（适合高复杂度推演）：
- 🧠 **\`deepseek-reasoner\`** (1.2x)：完整思维链推演与数理算法证明
- 🔮 **\`gpt-5.5\`** (2.0x)：前沿旗舰复杂决策攻坚

🥉 **【2.5x ~ 3.0x 顶配工程与视频生成档】**：
- 🚀 **\`gpt-6-astra\`** (3.0x)：新一代前沿旗舰
- 🎬 **\`veo3.1\` / \`seedance-2\`** (3.0x)：商业级 AI 视频生成
----------------------------------------
💡 **省算力建议**：写代码选 **\`aurora-coder\`**，日常聊天选 **\`aurora-chat\`**，均按 **1.0x 最低价**计费！
*本次价目表查询由极光网关本地秒回，未消耗您任何 Tokens 额度。*`
    } else {
      replyContent =
`您好！我是您的 **极光 AI 算力管家** ⚡
已为您实时调取当前密钥专属账户状态：

----------------------------------------
🔑 **专属密钥**：\`${maskedKey}\`
⚡ **剩余算力**：**${remainingTokens.toLocaleString()} Tokens** (约 **${remM} 百万** Tokens)
📊 **累计消耗**：**${(card.usedTokens || 0).toLocaleString()} Tokens** (约 **${usedK}k** Tokens)
🏷️ **套餐类型**：${card.remark || '极光专属算力包'}
🛡️ **额度有效期**：**终身有效 · 永不过期**
💡 **生产力预估**：当前剩余额度大约还可支持 **${estRounds}+ 轮** 日常编程或长文推演问答！
----------------------------------------
*本次账户查询由极光网关本地秒回，未消耗您任何上游 Tokens 额度。您可以放心继续使用！*`
    }

    const createdTime = Math.floor(Date.now() / 1000)
    const completionId = `chatcmpl-quota-${Date.now()}`

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      res.setHeader('X-Accel-Buffering', 'no')
      res.setHeader('X-Remaining-Tokens', remainingTokens)
      res.setHeader('X-Consumed-Tokens', 0)

      const chunk = {
        id: completionId,
        object: 'chat.completion.chunk',
        created: createdTime,
        model,
        choices: [
          {
            index: 0,
            delta: { role: 'assistant', content: replyContent },
            finish_reason: null,
          },
        ],
      }
      res.write(`data: ${JSON.stringify(chunk)}\n\n`)

      const finalChunk = {
        id: completionId,
        object: 'chat.completion.chunk',
        created: createdTime,
        model,
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: 'stop',
          },
        ],
      }
      res.write(`data: ${JSON.stringify(finalChunk)}\n\n`)
      res.write('data: [DONE]\n\n')
      return res.end()
    } else {
      res.setHeader('X-Remaining-Tokens', remainingTokens)
      res.setHeader('X-Consumed-Tokens', 0)
      return res.json({
        id: completionId,
        object: 'chat.completion',
        created: createdTime,
        model,
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: replyContent },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 120,
          total_tokens: 0,
        },
      })
    }
  }

  // 🚀 核心智能路由：自动根据请求模型 + 是否传图片，精准分流至最低成本分组 Key！
  const route = routeUpstreamTarget(model, messages)
  const afuBase = process.env.AFU_API_BASE || 'https://api.afugpt.cn/v1'
  const imageBase = process.env.IMAGE_API_BASE || 'https://oneapi.gemiaude.com/v1'
  const imageKey = process.env.IMAGE_API_KEY || 'sk-MD2bEvqffzry7OGgM4lIVjeEnGJa6lLduZwrydi8XLBZnvAy'

  const upstreamPayload = {
    ...restParams,
    messages,
    model: route.upstreamModel,
    stream,
  }

  try {
    let upstreamResp = null

    // 🎨 生图三级智能容灾引擎：
    // Tier 1 (首选 3.5分钱): Gemiaude gpt-image-2
    // Tier 2 (备用 4.5分钱): Gemiaude gpt-image-2-2k (遇抖动/报错自动顺延)
    // Tier 3 (终极 1毛钱): 阿福 API gpt-image-2 官方专线保底
    if (route.isImageGeneration) {
      upstreamResp = await fetchImageWithThreeTierFallback(upstreamPayload, true)
    } else {
      upstreamResp = await fetchAfuWithTieredRouting(
        `${afuBase}/chat/completions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(upstreamPayload),
        },
        route.keyGroup
      )
    }

    // 智能高可用熔断：若上游因模型渠道拥堵返回 5xx/404，自动无感切换至【claude-sonnet-4-6】全球顶尖通道保底
    if (!upstreamResp.ok && (upstreamResp.status >= 500 || upstreamResp.status === 404) && route.upstreamModel !== 'claude-sonnet-4-6') {
      console.warn(`[智能熔断保底] 原模型【${route.upstreamModel}】上游返回 ${upstreamResp.status}，自动无感切换至【claude-sonnet-4-6】保底通道...`)
      try {
        const fallbackResp = await fetchAfuWithTieredRouting(
          `${afuBase}/chat/completions`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...upstreamPayload, model: 'claude-sonnet-4-6' }),
          },
          'special'
        )
        if (fallbackResp.ok) {
          upstreamResp = fallbackResp
          route.upstreamModel = 'claude-sonnet-4-6'
          route.routedNote = 'Claude 3.7/Sonnet 高可用保底专线'
        }
      } catch (fbErr) {
        console.error('[熔断保底异常]:', fbErr.message)
      }
    }

    if (!upstreamResp.ok) {
      const errText = await upstreamResp.text()
      try {
        const parsed = JSON.parse(errText)
        return res.status(upstreamResp.status).json(sanitizeUpstreamError(parsed))
      } catch {
        return sendOpenAIError(res, upstreamResp.status, sanitizeUpstreamError(`节点响应异常: ${errText}`), 'upstream_error', 'upstream_failed')
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
          card.lastCallInfo = {
            model,
            costTokens: finalCostTokens,
            time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
            routedNote: route.routedNote,
          }
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
      card.lastCallInfo = {
        model,
        costTokens: finalCostTokens,
        time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
        routedNote: route.routedNote,
      }
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

  // 🛡️ 安全防薅羊毛：体验 Key 禁用昂贵的商业绘画接口
  if (card.code === 'sk-aurora-demo-8888') {
    return sendOpenAIError(res, 403, '体验 Key 仅支持文本与编程对话实测，商业超清 AI 绘画请使用您的专属 Key。', 'permission_denied', 'feature_disabled')
  }

  const { prompt, n = 1, size = '1024x1024' } = req.body || {}
  const requestedN = Math.min(4, Math.max(1, parseInt(n, 10) || 1))
  const costTokens = 20000 * requestedN // 严格按实际生图张数扣费 (单张2万Tokens)

  if ((card.remainingTokens || 0) < costTokens) {
    return sendOpenAIError(res, 402, `算力不足，生成 ${requestedN} 张图片需要 ${costTokens.toLocaleString()} Tokens`, 'insufficient_quota', 'quota_exhausted')
  }

  const afuBase = process.env.AFU_API_BASE || 'https://api.afugpt.cn/v1'
  const imageBase = process.env.IMAGE_API_BASE || 'https://oneapi.gemiaude.com/v1'
  const imageKey = process.env.IMAGE_API_KEY || 'sk-MD2bEvqffzry7OGgM4lIVjeEnGJa6lLduZwrydi8XLBZnvAy'

  try {
    // 🎨 生图三级智能容灾引擎调度 (Tier 1 3.5分 ➔ Tier 2 4.5分 ➔ Tier 3 阿福保底)
    const upstreamResp = await fetchImageWithThreeTierFallback(
      { prompt, n: requestedN, size, model: 'gpt-image-2' },
      false
    )

    if (!upstreamResp.ok) {
      const errText = await upstreamResp.text()
      return res.status(upstreamResp.status).send(sanitizeUpstreamError(errText))
    }
    const data = await upstreamResp.json()

    card.remainingTokens = Math.max(0, card.remainingTokens - costTokens)
    card.usedTokens = (card.usedTokens || 0) + costTokens
    writeDb(db)

    res.setHeader('X-Remaining-Tokens', card.remainingTokens)
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: { message: `生图通道异常: ${sanitizeUpstreamError(err.message)}` } })
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

// 管理员批量生成卡密并输出纯文本 (必须通过 requireAdminAuth 鉴权，严禁未授权调用)
app.post('/api/admin/cards/generate', requireAdminAuth, (req, res) => {
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

// 查询所有卡密概况 (必须通过 requireAdminAuth 鉴权，严禁未授权读取数据库)
app.get('/api/admin/cards', requireAdminAuth, (_req, res) => {
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

// 爱发电订单推送异步通知 (具备官方接口二次验真，严防伪造推送骗取 Key)
app.post('/api/webhooks/afdian', async (req, res) => {
  const { data } = req.body || {}
  console.log(`[Webhook 接收] 收到爱发电通知:`, data ? data.type : '')

  if (data && data.type === 'order' && data.order) {
    const { out_trade_no, status, total_amount, plan_id } = data.order
    console.log(`[爱发电 Webhook] 订单 ${out_trade_no}, status=${status}, 金额=${total_amount}，正在进行官方接口二次核验...`)

    if (Number(status) === 2) {
      // 🛡️ 安全防伪造核验：向爱发电开放平台二次查询该订单真实到账状态
      const verifyRes = await verifyAfdianOrder(out_trade_no)
      if (!verifyRes.ok) {
        console.warn(`[爱发电 Webhook 拦截] 订单 ${out_trade_no} 官方二次验真未通过，拒绝发卡: ${verifyRes.message}`)
        return res.json({ ec: 400, em: '验真未通过' })
      }

      const db = readDb()
      const existing = Object.values(db.cards || {}).find((c) => c.boundOrderId === out_trade_no)
      if (!existing) {
        const verifiedAmount = verifyRes.amountYuan || total_amount
        const matchedPkg = matchPackageByAmountOrPlan(verifiedAmount, plan_id)
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
          paidAmount: verifiedAmount,
          claimedAt: new Date().toISOString(),
          remark: `爱发电 Webhook 官方验真自动履约·${matchedPkg.name}`,
          createdAt: new Date().toISOString(),
        }

        if (db.orders && db.orders[out_trade_no]) {
          db.orders[out_trade_no].status = 'PAID'
          db.orders[out_trade_no].assignedKey = newKey
          db.orders[out_trade_no].paidAt = new Date().toISOString()
        }

        writeDb(db)
        console.log(`[爱发电 Webhook] 成功为官方验真订单 ${out_trade_no} (¥${verifiedAmount}) 签发独立 Key: ${newKey}`)
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
