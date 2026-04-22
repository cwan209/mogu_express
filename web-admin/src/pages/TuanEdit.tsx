import { useEffect, useState } from 'react';
import { Alert, Card, Checkbox, Form, Input, DatePicker, Select, Button, message, Space } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs, { Dayjs } from 'dayjs';
import { createTuan, getTuan, listTuans, updateTuan } from '../api/tuan';
import { createProduct, listProducts } from '../api/product';
import type { Tuan, TuanStatus } from '../types';
import ImageUploader from '../components/ImageUploader';

const { TextArea } = Input;

interface FormValues {
  title: string;
  description: string;
  coverFileId: string;
  range: [Dayjs, Dayjs];
  status: TuanStatus;
}

export default function TuanEdit() {
  const nav = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = id && id !== 'new';
  const [form] = Form.useForm<FormValues>();

  // "从已有团复制"(仅新建模式可见)
  const [allTuans, setAllTuans] = useState<Tuan[]>([]);
  const [sourceTuanId, setSourceTuanId] = useState<string>('');
  const [copyProducts, setCopyProducts] = useState<boolean>(true);
  const [sourceProductCount, setSourceProductCount] = useState<number>(0);

  useEffect(() => {
    if (isEdit) {
      getTuan(id!).then((t) => {
        form.setFieldsValue({
          title: t.title,
          description: t.description,
          coverFileId: t.coverFileId,
          range: [dayjs(t.startAt), dayjs(t.endAt)],
          status: t.status,
        });
      });
    } else {
      form.setFieldsValue({
        status: 'draft',
        coverFileId: '',
      } as any);
      // 新建模式拉所有团作为"可复制的源"
      listTuans().then(setAllTuans).catch(() => setAllTuans([]));
    }
    // eslint-disable-next-line
  }, [id]);

  // 选源团时把基础字段回填到 form,方便用户再微调
  const onSelectSource = async (srcId: string) => {
    setSourceTuanId(srcId);
    if (!srcId) {
      setSourceProductCount(0);
      return;
    }
    const src = allTuans.find((t) => t._id === srcId);
    if (src) {
      form.setFieldsValue({
        title: src.title + ' (副本)',
        description: src.description || '',
        coverFileId: src.coverFileId || '',
        // 时间不复制 — 老时间已过,用户必须重选
      } as any);
    }
    try {
      const prods = await listProducts({ tuanId: srcId });
      setSourceProductCount(prods.length);
    } catch {
      setSourceProductCount(0);
    }
  };

  const onFinish = async (v: FormValues) => {
    const payload = {
      title: v.title,
      description: v.description || '',
      coverFileId: v.coverFileId || '',
      startAt: v.range[0].toISOString(),
      endAt: v.range[1].toISOString(),
      status: v.status,
    };
    if (v.range[1].isBefore(v.range[0])) {
      message.error('结束时间必须晚于开始时间');
      return;
    }
    if (payload.coverFileId && payload.coverFileId.startsWith('blob:')) {
      message.error('图片未完成上传,请等待或重新上传');
      return;
    }
    try {
      if (isEdit) {
        await updateTuan(id!, payload);
        message.success('保存成功');
        nav('/tuans');
        return;
      }

      const { _id: newId } = await createTuan(payload);

      // 复制商品
      if (sourceTuanId && copyProducts) {
        const hide = message.loading('正在复制商品...', 0);
        try {
          const prods = await listProducts({ tuanId: sourceTuanId });
          let ok = 0;
          for (const p of prods) {
            try {
              await createProduct({
                tuanId: newId,
                title: p.title,
                description: p.description || '',
                coverFileId: p.coverFileId || '',
                imageFileIds: p.imageFileIds || [],
                categoryIds: p.categoryIds || [],
                section: p.section || null,
                price: p.price,
                stock: p.stock,
                sort: p.sort,
              } as any);
              ok++;
            } catch (e: any) {
              // eslint-disable-next-line no-console
              console.warn('复制商品失败:', p.title, e?.message);
            }
          }
          hide();
          message.success(`创建成功,复制了 ${ok}/${prods.length} 件商品`);
        } catch (e: any) {
          hide();
          message.warning('团已创建,但复制商品失败:' + (e?.message || ''));
        }
      } else {
        message.success('创建成功');
      }
      nav('/tuans');
    } catch (e: any) {
      message.error(e.message || '保存失败');
    }
  };

  return (
    <Card title={isEdit ? '编辑团' : '新建团'}>
      {!isEdit && allTuans.length > 0 && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16, maxWidth: 640 }}
          message="从已有团快速复制"
          description={
            <div>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Select
                  allowClear
                  showSearch
                  style={{ width: '100%' }}
                  placeholder="选一个已有团作为模板(可选)"
                  value={sourceTuanId || undefined}
                  onChange={onSelectSource}
                  optionFilterProp="label"
                  options={allTuans.map((t) => ({
                    value: t._id,
                    label: `${t.title} · ${t.status}`,
                  }))}
                />
                {sourceTuanId && (
                  <Checkbox
                    checked={copyProducts}
                    onChange={(e) => setCopyProducts(e.target.checked)}
                  >
                    同时复制该团的商品({sourceProductCount} 件)— 价格/库存/图片/分组全部克隆
                  </Checkbox>
                )}
                {sourceTuanId && (
                  <div style={{ color: '#888', fontSize: 12 }}>
                    已把标题/介绍/封面回填到下方表单,请重新选择开团时间。
                  </div>
                )}
              </Space>
            </div>
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
          label="封面图"
          name="coverFileId"
          tooltip="本地拖拽上传,或折叠区粘贴已有 URL"
          valuePropName="value"
        >
          <ImageUploader mode="single" purpose="tuan_cover" />
        </Form.Item>
        <Form.Item
          label="开团时间 ~ 截止时间"
          name="range"
          rules={[{ required: true, message: '请选择开团和截止时间' }]}
        >
          <DatePicker.RangePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="状态" name="status" rules={[{ required: true }]}>
          <Select
            options={[
              { value: 'draft', label: '草稿(不公开)' },
              { value: 'scheduled', label: '待开团(到时间自动开)' },
              { value: 'on_sale', label: '进行中' },
              { value: 'closed', label: '已截团' },
              { value: 'archived', label: '已归档' },
            ]}
          />
        </Form.Item>
        <Space>
          <Button type="primary" htmlType="submit">{isEdit ? '保存' : '创建'}</Button>
          <Button onClick={() => nav('/tuans')}>取消</Button>
        </Space>
      </Form>
    </Card>
  );
}
