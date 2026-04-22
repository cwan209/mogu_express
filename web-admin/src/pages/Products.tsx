import { useEffect, useState } from 'react';
import { Button, Card, Space, Table, Popconfirm, message, Select } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Product, Tuan, Category } from '../types';
import { listProducts, deleteProduct } from '../api/product';
import { listTuans } from '../api/tuan';
import { listCategories } from '../api/category';
import { formatAud } from '../utils/money';

export default function Products() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const tuanIdFilter = sp.get('tuanId') || undefined;

  const [data, setData] = useState<Product[]>([]);
  const [tuans, setTuans] = useState<Tuan[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [prods, ts, cs] = await Promise.all([
        listProducts({ tuanId: tuanIdFilter }),
        listTuans(),
        listCategories(),
      ]);
      setData(prods);
      setTuans(ts);
      setCats(cs);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tuanIdFilter]);

  const tuanTitle = (id: string) => tuans.find((t) => t._id === id)?.title || id;
  const catName   = (id: string) => cats.find((c) => c._id === id)?.name || id;

  const onDelete = async (id: string) => {
    try {
      await deleteProduct(id);
      message.success('已删除');
      load();
    } catch (e: any) {
      message.error(e.message || '删除失败');
    }
  };

  return (
    <Card
      title="商品管理"
      extra={
        <Space>
          <Select
            allowClear
            placeholder="按团筛选"
            style={{ width: 260 }}
            value={tuanIdFilter}
            onChange={(v) => {
              if (v) setSp({ tuanId: v });
              else setSp({});
            }}
            options={tuans.map((t) => ({ value: t._id, label: t.title }))}
          />
          <Button type="primary" onClick={() => nav('/products/new')}>新建商品</Button>
        </Space>
      }
    >
      <Table<Product>
        rowKey="_id"
        dataSource={data}
        loading={loading}
        pagination={{ pageSize: 10, showSizeChanger: false }}
        columns={[
          {
            title: '封面',
            dataIndex: 'coverFileId',
            width: 70,
            render: (url: string) => (
              <img src={url} style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4 }} alt="" />
            ),
          },
          { title: '标题', dataIndex: 'title', ellipsis: true },
          { title: '所属团', dataIndex: 'tuanId', ellipsis: true, render: tuanTitle, width: 220 },
          {
            title: '团内分组',
            dataIndex: 'section',
            width: 100,
            render: (s: string | null) => s || <span style={{ color: '#bbb' }}>—</span>,
          },
          {
            title: '分类',
            dataIndex: 'categoryIds',
            width: 160,
            render: (ids: string[]) => (ids || []).map(catName).join(', '),
          },
          {
            title: '价格',
            dataIndex: 'price',
            width: 100,
            render: (c: number) => formatAud(c),
          },
          {
            title: '库存 / 已售',
            key: 'stock',
            width: 120,
            render: (_, row) => `${row.stock - row.sold} / ${row.sold}(总 ${row.stock})`,
          },
          {
            title: '操作',
            key: 'actions',
            width: 160,
            render: (_, row) => (
              <Space>
                <Button size="small" onClick={() => nav(`/products/${row._id}`)}>编辑</Button>
                <Popconfirm title={`删除"${row.title}"?`} onConfirm={() => onDelete(row._id)}>
                  <Button size="small" danger>删除</Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
    </Card>
  );
}
