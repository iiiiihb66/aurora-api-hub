import { signMbdParams, signAfdianParams, verifyOrder } from '../services/payment_verifier.js';

console.log('--- 1. 测试签名算法一致性 ---');
const afdianSign = signAfdianParams({
  userId: 'abc',
  token: '123',
  paramsJson: '{"a":333}',
  ts: 1624339905
});
if (afdianSign !== 'a4acc28b81598b7e5d84ebdc3e91710c') {
  throw new Error(`爱发电签名不符: ${afdianSign}`);
}
console.log('✅ 爱发电签名算法测试通过！');

const mbdSign = signMbdParams({ app_id: '12345', amount_total: 1, out_trade_no: '123123123123' }, 'xxxxxxxxxxx');
if (!mbdSign || mbdSign.length !== 32) {
  throw new Error(`面包多签名异常: ${mbdSign}`);
}
console.log('✅ 面包多签名算法测试通过！');

console.log('--- 2. 测试黑客伪造订单号拦截机制 ---');
const fakeOrderRes = await verifyOrder('20269999fakeorder', 'auto');
console.log('拦截响应:', fakeOrderRes);
if (fakeOrderRes.ok === true) {
  throw new Error('❌ 致命漏洞：伪造订单号未能被拦截！');
}
console.log('✅ 伪造订单号被成功拦截！');
console.log('全部安全断言测试通过！');
