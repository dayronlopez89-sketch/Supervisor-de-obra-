import { useState, useEffect, useRef } from "react";

const STORAGE_KEY = "supervisor_obra_v3";
const PIN_KEY = "supervisor_obra_pin";

// ─── Helpers ─────────────────────────────────────────────────────────────────
const generateId = () => Math.random().toString(36).substr(2, 9);
const defaultData = { trabajadores:[], zonas:[], proyecto:"", fechaInicio:"", notas:"" };

// Storage helpers using window.storage (Artifact persistent storage)
async function loadDataAsync() {
  try {
    const r = await window.storage.get(STORAGE_KEY);
    return r ? JSON.parse(r.value) : defaultData;
  } catch { return defaultData; }
}
async function saveDataAsync(d) {
  try { await window.storage.set(STORAGE_KEY, JSON.stringify(d)); } catch {}
}
async function loadPinAsync() {
  try {
    const r = await window.storage.get(PIN_KEY);
    return r ? r.value : "";
  } catch { return ""; }
}
async function savePinAsync(p) {
  try {
    if (p) { await window.storage.set(PIN_KEY, p); }
    else { await window.storage.delete(PIN_KEY); }
  } catch {}
}
// Sync wrappers used by PinScreen (values pre-loaded into state)
function loadPin() { return window.__supervisorPin || ""; }
function savePin(p) { window.__supervisorPin = p; savePinAsync(p); }

const MAT_ESTADOS = {
  pendiente: { label:"Pendiente",  color:"#f59e0b", bg:"#f59e0b18", dot:"#f59e0b" },
  comprado:  { label:"Comprado",   color:"#22c55e", bg:"#22c55e18", dot:"#22c55e" },
  en_camino: { label:"En camino",  color:"#38bdf8", bg:"#38bdf818", dot:"#38bdf8" },
  entregado: { label:"Entregado",  color:"#a78bfa", bg:"#a78bfa18", dot:"#a78bfa" },
};

const fmt = (n) => n!=null&&n!==""? Number(n).toLocaleString("es-AR",{minimumFractionDigits:2,maximumFractionDigits:2}) : "—";

