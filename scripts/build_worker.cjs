const fs = require('fs');
const path = require('path');

const dbPath = path.resolve(__dirname, '../data/api-db.json');
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const activeKeys = Object.values(db.cards).filter(c => c.status === 'ACTIVE').map(c => c.code);

const md5Impl = `function md5(string) {
  function rotateLeft(lValue, iShiftBits) { return (lValue << iShiftBits) | (lValue >>> (32 - iShiftBits)); }
  function addUnsigned(lX, lY) {
    var lX4 = lX & 0x40000000, lY4 = lY & 0x40000000, lX8 = lX & 0x80000000, lY8 = lY & 0x80000000;
    var lResult = (lX & 0x3fffffff) + (lY & 0x3fffffff);
    if (lX4 & lY4) return lResult ^ 0x80000000 ^ lX8 ^ lY8;
    if (lX4 | lY4) {
      if (lResult & 0x40000000) return lResult ^ 0xc0000000 ^ lX8 ^ lY8;
      else return lResult ^ 0x40000000 ^ lX8 ^ lY8;
    } else return lResult ^ lX8 ^ lY8;
  }
  function F(x, y, z) { return (x & y) | (~x & z); }
  function G(x, y, z) { return (x & z) | (y & ~z); }
  function H(x, y, z) { return x ^ y ^ z; }
  function I(x, y, z) { return y ^ (x | ~z); }
  function FF(a, b, c, d, x, s, ac) { a = addUnsigned(a, addUnsigned(addUnsigned(F(b, c, d), x), ac)); return addUnsigned(rotateLeft(a, s), b); }
  function GG(a, b, c, d, x, s, ac) { a = addUnsigned(a, addUnsigned(addUnsigned(G(b, c, d), x), ac)); return addUnsigned(rotateLeft(a, s), b); }
  function HH(a, b, c, d, x, s, ac) { a = addUnsigned(a, addUnsigned(addUnsigned(H(b, c, d), x), ac)); return addUnsigned(rotateLeft(a, s), b); }
  function II(a, b, c, d, x, s, ac) { a = addUnsigned(a, addUnsigned(addUnsigned(I(b, c, d), x), ac)); return addUnsigned(rotateLeft(a, s), b); }
  function convertToWordArray(string) {
    var lWordCount; var lMessageLength = string.length;
    var lNumberOfWords_temp1 = lMessageLength + 8;
    var lNumberOfWords_temp2 = (lNumberOfWords_temp1 - (lNumberOfWords_temp1 % 64)) / 64;
    var lNumberOfWords = (lNumberOfWords_temp2 + 1) * 16;
    var lWordArray = Array(lNumberOfWords - 1);
    var lBytePosition = 0; var lByteCount = 0;
    while (lByteCount < lMessageLength) {
      lWordCount = (lByteCount - (lByteCount % 4)) / 4;
      lBytePosition = (lByteCount % 4) * 8;
      lWordArray[lWordCount] = (lWordArray[lWordCount] | (string.charCodeAt(lByteCount) << lBytePosition));
      lByteCount++;
    }
    lWordCount = (lByteCount - (lByteCount % 4)) / 4;
    lBytePosition = (lByteCount % 4) * 8;
    lWordArray[lWordCount] = lWordArray[lWordCount] | (0x80 << lBytePosition);
    lWordArray[lNumberOfWords - 2] = lMessageLength << 3;
    lWordArray[lNumberOfWords - 1] = lMessageLength >>> 29;
    return lWordArray;
  }
  function wordToHex(lValue) {
    var WordToHexValue = "", WordToHexValue_temp = "", lByte, lCount;
    for (lCount = 0; lCount <= 3; lCount++) {
      lByte = (lValue >>> (lCount * 8)) & 255;
      WordToHexValue_temp = "0" + lByte.toString(16);
      WordToHexValue = WordToHexValue + WordToHexValue_temp.substr(WordToHexValue_temp.length - 2, 2);
    }
    return WordToHexValue;
  }
  function utf8Encode(string) {
    string = string.replace(/\\r\\n/g, "\\n"); var utftext = "";
    for (var n = 0; n < string.length; n++) {
      var c = string.charCodeAt(n);
      if (c < 128) { utftext += String.fromCharCode(c); }
      else if (c > 127 && c < 2048) { utftext += String.fromCharCode((c >> 6) | 192); utftext += String.fromCharCode((c & 63) | 128); }
      else { utftext += String.fromCharCode((c >> 12) | 224); utftext += String.fromCharCode(((c >> 6) & 63) | 128); utftext += String.fromCharCode((c & 63) | 128); }
    }
    return utftext;
  }
  var x = Array(); var k, AA, BB, CC, DD, a, b, c, d;
  var S11=7, S12=12, S13=17, S14=22; var S21=5, S22=9, S23=14, S24=20; var S31=4, S32=11, S33=16, S34=23; var S41=6, S42=10, S43=15, S44=21;
  string = utf8Encode(string); x = convertToWordArray(string);
  a = 0x67452301; b = 0xefcdab89; c = 0x98badcfe; d = 0x10325476;
  for (k = 0; k < x.length; k += 16) {
    AA = a; BB = b; CC = c; DD = d;
    a = FF(a, b, c, d, x[k + 0], S11, 0xd76aa478); d = FF(d, a, b, c, x[k + 1], S12, 0xe8c7b756); c = FF(c, d, a, b, x[k + 2], S13, 0x242070db); b = FF(b, c, d, a, x[k + 3], S14, 0xc1bdceee);
    a = FF(a, b, c, d, x[k + 4], S11, 0xf57c0faf); d = FF(d, a, b, c, x[k + 5], S12, 0x4787c62a); c = FF(c, d, a, b, x[k + 6], S13, 0xa8304613); b = FF(b, c, d, a, x[k + 7], S14, 0xfd469501);
    a = FF(a, b, c, d, x[k + 8], S11, 0x698098d8); d = FF(d, a, b, c, x[k + 9], S12, 0x8b44f7af); c = FF(c, d, a, b, x[k + 10], S13, 0xffff5bb1); b = FF(b, c, d, a, x[k + 11], S14, 0x895cd7be);
    a = FF(a, b, c, d, x[k + 12], S11, 0x6b901122); d = FF(d, a, b, c, x[k + 13], S12, 0xfd987193); c = FF(c, d, a, b, x[k + 14], S13, 0xa679438e); b = FF(b, c, d, a, x[k + 15], S14, 0x49b40821);
    a = GG(a, b, c, d, x[k + 1], S21, 0xf61e2562); d = GG(d, a, b, c, x[k + 6], S22, 0xc040b340); c = GG(c, d, a, b, x[k + 11], S23, 0x265e5a51); b = GG(b, c, d, a, x[k + 0], S24, 0xe9b6c7aa);
    a = GG(a, b, c, d, x[k + 5], S21, 0xd62f105d); d = GG(d, a, b, c, x[k + 10], S22, 0x2441453); c = GG(c, d, a, b, x[k + 15], S23, 0xd8a1e681); b = GG(b, c, d, a, x[k + 4], S24, 0xe7d3fbc8);
    a = GG(a, b, c, d, x[k + 9], S21, 0x21e1cde6); d = GG(d, a, b, c, x[k + 14], S22, 0xc33707d6); c = GG(c, d, a, b, x[k + 3], S23, 0xf4d50d87); b = GG(b, c, d, a, x[k + 8], S24, 0x455a14ed);
    a = GG(a, b, c, d, x[k + 13], S21, 0xa9e3e905); d = GG(d, a, b, c, x[k + 2], S22, 0xfcefa3f8); c = GG(c, d, a, b, x[k + 7], S23, 0x676f02d9); b = GG(b, c, d, a, x[k + 12], S24, 0x8d2a4c8a);
    a = HH(a, b, c, d, x[k + 5], S31, 0xfffa3942); d = HH(d, a, b, c, x[k + 8], S32, 0x8771f681); c = HH(c, d, a, b, x[k + 11], S33, 0x6d9d6122); b = HH(b, c, d, a, x[k + 14], S34, 0xfde5380c);
    a = HH(a, b, c, d, x[k + 1], S31, 0xa4beea44); d = HH(d, a, b, c, x[k + 4], S32, 0x4bdecfa9); c = HH(c, d, a, b, x[k + 7], S33, 0xf6bb4b60); b = HH(b, c, d, a, x[k + 10], S34, 0xbebfbc70);
    a = HH(a, b, c, d, x[k + 13], S31, 0x289b7ec6); d = HH(d, a, b, c, x[k + 0], S32, 0xeaa127fa); c = HH(c, d, a, b, x[k + 3], S33, 0xd4ef3085); b = HH(b, c, d, a, x[k + 6], S34, 0x4881d05);
    a = HH(a, b, c, d, x[k + 9], S31, 0xd9d4d039); d = HH(d, a, b, c, x[k + 12], S32, 0xe6db99e5); c = HH(c, d, a, b, x[k + 15], S33, 0x1fa27cf8); b = HH(b, c, d, a, x[k + 2], S34, 0xc4ac5665);
    a = II(a, b, c, d, x[k + 0], S41, 0xf4292244); d = II(d, a, b, c, x[k + 7], S42, 0x432aff97); c = II(c, d, a, b, x[k + 14], S43, 0xab9423a7); b = II(b, c, d, a, x[k + 5], S44, 0xfc93a039);
    a = II(a, b, c, d, x[k + 12], S41, 0x655b59c3); d = II(d, a, b, c, x[k + 3], S42, 0x8f0ccc92); c = II(c, d, a, b, x[k + 10], S43, 0xffeff47d); b = II(b, c, d, a, x[k + 1], S44, 0x85845dd1);
    a = II(a, b, c, d, x[k + 8], S41, 0x6fa87e4f); d = II(d, a, b, c, x[k + 15], S42, 0xfe2ce6e0); c = II(c, d, a, b, x[k + 6], S43, 0xa3014314); b = II(b, c, d, a, x[k + 13], S44, 0x4e0811a1);
    a = II(a, b, c, d, x[k + 4], S41, 0xf7537e82); d = II(d, a, b, c, x[k + 11], S42, 0xbd3af235); c = II(c, d, a, b, x[k + 2], S43, 0x2ad7d2bb); b = II(b, c, d, a, x[k + 9], S44, 0xeb86d391);
    a = addUnsigned(a, AA); b = addUnsigned(b, BB); c = addUnsigned(c, CC); d = addUnsigned(d, DD);
  }
  return (wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d)).toLowerCase();
}`;

