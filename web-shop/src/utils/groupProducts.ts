// utils/groupProducts.ts — 团内商品按 section 分组
// 规则:
//   - 未填 section 的商品归"其他",永远排最后
//   - 分组顺序 = 组内最小 sort 升序
//   - 整团都没分组 → 单组("其他"),调用方据 hasAnySection 退化单列

import type { Product } from '../types';

const OTHER = '其他';

export interface ProductGroup {
  section: string;
  products: Product[];
  minSort: number;
}

export interface GroupResult {
  groups: ProductGroup[];
  hasAnySection: boolean;
  otherLabel: string;
}

export function groupProducts(products: Product[]): GroupResult {
  const buckets = new Map<string, ProductGroup>();

  for (const p of products || []) {
    const raw = (p.section || '').trim();
    const key = raw || OTHER;
    let b = buckets.get(key);
    if (!b) {
      b = { section: key, products: [], minSort: Infinity };
      buckets.set(key, b);
    }
    b.products.push(p);
    if (key !== OTHER) {
      const s = typeof p.sort === 'number' ? p.sort : Infinity;
      if (s < b.minSort) b.minSort = s;
    }
  }

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

export function filterProducts(products: Product[], keyword: string): Product[] {
  const kw = String(keyword || '').trim().toLowerCase();
  if (!kw) return products || [];
  return (products || []).filter((p) => {
    const t = (p.title || '').toLowerCase();
    const d = (p.description || '').toLowerCase();
    return t.includes(kw) || d.includes(kw);
  });
}
