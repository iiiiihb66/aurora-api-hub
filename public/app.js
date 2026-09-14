// ==========================================================
// 🌌 AURORA API · Modern Interactive Application Logic
// Inspired by Vancouver AI Project (Northframe Concept) & ReactBits
// Fully compatible with Cloudflare Pages & Standalone Deployments
// ==========================================================

// 1. 基础状态管理
// 1. 基础状态管理：全面采用专属密钥体系，杜绝公共池被薅羊毛
let currentKey = localStorage.getItem('aurora_api_key') || ''
if (currentKey === 'sk-aurora-demo-8888') {
  currentKey = ''
  localStorage.removeItem('aurora_api_key')
}

// 获取配置的网关基础地址 (优先读取用户自定义网关，默认相对路径或当前主机)
function getGatewayUrl() {
  const customGateway = localStorage.getItem('aurora_gateway_url')
  if (customGateway && customGateway.trim()) {
    return customGateway.trim().replace(/\/+$/, '')
  }
  return window.location.origin
}

function getBaseUrl() {
  return `${getGatewayUrl()}/v1`
}

// 2. 初始化页面应用
function initApp() {
  const baseUrlEl = document.getElementById('display-base-url')
  const currentKeyEl = document.getElementById('display-current-key')
  const statusTitleEl = document.getElementById('card-status-title')
  const remainingEl = document.getElementById('stat-remaining-tokens')
  const usedEl = document.getElementById('stat-used-tokens')
  const remarkEl = document.getElementById('card-remark')

  const baseUrl = getBaseUrl()
  if (baseUrlEl) baseUrlEl.innerText = baseUrl

  if (currentKey) {
    if (currentKeyEl) currentKeyEl.innerText = currentKey
    if (statusTitleEl) statusTitleEl.innerText = `当前密钥：${currentKey}`
    fetchKeyBalance()
  } else {
    if (currentKeyEl) {
      currentKeyEl.innerHTML = `<span style="color: #f59e0b; cursor: pointer; text-decoration: underline;" onclick="promptSwitchKey()">⚠️ 未绑定专属密钥 (点击绑定)</span>`
    }
    if (statusTitleEl) statusTitleEl.innerHTML = `<span style="color: #f59e0b;">⚠️ 尚未绑定专属 API Key</span>`
    if (remainingEl) remainingEl.innerText = `-- Tokens`
    if (usedEl) usedEl.innerText = `0 Tokens`
    if (remarkEl) remarkEl.innerText = `未激活`
  }

  // 同步指引步骤中的 URL
  const g1 = document.getElementById('guide-base-url-1')
  const g2 = document.getElementById('guide-base-url-2')
  if (g1) g1.innerText = baseUrl
  if (g2) g2.innerText = baseUrl

  initPointerGlow()
}

// 3. 全局光标跟随微光系统 (Pointer Glow Engine)
function initPointerGlow() {
  document.documentElement.style.setProperty('--pointer-x', '50vw')
  document.documentElement.style.setProperty('--pointer-y', '35vh')

  const moveGlow = (event) => {
    document.documentElement.style.setProperty('--pointer-x', `${event.clientX}px`)
    document.documentElement.style.setProperty('--pointer-y', `${event.clientY}px`)
  }

  window.addEventListener('pointermove', moveGlow, { passive: true })
}

// 4. 算力包分类筛选器 (Package Filter Engine)
function filterPackages(category) {
  const buttons = document.querySelectorAll('.filter-bar button')
  buttons.forEach((b) => b.classList.remove('active'))

  const currentBtn = event?.currentTarget
  if (currentBtn) currentBtn.classList.add('active')

  const cards = document.querySelectorAll('.pricing-grid .pricing-card')
  cards.forEach((card) => {
    const cardCat = card.getAttribute('data-category')
    if (category === 'All' || cardCat === category) {
      card.style.display = 'flex'
    } else {
      card.style.display = 'none'
    }
  })
}

// 5. 现代化吐司通知 (Toast Notification)
let toastTimer = null
function showToast(message, icon = '✨', duration = 2500) {
  const toast = document.getElementById('modern-toast')
  const toastMsg = document.getElementById('toast-msg')
  const toastIcon = document.getElementById('toast-icon')
  if (!toast || !toastMsg) return

  if (toastTimer) clearTimeout(toastTimer)
  toastMsg.innerText = message
  if (toastIcon) toastIcon.innerText = icon
  toast.classList.add('show')

  toastTimer = setTimeout(() => {
    toast.classList.remove('show')
  }, duration)
}

