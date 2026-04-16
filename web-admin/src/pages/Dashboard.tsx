import { Card, Row, Col, Statistic, Alert, Button, Space, Tag, Table } from 'antd';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { mockDb } from '../mock/store';
import { fromCents, formatAud } from '../utils/money';
import { USE_MOCK, API_BASE, callCloud } from '../api/client';
import { getStats, type Stats } from '../api/stats';
import { listTuans } from '../api/tuan';

export default function Dashboard() {
  const nav = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [tuanTitles, setTuanTitles] = useState<Record<string, string>>({});
  const [backendUp, setBackendUp] = useState<boolean | null>(null);

  const refresh = async () => {
    try {
      const [s, ts] = await Promise.all([getStats(), listTuans()]);
      setStats(s);
      setTuanTitles(Object.fromEntries(ts.map(t => [t._id, t.title])));
    } catch (err) {
      console.error('[dashboard] stats', err);
    }
  };

  const ping = async () => {
    if (USE_MOCK) return;
    try { await callCloud('listTuans'); setBackendUp(true); }
    catch { setBackendUp(false); }
  };

  useEffect(() => { refresh(); ping(); }, []);

  const resetMock = () => { mockDb.reset(); refresh(); };

  const zero: Stats = {
    gmvToday: 0, ordersToday: 0, gmv7d: 0, orders7d: 0, gmv30d: 0, orders30d: 0,
    activeTuans: 0, activeProducts: 0, topProducts: [], tuanSummary: [],
  };
  const s = stats || zero;

  return (
    <div>
      {USE_MOCK ? (
        <Alert
          type="info"
          showIcon
          message={<>数据模式 <Tag color="blue">Mock (localStorage)</Tag></>}
          description="修改 web-admin/.env.local 设 VITE_USE_MOCK=false 并启动 Docker 后端可切到真实数据。"
          action={<Button size="small" danger onClick={resetMock}>重置 Mock</Button>}
          style={{ marginBottom: 16 }}
        />
      ) : (
        <Alert
          type={backendUp === false ? 'error' : 'success'}
          showIcon
          message={
            <>
              数据模式{' '}
              <Tag color={backendUp === false ? 'red' : 'green'}>
                本地后端 {API_BASE}
              </Tag>
              {backendUp === null && <span> 连接中...</span>}
              {backendUp === false && <span> 连接失败 — 请先 <code>docker compose up -d</code></span>}
            </>
          }
          style={{ marginBottom: 16 }}
        />
      )}

      {/* 今日 */}
      <Card title="今日" size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={6}><Statistic title="GMV" value={Number(fromCents(s.gmvToday))} precision={2} prefix="$" suffix=" AUD" /></Col>
          <Col span={6}><Statistic title="订单数" value={s.ordersToday} /></Col>
          <Col span={6}><Statistic title="进行中的团" value={s.activeTuans} /></Col>
          <Col span={6}><Statistic title="在售商品" value={s.activeProducts} /></Col>
        </Row>
      </Card>

      {/* 近 7 天 / 30 天 */}
      <Card title="近期" size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={6}><Statistic title="7 天 GMV" value={Number(fromCents(s.gmv7d))} precision={2} prefix="$" /></Col>
          <Col span={6}><Statistic title="7 天订单" value={s.orders7d} /></Col>
          <Col span={6}><Statistic title="30 天 GMV" value={Number(fromCents(s.gmv30d))} precision={2} prefix="$" /></Col>
          <Col span={6}><Statistic title="30 天订单" value={s.orders30d} /></Col>
        </Row>
      </Card>

      <Row gutter={16}>
        <Col span={12}>
          <Card title="热销商品 TOP 10(近 30 天)" size="small">
            <Table
              rowKey="productId"
              size="small"
              pagination={false}
              dataSource={s.topProducts}
              columns={[
                { title: '#', width: 40, render: (_, __, i) => i + 1 },
                { title: '商品', dataIndex: 'title', ellipsis: true },
                { title: '数量', dataIndex: 'qty', width: 60, align: 'right' },
                { title: '销售额', dataIndex: 'amount', width: 100, align: 'right', render: (c: number) => formatAud(c) },
              ]}
              locale={{ emptyText: '暂无销售' }}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="各团表现(近 30 天)" size="small">
            <Table
              rowKey="tuanId"
              size="small"
              pagination={false}
              dataSource={s.tuanSummary}
              columns={[
                { title: '团', dataIndex: 'tuanId', ellipsis: true, render: (id: string) => tuanTitles[id] || id },
                { title: '订单数', dataIndex: 'orders', width: 80, align: 'right' },
                { title: '销售额', dataIndex: 'amount', width: 100, align: 'right', render: (c: number) => formatAud(c) },
              ]}
              locale={{ emptyText: '暂无销售' }}
            />
          </Card>
        </Col>
      </Row>

      <Card style={{ marginTop: 16 }} title="快速入口">
        <Space wrap>
          <Button type="primary" onClick={() => nav('/orders')}>订单管理</Button>
          <Button onClick={() => nav('/tuans/new')}>发布新团</Button>
          <Button onClick={() => nav('/products/new')}>上架商品</Button>
          <Button onClick={() => nav('/categories')}>分类</Button>
        </Space>
      </Card>
    </div>
  );
}
