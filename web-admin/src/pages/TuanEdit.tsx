import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Card, Checkbox, Form, Input, InputNumber, DatePicker, Select, Button,
  message, Space, Table, Popconfirm, Modal, AutoComplete, Tag, Empty,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs, { Dayjs } from 'dayjs';
import { createTuan, getTuan, listTuans, updateTuan } from '../api/tuan';
import { listCatalog, listProducts } from '../api/product';
import { copyTuanItems, createTuanItem, updateTuanItem, deleteTuanItem } from '../api/tuanItem';
import type { Tuan, TuanStatus, CatalogProduct, Product } from '../types';
import ImageUploader from '../components/ImageUploader';
import { formatAud } from '../utils/money';

const { TextArea } = Input;

interface FormValues {
  title: string;
  description: string;
  announcement: string;
  coverFileId: string;
  range: [Dayjs, Dayjs];
  status: TuanStatus;
}

interface ItemEditValues {
  productId: string;
  priceDollars: number;
  stock: number;
  sort: number;
  section: string;
}

export default function TuanEdit() {
  const nav = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id && id !== 'new';
  const [form] = Form.useForm<FormValues>();
  const [itemForm] = Form.useForm<ItemEditValues>();

  const [currentTuanId, setCurrentTuanId] = useState<string>(isEdit ? id! : '');

  // 团内商品
  const [items, setItems] = useState<Product[]>([]);
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Product | null>(null);

  // 新建模式的"从已有团复制"
  const [allTuans, setAllTuans] = useState<Tuan[]>([]);
  const [sourceTuanId, setSourceTuanId] = useState<string>('');
  const [copyProducts, setCopyProducts] = useState<boolean>(true);
  const [sourceProductCount, setSourceProductCount] = useState<number>(0);

  useEffect(() => {
    listCatalog().then(setCatalog).catch(() => {});
    if (isEdit) {
      getTuan(id!).then((t) => {
        form.setFieldsValue({
          title: t.title, description: t.description,
          announcement: t.announcement || '',
          coverFileId: t.coverFileId,
          range: [dayjs(t.startAt), dayjs(t.endAt)], status: t.status,
        });
      });
      loadItems(id!);
    } else {
      form.setFieldsValue({ status: 'draft', coverFileId: '' } as any);
      listTuans().then(setAllTuans).catch(() => setAllTuans([]));
    }
    // eslint-disable-next-line
  }, [id]);

  const loadItems = async (tuanId: string) => {
    setItemsLoading(true);
    try {
      const list = await listProducts({ tuanId });
      setItems(list);
    } finally {
      setItemsLoading(false);
    }
  };

  const onSelectSource = async (srcId: string) => {
    setSourceTuanId(srcId);
    if (!srcId) { setSourceProductCount(0); return; }
    const src = allTuans.find((t) => t._id === srcId);
    if (src) {
      form.setFieldsValue({
        title: src.title + ' (副本)',
        description: src.description || '',
        coverFileId: src.coverFileId || '',
      } as any);
    }
    try {
      const prods = await listProducts({ tuanId: srcId });
      setSourceProductCount(prods.length);
    } catch { setSourceProductCount(0); }
  };

  const onFinish = async (v: FormValues) => {
    const payload = {
      title: v.title, description: v.description || '',
      announcement: v.announcement || '',
      coverFileId: v.coverFileId || '',
      startAt: v.range[0].toISOString(), endAt: v.range[1].toISOString(),
      status: v.status,
    };
    if (v.range[1].isBefore(v.range[0])) { message.error('结束时间必须晚于开始时间'); return; }
    if (payload.coverFileId && payload.coverFileId.startsWith('blob:')) {
      message.error('图片未完成上传'); return;
    }
    try {
      if (isEdit) {
        await updateTuan(id!, payload);
        message.success('保存成功');
        return;
      }

      const { _id: newId } = await createTuan(payload);

      if (sourceTuanId && copyProducts) {
        const hide = message.loading('正在复制商品...', 0);
        try {
          const { copied, skipped } = await copyTuanItems(sourceTuanId, newId);
          hide();
          message.success(`创建成功,复制了 ${copied} 件商品` + (skipped ? `,跳过 ${skipped} 件已存在` : ''));
        } catch (e: any) { hide(); message.warning('团已创建,但复制商品失败:' + (e?.message || '')); }
      } else {
        message.success('创建成功');
      }
      // 创建后跳到该团的编辑页,好继续配置商品
      nav(`/tuans/${newId}`, { replace: true });
      setCurrentTuanId(newId);
      loadItems(newId);
    } catch (e: any) {
      message.error(e.message || '保存失败');
    }
  };

  // ─── 团内商品管理 ───

  const sectionOptions = useMemo(() => {
    const s = new Set<string>();
    for (const it of items) if (it.section) s.add(it.section);
    return [...s].map((v) => ({ value: v }));
  }, [items]);

  const openAddModal = () => {
    setEditingItem(null);
    itemForm.resetFields();
    itemForm.setFieldsValue({
      productId: '',
      priceDollars: 9.99,
      stock: 20, sort: (items.length + 1) * 10, section: '',
    });
    setItemModalOpen(true);
  };

  const openEditModal = (row: Product) => {
    setEditingItem(row);
    itemForm.setFieldsValue({
      productId: row.productId,
      priceDollars: row.price / 100,
      stock: row.stock, sort: row.sort,
      section: row.section || '',
    });
    setItemModalOpen(true);
  };

  const onItemSubmit = async () => {
    try {
      const v = await itemForm.validateFields();
      const price = Math.round((v.priceDollars || 0) * 100);
      if (price <= 0) { message.error('价格必须大于 0'); return; }

      if (editingItem) {
        await updateTuanItem(editingItem.tuanItemId, {
          price, stock: v.stock, sort: v.sort,
          section: (v.section || '').trim() || null,
        });
        message.success('已保存');
      } else {
        if (!v.productId) { message.error('请选择商品'); return; }
        if (items.some((i) => i.productId === v.productId)) {
          message.error('该商品已在此团中'); return;
        }
        await createTuanItem({
          tuanId: currentTuanId,
          productId: v.productId,
          price, stock: v.stock, sort: v.sort,
          section: (v.section || '').trim() || null,
        });
        message.success('已添加');
      }
      setItemModalOpen(false);
      await loadItems(currentTuanId);
    } catch (e: any) {
      if (e?.errorFields) return;   // form 校验错误
      message.error(e.message || '操作失败');
    }
  };

  const onRemoveItem = async (row: Product) => {
    try {
      await deleteTuanItem(row.tuanItemId);
      message.success('已移除');
      await loadItems(currentTuanId);
    } catch (e: any) {
      message.error(e.message || '移除失败');
    }
  };

  // 过滤掉已经加到团的 catalog(避免重复)
  const catalogOptions = useMemo(() => {
    const used = new Set(items.map((i) => i.productId));
    return catalog
      .filter((c) => editingItem ? true : !used.has(c._id))   // 编辑态不过滤
      .map((c) => ({ value: c._id, label: c.title }));
  }, [catalog, items, editingItem]);

  return (
    <Space direction="vertical" size={24} style={{ width: '100%', maxWidth: 960 }}>
      <Card title={isEdit ? '编辑团' : '新建团'}>
        {!isEdit && allTuans.length > 0 && (
          <Alert
            type="info" showIcon style={{ marginBottom: 16, maxWidth: 640 }}
            message="从已有团快速复制"
            description={
              <Space direction="vertical" style={{ width: '100%' }}>
                <Select
                  allowClear showSearch style={{ width: '100%' }}
                  placeholder="选一个已有团作为模板(可选)"
                  value={sourceTuanId || undefined}
                  onChange={onSelectSource}
                  optionFilterProp="label"
                  options={allTuans.map((t) => ({ value: t._id, label: `${t.title} · ${t.status}` }))}
                />
                {sourceTuanId && (
                  <Checkbox checked={copyProducts} onChange={(e) => setCopyProducts(e.target.checked)}>
                    同时复制该团的商品({sourceProductCount} 件)— 只复制团内关系,商品库共用
                  </Checkbox>
                )}
                {sourceTuanId && (
                  <div style={{ color: '#888', fontSize: 12 }}>
                    已把标题/介绍/封面回填到下方表单,请重新选择开团时间。
                  </div>
                )}
              </Space>
            }
          />
        )}
        <Form form={form} layout="vertical" onFinish={onFinish} style={{ maxWidth: 640 }}>
          <Form.Item label="团标题" name="title" rules={[{ required: true, message: '请输入团标题' }]}>
            <Input placeholder="例:本周生鲜团 · 墨尔本周三截团" maxLength={40} showCount />
          </Form.Item>
          <Form.Item label="团介绍" name="description">
            <TextArea rows={3} maxLength={200} showCount placeholder="产地/自提/截团/发货等说明" />
          </Form.Item>
          <Form.Item
            label="团公告"
            name="announcement"
            tooltip="顾客点进团详情时弹窗显示。换行用 Enter,支持纯文本"
          >
            <TextArea rows={5} maxLength={500} showCount
              placeholder="例:
1. 周三 18:00 截团,过时不候
2. 冷链运费必拍,墨尔本市区配送
3. 有问题加客服微信:xxx" />
          </Form.Item>
          <Form.Item label="封面图" name="coverFileId" valuePropName="value">
            <ImageUploader mode="single" purpose="tuan_cover" />
          </Form.Item>
          <Form.Item label="开团时间 ~ 截止时间" name="range"
            rules={[{ required: true, message: '请选择开团和截止时间' }]}>
            <DatePicker.RangePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="状态" name="status" rules={[{ required: true }]}>
            <Select options={[
              { value: 'draft', label: '草稿(不公开)' },
              { value: 'scheduled', label: '待开团(到时间自动开)' },
              { value: 'on_sale', label: '进行中' },
              { value: 'closed', label: '已截团' },
              { value: 'archived', label: '已归档' },
            ]} />
          </Form.Item>
          <Space>
            <Button type="primary" htmlType="submit">{isEdit ? '保存' : '创建'}</Button>
            <Button onClick={() => nav('/tuans')}>返回列表</Button>
          </Space>
        </Form>
      </Card>

      {/* 团内商品(编辑模式才可用) */}
      <Card
        title={<>团内商品 {items.length > 0 && <Tag color="blue" style={{ marginLeft: 8 }}>{items.length} 件</Tag>}</>}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openAddModal} disabled={!currentTuanId}>
            添加商品
          </Button>
        }
      >
        {!currentTuanId ? (
          <Empty description="保存新团后即可在这里管理团内商品" />
        ) : items.length === 0 ? (
          <Empty description="本团暂无商品,点右上角添加" />
        ) : (
          <Table<Product>
            rowKey="tuanItemId"
            dataSource={items}
            loading={itemsLoading}
            pagination={false}
            size="middle"
            columns={[
              { title: '封面', dataIndex: 'coverFileId', width: 60,
                render: (url: string) => url
                  ? <img src={url} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4 }} alt="" />
                  : null },
              { title: '商品', dataIndex: 'title', ellipsis: true },
              { title: '分组', dataIndex: 'section', width: 100,
                render: (s: string | null) => s || <span style={{ color: '#bbb' }}>—</span> },
              { title: '价格', dataIndex: 'price', width: 100,
                render: (c: number) => formatAud(c) },
              { title: '库存/已售', key: 'stock', width: 140,
                render: (_, row) => `${row.stock - row.sold} / ${row.sold}(总 ${row.stock})` },
              { title: '排序', dataIndex: 'sort', width: 70 },
              { title: '操作', key: 'actions', width: 180, render: (_, row) => (
                <Space>
                  <Button size="small" onClick={() => openEditModal(row)}>编辑</Button>
                  <Popconfirm
                    title="从团中移除?"
                    description={row.sold > 0 ? '已有成交,无法移除' : '此操作只是从团里拿掉,商品库条目保留'}
                    onConfirm={() => onRemoveItem(row)}
                    disabled={row.sold > 0}
                  >
                    <Button size="small" danger disabled={row.sold > 0}>移除</Button>
                  </Popconfirm>
                </Space>
              ) },
            ]}
          />
        )}
      </Card>

      {/* Add/Edit 团内商品 modal */}
      <Modal
        open={itemModalOpen}
        title={editingItem ? `编辑团内商品 · ${editingItem.title}` : '向团内添加商品'}
        onCancel={() => setItemModalOpen(false)}
        onOk={onItemSubmit}
        okText="保存"
        destroyOnClose
      >
        <Form form={itemForm} layout="vertical">
          <Form.Item
            label="选择商品(来自商品库)"
            name="productId"
            rules={[{ required: !editingItem, message: '请选择商品' }]}
          >
            <Select
              showSearch
              placeholder="从商品库挑选,或前往商品库新建"
              disabled={!!editingItem}
              options={catalogOptions}
              optionFilterProp="label"
            />
          </Form.Item>
          <Space size={24} style={{ width: '100%' }} wrap>
            <Form.Item label="价格 (元)" name="priceDollars" rules={[{ required: true }]}>
              <InputNumber min={0} step={0.01} precision={2} prefix="¥" style={{ width: 160 }} />
            </Form.Item>
            <Form.Item label="库存" name="stock" rules={[{ required: true }]}>
              <InputNumber min={0} style={{ width: 120 }} />
            </Form.Item>
            <Form.Item label="团内排序" name="sort">
              <InputNumber min={0} style={{ width: 120 }} />
            </Form.Item>
          </Space>
          <Form.Item label="团内分组" name="section"
            tooltip="顾客在团详情页 sidebar 看到的分组名(如 '蔬菜' / '运费必拍项')">
            <AutoComplete options={sectionOptions} allowClear placeholder="可选,留空归到'其他'组" />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
