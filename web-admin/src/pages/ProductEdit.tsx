// ProductEdit — 根据 URL 判断编辑的是"商品库"还是"团内实例"
//
//   /products/new                   → 新建商品(仅目录,选填 tuanId+价格 可同时挂到某团)
//   /products/new?tuanId=X          → 新建并挂到团 X
//   /products/:catalogId            → 编辑商品库条目(title/描述/图/分类)
//   /products/:tuanItemId?tuanId=X  → 编辑团内实例(价格/库存/排序/分组 + 目录字段只读显示)

import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Card, Form, Input, InputNumber, Select, Button, message, Space, AutoComplete,
} from 'antd';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  createProduct, getCatalog, listCatalog, listProducts, updateProduct,
} from '../api/product';
import { updateTuanItem } from '../api/tuanItem';
import { listTuans } from '../api/tuan';
import { listCategories } from '../api/category';
import type { CatalogProduct, Tuan, Category, Product } from '../types';
import ImageUploader from '../components/ImageUploader';

const { TextArea } = Input;

interface CatalogFormValues {
  title: string;
  description: string;
  coverFileId: string;
  imageFileIds: string[];
  categoryIds: string[];
}
interface TuanItemFormValues {
  productId: string;
  priceDollars: number;
  stock: number;
  sort: number;
  section: string;
}

