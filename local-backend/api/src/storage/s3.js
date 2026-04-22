// local-backend/api/src/storage/s3.js
//
// S3 兼容存储客户端。本地开发用 MinIO,生产用腾讯云 COS,一套代码通过环境变量切换。
//
// 环境变量:
//   S3_ENDPOINT              本地 http://minio:9000 / 生产 https://cos.ap-guangzhou.myqcloud.com
//   S3_REGION                MinIO 随便(us-east-1) / 生产 ap-guangzhou
//   S3_BUCKET                images / mogu-express-images-xxx
//   S3_ACCESS_KEY / S3_SECRET_KEY
//   S3_PUBLIC_URL            拼 URL 给前端的前缀,不含末尾 /
//   S3_AUTO_CREATE_BUCKET    本地 'true' / 生产 'false'
//   S3_FORCE_PATH_STYLE      MinIO 必须 true,COS 必须 false(子域名风格)
//
// 本地默认 MinIO 路径风格 http://endpoint/bucket/key
// 腾讯云 COS 虚拟主机风格 https://bucket.cos.region.myqcloud.com/key

const {
  S3Client,
  PutObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  PutBucketPolicyCommand,
} = require('@aws-sdk/client-s3');

let _client = null;

function cfg() {
  return {
    endpoint: process.env.S3_ENDPOINT || 'http://minio:9000',
    region: process.env.S3_REGION || 'us-east-1',
    bucket: process.env.S3_BUCKET || 'images',
    accessKey: process.env.S3_ACCESS_KEY || 'mogu_admin',
    secretKey: process.env.S3_SECRET_KEY || 'mogu_admin_pass',
    publicUrl: (process.env.S3_PUBLIC_URL || 'http://localhost:9000/images').replace(/\/+$/, ''),
    autoCreate: String(process.env.S3_AUTO_CREATE_BUCKET || 'true').toLowerCase() === 'true',
    forcePathStyle: String(process.env.S3_FORCE_PATH_STYLE ?? 'true').toLowerCase() === 'true',
  };
}

function getClient() {
  if (_client) return _client;
  const c = cfg();
  _client = new S3Client({
    endpoint: c.endpoint,
    region: c.region,
    credentials: { accessKeyId: c.accessKey, secretAccessKey: c.secretKey },
    forcePathStyle: c.forcePathStyle,
  });
  return _client;
}

async function ensureBucket() {
  const c = cfg();
  const client = getClient();
  try {
    await client.send(new HeadBucketCommand({ Bucket: c.bucket }));
    console.log(`[s3] bucket ${c.bucket} ready`);
    return;
  } catch (err) {
    if (!c.autoCreate) {
      console.warn(`[s3] bucket ${c.bucket} not accessible and auto-create disabled:`, err.message);
      return;
    }
    // 不存在(404/NoSuchBucket) — 创建
    try {
      await client.send(new CreateBucketCommand({ Bucket: c.bucket }));
      console.log(`[s3] created bucket ${c.bucket}`);
    } catch (e2) {
      if (!/BucketAlreadyOwnedByYou|BucketAlreadyExists/i.test(e2.name || e2.message || '')) {
        throw e2;
      }
    }
    // 设匿名读(MinIO)
    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { AWS: ['*'] },
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${c.bucket}/*`],
        },
      ],
    };
    try {
      await client.send(new PutBucketPolicyCommand({
        Bucket: c.bucket,
        Policy: JSON.stringify(policy),
      }));
      console.log(`[s3] bucket ${c.bucket} anonymous-read policy set`);
    } catch (e3) {
      console.warn(`[s3] set policy failed (may be non-fatal):`, e3.message);
    }
  }
}

/**
 * 上传 buffer 到 S3。
 * @param {string} key         对象 key,例如 product_cover/202604/abc.png
 * @param {Buffer} buffer
 * @param {string} contentType 如 image/png
 * @returns {Promise<{key: string, url: string}>}
 */
async function putObject(key, buffer, contentType) {
  const c = cfg();
  const client = getClient();
  await client.send(new PutObjectCommand({
    Bucket: c.bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType || 'application/octet-stream',
    // COS 对象级 ACL(MinIO 忽略;若 bucket 已公有读可不设)
    // ACL: 'public-read',
  }));
  const url = `${c.publicUrl}/${key}`;
  return { key, url };
}

module.exports = { getClient, ensureBucket, putObject, cfg };
