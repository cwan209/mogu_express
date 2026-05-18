import ExcelJS from 'exceljs';

export async function downloadShippingTemplate(): Promise<void> {
  let url: string | null = null;
  let anchor: HTMLAnchorElement | null = null;
  try {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('运费');
    ws.addRow(['订单号', '实际总重量', '应补尾款', '快递单号']);
    ws.addRow(['MG2026051820003932AA07', 2.5, 35.00, 'SF1234567890']);
    ws.getRow(1).font = { bold: true };
    ws.columns = [
      { width: 28 },
      { width: 12 },
      { width: 12 },
      { width: 22 },
    ];
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    url = URL.createObjectURL(blob);
    anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = '运费上传模板.xlsx';
    document.body.appendChild(anchor);
    anchor.click();
  } catch (err) {
    console.error('[downloadShippingTemplate]', err);
    throw err;
  } finally {
    if (anchor && anchor.parentNode) anchor.parentNode.removeChild(anchor);
    if (url) URL.revokeObjectURL(url);
  }
}