// 6. 晶体黑曜石模态框 (Glass Modal Dialog)
function openModal({ title, bodyHtml, confirmText = '确定', cancelText = '取消', onConfirm, onCancel }) {
  const backdrop = document.getElementById('glass-modal-backdrop')
  const titleEl = document.getElementById('modal-title')
  const bodyEl = document.getElementById('modal-body')
  const confirmBtn = document.getElementById('btn-modal-confirm')
  const cancelBtn = document.getElementById('btn-modal-cancel')

  if (!backdrop) return
  titleEl.innerHTML = title
  bodyEl.innerHTML = bodyHtml
  confirmBtn.innerText = confirmText

  if (cancelText) {
    cancelBtn.style.display = 'inline-block'
    cancelBtn.innerText = cancelText
  } else {
    cancelBtn.style.display = 'none'
  }

  confirmBtn.onclick = () => {
    if (onConfirm) {
      const shouldClose = onConfirm()
      if (shouldClose === false) return
    }
    closeModal()
  }

  cancelBtn.onclick = () => {
    if (onCancel) onCancel()
    closeModal()
  }

  backdrop.classList.add('show')
}

function closeModal() {
  const backdrop = document.getElementById('glass-modal-backdrop')
  if (backdrop) backdrop.classList.remove('show')
}

// 7. 查询当前 Key 的余额与用量
async function fetchKeyBalance() {
  try {
    const res = await fetch(`${getGatewayUrl()}/v1/user/balance?key=${encodeURIComponent(currentKey)}`)
    if (!res.ok) return
    const data = await res.json()
    if (data.ok) {
      const remaining = data.remainingTokens || 0
      const used = data.usedTokens || 0
      const remainingEl = document.getElementById('stat-remaining-tokens')
      const usedEl = document.getElementById('stat-used-tokens')
      const remarkEl = document.getElementById('card-remark')

      if (remainingEl) remainingEl.innerText = `${remaining.toLocaleString()} Tokens`
      if (usedEl) usedEl.innerText = `${used.toLocaleString()} Tokens`
      if (remarkEl && data.remark) {
        remarkEl.innerText = data.remark
      }
    }
  } catch (err) {
    console.warn('查询余额异常:', err)
  }
}

// 8. 复制辅助函数 (带动画与反馈)
function triggerCopyAnimation(buttonEl) {
  if (!buttonEl) return
  const originalText = buttonEl.innerText
  buttonEl.innerText = '✓ COPIED'
  buttonEl.classList.add('btn-copied-success')
  setTimeout(() => {
    buttonEl.innerText = originalText
    buttonEl.classList.remove('btn-copied-success')
  }, 1800)
}

function copyBaseUrl(e) {
  const url = getBaseUrl()
  navigator.clipboard.writeText(url).then(() => {
    triggerCopyAnimation(e?.currentTarget || document.getElementById('btn-copy-base-url'))
    showToast('Base URL 已复制到剪贴板', '📋')
  })
}

function copyCurrentKey(e) {
  if (!currentKey) {
    showToast('您尚未绑定专属 API Key，请先点击绑定或前往购买！', '⚠️')
    promptSwitchKey()
    return
  }
  navigator.clipboard.writeText(currentKey).then(() => {
    triggerCopyAnimation(e?.currentTarget || document.getElementById('btn-copy-api-key'))
    showToast('专属 API Key 已复制到剪贴板', '🔑')
  })
}

// 快速弹窗绑定密钥辅助函数
function bindQuickModalKey() {
  const input = document.getElementById('modal-quick-key-input')
  const val = (input?.value || '').trim()
  if (!val) {
    showToast('请输入有效的 API Key', '⚠️')
    return
  }
  currentKey = val
  localStorage.setItem('aurora_api_key', currentKey)
  closeModal()
  initApp()
  showToast('专属 API Key 已成功绑定！您现在可以畅享所有模型实测！', '🎉')
}

// 9. 切换 / 绑定 API Key 模态框
function promptSwitchKey() {
  const bodyHtml = `
    <div style="font-size: 13px; color: var(--muted); margin-bottom: 8px;">
      请输入您在爱发电/面包多购买获得的专属 API 密钥 (例如：sk-aurora-xxxx)
    </div>
    <input type="text" id="modal-key-input" class="modal-input" value="${currentKey}" placeholder="sk-aurora-xxxx" />
    <div style="font-size: 12px; color: var(--electric); margin-top: 10px;">
      💡 提示：输入后将自动保存在当前浏览器本地，并在所有终端测试与教程中实时同步。
    </div>
  `

  openModal({
    title: '🔑 切换 / 绑定专属 API Key',
    bodyHtml,
    confirmText: '⚡ 立即激活绑定',
    onConfirm: () => {
      const input = document.getElementById('modal-key-input')
      const val = (input?.value || '').trim()
      if (!val) {
        showToast('请输入有效的 API Key', '⚠️')
        return false
      }
      currentKey = val
      localStorage.setItem('aurora_api_key', currentKey)
      initApp()
      showToast('API Key 已成功切换！', '🎉')
      return true
    },
  })

  setTimeout(() => {
    const input = document.getElementById('modal-key-input')
    if (input) {
      input.focus()
      input.select()
    }
  }, 100)
}

