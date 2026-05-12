import { NavBar, Empty } from 'antd-mobile';
import { useNavigate } from 'react-router-dom';

export default function Stub({ title }: { title: string }) {
  const nav = useNavigate();
  return (
    <div className="min-h-screen bg-gray-100">
      <NavBar onBack={() => nav(-1)}>{title}</NavBar>
      <div className="pt-20">
        <Empty description={`${title} — M1' / M2' 阶段实现`} />
      </div>
    </div>
  );
}
