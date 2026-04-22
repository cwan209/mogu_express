// 商品库 / 团内商品列表
//
// 无团筛选:商品库视图(catalog)— title/封面/分类/"在 N 个团中使用" + 编辑/删除
// 选了团:  团内实例视图 — 加价格/库存/分组列 + 跳转到 TuanItem 编辑
import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Space, Table, Popconfirm, message, Select, Tag } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Product, CatalogProduct, Tuan, Category } from '../types';
import { listCatalog, listProducts, deleteProduct } from '../api/product';
import { deleteTuanItem } from '../api/tuanItem';
import { listTuans } from '../api/tuan';
import { listCategories } from '../api/category';
import { formatAud } from '../utils/money';

type Row = Product | (CatalogProduct & { tuanItemId?: string; price?: number; stock?: number; sold?: number; section?: string | null; tuanId?: string });

export default function Products() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const tuanIdFilter = sp.get('tuanId') || undefined;

  const [rows, setRows] = useState<Row[]>([]);
  const [tuans, setTuans] = useState<Tuan[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [allItems, setAllItems] = useState<Product[]>([]);    // 用于统计"在 N 个团中使用"
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [ts, cs] = await Promise.all([listTuans(), listCategories()]);
      setTuans(ts);
      setCats(cs);
      if (tuanIdFilter) {
        const prods = await listProducts({ tuanId: tuanIdFilter });
        setRows(prods);
      } else {
        const catalog = await listCatalog();
        setRows(catalog);
        // 拉每个团的 joined view 做跨团统计(量不大)
        const perTuan = await Promise.all(ts.map((t) => listProducts({ tuanId: t._id })));
        setAllItems(perTuan.flat());
      }
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tuanIdFilter]);

  const tuanTitle = (id: string) => tuans.find((t) => t._id === id)?.title || id;
  const catName   = (id: string) => cats.find((c) => c._id === id)?.name || id;

  const productTuanCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of allItems) {
      m.set(it.productId, (m.get(it.productId) || 0) + 1);
    }
    return m;
  }, [allItems]);

  const onDeleteCatalog = async (id: string) => {
    try { await deleteProduct(id); message.success('已从商品库删除'); load(); }
    catch (e: any) { message.error(e.message || '删除失败'); }
  };
  const onRemoveFromTuan = async (tuanItemId: string) => {
    try { await deleteTuanItem(tuanItemId); message.success('已从团中移除'); load(); }
    catch (e: any) { message.error(e.message || '移除失败'); }
  };

  const isTuanView = !!tuanIdFilter;

  return (
    <Card
      title={isTuanView ? `团内商品 · ${tuanTitle(tuanIdFilter!)}` : '商品库'}
      extra={
        <Space>
          <Select
            allowClear
            placeholder="按团筛选(不选看商品库)"
            style={{ width: 280 }}
            value={tuanIdFilter}
            onChange={(v) => { if (v) setSp({ tuanId: v }); else setSp({}); }}
            options={tuans.map((t) => ({ value: t._id, label: t.title }))}
          />
          <Button type="primary" onClick={() => nav('/products/new' + (tuanIdFilter ? `?tuanId=${tuanIdFilter}` : ''))}>
            {isTuanView ? '向此团添加' : '新建商品'}
          </Button>
        </Space>
      }
    >
      <Table<Row>
        rowKey={(r) => (r as any).tuanItemId || r._id}
        dataSource={rows}
        loading={loading}
        pagination={{ pageSize: 10, showSizeChanger: false }}
        columns={[
          {
            title: '封面', dataIndex: 'coverFileId', width: 70,
            render: (url: string) =>
              url ? <img src={url} style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4 }} alt="" /> : null,
          },
          { title: '标题', dataIndex: 'title', ellipsis: true },
          ...(isTuanView ? [
            { title: '团内分组', dataIndex: 'section', width: 100,
              render: (s: string | null) => s || <span style={{ color: '#bbb' }}>—</span> },
            { title: '价格', dataIndex: 'price', width: 100, render: (c: number) => formatAud(c) },
            { title: '库存 / 已售', key: 'stock', width: 140,
              render: (_: any, row: any) => `${row.stock - row.sold} / ${row.sold}(总 ${row.stock})` },
          ] : [
            { title: '在团中使用', key: 'tuanCount', width: 120,
              render: (_: any, row: any) => {
                const n = productTuanCount.get(row._id) || 0;
                return n > 0 ? <Tag color="blue">{n} 个团</Tag> : <span style={{ color: '#bbb' }}>未挂团</span>;
              } },
          ]),
          { title: '分类', dataIndex: 'categoryIds', width: 160,
            render: (ids: string[]) => (ids || []).map(catName).join(', ') },
          { title: '操作', key: 'actions', width: 180,
            render: (_: any, row: any) => {
              if (isTuanView) {
                return (
                  <Space>
                    <Button size="small" onClick={() => nav(`/products/${row.tuanItemId}?tuanId=${row.tuanId}`)}>编辑</Button>
                    <Popconfirm title="从此团移除该商品?" onConfirm={() => onRemoveFromTuan(row.tuanItemId)}>
                      <Button size="small" danger>从团移除</Button>
                    </Popconfirm>
                  </Space>
                );
              }
              return (
                <Space>
                  <Button size="small" onClick={() => nav(`/products/${row._id}`)}>编辑</Button>
                  <Popconfirm title={`彻底删除"${row.title}"?`} onConfirm={() => onDeleteCatalog(row._id)}>
                    <Button size="small" danger>删除</Button>
                  </Popconfirm>
                </Space>
              );
            } },
        ]}
      />
    </Card>
  );
}
