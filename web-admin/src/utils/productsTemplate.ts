import ExcelJS from 'exceljs';

export async function downloadProductsTemplate(): Promise<void> {
  let url: string | null = null;
  let anchor: HTMLAnchorElement | null = null;
  try {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('商品');
    ws.addRow(['商品名', '品牌', '规格', '基础价(元)', '英文名', '快递公司', '系数', '描述']);
    // 示例行 — admin 看着对照
    ws.addRow(['澳洲牛肉 500g', '澳乳', '500g', 35.50, 'AU Beef 500g', '顺丰', 1.5, '冷链直邮']);
    ws.getRow(1).font = { bold: true };
    ws.columns = [
      { width: 28 },   // 商品名
      { width: 14 },   // 品牌
      { width: 12 },   // 规格
      { width: 14 },   // 基础价
      { width: 22 },   // 英文名
      { width: 16 },   // 快递公司
      { width: 8 },    // 系数
      { width: 30 },   // 描述
    ];
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    url = URL.createObjectURL(blob);
    anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = '商品上传模板.xlsx';
    document.body.appendChild(anchor);
    anchor.click();
  } catch (err) {
    console.error('[downloadProductsTemplate]', err);
    throw err;
  } finally {
    if (anchor && anchor.parentNode) anchor.parentNode.removeChild(anchor);
    if (url) URL.revokeObjectURL(url);
  }
}
