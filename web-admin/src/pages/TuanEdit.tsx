import { useEffect } from 'react';
import { Card, Form, Input, DatePicker, Select, Button, message, Space } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs, { Dayjs } from 'dayjs';
import { createTuan, getTuan, updateTuan } from '../api/tuan';
import type { TuanStatus } from '../types';

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
        coverFileId: 'https://picsum.photos/seed/' + Date.now() + '/800/450',
      } as any);
    }
    // eslint-disable-next-line
  }, [id]);

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
    try {
      if (isEdit) {
        await updateTuan(id!, payload);
        message.success('保存成功');
      } else {
        await createTuan(payload);
        message.success('创建成功');
      }
      nav('/tuans');
    } catch (e: any) {
      message.error(e.message || '保存失败');
    }
  };

  return (
    <Card title={isEdit ? '编辑团' : '新建团'}>
      <Form form={form} layout="vertical" onFinish={onFinish} style={{ maxWidth: 640 }}>
        <Form.Item label="团标题" name="title" rules={[{ required: true, message: '请输入团标题' }]}>
          <Input placeholder="例:本周生鲜团 · 墨尔本周三截团" maxLength={40} showCount />
        </Form.Item>
        <Form.Item label="团介绍" name="description">
          <TextArea rows={3} maxLength={200} showCount placeholder="产地/自提/截团/发货等说明" />
        </Form.Item>
        <Form.Item
          label="封面图 URL"
          name="coverFileId"
          tooltip="M1 阶段用外链 URL;M3+ 接入云存储后改为 fileId"
        >
          <Input placeholder="https://..." />
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
