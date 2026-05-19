import { useEffect, useState } from 'react';
import {
  Avatar,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  message,
} from 'antd';
import { UserOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { UserAdminView } from '../types';
import { listUsers, updateUserAdmin } from '../api/user';
import { formatAud } from '../utils/money';

const PRESET_TAGS = ['VIP', '大客户', '老顾客', '新用户', '退货扰心', '黑名单'];
const PRESET_TAG_OPTIONS = PRESET_TAGS.map((t) => ({ value: t, label: t }));

interface PageState {
  page: number;
  pageSize: number;
}

export default function Users() {
  const [data, setData] = useState<UserAdminView[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [tagFilter, setTagFilter] = useState<string | undefined>();
  const [pageState, setPageState] = useState<PageState>({ page: 1, pageSize: 20 });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UserAdminView | null>(null);
  const [form] = Form.useForm<{ adminNotes: string; adminTags: string[] }>();

  const load = async (override?: Partial<PageState> & { keyword?: string; tag?: string | undefined }) => {
    setLoading(true);
    try {
      const r = await listUsers({
        page: override?.page ?? pageState.page,
        pageSize: override?.pageSize ?? pageState.pageSize,
        keyword: (override?.keyword ?? keyword).trim() || undefined,
        hasTag: (override?.tag ?? tagFilter) || undefined,
      });
      setData(r.items);
      setTotal(r.total);
    } catch (e: any) {
      message.error(e.message || '加载用户失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagFilter]);

  const onSearch = (kw: string) => {
    setKeyword(kw);
    setPageState({ ...pageState, page: 1 });
    load({ page: 1, keyword: kw });
  };

  const openEdit = (u: UserAdminView) => {
    setEditing(u);
    form.setFieldsValue({
      adminNotes: u.adminNotes || '',
      adminTags: u.adminTags || [],
    });
    setOpen(true);
  };

  const onSubmit = async () => {
    if (!editing) return;
    const v = await form.validateFields();
    const notes = (v.adminNotes || '').trim();
    if (notes.length > 500) {
      message.error('备注最多 500 字');
      return;
    }
    const tags = (v.adminTags || [])
      .map((t) => String(t).trim())
      .filter(Boolean);
    if (tags.some((t) => t.length > 30)) {
      message.error('单个标签不能超过 30 字');
      return;
    }
    if (tags.length > 10) {
      message.error('标签最多 10 个');
      return;
    }
    try {
      await updateUserAdmin(editing._id, { adminNotes: notes, adminTags: tags });
      message.success('已保存');
      setOpen(false);
      setEditing(null);
      load();
    } catch (e: any) {
      message.error(e.message || '保存失败');
    }
  };

  return (
    <Card title="用户管理">
      <Space style={{ marginBottom: 12 }} wrap>
        <Input.Search
          placeholder="昵称 / openid / 群号"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onSearch={onSearch}
          allowClear
          style={{ width: 320 }}
        />
        <Select
          allowClear
          placeholder="按标签筛选"
          style={{ width: 180 }}
          value={tagFilter}
          onChange={(v) => {
            setTagFilter(v);
            setPageState({ ...pageState, page: 1 });
          }}
          options={PRESET_TAG_OPTIONS}
        />
        <Button onClick={() => load()}>刷新</Button>
      </Space>

      <Table<UserAdminView>
        rowKey="_id"
        dataSource={data}
        loading={loading}
        pagination={{
          current: pageState.page,
          pageSize: pageState.pageSize,
          total,
          showSizeChanger: true,
          pageSizeOptions: [10, 20, 50, 100],
          showTotal: (t) => `共 ${t} 个用户`,
          onChange: (page, pageSize) => {
            setPageState({ page, pageSize });
            load({ page, pageSize });
          },
        }}
        columns={[
          {
            title: '头像',
            dataIndex: 'avatar',
            width: 64,
            render: (v: string | null) =>
              v ? <Avatar src={v} size={36} /> : <Avatar icon={<UserOutlined />} size={36} />,
          },
          {
            title: '昵称',
            dataIndex: 'nickname',
            width: 140,
            render: (v: string) => <b>{v}</b>,
          },
          {
            title: 'openid',
            dataIndex: '_openid',
            width: 200,
            render: (v: string) => <code style={{ fontSize: 11 }}>{v}</code>,
          },
          {
            title: '群号',
            dataIndex: 'groupId',
            width: 120,
            render: (v: string | null) => v || <span style={{ color: '#bbb' }}>—</span>,
          },
          {
            title: '订单',
            dataIndex: 'orderCount',
            width: 80,
            render: (v?: number) => v ?? 0,
          },
          {
            title: '消费',
            dataIndex: 'totalAmount',
            width: 110,
            render: (v?: number) => <b>{formatAud(v || 0)}</b>,
          },
          {
            title: '备注',
            dataIndex: 'adminNotes',
            ellipsis: true,
            render: (v: string) => v || <span style={{ color: '#bbb' }}>—</span>,
          },
          {
            title: '标签',
            dataIndex: 'adminTags',
            width: 220,
            render: (tags?: string[]) =>
              tags && tags.length ? (
                <Space size={4} wrap>
                  {tags.map((t) => (
                    <Tag key={t} color="blue">
                      {t}
                    </Tag>
                  ))}
                </Space>
              ) : (
                <span style={{ color: '#bbb' }}>—</span>
              ),
          },
          {
            title: '注册时间',
            dataIndex: 'createdAt',
            width: 170,
            render: (s: string) =>
              s ? dayjs(s).format('YYYY-MM-DD HH:mm') : '—',
          },
          {
            title: '操作',
            key: 'op',
            width: 90,
            fixed: 'right' as const,
            render: (_: unknown, u) => (
              <Button size="small" type="link" onClick={() => openEdit(u)}>
                编辑
              </Button>
            ),
          },
        ]}
        scroll={{ x: 1500 }}
      />

      <Modal
        open={open}
        title={editing ? `编辑 ${editing.nickname}` : '编辑用户'}
        onCancel={() => {
          setOpen(false);
          setEditing(null);
        }}
        onOk={onSubmit}
        okText="保存"
        destroyOnClose
        width={560}
      >
        {editing && (
          <div style={{ marginBottom: 12, color: '#666', fontSize: 12 }}>
            openid:&nbsp;<code style={{ fontSize: 11 }}>{editing._openid}</code>
            {editing.groupId && (
              <>
                &nbsp;·&nbsp;群号:<b>{editing.groupId}</b>
              </>
            )}
          </div>
        )}
        <Form form={form} layout="vertical">
          <Form.Item name="adminNotes" label="备注 (业务可见)">
            <Input.TextArea
              rows={3}
              maxLength={500}
              showCount
              placeholder="例:大客户 / VIP / 退货扰心"
            />
          </Form.Item>
          <Form.Item
            name="adminTags"
            label="标签 (最多 10 个,每个 ≤30 字)"
            tooltip="可选预设或自由输入(回车确认)"
          >
            <Select
              mode="tags"
              allowClear
              placeholder="选择或输入标签"
              options={PRESET_TAG_OPTIONS}
              maxTagCount={10}
              tokenSeparators={[',', ' ']}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
