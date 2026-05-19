// _admin/userCRUD - 用户管理(列表 + 搜索 + 备注 + 标签)
//
// 范围(Sprint 3-2):
//   - list:  分页 + keyword (nickname/openid/groupId 模糊匹配) + hasNotes/hasTag 过滤
//   - update: 只允许改 adminNotes + adminTags(白名单,严格)
//
// 不做:ban / 改密码 / 解绑微信(OAuth-only)
//
// 字段约束:
//   - adminNotes: string,trim,≤500 char
//   - adminTags : string[],trim 非空,去重,每条 ≤30 char,上限 10 条

const cloud = require('wx-server-sdk');
const { verify } = require('./jwt.js');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const JWT_SECRET = process.env.JWT_SECRET || 'mogu_express_dev_secret_REPLACE_ME_IN_PROD';

const NOTES_MAX = 500;
const TAG_MAX_LEN = 30;
const TAGS_MAX_COUNT = 10;
const PAID_STATUSES = ['paid', 'shipped', 'completed'];

async function requireAdmin(event) {
  if (event && event.token) {
    try { return { source: 'web', admin: verify(event.token, JWT_SECRET) }; }
    catch (err) { const e = new Error('invalid token'); e.code = 401; throw e; }
  }
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) { const e = new Error('no openid'); e.code = 401; throw e; }
  const res = await db.collection('admins').where({ openid: OPENID }).limit(1).get();
  if (!res.data || !res.data.length) { const e = new Error('not admin'); e.code = 403; throw e; }
  return { source: 'mp', admin: res.data[0] };
}

exports.main = async (event) => {
  try {
    const { admin } = await requireAdmin(event);
    switch (event && event.action) {
      case 'list':   return await list(event);
      case 'update': return await update(event, admin);
      default: return { code: 1, message: 'unknown action' };
    }
  } catch (err) {
    return { code: err.code || 500, message: err.message || 'error' };
  }
};

// ───── view 投射 ─────
function projectView(u) {
  return {
    _id: u._id,
    _openid: u._openid,
    nickname: (u.wechat && u.wechat.nickname) || '微信用户',
    avatar: (u.wechat && u.wechat.avatar) || null,
    groupId: u.groupId || null,
    adminNotes: u.adminNotes || '',
    adminTags: Array.isArray(u.adminTags) ? u.adminTags : [],
    createdAt: u.createdAt,
  };
}

// ───── list action ─────
async function list(event) {
  const page = Math.max(1, Number(event.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(event.pageSize) || 20));
  const keyword = (event.keyword || '').toString().trim();
  const hasNotes = event.hasNotes === true;
  const hasTag = (event.hasTag || '').toString().trim();

  // 早期客户量不大,先全量拉(<1000 用户安全)。
  // TODO 当用户量 > 5000 时,改成 db.RegExp + .count() 服务端筛分页。
  const res = await db.collection('users').orderBy('createdAt', 'desc').limit(1000).get();
  let all = res.data || [];

  // hasNotes 过滤
  if (hasNotes) {
    all = all.filter((u) => u.adminNotes && String(u.adminNotes).trim());
  }
  // hasTag 过滤
  if (hasTag) {
    all = all.filter((u) => Array.isArray(u.adminTags) && u.adminTags.includes(hasTag));
  }
  // keyword 模糊匹配(nickname / _openid / groupId)
  if (keyword) {
    const k = keyword.toLowerCase();
    all = all.filter((u) => {
      const nick = ((u.wechat && u.wechat.nickname) || '').toString().toLowerCase();
      const openid = (u._openid || '').toString().toLowerCase();
      const groupId = (u.groupId || '').toString().toLowerCase();
      return nick.includes(k) || openid.includes(k) || groupId.includes(k);
    });
  }

  const total = all.length;
  const pageItems = all.slice((page - 1) * pageSize, page * pageSize);

  // order count + totalAmount enrichment(仅本页)
  const items = [];
  for (const u of pageItems) {
    const view = projectView(u);
    try {
      const ordRes = await db.collection('orders')
        .where({ _openid: u._openid, status: _.in(PAID_STATUSES) })
        .limit(500)
        .get();
      const orders = ordRes.data || [];
      view.orderCount = orders.length;
      view.totalAmount = orders.reduce((s, o) => s + (Number(o.amount) || 0), 0);
    } catch (e) {
      view.orderCount = 0;
      view.totalAmount = 0;
    }
    items.push(view);
  }

  return { code: 0, items, total, page, pageSize };
}

// ───── update action ─────
async function update(event, admin) {
  const id = event && event.id;
  const patch = (event && event.patch) || {};
  if (!id) return { code: 1, message: 'id required' };
  if (!patch || typeof patch !== 'object') return { code: 1, message: 'patch required' };

  // 严格白名单
  const data = {};
  if ('adminNotes' in patch) {
    const v = patch.adminNotes;
    if (v == null) {
      data.adminNotes = '';
    } else if (typeof v !== 'string') {
      return { code: 2, message: 'adminNotes 必须是字符串' };
    } else {
      const trimmed = v.trim();
      if (trimmed.length > NOTES_MAX) {
        return { code: 2, message: `备注最多 ${NOTES_MAX} 字` };
      }
      data.adminNotes = trimmed;
    }
  }
  if ('adminTags' in patch) {
    const raw = patch.adminTags;
    if (!Array.isArray(raw)) {
      return { code: 2, message: 'adminTags 必须是数组' };
    }
    const cleaned = [];
    const seen = new Set();
    for (const t of raw) {
      if (typeof t !== 'string') continue;
      const s = t.trim();
      if (!s) continue;
      if (s.length > TAG_MAX_LEN) continue;
      if (seen.has(s)) continue;
      seen.add(s);
      cleaned.push(s);
      if (cleaned.length >= TAGS_MAX_COUNT) break;
    }
    data.adminTags = cleaned;
  }

  if (!Object.keys(data).length) {
    return { code: 1, message: '没有可更新字段(只支持 adminNotes / adminTags)' };
  }

  data.updatedAt = new Date();

  await db.collection('users').doc(id).update({ data });

  const adminId = (admin && (admin.sub || admin._id || admin.username || admin.openid)) || '?';
  console.log(
    `[userCRUD] admin=${adminId} action=update userId=${id} notes_len=${
      'adminNotes' in data ? (data.adminNotes || '').length : '-'
    } tags_count=${'adminTags' in data ? data.adminTags.length : '-'}`
  );

  return { code: 0 };
}