export default function ProductEdit() {
  const nav = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [sp] = useSearchParams();
  const tuanIdInUrl = sp.get('tuanId') || '';

  const isNew = id === 'new';
  // 判断是否是编辑团内实例:有 tuanId 且 id 看起来像 tuanItemId(以 'ti_' 开头或 URL 有 tuanId)
  const editingTuanItem = !!tuanIdInUrl && !isNew;

  const [form] = Form.useForm<CatalogFormValues>();
  const [tiForm] = Form.useForm<TuanItemFormValues>();

  const [tuans, setTuans] = useState<Tuan[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [sameTuanProducts, setSameTuanProducts] = useState<Product[]>([]);
  // 新建时的"挂团"附加信息
  const [attachTuanId, setAttachTuanId] = useState<string>(tuanIdInUrl);
  const [current, setCurrent] = useState<Product | CatalogProduct | null>(null);

  useEffect(() => {
    Promise.all([listTuans(), listCategories(), listCatalog()])
      .then(([ts, cs, cat]) => { setTuans(ts); setCats(cs); setCatalog(cat); });

    if (isNew) {
      form.setFieldsValue({
        title: '', description: '', coverFileId: '', imageFileIds: [], categoryIds: [],
      });
      if (tuanIdInUrl) {
        tiForm.setFieldsValue({ productId: '', priceDollars: 9.99, stock: 20, sort: 1, section: '' });
      }
      return;
    }

    if (editingTuanItem) {
      // 编辑团内实例:拉 joined view → 拆成 catalog 字段(只读回显) + tuanItem 字段(可编辑)
      listProducts({ tuanId: tuanIdInUrl }).then((items) => {
        const p = items.find((x) => x._id === id || x.tuanItemId === id);
        if (!p) { message.error('团内商品不存在'); return; }
        setCurrent(p);
        form.setFieldsValue({
          title: p.title, description: p.description, coverFileId: p.coverFileId,
          imageFileIds: p.imageFileIds || [], categoryIds: p.categoryIds || [],
        });
        tiForm.setFieldsValue({
          productId: p.productId,
          priceDollars: p.price / 100,
          stock: p.stock, sort: p.sort, section: p.section || '',
        });
      });
    } else {
      // 编辑商品库目录
      getCatalog(id!).then((p) => {
        setCurrent(p);
        form.setFieldsValue({
          title: p.title, description: p.description, coverFileId: p.coverFileId,
          imageFileIds: p.imageFileIds || [], categoryIds: p.categoryIds || [],
        });
      });
    }
    // eslint-disable-next-line
  }, [id, tuanIdInUrl]);

  useEffect(() => {
    if (!attachTuanId) { setSameTuanProducts([]); return; }
    listProducts({ tuanId: attachTuanId }).then(setSameTuanProducts).catch(() => setSameTuanProducts([]));
  }, [attachTuanId]);

  const sectionOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of sameTuanProducts) {
      const s = (p.section || '').trim();
      if (s) set.add(s);
    }
    return [...set].map((v) => ({ value: v }));
  }, [sameTuanProducts]);

  const onFinishCatalog = async (v: CatalogFormValues) => {
    if (v.coverFileId && v.coverFileId.startsWith('blob:')) {
      message.error('封面图未完成上传'); return;
    }
    if ((v.imageFileIds || []).some((u) => u.startsWith('blob:'))) {
      message.error('详情图未完成上传'); return;
    }
    try {
      if (isNew) {
        const attach = attachTuanId ? await tiForm.validateFields() : null;
        const payload: any = {
          title: v.title,
          description: v.description || '',
          coverFileId: v.coverFileId || '',
          imageFileIds: v.imageFileIds || [],
          categoryIds: v.categoryIds || [],
        };
        if (attach) {
          payload.tuanId = attachTuanId;
          payload.price = Math.round((attach.priceDollars || 0) * 100);
          payload.stock = attach.stock | 0;
          payload.sort = attach.sort | 0;
          payload.section = (attach.section || '').trim() || null;
          if (payload.price <= 0) { message.error('价格必须大于 0'); return; }
        }
        await createProduct(payload);
        message.success('创建成功');
      } else if (editingTuanItem) {
        // 两步更新:目录字段 → updateProduct(按 productId);团内字段 → updateTuanItem(按 tuanItemId)
        const productId = (current as Product).productId;
        await updateProduct(productId, {
          title: v.title,
          description: v.description || '',
          coverFileId: v.coverFileId || '',
          imageFileIds: v.imageFileIds || [],
          categoryIds: v.categoryIds || [],
        });
        const ti = await tiForm.validateFields();
        const price = Math.round((ti.priceDollars || 0) * 100);
        if (price <= 0) { message.error('价格必须大于 0'); return; }
        await updateTuanItem(id!, {
          price, stock: ti.stock, sort: ti.sort,
          section: (ti.section || '').trim() || null,
        });
        message.success('保存成功');
      } else {
        // 纯目录编辑
        await updateProduct(id!, v);
        message.success('保存成功');
      }
      nav(-1);
    } catch (e: any) {
      message.error(e.message || '保存失败');
    }
  };

  return (
    <Card title={
      isNew ? '新建商品' :
      editingTuanItem ? '编辑团内商品' : '编辑商品库条目'
    }>
      {!isNew && editingTuanItem && (
        <Alert
          type="info"
          showIcon
          style={{ maxWidth: 640, marginBottom: 16 }}
          message="此处修改会影响所有使用该商品的团"
          description="标题/描述/图片/分类 属于商品库,改了所有团看到的都会变。价格/库存/排序/分组 只影响当前团。"
        />
      )}

      <Form form={form} layout="vertical" onFinish={onFinishCatalog} style={{ maxWidth: 640 }}>
        <Form.Item label="商品标题" name="title" rules={[{ required: true }]}>
          <Input maxLength={40} showCount />
        </Form.Item>
        <Form.Item label="用途/描述" name="description">
          <TextArea rows={3} maxLength={500} showCount />
        </Form.Item>
        <Form.Item label="封面图" name="coverFileId" rules={[{ required: true, message: '请上传封面图' }]}>
          <ImageUploader mode="single" purpose="product_cover" />
        </Form.Item>
        <Form.Item label="详情图" name="imageFileIds" tooltip="最多 5 张">
          <ImageUploader mode="multiple" max={5} purpose="product_image" />
        </Form.Item>
        <Form.Item label="分类(全局)" name="categoryIds">
          <Select mode="multiple" placeholder="可多选"
            options={cats.map((c) => ({ value: c._id, label: c.name }))} />
        </Form.Item>

        {/* 团内字段:新建 + 选了挂团,或编辑团内实例时出现 */}
        {(isNew || editingTuanItem) && (
          <Card
            type="inner"
            size="small"
            title={editingTuanItem ? '团内字段(仅当前团)' : '同时挂到某个团(可选)'}
            style={{ marginBottom: 24 }}
          >
            {isNew && (
              <Form.Item label="挂到团">
                <Select
                  allowClear
                  placeholder="不选则只加到商品库"
                  value={attachTuanId || undefined}
                  onChange={(v) => setAttachTuanId(v || '')}
                  options={tuans.map((t) => ({ value: t._id, label: t.title }))}
                />
              </Form.Item>
            )}
            {(attachTuanId || editingTuanItem) && (
              <Form form={tiForm} layout="vertical" component={false}>
                {isNew && (
                  <Form.Item label="在商品库中选已有商品(留空则用上方表单新建)" name="productId">
                    <Select
                      allowClear
                      placeholder="从商品库选 — 选了会用该商品的目录信息"
                      options={catalog.map((p) => ({ value: p._id, label: p.title }))}
                      onChange={(pid) => {
                        const p = catalog.find((x) => x._id === pid);
                        if (p) {
                          form.setFieldsValue({
                            title: p.title, description: p.description,
                            coverFileId: p.coverFileId, imageFileIds: p.imageFileIds,
                            categoryIds: p.categoryIds,
                          });
                        }
                      }}
                    />
                  </Form.Item>
                )}
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
                <Form.Item label="团内分组" name="section">
                  <AutoComplete
                    options={sectionOptions}
                    placeholder="输入或选择分组名(可选)"
                    allowClear
                  />
                </Form.Item>
              </Form>
            )}
          </Card>
        )}

        <Space>
          <Button type="primary" htmlType="submit">{isNew ? '创建' : '保存'}</Button>
          <Button onClick={() => nav(-1)}>取消</Button>
        </Space>
      </Form>
    </Card>
  );
}
