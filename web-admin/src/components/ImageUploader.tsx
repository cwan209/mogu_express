// web-admin/src/components/ImageUploader.tsx
//
// 支持单/多图上传的复合组件:
//   - antd Upload 拖拽/选择文件
//   - 调 uploadImage API
//   - "粘贴 URL" 兜底(编辑外链图 / AI 生成图)
//
// Props:
//   value:   string(单图)| string[](多图)
//   onChange(next)
//   mode:    'single' | 'multiple'
//   max:     多图最大数量(默认 5)
//   purpose: 'tuan_cover' | 'product_cover' | 'product_image'

import { useMemo, useState } from 'react';
import { Upload, Button, Input, Space, message } from 'antd';
import { PlusOutlined, LinkOutlined } from '@ant-design/icons';
import type { UploadFile, UploadProps } from 'antd/es/upload/interface';
import { uploadImage, ALLOWED_MIMES, MAX_SIZE_BYTES, type UploadPurpose } from '../api/upload';

interface BaseProps {
  purpose: UploadPurpose;
  disabled?: boolean;
}

interface SingleProps extends BaseProps {
  mode: 'single';
  value?: string;
  onChange?: (v: string) => void;
  max?: never;
}
interface MultipleProps extends BaseProps {
  mode: 'multiple';
  value?: string[];
  onChange?: (v: string[]) => void;
  max?: number;
}

type Props = SingleProps | MultipleProps;

function urlToUploadFile(url: string, idx = 0): UploadFile {
  return {
    uid: `url-${idx}-${url.slice(-12)}`,
    name: url.split('/').pop() || `image-${idx}.png`,
    status: 'done',
    url,
  };
}

export default function ImageUploader(props: Props) {
  const { mode, purpose, disabled } = props;
  const max = mode === 'multiple' ? (props.max ?? 5) : 1;

  const urls: string[] = useMemo(() => {
    if (mode === 'single') return props.value ? [props.value] : [];
    return props.value || [];
  }, [props, mode]);

  const [manualUrl, setManualUrl] = useState('');

  const fileList: UploadFile[] = urls.map(urlToUploadFile);

  const emit = (next: string[]) => {
    if (mode === 'single') {
      (props.onChange as ((v: string) => void) | undefined)?.(next[0] || '');
    } else {
      (props.onChange as ((v: string[]) => void) | undefined)?.(next);
    }
  };

  const beforeUpload: UploadProps['beforeUpload'] = (file) => {
    if (!ALLOWED_MIMES.includes(file.type)) {
      message.error('仅支持 png / jpg / webp / gif');
      return Upload.LIST_IGNORE;
    }
    if (file.size > MAX_SIZE_BYTES) {
      message.error(`图片过大(>${MAX_SIZE_BYTES / 1024 / 1024}MB)`);
      return Upload.LIST_IGNORE;
    }
    return true;
  };

  const customRequest: UploadProps['customRequest'] = async ({ file, onSuccess, onError }) => {
    try {
      const res = await uploadImage(file as File, purpose);
      if (res.isBlob) {
        message.warning('当前为 Mock 模式,图片仅本次会话可见(刷新丢失)');
      }
      const next = [...urls, res.url];
      emit(next);
      onSuccess?.(res, undefined as any);
    } catch (err: any) {
      message.error(err.message || '上传失败');
      onError?.(err);
    }
  };

  const onRemove: UploadProps['onRemove'] = (f) => {
    const next = urls.filter((u) => u !== f.url);
    emit(next);
    return true;
  };

  const addManualUrl = () => {
    const u = manualUrl.trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) {
      message.error('URL 必须以 http:// 或 https:// 开头');
      return;
    }
    if (mode === 'single') {
      emit([u]);
    } else {
      if (urls.length >= max) { message.warning(`最多 ${max} 张`); return; }
      emit([...urls, u]);
    }
    setManualUrl('');
  };

  const showUploadButton = fileList.length < max && !disabled;

  return (
    <div>
      <Upload
        listType="picture-card"
        fileList={fileList}
        beforeUpload={beforeUpload}
        customRequest={customRequest}
        onRemove={onRemove}
        accept={ALLOWED_MIMES.join(',')}
        multiple={mode === 'multiple'}
        disabled={disabled}
      >
        {showUploadButton && (
          <div>
            <PlusOutlined />
            <div style={{ marginTop: 8 }}>上传</div>
          </div>
        )}
      </Upload>

      <details style={{ marginTop: 4 }}>
        <summary style={{ cursor: 'pointer', color: '#888', fontSize: 12 }}>
          <LinkOutlined /> 或粘贴 URL
        </summary>
        <Space.Compact style={{ marginTop: 8, width: '100%', maxWidth: 480 }}>
          <Input
            placeholder="https://... (已有图床链接)"
            value={manualUrl}
            onChange={(e) => setManualUrl(e.target.value)}
            onPressEnter={addManualUrl}
            disabled={disabled}
          />
          <Button onClick={addManualUrl} disabled={disabled}>添加</Button>
        </Space.Compact>
      </details>
    </div>
  );
}
