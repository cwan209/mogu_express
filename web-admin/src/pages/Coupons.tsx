import { useEffect, useState } from 'react';
import { Button, Card, Space, Table, Tag, Modal, Form, Input, InputNumber, DatePicker, Select, message } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import type { Coupon, CouponStatus } from '../types';
import { listCoupons, issueCoupon } from '../api/coupon';
import { formatAud } from '../utils/money';

const STATUS_COLOR: Record<CouponStatus, string> = {
  unused: 'green',
  used: 'default',
  expired: 'red',
};
const STATUS_LABEL: Record<CouponStatus, string> = {
  unused: '未使用',
  used: '已使用',
  expired: '已过期',
};

export default function Coupons() {
  const [data, setData] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<CouponStatus | undefined>();
  const [openidFilter, setOpenidFilter] = useState('');
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      setData(await listCoupons({
        status: statusFilter,
        openid: openidFilter.trim() || undefined,
      }));
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [statusFilter]);

  const openIssue = () => {
    form.resetFields();
    form.setFieldsValue({
      validFrom: dayjs(),
      validTo: dayjs().add(30, 'day'),
      amountYuan: 10,
    });
    setOpen(true);
  };

  const onSubmit = async () => {
    const v: { openid: string; amountYuan: number; reason: string; validFrom: Dayjs; validTo: Dayjs } = await form.validateFields();
    const amountCents = Math.round(v.amountYuan * 100);
    if (amountCents <= 0) { message.error('金额必须 > 0'); return; }
    if (!v.validTo.isAfter(v.validFrom)) { message.error('失效时间必须晚于生效时间'); return; }
    try {
      await issueCoupon({
        openid: v.openid.trim(),
        amount: amountCents,
        reason: (v.reason || '').trim(),
        validFrom: v.validFrom.toISOString(),
        validTo: v.validTo.toISOString(),
      });
      message.success('已发券');
      setOpen(false);
      load();
    } catch (e: any) { message.error(e.message || '发券失败'); }
  };

  return (
    <Card title="优惠券管理" extra={<Button type="primary" onClick={openIssue}>发券</Button>}>
      <Space style={{ marginBottom: 12 }}>
        <Select
          allowClear placeholder="状态筛选" style={{ width: 130 }}
          value={statusFilter} onChange={setStatusFilter}
          options={[
            { value: 'unused', label: '未使用' },
            { value: 'used', label: '已使用' },
            { value: 'expired', label: '已过期' },
          ]}
        />
        <Input.Search
          placeholder="openid 搜索"
          value={openidFilter}
          onChange={(e) => setOpenidFilter(e.target.value)}
          onSearch={load}
          style={{ width: 320 }}
        />
      </Space>

      <Table<Coupon>
        rowKey="_id"
        dataSource={data}
        loading={loading}
        pagination={{ pageSize: 20, showSizeChanger: false }}
        columns={[
          {
            title: 'openid', dataIndex: '_openid', width: 180,
            render: (v: string) => <code style={{ fontSize: 11 }}>{v}</code>,
          },
          {
            title: '金额', dataIndex: 'amount', width: 100,
            render: (v: number) => <b>{formatAud(v)}</b>,
          },
          { title: '原因', dataIndex: 'reason', ellipsis: true },
          {
            title: '状态', dataIndex: 'status', width: 90,
            render: (s: CouponStatus) => <Tag color={STATUS_COLOR[s]}>{STATUS_LABEL[s]}</Tag>,
          },
          {
            title: '有效期', key: 'validity', width: 220,
            render: (_, r) => `${dayjs(r.validFrom).format('YYYY-MM-DD')} → ${dayjs(r.validTo).format('YYYY-MM-DD')}`,
          },
          {
            title: '使用订单', dataIndex: 'usedOrderId', width: 200,
            render: (v?: string) => v ? <code style={{ fontSize: 11 }}>{v}</code> : '—',
          },
          {
            title: '创建时间', dataIndex: 'createdAt', width: 170,
            render: (s: string) => new Date(s).toLocaleString('zh-CN'),
          },
        ]}
        scroll={{ x: 1100 }}
      />

      <Modal
        open={open}
        title="发券给指定用户"
        onCancel={() => setOpen(false)}
        onOk={onSubmit}
        okText="发券"
        destroyOnClose
        width={520}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="openid" label="收券人 openid"
            rules={[{ required: true, message: '请填 openid' }]}
            tooltip="目标用户的微信 openid (一般在订单列表导出 / 用户管理可看)"
          >
            <Input placeholder="oXXX..." />
          </Form.Item>
          <Form.Item
            name="amountYuan" label="金额 (元)"
            rules={[{ required: true, message: '请填金额' }]}
          >
            <InputNumber min={0.01} step={1} precision={2} prefix="¥" style={{ width: 200 }} />
          </Form.Item>
          <Form.Item name="reason" label="发券原因 (备注)">
            <Input.TextArea rows={2} maxLength={100} showCount placeholder="例:新用户欢迎 / 退货补偿" />
          </Form.Item>
          <Space size={16}>
            <Form.Item name="validFrom" label="生效时间" rules={[{ required: true }]}>
              <DatePicker showTime style={{ width: 200 }} />
            </Form.Item>
            <Form.Item name="validTo" label="失效时间" rules={[{ required: true }]}>
              <DatePicker showTime style={{ width: 200 }} />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </Card>
  );
}
