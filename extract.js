const fs = require('fs');
const zlib = require('zlib');
const path = process.argv[2];
const buf = fs.readFileSync(path);
let out = [];
// Find all stream...endstream sections
let idx = 0;
const streamKw = Buffer.from('stream');
const endKw = Buffer.from('endstream');
while (true) {
  const s = buf.indexOf(streamKw, idx);
  if (s === -1) break;
  const e = buf.indexOf(endKw, s);
  if (e === -1) break;
  // data starts after 'stream' + newline
  let ds = s + streamKw.length;
  if (buf[ds] === 0x0d) ds++;
  if (buf[ds] === 0x0a) ds++;
  let de = e;
  // trailing EOL before endstream
  const chunk = buf.slice(ds, de);
  try {
    const inf = zlib.inflateSync(chunk);
    out.push(inf.toString('latin1'));
  } catch (err) {
    // not deflate, skip
  }
  idx = e + endKw.length;
}
// From the content streams, extract text in ( ) and <...> Tj/TJ
let text = '';
const content = out.join('\n');
// crude: capture strings inside parentheses
const re = /\(((?:\\.|[^()\\])*)\)/g;
let m;
const tjBlocks = content.split(/\n/);
// Better: walk BT...ET blocks
let result = [];
const reStr = /\(((?:\\.|[^()\\])*)\)\s*Tj/g;
const reTJ = /\[((?:[^\[\]])*)\]\s*TJ/g;
// Generic: pull all () strings in order
let allParts = [];
while ((m = re.exec(content)) !== null) {
  let s = m[1];
  s = s.replace(/\\([nrt()\\])/g, (a,b)=>({n:'\n',r:'\r',t:'\t','(':'(',')':')','\\':'\\'}[b]||b));
  s = s.replace(/\\(\d{1,3})/g, (a,o)=>String.fromCharCode(parseInt(o,8)));
  allParts.push(s);
}
console.log(allParts.join(''));
