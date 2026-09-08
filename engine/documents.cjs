const { PDFDocument } = require('pdf-lib');
const Docxtemplater = require('docxtemplater');
const PizZip = require('pizzip');

// This small, project-owned template uses only the free text/loop features.
function template() {
  const zip = new PizZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  zip.file('word/styles.xml', '<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="宋体"/><w:sz w:val="24"/><w:lang w:val="zh-CN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>');
  zip.file('word/document.xml', '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:spacing w:after="360"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t>报销材料说明</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">{title}</w:t></w:r></w:p><w:p><w:r><w:t>凭证 PDF 共 {pageCount} 页，包含 {groupCount} 项。</w:t></w:r></w:p><w:p><w:r><w:t>{#items}</w:t></w:r></w:p><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>{range}：</w:t></w:r><w:r><w:t xml:space="preserve">{description}</w:t></w:r></w:p><w:p><w:r><w:t>{/items}</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>');
  return zip;
}

function makeWord(record, ranges, pageCount, title) {
  const doc = new Docxtemplater(template(), { paragraphLoop: true, linebreaks: true, errorLogging: false });
  doc.render({ title, pageCount, groupCount: record.groups.length, items: ranges.map(range => ({
    range: range.startPage === range.endPage ? `第 ${range.startPage} 页` : `第 ${range.startPage}—${range.endPage} 页`,
    description: range.description,
  })) });
  return doc.getZip().generate({ type: 'uint8array', compression: 'DEFLATE' });
}

async function buildDocuments(record, readAsset, progress, title) {
  const pdf = await PDFDocument.create();
  const ranges = [];
  for (let index = 0; index < record.groups.length; index++) {
    const group = record.groups[index];
    if (!group.description.trim() || !group.invoiceIds.length) throw new Error(`第 ${index + 1} 项需要补齐发票和项目描述。`);
    const startPage = pdf.getPageCount() + 1;
    const ids = [...group.invoiceIds, ...group.attachmentIds];
    for (let i = 0; i < ids.length; i++) {
      const asset = record.assets[ids[i]];
      if (!asset) throw new Error(`第 ${index + 1} 项的材料记录缺失。`);
      progress(`第 ${index + 1}/${record.groups.length} 项 · 材料 ${i + 1}/${ids.length}`);
      await new Promise(resolve => setTimeout(resolve, 0));
      try {
        const bytes = await readAsset(asset);
        if (asset.kind === 'pdf') {
          const source = await PDFDocument.load(bytes);
          if (!source.getPageCount()) throw new Error('这份 PDF 没有页面');
          const pages = await pdf.copyPages(source, source.getPageIndices());
          pages.forEach(page => pdf.addPage(page));
        } else {
          const png = bytes[0] === 137 && bytes[1] === 80;
          const jpeg = bytes[0] === 255 && bytes[1] === 216;
          if (!png && !jpeg) throw new Error('图片暂时无法解码，请重新选择清晰的 PNG 或 JPG 图片');
          const embedded = png ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
          const page = pdf.addPage([595.28, 841.89]);
          const margin = 24;
          const scale = Math.min((595.28 - margin * 2) / embedded.width, (841.89 - margin * 2) / embedded.height);
          const width = embedded.width * scale;
          const height = embedded.height * scale;
          page.drawImage(embedded, { x: (595.28 - width) / 2, y: (841.89 - height) / 2, width, height });
        }
      } catch (error) {
        const raw = String(error.message || error.errMsg || error);
        const reason = /encrypt/i.test(raw) ? 'PDF 有密码或加密限制，请提供可直接打开的版本' : raw;
        throw new Error(`第 ${index + 1} 项，${asset.originalName}：${reason}`);
      }
    }
    ranges.push({ groupId: group.id, description: group.description, startPage, endPage: pdf.getPageCount() });
  }
  progress('正在保存 PDF 并生成 Word…');
  const pdfBytes = await pdf.save();
  const wordBytes = makeWord(record, ranges, pdf.getPageCount(), title);
  return { pdfBytes, wordBytes, ranges, pageCount: pdf.getPageCount() };
}
module.exports = { buildDocuments };
