import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  NavBar, List, Button, Empty, Toast, Dialog, Modal, Form, Input, TextArea, Tag,
} from 'antd-mobile';
import { AddOutline, EditSOutline, DeleteOutline } from 'antd-mobile-icons';
import { listAddresses, upsertAddress, deleteAddress, type Address } from '../api/address';

// 收货地址簿 — 支持新增/编辑/删除/设默认
// `?pick=1` 模式下,点击地址行返回上一页时通过 sessionStorage 传递选中地址 id
export default function Addresses() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const pickMode = params.get('pick') === '1';
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Address[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Address> | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await listAddresses();
      setItems(r);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const onSave = async (vals: any) => {
    const payload: Partial<Address> = {
      ...editing,
      ...vals,
    };
    try {
      await upsertAddress(payload);
      Toast.show({ icon: 'success', content: '已保存' });
      setEditOpen(false);
      setEditing(null);
      load();
    } catch (e: any) {
      Toast.show({ icon: 'fail', content: e.message || '保存失败' });
    }
  };

  const onDel = (a: Address) => {
    Dialog.confirm({
      content: `删除地址 「${a.recipient} · ${a.line1}」?`,
      onConfirm: async () => {
        try {
          await deleteAddress(a._id);
          Toast.show({ icon: 'success', content: '已删除' });
          load();
        } catch (e: any) {
          Toast.show({ icon: 'fail', content: e.message || '删除失败' });
        }
      },
    });
  };

  const onSetDefault = async (a: Address) => {
    try {
      await upsertAddress({ ...a, isDefault: true });
      Toast.show({ icon: 'success', content: '已设为默认' });
      load();
    } catch (e: any) {
      Toast.show({ icon: 'fail', content: e.message || '失败' });
    }
  };

  const onPick = (a: Address) => {
    sessionStorage.setItem('picked-address-id', a._id);
    nav(-1);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <NavBar onBack={() => nav(-1)}>{pickMode ? '选择收货地址' : '收货地址'}</NavBar>

      {loading ? null : items.length === 0 ? (
        <div className="pt-20">
          <Empty description="还没有收货地址" />
        </div>
      ) : (
        <List className="mt-2">
          {items.map((a) => (
            <List.Item
              key={a._id}
              clickable
              onClick={() => (pickMode ? onPick(a) : null)}
              extra={
                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                  {!a.isDefault && (
                    <a className="text-xs text-brand" onClick={() => onSetDefault(a)}>设默认</a>
                  )}
                  <a onClick={() => { setEditing(a); setEditOpen(true); }}><EditSOutline /></a>
                  <a className="text-gray-400" onClick={() => onDel(a)}><DeleteOutline /></a>
                </div>
              }
              description={
                <span className="text-xs text-gray-500">
                  {a.line1}{a.line2 ? `, ${a.line2}` : ''}, {a.suburb}, {a.state} {a.postcode}
                </span>
              }
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{a.recipient}</span>
                <span className="text-xs text-gray-500">{a.phone}</span>
                {a.isDefault && <Tag color="primary" fill="outline">默认</Tag>}
              </div>
            </List.Item>
          ))}
        </List>
      )}

      <div className="p-4">
        <Button
          block
          color="primary"
          onClick={() => { setEditing({}); setEditOpen(true); }}
        >
          <AddOutline /> 新增地址
        </Button>
      </div>

      <AddressEditModal
        visible={editOpen}
        editing={editing}
        onClose={() => { setEditOpen(false); setEditing(null); }}
        onSave={onSave}
      />
    </div>
  );
}

function AddressEditModal({
  visible, editing, onClose, onSave,
}: {
  visible: boolean;
  editing: Partial<Address> | null;
  onClose: () => void;
  onSave: (vals: any) => Promise<void>;
}) {
  const [form] = Form.useForm();

  useEffect(() => {
    if (visible) {
      form.resetFields();
      form.setFieldsValue(editing || {});
    }
  }, [visible, editing, form]);

  return (
    <Modal
      visible={visible}
      title={editing?._id ? '编辑地址' : '新增地址'}
      content={
        <Form form={form} layout="horizontal">
          <Form.Item name="recipient" label="收货人" rules={[{ required: true }]}>
            <Input placeholder="收货人姓名" />
          </Form.Item>
          <Form.Item name="phone" label="电话" rules={[{ required: true }]}>
            <Input placeholder="联系电话" type="tel" />
          </Form.Item>
          <Form.Item name="line1" label="详细地址" rules={[{ required: true }]}>
            <TextArea placeholder="街道+门牌" rows={2} />
          </Form.Item>
          <Form.Item name="line2" label="补充">
            <Input placeholder="单元/楼层" />
          </Form.Item>
          <Form.Item name="suburb" label="区/镇" rules={[{ required: true }]}>
            <Input placeholder="例:浦东新区" />
          </Form.Item>
          <Form.Item name="state" label="省/市" rules={[{ required: true }]}>
            <Input placeholder="例:上海" />
          </Form.Item>
          <Form.Item name="postcode" label="邮编" rules={[{ required: true }]}>
            <Input placeholder="6 位邮政编码" />
          </Form.Item>
        </Form>
      }
      closeOnAction
      actions={[
        {
          key: 'cancel',
          text: '取消',
          onClick: onClose,
        },
        {
          key: 'save',
          text: '保存',
          primary: true,
          onClick: async () => {
            const vals = await form.validateFields();
            await onSave(vals);
          },
        },
      ]}
      onClose={onClose}
    />
  );
}
