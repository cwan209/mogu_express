import { useNavigate } from 'react-router-dom';
import { NavBar, Empty, Image, Stepper, Button, SwipeAction, Dialog } from 'antd-mobile';
import { useCartStore } from '../store/cart';
import { formatCny } from '../utils/money';

export default function Cart() {
  const nav = useNavigate();
  const items = useCartStore((s) => s.items);
  const setItem = useCartStore((s) => s.setItem);
  const remove = useCartStore((s) => s.remove);
  const clear = useCartStore((s) => s.clear);
  const totalCents = useCartStore((s) => s.totalCents());
  const totalQty = useCartStore((s) => s.totalQty());

  return (
    <div className="min-h-screen bg-gray-100">
      <NavBar
        back={null}
        right={
          items.length > 0 && (
            <a
              className="text-gray-500 text-sm"
              onClick={() =>
                Dialog.confirm({
                  content: '清空购物车?',
                  onConfirm: clear,
                })
              }
            >
              清空
            </a>
          )
        }
      >
        购物车
      </NavBar>

      {items.length === 0 ? (
        <div className="pt-20">
          <Empty description="购物车空空如也" />
          <div className="text-center mt-4">
            <Button color="primary" onClick={() => nav('/')}>去逛逛</Button>
          </div>
        </div>
      ) : (
        <>
          <div className="bg-white">
            {items.map((it) => (
              <SwipeAction
                key={it.tuanItemId}
                rightActions={[
                  {
                    key: 'del',
                    text: '删除',
                    color: 'danger',
                    onClick: () => remove(it.tuanItemId),
                  },
                ]}
              >
                <div className="flex p-3 gap-3 border-b border-gray-100">
                  <div
                    className="w-20 h-20 flex-shrink-0 rounded overflow-hidden bg-gray-100"
                    onClick={() => nav(`/product/${it.tuanItemId}`)}
                  >
                    {it.coverFileId && (
                      <Image src={it.coverFileId} width={80} height={80} fit="cover" lazy />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm line-clamp-2">{it.title}</div>
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-brand font-medium">{formatCny(it.price)}</span>
                      <Stepper
                        min={0}
                        value={it.quantity}
                        onChange={(n) =>
                          setItem(
                            {
                              tuanItemId: it.tuanItemId,
                              productId: it.productId,
                              tuanId: it.tuanId,
                              title: it.title,
                              price: it.price,
                              coverFileId: it.coverFileId,
                            },
                            n,
                          )
                        }
                      />
                    </div>
                  </div>
                </div>
              </SwipeAction>
            ))}
          </div>

          {/* 底部结算栏 */}
          <div className="fixed left-0 right-0 bottom-14 bg-white border-t border-gray-200 max-w-[480px] mx-auto p-3 flex items-center justify-between z-40">
            <div>
              <div className="text-xs text-gray-500">共 {totalQty} 件</div>
              <div className="text-brand font-medium text-lg">{formatCny(totalCents)}</div>
            </div>
            <Button color="primary" size="large" onClick={() => nav('/checkout')}>
              去结算
            </Button>
          </div>
          {/* 占位避免内容被结算栏挡住 */}
          <div className="h-24" />
        </>
      )}
    </div>
  );
}
