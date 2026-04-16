import { useEffect, useState } from 'react';
import { Button, Card, Space, Table, Popconfirm, message, Modal, Form, Input, InputNumber, Switch } from 'antd';
import type { Category } from '../types';
import { listCategories, createCategory, updateCategory, deleteCategory } from '../api/category';

export default function Categories() {
  const [data, setData] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try { setData(await listCategories()); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ sort: data.length + 1, isActive: true });
    setOpen(true);
  };
  const openEdit = (row: Category) => {
    setEditing(row);
    form.setFieldsValue(row);
    setOpen(true);
  };

  const onSubmit = async () => {
    const v = await form.validateFields();
    try {
      if (editing) {
        await updateCategory(editing._id, v);
        message.success('已保存');
      } else {
        await createCategory(v.name, v.sort || 0);
        message.success('已创建');
      }
      setOpen(false);
      load();
    } catch (e: any) {
      message.error(e.message || '保存失败');
    }
  };

  const onDelete = async (id: string) => {
    try {
      await deleteCategory(id);
      message.success('已删除');
      load();
    } catch (e: any) {
      message.error(e.message || '删除失败');
    }
  };

  return (
    <Card title="分类管理" extra={<Button type="primary" onClick={openNew}>新建分类</Button>}>
      <Table<Category>
        rowKey="_id"
        dataSource={data}
        loading={loading}
        pagination={false}
        columns={[
          { title: '名称', dataIndex: 'name' },
          { title: '排序', dataIndex: 'sort', width: 100 },
          {
            title: '启用',
            dataIndex: 'isActive',
            width: 100,
            render: (v: boolean) => (v ? '✓' : '—'),
          },
          {
            title: '操作',
            key: 'actions',
            width: 160,
            render: (_, row) => (
              <Space>
                <Button size="small" onClick={() => openEdit(row)}>编辑</Button>
                <Popconfirm title={`删除"${row.name}"?`} onConfirm={() => onDelete(row._id)}>
                  <Button size="small" danger>删除</Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={editing ? '编辑分类' : '新建分类'}
        open={open}
        onOk={onSubmit}
        onCancel={() => setOpen(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="分类名" rules={[{ required: true }]}>
            <Input placeholder="例:生鲜蔬果" maxLength={20} />
          </Form.Item>
          <Form.Item name="sort" label="排序(越小越靠前)">
            <InputNumber min={0} />
          </Form.Item>
          <Form.Item name="isActive" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
