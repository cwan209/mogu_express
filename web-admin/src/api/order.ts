import { callCloud } from './client';
import { mockDb } from '../mock/store';
import { USE_MOCK } from './client';
import type { Order, OrderStatus } from '../types';

export async function listOrders(filter?: {
  status?: OrderStatus;
  tuanId?: string;
  dateFrom?: string;
  dateTo?: string;
  keyword?: string;
}): Promise<Order[]> {
  const r = await callCloud<{ items: Order[] }>('_admin/listAllOrders', {
    ...(filter?.status ? { status: filter.status } : {}),
    ...(filter?.tuanId ? { tuanId: filter.tuanId } : {}),
    ...(filter?.dateFrom ? { dateFrom: filter.dateFrom } : {}),
    ...(filter?.dateTo ? { dateTo: filter.dateTo } : {}),
    ...(filter?.keyword ? { keyword: filter.keyword } : {}),
  });
  return r.items;
}

export async function getOrder(id: string): Promise<Order> {
  const items = await listOrders();
  const o = items.find((x) => x._id === id);
  if (!o) throw new Error('订单不存在');
  return o;
}

export async function markShipped(id: string): Promise<void> {
  await callCloud('_admin/markShipped', { orderId: id });
}

export async function markCompleted(id: string): Promise<void> {
  await callCloud('_admin/markCompleted', { orderId: id });
}

export interface ExportResult {
  code: number;
  filename: string;
  count: number;
  fileID?: string;
  downloadUrl?: string;
  base64?: string;
}

export async function exportOrders(filter?: {
  status?: OrderStatus;
  tuanId?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<ExportResult> {
  // Mock 模式:前端直接生成 xlsx(避免 callCloud 绕一圈)
  if (USE_MOCK) {
    return mockExportOrders(filter);
  }
  return callCloud<ExportResult>('_admin/exportOrders', filter || {});
}

// Mock 模式用 exceljs-browser 兼容版;浏览器端动态 import
async function mockExportOrders(filter?: any): Promise<ExportResult> {
  const ExcelJS = await import('exceljs');
  const orders = mockDb.listOrders(filter);
  const wb = new (ExcelJS as any).Workbook();
  const ws1 = wb.addWorksheet('订单明细');
  ws1.columns = [
    { header: '订单号', key: 'orderNo', width: 22 },
    { header: '下单时间', key: 'createdAt', width: 20 },
    { header: '状态', key: 'status', width: 10 },
    { header: '姓名', key: 'name', width: 14 },
    { header: '电话', key: 'phone', width: 14 },
    { header: '收货地址', key: 'address', width: 50 },
    { header: '商品', key: 'itemTitle', width: 30 },
    { header: '单价 AUD', key: 'price', width: 10 },
    { header: '数量', key: 'qty', width: 6 },
    { header: '小计 AUD', key: 'subtotal', width: 10 },
    { header: '订单总额 AUD', key: 'amount', width: 12 },
    { header: '备注', key: 'remark', width: 24 },
  ];
  const STATUS_LABEL: Record<string, string> = {
    pending_pay: '待支付', paid: '已支付', shipped: '已发货',
    completed: '已完成', cancelled: '已取消', refunded: '已退款',
  };
  for (const o of orders) {
    const addr = [o.shipping?.line1, o.shipping?.line2, o.shipping?.suburb, o.shipping?.state, o.shipping?.postcode].filter(Boolean).join(', ');
    for (let i = 0; i < o.items.length; i++) {
      const it = o.items[i];
      ws1.addRow({
        orderNo: i === 0 ? o.orderNo : '',
        createdAt: i === 0 ? new Date(o.createdAt).toLocaleString('zh-CN') : '',
        status: i === 0 ? (STATUS_LABEL[o.status] || o.status) : '',
        name: i === 0 ? o.userSnapshot.name : '',
        phone: i === 0 ? o.userSnapshot.phone : '',
        address: i === 0 ? addr : '',
        itemTitle: it.title,
        price: Number((it.price / 100).toFixed(2)),
        qty: it.quantity,
        subtotal: Number((it.subtotal / 100).toFixed(2)),
        amount: i === 0 ? Number((o.amount / 100).toFixed(2)) : '',
        remark: i === 0 ? o.remark : '',
      });
    }
  }
  ws1.getRow(1).font = { bold: true };

  const ws2 = wb.addWorksheet('商品销量');
  ws2.columns = [
    { header: '商品', key: 'title', width: 30 },
    { header: '单价 AUD', key: 'price', width: 10 },
    { header: '售出数量', key: 'qty', width: 10 },
    { header: '销售金额 AUD', key: 'total', width: 14 },
  ];
  const agg = new Map<string, { title: string; price: number; qty: number; total: number }>();
  for (const o of orders) {
    if (o.status === 'cancelled' || o.status === 'refunded') continue;
    for (const it of o.items) {
      const cur = agg.get(it.productId) || { title: it.title, price: it.price, qty: 0, total: 0 };
      cur.qty += it.quantity;
      cur.total += it.subtotal;
      agg.set(it.productId, cur);
    }
  }
  for (const r of [...agg.values()].sort((a, b) => b.qty - a.qty)) {
    ws2.addRow({ title: r.title, price: Number((r.price / 100).toFixed(2)), qty: r.qty, total: Number((r.total / 100).toFixed(2)) });
  }
  ws2.getRow(1).font = { bold: true };

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const ts = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15);
  const filename = `orders_${ts}.xlsx`;
  const url = URL.createObjectURL(blob);
  return { code: 0, filename, count: orders.length, downloadUrl: url };
}
