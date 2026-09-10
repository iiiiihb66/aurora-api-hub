import crypto from 'crypto'

/**
 * 计算面包多 (MBD) 签名
 * 规则：参数按 ASCII 升序排序，拼为 key=val&... ，末尾追加 &key=APP_KEY 后进行 MD5 计算
 */
export function signMbdParams(params, appKey) {
  if (!appKey) return ''
  const keys = Object.keys(params)
    .filter((k) => k !== 'sign' && params[k] !== undefined && params[k] !== null && params[k] !== '')
    .sort()
  const stringA = keys.map((k) => `${k}=${params[k]}`).join('&')
  const toSign = `${stringA}&key=${appKey}`
  return crypto.createHash('md5').update(toSign, 'utf8').digest('hex').toLowerCase()
}

/**
 * 计算爱发电 (Afdian) 签名
 * 规则：md5(token + "params" + paramsJson + "ts" + ts + "user_id" + user_id)
 */
export function signAfdianParams({ userId, token, paramsJson, ts }) {
  if (!token || !userId) return ''
  const raw = `${token}params${paramsJson}ts${ts}user_id${userId}`
  return crypto.createHash('md5').update(raw, 'utf8').digest('hex').toLowerCase()
}

/**
 * 调用面包多官方接口验真订单
 * @param {string} outTradeNo 订单号或微信/支付宝流水号
 * @returns {Promise<{ ok: boolean, data?: any, error?: string, message?: string }>}
 */
export async function verifyMbdOrder(outTradeNo) {
  const appId = process.env.MBD_APP_ID || ''
  const appKey = process.env.MBD_APP_KEY || ''

  if (!appId || !appKey) {
    return {
      ok: false,
      error: 'MBD_CREDENTIALS_MISSING',
      message: '服务器尚未配置面包多 MBD_APP_ID 或 MBD_APP_KEY',
    }
  }

  const sign = signMbdParams({ out_trade_no: outTradeNo, app_id: appId }, appKey)

  try {
    const res = await fetch('https://newapi.mbd.pub/release/main/search_order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        out_trade_no: outTradeNo,
        app_id: appId,
        sign,
      }),
    })

    const data = await res.json()

    if (data.error) {
      return { ok: false, error: 'MBD_API_ERROR', message: data.error }
    }

    // state: 0-未支付，1-已支付，2-已结算
    const state = Number(data.state)
    const refundState = Number(data.refund_state || 0)
    const amountCents = Number(data.amount || 0)

    if (state !== 1 && state !== 2) {
      return {
        ok: false,
        error: 'ORDER_NOT_PAID',
        message: `面包多订单状态为未支付 (state=${state})`,
        raw: data,
      }
    }

    if (refundState === 2) {
      return {
        ok: false,
        error: 'ORDER_REFUNDED',
        message: '该订单已全额退款，不可用于领卡',
        raw: data,
      }
    }

    return {
      ok: true,
      platform: 'mbd',
      outTradeNo: data.order_id || outTradeNo,
      chargeId: data.charge_id,
      amountYuan: (amountCents / 100).toFixed(2),
      amountCents,
      description: data.description,
      state,
      raw: data,
    }
  } catch (err) {
    return {
      ok: false,
      error: 'NETWORK_ERROR',
      message: `请求面包多接口失败: ${err.message}`,
    }
  }
}

/**
 * 调用爱发电官方接口验真订单
 * @param {string} outTradeNo 爱发电订单号
 * @returns {Promise<{ ok: boolean, data?: any, error?: string, message?: string }>}
 */
export async function verifyAfdianOrder(outTradeNo) {
  const userId = process.env.AFDIAN_USER_ID || ''
  const token = process.env.AFDIAN_TOKEN || ''

  if (!userId || !token) {
    return {
      ok: false,
      error: 'AFDIAN_CREDENTIALS_MISSING',
      message: '服务器尚未配置爱发电 AFDIAN_USER_ID 或 AFDIAN_TOKEN',
    }
  }

  const ts = Math.floor(Date.now() / 1000)
  const paramsJson = JSON.stringify({ out_trade_no: outTradeNo })
  const sign = signAfdianParams({ userId, token, paramsJson, ts })

  try {
    const res = await fetch('https://afdian.com/api/open/query-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        params: paramsJson,
        ts,
        sign,
      }),
    })

    const data = await res.json()

    if (data.ec !== 200) {
      return {
        ok: false,
        error: 'AFDIAN_API_ERROR',
        message: data.em || `爱发电接口返回错误码 ${data.ec}`,
      }
    }

    const orderList = data.data?.list || []
    const target = orderList.find((o) => o.out_trade_no === outTradeNo) || orderList[0]

    if (!target) {
      return {
        ok: false,
        error: 'ORDER_NOT_FOUND',
        message: '爱发电未找到该订单记录',
      }
    }

    // status === 2 表示交易成功
    if (Number(target.status) !== 2) {
      return {
        ok: false,
        error: 'ORDER_NOT_PAID',
        message: `爱发电订单状态为未完成 (status=${target.status})`,
        raw: target,
      }
    }

    const amountYuan = parseFloat(target.total_amount || 0).toFixed(2)
    const amountCents = Math.round(parseFloat(target.total_amount || 0) * 100)

    return {
      ok: true,
      platform: 'afdian',
      outTradeNo: target.out_trade_no || outTradeNo,
      amountYuan,
      amountCents,
      planId: target.plan_id,
      state: target.status,
      raw: target,
    }
  } catch (err) {
    return {
      ok: false,
      error: 'NETWORK_ERROR',
      message: `请求爱发电接口失败: ${err.message}`,
    }
  }
}

/**
 * 智能验真分发器：自动尝试面包多与爱发电官方查询
 * @param {string} orderId 订单号
 * @param {string} [platformHint='auto'] 平台提示 ('mbd', 'afdian', 'auto')
 * @returns {Promise<{ ok: boolean, platform?: string, outTradeNo?: string, amountYuan?: string, error?: string, message?: string }>}
 */
export async function verifyOrder(orderId, platformHint = 'auto') {
  const trimOrder = String(orderId || '').trim()
  if (!trimOrder) {
    return { ok: false, error: 'INVALID_ORDER', message: '订单号不能为空' }
  }

  // 1. 如果指定了面包多
  if (platformHint === 'mbd') {
    return await verifyMbdOrder(trimOrder)
  }

  // 2. 如果指定了爱发电
  if (platformHint === 'afdian') {
    return await verifyAfdianOrder(trimOrder)
  }

  // 3. auto 智能模式：优先尝试面包多（因为支持微信/支付宝流水号及纯数字订单）
  const mbdRes = await verifyMbdOrder(trimOrder)
  if (mbdRes.ok) return mbdRes

  // 若面包多未查到或面包多未配置，再尝试爱发电
  const afdianRes = await verifyAfdianOrder(trimOrder)
  if (afdianRes.ok) return afdianRes

  // 两个平台都未能成功验证
  return {
    ok: false,
    error: 'VERIFICATION_FAILED',
    message: mbdRes.message || afdianRes.message || '官方系统未能查到该有效付款凭证',
    details: { mbd: mbdRes, afdian: afdianRes },
  }
}
