export async function exportReportExcel(title:string,headers:string[],rows:(string|number|null)[][],filename:string,description='') {
 const {default:ExcelJS}=await import('exceljs');const book=new ExcelJS.Workbook();const sheet=book.addWorksheet('รายงาน');
 sheet.mergeCells(1,1,1,headers.length);sheet.getCell('A1').value='สำเพ็ง บุรีรัมย์ — '+title;sheet.getCell('A1').font={bold:true,size:16};sheet.getRow(1).height=28;
 sheet.mergeCells(2,1,2,headers.length);sheet.getCell('A2').value=description;sheet.addRow([]);const header=sheet.addRow(headers);header.eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1A3A6E'}};cell.font={bold:true,color:{argb:'FFFFFFFF'}};});
 rows.forEach(row=>sheet.addRow(row));sheet.columns=headers.map((_,i)=>({width:i===0?24:26}));sheet.views=[{state:'frozen',ySplit:4}];sheet.autoFilter={from:{row:4,column:1},to:{row:4,column:headers.length}};
 const buffer=await book.xlsx.writeBuffer();const url=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));const link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
