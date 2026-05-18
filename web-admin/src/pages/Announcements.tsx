import { useEffect, useState } from 'react';
import { Button, Card, Space, Table, Popconfirm, message, Modal, Form, Input, InputNumber, Switch, Image, Tag } from 'antd';
import type { Announcement } from '../types';
import { listAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement } from '../api/announcement';
import ImageUploader from '../components/ImageUploader';

export default function Announcements() {
  const [data, setData] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try { setData(await listAnnouncements()); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ sortOrder: (data.length + 1) * 10, active: true, image: '', link: '' });
    setOpen(true);
  };
  const openEdit = (row: Announcement) => {
    setEditing(row);
    form.setFieldsValue(row);
    setOpen(true);
  };

  const onSubmit = async () => {
    const v = await form.validateFields();
    if (v.image && v.image.startsWith('blob:')) {
      message.error('图片还未上传完成,稍候');
      return;
    }
    try {
      if (editing) {
        await updateAnnouncement(editing._id, v);
        message.success('已保存');
      } else {
        await createAnnouncement({
          image: v.image,
          link: v.link,
          sortOrder: Number(v.sortOrder) || 0,
          active: v.active !== false,
        });
        message.success('已创建');
      }
      setOpen(false);
      load();
    } catch (e: any) {
      message.error(e.message || '保存失败');
    }
  };

  const toggleActive = async (row: Announcement) => {
    try {
      await updateAnnouncement(row._id, { active: !row.active });
      load();
    } catch (e: any) {
      message.error(e.message || '操作失败');
    }
  };

  const onDelete = async (id: string) => {
    try {
      await deleteAnnouncement(id);
      message.success('已删除');
      load();
    } catch (e: any) {
      message.error(e.message || '删除失败');
    }
  };

  return (
    <Card title="首页轮播 Banner" extra={<Button type="primary" onClick={openNew}>新建</Button>}>
      <Table<Announcement>
        rowKey="_id"
        dataSource={data}
        loading={loading}
        pagination={false}
        columns={[
          {
            title: '图片',
            dataIndex: 'image',
            width: 160,
            render: (url: string) => url
              ? <Image src={url} width={120} height={60} style={{ objectFit: 'cover' }} />
              : '—',
          },
          {
            title: '链接',
            dataIndex: 'link',
            render: (v: string) => <code style={{ fontSize: 12 }}>{v}</code>,
          },
          { title: '排序', dataIndex: 'sortOrder', width: 80 },
          {
            title: '状态',
            dataIndex: 'active',
            width: 100,
            render: (v: boolean, row) => (
              <Tag color={v ? 'success' : 'default'} onClick={() => toggleActive(row)} style={{ cursor: 'pointer' }}>
                {v ? '已上架' : '已下架'}
              </Tag>
            ),
          },
          {
            title: '操作',
            key: 'actions',
            width: 160,
            render: (_, row) => (
              <Space>
                <Button size="small" onClick={() => openEdit(row)}>编辑</Button>
                <Popconfirm title="确认删除?" onConfirm={() => onDelete(row._id)}>
                  <Button size="small" danger>删除</Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={editing ? '编辑 Banner' : '新建 Banner'}
        open={open}
        onOk={onSubmit}
        onCancel={() => setOpen(false)}
        destroyOnClose
        width={520}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="image" label="图片" rules={[{ required: true, message: '请上传 banner 图片' }]}>
            <ImageUploader mode="single" purpose="announcement" />
          </Form.Item>
          <Form.Item
            name="link"
            label="跳转链接 (站内路径)"
            rules={[
              { required: true, message: '请填写跳转链接' },
              { pattern: /^\//, message: '必须以 / 开头,例:/tuan/abc123' },
            ]}
          >
            <Input placeholder="例:/tuan/abc123" />
          </Form.Item>
          <Form.Item name="sortOrder" label="排序(越小越靠前,推荐 10/20/30...)">
            <InputNumber min={0} step={10} />
          </Form.Item>
          <Form.Item name="active" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
