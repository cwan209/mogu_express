import { useEffect, useState } from 'react';
import { Button, Card, Space, Table, Tag, message, Select, Input, DatePicker, Modal } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { Dayjs } from 'dayjs';
import type { Order, OrderStatus, Tuan } from '../types';
import { listOrders, markShipped, exportOrders } from '../api/order';
import { listTuans } from '../api/tuan';
import { formatAud } from '../utils/money';

const STATUS_COLOR: Record<OrderStatus, string> = {
  pending_pay: 'orange',
  paid: 'green',
  shipped: 'blue',
  completed: 'default',
  cancelled: 'default',
  refunded: 'red',
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending_pay: '待支付',
  paid: '已支付',
  shipped: '已发货',
  completed: '已完成',
  cancelled: '已取消',
  refunded: '已退款',
};

export default function Orders() {
  const nav = useNavigate();
  const [data, setData] = useState<Order[]>([]);
  const [tuans, setTuans] = useState<Tuan[]>([]);
  const [loading, setLoading] = useState(false);

  const [statusFilter, setStatusFilter] = useState<OrderStatus | undefined>();
  const [tuanFilter, setTuanFilter] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [keyword, setKeyword] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [orders, ts] = await Promise.all([
        listOrders({
          status: statusFilter,
          tuanId: tuanFilter,
          dateFrom: dateRange?.[0]?.toISOString(),
          dateTo: dateRange?.[1]?.toISOString(),
          keyword: keyword || undefined,
        }),
        listTuans(),
      ]);
      setData(orders);
      setTuans(ts);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [statusFilter, tuanFilter, dateRange]);

  const onShip = async (id: string) => {
    try {
      await markShipped(id);
      message.success('已标记发货');
      load();
    } catch (e: any) {
      message.error(e.message || '操作失败');
    }
  };

  const [exporting, setExporting] = useState(false);
  const onExport = async () => {
    setExporting(true);
    try {
      const res = await exportOrders({
        status: statusFilter,
        tuanId: tuanFilter,
        dateFrom: dateRange?.[0]?.toISOString(),
        dateTo: dateRange?.[1]?.toISOString(),
      });
      if (res.downloadUrl) {
        // 浏览器触发下载
        const a = document.createElement('a');
        a.href = res.downloadUrl;
        a.download = res.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else if (res.base64) {
        const bin = atob(res.base64);
        const buf = Uint8Array.from(bin, c => c.charCodeAt(0));
        const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = res.filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        Modal.info({ title: '导出完成', content: `${res.count} 笔订单,但未拿到下载链接` });
        return;
      }
      message.success(`已导出 ${res.count} 笔订单`);
    } catch (e: any) {
      message.error(e.message || '导出失败');
    } finally {
      setExporting(false);
    }
  };

  const totalAmountCents = data
    .filter((o) => o.payStatus === 'paid')
    .reduce((s, o) => s + o.amount, 0);

  return (
    <Card
      title="订单管理"
      extra={
        <Space>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            loading={exporting}
            onClick={onExport}
          >导出当前筛选 ({data.length})</Button>
        </Space>
      }
    >
      <Space style={{ marginBottom: 12, flexWrap: 'wrap' }}>
        <Select
          allowClear placeholder="状态" style={{ width: 120 }}
          value={statusFilter} onChange={setStatusFilter}
          options={Object.entries(STATUS_LABEL).map(([v, label]) => ({ value: v, label }))}
        />
        <Select
          allowClear placeholder="所属团" style={{ width: 240 }}
          value={tuanFilter} onChange={setTuanFilter}
          options={tuans.map((t) => ({ value: t._id, label: t.title }))}
        />
        <DatePicker.RangePicker showTime value={dateRange as any} onChange={(v) => setDateRange(v as any)} />
        <Input.Search
          placeholder="订单号/姓名/电话/商品"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onSearch={() => load()}
          style={{ width: 260 }}
        />
      </Space>

      <div style={{ padding: '8px 0 16px', color: '#666' }}>
        当前筛选 · 共 {data.length} 笔 · 已支付合计 {formatAud(totalAmountCents)}
      </div>

      <Table<Order>
        rowKey="_id"
        dataSource={data}
        loading={loading}
        pagination={{ pageSize: 10, showSizeChanger: false }}
        columns={[
          { title: '订单号', dataIndex: 'orderNo', width: 200, fixed: 'left' },
          {
            title: '客户',
            key: 'customer',
            width: 140,
            render: (_, o) => (
              <div>
                <div>{o.userSnapshot.name}</div>
                <div style={{ fontSize: 12, color: '#999' }}>{o.userSnapshot.phone}</div>
              </div>
            ),
          },
          {
            title: '商品',
            key: 'items',
            render: (_, o) => (
              <div style={{ fontSize: 12 }}>
                {o.items.slice(0, 2).map((it) => (
                  <div key={it.productId}>{it.title} × {it.quantity}</div>
                ))}
                {o.items.length > 2 && <div style={{ color: '#999' }}>等 {o.items.length} 件</div>}
              </div>
            ),
          },
          {
            title: '金额',
            dataIndex: 'amount',
            width: 100,
            render: (c: number) => formatAud(c),
          },
          {
            title: '状态',
            dataIndex: 'status',
            width: 100,
            render: (s: OrderStatus) => <Tag color={STATUS_COLOR[s]}>{STATUS_LABEL[s]}</Tag>,
          },
          {
            title: '下单时间',
            dataIndex: 'createdAt',
            width: 170,
            render: (s: string) => new Date(s).toLocaleString('zh-CN'),
          },
          {
            title: '操作',
            key: 'actions',
            width: 180,
            fixed: 'right',
            render: (_, o) => (
              <Space>
                <Button size="small" onClick={() => nav(`/orders/${o._id}`)}>查看</Button>
                {o.status === 'paid' && (
                  <Button size="small" type="primary" onClick={() => onShip(o._id)}>发货</Button>
                )}
              </Space>
            ),
          },
        ]}
        scroll={{ x: 1200 }}
      />
    </Card>
  );
}
