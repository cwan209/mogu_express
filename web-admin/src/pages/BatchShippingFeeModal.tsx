import { useState } from 'react';
import { Modal, Button, Upload, Table, Tag, message, Space, Result } from 'antd';
import { DownloadOutlined, InboxOutlined } from '@ant-design/icons';
import type { UploadFile, UploadProps } from 'antd';
import {
  uploadShippingFeesXlsx,
  type BatchShippingRow,
  type BatchShippingResp,
  type BatchShippingStatus,
} from '../api/order';
import { downloadShippingTemplate } from '../utils/shippingTemplate';

interface Props {
  open: boolean;
  onClose: () => void;
  /** 成功 apply 后通知父组件刷新订单列表 */
  onApplied?: () => void;
}

type Phase = 'pick' | 'preview' | 'result';

const STATUS_TAG: Record<BatchShippingStatus, { color: string; label: string }> = {
  matched: { color: 'success', label: '✅ 匹配' },
  not_found: { color: 'error', label: '❌ 未找到' },
  already_paid: { color: 'warning', label: '🟠 已付' },
  invalid: { color: 'error', label: '⚠️ 非法' },
  duplicate_in_file: { color: 'error', label: '🚫 文件重复' },
};

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1] || result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function BatchShippingFeeModal({ open, onClose, onApplied }: Props) {
  const [phase, setPhase] = useState<Phase>('pick');
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [base64, setBase64] = useState<string>('');
  const [resp, setResp] = useState<BatchShippingResp | null>(null);
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setPhase('pick');
    setFileList([]);
    setBase64('');
    setResp(null);
    setLoading(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleNext = async () => {
    if (!fileList[0]?.originFileObj) {
      message.error('请选 xlsx 文件');
      return;
    }
    setLoading(true);
    try {
      const b64 = await fileToBase64(fileList[0].originFileObj as File);
      setBase64(b64);
      const r = await uploadShippingFeesXlsx(b64, true);
      setResp(r);
      setPhase('preview');
    } catch (e: any) {
      message.error(e.message || '上传解析失败');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    setLoading(true);
    try {
      const r = await uploadShippingFeesXlsx(base64, false);
      setResp(r);
      setPhase('result');
      onApplied?.();
    } catch (e: any) {
      message.error(e.message || '应用失败');
    } finally {
      setLoading(false);
    }
  };

  const uploadProps: UploadProps = {
    accept: '.xlsx,.xls',
    maxCount: 1,
    fileList,
    beforeUpload: () => false, // 不自动上传,我们手动 fileToBase64
    onChange: ({ fileList: fl }) => setFileList(fl.slice(-1)),
  };

  const columns = [
    { title: '行', dataIndex: 'row', width: 50 },
    { title: '订单号', dataIndex: 'orderNo', width: 200 },
    {
      title: '运费',
      dataIndex: 'fee',
      width: 80,
      render: (v: number | null) => (v != null ? `¥${(v / 100).toFixed(2)}` : '—'),
    },
    {
      title: '重量',
      dataIndex: 'weight',
      width: 70,
      render: (v: number | null) => (v != null ? `${v} kg` : '—'),
    },
    { title: '单号', dataIndex: 'courierNo', width: 140 },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (s: BatchShippingStatus, row: BatchShippingRow) => (
        <Space direction="vertical" size={2}>
          <Tag color={STATUS_TAG[s].color}>{STATUS_TAG[s].label}</Tag>
          {row.message && <span style={{ fontSize: 11, color: '#999' }}>{row.message}</span>}
        </Space>
      ),
    },
    {
      title: '当前数据(会被覆盖)',
      key: 'before',
      render: (_: any, row: BatchShippingRow) => {
        if (!row.before) return '—';
        const parts: string[] = [];
        if (row.before.shippingFee?.amount != null) {
          parts.push(`运费 ¥${(row.before.shippingFee.amount / 100).toFixed(2)} (${row.before.shippingFee.payStatus})`);
        }
        if (row.before.tracking?.courierNo) {
          parts.push(`单号 ${row.before.tracking.courierNo}`);
        }
        return parts.length ? parts.join(' · ') : '—';
      },
    },
  ];

  return (
    <Modal
      title="Excel 批量上传运费"
      open={open}
      onCancel={handleClose}
      footer={null}
      width={phase === 'preview' ? 1100 : 600}
      destroyOnClose
    >
      {phase === 'pick' && (
        <Space direction="vertical" size={16} style={{ display: 'flex', width: '100%' }}>
          <div>
            <Button icon={<DownloadOutlined />} onClick={downloadShippingTemplate}>
              下载模板
            </Button>
            <span style={{ marginLeft: 12, color: '#666', fontSize: 13 }}>
              4 列中文 header:订单号 / 实际总重量 / 应补尾款 / 快递单号
            </span>
          </div>
          <Upload.Dragger {...uploadProps}>
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">点击或拖入 xlsx 文件</p>
            <p className="ant-upload-hint">单次最多 500 行 / 2MB</p>
          </Upload.Dragger>
          <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={handleClose}>关闭</Button>
            <Button type="primary" loading={loading} onClick={handleNext} disabled={!fileList.length}>
              下一步:预览
            </Button>
          </Space>
        </Space>
      )}

      {phase === 'preview' && resp && (
        <Space direction="vertical" size={12} style={{ display: 'flex', width: '100%' }}>
          <div>
            共 <strong>{resp.rows.length}</strong> 行 —{' '}
            ✅ 匹配 {resp.summary.matched} ·{' '}
            ❌ 未找到 {resp.summary.notFound} ·{' '}
            🟠 已付 {resp.summary.alreadyPaid} ·{' '}
            🚫 重复 {resp.summary.duplicateInFile} ·{' '}
            ⚠️ 非法 {resp.summary.invalid}
          </div>
          <Table
            dataSource={resp.rows}
            columns={columns}
            rowKey="row"
            size="small"
            pagination={false}
            scroll={{ y: 400 }}
          />
          <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={() => setPhase('pick')}>返回选文件</Button>
            <Button
              type="primary"
              loading={loading}
              onClick={handleApply}
              disabled={resp.summary.matched === 0}
            >
              ✅ 确认应用 {resp.summary.matched} 行
            </Button>
          </Space>
        </Space>
      )}

      {phase === 'result' && resp && (
        <Result
          status="success"
          title={`成功应用 ${resp.summary.applied ?? 0} 条`}
          subTitle={
            resp.summary.applied !== resp.rows.length
              ? `跳过 ${resp.rows.length - (resp.summary.applied ?? 0)} 条(详情见上一步预览)`
              : '全部应用成功'
          }
          extra={<Button type="primary" onClick={handleClose}>关闭</Button>}
        />
      )}
    </Modal>
  );
}
