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

const COURIER_OPTIONS = ['顺丰', '中通', '圆通', '极兔', 'EMS', 'Australia Post', 'StarTrack', '其他'];

interface CatalogFormValues {
  title: string;
  description: string;
  coverFileId: string;
  imageFileIds: string[];
  categoryIds: string[];
  // 扩展字段
  brand?: string;
  spec?: string;
  basePrice?: number;       // ¥(元),提交时 × 100
  englishName?: string;
  courierName?: string;
  courierFactor?: number;
  secondaryImages?: Array<{ url: string; caption: string }>;
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
        brand: '', spec: '', basePrice: undefined, englishName: '',
        courierName: undefined, courierFactor: undefined, secondaryImages: [],
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
          brand: p.brand || '', spec: p.spec || '',
          basePrice: p.basePrice != null ? p.basePrice / 100 : undefined,
          englishName: p.englishName || '',
          courierName: p.courierName || undefined,
          courierFactor: p.courierFactor,
          secondaryImages: p.secondaryImages || [],
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
        const px = p as CatalogProduct & Partial<Product>;
        form.setFieldsValue({
          title: p.title, description: p.description, coverFileId: p.coverFileId,
          imageFileIds: p.imageFileIds || [], categoryIds: p.categoryIds || [],
          brand: px.brand || '', spec: px.spec || '',
          basePrice: px.basePrice != null ? px.basePrice / 100 : undefined,
          englishName: px.englishName || '',
          courierName: px.courierName || undefined,
          courierFactor: px.courierFactor,
          secondaryImages: px.secondaryImages || [],
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
    // 7 字段公共部分(catalog 上的扩展字段)
    const extFields = {
      brand: (v.brand || '').trim() || undefined,
      spec: (v.spec || '').trim() || undefined,
      basePrice: v.basePrice != null ? Math.round(v.basePrice * 100) : undefined,
      englishName: (v.englishName || '').trim() || undefined,
      courierName: v.courierName || undefined,
      courierFactor: v.courierFactor,
      secondaryImages: (v.secondaryImages || []).filter((x) => x && x.url),
    };
    try {
      if (isNew) {
        const attach = attachTuanId ? await tiForm.validateFields() : null;
        const payload: any = {
          title: v.title,
          description: v.description || '',
          coverFileId: v.coverFileId || '',
          imageFileIds: v.imageFileIds || [],
          categoryIds: v.categoryIds || [],
          ...extFields,
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
          ...extFields,
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
        await updateProduct(id!, {
          title: v.title,
          description: v.description || '',
          coverFileId: v.coverFileId || '',
          imageFileIds: v.imageFileIds || [],
          categoryIds: v.categoryIds || [],
          ...extFields,
        });
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

        <Card type="inner" title="商品资料(扩展)" size="small" style={{ marginBottom: 24 }}>
          <Form.Item name="brand" label="品牌">
            <Input maxLength={50} placeholder="如:Coles / Woolworths" />
          </Form.Item>
          <Form.Item name="spec" label="规格">
            <Input maxLength={100} placeholder="如:500g/盒 或 1.2L 装" />
          </Form.Item>
          <Form.Item name="basePrice" label="正常收录价 (¥)" tooltip="reference 用,不参与团购定价">
            <InputNumber min={0} step={0.01} style={{ width: '100%' }} placeholder="正常零售价" />
          </Form.Item>
          <Form.Item name="englishName" label="英文名">
            <Input maxLength={200} placeholder="Australian Beef 500g" />
          </Form.Item>
          <Form.Item name="courierName" label="快递公司">
            <Select
              options={COURIER_OPTIONS.map((c) => ({ label: c, value: c }))}
              placeholder="选快递"
              allowClear
            />
          </Form.Item>
          <Form.Item name="courierFactor" label="快递系数" tooltip="按重量算运费的乘数,0~10">
            <InputNumber min={0} max={10} step={0.1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.List name="secondaryImages">
            {(fields, { add, remove }) => (
              <>
                <div style={{ marginBottom: 8 }}>次要图片</div>
                {fields.map((field) => (
                  <Space key={field.key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                    <Form.Item {...field} name={[field.name, 'url']} rules={[{ required: true, message: '需 URL' }]}>
                      <Input placeholder="图片 URL" style={{ width: 250 }} />
                    </Form.Item>
                    <Form.Item {...field} name={[field.name, 'caption']}>
                      <Input placeholder="说明" style={{ width: 200 }} />
                    </Form.Item>
                    <Button onClick={() => remove(field.name)}>删</Button>
                  </Space>
                ))}
                <Button onClick={() => add({ url: '', caption: '' })}>+ 加次要图片</Button>
              </>
            )}
          </Form.List>
        </Card>

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
