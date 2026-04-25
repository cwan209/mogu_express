// getHomeBanner - 公开读首页 banner/公告(顾客小程序首页用)
//
// 数据存在 settings 集合,_id='home_banner'。没配置时返回默认。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const DEFAULT = {
  title: '接龙团购',
  subtitle: '本周进行中 · 尽快接龙抢货',
};

exports.main = async () => {
  try {
    const r = await db.collection('settings').doc('home_banner').get();
    const data = r && r.data ? r.data : null;
    return {
      code: 0,
      banner: {
        title:    (data && data.title)    || DEFAULT.title,
        subtitle: (data && data.subtitle) || DEFAULT.subtitle,
      },
    };
  } catch {
    return { code: 0, banner: { ...DEFAULT } };
  }
};