// 10. 配置后端网关地址 (专为 Cloudflare Pages / 跨域部署设计)
function promptConfigureGateway() {
  const currentGateway = getGatewayUrl()
  const bodyHtml = `
    <div style="font-size: 13px; color: var(--muted); margin-bottom: 8px;">
      当您将前端静态托管在 <strong>Cloudflare Pages</strong> 时，可在此指定后端网关服务器地址：
    </div>
    <input type="text" id="modal-gateway-input" class="modal-input" value="${currentGateway}" placeholder="例如 https://api.yourdomain.com 或留空使用同域" />
    <div style="font-size: 12px; color: #94a3b8; margin-top: 10px; line-height: 1.6;">
      🌐 <strong>Cloudflare Pages 部署说明</strong>：<br>
      • 若通过 Cloudflare <code>_redirects</code> 反向代理，保持默认同域即可。<br>
      • 若后端运行在独立云服务器/Docker，填入公网后端 URL 即可毫秒直连。
    </div>
  `

  openModal({
    title: '⚙️ 配置后端 API 网关地址',
    bodyHtml,
    confirmText: '💾 保存设置',
    onConfirm: () => {
      const input = document.getElementById('modal-gateway-input')
      const val = (input?.value || '').trim().replace(/\/+$/, '')
      if (val && val !== window.location.origin) {
        localStorage.setItem('aurora_gateway_url', val)
      } else {
        localStorage.removeItem('aurora_gateway_url')
      }
      initApp()
      showToast('网关配置已更新！', '🚀')
      return true
    },
  })
}

// 11. 点击模型卡片快速选定
function selectTestModel(modelId) {
  const selectEl = document.getElementById('test-model-select')
  if (selectEl) {
    selectEl.value = modelId
    scrollToSection('playground-section')
    showToast(`已选择模型：${modelId}`, '🎯')
  }
}

// 平滑滚动
function scrollToSection(id) {
  const el = document.getElementById(id)
  if (el) el.scrollIntoView({ behavior: 'smooth' })
}

// 12. 卡密激活与兑换逻辑 (输入卡密兑换码，秒级到账)
async function handleRedeem() {
  const inputEl = document.getElementById('redeem-input')
  const code = (inputEl?.value || '').trim()

  if (!code) {
    showToast('请输入您在面包多购买获得的卡密兑换码！', '⚠️')
    if (inputEl) inputEl.focus()
    return
  }

  const btn = event?.target
  if (btn) btn.innerText = '⏳ 激活中...'

  try {
    const res = await fetch(`${getGatewayUrl()}/api/card/redeem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, targetKey: currentKey }),
    })
    const data = await res.json()

    if (!data.ok) {
      showToast(data.error || '兑换失败，卡密无效或已被使用', '❌')
      return
    }

    if (data.activeKey) {
      currentKey = data.activeKey
      localStorage.setItem('aurora_api_key', currentKey)
    }

    showToast(data.message || '🎉 恭喜！卡密已成功兑换激活！', '🎉')
    if (inputEl) inputEl.value = ''
    initApp()
  } catch (err) {
    showToast(`请求异常: ${err.message}`, '❌')
  } finally {
    if (btn) btn.innerText = '⚡ 立即激活'
  }
}

// 13. 算力购买与支付直达 (Glass Modal 替代原生 Confirm)
async function handleBuy(packageId) {
  try {
    const res = await fetch(`${getGatewayUrl()}/api/packages`)
    const data = await res.json()
    const pkg = (data.packages || []).find((p) => p.id === packageId) || {
      name: '算力包',
      price: 5,
      tokens: 2000000,
      payUrl: 'https://mbd.pub/o/bread/mbd-YZaVlJtrag==',
    }

    const isMbd = (pkg.payUrl || '').includes('mbd.pub')
    const platformName = isMbd ? '面包多' : '爱发电'

    const bodyHtml = `
      <div style="background: rgba(4, 7, 16, 0.8); padding: 18px; border: 1px solid var(--line); margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span style="font-size: 16px; font-weight: 700; color: #fff;">${pkg.name}</span>
          <span style="font-size: 22px; font-weight: 800; color: var(--electric);">¥${pkg.price} <span style="font-size: 12px; color: var(--muted);">元</span></span>
        </div>
        <div style="font-size: 13px; color: var(--electric); font-weight: bold; font-family: var(--font-mono);">
          🎁 包含算力：${(pkg.tokens / 1000000).toFixed(1)} 百万 Tokens · 永久不过期
        </div>
      </div>

      <div style="font-size: 13px; color: var(--muted); line-height: 1.8;">
        <strong>🛒 极速出卡与履约流程：</strong><br>
        1. 点击下方按钮将前往【${platformName}】官方安全收银台；<br>
        2. 使用微信或支付宝扫码支付 ¥${pkg.price} 元；<br>
        3. 付款成功后，凭订单号在【订单提卡中心】可秒级提取属于您的专属独立 Key；<br>
        4. 系统严格承诺<strong>一人一密·终身独享</strong>。
      </div>
    `

    openModal({
      title: `💳 选购 ${pkg.name}`,
      bodyHtml,
      confirmText: `🚀 前往${platformName}支付 ¥${pkg.price}`,
      onConfirm: async () => {
        try {
          // 在极光本地创建待支付订单
          fetch(`${getGatewayUrl()}/api/pay/order/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ packageId: pkg.id }),
          }).catch(() => {})
        } catch (_) {}

        window.open(pkg.payUrl || 'https://mbd.pub/o/bread/mbd-YZaVlJtrag==', '_blank')
        showToast('已为您打开官方收银台！付款后凭订单号前往【提卡中心】即可秒级提取专属 Key', '🛒', 4500)
        return true
      },
    })
  } catch (err) {
    showToast(`获取商品详情异常: ${err.message}`, '❌')
  }
}

