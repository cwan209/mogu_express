import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { NavBar, Input, Button, Toast, Form, TextArea } from 'antd-mobile';
import { registerProfile } from '../api/auth';
import { useAuthStore } from '../store/auth';

export default function RegisterProfile() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const returnTo = params.get('returnTo') || '/';
  const phone = useAuthStore((s) => s.user?.phone) || '';
  const updateUser = useAuthStore((s) => s.updateUser);
  const setRegistered = useAuthStore.setState;

  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (vals: any) => {
    setSubmitting(true);
    try {
      const addr = vals.line1
        ? {
            recipient: vals.name,
            phone: vals.phone,
            line1: vals.line1,
            line2: vals.line2,
            suburb: vals.suburb,
            state: vals.state,
            postcode: vals.postcode,
          }
        : undefined;
      await registerProfile({ name: vals.name, phone: vals.phone, address: addr });
      updateUser({ name: vals.name, phone: vals.phone });
      setRegistered((s) => ({ ...s, isRegistered: true }));
      Toast.show({ icon: 'success', content: '注册完成' });
      nav(returnTo, { replace: true });
    } catch (e: any) {
      Toast.show({ icon: 'fail', content: e.message || '提交失败' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <NavBar back={null}>完善资料</NavBar>
      <div className="p-3 text-xs text-gray-500">首次登录,请填写收货信息(地址可稍后补)</div>
      <Form
        form={form}
        layout="horizontal"
        onFinish={onSubmit}
        initialValues={{ phone }}
        footer={
          <Button block color="primary" size="large" type="submit" loading={submitting}>
            完成注册
          </Button>
        }
      >
        <Form.Header>基本信息</Form.Header>
        <Form.Item name="name" label="姓名" rules={[{ required: true, message: '姓名必填' }]}>
          <Input placeholder="收货人姓名" />
        </Form.Item>
        <Form.Item name="phone" label="电话" rules={[{ required: true, message: '电话必填' }]}>
          <Input placeholder="联系电话" type="tel" />
        </Form.Item>

        <Form.Header>收货地址(可选,跳过则后续在「地址」补)</Form.Header>
        <Form.Item name="line1" label="详细地址">
          <TextArea placeholder="街道+门牌,如 XX 路 88 号 5 栋 1801" rows={2} />
        </Form.Item>
        <Form.Item name="line2" label="补充">
          <Input placeholder="单元/楼层,选填" />
        </Form.Item>
        <Form.Item name="suburb" label="区/镇">
          <Input placeholder="例:浦东新区 / 蛇口" />
        </Form.Item>
        <Form.Item name="state" label="省/市">
          <Input placeholder="例:上海 / 广东" />
        </Form.Item>
        <Form.Item name="postcode" label="邮编">
          <Input placeholder="6 位邮政编码" />
        </Form.Item>
      </Form>
    </div>
  );
}
