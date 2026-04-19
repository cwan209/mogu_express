// utils/groupProducts.js
//
// 把团内商品按 section 分组。
//
// 规则:
//   - 未填 section 的商品归入"其他"组
//   - 分组顺序 = 该组内最小的 product.sort 升序
//   - "其他"组永远排最后(sort = Infinity)
//   - 整团所有商品都没填 section 时,返回单个"其他"组(调用方可据此退化为单列布局)
//
// 返回:
//   [
//     { section: '蔬菜', products: [...], minSort: 1 },
//     { section: '浆果', products: [...], minSort: 2 },
//     { section: '其他', products: [...], minSort: Infinity },
//   ]
//
// 同时返回 hasAnySection 布尔,方便页面判断是否需要显示 sidebar。

const OTHER = '其他';

function groupProducts(products) {
  const buckets = new Map();      // section name → { section, products: [], minSort }

  for (const p of products || []) {
    const raw = (p.section || '').trim();
    const key = raw || OTHER;
    let b = buckets.get(key);
    if (!b) {
      b = { section: key, products: [], minSort: key === OTHER ? Infinity : Infinity };
      buckets.set(key, b);
    }
    b.products.push(p);
    if (key !== OTHER) {
      const s = typeof p.sort === 'number' ? p.sort : Infinity;
      if (s < b.minSort) b.minSort = s;
    }
  }

  // 每组内按 sort 升序
  for (const b of buckets.values()) {
    b.products.sort((a, b2) => (a.sort || 0) - (b2.sort || 0));
  }

  const groups = [...buckets.values()].sort((a, b) => {
    if (a.section === OTHER) return 1;
    if (b.section === OTHER) return -1;
    return a.minSort - b.minSort;
  });

  const hasAnySection = groups.some((g) => g.section !== OTHER);

  return { groups, hasAnySection, otherLabel: OTHER };
}

// 搜索过滤:匹配 title 或 description,大小写不敏感,trim 空串返原数组
function filterProducts(products, keyword) {
  const kw = String(keyword || '').trim().toLowerCase();
  if (!kw) return products || [];
  return (products || []).filter((p) => {
    const t = (p.title || '').toLowerCase();
    const d = (p.description || '').toLowerCase();
    return t.includes(kw) || d.includes(kw);
  });
}

module.exports = { groupProducts, filterProducts, OTHER };
