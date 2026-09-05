import fs from 'fs';

// 1. 读取本地图片并转为 Base64
const imageBuffer = fs.readFileSync('./food.jpg');
const base64Image = imageBuffer.toString('base64');

// 2. 你的云端函数地址
const functionUrl = 'https://efkkdohscemtjdxgmvtb.supabase.co/functions/v1/analyze-meal';

console.log("🚀 正在向云端大模型发送图片，请稍候...");

// 3. 发送 POST 请求测试
try {
  const response = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // 如果你在 Supabase Dashboard 里没有开启“强制鉴权”，这里不需要加 Authorization 头
    },
    body: JSON.stringify({
      imageBase64: base64Image,
      userContext: "This is bought from a local hawker stall in KL."
    })
  });

  const data = await response.json();
  
  console.log("✅ 识别完成！AI 返回结果如下：");
  console.log(JSON.stringify(data, null, 2));

} catch (error) {
  console.error("❌ 请求失败:", error);
}