import { useEffect } from 'react';
import { Card, Form, Input, Button, message, Space, Alert } from 'antd';
import { getHomeBanner, updateHomeBanner } from '../api/settings';

export default function Settings() {
  const [form] = Form.useForm<{ title: string; subtitle: string }>();

  useEffect(() => {
    getHomeBanner().then((b) => form.setFieldsValue(b)).catch(() => {});
  }, [form]);

  const onFinish = async (v: { title: string; subtitle: string }) => {
    try {
      await updateHomeBanner({ title: v.title.trim(), subtitle: v.subtitle.trim() });
      message.success('已保存,小程序刷新可见');
    } catch (e: any) {
      message.error(e.message || '保存失败');
    }
  };

  return (
    <Space direction="vertical" size={24} style={{ width: '100%', maxWidth: 720 }}>
      <Card title="首页 Banner / 公告">
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="顾客小程序首页最上方的红色横幅区"
          description="标题大字 + 副标题小字。顾客每次打开首页都会拉取最新内容。"
        />
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item label="主标题" name="title" rules={[{ required: true, max: 20 }]}>
            <Input placeholder="例:接龙团购" maxLength={20} showCount />
          </Form.Item>
          <Form.Item label="副标题/公告语" name="subtitle" rules={[{ max: 60 }]}>
            <Input placeholder="例:本周进行中 · 尽快接龙抢货" maxLength={60} showCount />
          </Form.Item>
          <Button type="primary" htmlType="submit">保存</Button>
        </Form>
      </Card>
    </Space>
  );
}
