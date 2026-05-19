import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { NavBar, Skeleton, Empty, Tag, Image, Button, Toast, Dialog } from 'antd-mobile';
import { getOrderDetail, cancelOrder, requestRefund } from '../api/order';
import { formatCny } from '../utils/money';
import { formatTime } from '../utils/date';
import type { Order, OrderStatus } from '../types';

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending_pay: '待支付',
  paid: '已支付',
  refund_requested: '退款申请中',
  shipped: '已发货',
  completed: '已完成',
  cancelled: '已取消',
  refunded: '已退款',
};

const STATUS_COLOR: Record<OrderStatus, string> = {
  pending_pay: 'warning',
  paid: 'success',
  refund_requested: 'warning',
  shipped: 'primary',
  completed: 'default',
  cancelled: 'default',
  refunded: 'danger',
};

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const o = await getOrderDetail(id!);
      setOrder(o);
    } catch (e: any) {
      setError(e.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const onCancel = () => {
    Dialog.confirm({
      content: '取消订单后,已选商品库存将释放,确认取消?',
      onConfirm: async () => {
        try {
          await cancelOrder(id!);
          Toast.show({ icon: 'success', content: '已取消' });
          load();
        } catch (e: any) {
          Toast.show({ icon: 'fail', content: e.message || '取消失败' });
        }
      },
    });
  };

  const onRefund = () => {
    Dialog.confirm({
      content: '申请退款后需要等待商家审核,确认申请?',
      onConfirm: async () => {
        try {
          await requestRefund(id!);
          Toast.show({ icon: 'success', content: '退款申请已提交' });
          load();
        } catch (e: any) {
          Toast.show({ icon: 'fail', content: e.message || '申请失败' });
        }
      },
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100">
        <NavBar onBack={() => nav(-1)}>订单详情</NavBar>
        <Skeleton.Paragraph lineCount={5} animated />
      </div>
    );
  }
  if (error || !order) {
    return (
      <div className="min-h-screen bg-gray-100">
        <NavBar onBack={() => nav(-1)}>订单详情</NavBar>
        <Empty description={error || '订单不存在'} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 pb-20">
      <NavBar onBack={() => nav(-1)}>订单详情</NavBar>

      {/* 状态条 */}
      <div className="bg-brand text-white p-4">
        <div className="flex items-center justify-between">
          <span className="text-base font-medium">{STATUS_LABEL[order.status]}</span>
          <Tag color={STATUS_COLOR[order.status]}>{STATUS_LABEL[order.status]}</Tag>
        </div>
        {order.refundRejectReason && (
          <div className="text-xs mt-2 opacity-90">退款被拒原因:{order.refundRejectReason}</div>
        )}
      </div>

      {/* 收货地址 */}
      <div className="bg-white p-3 mt-2">
        <div className="text-xs text-gray-500 mb-1">收货地址</div>
        <div className="font-medium">{order.shipping.recipient} · {order.shipping.phone}</div>
        <div className="text-sm text-gray-600 mt-1">
          {order.shipping.line1}{order.shipping.line2 ? `, ${order.shipping.line2}` : ''}, {order.shipping.suburb}, {order.shipping.state} {order.shipping.postcode}
        </div>
      </div>

      {/* 商品列表 */}
      {(() => {
        const itemsTotal = order.items.reduce((s, it) => s + it.subtotal, 0);
        const hasDiscount = (order.discount || 0) > 0;
        return (
          <div className="bg-white mt-2">
            {order.items.map((it) => (
              <div key={it.tuanItemId || it.productId} className="flex p-3 gap-3 border-b border-gray-100">
                <Image src={it.coverFileId} width={60} height={60} fit="cover" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm line-clamp-2">{it.title}</div>
                  <div className="text-xs text-gray-500 mt-1">{formatCny(it.price)} × {it.quantity}</div>
                </div>
                <div className="text-brand">{formatCny(it.subtotal)}</div>
              </div>
            ))}
            <div className="p-3 text-sm space-y-1 border-t border-gray-100">
              <div className="flex justify-between text-gray-600">
                <span>商品金额</span>
                <span>{formatCny(itemsTotal)}</span>
              </div>
              {hasDiscount && (
                <div className="flex justify-between text-brand">
                  <span>优惠券减免</span>
                  <span>-{formatCny(order.discount!)}</span>
                </div>
              )}
              <div className="flex justify-between text-brand font-medium pt-1">
                <span>实付商品款</span>
                <span>{formatCny(order.amount)}</span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 运费 Card — admin setShippingFee 后才显示 */}
      {order.shippingFee && (
        <div className="bg-white mt-2 p-4">
          <div className="text-xs text-gray-500 mb-2">运费</div>
          <div className="flex items-center justify-between">
            <span className="text-base">{formatCny(order.shippingFee.amount)}</span>
            {order.shippingFee.payStatus === 'paid' ? (
              <Tag color="success">已付</Tag>
            ) : (
              <Tag color="warning">待付</Tag>
            )}
          </div>
          {order.shippingFee.payStatus === 'paid' && order.shippingFee.paidAt && (
            <div className="text-xs text-gray-500 mt-2">
              付款时间:{formatTime(order.shippingFee.paidAt)}
            </div>
          )}
          {order.shippingFee.payStatus === 'pending' && (
            <Button
              block
              color="primary"
              size="small"
              style={{ marginTop: 8 }}
              onClick={() => nav(`/pay-shipping/${order._id}`)}
            >
              立即支付运费
            </Button>
          )}
        </div>
      )}

      {/* 物流信息 Card — admin 设了 tracking 才显示 */}
      {order.tracking && (order.tracking.weight != null || order.tracking.courierNo) && (
        <div className="bg-white mt-2 p-4">
          <div className="text-xs text-gray-500 mb-2">物流信息</div>
          {order.tracking.weight != null && (
            <div className="text-sm mb-1">
              重量:{order.tracking.weight} kg
            </div>
          )}
          {order.tracking.courierName && (
            <div className="text-sm mb-1">
              快递:{order.tracking.courierName}
            </div>
          )}
          {order.tracking.courierNo && (
            <div className="flex items-center text-sm">
              <span>单号:{order.tracking.courierNo}</span>
              <Button
                size="mini"
                fill="none"
                onClick={() => {
                  navigator.clipboard?.writeText(order.tracking!.courierNo!);
                  Toast.show({ icon: 'success', content: '已复制' });
                }}
                style={{ marginLeft: 8 }}
              >
                复制
              </Button>
            </div>
          )}
        </div>
      )}

      {/* 团长留言 Card — order.notes.seller 存在才显示 */}
      {order.notes?.seller && (
        <div className="bg-white mt-2 p-4" style={{ background: '#FFFBE6' }}>
          <div className="text-xs text-gray-500 mb-2">📣 团长留言</div>
          <div className="text-sm">{order.notes.seller}</div>
        </div>
      )}

      {/* 订单信息 */}
      <div className="bg-white mt-2 p-3 text-sm space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">订单号</span>
          <span>{order.orderNo}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">下单时间</span>
          <span>{formatTime(order.createdAt)}</span>
        </div>
        {order.paidAt && (
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">付款时间</span>
            <span>{formatTime(order.paidAt)}</span>
          </div>
        )}
        {order.shippedAt && (
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">发货时间</span>
            <span>{formatTime(order.shippedAt)}</span>
          </div>
        )}
        {order.remark && (
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">备注</span>
            <span className="text-right max-w-[60%]">{order.remark}</span>
          </div>
        )}
      </div>

      {/* 底部操作栏 */}
      <div className="fixed left-0 right-0 bottom-0 max-w-[480px] mx-auto bg-white border-t border-gray-200 p-3 flex justify-end gap-2 z-50">
        {order.status === 'pending_pay' && (
          <>
            <Button onClick={onCancel}>取消订单</Button>
            <Button color="primary" onClick={() => nav(`/pay-result/${order._id}?stub=1`)}>
              去支付
            </Button>
          </>
        )}
        {order.status === 'paid' && (
          <Button color="danger" fill="outline" onClick={onRefund}>
            申请退款
          </Button>
        )}
        {order.status === 'shipped' && (
          <Button color="primary">确认收货</Button>
        )}
      </div>
    </div>
  );
}
