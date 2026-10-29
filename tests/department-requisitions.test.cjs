const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const modulePath=process.env.PGLITE_MODULE||'@electric-sql/pglite';
const {PGlite}=require(modulePath);
const {pgcrypto}=require(path.join(path.dirname(require.resolve(modulePath)),'contrib/pgcrypto.cjs'));
const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/202610280001_department_requisitions.sql'),'utf8');
test('department requests: database transactions and access',async t=>{
 const db=new PGlite({extensions:{pgcrypto}});
 try {
 await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA extensions; CREATE TABLE branches(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL);CREATE TABLE zones(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),branch_id uuid REFERENCES branches(id),name text);CREATE TABLE items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text,unit text,image_url text,price numeric,stock_quantity integer,is_active boolean DEFAULT true);CREATE TABLE requisitions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),created_at timestamptz NOT NULL DEFAULT now(),branch_name text NOT NULL,zone_name text,sender_name text,requester_name text NOT NULL,status text NOT NULL CHECK(status IN (\'pending\',\'approved\',\'rejected\')),total_price numeric DEFAULT 0);CREATE TABLE requisition_details(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),requisition_id uuid REFERENCES requisitions(id),item_id uuid REFERENCES items(id),quantity integer,price_at_time numeric);GRANT USAGE ON SCHEMA public TO anon,authenticated; GRANT SELECT,INSERT,UPDATE,DELETE ON requisitions,requisition_details TO anon,authenticated;');
 const branch=(await db.query("INSERT INTO branches(name) VALUES('จัดเรียง'),('IT') RETURNING *")).rows;
 const a=branch[0].id,b=branch[1].id;
 await db.query("INSERT INTO zones(branch_id,name) VALUES($1,'หน้าร้าน')",[a]);
 const items=(await db.query("INSERT INTO items(name,unit,price,stock_quantity) VALUES('กระดาษ','รีม',78,0),('ปากกา','ด้าม',10,1),('เทป','ม้วน',25,0) RETURNING *")).rows;
 const lines=items.map(i=>({item_id:i.id,quantity:3}));
 const uuid=()=>require('node:crypto').randomUUID();
 const rpc=async(name,args)=>{const sql='SELECT '+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') AS value';return (await db.query(sql,args)).rows[0].value;};
 const reject=(promise,pattern)=>assert.rejects(promise,pattern);
 await t.test('migration installs and reruns without losing data',async()=>{await db.exec(migration);await db.exec(migration);});
 await t.test('setup creates one code per department and never duplicates existing codes',async()=>{
  const seed=fs.readFileSync(path.join(__dirname,'../supabase/CREATE_DEPARTMENT_CODES.sql'),'utf8');
  const first=(await db.query(seed)).rows;assert.equal(first.length,2);for(const row of first)assert((await rpc('department_login',[row.department_code])).branch_id);
  assert.equal((await db.query(seed)).rows.length,0);
 });
 await rpc('set_department_code',[a,'Department-A-Secret']);await rpc('set_department_code',[b,'Department-B-Secret']);
 let sa,sb;
 await t.test('codes authenticate departments and tokens are not stored in plain text',async()=>{
  await reject(rpc('department_login',['incorrect-code']),/รหัสแผนกไม่ถูกต้อง/);
  sa=await rpc('department_login',['Department-A-Secret']);sb=await rpc('department_login',['Department-B-Secret']);assert.equal(sa.branch_id,a);assert.equal(sb.branch_id,b);
  const stored=(await db.query('SELECT token_hash FROM department_sessions')).rows;assert(!stored.some(r=>r.token_hash===sa.token));assert.equal(sa.token.length,64);
 });
 const id=uuid();let version=0;
 const save=(token,requestId,v,rows=lines,note='ใช้จัดหน้าร้าน',zone='หน้าร้าน',sender='หัวหน้าเอ')=>rpc('save_department_requisition',[token,requestId,v,'พนักงานเอ',zone,sender,note,JSON.stringify(rows)]);
 await t.test('requires a valid zone and head/deputy for departments with zones',async()=>{
  await reject(save(sa.token,uuid(),null,lines,'','ผิดโซน'),/โซน/);await reject(save(sa.token,uuid(),null,lines,'','หน้าร้าน',''),/หัวหน้า/);
 });
 await t.test('allows quantities above stock and saves notes atomically',async()=>{
  await save(sa.token,id,null);const doc=await rpc('department_requisition',[sa.token,id]);assert.equal(doc.note,'ใช้จัดหน้าร้าน');assert.equal(doc.requisition_details.length,3);assert.equal(doc.requisition_details[0].quantity,3);assert.equal(doc.branch_id,a);assert.equal(doc.status,'pending');
 });
 await t.test('identical submission retry is idempotent; a changed retry is rejected',async()=>{
  await save(sa.token,id,null);assert.equal((await db.query('SELECT count(*)::int AS n FROM requisitions WHERE id=$1',[id])).rows[0].n,1);
  await reject(save(sa.token,id,null,lines,'ต่างจากเดิม'),/ซ้ำ/);
 });
 await t.test('department lists, reads and edits cannot select another department',async()=>{
  assert.equal((await rpc('department_requisitions',[sb.token])).total,0);
  await reject(rpc('department_requisition',[sb.token,id]),/ไม่พบใบเบิก/);
  await reject(save(sb.token,id,0),/ไม่พบใบเบิก/);
 });
 await t.test('rejects zero, fractional, negative, overflowing, string and duplicate quantities without partial headers',async()=>{
  const before=(await db.query('SELECT count(*)::int AS n FROM requisitions')).rows[0].n;
  for(const quantity of [0,-1,1.5,2147483648,'3'])await reject(save(sa.token,uuid(),null,[{item_id:items[0].id,quantity}]),/จำนวน/);
  await reject(save(sa.token,uuid(),null,[lines[0],lines[0]]),/ซ้ำ/);await reject(save(sa.token,uuid(),null,[]),/เลือกสินค้า/);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM requisitions')).rows[0].n,before);
 });
 await t.test('pending edit increments version and records before/after history',async()=>{
  await db.query('UPDATE items SET price=999 WHERE id=$1',[items[0].id]);
  await save(sa.token,id,0,lines,'แก้หมายเหตุแล้ว');const doc=await rpc('department_requisition',[sa.token,id]);version=doc.version;assert.equal(version,1);assert.equal(doc.note,'แก้หมายเหตุแล้ว');assert.equal(doc.requisition_details.find(l=>l.item_id===items[0].id).price_at_time,78);
  const changes=(await db.query('SELECT * FROM requisition_changes WHERE requisition_id=$1 ORDER BY id',[id])).rows;assert.equal(changes.length,2);assert.equal(changes[1].before_data.note,'ใช้จัดหน้าร้าน');assert.equal(changes[1].after_data.note,'แก้หมายเหตุแล้ว');
 });
 await t.test('stale employee edits and stale admin approvals are rejected',async()=>{
  await reject(save(sa.token,id,0),/ระหว่างเปิด/);
  await reject(rpc('review_requisition',[id,0,'approved','',JSON.stringify(lines)]),/ระหว่างเปิด/);
  assert.equal((await rpc('department_requisition',[sa.token,id])).status,'pending');
 });
 await t.test('three requested products become two approved products; original three remain in history',async()=>{
  await rpc('review_requisition',[id,version,'approved','ตัดเทปออก',JSON.stringify(lines.slice(0,2))]);
  const doc=await rpc('department_requisition',[sa.token,id]);assert.equal(doc.status,'approved');assert.equal(doc.requisition_details.length,2);assert.equal(doc.requested_items.length,3);assert.equal(doc.admin_note,'ตัดเทปออก');assert.equal(doc.total_price,264);
  assert.equal((await db.query('SELECT stock_quantity FROM items WHERE id=$1',[items[0].id])).rows[0].stock_quantity,0);
 });
 await t.test('finalized requests cannot be edited, approved twice or reopened',async()=>{
  await reject(save(sa.token,id,2),/ไม่สามารถแก้ไข/);
  await reject(rpc('review_requisition',[id,2,'approved','',JSON.stringify(lines)]),/ตรวจสอบไปแล้ว/);
  await reject(rpc('review_requisition',[id,2,'pending','',null]),/ไม่สามารถเปิดแก้ไข/);
 });
 const rejected=uuid();
 await t.test('approving no items rolls back; whole-request rejection preserves requested lines',async()=>{
  await save(sa.token,rejected,null);await reject(rpc('review_requisition',[rejected,0,'approved','',JSON.stringify([])]),/เลือกสินค้า/);
  assert.equal((await rpc('department_requisition',[sa.token,rejected])).requisition_details.length,3);
  await rpc('review_requisition',[rejected,0,'rejected','ไม่ใช้แล้ว',null]);const doc=await rpc('department_requisition',[sa.token,rejected]);assert.equal(doc.total_price,0);assert.equal(doc.requested_items.length,3);await reject(save(sa.token,rejected,1),/ไม่สามารถแก้ไข/);
 });
 await t.test('server filters by requester, zone, status and inclusive Thai calendar day',async()=>{
  await db.query("UPDATE requisitions SET created_at='2026-10-28T23:59:59+07:00' WHERE id=$1",[id]);
  const result=await rpc('department_requisitions',[sa.token,'พนักงาน','หน้าร้าน','approved','2026-10-28','2026-10-28',1]);assert.equal(result.total,1);assert.equal(result.rows[0].id,id);
  assert.equal((await rpc('department_requisitions',[sa.token,'ไม่มีชื่อนี้'])).total,0);
 });
 await t.test('anonymous clients cannot read codes, reset codes, or directly overwrite requests',async()=>{
  await db.exec('SET ROLE anon');
  try{await reject(db.query('SELECT * FROM department_codes'),/permission denied/);await reject(rpc('set_department_code',[a,'Another-Secret-Code']),/permission denied/);await reject(db.query("UPDATE requisitions SET requester_name='แอบแก้' WHERE id=$1",[id]),/permission denied/);await reject(db.query('DELETE FROM requisition_details WHERE requisition_id=$1',[id]),/permission denied/);}finally{await db.exec('RESET ROLE');}
 });
 await t.test('logout, expiration and code reset revoke sessions',async()=>{
  await rpc('department_logout',[sb.token]);await reject(rpc('department_requisitions',[sb.token]),/หมดอายุ/);
  await db.query("UPDATE department_sessions SET expires_at=now()-interval '1 minute' WHERE branch_id=$1",[a]);await reject(rpc('department_requisitions',[sa.token]),/หมดอายุ/);
  sa=await rpc('department_login',['Department-A-Secret']);await rpc('set_department_code',[a,'New-Department-A-Code']);await reject(rpc('department_requisitions',[sa.token]),/หมดอายุ/);await reject(rpc('department_login',['Department-A-Secret']),/ไม่ถูกต้อง/);
 });
 await t.test('only a valid admin management key can change codes; other departments and history remain intact',async()=>{
  const management=fs.readFileSync(path.join(__dirname,'../supabase/migrations/202610280002_manage_department_codes.sql'),'utf8');await db.exec(management);await db.exec(management);
  await rpc('set_department_code_admin_key',['Management-Secret-Key-123']);
  const aSession=await rpc('department_login',['New-Department-A-Code']);const bSession=await rpc('department_login',['Department-B-Secret']);
  const count=(await db.query('SELECT count(*)::int AS n FROM requisitions')).rows[0].n;
  await db.exec('SET ROLE anon');
  try{
   await reject(db.query('SELECT * FROM department_code_admin'),/permission denied/);
   await reject(rpc('set_department_code_admin_key',['Another-Management-Key']),/permission denied/);
   await reject(rpc('admin_set_department_code',['Wrong-Management-Key',b,'Changed-Department-B']),/รหัสผู้ดูแล/);
   assert.equal((await rpc('department_session_info',[bSession.token])).branch_id,b);
   await reject(rpc('admin_set_department_code',['Management-Secret-Key-123',b,'New-Department-A-Code']),/unique constraint/);
   assert.equal((await rpc('department_session_info',[bSession.token])).branch_id,b);
   await rpc('admin_set_department_code',['Management-Secret-Key-123',b,'Changed-Department-B']);
   await reject(rpc('department_session_info',[bSession.token]),/หมดอายุ/);
   assert.equal((await rpc('department_session_info',[aSession.token])).branch_id,a);
   assert.equal((await rpc('department_login',['Changed-Department-B'])).branch_id,b);
  }finally{await db.exec('RESET ROLE');}
  assert.equal((await db.query('SELECT count(*)::int AS n FROM requisitions')).rows[0].n,count);
 });
 await t.test('stock code manages credentials and master admin can enter all departments',async()=>{
  const stock=(await db.query("INSERT INTO branches(name) VALUES('สต็อก') RETURNING id")).rows[0].id;
  await rpc('set_department_code',[stock,'Stock-Department-Code']);
  const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/202610280003_stock_and_system_admin.sql'),'utf8');await db.exec(sql);await db.exec(sql);
  await rpc('set_system_admin_code',['Master-Admin-Test-Code']);
  const stockSession=await rpc('department_login',['Stock-Department-Code']);assert.equal(stockSession.role,'stock');
  const ordinary=await rpc('department_login',['New-Department-A-Code']);assert.equal(ordinary.role,'department');
  let master=await rpc('department_login',['Master-Admin-Test-Code']);assert.equal(master.role,'admin');assert.equal(master.branch_id,null);
  await db.exec('SET ROLE anon');
  try {
   await reject(db.query('SELECT * FROM system_admin_access'),/permission denied/);
   await reject(rpc('set_system_admin_code',['Unauthorized-Admin-Code']),/permission denied/);
   await reject(rpc('admin_select_department',[ordinary.token,b]),/เฉพาะแอดมิน/);
   await reject(rpc('admin_select_department',[stockSession.token,b]),/เฉพาะแอดมิน/);
   await reject(rpc('admin_set_department_code',['New-Department-A-Code',b,'Not-Authorized-Code']),/สต็อก/);
   await reject(rpc('admin_set_department_code',['Management-Secret-Key-123',b,'Not-Authorized-Code']),/สต็อก/);
   await rpc('admin_set_department_code',['Stock-Department-Code',b,'Stock-Managed-B-Code']);
   assert.equal((await rpc('department_login',['Stock-Managed-B-Code'])).branch_id,b);
   await rpc('admin_set_department_code',['Master-Admin-Test-Code',b,'Master-Managed-B-Code']);
   assert.equal((await rpc('department_login',['Master-Managed-B-Code'])).branch_id,b);
   const rootToken=master.token;master=await rpc('admin_select_department',[master.token,a]);assert.equal(master.branch_id,a);assert.equal(master.role,'admin');
   await reject(rpc('department_session_info',[rootToken]),/หมดอายุ/);
   assert.equal((await rpc('department_requisitions',[master.token])).total,2);
   await save(master.token,uuid(),null,lines,'แอดมินเบิกแทนแผนก');
   assert.equal((await rpc('department_requisitions',[ordinary.token])).total,3);
   const old=master.token;master=await rpc('admin_select_department',[master.token,b]);assert.equal(master.branch_id,b);assert.equal((await rpc('department_requisitions',[master.token])).total,0);
   await reject(rpc('department_session_info',[old]),/หมดอายุ/);
   await rpc('admin_set_department_code',['Stock-Department-Code',stock,'New-Stock-Department-Code']);
   await reject(rpc('department_session_info',[stockSession.token]),/หมดอายุ/);
   await reject(rpc('admin_set_department_code',['Stock-Department-Code',b,'Old-Stock-Should-Fail']),/สต็อก/);
   await rpc('admin_set_department_code',['New-Stock-Department-Code',b,'Updated-Stock-Managed-Code']);
   await reject(rpc('admin_set_department_code',['Master-Admin-Test-Code',b,'Master-Admin-Test-Code']),/ซ้ำกับรหัสแอดมิน/);
  } finally {await db.exec('RESET ROLE');}
  await reject(rpc('set_system_admin_code',['New-Stock-Department-Code']),/ซ้ำกับรหัสแผนก/);
  await rpc('set_system_admin_code',['Rotated-Master-Admin-Code']);
  await reject(rpc('department_session_info',[master.token]),/หมดอายุ/);
  await reject(rpc('department_login',['Master-Admin-Test-Code']),/ไม่ถูกต้อง/);
  assert.equal((await rpc('department_login',['Rotated-Master-Admin-Code'])).role,'admin');
 });
 await t.test('remembered login has no expiry while logout, password changes and master switching still revoke tokens',async()=>{
  const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/202610280004_remember_department_login.sql'),'utf8');await db.exec(sql);await db.exec(sql);
  const ordinary=await rpc('department_login',['New-Department-A-Code',false]);assert.notEqual(ordinary.expires_at,'infinity');assert(Date.parse(ordinary.expires_at)-Date.now()<13*60*60*1000);
  const remembered=await rpc('department_login',['New-Department-A-Code',true]);assert.equal(remembered.expires_at,'infinity');assert.equal((await rpc('department_session_info',[remembered.token])).expires_at,'infinity');
  await reject(rpc('department_login',['Invalid-Department-Password',true]),/ไม่ถูกต้อง/);
  await rpc('department_logout',[remembered.token]);await reject(rpc('department_session_info',[remembered.token]),/หมดอายุ/);
  const next=await rpc('department_login',['New-Department-A-Code',true]);await rpc('set_department_code',[a,'Final-Department-A-Code']);await reject(rpc('department_session_info',[next.token]),/หมดอายุ/);
  let master=await rpc('department_login',['Rotated-Master-Admin-Code',true]);assert.equal(master.expires_at,'infinity');const old=master.token;master=await rpc('admin_select_department',[master.token,b]);assert.equal(master.expires_at,'infinity');assert.equal(master.role,'admin');await reject(rpc('department_session_info',[old]),/หมดอายุ/);
  await rpc('set_system_admin_code',['Final-Master-Admin-Code']);await reject(rpc('department_session_info',[master.token]),/หมดอายุ/);
 });
 await t.test('only stock and master can decrypt department codes; legacy codes become viewable after valid login',async()=>{
  const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/202610290001_view_department_codes.sql'),'utf8');await db.exec(sql);await db.exec(sql);
  const stock=(await db.query("SELECT id FROM branches WHERE name='สต็อก'")).rows[0].id;
  const master=await rpc('department_login',['Final-Master-Admin-Code']);
  const list=token=>db.query('SELECT * FROM public.get_department_codes($1)',[token]);
  let rows=(await list(master.token)).rows;assert(rows.every(row=>row.department_code===null));assert(rows.every(row=>row.has_code));
  const stockSession=await rpc('department_login',['New-Stock-Department-Code']);
  const ordinary=await rpc('department_login',['Final-Department-A-Code']);
  await db.exec('SET ROLE anon');
  try {
   await reject(list('invalid-session-token'),/หมดอายุ/);
   await reject(list(ordinary.token),/เฉพาะแอดมิน/);
   await reject(db.query('SELECT * FROM department_code_secrets'),/permission denied/);
   await reject(db.query('SELECT encrypted_code FROM department_codes'),/permission denied/);
   rows=(await list(stockSession.token)).rows;assert.equal(rows.find(row=>row.branch_id===a).department_code,'Final-Department-A-Code');assert.equal(rows.find(row=>row.branch_id===stock).department_code,'New-Stock-Department-Code');assert.equal(rows.find(row=>row.branch_id===b).department_code,null);
   await reject(rpc('department_login',['Wrong-Password-For-Legacy']),/ไม่ถูกต้อง/);
   assert.equal((await list(master.token)).rows.find(row=>row.branch_id===b).department_code,null);
   await rpc('department_login',['Updated-Stock-Managed-Code',true]);assert.equal((await list(master.token)).rows.find(row=>row.branch_id===b).department_code,'Updated-Stock-Managed-Code');
   await rpc('admin_set_department_code',['Final-Master-Admin-Code',a,'Viewable-Department-A']);assert.equal((await list(master.token)).rows.find(row=>row.branch_id===a).department_code,'Viewable-Department-A');
  }finally{await db.exec('RESET ROLE');}
  const encrypted=(await db.query("SELECT encode(encrypted_code,'escape') AS encrypted FROM department_codes WHERE branch_id=$1",[a])).rows[0].encrypted;assert(!encrypted.includes('Viewable-Department-A'));
  await db.exec(sql);assert.equal((await list(master.token)).rows.find(row=>row.branch_id===a).department_code,'Viewable-Department-A');
  await db.query("INSERT INTO branches(name) VALUES('แผนกยังไม่มีรหัส')");assert.equal((await list(master.token)).rows.find(row=>row.branch_name==='แผนกยังไม่มีรหัส').has_code,false);
  await rpc('department_logout',[stockSession.token]);await reject(list(stockSession.token),/หมดอายุ/);
  await rpc('set_system_admin_code',['New-Master-After-View']);await reject(list(master.token),/หมดอายุ/);
 });
 }finally{await db.close();}
});
