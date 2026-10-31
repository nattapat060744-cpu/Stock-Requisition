'use client';
import Link from 'next/link';
import BrandMark from '@/components/BrandMark';
import {usePathname} from 'next/navigation';
import {useNewRequisitions,REQUISITIONS_RELOAD_EVENT} from '@/hooks/useNewRequisitions';
import styles from '@/components/adminNavigation.module.css';
type IconName='dashboard'|'request'|'report'|'inventory'|'import'|'department'|'account'|'external'|'logout';
function Icon({name}:{name:IconName}){
 const paths:Record<IconName,React.ReactNode>={
  dashboard:<><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
  request:<><path d="M9 4H5a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-4"/><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M8 11h8M8 15h8"/></>,
  report:<><path d="M4 3v17h17M8 15v-4M13 15V6M18 15v-7"/></>,
  inventory:<><path d="m3 7 9-4 9 4v10l-9 4-9-4ZM3 7l9 4 9-4M12 11v10M7.5 5l9 4"/></>,
  import:<><path d="M12 3v12m-4-4 4 4 4-4M4 15v5h16v-5"/></>,
  department:<><path d="M4 21V5h10v16M14 10h6v11M8 9h2M8 13h2M8 17h2M17 14h1M17 18h1M2 21h20"/></>,
  account:<><circle cx="12" cy="8" r="3"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></>,
  external:<><path d="M14 3h7v7m0-7L10 14M10 3H4v17h17v-6"/></>,
  logout:<><path d="M9 4H4v16h5M9 12h12m-4-4 4 4-4 4"/></>
 };
 return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
const TABS:{href:string;label:string;icon:IconName;badge?:boolean}[]=[
 {href:'/admin/dashboard',label:'แดชบอร์ด',icon:'dashboard'},
 {href:'/admin/requisitions',label:'ใบเบิก',icon:'request',badge:true},
 {href:'/admin/inventory',label:'คลังสินค้า',icon:'inventory'},
 {href:'/admin/purchase-orders',label:'นำเข้า (PO)',icon:'import'},
 {href:'/admin/reports',label:'รายงาน',icon:'report'},
 {href:'/admin/zones',label:'แผนก / โซน',icon:'department'},
];
type Props={activeHref?:string;accountLabel?:string;onLogout?:()=>void};
export default function AdminNav(props:Props){
 const {newCount}=useNewRequisitions();const pathname=usePathname();
 // กดแท็บ "ใบเบิก" ขณะอยู่หน้านั้นอยู่แล้ว → สั่งให้หน้าโหลดรายการใหม่ (ถ้าเดินมาจากหน้าอื่น หน้าใบเบิกจะเคลียร์เองตอนเปิด)
 const onRequisitionsClick=()=>{if(pathname.endsWith('/admin/requisitions'))window.dispatchEvent(new Event(REQUISITIONS_RELOAD_EVENT));};
 return <AdminNavView {...props} newCount={newCount} onRequisitionsClick={onRequisitionsClick}/>;
}
export function AdminNavView({activeHref,accountLabel,onLogout,newCount,onRequisitionsClick}:Props&{newCount:number;onRequisitionsClick?:()=>void}){
 const pathname=usePathname();const start=pathname.indexOf('/admin');const path=start>=0?pathname.slice(start):pathname;
 const active=activeHref||(path.startsWith('/admin/stocktake')?'/admin/inventory':path.startsWith('/admin/history')||path.startsWith('/admin/reports')?'/admin/reports':path);
 return <aside className={styles.sidebar}>
  <Link href="/admin/dashboard" className={styles.brand}><BrandMark size={42}/><span className={styles.brandText}><span className={styles.wordmark}>ระบบเบิกของ</span><span className={styles.tagline}>หลังบ้าน · จัดการเบิก-จ่าย</span></span></Link>
  <nav aria-label="เมนูหลักหลังบ้าน" className={styles.nav}>
   <span className={styles.section}>เมนูหลัก</span>
   {TABS.map(tab=>{const selected=active===tab.href;return <Link key={tab.href} href={tab.href} aria-current={selected?'page':undefined} onClick={tab.badge?onRequisitionsClick:undefined} className={styles.tab+(selected?' '+styles.active:'')}><span className={styles.icon}><Icon name={tab.icon}/></span><span className={styles.label}>{tab.label}</span>{tab.badge&&newCount>0&&<span role="img" aria-label={'มีใบเบิกใหม่ '+newCount+' รายการ'} className={styles.notify}>{newCount>9?'9+':newCount}</span>}</Link>;})}
  </nav>
  <div className={styles.footer}>
   {accountLabel&&<div className={styles.identity}><span className={styles.avatar}><Icon name="account"/></span><span className={styles.identityText}><span className={styles.caption}>ผู้ใช้งานระบบ</span><span className={styles.name}>{accountLabel}</span></span></div>}
   <div className={styles.actions}><Link href="/requisition" className={styles.shortcut}>หน้าเบิกสินค้า<Icon name="external"/></Link>{onLogout&&<button type="button" onClick={onLogout} className={styles.logout}><Icon name="logout"/>ออกจากระบบ</button>}</div>
  </div>
 </aside>;
}
