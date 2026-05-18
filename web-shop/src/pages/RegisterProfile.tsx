import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { NavBar, Input, Button, Toast, Form } from 'antd-mobile';
import { registerProfile } from '../api/auth';
import { useAuthStore } from '../store/auth';

export default function RegisterProfile() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const returnTo = params.get('returnTo') || '/';
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);

  const [groupId, setGroupId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    const trimmed = groupId.trim();
    if (!trimmed) {
      Toast.show({ icon: 'fail', content: '请填写群号' });
      return;
    }
    setSubmitting(true);
    try {
      await registerProfile({ groupId: trimmed });
      updateUser({ groupId: trimmed });
      useAuthStore.setState((s) => ({ ...s, isRegistered: true }));
      nav(returnTo, { replace: true });
    } catch (e: any) {
      Toast.show({ icon: 'fail', content: e.message || '提交失败' });
    } finally {
      setSubmitting(false);
    }
  };

  const nickname = user?.wechat?.nickname || '微信用户';

  return (
    <>
      <NavBar back={null}>完善资料</NavBar>
      <div style={{ padding: '24px 16px' }}>
        <p style={{ fontSize: 16, marginBottom: 8 }}>
          看到您是 <strong>{nickname}</strong>
        </p>
        <p style={{ color: '#666', marginBottom: 24 }}>
          为了让团长找到您,请填写您所在的微信群号:
        </p>
        <Form layout="vertical">
          <Form.Item label="群号">
            <Input
              placeholder="如:墨尔本生鲜三号群"
              value={groupId}
              onChange={setGroupId}
              maxLength={30}
              clearable
            />
          </Form.Item>
        </Form>
        <Button
          block
          color="primary"
          loading={submitting}
          onClick={onSubmit}
          style={{ marginTop: 24 }}
        >
          完成
        </Button>
      </div>
    </>
  );
}
