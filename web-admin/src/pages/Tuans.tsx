import { useEffect, useState } from 'react';
import { Button, Card, Space, Table, Tag, Popconfirm, message, Select } from 'antd';
import { useNavigate } from 'react-router-dom';
import type { Tuan, TuanStatus } from '../types';
import { listTuans, deleteTuan } from '../api/tuan';

const STATUS_COLOR: Record<TuanStatus, string> = {
  draft: 'default',
  scheduled: 'blue',
  on_sale: 'green',
  closed: 'orange',
  archived: 'default',
};

const STATUS_LABEL: Record<TuanStatus, string> = {
  draft: '草稿',
  scheduled: '待开团',
  on_sale: '进行中',
  closed: '已截团',
  archived: '已归档',
};

export default function Tuans() {
  const nav = useNavigate();
  const [data, setData] = useState<Tuan[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<TuanStatus | undefined>();

  const load = async () => {
    setLoading(true);
    try {
      setData(await listTuans(statusFilter ? { status: statusFilter } : undefined));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [statusFilter]);

  const onDelete = async (id: string) => {
    try {
      await deleteTuan(id);
      message.success('已删除');
      load();
    } catch (e: any) {
      message.error(e.message || '删除失败');
    }
  };

  return (
    <Card
      title="团管理"
      extra={
        <Space>
          <Select
            placeholder="状态筛选"
            allowClear
            style={{ width: 140 }}
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'draft', label: '草稿' },
              { value: 'scheduled', label: '待开团' },
              { value: 'on_sale', label: '进行中' },
              { value: 'closed', label: '已截团' },
              { value: 'archived', label: '已归档' },
            ]}
          />
          <Button type="primary" onClick={() => nav('/tuans/new')}>新建团</Button>
        </Space>
      }
    >
      <Table<Tuan>
        rowKey="_id"
        dataSource={data}
        loading={loading}
        pagination={{ pageSize: 10, showSizeChanger: false }}
        columns={[
          {
            title: '封面',
            dataIndex: 'coverFileId',
            width: 80,
            render: (url: string) => (
              <img src={url} style={{ width: 60, height: 34, objectFit: 'cover', borderRadius: 4 }} alt="" />
            ),
          },
          { title: '标题', dataIndex: 'title', ellipsis: true },
          {
            title: '状态',
            dataIndex: 'status',
            width: 100,
            render: (s: TuanStatus) => <Tag color={STATUS_COLOR[s]}>{STATUS_LABEL[s]}</Tag>,
          },
          { title: '商品数', dataIndex: 'productCount', width: 80 },
          {
            title: '开团',
            dataIndex: 'startAt',
            width: 160,
            render: (s: string) => new Date(s).toLocaleString('zh-CN'),
          },
          {
            title: '截止',
            dataIndex: 'endAt',
            width: 160,
            render: (s: string) => new Date(s).toLocaleString('zh-CN'),
          },
          {
            title: '操作',
            key: 'actions',
            width: 200,
            render: (_, row) => (
              <Space>
                <Button size="small" onClick={() => nav(`/tuans/${row._id}`)}>编辑</Button>
                <Button size="small" onClick={() => nav(`/products?tuanId=${row._id}`)}>商品</Button>
                <Popconfirm title={`删除"${row.title}"?`} onConfirm={() => onDelete(row._id)}>
                  <Button size="small" danger>删除</Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
    </Card>
  );
}
