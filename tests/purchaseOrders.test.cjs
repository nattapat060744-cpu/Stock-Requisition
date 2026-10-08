const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const XLSX = require('xlsx');
const api = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/purchaseOrders.ts', 'utf8'), {
 compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
}).outputText, { exports: api });
const items = [{ id: 'a', product_code: '001', name: 'กระดาษ', unit: 'รีม', stock_quantity: 5 }];
const row = { key:'a', item_id:'a', imported_code:'001', quantity:'2', purchase_unit:'กล่อง', units_per_pack:'5', unit_price:'100.50' };
test('accepts valid units and calculates conversion without changing inventory', () => {
 const result = api.validatePOLines([row], items);
 assert.equal(result.errors.length, 0);
 assert.equal(result.lines[0].quantity * result.lines[0].units_per_pack, 10);
 assert.equal(items[0].stock_quantity, 5);
});
test('rejects empty orders and duplicate products', () => {
 assert.ok(api.validatePOLines([], items).errors.length);
 assert.ok(api.validatePOLines([row, {...row,key:'b'}],items).errors.some((text)=>text.includes('ซ้ำ')));
});
test('rejects missing products, zero, fractional and negative quantities', () => {
 for (const quantity of ['0','-1','1.5','', 'NaN']) assert.ok(api.validatePOLines([{...row,quantity}],items).errors.length);
 assert.ok(api.validatePOLines([{...row,item_id:''}],items).errors.length);
});
test('rejects invalid prices, units and overflow', () => {
 for (const unit_price of ['-5','1.234','Infinity','']) assert.ok(api.validatePOLines([{...row,unit_price}],items).errors.length);
 assert.ok(api.validatePOLines([{...row,purchase_unit:''}],items).errors.length);
 assert.ok(api.validatePOLines([{...row,quantity:'2147483647',units_per_pack:'2'}],items).errors.length);
});
test('comma formatting is strict', () => {
 assert.equal(api.numberValue('1,000.50'),1000.5);
 assert.ok(Number.isNaN(api.numberValue('1000,000')));
 assert.ok(Number.isNaN(api.numberValue('10,00')));
});
test('imports English headers and matches leading-zero codes', () => {
 const rows=api.importPORows([['product_code','quantity','unit_price','purchase_unit','units_per_pack'],['001','1,000','2.50','กล่อง','5']],items);
 assert.equal(rows[0].item_id,'a'); assert.equal(rows[0].quantity,'1000'); assert.equal(rows[0].unit_price,'2.5');
 assert.equal(rows[0].units_per_pack,'5');
});
test('unmatched or ambiguous products require manual mapping', () => {
 const rows=api.importPORows([['รหัสสินค้า','จำนวน','ราคาซื้อ'],['UNKNOWN',2,10]],items);
 assert.equal(rows[0].item_id,'');
 assert.ok(api.validatePOLines(rows,items).errors.length);
 assert.equal(api.importPORows([['รหัสสินค้า','จำนวน','ราคาซื้อ'],['001',2,10]],[...items,{...items[0],id:'b'}])[0].item_id,'');
});
test('rejects missing headers and excessive rows', () => {
 assert.throws(()=>api.importPORows([['wrong'],['a']],items));
 assert.throws(()=>api.importPORows(Array.from({length:502},()=>['a']),items));
});
test('real XLSX roundtrip preserves code, pack size and price', () => {
 const wb=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['รหัสสินค้า','จำนวน','ราคาซื้อ','หน่วยซื้อ','ตัวคูณหน่วย'],['001',2,100.5,'กล่อง',5]]),'PO');
 const bytes=XLSX.write(wb,{type:'buffer',bookType:'xlsx'});
 const imported=XLSX.read(bytes,{type:'buffer'});
 const rows=XLSX.utils.sheet_to_json(imported.Sheets.PO,{header:1,defval:'',raw:false});
 const result=api.validatePOLines(api.importPORows(rows,items),items);
 assert.equal(result.errors.length,0);
 assert.equal(result.lines[0].unit_price,100.5);
 assert.equal(result.lines[0].units_per_pack,5);
});

test('product search matches partial digits and names while prioritizing code prefixes',()=>{
 const products=[{...items[0],id:'a',product_code:'1133',name:'ถุงร้อน'},{...items[0],id:'b',product_code:'3311',name:'ถุงเย็น'},{...items[0],id:'c',product_code:'SPB01',name:'กระดาษ'}];
 assert.equal(api.searchPOItems(products,'3').length,2);
 assert.equal(api.searchPOItems(products,'3')[0].id,'b');
 assert.equal(api.searchPOItems(products,'spb')[0].id,'c');
 assert.equal(api.searchPOItems(products,'113 ถุง')[0].id,'a');
 assert.equal(api.searchPOItems(products,'ไม่พบ').length,0);
});

test('imports the simplified form headings and retains pack conversion',()=>{
 const imported=api.importPORows([['รหัสสินค้า','จำนวน','มูลค่า / หน่วย','หน่วย','จำนวนใน 1 หน่วย'],['001',2,100,'กล่อง',12]],items);
 assert.equal(imported[0].purchase_unit,'กล่อง');
 assert.equal(imported[0].units_per_pack,'12');
 assert.equal(imported[0].unit_price,'100');
 assert.equal(api.validatePOLines(imported,items).errors.length,0);
});