// ─── PDF Avance ───────────────────────────────────────────────────────────────
async function loadJsPDF() {
  if (!window.jspdf) {
    await new Promise((res,rej)=>{ const s=document.createElement("script"); s.src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"; s.onload=res; s.onerror=rej; document.head.appendChild(s); });
  }
  return window.jspdf.jsPDF;
}

async function exportPDF(data, calcZonePct, totalPct) {
  const jsPDF = await loadJsPDF();
  const doc = new jsPDF({ unit:"pt", format:"a4" });
  const W=doc.internal.pageSize.getWidth(), H=doc.internal.pageSize.getHeight(), margin=40;
  let y=margin;
  const chk=(n=30)=>{ if(y+n>H-margin){doc.addPage();y=margin;} };
  doc.setFillColor(10,22,40); doc.rect(0,0,W,70,"F");
  doc.setFillColor(245,158,11); doc.rect(0,68,W,3,"F");
  doc.setFont("helvetica","bold"); doc.setFontSize(22); doc.setTextColor(241,245,249);
  doc.text("SUPERVISOR DE OBRA",margin,30);
  doc.setFontSize(10); doc.setFont("helvetica","normal"); doc.setTextColor(148,163,184);
  const now=new Date();
  doc.text(`Reporte: ${now.toLocaleDateString("es-ES",{day:"2-digit",month:"long",year:"numeric"})} — ${now.toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"})}`,margin,48);
  if(data.proyecto){ doc.setFontSize(9); doc.setTextColor(245,158,11); doc.text(`Proyecto: ${data.proyecto}`,margin,62); }
  const pct=totalPct();
  doc.setFillColor(245,158,11); doc.roundedRect(W-margin-80,12,80,44,6,6,"F");
  doc.setFont("helvetica","bold"); doc.setFontSize(24); doc.setTextColor(15,23,42);
  doc.text(`${pct}%`,W-margin-40,36,{align:"center"});
  doc.setFontSize(8); doc.text("AVANCE TOTAL",W-margin-40,50,{align:"center"});
  y=90;
  const allItems=data.zonas.flatMap(z=>z.items||[]);
  const done=allItems.filter(i=>i.terminado===1).length;
  const summaries=[["ZONAS",data.zonas.length,[30,58,95]],["TRABAJADORES",data.trabajadores.length,[15,83,80]],["ÍTEMS TOTALES",allItems.length,[79,70,229]],["COMPLETADOS",done,[34,197,94]]];
  const bw=(W-margin*2-12)/4;
  summaries.forEach(([label,val,rgb],i)=>{
    const bx=margin+i*(bw+4);
    doc.setFillColor(30,41,59); doc.roundedRect(bx,y,bw,46,5,5,"F");
    doc.setFillColor(...rgb); doc.rect(bx,y,3,46,"F");
    doc.setFont("helvetica","bold"); doc.setFontSize(22); doc.setTextColor(241,245,249);
    doc.text(String(val),bx+bw/2,y+26,{align:"center"});
    doc.setFontSize(7); doc.setFont("helvetica","normal"); doc.setTextColor(100,116,139);
    doc.text(label,bx+bw/2,y+39,{align:"center"});
  });
  y+=62;
  const secTitle=(t)=>{ chk(36); doc.setFillColor(245,158,11); doc.rect(margin,y,3,18,"F"); doc.setFont("helvetica","bold"); doc.setFontSize(11); doc.setTextColor(241,245,249); doc.text(t.toUpperCase(),margin+10,y+13); y+=26; };
  secTitle("Zonas de Trabajo");
  data.zonas.forEach((zona,zi)=>{
    chk(60);
    const zPct=calcZonePct(zona);
    const zColor=zPct<30?[239,68,68]:zPct<70?[245,158,11]:[34,197,94];
    doc.setFillColor(15,23,42); doc.roundedRect(margin,y,W-margin*2,36,5,5,"F");
    doc.setFillColor(...zColor); doc.roundedRect(margin,y,4,36,2,2,"F");
    doc.setFont("helvetica","bold"); doc.setFontSize(11); doc.setTextColor(241,245,249);
    doc.text(`${zi+1}. ${zona.nombre}`,margin+12,y+14);
    if(zona.descripcion){doc.setFont("helvetica","normal");doc.setFontSize(8);doc.setTextColor(100,116,139);doc.text(zona.descripcion,margin+12,y+26);}
    doc.setFont("helvetica","bold"); doc.setFontSize(13); doc.setTextColor(...zColor);
    doc.text(`${zPct}%`,W-margin-6,y+18,{align:"right"});
    const bX=margin+12,bW=W-margin*2-80;
    doc.setFillColor(30,41,59); doc.roundedRect(bX,y+28,bW,4,2,2,"F");
    doc.setFillColor(...zColor); if(zPct>0)doc.roundedRect(bX,y+28,bW*zPct/100,4,2,2,"F");
    y+=44;
    (zona.items||[]).forEach(item=>{
      chk(24);
      const isDone=item.terminado===1;
      doc.setFillColor(isDone?20:30,isDone?83:41,isDone?45:59);
      doc.roundedRect(margin+10,y,W-margin*2-10,20,3,3,"F");
      doc.setFont("helvetica","normal"); doc.setFontSize(9);
      doc.setTextColor(isDone?134:226,isDone?239:232,isDone?172:232);
      doc.text((isDone?"✓ ":"○ ")+item.nombre,margin+16,y+13);
      if(item.peso&&item.peso!==1){doc.setFont("helvetica","bold");doc.setFontSize(7.5);doc.setTextColor(245,158,11);doc.text(`W:${item.peso}`,W-margin-6,y+13,{align:"right"});}
      y+=24;
      if(item.notas){chk(14);doc.setFont("helvetica","italic");doc.setFontSize(7.5);doc.setTextColor(100,150,180);doc.text(`Nota: ${item.notas}`,margin+20,y);y+=13;}
      if(item.materiales?.length>0){
        chk(20);
        doc.setFillColor(15,23,42); doc.rect(margin+10,y,W-margin*2-10,14,"F");
        doc.setFont("helvetica","bold"); doc.setFontSize(7); doc.setTextColor(100,116,139);
        const cols=[margin+14,margin+90,margin+140,margin+190,margin+250,W-margin-6];
        ["MATERIAL","ESTADO","CANT.","PRECIO U.","TOTAL","PROVEEDOR"].forEach((h,i)=>{ if(i===5)doc.text(h,cols[i],y+10,{align:"right"}); else doc.text(h,cols[i],y+10); });
        y+=16;
        item.materiales.forEach(mat=>{
          chk(14);
          const total=(parseFloat(mat.precio)||0)*(parseFloat(mat.cantidad)||0);
          const estClr=mat.estado==="comprado"?[34,197,94]:mat.estado==="entregado"?[167,139,250]:mat.estado==="en_camino"?[56,189,248]:[245,158,11];
          doc.setFillColor(25,35,50); doc.rect(margin+10,y,W-margin*2-10,13,"F");
          doc.setFont("helvetica","normal"); doc.setFontSize(7.5); doc.setTextColor(200,210,220);
          doc.text(mat.nombre||"",cols[0],y+9);
          doc.setTextColor(...estClr); doc.setFont("helvetica","bold");
          doc.text(MAT_ESTADOS[mat.estado||"pendiente"].label,cols[1],y+9);
          doc.setFont("helvetica","normal"); doc.setTextColor(200,210,220);
          doc.text(`${mat.cantidad||0} ${mat.unidad||""}`,cols[2],y+9);
          doc.setTextColor(148,163,184); doc.text(mat.precio?`$${fmt(mat.precio)}`:"—",cols[3],y+9);
          doc.setTextColor(245,158,11); doc.setFont("helvetica","bold"); doc.text(total>0?`$${fmt(total)}`:"—",cols[4],y+9);
          doc.setFont("helvetica","normal"); doc.setTextColor(100,116,139); doc.text(mat.proveedor||"—",cols[5],y+9,{align:"right"});
          y+=14;
          if(mat.fechaCompra){doc.setTextColor(75,85,99);doc.setFontSize(6.5);doc.text(`  Compra: ${mat.fechaCompra}${mat.fechaEntrega?` · Entrega est.: ${mat.fechaEntrega}`:""}`,cols[0],y);y+=10;}
        });
        y+=4;
      }
    });
    y+=10;
  });
  const pageCount=doc.internal.getNumberOfPages();
  for(let p=1;p<=pageCount;p++){
    doc.setPage(p); doc.setFillColor(10,22,40); doc.rect(0,H-28,W,28,"F");
    doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(100,116,139);
    doc.text("Supervisor de Obra — Reporte de Avance",margin,H-10);
    doc.text(`Página ${p} de ${pageCount}`,W-margin,H-10,{align:"right"});
  }
  doc.save(`reporte-obra-${now.toISOString().slice(0,10)}.pdf`);
}

// ─── PDF Compras ──────────────────────────────────────────────────────────────
async function exportComprasPDF(data, filtro="todos") {
  const jsPDF = await loadJsPDF();
  const doc = new jsPDF({ unit:"pt", format:"a4" });
  const W=doc.internal.pageSize.getWidth(), H=doc.internal.pageSize.getHeight(), margin=40;
  let y=margin;
  const chk=(n=30)=>{ if(y+n>H-margin){doc.addPage();y=margin;} };
  const now=new Date();
  // Header
  doc.setFillColor(10,22,40); doc.rect(0,0,W,80,"F");
  doc.setFillColor(245,158,11); doc.rect(0,78,W,3,"F");
  doc.setFont("helvetica","bold"); doc.setFontSize(20); doc.setTextColor(241,245,249);
  doc.text("ORDEN DE COMPRA / MATERIALES",margin,28);
  doc.setFont("helvetica","normal"); doc.setFontSize(9); doc.setTextColor(148,163,184);
  if(data.proyecto) doc.text(`Proyecto: ${data.proyecto}`,margin,44);
  doc.text(`Generado: ${now.toLocaleDateString("es-ES",{day:"2-digit",month:"long",year:"numeric"})} — ${now.toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"})}`,margin,58);
  const filtroLabel=filtro==="pendiente"?"Solo Pendientes":filtro==="comprado"?"Solo Comprados":filtro==="en_camino"?"En Camino":filtro==="entregado"?"Entregados":"Todos los materiales";
  doc.setFontSize(8); doc.setTextColor(245,158,11); doc.text(`Filtro: ${filtroLabel}`,margin,70);
  y=100;
  let totalGeneral=0;
  const porProveedor={};
  data.zonas.forEach(zona=>{
    const itemsConMats=(zona.items||[]).filter(item=>{
      const mats=(item.materiales||[]).filter(m=>filtro==="todos"||(m.estado||"pendiente")===filtro);
      return mats.length>0;
    });
    if(itemsConMats.length===0) return;
    chk(50);
    doc.setFillColor(10,22,40); doc.roundedRect(margin,y,W-margin*2,28,4,4,"F");
    doc.setFillColor(245,158,11); doc.roundedRect(margin,y,4,28,2,2,"F");
    doc.setFont("helvetica","bold"); doc.setFontSize(12); doc.setTextColor(241,245,249);
    doc.text(zona.nombre.toUpperCase(),margin+12,y+18);
    y+=36;
    itemsConMats.forEach(item=>{
      const mats=(item.materiales||[]).filter(m=>filtro==="todos"||(m.estado||"pendiente")===filtro);
      chk(30);
      doc.setFillColor(20,30,48); doc.rect(margin+6,y,W-margin*2-6,20,"F");
      doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.setTextColor(148,163,184);
      doc.text(`→ ${item.nombre}`,margin+12,y+14);
      if(item.fechaInicio||item.fechaFin){doc.setFont("helvetica","normal");doc.setFontSize(7.5);doc.setTextColor(75,85,99);doc.text([item.fechaInicio&&`Inicio: ${item.fechaInicio}`,item.fechaFin&&`Fin: ${item.fechaFin}`].filter(Boolean).join("  "),W-margin-6,y+14,{align:"right"});}
      y+=24;
      chk(16);
      doc.setFillColor(15,23,42); doc.rect(margin+6,y,W-margin*2-6,14,"F");
      doc.setFont("helvetica","bold"); doc.setFontSize(7); doc.setTextColor(71,85,105);
      const C=[margin+10,margin+85,margin+130,margin+165,margin+210,margin+268,W-margin-6];
      ["MATERIAL","ESTADO","CANT.","UNID.","PRECIO U.","TOTAL","PROV. / FECHA"].forEach((h,i)=>{ if(i===6)doc.text(h,C[i],y+10,{align:"right"}); else doc.text(h,C[i],y+10); });
      y+=16;
      mats.forEach((mat,mi)=>{
        chk(16);
        const est=MAT_ESTADOS[mat.estado||"pendiente"];
        const precio=parseFloat(mat.precio)||0;
        const cantidad=parseFloat(mat.cantidad)||0;
        const total=precio*cantidad;
        totalGeneral+=total;
        if(mat.proveedor){ porProveedor[mat.proveedor]=(porProveedor[mat.proveedor]||0)+total; }
        const rowBg=mi%2===0?[15,23,42]:[12,20,36];
        doc.setFillColor(...rowBg); doc.rect(margin+6,y,W-margin*2-6,14,"F");
        doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(210,220,230);
        doc.text(mat.nombre||"",C[0],y+10);
        const estClr=mat.estado==="comprado"?[34,197,94]:mat.estado==="entregado"?[167,139,250]:mat.estado==="en_camino"?[56,189,248]:[245,158,11];
        doc.setTextColor(...estClr); doc.setFont("helvetica","bold"); doc.setFontSize(7);
        doc.text(est.label,C[1],y+10);
        doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(210,220,230);
        doc.text(String(cantidad||0),C[2],y+10);
        doc.text(mat.unidad||"",C[3],y+10);
        doc.setTextColor(148,163,184); doc.text(precio>0?`$${fmt(precio)}`:"—",C[4],y+10);
        doc.setFont("helvetica","bold"); doc.setTextColor(245,158,11); doc.text(total>0?`$${fmt(total)}`:"—",C[5],y+10);
        doc.setFont("helvetica","normal"); doc.setTextColor(100,116,139); doc.setFontSize(7);
        const provFecha=[mat.proveedor,mat.fechaCompra].filter(Boolean).join(" · ");
        doc.text(provFecha||"—",C[6],y+10,{align:"right"});
        y+=15;
        if(mat.notas){chk(10);doc.setFontSize(6.5);doc.setTextColor(75,85,99);doc.text(`   Nota: ${mat.notas}`,C[0],y);y+=10;}
      });
      const subtotal=mats.reduce((s,m)=>(parseFloat(m.precio)||0)*(parseFloat(m.cantidad)||0)+s,0);
      if(subtotal>0){
        chk(14); doc.setFillColor(20,30,50); doc.rect(margin+6,y,W-margin*2-6,13,"F");
        doc.setFont("helvetica","bold"); doc.setFontSize(8); doc.setTextColor(245,158,11);
        doc.text(`Subtotal ítem: $${fmt(subtotal)}`,W-margin-6,y+9,{align:"right"});
        y+=14;
      }
      y+=6;
    });
    y+=8;
  });
  if(Object.keys(porProveedor).length>0){
    chk(60);
    doc.setFillColor(245,158,11); doc.rect(margin,y,3,18,"F");
    doc.setFont("helvetica","bold"); doc.setFontSize(11); doc.setTextColor(241,245,249);
    doc.text("RESUMEN POR PROVEEDOR",margin+10,y+13); y+=26;
    Object.entries(porProveedor).sort((a,b)=>b[1]-a[1]).forEach(([prov,tot])=>{
      chk(18); doc.setFillColor(15,23,42); doc.roundedRect(margin,y,W-margin*2,16,3,3,"F");
      doc.setFont("helvetica","normal"); doc.setFontSize(9); doc.setTextColor(210,220,230); doc.text(prov,margin+10,y+11);
      doc.setFont("helvetica","bold"); doc.setTextColor(245,158,11); doc.text(`$${fmt(tot)}`,W-margin-6,y+11,{align:"right"});
      y+=18;
    });
    y+=10;
  }
  chk(40);
  doc.setFillColor(245,158,11); doc.roundedRect(margin,y,W-margin*2,36,6,6,"F");
  doc.setFont("helvetica","bold"); doc.setFontSize(14); doc.setTextColor(15,23,42);
  doc.text("TOTAL GENERAL",margin+16,y+22);
  doc.setFontSize(18); doc.text(`$${fmt(totalGeneral)}`,W-margin-10,y+24,{align:"right"});
  y+=46;
  const pageCount=doc.internal.getNumberOfPages();
  for(let p=1;p<=pageCount;p++){
    doc.setPage(p); doc.setFillColor(10,22,40); doc.rect(0,H-28,W,28,"F");
    doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(100,116,139);
    doc.text("Supervisor de Obra — Orden de Compra",margin,H-10);
    doc.text(`Página ${p} de ${pageCount}`,W-margin,H-10,{align:"right"});
  }
  doc.save(`compras-obra-${filtro}-${now.toISOString().slice(0,10)}.pdf`);
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const IconHardHat=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v2z"/><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/><path d="M4 15v-3a8 8 0 0 1 16 0v3"/></svg>;
const IconZone=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>;
const IconBox=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="15" height="15"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>;
const IconPlus=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" width="15" height="15"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
const IconTrash=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>;
const IconChevron=({open})=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" width="15" height="15" style={{transform:open?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.25s"}}><polyline points="6 9 12 15 18 9"/></svg>;
const IconCheck=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" width="11" height="11"><polyline points="20 6 9 17 4 12"/></svg>;
const IconCamera=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>;
const IconPhoto=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>;
const IconEdit=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
const IconLock=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
const IconUnlock=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>;
const IconDownload=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;
const IconUpload=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>;
const IconDrag=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="12" height="12"><circle cx="9" cy="6" r="1" fill="currentColor"/><circle cx="15" cy="6" r="1" fill="currentColor"/><circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/><circle cx="9" cy="18" r="1" fill="currentColor"/><circle cx="15" cy="18" r="1" fill="currentColor"/></svg>;
const IconChart=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>;
const IconNote=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="11" height="11"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;
const IconCalendar=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="11" height="11"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
const IconPhone=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="11" height="11"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.52 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 8.91A16 16 0 0 0 12 13l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 14v2.92z"/></svg>;
const IconKey=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>;
const IconGear=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
const IconCart=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="17" height="17"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>;
const IconTruck=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="11" height="11"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>;

// ─── Progress Ring ────────────────────────────────────────────────────────────
function ProgressRing({ pct, size=56, stroke=5, color="#f59e0b" }) {
  const r=(size-stroke)/2, circ=2*Math.PI*r, offset=circ-(pct/100)*circ;
  return (
    <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1e293b" strokeWidth={stroke}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset} style={{transition:"stroke-dashoffset 0.5s ease"}} strokeLinecap="round"/>
    </svg>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, wide }) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.78)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,backdropFilter:"blur(4px)",padding:"14px"}}>
      <div style={{background:"#0f172a",border:"1px solid #334155",borderRadius:"16px",width:`min(${wide?580:440}px,96vw)`,padding:"22px",boxShadow:"0 25px 60px rgba(0,0,0,0.6)",maxHeight:"93vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"16px"}}>
          <h3 style={{margin:0,fontSize:"0.95rem",fontWeight:700,color:"#f1f5f9",fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:"0.05em",textTransform:"uppercase"}}>{title}</h3>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#64748b",cursor:"pointer",fontSize:"1.4rem",lineHeight:1,padding:"2px 6px"}}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const inp={width:"100%",background:"#1e293b",border:"1px solid #334155",borderRadius:"8px",padding:"9px 12px",color:"#f1f5f9",fontSize:"0.855rem",boxSizing:"border-box",outline:"none",fontFamily:"inherit"};
const btnP={background:"#f59e0b",color:"#0f172a",border:"none",borderRadius:"8px",padding:"9px 18px",fontWeight:700,cursor:"pointer",fontSize:"0.84rem",fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:"0.05em",textTransform:"uppercase"};
const btnS={background:"transparent",color:"#94a3b8",border:"1px solid #334155",borderRadius:"8px",padding:"9px 18px",fontWeight:600,cursor:"pointer",fontSize:"0.84rem"};
const btnD={background:"transparent",color:"#ef4444",border:"1px solid #ef444455",borderRadius:"8px",padding:"9px 18px",fontWeight:600,cursor:"pointer",fontSize:"0.84rem"};

// ─── PIN Screen ───────────────────────────────────────────────────────────────
function PinScreen({ onUnlock, hasPin }) {
  const [digits,setDigits]=useState(["","","","",""]);
  const [error,setError]=useState("");
  const [shake,setShake]=useState(false);
  const ref0=useRef(),ref1=useRef(),ref2=useRef(),ref3=useRef(),ref4=useRef();
  const refs=[ref0,ref1,ref2,ref3,ref4];
  const handleDigit=(i,v)=>{
    if(!/^\d?$/.test(v))return;
    const next=[...digits]; next[i]=v; setDigits(next);
    if(v&&i<4) refs[i+1].current?.focus();
    if(next.every(d=>d!=="")){ const pin=next.join("");
      if(!hasPin||pin===loadPin()){ onUnlock(); }
      else{ setShake(true); setError("PIN incorrecto"); setTimeout(()=>{setDigits(["","","","",""]);setShake(false);setError("");refs[0].current?.focus();},700); }
    }
  };
  const handleKey=(i,e)=>{ if(e.key==="Backspace"&&!digits[i]&&i>0) refs[i-1].current?.focus(); };
  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#020b18 0%,#0a1628 100%)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Sans',sans-serif"}}>
      <div style={{textAlign:"center",padding:"40px 24px"}}>
        <div style={{background:"#f59e0b22",borderRadius:"50%",width:72,height:72,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 20px",border:"1px solid #f59e0b44"}}><IconLock/></div>
        <h2 style={{margin:"0 0 6px",fontFamily:"'Barlow Condensed',sans-serif",fontSize:"1.8rem",fontWeight:800,letterSpacing:"0.06em",textTransform:"uppercase",color:"#f1f5f9"}}>{hasPin?"Acceso Protegido":"Crear PIN"}</h2>
        <p style={{margin:"0 0 30px",fontSize:"0.84rem",color:"#64748b"}}>{hasPin?"Ingresa tu PIN de 5 dígitos":"Crea un PIN de 5 dígitos para proteger la app"}</p>
        <div style={{display:"flex",gap:10,justifyContent:"center",animation:shake?"shake 0.4s":"none"}}>
          {digits.map((d,i)=>(
            <input key={i} ref={refs[i]} type="password" inputMode="numeric" maxLength={1} value={d}
              onChange={e=>handleDigit(i,e.target.value)} onKeyDown={e=>handleKey(i,e)}
              style={{width:52,height:64,textAlign:"center",fontSize:"1.8rem",fontWeight:800,background:"#1e293b",border:`2px solid ${d?"#f59e0b":"#334155"}`,borderRadius:12,color:"#f1f5f9",outline:"none",fontFamily:"'Barlow Condensed',sans-serif",transition:"border-color 0.2s"}}/>
          ))}
        </div>
        {error&&<p style={{margin:"14px 0 0",color:"#ef4444",fontSize:"0.82rem"}}>{error}</p>}
        {!hasPin&&<><p style={{margin:"18px 0 5px",fontSize:"0.78rem",color:"#475569"}}>También puedes omitir esto</p><button style={{...btnS,marginTop:4}} onClick={onUnlock}>Continuar sin PIN</button></>}
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function DashboardTab({ data, calcZonePct, totalPct, onExportCompras }) {
  const pct=totalPct(), pctColor=pct<30?"#ef4444":pct<70?"#f59e0b":"#22c55e";
  const allItems=data.zonas.flatMap(z=>z.items||[]);
  const allMats=allItems.flatMap(i=>i.materiales||[]);
  const done=allItems.filter(i=>i.terminado===1).length;
  const highWeight=allItems.filter(i=>(i.peso||1)>=8&&!i.terminado).length;
  const totalPres=allMats.reduce((s,m)=>(parseFloat(m.precio)||0)*(parseFloat(m.cantidad)||0)+s,0);
  const gastado=allMats.filter(m=>["comprado","en_camino","entregado"].includes(m.estado)).reduce((s,m)=>(parseFloat(m.precio)||0)*(parseFloat(m.cantidad)||0)+s,0);
  const pendMats=allMats.filter(m=>!m.estado||m.estado==="pendiente").length;
  const sortedZonas=[...data.zonas].sort((a,b)=>calcZonePct(b)-calcZonePct(a));
  return (
    <div style={{display:"flex",flexDirection:"column",gap:13}}>
      <div style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:14,padding:"18px",display:"flex",alignItems:"center",gap:18}}>
        <div style={{position:"relative",flexShrink:0}}>
          <ProgressRing pct={pct} size={88} stroke={7} color={pctColor}/>
          <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
            <span style={{fontSize:"1.3rem",fontWeight:800,color:pctColor,fontFamily:"'Barlow Condensed',sans-serif",lineHeight:1}}>{pct}%</span>
            <span style={{fontSize:"0.53rem",color:"#64748b",fontWeight:700,letterSpacing:"0.05em"}}>AVANCE</span>
          </div>
        </div>
        <div style={{flex:1}}>
          <div style={{fontSize:"0.98rem",fontWeight:700,color:"#f1f5f9",marginBottom:3}}>{data.proyecto||"Obra sin nombre"}</div>
          {data.fechaInicio&&<div style={{fontSize:"0.73rem",color:"#64748b",marginBottom:2,display:"flex",alignItems:"center",gap:3}}><IconCalendar/> Inicio: {data.fechaInicio}</div>}
          <div style={{fontSize:"0.73rem",color:"#64748b"}}>{data.trabajadores.length} trabajadores · {data.zonas.length} zonas</div>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        {[["Ítems Total",allItems.length,"#7c3aed"],["Completados",done,"#22c55e"],["Pendientes",allItems.length-done,"#f59e0b"],["Críticos Pend.",highWeight,"#ef4444"]].map(([l,v,c])=>(
          <div key={l} style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:11,padding:"13px"}}>
            <div style={{fontSize:"1.65rem",fontWeight:800,color:c,fontFamily:"'Barlow Condensed',sans-serif",lineHeight:1}}>{v}</div>
            <div style={{fontSize:"0.68rem",color:"#64748b",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em",marginTop:2}}>{l}</div>
          </div>
        ))}
      </div>
      {totalPres>0&&(
        <div style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:13,padding:"15px"}}>
          <div style={{fontSize:"0.7rem",color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:11,display:"flex",alignItems:"center",gap:5}}><IconCart/> Resumen de Materiales</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:10}}>
            {[["Presupuesto","$"+fmt(totalPres),"#94a3b8"],["Comprometido","$"+fmt(gastado),"#f59e0b"],["Pend. compra",pendMats+" ítems","#ef4444"]].map(([l,v,c])=>(
              <div key={l} style={{textAlign:"center"}}>
                <div style={{fontSize:"0.95rem",fontWeight:800,color:c,fontFamily:"'Barlow Condensed',sans-serif"}}>{v}</div>
                <div style={{fontSize:"0.6rem",color:"#475569",marginTop:1}}>{l}</div>
              </div>
            ))}
          </div>
          {totalPres>0&&(
            <>
              <div style={{height:5,background:"#1e293b",borderRadius:3,overflow:"hidden",marginBottom:3}}>
                <div style={{height:"100%",width:`${Math.min(100,(gastado/totalPres)*100)}%`,background:"linear-gradient(90deg,#22c55e,#f59e0b)",borderRadius:3,transition:"width 0.6s ease"}}/>
              </div>
              <div style={{fontSize:"0.65rem",color:"#475569",marginBottom:10}}>{Math.round((gastado/totalPres)*100)}% comprometido del presupuesto</div>
            </>
          )}
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {[["pendiente","🛒 Pendientes"],["todos","📋 Todos"],["comprado","✅ Comprados"],["entregado","📦 Entregados"]].map(([f,label])=>(
              <button key={f} style={{...btnS,fontSize:"0.72rem",padding:"5px 10px",display:"flex",alignItems:"center",gap:3}} onClick={()=>onExportCompras(f)}>
                <IconDownload/> {label}
              </button>
            ))}
          </div>
        </div>
      )}
      {sortedZonas.length>0&&(
        <div style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:13,padding:"16px"}}>
          <div style={{fontSize:"0.7rem",color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:11}}>Avance por Zona</div>
          <div style={{display:"flex",flexDirection:"column",gap:11}}>
            {sortedZonas.map(z=>{
              const zp=calcZonePct(z), zc=zp<30?"#ef4444":zp<70?"#f59e0b":"#22c55e";
              return (
                <div key={z.id}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span style={{fontSize:"0.82rem",color:"#e2e8f0",fontWeight:500}}>{z.nombre}</span>
                    <span style={{fontSize:"0.82rem",fontWeight:700,color:zc,fontFamily:"'Barlow Condensed',sans-serif"}}>{zp}%</span>
                  </div>
                  <div style={{height:6,background:"#1e293b",borderRadius:3,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${zp}%`,background:zc,borderRadius:3,transition:"width 0.6s ease"}}/>
                  </div>
                  <div style={{fontSize:"0.66rem",color:"#475569",marginTop:2}}>{(z.items||[]).filter(i=>i.terminado).length}/{(z.items||[]).length} ítems</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {data.notas&&<div style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:11,padding:"13px"}}><div style={{fontSize:"0.68rem",color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5,display:"flex",alignItems:"center",gap:5}}><IconNote/> Notas</div><p style={{margin:0,fontSize:"0.83rem",color:"#94a3b8",lineHeight:1.6}}>{data.notas}</p></div>}
      {data.zonas.length===0&&<div style={{textAlign:"center",padding:"40px 20px",color:"#334155"}}><IconChart/><p style={{marginTop:12,fontSize:"0.9rem"}}>Sin datos aún.</p></div>}
    </div>
  );
}

// ─── Material Form ────────────────────────────────────────────────────────────
function MatForm({ mat, onChange }) {
  const precio=parseFloat(mat.precio)||0, cantidad=parseFloat(mat.cantidad)||0, total=precio*cantidad;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:9}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <div><label style={{fontSize:"0.73rem",color:"#64748b",display:"block",marginBottom:3}}>Material *</label><input style={inp} placeholder="Ej: Cemento Portland" value={mat.nombre||""} onChange={e=>onChange("nombre",e.target.value)}/></div>
        <div><label style={{fontSize:"0.73rem",color:"#64748b",display:"block",marginBottom:3}}>Estado</label>
          <select style={{...inp,color:"#f1f5f9"}} value={mat.estado||"pendiente"} onChange={e=>onChange("estado",e.target.value)}>
            {Object.entries(MAT_ESTADOS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
        <div><label style={{fontSize:"0.73rem",color:"#64748b",display:"block",marginBottom:3}}>Cantidad</label><input style={inp} type="number" min="0" step="any" placeholder="0" value={mat.cantidad||""} onChange={e=>onChange("cantidad",e.target.value)}/></div>
        <div><label style={{fontSize:"0.73rem",color:"#64748b",display:"block",marginBottom:3}}>Unidad</label><input style={inp} placeholder="bolsas, m², kg…" value={mat.unidad||""} onChange={e=>onChange("unidad",e.target.value)}/></div>
        <div><label style={{fontSize:"0.73rem",color:"#64748b",display:"block",marginBottom:3}}>Precio unitario</label><input style={inp} type="number" min="0" step="any" placeholder="0.00" value={mat.precio||""} onChange={e=>onChange("precio",e.target.value)}/></div>
      </div>
      {precio>0&&cantidad>0&&(
        <div style={{background:"#1e293b",borderRadius:8,padding:"7px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:"0.76rem",color:"#64748b"}}>Total estimado</span>
          <span style={{fontSize:"1rem",fontWeight:800,color:"#f59e0b",fontFamily:"'Barlow Condensed',sans-serif"}}>${fmt(total)}</span>
        </div>
      )}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <div><label style={{fontSize:"0.73rem",color:"#64748b",display:"block",marginBottom:3}}>Proveedor</label><input style={inp} placeholder="Nombre del proveedor" value={mat.proveedor||""} onChange={e=>onChange("proveedor",e.target.value)}/></div>
        <div><label style={{fontSize:"0.73rem",color:"#64748b",display:"block",marginBottom:3}}>Fecha de compra</label><input style={inp} type="date" value={mat.fechaCompra||""} onChange={e=>onChange("fechaCompra",e.target.value)}/></div>
      </div>
      <div><label style={{fontSize:"0.73rem",color:"#64748b",display:"block",marginBottom:3}}>Fecha entrega estimada</label><input style={inp} type="date" value={mat.fechaEntrega||""} onChange={e=>onChange("fechaEntrega",e.target.value)}/></div>
      <div><label style={{fontSize:"0.73rem",color:"#64748b",display:"block",marginBottom:3}}>Notas</label><input style={inp} placeholder="Especificaciones, observaciones…" value={mat.notas||""} onChange={e=>onChange("notas",e.target.value)}/></div>
    </div>
  );
}

// ─── Material Row ─────────────────────────────────────────────────────────────
function MatRow({ mat, onEdit, onDelete, onStatusChange }) {
  const est=MAT_ESTADOS[mat.estado||"pendiente"];
  const total=(parseFloat(mat.precio)||0)*(parseFloat(mat.cantidad)||0);
  return (
    <div style={{background:"#060e1a",borderTop:"1px solid #0d1526",padding:"7px 14px 7px 18px"}}>
      <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
        <span style={{width:7,height:7,borderRadius:"50%",background:est.dot,flexShrink:0,display:"inline-block"}}/>
        <span style={{flex:1,fontSize:"0.81rem",color:"#cbd5e1",fontWeight:500,minWidth:80}}>{mat.nombre}</span>
        <span style={{fontSize:"0.76rem",color:"#94a3b8",whiteSpace:"nowrap"}}>{mat.cantidad} {mat.unidad}</span>
        {mat.precio>0&&<span style={{fontSize:"0.74rem",color:"#64748b",whiteSpace:"nowrap"}}>× ${fmt(mat.precio)}</span>}
        {total>0&&<span style={{fontSize:"0.8rem",fontWeight:700,color:"#f59e0b",fontFamily:"'Barlow Condensed',sans-serif",whiteSpace:"nowrap"}}>${fmt(total)}</span>}
        <select value={mat.estado||"pendiente"} onChange={e=>onStatusChange(e.target.value)}
          style={{background:est.bg,border:`1px solid ${est.dot}44`,borderRadius:6,color:est.color,fontSize:"0.68rem",fontWeight:700,padding:"2px 6px",cursor:"pointer",outline:"none",fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:"0.04em",flexShrink:0}}>
          {Object.entries(MAT_ESTADOS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
        </select>
        <button className="btn-icon" onClick={onEdit} title="Editar"><IconEdit/></button>
        <button className="btn-icon danger" onClick={onDelete}><IconTrash/></button>
      </div>
      {(mat.proveedor||mat.fechaCompra||mat.fechaEntrega||mat.notas)&&(
        <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:3,paddingLeft:14}}>
          {mat.proveedor&&<span style={{fontSize:"0.66rem",color:"#475569"}}>🏪 {mat.proveedor}</span>}
          {mat.fechaCompra&&<span style={{fontSize:"0.66rem",color:"#475569",display:"flex",alignItems:"center",gap:2}}><IconCalendar/>{mat.fechaCompra}</span>}
          {mat.fechaEntrega&&<span style={{fontSize:"0.66rem",color:"#475569",display:"flex",alignItems:"center",gap:2}}><IconTruck/>{mat.fechaEntrega}</span>}
          {mat.notas&&<span style={{fontSize:"0.66rem",color:"#475569",fontStyle:"italic"}}>📝 {mat.notas}</span>}
        </div>
      )}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function SupervisorObra() {
  const [appReady,setAppReady]=useState(false);
  const [unlocked,setUnlocked]=useState(false);
  const [data,setData]=useState(defaultData);
  const [activeTab,setActiveTab]=useState("dashboard");
  const [expandedZones,setExpandedZones]=useState({});
  const [expandedItems,setExpandedItems]=useState({});
  const [modal,setModal]=useState(null);
  const [exporting,setExporting]=useState(null);
  const [form,setForm]=useState({});
  const [matForm,setMatForm]=useState({});
  const [dragOver,setDragOver]=useState(null);
  const [dragItem,setDragItem]=useState(null);

  // Carga datos y PIN de forma asincrona al iniciar
  useEffect(()=>{
    (async()=>{
      const [savedData, savedPin] = await Promise.all([loadDataAsync(), loadPinAsync()]);
      window.__supervisorPin = savedPin;
      setData(savedData);
      setUnlocked(!savedPin);
      setAppReady(true);
    })();
  },[]);

  // Guarda datos cuando cambian (con debounce de 300ms)
  useEffect(()=>{
    if(!appReady) return;
    const t=setTimeout(()=>saveDataAsync(data),300);
    return ()=>clearTimeout(t);
  },[data,appReady]);
  const closeModal=()=>{ setModal(null); setForm({}); setMatForm({}); };
  const showToast=(msg)=>{ setModal({type:"toast",msg}); setTimeout(()=>setModal(null),2200); };

  // ── Helpers ──
  const calcZonePct=(zona)=>{
    if(!zona.items||!zona.items.length) return 0;
    const tw=zona.items.reduce((s,i)=>s+(i.peso||1),0);
    const dw=zona.items.filter(i=>i.terminado===1).reduce((s,i)=>s+(i.peso||1),0);
    return Math.round((dw/tw)*100);
  };
  const totalPct=()=>{
    const all=data.zonas.flatMap(z=>z.items||[]);
    if(!all.length) return 0;
    const tw=all.reduce((s,i)=>s+(i.peso||1),0);
    const dw=all.filter(i=>i.terminado===1).reduce((s,i)=>s+(i.peso||1),0);
    return Math.round((dw/tw)*100);
  };
  const pct=totalPct(), pctColor=pct<30?"#ef4444":pct<70?"#f59e0b":"#22c55e";

  // ── CRUD ──
  const addZona=()=>{ if(!form.nombre?.trim())return; setData(p=>({...p,zonas:[...p.zonas,{id:generateId(),nombre:form.nombre.trim(),descripcion:form.descripcion?.trim()||"",peso:parseFloat(form.pesoZona)||1,items:[]}]})); closeModal(); };
  const editZona=()=>{ if(!form.nombre?.trim())return; setData(p=>({...p,zonas:p.zonas.map(z=>z.id===modal.zonaId?{...z,nombre:form.nombre.trim(),descripcion:form.descripcion?.trim()||"",peso:parseFloat(form.pesoZona)||1}:z)})); closeModal(); };
  const deleteZona=(id)=>setData(p=>({...p,zonas:p.zonas.filter(z=>z.id!==id),trabajadores:p.trabajadores.map(t=>t.zonaId===id?{...t,zonaId:null}:t)}));
  const addItem=(zId)=>{ if(!form.nombre?.trim())return; const ni={id:generateId(),nombre:form.nombre.trim(),descripcion:form.descripcion?.trim()||"",terminado:0,peso:parseFloat(form.peso)||1,materiales:[],fotos:[],notas:form.notas?.trim()||"",fechaInicio:form.fechaInicio||"",fechaFin:form.fechaFin||""}; setData(p=>({...p,zonas:p.zonas.map(z=>z.id===zId?{...z,items:[...z.items,ni]}:z)})); closeModal(); };
  const editItem=()=>{ if(!form.nombre?.trim())return; setData(p=>({...p,zonas:p.zonas.map(z=>z.id===modal.zonaId?{...z,items:z.items.map(i=>i.id===modal.itemId?{...i,nombre:form.nombre.trim(),descripcion:form.descripcion?.trim()||"",peso:parseFloat(form.peso)||1,notas:form.notas?.trim()||"",fechaInicio:form.fechaInicio||"",fechaFin:form.fechaFin||""}:i)}:z)})); closeModal(); };
  const deleteItem=(zId,iId)=>setData(p=>({...p,zonas:p.zonas.map(z=>z.id===zId?{...z,items:z.items.filter(i=>i.id!==iId)}:z)}));
  const toggleItem_=(zId,iId)=>setData(p=>({...p,zonas:p.zonas.map(z=>z.id===zId?{...z,items:z.items.map(i=>i.id===iId?{...i,terminado:i.terminado===1?0:1}:i)}:z)}));
  const updatePeso=(zId,iId,v)=>{ const val=Math.min(10,Math.max(1,parseFloat(v)||1)); setData(p=>({...p,zonas:p.zonas.map(z=>z.id===zId?{...z,items:z.items.map(i=>i.id===iId?{...i,peso:val}:i)}:z)})); };
  const addMaterial=(zId,iId)=>{ if(!matForm.nombre?.trim())return; const m={id:generateId(),nombre:matForm.nombre.trim(),estado:matForm.estado||"pendiente",cantidad:parseFloat(matForm.cantidad)||0,unidad:matForm.unidad?.trim()||"",precio:parseFloat(matForm.precio)||0,proveedor:matForm.proveedor?.trim()||"",fechaCompra:matForm.fechaCompra||"",fechaEntrega:matForm.fechaEntrega||"",notas:matForm.notas?.trim()||""}; setData(p=>({...p,zonas:p.zonas.map(z=>z.id===zId?{...z,items:z.items.map(i=>i.id===iId?{...i,materiales:[...(i.materiales||[]),m]}:i)}:z)})); closeModal(); };
  const editMaterial=()=>{ if(!matForm.nombre?.trim())return; const {zonaId,itemId,matId}=modal; setData(p=>({...p,zonas:p.zonas.map(z=>z.id===zonaId?{...z,items:z.items.map(i=>i.id===itemId?{...i,materiales:i.materiales.map(m=>m.id===matId?{...m,...matForm,cantidad:parseFloat(matForm.cantidad)||0,precio:parseFloat(matForm.precio)||0}:m)}:i)}:z)})); closeModal(); };
  const deleteMaterial=(zId,iId,mId)=>setData(p=>({...p,zonas:p.zonas.map(z=>z.id===zId?{...z,items:z.items.map(i=>i.id===iId?{...i,materiales:i.materiales.filter(m=>m.id!==mId)}:i)}:z)}));
  const updateMatEstado=(zId,iId,mId,estado)=>setData(p=>({...p,zonas:p.zonas.map(z=>z.id===zId?{...z,items:z.items.map(i=>i.id===iId?{...i,materiales:i.materiales.map(m=>m.id===mId?{...m,estado}:m)}:i)}:z)}));
  const addTrabajador=()=>{ if(!form.nombre?.trim())return; setData(p=>({...p,trabajadores:[...p.trabajadores,{id:generateId(),nombre:form.nombre.trim(),rol:form.rol?.trim()||"",zonaId:form.zonaId||null,telefono:form.telefono?.trim()||""}]})); closeModal(); };
  const editTrabajador=()=>{ if(!form.nombre?.trim())return; setData(p=>({...p,trabajadores:p.trabajadores.map(t=>t.id===modal.trabId?{...t,nombre:form.nombre.trim(),rol:form.rol?.trim()||"",zonaId:form.zonaId||null,telefono:form.telefono?.trim()||""}:t)})); closeModal(); };
  const deleteTrabajador=(id)=>setData(p=>({...p,trabajadores:p.trabajadores.filter(t=>t.id!==id)}));
  const addItemPhoto=(zId,iId,b64)=>setData(p=>({...p,zonas:p.zonas.map(z=>z.id===zId?{...z,items:z.items.map(i=>i.id===iId?{...i,fotos:[...(i.fotos||[]),{id:generateId(),data:b64,fecha:new Date().toLocaleDateString("es-ES")}]}:i)}:z)}));
  const deleteItemPhoto=(zId,iId,fId)=>setData(p=>({...p,zonas:p.zonas.map(z=>z.id===zId?{...z,items:z.items.map(i=>i.id===iId?{...i,fotos:(i.fotos||[]).filter(f=>f.id!==fId)}:i)}:z)}));
  const handlePhotoUpload=(zId,iId,e)=>{ const f=e.target.files[0]; if(!f)return; const r=new FileReader(); r.onload=ev=>addItemPhoto(zId,iId,ev.target.result); r.readAsDataURL(f); e.target.value=""; };

  // ── Drag (zonas) ──
  const hDragStart=(e,i)=>{ setDragItem(i); e.dataTransfer.effectAllowed="move"; };
  const hDragOver=(e,i)=>{ e.preventDefault(); setDragOver(i); };
  const hDrop=(e,i)=>{ e.preventDefault(); if(dragItem===null||dragItem===i){setDragItem(null);setDragOver(null);return;} setData(p=>{const z=[...p.zonas];const[m]=z.splice(dragItem,1);z.splice(i,0,m);return{...p,zonas:z};}); setDragItem(null);setDragOver(null); };

  // ── Drag (items) ──
  const hItemDragStart=(e,zId,i)=>{ setDragItem({zId,i}); e.dataTransfer.effectAllowed="move"; e.stopPropagation(); };
  const hItemDrop=(e,zId,i)=>{ e.preventDefault();e.stopPropagation(); if(!dragItem||dragItem.zId!==zId||dragItem.i===i){setDragItem(null);setDragOver(null);return;} setData(p=>({...p,zonas:p.zonas.map(z=>{if(z.id!==zId)return z;const items=[...z.items];const[m]=items.splice(dragItem.i,1);items.splice(i,0,m);return{...z,items};})})); setDragItem(null);setDragOver(null); };

  // ── JSON ──
  const exportJSON=()=>{ const b=new Blob([JSON.stringify(data,null,2)],{type:"application/json"}); const u=URL.createObjectURL(b); const a=document.createElement("a");a.href=u;a.download=`supervisor-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(u); };
  const importJSON=(e)=>{ const f=e.target.files[0];if(!f)return; const r=new FileReader();r.onload=ev=>{try{const p=JSON.parse(ev.target.result);if(p.zonas&&p.trabajadores){
          const fixed={...defaultData,...p,zonas:p.zonas.map(z=>({...z,items:(z.items||[]).map(i=>({...i,fotos:i.fotos||[],materiales:i.materiales||[]}))}))};
          setData(fixed);showToast("✅ Datos importados");}else showToast("❌ Archivo no válido");}catch{showToast("❌ Error al leer");}}; r.readAsText(f);e.target.value=""; };

  const doExportPDF=async()=>{ setExporting("avance"); try{await exportPDF(data,calcZonePct,totalPct);}finally{setExporting(null);} };
  const doExportCompras=async(f="todos")=>{ setExporting("compras"); try{await exportComprasPDF(data,f);}finally{setExporting(null);} };

  const toggleZone=(id)=>setExpandedZones(p=>({...p,[id]:!p[id]}));
  const toggleItem=(id)=>setExpandedItems(p=>({...p,[id]:!p[id]}));

  if(!appReady) return (
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#020b18 0%,#0a1628 100%)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Sans',sans-serif",color:"#64748b",flexDirection:"column",gap:12}}>
      <span style={{fontSize:"2rem",animation:"spin 1s linear infinite",display:"inline-block"}}>⟳</span>
      <span style={{fontSize:"0.82rem"}}>Cargando...</span>
    </div>
  );
  if(!unlocked) return <PinScreen onUnlock={()=>setUnlocked(true)} hasPin={!!loadPin()}/>;

  const tabs=[{id:"dashboard",label:"Dashboard",icon:<IconChart/>},{id:"zonas",label:"Zonas",icon:<IconZone/>},{id:"trabajadores",label:"Personal",icon:<IconHardHat/>}];

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet"/>
      <style>{`
        *{box-sizing:border-box;}body{margin:0;background:#020b18;}
        ::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-track{background:#0f172a;}::-webkit-scrollbar-thumb{background:#334155;border-radius:4px;}
        .tab-btn{background:none;border:none;cursor:pointer;padding:9px 13px;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:0.84rem;letter-spacing:0.06em;text-transform:uppercase;transition:all 0.2s;display:flex;align-items:center;gap:5px;}
        .tab-btn.active{color:#f59e0b;border-bottom:2px solid #f59e0b;}.tab-btn:not(.active){color:#64748b;border-bottom:2px solid transparent;}.tab-btn:hover:not(.active){color:#94a3b8;}
        .card{background:#0f172a;border:1px solid #1e293b;border-radius:12px;margin-bottom:9px;overflow:hidden;transition:border-color 0.2s;}.card:hover{border-color:#334155;}
        .card-header{display:flex;align-items:center;gap:11px;padding:12px 14px;cursor:pointer;}
        .badge{display:inline-flex;align-items:center;justify-content:center;padding:2px 7px;border-radius:20px;font-size:0.66rem;font-weight:700;font-family:'Barlow Condensed',sans-serif;letter-spacing:0.05em;text-transform:uppercase;}
        .btn-icon{background:none;border:1px solid #334155;border-radius:7px;color:#64748b;cursor:pointer;padding:4px 6px;display:flex;align-items:center;justify-content:center;transition:all 0.15s;}
        .btn-icon:hover{border-color:#f59e0b;color:#f59e0b;}.btn-icon.danger:hover{border-color:#ef4444;color:#ef4444;}
        .toggle-item{width:33px;height:18px;border-radius:9px;border:none;cursor:pointer;position:relative;transition:background 0.2s;display:flex;align-items:center;padding:2px;flex-shrink:0;}
        .toggle-knob{width:14px;height:14px;border-radius:50%;background:white;transition:transform 0.2s;}
        .item-row{display:flex;align-items:center;gap:7px;padding:8px 13px;flex-wrap:wrap;}
        .drag-over{border-color:#f59e0b!important;background:#f59e0b06!important;}
        input:focus,select:focus,textarea:focus{border-color:#f59e0b!important;}select{appearance:none;}textarea{resize:vertical;min-height:60px;}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .fade-in{animation:fadeIn 0.22s ease;}
      `}</style>

      <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#020b18 0%,#0a1628 100%)",fontFamily:"'DM Sans',sans-serif",color:"#f1f5f9"}}>
        {/* Header */}
        <div style={{background:"#0a1628",borderBottom:"1px solid #1e293b",padding:"0 14px"}}>
          <div style={{maxWidth:820,margin:"0 auto"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"11px 0 8px"}}>
              <div>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:1}}>
                  <div style={{background:"#f59e0b22",borderRadius:7,padding:"5px 7px",display:"flex",alignItems:"center",justifyContent:"center"}}><IconHardHat/></div>
                  <h1 style={{margin:0,fontFamily:"'Barlow Condensed',sans-serif",fontSize:"1.4rem",fontWeight:800,letterSpacing:"0.04em",textTransform:"uppercase",color:"#f1f5f9"}}>Supervisor <span style={{color:"#f59e0b"}}>de Obra</span></h1>
                </div>
                {data.proyecto&&<p style={{margin:0,fontSize:"0.7rem",color:"#64748b",marginLeft:38}}>{data.proyecto}</p>}
              </div>
              <div style={{display:"flex",alignItems:"center",gap:7}}>
                <div style={{position:"relative"}}>
                  <ProgressRing pct={pct} size={42} stroke={4} color={pctColor}/>
                  <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <span style={{fontSize:"0.6rem",fontWeight:800,color:pctColor,fontFamily:"'Barlow Condensed',sans-serif"}}>{pct}%</span>
                  </div>
                </div>
                <button className="btn-icon" onClick={()=>setModal({type:"settings",newPin:"",newPin2:""})} title="Config"><IconGear/></button>
              </div>
            </div>
            <div style={{display:"flex",borderTop:"1px solid #1e293b"}}>
              {tabs.map(t=><button key={t.id} className={`tab-btn ${activeTab===t.id?"active":""}`} onClick={()=>setActiveTab(t.id)}>{t.icon}{t.label}</button>)}
            </div>
          </div>
        </div>

        {/* Content */}
        <div style={{maxWidth:820,margin:"0 auto",padding:"13px 13px 80px"}} className="fade-in">

          {activeTab==="dashboard"&&<DashboardTab data={data} calcZonePct={calcZonePct} totalPct={totalPct} onExportCompras={doExportCompras}/>}

          {activeTab==="zonas"&&(
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:11}}>
                <span style={{fontSize:"0.74rem",color:"#64748b",textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:600}}>Zonas de trabajo</span>
                <button style={btnP} onClick={()=>setModal({type:"addZona"})}><span style={{display:"flex",alignItems:"center",gap:5}}><IconPlus/> Nueva zona</span></button>
              </div>
              {data.zonas.length===0&&<div style={{textAlign:"center",padding:"60px 20px",color:"#334155"}}><IconZone/><p style={{marginTop:12,fontSize:"0.9rem"}}>Sin zonas. ¡Crea la primera!</p></div>}
              {data.zonas.map((zona,zi)=>{
                const isOpen=expandedZones[zona.id], zPct=calcZonePct(zona), zColor=zPct<30?"#ef4444":zPct<70?"#f59e0b":"#22c55e";
                const workers=data.trabajadores.filter(t=>t.zonaId===zona.id);
                const isDO=dragOver===zi&&typeof dragItem==="number";
                const zoneMats=(zona.items||[]).flatMap(i=>i.materiales||[]);
                const zoneTotal=zoneMats.reduce((s,m)=>(parseFloat(m.precio)||0)*(parseFloat(m.cantidad)||0)+s,0);
                const zonePend=zoneMats.filter(m=>!m.estado||m.estado==="pendiente").length;
                return (
                  <div key={zona.id} className={`card${isDO?" drag-over":""}`} draggable onDragStart={e=>hDragStart(e,zi)} onDragOver={e=>hDragOver(e,zi)} onDrop={e=>hDrop(e,zi)} onDragLeave={()=>setDragOver(null)}>
                    <div className="card-header" onClick={()=>toggleZone(zona.id)}>
                      <div style={{color:"#334155",cursor:"grab",flexShrink:0}}><IconDrag/></div>
                      <div style={{position:"relative",flexShrink:0}}>
                        <ProgressRing pct={zPct} size={40} stroke={3} color={zColor}/>
                        <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                          <span style={{fontSize:"0.56rem",fontWeight:800,color:zColor,fontFamily:"'Barlow Condensed',sans-serif"}}>{zPct}%</span>
                        </div>
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:700,fontSize:"0.91rem",color:"#f1f5f9",display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
                          {zona.nombre}
                          {zona.peso&&zona.peso!==1&&<span className="badge" style={{background:"#f59e0b22",color:"#f59e0b",fontSize:"0.58rem"}}>W:{zona.peso}</span>}
                        </div>
                        {zona.descripcion&&<div style={{fontSize:"0.7rem",color:"#475569",marginTop:1}}>{zona.descripcion}</div>}
                        <div style={{display:"flex",gap:4,marginTop:3,flexWrap:"wrap"}}>
                          <span className="badge" style={{background:"#1e293b",color:"#94a3b8"}}>{(zona.items||[]).length} ítems</span>
                          {workers.length>0&&<span className="badge" style={{background:"#1e3a5f22",color:"#7dd3fc"}}>👷 {workers.length}</span>}
                          {zoneTotal>0&&<span className="badge" style={{background:"#f59e0b18",color:"#f59e0b"}}>💰 ${fmt(zoneTotal)}</span>}
                          {zonePend>0&&<span className="badge" style={{background:"#ef444418",color:"#ef4444"}}>🛒 {zonePend} pend.</span>}
                        </div>
                      </div>
                      <div style={{display:"flex",gap:3,flexShrink:0}}>
                        <button className="btn-icon" onClick={e=>{e.stopPropagation();setForm({nombre:zona.nombre,descripcion:zona.descripcion,pesoZona:zona.peso||1});setModal({type:"editZona",zonaId:zona.id});}}><IconEdit/></button>
                        <button className="btn-icon danger" onClick={e=>{e.stopPropagation();deleteZona(zona.id);}}><IconTrash/></button>
                        <IconChevron open={isOpen}/>
                      </div>
                    </div>
                    {isOpen&&(
                      <div>
                        {workers.length>0&&<div style={{padding:"4px 14px 8px",display:"flex",flexWrap:"wrap",gap:4,borderTop:"1px solid #1e293b"}}>{workers.map(w=><span key={w.id} style={{background:"#0f2027",border:"1px solid #1e3a5f",borderRadius:20,padding:"2px 9px",fontSize:"0.7rem",color:"#7dd3fc"}}>👷 {w.nombre}{w.rol?` · ${w.rol}`:""}</span>)}</div>}
                        {(!zona.items||!zona.items.length)&&<div style={{padding:"11px 14px",color:"#334155",fontSize:"0.81rem",borderTop:"1px solid #1e293b"}}>Sin ítems todavía.</div>}
                        {zona.items?.map((item,ii)=>{
                          const itemOpen=expandedItems[item.id];
                          const isIDO=dragOver===`${zona.id}-${ii}`&&dragItem?.zId===zona.id;
                          const matTotal=(item.materiales||[]).reduce((s,m)=>(parseFloat(m.precio)||0)*(parseFloat(m.cantidad)||0)+s,0);
                          const matPend=(item.materiales||[]).filter(m=>!m.estado||m.estado==="pendiente").length;
                          const mc=Object.fromEntries(Object.keys(MAT_ESTADOS).map(k=>[k,(item.materiales||[]).filter(m=>(m.estado||"pendiente")===k).length]));
                          return (
                            <div key={item.id} style={{borderTop:isIDO?"1px solid #f59e0b":"1px solid #1e293b",background:isIDO?"#f59e0b06":"transparent",transition:"background 0.15s"}}
                              draggable onDragStart={e=>hItemDragStart(e,zona.id,ii)}
                              onDragOver={e=>{e.preventDefault();e.stopPropagation();setDragOver(`${zona.id}-${ii}`);}}
                              onDrop={e=>hItemDrop(e,zona.id,ii)} onDragLeave={()=>setDragOver(null)}>
                              <div className="item-row">
                                <div style={{color:"#334155",cursor:"grab",flexShrink:0}}><IconDrag/></div>
                                <button className="toggle-item" style={{background:item.terminado?"#22c55e":"#1e293b"}} onClick={()=>toggleItem_(zona.id,item.id)}>
                                  <div className="toggle-knob" style={{transform:item.terminado?"translateX(15px)":"translateX(0)"}}/>
                                </button>
                                <div style={{flex:1,minWidth:0}}>
                                  <span style={{fontSize:"0.85rem",fontWeight:500,color:item.terminado?"#22c55e":"#e2e8f0",textDecoration:item.terminado?"line-through":"none",opacity:item.terminado?0.7:1,display:"block"}}>{item.nombre}</span>
                                  {item.descripcion&&<span style={{fontSize:"0.7rem",color:"#475569"}}>{item.descripcion}</span>}
                                  {(item.fechaInicio||item.fechaFin)&&(
                                    <div style={{display:"flex",gap:5,marginTop:1}}>
                                      {item.fechaInicio&&<span style={{fontSize:"0.64rem",color:"#475569",display:"flex",alignItems:"center",gap:2}}><IconCalendar/>{item.fechaInicio}</span>}
                                      {item.fechaFin&&<span style={{fontSize:"0.64rem",color:"#475569"}}>→{item.fechaFin}</span>}
                                    </div>
                                  )}
                                  {item.notas&&<div style={{fontSize:"0.66rem",color:"#64748b",marginTop:1,display:"flex",alignItems:"center",gap:3}}><IconNote/>{item.notas}</div>}
                                  {(item.materiales||[]).length>0&&(
                                    <div style={{display:"flex",gap:4,marginTop:3,flexWrap:"wrap"}}>
                                      {matPend>0&&<span style={{fontSize:"0.6rem",background:"#f59e0b18",color:"#f59e0b",borderRadius:10,padding:"1px 5px",fontWeight:700}}>🛒 {matPend} pend.</span>}
                                      {mc.comprado>0&&<span style={{fontSize:"0.6rem",background:"#22c55e18",color:"#22c55e",borderRadius:10,padding:"1px 5px",fontWeight:700}}>✓ {mc.comprado}</span>}
                                      {mc.en_camino>0&&<span style={{fontSize:"0.6rem",background:"#38bdf818",color:"#38bdf8",borderRadius:10,padding:"1px 5px",fontWeight:700}}>🚚 {mc.en_camino}</span>}
                                      {mc.entregado>0&&<span style={{fontSize:"0.6rem",background:"#a78bfa18",color:"#a78bfa",borderRadius:10,padding:"1px 5px",fontWeight:700}}>📦 {mc.entregado}</span>}
                                      {matTotal>0&&<span style={{fontSize:"0.6rem",background:"#1e293b",color:"#f59e0b",borderRadius:10,padding:"1px 5px",fontWeight:700,fontFamily:"'Barlow Condensed',sans-serif"}}>${fmt(matTotal)}</span>}
                                    </div>
                                  )}
                                </div>
                                <div style={{display:"flex",alignItems:"center",gap:3,background:"#1e293b",border:"1px solid #334155",borderRadius:7,padding:"2px 6px",flexShrink:0}}>
                                  <span style={{fontSize:"0.6rem",color:"#64748b",fontWeight:700}}>W</span>
                                  <input type="number" min="1" max="10" step="1" value={item.peso??1} onChange={e=>updatePeso(zona.id,item.id,e.target.value)}
                                    style={{width:24,background:"transparent",border:"none",color:(item.peso??1)>=8?"#ef4444":(item.peso??1)>=5?"#f59e0b":"#22c55e",fontWeight:800,fontSize:"0.78rem",fontFamily:"'Barlow Condensed',sans-serif",outline:"none",textAlign:"center",padding:0}}/>
                                  <span style={{fontSize:"0.56rem",color:"#334155"}}>/10</span>
                                </div>
                                <span className="badge" style={{background:item.terminado?"#14532d":"#1e293b",color:item.terminado?"#22c55e":"#64748b",flexShrink:0}}>
                                  {item.terminado?<><IconCheck/> OK</>:"—"}
                                </span>
                                <button className="btn-icon" onClick={()=>{setForm({nombre:item.nombre,descripcion:item.descripcion,peso:item.peso||1,notas:item.notas||"",fechaInicio:item.fechaInicio||"",fechaFin:item.fechaFin||""});setModal({type:"editItem",zonaId:zona.id,itemId:item.id});}}><IconEdit/></button>
                                <button className="btn-icon" onClick={()=>{setMatForm({estado:"pendiente"});setModal({type:"addMaterial",zonaId:zona.id,itemId:item.id});}} title="Agregar material" style={{position:"relative"}}>
                                  <IconBox/>
                                  {matPend>0&&<span style={{position:"absolute",top:-4,right:-4,width:13,height:13,background:"#f59e0b",borderRadius:"50%",fontSize:"0.52rem",fontWeight:800,color:"#0f172a",display:"flex",alignItems:"center",justifyContent:"center"}}>{matPend}</span>}
                                </button>
                                <label className="btn-icon" title="Foto" style={{cursor:"pointer",position:"relative"}}>
                                  <IconCamera/>
                                  {item.fotos?.length>0&&<span style={{position:"absolute",top:-4,right:-4,width:13,height:13,background:"#22c55e",borderRadius:"50%",fontSize:"0.52rem",fontWeight:800,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center"}}>{item.fotos.length}</span>}
                                  <input type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={e=>handlePhotoUpload(zona.id,item.id,e)}/>
                                </label>
                                {(item.materiales||[]).length>0&&(
                                  <button className="btn-icon" onClick={()=>toggleItem(item.id)} style={{gap:3,padding:"4px 6px"}}>
                                    <IconChevron open={itemOpen}/>
                                    <span style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:"0.72rem"}}>{item.materiales.length}</span>
                                  </button>
                                )}
                                <button className="btn-icon danger" onClick={()=>deleteItem(zona.id,item.id)}><IconTrash/></button>
                              </div>
                              {itemOpen&&(item.materiales||[]).map(mat=>(
                                <MatRow key={mat.id} mat={mat}
                                  onEdit={()=>{setMatForm({...mat});setModal({type:"editMaterial",zonaId:zona.id,itemId:item.id,matId:mat.id});}}
                                  onDelete={()=>deleteMaterial(zona.id,item.id,mat.id)}
                                  onStatusChange={s=>updateMatEstado(zona.id,item.id,mat.id,s)}/>
                              ))}
                              {item.fotos?.length>0&&(
                                <div style={{padding:"8px 13px 9px",borderTop:"1px solid #0f172a",background:"#020b18"}}>
                                  <div style={{fontSize:"0.66rem",color:"#475569",fontWeight:700,letterSpacing:"0.05em",textTransform:"uppercase",marginBottom:5,display:"flex",alignItems:"center",gap:5}}><IconPhoto/> Fotos ({item.fotos.length})</div>
                                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                                    {item.fotos.map(foto=>(
                                      <div key={foto.id} style={{position:"relative",borderRadius:7,overflow:"hidden",border:"1px solid #1e293b"}}>
                                        <img src={foto.data} alt="F" style={{width:68,height:68,objectFit:"cover",display:"block",cursor:"pointer"}} onClick={()=>setModal({type:"viewPhoto",src:foto.data,fecha:foto.fecha})}/>
                                        <div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(0,0,0,0.6)",padding:"1px 3px",fontSize:"0.53rem",color:"#94a3b8",textAlign:"center"}}>{foto.fecha}</div>
                                        <button onClick={()=>deleteItemPhoto(zona.id,item.id,foto.id)} style={{position:"absolute",top:2,right:2,background:"rgba(239,68,68,0.85)",border:"none",borderRadius:"50%",width:15,height:15,cursor:"pointer",color:"#fff",fontSize:"0.6rem",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800}}>×</button>
                                      </div>
                                    ))}
                                    <label style={{width:68,height:68,border:"1px dashed #334155",borderRadius:7,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",cursor:"pointer",gap:3,color:"#475569"}}>
                                      <IconCamera/><span style={{fontSize:"0.55rem",fontWeight:700}}>Agregar</span>
                                      <input type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={e=>handlePhotoUpload(zona.id,item.id,e)}/>
                                    </label>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        <div style={{padding:"8px 13px",borderTop:"1px solid #1e293b"}}>
                          <button style={{...btnS,fontSize:"0.74rem",padding:"5px 11px",display:"flex",alignItems:"center",gap:4}} onClick={()=>setModal({type:"addItem",zonaId:zona.id})}><IconPlus/> Agregar ítem</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {activeTab==="trabajadores"&&(
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:11}}>
                <span style={{fontSize:"0.74rem",color:"#64748b",textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:600}}>Personal de obra</span>
                <button style={btnP} onClick={()=>setModal({type:"addTrabajador"})}><span style={{display:"flex",alignItems:"center",gap:5}}><IconPlus/> Nuevo trabajador</span></button>
              </div>
              {!data.trabajadores.length&&<div style={{textAlign:"center",padding:"60px 20px",color:"#334155"}}><IconHardHat/><p style={{marginTop:12,fontSize:"0.9rem"}}>Sin trabajadores.</p></div>}
              <div style={{display:"grid",gap:7}}>
                {data.trabajadores.map(t=>{
                  const zona=data.zonas.find(z=>z.id===t.zonaId);
                  return (
                    <div key={t.id} className="card" style={{display:"flex",alignItems:"center",gap:11,padding:"11px 13px"}}>
                      <div style={{width:36,height:36,borderRadius:"50%",background:"#1e3a5f",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1rem",flexShrink:0}}>👷</div>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:600,fontSize:"0.91rem",marginBottom:2}}>{t.nombre}</div>
                        <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
                          {t.rol&&<span className="badge" style={{background:"#1e293b",color:"#94a3b8"}}>{t.rol}</span>}
                          {t.telefono&&<span style={{fontSize:"0.7rem",color:"#7dd3fc",display:"flex",alignItems:"center",gap:2}}><IconPhone/>{t.telefono}</span>}
                          {zona?<span className="badge" style={{background:"#f59e0b22",color:"#f59e0b"}}>📍 {zona.nombre} · {calcZonePct(zona)}%</span>:<span className="badge" style={{background:"#1e293b",color:"#475569"}}>Sin zona</span>}
                        </div>
                      </div>
                      <button className="btn-icon" onClick={()=>{setForm({nombre:t.nombre,rol:t.rol||"",zonaId:t.zonaId||"",telefono:t.telefono||""});setModal({type:"editTrabajador",trabId:t.id});}}><IconEdit/></button>
                      <button className="btn-icon danger" onClick={()=>deleteTrabajador(t.id)}><IconTrash/></button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── MODALS ── */}
      {(modal?.type==="addZona"||modal?.type==="editZona")&&(
        <Modal title={modal.type==="addZona"?"Nueva Zona":"Editar Zona"} onClose={closeModal}>
          <div style={{display:"flex",flexDirection:"column",gap:9}}>
            <input style={inp} placeholder="Nombre *" value={form.nombre||""} onChange={e=>setForm(p=>({...p,nombre:e.target.value}))}/>
            <input style={inp} placeholder="Descripción (opcional)" value={form.descripcion||""} onChange={e=>setForm(p=>({...p,descripcion:e.target.value}))}/>
            <div><label style={{fontSize:"0.75rem",color:"#94a3b8",display:"block",marginBottom:3}}>Peso zona (1–10)</label><input style={{...inp,width:80}} type="number" min="1" max="10" value={form.pesoZona||1} onChange={e=>setForm(p=>({...p,pesoZona:e.target.value}))}/></div>
            <div style={{display:"flex",gap:7,justifyContent:"flex-end",marginTop:4}}><button style={btnS} onClick={closeModal}>Cancelar</button><button style={btnP} onClick={modal.type==="addZona"?addZona:editZona}>{modal.type==="addZona"?"Crear":"Guardar"}</button></div>
          </div>
        </Modal>
      )}

      {(modal?.type==="addItem"||modal?.type==="editItem")&&(
        <Modal title={modal.type==="addItem"?"Nuevo Ítem":"Editar Ítem"} onClose={closeModal} wide>
          <div style={{display:"flex",flexDirection:"column",gap:9}}>
            <input style={inp} placeholder="Nombre *" value={form.nombre||""} onChange={e=>setForm(p=>({...p,nombre:e.target.value}))}/>
            <input style={inp} placeholder="Descripción" value={form.descripcion||""} onChange={e=>setForm(p=>({...p,descripcion:e.target.value}))}/>
            <textarea style={inp} placeholder="Notas / Observaciones" value={form.notas||""} onChange={e=>setForm(p=>({...p,notas:e.target.value}))}/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <div><label style={{fontSize:"0.73rem",color:"#64748b",display:"block",marginBottom:3}}>Fecha inicio</label><input style={inp} type="date" value={form.fechaInicio||""} onChange={e=>setForm(p=>({...p,fechaInicio:e.target.value}))}/></div>
              <div><label style={{fontSize:"0.73rem",color:"#64748b",display:"block",marginBottom:3}}>Fecha fin est.</label><input style={inp} type="date" value={form.fechaFin||""} onChange={e=>setForm(p=>({...p,fechaFin:e.target.value}))}/></div>
            </div>
            <div>
              <label style={{fontSize:"0.75rem",color:"#94a3b8",marginBottom:3,display:"block"}}>Peso (1–10)</label>
              <div style={{display:"flex",alignItems:"center",gap:9}}><input style={{...inp,width:66}} type="number" min="1" max="10" value={form.peso||1} onChange={e=>setForm(p=>({...p,peso:e.target.value}))}/><div style={{flex:1,fontSize:"0.66rem",color:"#64748b",display:"flex",justifyContent:"space-between"}}><span>1·Menor</span><span>5·Medio</span><span>10·Crítico</span></div></div>
              <div style={{height:4,background:"#1e293b",borderRadius:2,overflow:"hidden",marginTop:4}}><div style={{height:"100%",width:`${((parseFloat(form.peso)||1)/10)*100}%`,background:"linear-gradient(90deg,#22c55e,#f59e0b,#ef4444)",borderRadius:2,transition:"width 0.2s"}}/></div>
            </div>
            <div style={{display:"flex",gap:7,justifyContent:"flex-end",marginTop:4}}><button style={btnS} onClick={closeModal}>Cancelar</button><button style={btnP} onClick={modal.type==="addItem"?()=>addItem(modal.zonaId):editItem}>{modal.type==="addItem"?"Agregar":"Guardar"}</button></div>
          </div>
        </Modal>
      )}

      {(modal?.type==="addMaterial"||modal?.type==="editMaterial")&&(
        <Modal title={modal.type==="addMaterial"?"Agregar Material":"Editar Material"} onClose={closeModal} wide>
          <MatForm mat={matForm} onChange={(k,v)=>setMatForm(p=>({...p,[k]:v}))}/>
          <div style={{display:"flex",gap:7,justifyContent:"flex-end",marginTop:13}}><button style={btnS} onClick={closeModal}>Cancelar</button><button style={btnP} onClick={modal.type==="addMaterial"?()=>addMaterial(modal.zonaId,modal.itemId):editMaterial}>{modal.type==="addMaterial"?"Agregar":"Guardar"}</button></div>
        </Modal>
      )}

      {(modal?.type==="addTrabajador"||modal?.type==="editTrabajador")&&(
        <Modal title={modal.type==="addTrabajador"?"Nuevo Trabajador":"Editar Trabajador"} onClose={closeModal}>
          <div style={{display:"flex",flexDirection:"column",gap:9}}>
            <input style={inp} placeholder="Nombre completo *" value={form.nombre||""} onChange={e=>setForm(p=>({...p,nombre:e.target.value}))}/>
            <input style={inp} placeholder="Rol / Cargo" value={form.rol||""} onChange={e=>setForm(p=>({...p,rol:e.target.value}))}/>
            <input style={inp} placeholder="Teléfono" value={form.telefono||""} onChange={e=>setForm(p=>({...p,telefono:e.target.value}))}/>
            <select style={{...inp,color:form.zonaId?"#f1f5f9":"#64748b"}} value={form.zonaId||""} onChange={e=>setForm(p=>({...p,zonaId:e.target.value}))}>
              <option value="">Sin zona asignada</option>
              {data.zonas.map(z=><option key={z.id} value={z.id}>{z.nombre}</option>)}
            </select>
            <div style={{display:"flex",gap:7,justifyContent:"flex-end",marginTop:4}}><button style={btnS} onClick={closeModal}>Cancelar</button><button style={btnP} onClick={modal.type==="addTrabajador"?addTrabajador:editTrabajador}>{modal.type==="addTrabajador"?"Agregar":"Guardar"}</button></div>
          </div>
        </Modal>
      )}

      {modal?.type==="viewPhoto"&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}} onClick={closeModal}>
          <div style={{position:"relative",maxWidth:"92vw",maxHeight:"88vh"}} onClick={e=>e.stopPropagation()}>
            <img src={modal.src} alt="Foto" style={{maxWidth:"100%",maxHeight:"80vh",borderRadius:12,display:"block",boxShadow:"0 25px 60px rgba(0,0,0,0.8)"}}/>
            <div style={{position:"absolute",bottom:-28,left:0,right:0,textAlign:"center",fontSize:"0.74rem",color:"#64748b"}}>{modal.fecha}</div>
            <button onClick={closeModal} style={{position:"absolute",top:-12,right:-12,background:"#ef4444",border:"none",borderRadius:"50%",width:28,height:28,cursor:"pointer",color:"#fff",fontSize:"0.95rem",fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
          </div>
        </div>
      )}

      {modal?.type==="settings"&&(
        <Modal title="Configuración" onClose={closeModal} wide>
          <div style={{display:"flex",flexDirection:"column",gap:17}}>
            <div>
              <label style={{fontSize:"0.74rem",color:"#94a3b8",display:"block",marginBottom:5,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em"}}>Proyecto</label>
              <input style={{...inp,marginBottom:7}} placeholder="Nombre del proyecto" value={data.proyecto||""} onChange={e=>setData(p=>({...p,proyecto:e.target.value}))}/>
              <input style={{...inp,marginBottom:7}} type="date" value={data.fechaInicio||""} onChange={e=>setData(p=>({...p,fechaInicio:e.target.value}))}/>
              <textarea style={inp} placeholder="Notas generales" value={data.notas||""} onChange={e=>setData(p=>({...p,notas:e.target.value}))}/>
            </div>
            <div>
              <label style={{fontSize:"0.74rem",color:"#94a3b8",display:"flex",alignItems:"center",marginBottom:5,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em",gap:4}}><IconKey/> Seguridad PIN</label>
              <input style={{...inp,marginBottom:7}} type="password" inputMode="numeric" maxLength={5} placeholder={loadPin()?"Nuevo PIN (5 dígitos)":"Crear PIN (5 dígitos)"} value={modal.newPin||""} onChange={e=>{if(/^\d{0,5}$/.test(e.target.value))setModal(p=>({...p,newPin:e.target.value}));}}/>
              {modal.newPin?.length===5&&<input style={{...inp,marginBottom:7}} type="password" inputMode="numeric" maxLength={5} placeholder="Confirmar PIN" value={modal.newPin2||""} onChange={e=>{if(/^\d{0,5}$/.test(e.target.value))setModal(p=>({...p,newPin2:e.target.value}));}}/>}
              {modal.newPin?.length===5&&modal.newPin2?.length===5&&(modal.newPin===modal.newPin2?<button style={btnP} onClick={()=>{savePin(modal.newPin);window.__supervisorPin=modal.newPin;closeModal();showToast("✅ PIN guardado");}}>Guardar PIN</button>:<span style={{fontSize:"0.8rem",color:"#ef4444"}}>Los PINs no coinciden</span>)}
              {loadPin()&&<button style={{...btnD,marginTop:7,fontSize:"0.76rem",padding:"5px 11px",display:"flex",alignItems:"center",gap:4}} onClick={()=>{savePin("");window.__supervisorPin="";setModal(p=>({...p,newPin:"",newPin2:""}));showToast("🔓 PIN eliminado");}}><IconUnlock/> Quitar PIN</button>}
            </div>
            <div>
              <label style={{fontSize:"0.74rem",color:"#94a3b8",display:"block",marginBottom:7,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em"}}>Exportar / Importar</label>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                <button style={{...btnS,display:"flex",alignItems:"center",gap:4,fontSize:"0.78rem",padding:"6px 11px"}} onClick={()=>{doExportPDF();closeModal();}}>📄 PDF Avance</button>
                <button style={{...btnS,display:"flex",alignItems:"center",gap:4,fontSize:"0.78rem",padding:"6px 11px"}} onClick={()=>{doExportCompras("todos");closeModal();}}>🛒 PDF Compras</button>
                <button style={{...btnS,display:"flex",alignItems:"center",gap:4,fontSize:"0.78rem",padding:"6px 11px"}} onClick={exportJSON}><IconDownload/> JSON</button>
                <label style={{...btnS,display:"flex",alignItems:"center",gap:4,fontSize:"0.78rem",padding:"6px 11px",cursor:"pointer"}}><IconUpload/> Importar<input type="file" accept=".json" style={{display:"none"}} onChange={importJSON}/></label>
              </div>
            </div>
            <div style={{borderTop:"1px solid #1e293b",paddingTop:13}}>
              <button style={{...btnD,fontSize:"0.76rem",padding:"6px 11px"}} onClick={()=>{if(window.confirm("¿Resetear todo? No se puede deshacer.")){setData(defaultData);saveDataAsync(defaultData);closeModal();}}}>🗑️ Resetear todos los datos</button>
            </div>
          </div>
        </Modal>
      )}

      {modal?.type==="toast"&&(
        <div style={{position:"fixed",bottom:22,left:"50%",transform:"translateX(-50%)",background:"#1e293b",border:"1px solid #334155",borderRadius:11,padding:"10px 20px",fontSize:"0.86rem",color:"#f1f5f9",zIndex:2000,boxShadow:"0 8px 30px rgba(0,0,0,0.4)",animation:"fadeIn 0.25s ease",whiteSpace:"nowrap"}}>
          {modal.msg}
        </div>
      )}

      {exporting&&(
        <div style={{position:"fixed",bottom:22,right:22,background:"#1e293b",border:"1px solid #f59e0b44",borderRadius:11,padding:"9px 16px",fontSize:"0.8rem",color:"#f59e0b",zIndex:2000,display:"flex",alignItems:"center",gap:7}}>
          <span style={{animation:"spin 1s linear infinite",display:"inline-block",fontSize:"0.9rem"}}>⟳</span>
          Generando PDF…
        </div>
      )}
    </>
  );
