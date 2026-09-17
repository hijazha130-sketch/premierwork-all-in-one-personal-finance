const fs = require('fs');
const { PDFParse } = require('pdf-parse');
const p = process.argv[2];
(async () => {
  try {
    const parser = new PDFParse({ data: fs.readFileSync(p) });
    const res = await parser.getText();
    fs.writeFileSync('spec2.txt', res.text, 'utf8');
    console.log('CHARS', res.text.length);
  } catch (e) { console.error('ERR', e.message); }
})();
