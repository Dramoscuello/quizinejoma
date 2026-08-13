import * as XLSX from "xlsx";

export interface StudentScoreRow {
  rank?: number;
  name: string;
  correctCount: number;
  totalQuestions: number;
  score: number; // / 5.0
}

export function exportQuizResultsToExcel(
  pin: string,
  quizTitle: string,
  gradeName: string,
  students: StudentScoreRow[]
) {
  // Sort by score desc
  const sorted = [...students].sort((a, b) => (b.score || 0) - (a.score || 0));

  // Build rows data
  const data = sorted.map((s, index) => {
    const totalQ = s.totalQuestions > 0 ? s.totalQuestions : 1;
    const percentage = Math.round((s.correctCount / totalQ) * 100);
    const status = s.score >= 3.0 ? "Aprobado" : "Reprobado";

    return {
      "Puesto": index + 1,
      "Nombre del Estudiante": s.name,
      "Preguntas Correctas": `${s.correctCount} de ${s.totalQuestions}`,
      "Porcentaje": `${percentage}%`,
      "Nota Final (/5.0)": Number(s.score).toFixed(1),
      "Desempeño": status,
    };
  });

  // Create worksheet
  const worksheet = XLSX.utils.json_to_sheet(data);

  // Set column widths
  worksheet["!cols"] = [
    { wch: 10 }, // Puesto
    { wch: 35 }, // Nombre
    { wch: 22 }, // Correctas
    { wch: 15 }, // Porcentaje
    { wch: 20 }, // Nota
    { wch: 16 }, // Desempeño
  ];

  // Create workbook
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Resultados");

  // Format file name
  const cleanTitle = (quizTitle || "Evaluacion").replace(/[^a-zA-Z0-9_-]/g, "_");
  const dateStr = new Date().toISOString().split("T")[0];
  const fileName = `QuizInejoma_${cleanTitle}_PIN_${pin}_${dateStr}.xlsx`;

  // Download
  XLSX.writeFile(workbook, fileName);
}
