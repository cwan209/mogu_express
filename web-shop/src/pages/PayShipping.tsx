import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { NavBar, Toast, Button, SpinLoading, Result } from 'antd-mobile';
import { getOrderDetail, payShipping } from '../api/order';
import { formatCny } from '../utils/money';
import type { Order } from '../types';

export default function PayShipping() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const o = await getOrderDetail(id);
        setOrder(o);
      } catch (e: any) {
        Toast.show({ icon: 'fail', content: e.message || '加载订单失败' });
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handlePay = async () => {
    if (!order) return;
    setPaying(true);
    try {
      const r = await payShipping(order._id);
      // stub 模式 payParams.__stub=true → 跳 PayResult(同 Checkout 风格)
      // 真实模式 → location.href 跳 HuePay redirectUrl
      if (r.payParams?.__stub) {
        nav(`/pay-result/${order._id}?stub=1`, { replace: true });
      } else if (r.payParams?.redirectUrl) {
        window.location.href = r.payParams.redirectUrl;
      } else {
        // 兜底:无 redirectUrl 也无 stub,跳 PayResult 让用户看状态
        nav(`/pay-result/${order._id}`, { replace: true });
      }
    } catch (e: any) {
      Toast.show({ icon: 'fail', content: e.message || '支付失败' });
    } finally {
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <SpinLoading color="primary" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-gray-100">
        <NavBar onBack={() => nav(-1)}>支付运费</NavBar>
        <Result status="error" title="订单不存在" />
      </div>
    );
  }

  if (!order.shippingFee) {
    return (
      <div className="min-h-screen bg-gray-100">
        <NavBar onBack={() => nav(-1)}>支付运费</NavBar>
        <Result status="warning" title="该订单未设运费" />
      </div>
    );
  }

  if (order.shippingFee.payStatus === 'paid') {
    return (
      <div className="min-h-screen bg-gray-100">
        <NavBar onBack={() => nav(-1)}>支付运费</NavBar>
        <Result
          status="success"
          title="运费已支付"
          description={`订单号 ${order.orderNo}`}
        />
        <div className="p-4">
          <Button block color="primary" onClick={() => nav(`/orders/${order._id}`, { replace: true })}>
            查看订单
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 pb-24">
      <NavBar onBack={() => nav(-1)}>支付运费</NavBar>

      {/* 订单基本信息 */}
      <div className="bg-white mt-2 p-4">
        <div className="text-xs text-gray-500">订单号</div>
        <div className="text-sm mt-1">{order.orderNo}</div>
      </div>

      {/* 商品列表 */}
      <div className="bg-white mt-2 p-4">
        <div className="text-xs text-gray-500 mb-2">商品</div>
        {order.items.map((it, idx) => (
          <div key={idx} className="flex justify-between text-sm py-1">
            <span className="truncate mr-2">{it.title}</span>
            <span className="text-gray-500 flex-shrink-0">× {it.quantity}</span>
          </div>
        ))}
      </div>

      {/* 运费金额 */}
      <div className="bg-white mt-2 p-4">
        <div className="text-xs text-gray-500 mb-2">运费</div>
        <div className="text-3xl text-brand font-medium">
          {formatCny(order.shippingFee.amount)}
        </div>
      </div>

      {/* 底部支付按钮 */}
      <div className="fixed left-0 right-0 bottom-0 max-w-[480px] mx-auto bg-white border-t border-gray-200 p-3 z-50">
        <Button
          block
          color="primary"
          size="large"
          loading={paying}
          onClick={handlePay}
        >
          确认支付 {formatCny(order.shippingFee.amount)}
        </Button>
      </div>
    </div>
  );
}
