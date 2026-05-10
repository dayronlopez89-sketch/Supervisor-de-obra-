import { useState, useEffect } from "react";

const STORAGE_KEY = "supervisor_obra_v1";

// ── PDF Export ──────────────────────────────────────────────────────────────
async function exportPDF(data, calcZonePct, totalPct) {
  const jspdfUrl = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
  if (!window.jspdf) {
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = jspdfUrl; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const margin = 40;
  let y = margin;

  const checkPage = (need = 30) => {
    if (y + need > H - margin) { doc.addPage(); y = margin; }
  };

  // ── Header ──
  doc.setFillColor(10, 22, 40);
  doc.rect(0, 0, W, 70, "F");
  doc.setFillColor(245, 158, 11);
  doc.rect(0, 68, W, 3, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(241, 245, 249);
  doc.text("SUPERVISOR DE OBRA", margin, 30);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(148, 163, 184);
  const now = new Date();
  doc.text(`Reporte generado: ${now.toLocaleDateString("es-ES", { day:"2-digit", month:"long", year:"numeric" })} — ${now.toLocaleTimeString("es-ES", { hour:"2-digit", minute:"2-digit" })}`, margin, 48);
  // Avance total badge
  const pct = totalPct();
  doc.setFillColor(245, 158, 11);
  doc.roundedRect(W - margin - 80, 12, 80, 44, 6, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.setTextColor(15, 23, 42);
  doc.text(`${pct}%`, W - margin - 40, 36, { align: "center" });
  doc.setFontSize(8);
  doc.text("AVANCE TOTAL", W - margin - 40, 50, { align: "center" });
  