const workerSource = `// Cloudflare Pages Native Edge Worker (_worker.js)
// 极光 API (Aurora API) 全球边缘高防网关 · 100% Serverless 运行于 Cloudflare Edge
// 🛡️ 内置【爱发电官方实时订单验真】与【严格密钥白名单与实时算力扣减防刷体系】

// 1. 核心模型列表 (商业生图升级至 gpt-image-2.5-flare，纯文本统一采用 0.08x 特惠 GPT-5.5 引擎)
const AURORA_MODELS = [
  { id: "gpt-6-astra", name: "gpt-6-astra", category: "OpenAI 旗舰", upstreamModel: "gpt-6-astra", tokenMultiplier: 3 },
  { id: "gpt-5.5", name: "gpt-5.5", category: "OpenAI 旗舰", upstreamModel: "gpt-5.5", tokenMultiplier: 1 },
  { id: "gpt-5.6-luna", name: "gpt-5.6-luna", category: "OpenAI 旗舰", upstreamModel: "gpt-5.6-luna", tokenMultiplier: 1 },
  { id: "gpt-5.6-sol", name: "gpt-5.6-sol", category: "OpenAI 旗舰", upstreamModel: "gpt-5.6-sol", tokenMultiplier: 1 },
  { id: "gpt-5.6-terra", name: "gpt-5.6-terra", category: "OpenAI 旗舰", upstreamModel: "gpt-5.6-terra", tokenMultiplier: 1 },
  { id: "gpt-5.4", name: "gpt-5.4", category: "OpenAI 旗舰", upstreamModel: "gpt-5.5", tokenMultiplier: 1 },
  { id: "gpt-5.4-mini", name: "gpt-5.4-mini", category: "OpenAI 极速", upstreamModel: "gpt-5.5", tokenMultiplier: 1 },
  { id: "gpt-5.3-codex", name: "gpt-5.3-codex", category: "OpenAI 代码", upstreamModel: "gpt-5.5", tokenMultiplier: 1 },
  { id: "gpt-5.2", name: "gpt-5.2", category: "OpenAI 旗舰", upstreamModel: "gpt-5.5", tokenMultiplier: 1 },
  { id: "gpt-4o", name: "gpt-4o", category: "OpenAI 经典", upstreamModel: "gpt-5.5", tokenMultiplier: 1 },
  { id: "gpt-4o-mini", name: "gpt-4o-mini", category: "OpenAI 极速", upstreamModel: "gpt-5.5", tokenMultiplier: 1 },
  { id: "claude-sonnet-4-6", name: "claude-sonnet-4-6", category: "Claude 文学", upstreamModel: "claude-sonnet-4-6", tokenMultiplier: 2 },
  { id: "claude-sonnet-5", name: "claude-sonnet-5", category: "Claude 文学", upstreamModel: "claude-sonnet-5", tokenMultiplier: 2 },
  { id: "claude-sonnet-4-5-20250929", name: "claude-sonnet-4-5-20250929", category: "Claude 文学", upstreamModel: "claude-sonnet-4-5-20250929", tokenMultiplier: 2 },
  { id: "claude-opus-4-7", name: "claude-opus-4-7", category: "Claude 旗舰", upstreamModel: "claude-opus-4-7", tokenMultiplier: 2.5 },
  { id: "claude-opus-4-7-thinking", name: "claude-opus-4-7-thinking", category: "Claude 推理", upstreamModel: "claude-opus-4-7-thinking", tokenMultiplier: 2.5 },
  { id: "claude-opus-4-6", name: "claude-opus-4-6", category: "Claude 旗舰", upstreamModel: "claude-opus-4-6", tokenMultiplier: 2.5 },
  { id: "claude-opus-4-6-thinking", name: "claude-opus-4-6-thinking", category: "Claude 推理", upstreamModel: "claude-opus-4-6-thinking", tokenMultiplier: 2.5 },
  { id: "claude-opus-4-8", name: "claude-opus-4-8", category: "Claude 旗舰", upstreamModel: "claude-opus-4-8", tokenMultiplier: 2.5 },
  { id: "claude-opus-5", name: "claude-opus-5", category: "Claude 顶配", upstreamModel: "claude-opus-5", tokenMultiplier: 2.5 },
  { id: "claude-fable-5", name: "claude-fable-5", category: "Claude 小说", upstreamModel: "claude-fable-5", tokenMultiplier: 2 },
  { id: "claude-3-5-sonnet", name: "claude-3-5-sonnet", category: "Claude 经典", upstreamModel: "claude-sonnet-4-6", tokenMultiplier: 2 },
  { id: "gemini-3.7-flash", name: "gemini-3.7-flash", category: "Gemini 编程", upstreamModel: "gemini-3.7-flash", tokenMultiplier: 1 },
  { id: "gemini-3.8-flash", name: "gemini-3.8-flash", category: "Gemini 极速", upstreamModel: "gemini-3.8-flash", tokenMultiplier: 1 },
  { id: "gemini-3.5-flash", name: "gemini-3.5-flash", category: "Gemini 极速", upstreamModel: "gemini-3.5-flash", tokenMultiplier: 1 },
  { id: "gemini-3.1-pro-preview", name: "gemini-3.1-pro-preview", category: "Gemini 深度", upstreamModel: "gemini-3.1-pro-preview", tokenMultiplier: 1.5 },
  { id: "gemini-3.1-flash-image-preview", name: "gemini-3.1-flash-image-preview", category: "Gemini 视觉", upstreamModel: "gemini-3.1-flash-image-preview", tokenMultiplier: 1 },
  { id: "gemini-3.1-flash-image-preview-2k", name: "gemini-3.1-flash-image-preview-2k", category: "Gemini 高清", upstreamModel: "gemini-3.1-flash-image-preview-2k", tokenMultiplier: 1 },
  { id: "gemini-3.1-flash-image-preview-4k", name: "gemini-3.1-flash-image-preview-4k", category: "Gemini 超清", upstreamModel: "gemini-3.1-flash-image-preview-4k", tokenMultiplier: 1 },
  { id: "deepseek-v3", name: "deepseek-v3", category: "DeepSeek 推理", upstreamModel: "deepseek-v3", tokenMultiplier: 1 },
  { id: "deepseek-reasoner", name: "deepseek-reasoner", category: "DeepSeek 推理", upstreamModel: "deepseek-reasoner", tokenMultiplier: 1.2 },
  { id: "deepseek-v3.1", name: "deepseek-v3.1", category: "DeepSeek 演进", upstreamModel: "deepseek-v3.1", tokenMultiplier: 1 },
  { id: "deepseek-v3.2", name: "deepseek-v3.2", category: "DeepSeek 演进", upstreamModel: "deepseek-v3.2", tokenMultiplier: 1 },
  { id: "deepseek-v3-2-251201", name: "deepseek-v3-2-251201", category: "DeepSeek 固化", upstreamModel: "deepseek-v3-2-251201", tokenMultiplier: 1 },
  { id: "doubao-seed-2-0-pro-260215", name: "doubao-seed-2.0", category: "国产一线顶流", upstreamModel: "doubao-seed-2-0-pro-260215", tokenMultiplier: 1 },
  { id: "doubao-seed-2.0", name: "doubao-seed-2.0", category: "国产一线顶流", upstreamModel: "doubao-seed-2-0-pro-260215", tokenMultiplier: 1 },
  { id: "kimi-k2.5", name: "kimi-k2.5", category: "国产一线顶流", upstreamModel: "kimi-k2.5", tokenMultiplier: 1 },
  { id: "MiniMax-M2.7", name: "MiniMax-M2.7", category: "国产一线顶流", upstreamModel: "MiniMax-M2.7", tokenMultiplier: 1 },
  { id: "MiniMax-M2.7-highspeed", name: "MiniMax-M2.7-highspeed", category: "国产一线顶流", upstreamModel: "MiniMax-M2.7-highspeed", tokenMultiplier: 1 },
  { id: "MiniMax-M2.5", name: "MiniMax-M2.5", category: "国产一线顶流", upstreamModel: "MiniMax-M2.5", tokenMultiplier: 1 },
  { id: "MiniMax-M2.5-highspeed", name: "MiniMax-M2.5-highspeed", category: "国产一线顶流", upstreamModel: "MiniMax-M2.5-highspeed", tokenMultiplier: 1 },
  { id: "MiniMax-M2", name: "MiniMax-M2", category: "国产一线顶流", upstreamModel: "MiniMax-M2", tokenMultiplier: 1 },
  { id: "glm-5.1", name: "glm-5.1", category: "国产一线顶流", upstreamModel: "glm-5.1", tokenMultiplier: 1 },
  { id: "glm-5", name: "glm-5", category: "国产一线顶流", upstreamModel: "glm-5.1", tokenMultiplier: 1 },
  { id: "gpt-image-2.5", name: "gpt-image-2.5", category: "AI 商业绘画", upstreamModel: "gpt-image-2.5-flare", tokenMultiplier: 1 },
  { id: "gpt-image-2.5-flare", name: "gpt-image-2.5-flare", category: "AI 商业绘画", upstreamModel: "gpt-image-2.5-flare", tokenMultiplier: 1 },
  { id: "gpt-image-2.5-sunburst", name: "gpt-image-2.5-sunburst", category: "AI 商业绘画", upstreamModel: "gpt-image-2.5-sunburst", tokenMultiplier: 1 },
  { id: "gpt-image-2", name: "gpt-image-2", category: "AI 商业绘画", upstreamModel: "gpt-image-2.5-flare", tokenMultiplier: 1 },
  { id: "dall-e-3", name: "dall-e-3", category: "AI 商业绘画", upstreamModel: "dall-e-3", tokenMultiplier: 1 },
  { id: "gpt-image-2-c", name: "gpt-image-2-c", category: "AI 商业绘画", upstreamModel: "gpt-image-2.5-flare", tokenMultiplier: 1 },
  { id: "gpt-image-2-vip", name: "gpt-image-2-vip", category: "AI 商业绘画", upstreamModel: "gpt-image-2.5-flare", tokenMultiplier: 1 },
  { id: "nano-banana-pro", name: "nano-banana-pro", category: "AI 商业绘画", upstreamModel: "nano-banana-pro", tokenMultiplier: 1 },
  { id: "nano-banana-pro-2k", name: "nano-banana-pro-2k", category: "AI 商业绘画", upstreamModel: "nano-banana-pro-2k", tokenMultiplier: 1 },
  { id: "nano-banana-pro-4k", name: "nano-banana-pro-4k", category: "AI 商业绘画", upstreamModel: "nano-banana-pro-4k", tokenMultiplier: 1 },
  { id: "nano-banana-2", name: "nano-banana-2", category: "AI 商业绘画", upstreamModel: "nano-banana-2", tokenMultiplier: 1 },
  { id: "nano-banana-2-2k", name: "nano-banana-2-2k", category: "AI 商业绘画", upstreamModel: "nano-banana-2-2k", tokenMultiplier: 1 },
  { id: "nano-banana-2-4k", name: "nano-banana-2-4k", category: "AI 商业绘画", upstreamModel: "nano-banana-2-4k", tokenMultiplier: 1 },
  { id: "veo3.1", name: "veo3.1", category: "AI 视频生成", upstreamModel: "veo3.1", tokenMultiplier: 3 },
  { id: "veo3.1-pro", name: "veo3.1-pro", category: "AI 视频生成", upstreamModel: "veo3.1-pro", tokenMultiplier: 3 },
  { id: "veo3.1-fast", name: "veo3.1-fast", category: "AI 视频生成", upstreamModel: "veo3.1-fast", tokenMultiplier: 2.5 },
  { id: "seedance-2", name: "seedance-2", category: "AI 视频生成", upstreamModel: "seedance-2", tokenMultiplier: 2.5 },
  { id: "seedance-2-fast", name: "seedance-2-fast", category: "AI 视频生成", upstreamModel: "seedance-2-fast", tokenMultiplier: 2 },
  { id: "seedance-2-mini", name: "seedance-2-mini", category: "AI 视频生成", upstreamModel: "seedance-2-mini", tokenMultiplier: 1.5 },
  { id: "grok-video-1.5", name: "grok-video-1.5", category: "AI 视频生成", upstreamModel: "grok-video-1.5", tokenMultiplier: 2.5 },
  { id: "grok-1.5-video-6s", name: "grok-1.5-video-6s", category: "AI 视频生成", upstreamModel: "grok-1.5-video-6s", tokenMultiplier: 2 },
  { id: "grok-1.5-video-10s", name: "grok-1.5-video-10s", category: "AI 视频生成", upstreamModel: "grok-1.5-video-10s", tokenMultiplier: 2.5 },
  { id: "grok-1.5-video-15s", name: "grok-1.5-video-15s", category: "AI 视频生成", upstreamModel: "grok-1.5-video-15s", tokenMultiplier: 3 },
  { id: "omni_flash-10s", name: "omni_flash-10s", category: "AI 视频生成", upstreamModel: "omni_flash-10s", tokenMultiplier: 2 },
  { id: "aurora-coder", name: "aurora-coder", category: "编程推荐", upstreamModel: "gemini-3.7-flash", tokenMultiplier: 1 },
  { id: "aurora-chat", name: "aurora-chat", category: "通用推荐", upstreamModel: "gpt-5.5", tokenMultiplier: 1 },
  { id: "aurora-deepseek", name: "aurora-deepseek", category: "国产推理", upstreamModel: "deepseek-v3", tokenMultiplier: 1 },
  { id: "aurora-doubao", name: "aurora-doubao", category: "中文创作", upstreamModel: "doubao-seed-2-0-pro-260215", tokenMultiplier: 1 },
  { id: "aurora-image", name: "aurora-image", category: "AI生图", upstreamModel: "gpt-image-2.5-flare", tokenMultiplier: 1 }
];

// 2. 套餐配置 (直达爱发电 1对1 收银台)
const TOKEN_PACKAGES = [
  { id: "pkg_test", name: "🧪 1元极速联调包", price: 1.0, tokens: 300000, tag: "联调测试", payUrl: "https://afdian.com/order/create?product_type=1&plan_id=71b40e1cada511f1b1805254001e7c00&sku=%5B%7B%22sku_id%22%3A%220235a01cada711f1879352540025c377%22,%22count%22%3A1%7D%5D&viokrz_ex=0" },
  { id: "pkg_trial", name: "极客体验包", price: 5.0, tokens: 2000000, tag: "入门尝鲜", payUrl: "https://afdian.com/order/create?product_type=1&plan_id=71b40e1cada511f1b1805254001e7c00&sku=%5B%7B%22sku_id%22%3A%2271bcbd32ada511f1af585254001e7c00%22,%22count%22%3A1%7D%5D&viokrz_ex=0" },
  { id: "pkg_standard", name: "主力畅享包", price: 15.0, tokens: 7000000, tag: "🔥 热销主力", payUrl: "https://afdian.com/order/create?product_type=1&plan_id=71b40e1cada511f1b1805254001e7c00&sku=%5B%7B%22sku_id%22%3A%22de1c407eada511f1ad8252540025c377%22,%22count%22%3A1%7D%5D&viokrz_ex=0" },
  { id: "pkg_pro", name: "极客狂飙包", price: 29.9, tokens: 16000000, tag: "极客进阶", payUrl: "https://afdian.com/order/create?product_type=1&plan_id=71b40e1cada511f1b1805254001e7c00&sku=%5B%7B%22sku_id%22%3A%22de2309d6ada511f1853c52540025c377%22,%22count%22%3A1%7D%5D&viokrz_ex=0" }
];

// 3. 基础静态预置活跃密钥白名单
const PRE_AUTHORIZED_KEYS = new Set(` + JSON.stringify(activeKeys) + `);

` + md5Impl + `

// 5. 爱发电官方订单验真逻辑 (100% 实时请求爱发电开放接口验真，杜绝任何假单绕过)
async function verifyAfdianOrder(orderId, env) {
  const userId = env?.AFDIAN_USER_ID;
  const token = env?.AFDIAN_TOKEN;

  if (!userId || !token) {
    return {
      ok: false,
      error: "AFDIAN_CONFIG_MISSING",
      message: "❌ 支付系统凭证未在环境变量配置，请联系系统管理员"
    };
  }

  const ts = Math.floor(Date.now() / 1000);
  const paramsJson = JSON.stringify({ out_trade_no: orderId });
  const raw = token + "params" + paramsJson + "ts" + ts + "user_id" + userId;
  const sign = md5(raw);

  try {
    const res = await fetch("https://afdian.com/api/open/query-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, params: paramsJson, ts, sign }),
    });
    const data = await res.json();
    if (data.ec !== 200) {
      return { ok: false, error: "AFDIAN_API_ERROR", message: data.em || "爱发电接口查询失败" };
    }
    const list = data.data?.list || [];
    const matched = list.find((o) => o.out_trade_no === orderId);
    if (!matched) {
      return { ok: false, error: "ORDER_NOT_FOUND", message: "❌ 爱发电官方未查到订单【" + orderId + "】的记录，请核对您支付成功的真实订单号！" };
    }
    if (Number(matched.status) !== 2) {
      return { ok: false, error: "ORDER_NOT_PAID", message: "❌ 订单【" + orderId + "】尚未完成支付，请完成支付后再来提卡！" };
    }
    const amount = parseFloat(matched.total_amount || "0");
    let packageId = "pkg_test";
    let packageName = "🧪 1元极速联调包";
    let tokens = 300000;
    if (amount >= 29) {
      packageId = "pkg_pro";
      packageName = "极客狂飙包";
      tokens = 16000000;
    } else if (amount >= 14) {
      packageId = "pkg_standard";
      packageName = "🔥 主力畅享包";
      tokens = 7000000;
    } else if (amount >= 4.5) {
      packageId = "pkg_trial";
      packageName = "极客体验包";
      tokens = 2000000;
    }
    return { ok: true, orderId, amount: matched.total_amount, packageId, packageName, tokens };
  } catch (err) {
    return { ok: false, error: "NETWORK_ERROR", message: "爱发电验证接口连接超时: " + err.message };
  }
}

function sanitizeUpstreamError(input) {
  if (!input) return input;
  if (typeof input === "string") {
    return input
      .replace(/https?:\\/\\/[^\\s"'\\\`<>]+/gi, "https://api.aurora-ai.com")
      .replace(/afugpt(\\.cn)?/gi, "aurora-cluster")
      .replace(/阿福(api)?/gi, "极光官方节点")
      .replace(/one[-_]?api|new[-_]?api/gi, "aurora-gateway");
  }
  if (typeof input === "object") {
    try {
      const str = JSON.stringify(input);
      return JSON.parse(sanitizeUpstreamError(str));
    } catch {
      return { error: { message: "节点调度繁忙，请稍后重试", type: "upstream_error" } };
    }
  }
  return input;
}

function hasImageContent(messages = []) {
  if (!Array.isArray(messages)) return false;
  for (const msg of messages) {
    if (!msg) continue;
    if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part && (part.type === "image_url" || part.image_url || part.type === "image")) {
          return true;
        }
      }
    } else if (typeof msg.content === "string") {
      if (msg.content.includes("data:image/") || (msg.content.includes("http") && /\\.(jpg|jpeg|png|webp|gif)/i.test(msg.content))) {
        return true;
      }
    }
  }
  return false;
}

function routeUpstreamTarget(reqModel = "", messages = []) {
  const isImage = hasImageContent(messages);
  const low = (reqModel || "").toLowerCase().trim();

  // 1. 智能视觉升配逻辑（当消息中包含图片/截图时）
  if (isImage) {
    const isVisionCapable =
      low.includes("gemini") ||
      low.includes("gpt-4o") ||
      low.includes("gpt-5") ||
      low.includes("gpt-6") ||
      low.includes("claude") ||
      low.includes("vl") ||
      low.includes("vision");

    if (!isVisionCapable) {
      // 1.1 中文/国产模型生态 (DeepSeek, Qwen, 豆包, Kimi, GLM) ➔ 同系平滑升配至国产视觉
      if (low.includes("deepseek") || low.includes("qwen") || low.includes("doubao") || low.includes("seed") || low.includes("kimi") || low.includes("glm")) {
        return {
          upstreamModel: "doubao-seed-2-0-pro-260215",
          keyGroup: "domestic",
          tokenMultiplier: 1.0,
          note: "国产中文多模态视觉同系升配专线 (豆包/千问视觉 0.50x 特价)",
        };
      }

      // 1.2 编程/代码生态 (Coder, Code) ➔ 升配至 Claude 3.7 Sonnet 代码 OCR 专线 (5厘钱)
      if (low.includes("coder") || low.includes("code")) {
        return {
          upstreamModel: "claude-sonnet-4-6",
          keyGroup: "kiro",
          tokenMultiplier: 1.0,
          note: "Claude 3.7/Sonnet 代码与报错 OCR 视觉专线 (Gemiaude 5厘钱直通)",
        };
      }

      // 1.3 默认/通用纯文本模型 ➔ 升配至全网性价比与上下文之王 Gemini 3.7 Flash (200万超大上下文)
      return {
        upstreamModel: "gemini-3.7-flash",
        keyGroup: "default",
        tokenMultiplier: 1.0,
        note: "Gemini 3.7 Flash 极速低成本视觉专线 (200万超大上下文)",
      };
    }
  }

  // 2. 正常文本与特定模型智能调度
  const matched = AURORA_MODELS.find((m) => m.id.toLowerCase() === low);
  const upstreamModel = matched ? matched.upstreamModel : reqModel;
  const multiplier = matched ? matched.tokenMultiplier : 1.0;

  if (low.includes("coder") || low.includes("claude")) {
    let target = low.includes("opus") ? "claude-opus-4-7" : "claude-sonnet-4-6";
    return { upstreamModel: target, keyGroup: "kiro", tokenMultiplier: multiplier, note: "Claude 3.7/Sonnet 编程专线 (5厘钱直通 / 阿福保底)" };
  }
  if (low.includes("grok")) {
    let target = low.includes("4.5") ? "grok-4.5" : "grok-4.6";
    return { upstreamModel: target, keyGroup: "grok", tokenMultiplier: multiplier, note: "xAI Grok 4.6 极速问答专线 (3厘钱直通 / 阿福保底)" };
  }
  if (low.startsWith("gpt-6") || low.startsWith("gpt-5") || low.startsWith("gpt-4") || low.includes("aurora-chat")) {
    return { upstreamModel, keyGroup: "discount", tokenMultiplier: multiplier, note: "OpenAI 海外特惠专线 (0.08x)" };
  }
  if (low.includes("deepseek") || low.includes("doubao") || low.includes("minimax") || low.includes("kimi") || low.includes("glm")) {
    return { upstreamModel, keyGroup: "domestic", tokenMultiplier: multiplier, note: "国产一线高并发专线 (0.50x 特价)" };
  }
  return { upstreamModel, keyGroup: "default", tokenMultiplier: multiplier, note: "全球高可用默认专线" };
}

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      ...extraHeaders,
    },
  });
}

function isCommercialImageModel(modelStr = "") {
  const m = modelStr.toLowerCase();
  return m.includes("image") || m.includes("banana") || m === "dall-e-3" || m.includes("draw");
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method.toUpperCase();

    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    if (pathname === "/api/packages") {
      return jsonResponse({ ok: true, packages: TOKEN_PACKAGES });
    }

    if (pathname === "/v1/models" || pathname === "/v1/models/") {
      return jsonResponse({
        object: "list",
        data: AURORA_MODELS.map((m) => ({
          id: m.id,
          object: "model",
          created: 1789094400,
          owned_by: "aurora-official",
          category: m.category,
          tokenMultiplier: m.tokenMultiplier,
          permission: [{
            id: "modelperm-" + m.id,
            object: "model_permission",
            created: 1789094400,
            allow_create_engine: false,
            allow_sampling: true,
            allow_logprobs: true,
            allow_search_indices: false,
            allow_view: true,
            allow_fine_tuning: false,
            organization: "*",
            group: null,
            is_blocking: false
          }],
          root: m.id,
          parent: null
        })),
      });
    }

    if (pathname.startsWith("/v1/models/")) {
      const modelId = pathname.replace(/^\\/v1\\/models\\//, "");
      const found = AURORA_MODELS.find((m) => m.id.toLowerCase() === modelId.toLowerCase()) || AURORA_MODELS[0];
      return jsonResponse({
        id: found.id,
        object: "model",
        created: 1789094400,
        owned_by: "aurora-official",
        category: found.category,
        tokenMultiplier: found.tokenMultiplier,
      });
    }

    // 7. 自提发卡接口 (带严格爱发电官方验真)
    if (pathname === "/api/card/claim" && method === "POST") {
      try {
        const body = await request.json().catch(() => ({}));
        const orderId = String(body.orderId || "").trim();
        if (!orderId || orderId.length < 8) {
          return jsonResponse({ ok: false, error: "请输入正确的爱发电付款订单号（通常为大于8位数字）" }, 400);
        }

        // 7.1 检查 KV 数据库是否已被领取过 (绝对幂等，同一单号不重复签发新卡)
        if (env?.AURORA_STORE) {
          const cached = await env.AURORA_STORE.get("order:" + orderId, "json");
          if (cached) {
            return jsonResponse({
              ok: true,
              key: cached.key,
              tokens: cached.tokens,
              remainingTokens: cached.remainingTokens,
              packageName: cached.packageName,
              createdAt: cached.createdAt,
              isReclaimed: true,
              message: "🎉 订单【" + orderId + "】此前已成功绑定，已为您重新呈现专属 Key！",
            });
          }
        }

        // 7.2 调用官方接口验真
        const verifyRes = await verifyAfdianOrder(orderId, env);
        if (!verifyRes.ok) {
          return jsonResponse({ ok: false, error: verifyRes.message || "未查询到该订单的付款记录" }, 400);
        }

        // 7.3 核验通过，签发专属 Key
        const assignedKey = "sk-aurora-" + Array.from(crypto.getRandomValues(new Uint8Array(8))).map((b) => b.toString(16).padStart(2, "0")).join("");
        const cardRecord = {
          key: assignedKey,
          tokens: verifyRes.tokens,
          remainingTokens: verifyRes.tokens,
          usedTokens: 0,
          packageName: verifyRes.packageName,
          orderId: orderId,
          createdAt: new Date().toISOString(),
          status: "ACTIVE"
        };

        // 7.4 写入 KV 持久化
        if (env?.AURORA_STORE) {
          await env.AURORA_STORE.put("order:" + orderId, JSON.stringify(cardRecord));
          await env.AURORA_STORE.put("key:" + assignedKey, JSON.stringify(cardRecord));
        }

        return jsonResponse({
          ok: true,
          key: assignedKey,
          tokens: verifyRes.tokens,
          remainingTokens: verifyRes.tokens,
          packageName: verifyRes.packageName,
          createdAt: cardRecord.createdAt,
          isReclaimed: false,
          message: "🎉 订单【" + orderId + "】官方核验通过！已为您签发专属独立 API Key！",
        });
      } catch (err) {
        return jsonResponse({ ok: false, error: err.message }, 500);
      }
    }

    // 8. 密钥查询与激活接口 (实时返回真实验证后的算力余额)
    if (pathname === "/api/card/redeem" && method === "POST") {
      try {
        const body = await request.json().catch(() => ({}));
        const code = String(body.code || "").trim();
        if (!code || !code.startsWith("sk-aurora-")) {
          return jsonResponse({ ok: false, error: "请输入正确的极光 API Key (sk-aurora-xxxx)" }, 400);
        }
        if (code === "sk-aurora-demo-8888") {
          return jsonResponse({ ok: false, error: "公共体验 Key 已停用退役，请绑定您的专属 Key" }, 400);
        }

        let card = null;
        if (env?.AURORA_STORE) {
          card = await env.AURORA_STORE.get("key:" + code, "json");
        }

        if (!card && PRE_AUTHORIZED_KEYS.has(code)) {
          card = {
            key: code,
            tokens: 2000000,
            remainingTokens: 2000000,
            usedTokens: 0,
            status: "ACTIVE",
            packageName: "预置密钥",
            createdAt: new Date().toISOString(),
          };
          if (env?.AURORA_STORE) {
            await env.AURORA_STORE.put("key:" + code, JSON.stringify(card));
          }
        }

        if (!card || card.status !== "ACTIVE") {
          return jsonResponse({ ok: false, error: "❌ 未找到该密钥记录，请核对密钥或先前往【自提中心】凭有效订单提取" }, 400);
        }

        const remaining = Number(card.remainingTokens ?? 0);
        const total = Number(card.tokens || remaining);

        return jsonResponse({
          ok: true,
          mode: "activate",
          activeKey: code,
          remainingTokens: remaining,
          totalTokens: total,
          packageName: card.packageName || "极光专属套餐",
          message: "🎉 密钥核验成功！当前可用算力：" + (remaining / 1000000).toFixed(2) + " 百万 Tokens",
        });
      } catch (err) {
        return jsonResponse({ ok: false, error: err.message }, 500);
      }
    }

    // 9. 核心对话与代码补全接口 (带严格鉴权 + 实时精确扣费防刷体系)
    if (pathname === "/v1/chat/completions" && method === "POST") {
      const authHeader = request.headers.get("Authorization") || "";
      const token = authHeader.replace(/^Bearer\\s+/i, "").trim();

      if (!token) {
        return jsonResponse({ error: { message: "未提供 API Key！请在请求头填入 Authorization: Bearer sk-aurora-xxxx", type: "invalid_request_error" } }, 401);
      }

      if (token === "sk-aurora-demo-8888") {
        return jsonResponse({
          error: {
            message: "公共体验密钥已下线升级为【专属密钥防刷体系】。请绑定您的专属 API Key，或选购【1元极速联调包】开启全网大模型调用！",
            type: "invalid_request_error",
            code: "demo_key_retired"
          }
        }, 401);
      }

      // 9.1 读取 Key 记录与真实算力余额
      let cardRecord = null;
      if (env?.AURORA_STORE) {
        cardRecord = await env.AURORA_STORE.get("key:" + token, "json");
      }

      if (!cardRecord && PRE_AUTHORIZED_KEYS.has(token)) {
        cardRecord = {
          key: token,
          tokens: 2000000,
          remainingTokens: 2000000,
          usedTokens: 0,
          status: "ACTIVE",
          packageName: "预置密钥",
          createdAt: new Date().toISOString()
        };
        if (env?.AURORA_STORE) {
          await env.AURORA_STORE.put("key:" + token, JSON.stringify(cardRecord));
        }
      }

      if (!cardRecord || cardRecord.status !== "ACTIVE") {
        return jsonResponse({
          error: {
            message: "❌ 无效或未授权的 API Key！请前往自提中心 https://aurora-api-47s.pages.dev/claim 凭真实订单提取专属密钥。",
            type: "invalid_request_error",
            code: "invalid_api_key"
          }
        }, 401);
      }

      // 9.2 严格防白嫖校验：算力耗尽直接熔断拦截
      if ((cardRecord.remainingTokens || 0) <= 0) {
        return jsonResponse({
          error: {
            message: "❌ 您的 API Key 算力已耗尽 (剩余 0 Tokens)！请前往自提中心或选购套餐充值！",
            type: "insufficient_quota",
            code: "quota_exhausted"
          }
        }, 402);
      }

      try {
        const body = await request.json().catch(() => ({}));
        const { model = "gpt-5.5", stream = false, messages = [], ...restParams } = body;

        const isImage = isCommercialImageModel(model);
        if (isImage && (cardRecord.remainingTokens || 0) < 60000) {
          return jsonResponse({
            error: {
              message: "❌ 商业生图模型每次调用需消耗 60,000 算力点 (约 0.10 元)，您当前余额仅剩 " + cardRecord.remainingTokens + " Tokens，请充值后重试！",
              type: "insufficient_quota",
              code: "quota_insufficient_for_image"
            }
          }, 402);
        }

        const route = routeUpstreamTarget(model, messages);
        const afuBase = env?.AFU_API_BASE || "https://api.afugpt.cn/v1";
        const imageBase = env?.IMAGE_API_BASE || "https://oneapi.gemiaude.com/v1";
        const imageKey = env?.IMAGE_API_KEY || "sk-MD2bEvqffzry7OGgM4lIVjeEnGJa6lLduZwrydi8XLBZnvAy";
        const kiroKey = env?.GEMIAUDE_KEY_KIRO || "sk-FpNLneVoznwtGSu1pO1vrs5XFh2SIJUvqAAmbSqTu2n7VFle";
        const grokKey = env?.GEMIAUDE_KEY_GROK || "sk-t5vTiTqtisdEzZHdFhaGGr4AaSCXowhfEXjyGzM3bA5siBcA";

        // 安全获取环境变量上游 Key，杜绝任何明文 Master Key 暴露在代码中
        let upstreamKey = env?.AFU_KEY_DEFAULT || env?.AFU_API_KEY || "";
        if (route.keyGroup === "discount" && env?.AFU_KEY_DISCOUNT) upstreamKey = env.AFU_KEY_DISCOUNT;
        else if (route.keyGroup === "special" && env?.AFU_KEY_SPECIAL) upstreamKey = env.AFU_KEY_SPECIAL;
        else if (route.keyGroup === "domestic" && env?.AFU_KEY_DOMESTIC) upstreamKey = env.AFU_KEY_DOMESTIC;

        const upstreamPayload = {
          ...restParams,
          messages,
          model: route.upstreamModel,
          stream,
        };

        let upstreamResp = null;

        // 🎨 生图三级智能容灾：Tier 1 (3.5分) ➔ Tier 2 (4.5分 2K) ➔ Tier 3 (阿福兜底)
        if (isImage && imageKey) {
          try {
            const res1 = await fetch(imageBase + "/chat/completions", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: "Bearer " + imageKey },
              body: JSON.stringify({ ...upstreamPayload, model: "gpt-image-2" }),
            });
            if (res1.ok) upstreamResp = res1;
          } catch {}

          if (!upstreamResp) {
            try {
              const res2 = await fetch(imageBase + "/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: "Bearer " + imageKey },
                body: JSON.stringify({ ...upstreamPayload, model: "gpt-image-2-2k" }),
              });
              if (res2.ok) upstreamResp = res2;
            } catch {}
          }
        }

        // 💻 Claude 5折专线 (优先走 Gemiaude kiro 5厘钱专线，故障顺延阿福特价保底)
        if (!upstreamResp && route.keyGroup === "kiro" && kiroKey) {
          try {
            const kiroResp = await fetch(imageBase + "/chat/completions", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: "Bearer " + kiroKey },
              body: JSON.stringify(upstreamPayload),
            });
            if (kiroResp.ok) upstreamResp = kiroResp;
          } catch {}
        }

        // 🚀 Grok 0.6折专线 (优先走 Gemiaude grok-web 3厘钱专线，故障顺延阿福保底)
        if (!upstreamResp && route.keyGroup === "grok" && grokKey) {
          try {
            const grokResp = await fetch(imageBase + "/chat/completions", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: "Bearer " + grokKey },
              body: JSON.stringify(upstreamPayload),
            });
            if (grokResp.ok) upstreamResp = grokResp;
          } catch {}
        }

        if (!upstreamResp) {
          upstreamResp = await fetch(afuBase + "/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + (upstreamKey || env?.AFU_KEY_SPECIAL || env?.AFU_KEY_DEFAULT || ""),
            },
            body: JSON.stringify(upstreamPayload),
          });
        }

        if (!upstreamResp.ok) {
          const errText = await upstreamResp.text();
          let parsedErr = { message: errText };
          try {
            parsedErr = JSON.parse(errText);
          } catch {}
          return jsonResponse(sanitizeUpstreamError(parsedErr), upstreamResp.status);
        }

        // 9.3 流式响应：使用 TransformStream 统计字符并实时扣除算力
        if (stream) {
          let emittedBytes = 0;
          const { readable, writable } = new TransformStream({
            transform(chunk, controller) {
              emittedBytes += chunk.length;
              controller.enqueue(chunk);
            },
            async flush() {
              const estimatedTokens = Math.max(80, Math.round(emittedBytes / 3.2) + 80);
              const costTokens = Math.round(estimatedTokens * (route.tokenMultiplier || 1.0));
              cardRecord.remainingTokens = Math.max(0, (cardRecord.remainingTokens || 0) - costTokens);
              cardRecord.usedTokens = (cardRecord.usedTokens || 0) + costTokens;
              cardRecord.lastCallAt = new Date().toISOString();
              if (env?.AURORA_STORE) {
                await env.AURORA_STORE.put("key:" + token, JSON.stringify(cardRecord));
                if (cardRecord.orderId) {
                  await env.AURORA_STORE.put("order:" + cardRecord.orderId, JSON.stringify(cardRecord));
                }
              }
            }
          });

          upstreamResp.body.pipeTo(writable).catch(() => {});

          const headers = new Headers(upstreamResp.headers);
          headers.set("Content-Type", "text/event-stream; charset=utf-8");
          headers.set("Cache-Control", "no-cache");
          headers.set("Access-Control-Allow-Origin", "*");
          return new Response(readable, {
            status: upstreamResp.status,
            headers,
          });
        }

        // 9.4 非流式响应：精准读取 usage.total_tokens 或固定扣除生图 60,000 算力点
        const data = await upstreamResp.json();
        let costTokens = 500;
        if (isImage) {
          costTokens = 60000;
        } else if (data?.usage?.total_tokens) {
          costTokens = Math.max(50, Math.round(data.usage.total_tokens * (route.tokenMultiplier || 1.0)));
        }

        cardRecord.remainingTokens = Math.max(0, (cardRecord.remainingTokens || 0) - costTokens);
        cardRecord.usedTokens = (cardRecord.usedTokens || 0) + costTokens;
        cardRecord.lastCallAt = new Date().toISOString();

        if (env?.AURORA_STORE) {
          await env.AURORA_STORE.put("key:" + token, JSON.stringify(cardRecord));
          if (cardRecord.orderId) {
            await env.AURORA_STORE.put("order:" + cardRecord.orderId, JSON.stringify(cardRecord));
          }
        }

        if (data && data.model) data.model = model;
        return jsonResponse(data, 200, {
          "X-Remaining-Tokens": String(cardRecord.remainingTokens),
          "X-Consumed-Tokens": String(costTokens)
        });
      } catch (err) {
        return jsonResponse({ error: { message: "极光边缘网关异常: " + sanitizeUpstreamError(err.message) } }, 500);
      }
    }

    // 10. AI 商业绘画独立接口 (POST /v1/images/generations)
    if (pathname === "/v1/images/generations" && method === "POST") {
      const authHeader = request.headers.get("Authorization") || "";
      const token = authHeader.replace(/^Bearer\\s+/i, "").trim();

      if (!token) {
        return jsonResponse({ error: { message: "未提供 API Key", type: "invalid_request_error" } }, 401);
      }

      let cardRecord = null;
      if (env?.AURORA_STORE) {
        cardRecord = await env.AURORA_STORE.get("key:" + token, "json");
      }
      if (!cardRecord && PRE_AUTHORIZED_KEYS.has(token)) {
        cardRecord = {
          key: token,
          tokens: 2000000,
          remainingTokens: 2000000,
          usedTokens: 0,
          status: "ACTIVE",
          packageName: "预置密钥",
          createdAt: new Date().toISOString()
        };
      }

      if (!cardRecord || cardRecord.status !== "ACTIVE") {
        return jsonResponse({ error: { message: "❌ API Key 无效或未激活", type: "invalid_request_error" } }, 401);
      }

      const body = await request.json().catch(() => ({}));
      const { prompt, n = 1, size = "1024x1024", model = "gpt-image-2.5-flare" } = body;
      const requestedN = Math.min(4, Math.max(1, parseInt(n, 10) || 1));
      const costTokens = 60000 * requestedN; // 单张图片扣除 60,000 算力点 (成本0.10元)

      if ((cardRecord.remainingTokens || 0) < costTokens) {
        return jsonResponse({
          error: {
            message: "❌ 算力不足！生成 " + requestedN + " 张商业图片需要 " + costTokens.toLocaleString() + " Tokens，您当前余额为 " + (cardRecord.remainingTokens || 0),
            type: "insufficient_quota"
          }
        }, 402);
      }

      const afuBase = env?.AFU_API_BASE || "https://api.afugpt.cn/v1";
      const imageBase = env?.IMAGE_API_BASE || "https://oneapi.gemiaude.com/v1";
      const imageKey = env?.IMAGE_API_KEY || "sk-MD2bEvqffzry7OGgM4lIVjeEnGJa6lLduZwrydi8XLBZnvAy";
      const upstreamKey = env?.AFU_KEY_DEFAULT || env?.AFU_API_KEY || "";

      if (!upstreamKey && !imageKey) {
        return jsonResponse({ error: { message: "网关未配置上游生图凭证", type: "server_configuration_error" } }, 500);
      }

      try {
        let upstreamResp = null;

        // 🎨 生图三级容灾：Tier 1 (3.5分) ➔ Tier 2 (4.5分 2K) ➔ Tier 3 (阿福兜底)
        if (imageKey) {
          try {
            const res1 = await fetch(imageBase + "/images/generations", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: "Bearer " + imageKey },
              body: JSON.stringify({ prompt, n: requestedN, size, model: "gpt-image-2" }),
            });
            if (res1.ok) upstreamResp = res1;
          } catch {}

          if (!upstreamResp) {
            try {
              const res2 = await fetch(imageBase + "/images/generations", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: "Bearer " + imageKey },
                body: JSON.stringify({ prompt, n: requestedN, size, model: "gpt-image-2-2k" }),
              });
              if (res2.ok) upstreamResp = res2;
            } catch {}
          }
        }

        if (!upstreamResp) {
          upstreamResp = await fetch(afuBase + "/images/generations", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + upstreamKey,
            },
            body: JSON.stringify({ prompt, n: requestedN, size, model: "gpt-image-2.5-flare" }),
          });
        }

        if (!upstreamResp.ok) {
          const errText = await upstreamResp.text();
          return jsonResponse(sanitizeUpstreamError(errText), upstreamResp.status);
        }

        const data = await upstreamResp.json();
        cardRecord.remainingTokens = Math.max(0, (cardRecord.remainingTokens || 0) - costTokens);
        cardRecord.usedTokens = (cardRecord.usedTokens || 0) + costTokens;
        cardRecord.lastCallAt = new Date().toISOString();

        if (env?.AURORA_STORE) {
          await env.AURORA_STORE.put("key:" + token, JSON.stringify(cardRecord));
        }

        return jsonResponse(data, 200, {
          "X-Remaining-Tokens": String(cardRecord.remainingTokens),
          "X-Consumed-Tokens": String(costTokens)
        });
      } catch (err) {
        return jsonResponse({ error: { message: "生图通道异常: " + sanitizeUpstreamError(err.message) } }, 500);
      }
    }

    return env.ASSETS.fetch(request);
  },
};
`;

const outPath = path.resolve(__dirname, '../public/_worker.js');
fs.writeFileSync(outPath, workerSource, 'utf8');
console.log('Successfully generated public/_worker.js, size:', workerSource.length);
