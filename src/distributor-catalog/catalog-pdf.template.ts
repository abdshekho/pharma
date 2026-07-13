import { catalogFontFaceCss } from './catalog-fonts';

export interface CatalogProductRow {
  nameAr: string;
  companyNameAr: string;
  offerLabel: string;
  offerStartsAt: string;
  offerEndsAt: string;
  distributorToPharmacistPrice: string;
  pharmacistToConsumerPrice: string;
  availability: 'Available' | 'Out of Stock';
}

export interface CatalogPdfData {
  distributorName: string;
  generatedAt: string;
  rows: CatalogProductRow[];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildCatalogHtml(data: CatalogPdfData): string {
  const rowsHtml = data.rows.length
    ? data.rows
        .map(
          (row) => `
        <tr>
          <td class="name-cell">${escapeHtml(row.nameAr)}</td>
          <td class="name-cell">${escapeHtml(row.companyNameAr)}</td>
          <td class="ltr-cell">${escapeHtml(row.offerLabel)}</td>
          <td class="ltr-cell">${escapeHtml(row.offerStartsAt)}</td>
          <td class="ltr-cell">${escapeHtml(row.offerEndsAt)}</td>
          <td class="ltr-cell">${escapeHtml(row.distributorToPharmacistPrice)}</td>
          <td class="ltr-cell">${escapeHtml(row.pharmacistToConsumerPrice)}</td>
          <td class="ltr-cell ${row.availability === 'Available' ? 'available' : 'out-of-stock'}">${row.availability}</td>
        </tr>`,
        )
        .join('')
    : `<tr><td colspan="8" class="empty-row">لا توجد منتجات في المخزون حالياً</td></tr>`;

  return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8" />
<style>
  ${catalogFontFaceCss}

  * { box-sizing: border-box; }

  body {
    direction: rtl;
    font-family: 'Cairo', sans-serif;
    color: #1f2937;
    margin: 0;
    padding: 0;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 2px solid #0f766e;
    padding-bottom: 12px;
    margin-bottom: 16px;
  }

  .header h1 {
    font-size: 20px;
    font-weight: 700;
    color: #0f766e;
    margin: 0;
  }

  .header .subtitle {
    font-size: 11px;
    color: #6b7280;
    font-weight: 400;
    margin-top: 2px;
  }

  .header .meta {
    text-align: left;
    font-size: 11px;
    color: #4b5563;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    font-size: 10.5px;
  }

  thead {
    display: table-header-group;
  }

  tr {
    page-break-inside: avoid;
  }

  th {
    background-color: #0f766e;
    color: #ffffff;
    font-weight: 700;
    padding: 8px 6px;
    text-align: center;
    border: 1px solid #0f766e;
  }

  td {
    padding: 6px;
    border: 1px solid #d1d5db;
    text-align: center;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }

  td.name-cell {
    text-align: right;
  }

  td.ltr-cell {
    direction: ltr;
    unicode-bidi: isolate;
  }

  tbody tr:nth-child(even) {
    background-color: #f9fafb;
  }

  td.available {
    color: #15803d;
    font-weight: 700;
  }

  td.out-of-stock {
    color: #b91c1c;
    font-weight: 700;
  }

  .empty-row {
    padding: 24px;
    color: #6b7280;
    font-weight: 400;
  }
</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>كتالوج مخزون الموزع</h1>
      <div class="subtitle">Distributor Inventory Catalog</div>
    </div>
    <div class="meta">
      <div>الموزع: ${escapeHtml(data.distributorName)}</div>
      <div>تاريخ الإصدار: ${escapeHtml(data.generatedAt)}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 16%">اسم المنتج</th>
        <th style="width: 14%">اسم الشركة</th>
        <th style="width: 10%">العرض</th>
        <th style="width: 11%">بداية العرض</th>
        <th style="width: 11%">نهاية العرض</th>
        <th style="width: 13%">سعر الموزع للصيدلي</th>
        <th style="width: 13%">سعر الصيدلي للمستهلك</th>
        <th style="width: 12%">التوفر</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>
</body>
</html>
`;
}
