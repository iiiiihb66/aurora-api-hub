const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dbPath = path.join(__dirname, 'data', 'api-db.json');
const packages = {
  pkg_trial: { name: '极客体验包', tokens: 2000000, price: 5.0 },
  pkg_standard: { name: '主力畅享包', tokens: 7000000, price: 15.0 },
  pkg_pro: { name: '极客狂飙包', tokens: 16000000, price: 29.9 },
  pkg_team: { name: '团队尊享包', tokens: 42000000, price: 69.9 }
};

const count = parseInt(process.argv[2], 10) || 10;
const pkgKey = process.argv[3] || 'pkg_trial';
const pkg = packages[pkgKey] || packages.pkg_trial;

const db = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
if (!db.cards) db.cards = {};

const generated = [];
for (let i = 0; i < count; i++) {
  const key = `sk-aurora-${crypto.randomBytes(8).toString('hex')}`;
  db.cards[key] = {
    code: key,
    status: 'ACTIVE',
    packageId: pkgKey,
    packageName: pkg.name,
    totalTokens: pkg.tokens,
    remainingTokens: pkg.tokens,
    usedTokens: 0,
    remark: `面包多自动发卡·${pkg.name}`,
    createdAt: new Date().toISOString()
  };
  generated.push(key);
}

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));

console.log('====================================================');
console.log(`✅ 成功生成 ${generated.length} 张【${pkg.name}】卡密（每张包含 ${(pkg.tokens/1000000).toFixed(1)}M Tokens）`);
console.log('📋 请直接全选复制下方这批卡密，粘贴至面包多【自动发货/卡密库】中：');
console.log('====================================================');
console.log(generated.join('\n'));
console.log('====================================================');