// 14. 在线终端演练场执行调用 (macOS 终端流式 SSE 打字机)
async function executePlaygroundTest() {
  if (!currentKey) {
    openModal({
      title: '🔑 请先绑定您的专属 API Key',
      bodyHtml: `
        <div style="font-size: 13.5px; color: var(--text-secondary); line-height: 1.6; margin-bottom: 14px;">
          为了保证平台算力质量并杜绝黑产自动化刷卡，在线终端演练场采用<strong>「专属密钥实测机制」</strong>。<br/>
          请先绑定您已持有的专属密钥，或直接获取 <strong>1 元极速联调包</strong>：
        </div>
        <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 14px; margin-bottom: 14px;">
          <label style="font-size: 12px; color: var(--text-secondary); display: block; margin-bottom: 6px;">已持有 Key？直接在此粘贴绑定：</label>
          <div style="display: flex; gap: 8px;">
            <input type="text" id="modal-quick-key-input" class="modal-input" placeholder="sk-aurora-xxxx" style="flex: 1; margin: 0;" />
            <button class="button button-primary" style="padding: 0 16px; font-size: 0.85rem; white-space: nowrap; height: 38px;" onclick="bindQuickModalKey()">⚡ 立即绑定</button>
          </div>
        </div>
        <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 8px;">尚未拥有密钥？一键获取专属算力包（秒级自动发卡）：</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <a href="https://afdian.com/order/create?product_type=1&plan_id=71b40e1cada511f1b1805254001e7c00&sku=%5B%7B%22sku_id%22%3A%220235a01cada711f1879352540025c377%22,%22count%22%3A1%7D%5D&viokrz_ex=0" target="_blank" class="button button-secondary" style="text-align: center; font-size: 0.82rem; text-decoration: none; padding: 10px; border: 1px solid rgba(255,255,255,0.15);">🧪 1元极速联调包 (30万)</a>
          <a href="https://afdian.com/order/create?product_type=1&plan_id=71b40e1cada511f1b1805254001e7c00&sku=%5B%7B%22sku_id%22%3A%22de1c407eada511f1ad8252540025c377%22,%22count%22%3A1%7D%5D&viokrz_ex=0" target="_blank" class="button button-primary" style="text-align: center; font-size: 0.82rem; text-decoration: none; padding: 10px;">🔥 15元主力畅享包 (700万)</a>
        </div>
      `,
      confirmText: '稍后购买',
      onConfirm: () => true,
    })
    return
  }

  const promptInput = document.getElementById('test-prompt-input')
  const modelSelect = document.getElementById('test-model-select')
  const streamToggle = document.getElementById('test-stream-toggle')
  const outputBox = document.getElementById('terminal-output-box')
  const runBtn = document.getElementById('btn-run-test')

  const prompt = promptInput?.value?.trim() || '你好'
  const model = modelSelect?.value || 'gemini-3.7-flash'
  const isStream = streamToggle?.checked ?? true

  runBtn.disabled = true
  runBtn.innerText = '⏳ RESPONDING...'
  outputBox.innerHTML = `<span style="color: #64748b;">// 正在通过 ${model} 发起流式推理...</span>\n\n`

  try {
    const res = await fetch(`${getGatewayUrl()}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: isStream,
      }),
    })

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({ error: { message: '请求失败' } }))
      outputBox.innerHTML = `<span style="color: #ff5f56;">❌ [HTTP ${res.status} 错误]:\n${JSON.stringify(errJson, null, 2)}</span>`
      return
    }

    if (isStream && res.body) {
      const reader = res.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let fullText = ''
      outputBox.innerHTML = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const payload = trimmed.slice(5).trim()
          if (payload === '[DONE]') continue
          try {
            const parsed = JSON.parse(payload)
            const content = parsed.choices?.[0]?.delta?.content || ''
            if (content) {
              fullText += content
              outputBox.innerText = fullText
            }
          } catch {}
        }
      }
    } else {
      const data = await res.json()
      const content = data.choices?.[0]?.message?.content || JSON.stringify(data, null, 2)
      outputBox.innerText = content
    }

    // 成功后自动刷新余额
    setTimeout(fetchKeyBalance, 1000)
    showToast('调用成功，额度已自动扣除！', '⚡')
  } catch (err) {
    outputBox.innerHTML = `<span style="color: #ff5f56;">❌ 网络异常: ${err.message}</span>`
  } finally {
    runBtn.disabled = false
    runBtn.innerText = '⚡ EXECUTE CALL'
  }
}

// 14.4 展开/收起 66 款官方模型 ID 速查库抽屉
function toggleFullModelsDrawer() {
  const drawer = document.getElementById('full-models-drawer')
  if (drawer) {
    drawer.classList.toggle('active')
    if (drawer.classList.contains('active')) {
      drawer.scrollIntoView({ behavior: 'smooth', block: 'start' })
      showToast('已展开 66 款官方模型速查库，点击复制按钮可一键拷贝代号', '📋')
    }
  }
}

// 14.5 模型对照表分类筛选与搜索系统
function filterModelsByCategory(category) {
  const buttons = document.querySelectorAll('.model-table-filter-bar .model-filter-btn')
  buttons.forEach((b) => b.classList.remove('active'))

  const targetBtn = document.querySelector(`.model-table-filter-bar button[data-filter="${category}"]`)
  if (targetBtn) {
    targetBtn.classList.add('active')
  } else if (event?.currentTarget?.classList?.contains('model-filter-btn')) {
    event.currentTarget.classList.add('active')
  }

  // 重置搜索框
  const searchInput = document.getElementById('model-search-input')
  if (searchInput) searchInput.value = ''

  const rows = document.querySelectorAll('#models-matrix-table tbody tr')
  rows.forEach((row) => {
    const rowCategory = (row.getAttribute('data-category') || '').split(/\s+/)
    if (category === 'all' || rowCategory.includes(category)) {
      row.style.display = ''
    } else {
      row.style.display = 'none'
    }
  })

  // 如果从卡片直接点击筛选，平滑滚动至表格位置
  if (!event?.currentTarget?.classList?.contains('model-filter-btn')) {
    scrollToSection('models-matrix-table')
  }
}

// 实时搜索模型名称、别名、多模态特性
function handleModelSearch(keyword) {
  const kw = (keyword || '').toLowerCase().trim()
  const rows = document.querySelectorAll('#models-matrix-table tbody tr')

  // 如果处于搜索态，取消所有分类按钮的高亮
  if (kw) {
    const buttons = document.querySelectorAll('.model-table-filter-bar .model-filter-btn')
    buttons.forEach((b) => b.classList.remove('active'))
  }

  rows.forEach((row) => {
    const text = (row.innerText || '').toLowerCase()
    const tags = (row.getAttribute('data-tags') || '').toLowerCase()
    if (!kw || text.includes(kw) || tags.includes(kw)) {
      row.style.display = ''
    } else {
      row.style.display = 'none'
    }
  })
}

// 复制模型ID到剪贴板
async function copyModelId(modelId) {
  try {
    await navigator.clipboard.writeText(modelId)
    showToast(`已复制模型 ID: ${modelId}`, '📋')
  } catch (e) {
    const ta = document.createElement('textarea')
    ta.value = modelId
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    showToast(`已复制模型 ID: ${modelId}`, '📋')
  }
}

// 15. 页面加载完成后初始化
window.addEventListener('DOMContentLoaded', initApp)
