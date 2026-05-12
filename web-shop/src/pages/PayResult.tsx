import { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { NavBar, Result, Button, Toast, SpinLoading } from 'antd-mobile';
import { getOrderDetail, simulatePay } from '../api/order';
import { formatCny } from '../utils/money';
import type { Order } from '../types';

export default function PayResult() {
  const { orderId } = useParams<{ orderId: string }>();
  const [params] = useSearchParams();
  const stub = params.get('stub') === '1';
  const nav = useNavigate();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const pollTimer = useRef<number | null>(null);

  const fetchOrder = async (showSpin = false) => {
    if (showSpin) setLoading(true);
    try {
      const o = await getOrderDetail(orderId!);
      setOrder(o);
      return o;
    } catch (e: any) {
      Toast.show({ icon: 'fail', content: e.message || '获取订单失败' });
      return null;
    } finally {
      if (showSpin) setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrder(true);
    if (!stub) {
      let n = 0;
      pollTimer.current = window.setInterval(async () => {
        n++;
        const o = await fetchOrder();
        if ((o && o.payStatus === 'paid') || n > 15) {
          if (pollTimer.current) clearInterval(pollTimer.current);
        }
      }, 2000);
    }
    return () => { if (pollTimer.current) clearInterval(pollTimer.current); };
  }, [orderId, stub]);

  const onSimulate = async () => {
    setPaying(true);
    try {
      await simulatePay(orderId!);
      await fetchOrder();
      Toast.show({ icon: 'success', content: '模拟支付成功' });
    } catch (e: any) {
      Toast.show({ icon: 'fail', content: e.message || '模拟支付失败' });
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
        <NavBar back={null}>支付结果</NavBar>
        <Result status="error" title="订单不存在" />
      </div>
    );
  }

  const paid = order.payStatus === 'paid';
  const pending = order.payStatus === 'pending';

  return (
    <div className="min-h-screen bg-gray-100">
      <NavBar back={null}>支付结果</NavBar>
      <div className="mt-4">
        {paid ? (
          <Result status="success" title="支付成功" description={`订单号 ${order.orderNo}`} />
        ) : pending ? (
          <Result
            status="waiting"
            title="支付中"
            description={stub ? '点击下方按钮模拟支付' : '正在等待支付通道回调,稍候...'}
          />
        ) : (
          <Result status="warning" title="支付未完成" description={`状态:${order.payStatus}`} />
        )}
      </div>

      <div className="bg-white mt-4 p-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">订单号</span>
          <span>{order.orderNo}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">金额</span>
          <span className="text-brand">{formatCny(order.amount)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">状态</span>
          <span>{order.status}</span>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {stub && pending && (
          <Button block color="primary" loading={paying} onClick={onSimulate}>
            🧪 模拟支付成功(Stub)
          </Button>
        )}
        {paid && (
          <Button block color="primary" onClick={() => nav(`/orders/${order._id}`, { replace: true })}>
            查看订单
          </Button>
        )}
        <Button block onClick={() => nav('/', { replace: true })}>回到首页</Button>
      </div>
    </div>
  );
}
