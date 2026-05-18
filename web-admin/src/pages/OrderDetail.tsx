import { useEffect, useState } from 'react';
import { Card, Descriptions, Tag, Table, Button, Space, message, Form, InputNumber, Input, Select } from 'antd';
import { useParams, useNavigate } from 'react-router-dom';
import type { Order, OrderItem, OrderStatus } from '../types';
import { getOrder, markShipped, markCompleted, setShippingFee, updateTracking, updateOrderNotes } from '../api/order';
import { formatAud } from '../utils/money';

const COURIER_OPTIONS = ['顺丰', '中通', '圆通', '极兔', 'EMS', 'Australia Post', 'StarTrack', '其他'];

const STATUS_COLOR: Record<OrderStatus, string> = {
  pending_pay: 'orange',
  paid: 'green',
  refund_requested: 'gold',
  shipped: 'blue',
  completed: 'default',
  cancelled: 'default',
  refunded: 'red',
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending_pay: '待支付',
  paid: '已支付',
  refund_requested: '退款申请中',
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
          <Descriptions.Item label="客户昵称">
            {order.userSnapshot.nickname || order.userSnapshot.name || '—'}
          </Descriptions.Item>
          <Descriptions.Item label="客户群号">
            {order.userSnapshot.groupId || '—'}
          </Descriptions.Item>
          {order.userSnapshot.phone && (
            <Descriptions.Item label="客户电话(legacy)">{order.userSnapshot.phone}</Descriptions.Item>
          )}
          <Descriptions.Item label="订单金额">{formatAud(order.amount)}</Descriptions.Item>
          <Descriptions.Item label="支付状态">{order.payStatus}</Descriptions.Item>
          <Descriptions.Item label="商户单号">{order.outTradeNo}</Descriptions.Item>
          <Descriptions.Item label="创建时间">{new Date(order.createdAt).toLocaleString('zh-CN')}</Descriptions.Item>
          {order.paidAt && <Descriptions.Item label="支付时间">{new Date(order.paidAt).toLocaleString('zh-CN')}</Descriptions.Item>}
          {order.shippedAt && <Descriptions.Item label="发货时间">{new Date(order.shippedAt).toLocaleString('zh-CN')}</Descriptions.Item>}
          {order.remark && <Descriptions.Item label="备注" span={2}>{order.remark}</Descriptions.Item>}
        </Descriptions>
      </Card>

      <Card title="运费尾款" size="small">
        {order.shippingFee?.payStatus === 'paid' ? (
          <Tag color="green">已付 ¥{(order.shippingFee.amount / 100).toFixed(2)}</Tag>
        ) : order.shippingFee ? (
          <Space direction="vertical" size={8} style={{ display: 'flex' }}>
            <Tag color="orange">待付 ¥{(order.shippingFee.amount / 100).toFixed(2)}</Tag>
            <Form
              layout="inline"
              onFinish={async (vals: { amount: number }) => {
                try {
                  await setShippingFee(order._id, Math.round(vals.amount * 100));
                  message.success('运费已更新');
                  await load();
                } catch (e: any) {
                  message.error(e.message);
                }
              }}
            >
              <Form.Item name="amount" initialValue={order.shippingFee.amount / 100}>
                <InputNumber min={0} step={0.5} addonBefore="¥" />
              </Form.Item>
              <Form.Item>
                <Button htmlType="submit">改运费</Button>
              </Form.Item>
            </Form>
          </Space>
        ) : (
          <Form
            layout="inline"
            onFinish={async (vals: { amount: number }) => {
              try {
                await setShippingFee(order._id, Math.round(vals.amount * 100));
                message.success('运费已设置,记得在微信群里@通知用户');
                await load();
              } catch (e: any) {
                message.error(e.message);
              }
            }}
          >
            <Form.Item name="amount" rules={[{ required: true, message: '请输入金额' }]}>
              <InputNumber min={0} step={0.5} addonBefore="¥" placeholder="35.00" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit">
                设置运费
              </Button>
            </Form.Item>
          </Form>
        )}
      </Card>

      <Card title="物流跟踪" size="small">
        {order.tracking?.courierNo ? (
          <Space direction="vertical" size={8} style={{ display: 'flex' }}>
            <div>重量:{order.tracking.weight} kg</div>
            <div>快递:{order.tracking.courierName}</div>
            <div>单号:{order.tracking.courierNo}</div>
            <Form
              layout="inline"
              initialValues={{
                weight: order.tracking.weight,
                courierName: order.tracking.courierName,
                courierNo: order.tracking.courierNo,
              }}
              onFinish={async (vals: { weight: number; courierName: string; courierNo: string }) => {
                try {
                  await updateTracking(order._id, vals);
                  message.success('物流已更新');
                  await load();
                } catch (e: any) { message.error(e.message); }
              }}
            >
              <Form.Item name="weight"><InputNumber min={0} step={0.1} addonAfter="kg" /></Form.Item>
              <Form.Item name="courierName">
                <Select options={COURIER_OPTIONS.map((c) => ({ label: c, value: c }))} style={{ width: 120 }} />
              </Form.Item>
              <Form.Item name="courierNo"><Input placeholder="单号" /></Form.Item>
              <Form.Item><Button htmlType="submit">改物流</Button></Form.Item>
            </Form>
          </Space>
        ) : (
          <Form
            layout="inline"
            onFinish={async (vals: { weight: number; courierName: string; courierNo: string }) => {
              try {
                await updateTracking(order._id, vals);
                message.success('物流已设置');
                await load();
              } catch (e: any) { message.error(e.message); }
            }}
          >
            <Form.Item name="weight" rules={[{ required: true, message: '请输入重量' }]}>
              <InputNumber min={0} step={0.1} addonAfter="kg" />
            </Form.Item>
            <Form.Item name="courierName" rules={[{ required: true, message: '请选快递' }]}>
              <Select options={COURIER_OPTIONS.map((c) => ({ label: c, value: c }))} placeholder="快递公司" style={{ width: 140 }} />
            </Form.Item>
            <Form.Item name="courierNo" rules={[{ required: true, message: '请填单号' }]}>
              <Input placeholder="快递单号" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit">设置物流</Button>
            </Form.Item>
          </Form>
        )}
      </Card>

      <Card title="卖家备注 (买家看得到)" size="small">
        <Form
          layout="vertical"
          initialValues={{ sellerNote: order.notes?.seller || '' }}
          onFinish={async (vals: { sellerNote: string }) => {
            try {
              await updateOrderNotes(order._id, vals.sellerNote);
              message.success('备注已保存');
              await load();
            } catch (e: any) { message.error(e.message); }
          }}
        >
          <Form.Item name="sellerNote">
            <Input.TextArea rows={3} maxLength={500} showCount placeholder="留言给买家,如:明天发货" />
          </Form.Item>
          <Form.Item>
            <Button htmlType="submit">保存备注</Button>
          </Form.Item>
        </Form>
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
