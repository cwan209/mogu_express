import { useEffect, useState, useMemo } from 'react';
import { Card, Form, Input, InputNumber, Select, Button, message, Space, AutoComplete } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { createProduct, getProduct, updateProduct, listProducts } from '../api/product';
import { listTuans } from '../api/tuan';
import { listCategories } from '../api/category';
import type { Tuan, Category, Product } from '../types';

const { TextArea } = Input;

interface FormValues {
  title: string;
  description: string;
  coverFileId: string;
  imageFileIds: string;    // 多图用换行分隔
  tuanId: string;
  categoryIds: string[];
  section: string;         // 团内分组
  priceDollars: number;
  stock: number;
  sort: number;
}

export default function ProductEdit() {
  const nav = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = id && id !== 'new';
  const [form] = Form.useForm<FormValues>();
  const [tuans, setTuans] = useState<Tuan[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [tuanId, setTuanId] = useState<string>('');
  const [sameTuanProducts, setSameTuanProducts] = useState<Product[]>([]);

  useEffect(() => {
    Promise.all([listTuans(), listCategories()]).then(([ts, cs]) => {
      setTuans(ts);
      setCats(cs);
    });
    if (isEdit) {
      getProduct(id!).then((p) => {
        form.setFieldsValue({
          title: p.title,
          description: p.description,
          coverFileId: p.coverFileId,
          imageFileIds: (p.imageFileIds || []).join('\n'),
          tuanId: p.tuanId,
          categoryIds: p.categoryIds,
          section: p.section || '',
          priceDollars: p.price / 100,
          stock: p.stock,
          sort: p.sort,
        });
        setTuanId(p.tuanId);
      });
    } else {
      form.setFieldsValue({
        coverFileId: 'https://picsum.photos/seed/p' + Date.now() + '/600/600',
        stock: 20,
        sort: 1,
        priceDollars: 9.99,
        categoryIds: [],
        section: '',
      } as any);
    }
    // eslint-disable-next-line
  }, [id]);

  // 当 tuanId 改变时,拉同团的 products 作为 section AutoComplete 的候选
  useEffect(() => {
    if (!tuanId) { setSameTuanProducts([]); return; }
    listProducts({ tuanId }).then(setSameTuanProducts).catch(() => setSameTuanProducts([]));
  }, [tuanId]);

  const sectionOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of sameTuanProducts) {
      const s = (p.section || '').trim();
      if (s) set.add(s);
    }
    return [...set].map((v) => ({ value: v }));
  }, [sameTuanProducts]);

  const onFinish = async (v: FormValues) => {
    const price = Math.round((v.priceDollars || 0) * 100);
    if (price <= 0) { message.error('价格必须大于 0'); return; }
    const payload = {
      title: v.title,
      description: v.description || '',
      coverFileId: v.coverFileId || '',
      imageFileIds: (v.imageFileIds || '').split('\n').map(s => s.trim()).filter(Boolean),
      tuanId: v.tuanId,
      categoryIds: v.categoryIds || [],
      section: (v.section || '').trim() || null,
      price,
      stock: v.stock,
      sort: v.sort,
    };
    try {
      if (isEdit) {
        await updateProduct(id!, payload);
        message.success('保存成功');
      } else {
        await createProduct(payload as any);
        message.success('创建成功');
      }
      nav(-1);
    } catch (e: any) {
      message.error(e.message || '保存失败');
    }
  };

  return (
    <Card title={isEdit ? '编辑商品' : '新建商品'}>
      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        onValuesChange={(changed) => {
          if ('tuanId' in changed) setTuanId(changed.tuanId);
        }}
        style={{ maxWidth: 640 }}
      >
        <Form.Item label="商品标题" name="title" rules={[{ required: true }]}>
          <Input maxLength={40} showCount />
        </Form.Item>
        <Form.Item label="用途/描述" name="description">
          <TextArea rows={3} maxLength={500} showCount />
        </Form.Item>
        <Form.Item label="封面 URL" name="coverFileId" rules={[{ required: true }]}>
          <Input placeholder="https://..." />
        </Form.Item>
        <Form.Item
          label="详情图 URL(每行一张)"
          name="imageFileIds"
          tooltip="M3+ 改为上传到云存储返回 fileId"
        >
          <TextArea rows={3} placeholder="https://...\nhttps://..." />
        </Form.Item>
        <Form.Item label="所属团" name="tuanId" rules={[{ required: true, message: '请选择所属团' }]}>
          <Select
            placeholder="选择团"
            options={tuans.map((t) => ({ value: t._id, label: t.title }))}
          />
        </Form.Item>
        <Form.Item
          label="团内分组"
          name="section"
          tooltip="顾客在团详情页左侧 sidebar 看到的分组名(如'蔬菜'、'运费必拍项')。选了所属团后下拉出现已有分组"
        >
          <AutoComplete
            options={sectionOptions}
            placeholder={tuanId ? '输入或选择分组名(可选)' : '请先选所属团'}
            allowClear
            filterOption={(input, option) =>
              (option?.value ?? '').toLowerCase().includes(input.toLowerCase())
            }
          />
        </Form.Item>
        <Form.Item label="分类(全局,跨团)" name="categoryIds">
          <Select
            mode="multiple"
            placeholder="可多选"
            options={cats.map((c) => ({ value: c._id, label: c.name }))}
          />
        </Form.Item>
        <Space size={24} style={{ width: '100%' }} wrap>
          <Form.Item label="价格 (AUD)" name="priceDollars" rules={[{ required: true }]}>
            <InputNumber min={0} step={0.01} precision={2} prefix="$" style={{ width: 160 }} />
          </Form.Item>
          <Form.Item label="库存" name="stock" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: 120 }} />
          </Form.Item>
          <Form.Item label="团内排序" name="sort">
            <InputNumber min={0} style={{ width: 120 }} />
          </Form.Item>
        </Space>
        <div>
          <Space>
            <Button type="primary" htmlType="submit">{isEdit ? '保存' : '创建'}</Button>
            <Button onClick={() => nav(-1)}>取消</Button>
          </Space>
        </div>
      </Form>
    </Card>
  );
}
