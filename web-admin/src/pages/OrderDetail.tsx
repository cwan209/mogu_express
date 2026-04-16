import { useEffect, useState } from 'react';
import { Card, Descriptions, Tag, Table, Button, Space, message } from 'antd';
import { useParams, useNavigate } from 'react-router-dom';
import type { Order, OrderItem, OrderStatus } from '../types';
import { getOrder, markShipped, markCompleted } from '../api/order';
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

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      setOrder(await getOrder(id));
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const onShip = async () => {
    try {
      await markShipped(id!);
      message.success('已标记发货');
      load();
    } catch (e: any) { message.error(e.message); }
  };
  const onComplete = async () => {
    try {
      await markCompleted(id!);
      message.success('已完成');
      load();
    } catch (e: any) { message.error(e.message); }
  };

  if (loading || !order) return <Card loading />;

  const addr = order.shipping;

  return (
    <Space direction="vertical" size={16} style={{ display: 'flex' }}>
      <Card
        title={<>订单 {order.orderNo} <Tag color={STATUS_COLOR[order.status]} style={{ marginLeft: 8 }}>{STATUS_LABEL[order.status]}</Tag></>}
        extra={
          <Space>
            {order.status === 'paid' && <Button type="primary" onClick={onShip}>标记发货</Button>}
            {order.status === 'shipped' && <Button onClick={onComplete}>标记完成</Button>}
            <Button onClick={() => nav(-1)}>返回</Button>
          </Space>
        }
      >
        <Descriptions column={2} size="small">
          <Descriptions.Item label="客户姓名">{order.userSnapshot.name}</Descriptions.Item>
          <Descriptions.Item label="客户电话">{order.userSnapshot.phone}</Descriptions.Item>
          <Descriptions.Item label="订单金额">{formatAud(order.amount)}</Descriptions.Item>
          <Descriptions.Item label="支付状态">{order.payStatus}</Descriptions.Item>
          <Descriptions.Item label="商户单号">{order.outTradeNo}</Descriptions.Item>
          <Descriptions.Item label="创建时间">{new Date(order.createdAt).toLocaleString('zh-CN')}</Descriptions.Item>
          {order.paidAt && <Descriptions.Item label="支付时间">{new Date(order.paidAt).toLocaleString('zh-CN')}</Descriptions.Item>}
          {order.shippedAt && <Descriptions.Item label="发货时间">{new Date(order.shippedAt).toLocaleString('zh-CN')}</Descriptions.Item>}
          {order.remark && <Descriptions.Item label="备注" span={2}>{order.remark}</Descriptions.Item>}
        </Descriptions>
      </Card>

      <Card title="收货信息" size="small">
        <div>{addr.recipient} · {addr.phone}</div>
        <div style={{ color: '#666', marginTop: 4 }}>
          {addr.line1}{addr.line2 ? `, ${addr.line2}` : ''}, {addr.suburb} {addr.state} {addr.postcode}
        </div>
      </Card>

      <Card title={`商品清单 (${order.items.length})`} size="small">
        <Table<OrderItem>
          rowKey="productId"
          dataSource={order.items}
          pagination={false}
          size="small"
          columns={[
            {
              title: '',
              dataIndex: 'coverFileId',
              width: 60,
              render: (url: string) => (
                <img src={url} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4 }} />
              ),
            },
            { title: '标题', dataIndex: 'title' },
            { title: '单价', dataIndex: 'price', width: 100, render: (c) => formatAud(c) },
            { title: '数量', dataIndex: 'quantity', width: 80 },
            { title: '小计', dataIndex: 'subtotal', width: 120, render: (c) => <b>{formatAud(c)}</b> },
          ]}
          summary={() => (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={4} align="right">
                <b>合计</b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={4}>
                <b style={{ color: '#E34D59', fontSize: 16 }}>{formatAud(order.amount)}</b>
              </Table.Summary.Cell>
            </Table.Summary.Row>
          )}
        />
      </Card>
    </Space>
  );
}
