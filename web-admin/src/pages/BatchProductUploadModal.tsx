import { useState } from 'react';
import { Modal, Button, Upload, Table, Tag, message, Space, Result } from 'antd';
import { DownloadOutlined, InboxOutlined } from '@ant-design/icons';
import type { UploadFile, UploadProps } from 'antd';
import {
  uploadProductsXlsx,
  type BatchProductRow,
  type BatchProductResp,
  type BatchProductStatus,
} from '../api/product';
import { downloadProductsTemplate } from '../utils/productsTemplate';

interface Props {
  open: boolean;
  onClose: () => void;
  /** 成功 apply 后通知父组件刷新商品列表 */
  onApplied?: () => void;
}

type Phase = 'pick' | 'preview' | 'result';

const STATUS_TAG: Record<BatchProductStatus, { color: string; label: string }> = {
  created: { color: 'success', label: '✅ 新建' },
  already_exists: { color: 'warning', label: '🟠 已存在' },
  duplicate_in_file: { color: 'error', label: '🚫 文件重复' },
  invalid: { color: 'error', label: '⚠️ 非法' },
  apply_failed: { color: 'error', label: '⛔️ 应用失败' },
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

export default function BatchProductUploadModal({ open, onClose, onApplied }: Props) {
  const [phase, setPhase] = useState<Phase>('pick');
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [base64, setBase64] = useState<string>('');
  const [resp, setResp] = useState<BatchProductResp | null>(null);
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
      const r = await uploadProductsXlsx(b64, true);
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
      const r = await uploadProductsXlsx(base64, false);
      setResp(r);
      if ((r.summary.applyFailed ?? 0) > 0) {
        setPhase('preview');  // 部分失败:回到预览让 admin 看清楚哪些行失败
        message.warning(`${r.summary.applied ?? 0} 成功, ${r.summary.applyFailed} 失败 — 详见列表`);
      } else {
        setPhase('result');
      }
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
    { title: '商品名', dataIndex: 'title', ellipsis: true, width: 200 },
    {
      title: '品牌',
      key: 'brand',
      width: 90,
      render: (_: any, r: BatchProductRow) => r.fields?.brand || '—',
    },
    {
      title: '规格',
      key: 'spec',
      width: 90,
      render: (_: any, r: BatchProductRow) => r.fields?.spec || '—',
    },
    {
      title: '基础价',
      key: 'basePrice',
      width: 90,
      render: (_: any, r: BatchProductRow) =>
        r.fields?.basePrice != null ? `¥${(r.fields.basePrice / 100).toFixed(2)}` : '—',
    },
    {
      title: '英文名',
      key: 'englishName',
      width: 140,
      ellipsis: true,
      render: (_: any, r: BatchProductRow) => r.fields?.englishName || '—',
    },
    {
      title: '快递',
      key: 'courierName',
      width: 100,
      render: (_: any, r: BatchProductRow) => r.fields?.courierName || '—',
    },
    {
      title: '系数',
      key: 'courierFactor',
      width: 70,
      render: (_: any, r: BatchProductRow) =>
        r.fields?.courierFactor != null ? r.fields.courierFactor : '—',
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 130,
      render: (s: BatchProductStatus, row: BatchProductRow) => (
        <Space direction="vertical" size={2}>
          <Tag color={STATUS_TAG[s].color}>{STATUS_TAG[s].label}</Tag>
          {row.message && <span style={{ fontSize: 11, color: '#999' }}>{row.message}</span>}
        </Space>
      ),
    },
  ];

  return (
    <Modal
      title="Excel 批量上传商品"
      open={open}
      onCancel={handleClose}
      footer={null}
      width={phase === 'preview' ? 1280 : 600}
      destroyOnClose
    >
      {phase === 'pick' && (
        <Space direction="vertical" size={16} style={{ display: 'flex', width: '100%' }}>
          <div>
            <Button icon={<DownloadOutlined />} onClick={downloadProductsTemplate}>
              下载模板
            </Button>
            <span style={{ marginLeft: 12, color: '#666', fontSize: 13 }}>
              8 列:商品名 / 品牌 / 规格 / 基础价(元) / 英文名 / 快递公司 / 系数 / 描述
            </span>
          </div>
          <div style={{ color: '#999', fontSize: 12, lineHeight: 1.7 }}>
            注:仅商品名必填。图片(封面/副图)不在 Excel 中,创建后请到对应商品的编辑页单独上传。
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
            ✅ 新建 {resp.summary.created} ·{' '}
            🟠 已存在 {resp.summary.alreadyExists} ·{' '}
            🚫 文件重复 {resp.summary.duplicateInFile} ·{' '}
            ⚠️ 非法 {resp.summary.invalid}
            {(resp.summary.applyFailed ?? 0) > 0 && (
              <> · ⛔️ 应用失败 {resp.summary.applyFailed}</>
            )}
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
            {resp.summary.applied !== undefined ? (
              <Button type="primary" onClick={handleClose}>关闭</Button>
            ) : (
              <>
                <Button onClick={() => setPhase('pick')}>返回选文件</Button>
                <Button
                  type="primary"
                  loading={loading}
                  onClick={handleApply}
                  disabled={resp.summary.created === 0}
                >
                  ✅ 确认创建 {resp.summary.created} 条
                </Button>
              </>
            )}
          </Space>
        </Space>
      )}

      {phase === 'result' && resp && (
        <Result
          status="success"
          title={`成功创建 ${resp.summary.applied ?? 0} 条`}
          subTitle={
            resp.summary.applied !== resp.rows.length
              ? `跳过 ${resp.rows.length - (resp.summary.applied ?? 0)} 条(详情见上一步预览)`
              : '全部创建成功'
          }
          extra={<Button type="primary" onClick={handleClose}>关闭</Button>}
        />
      )}
    </Modal>
  );
}
