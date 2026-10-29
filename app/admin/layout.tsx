import DepartmentAccess from '@/components/DepartmentAccess';
export default function AdminLayout({children}:{children:React.ReactNode}){return <DepartmentAccess adminOnly>{children}</DepartmentAccess>;}
