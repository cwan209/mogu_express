import { Card, Form, Input, Button, message, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminLogin } from '../api/admin';
import { useAuthStore } from '../auth/store';

const { Title, Text } = Typography;

export default function Login() {
  const nav = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const res = await adminLogin(values.username, values.password);
      setAuth(res.token, res.admin);
      message.success('登录成功');
      nav('/dashboard', { replace: true });
    } catch (e: any) {
      message.error(e?.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #E34D59 0%, #F06977 100%)',
      }}
    >
      <Card style={{ width: 360 }}>
        <Title level={3} style={{ textAlign: 'center', marginBottom: 4 }}>
          接龙团购 · 管理后台
        </Title>
        <Text type="secondary" style={{ display: 'block', textAlign: 'center', marginBottom: 24 }}>
          M0 脚手架 · 默认账号 admin / admin
        </Text>
        <Form layout="vertical" onFinish={onFinish} initialValues={{ username: 'admin', password: 'admin' }}>
          <Form.Item
            label="用户名"
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input autoFocus placeholder="admin" />
          </Form.Item>
          <Form.Item
            label="密码"
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password placeholder="密码" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>
            登录
          </Button>
        </Form>
      </Card>
    </div>
  );
}
