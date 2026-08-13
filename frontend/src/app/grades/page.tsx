"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import AuthGuard from "@/components/AuthGuard";
import TopNavBar from "@/components/TopNavBar";
import Footer from "@/components/Footer";
import ConfirmModal from "@/components/ConfirmModal";
import {
  Plus,
  Edit2,
  Trash2,
  ChevronDown,
  ChevronUp,
  School,
  Users,
  FileQuestion,
  X,
  ArrowRight,
  AlertCircle,
} from "lucide-react";
import {
  Grade,
  Group,
  Quiz,
  getStoredData,
  setStoredData,
  normalizeGroup,
  normalizeQuiz,
  generateUUID,
} from "@/lib/store";
import {
  apiGetGrades,
  apiCreateGrade,
  apiDeleteGrade,
  apiGetGroups,
  apiCreateGroup,
  apiDeleteGroup,
  apiGetQuizzes,
} from "@/lib/api";

export default function GradesPage() {
  const [grades, setGrades] = useState<Grade[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Expanded grade card IDs
  const [expandedGrades, setExpandedGrades] = useState<Record<string, boolean>>({});

  // Modal State for New/Edit Grade
  const [isGradeModalOpen, setIsGradeModalOpen] = useState(false);
  const [newGradeName, setNewGradeName] = useState("");
  const [newGradeDesc, setNewGradeDesc] = useState("");
  const [editingGrade, setEditingGrade] = useState<Grade | null>(null);

  // Modal State for New Group
  const [activeGradeForGroup, setActiveGradeForGroup] = useState<Grade | null>(null);
  const [newGroupName, setNewGroupName] = useState("");

  // Custom Confirm Delete State
  const [deleteTarget, setDeleteTarget] = useState<{
    type: "grade" | "group";
    id: string;
    name: string;
  } | null>(null);

  const fetchAllData = async () => {
    try {
      const gradesData = await apiGetGrades();
      if (Array.isArray(gradesData)) {
        setGrades(gradesData);
        setStoredData("grades", gradesData);

        if (gradesData.length > 0) {
          setExpandedGrades((prev) =>
            Object.keys(prev).length === 0 ? { [gradesData[0].id]: true } : prev
          );
        }

        // Fetch groups and quizzes for all valid grades
        const groupPromises = gradesData.map((g) =>
          apiGetGroups(g.id).catch(() => [])
        );
        const quizPromises = gradesData.map((g) =>
          apiGetQuizzes(g.id).catch(() => [])
        );

        const groupsResults = await Promise.all(groupPromises);
        const quizzesResults = await Promise.all(quizPromises);

        const allGroups = groupsResults.flat().map(normalizeGroup);
        const allQuizzes = quizzesResults.flat().map(normalizeQuiz);

        setGroups(allGroups);
        setQuizzes(allQuizzes);
        setStoredData("groups", allGroups);
        setStoredData("quizzes", allQuizzes);
        return;
      }
    } catch (err: any) {
      console.warn("Backend fetch failed, using local storage:", err);
      // Filter out legacy non-UUID items from local storage
      const storedGrades = getStoredData<Grade[]>("grades", []);
      const storedGroups = getStoredData<Group[]>("groups", []).map(normalizeGroup);
      const storedQuizzes = getStoredData<Quiz[]>("quizzes", []).map(normalizeQuiz);
      setGrades(storedGrades);
      setGroups(storedGroups);
      setQuizzes(storedQuizzes);
      if (storedGrades.length > 0) {
        setExpandedGrades({ [storedGrades[0].id]: true });
      }
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  const toggleExpand = (gradeId: string) => {
    setExpandedGrades((prev) => ({
      ...prev,
      [gradeId]: !prev[gradeId],
    }));
  };

  const handleSaveGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGradeName.trim()) return;
    setErrorMessage(null);

    if (editingGrade) {
      const updated = grades.map((g) =>
        g.id === editingGrade.id
          ? { ...g, name: newGradeName.trim(), description: newGradeDesc.trim() }
          : g
      );
      setGrades(updated);
      setStoredData("grades", updated);
    } else {
      let newGrade: Grade = {
        id: generateUUID(),
        name: newGradeName.trim(),
        description: newGradeDesc.trim() || "Educación Básica",
      };

      try {
        const res = await apiCreateGrade(newGradeName.trim(), newGradeDesc.trim());
        if (res && res.id) newGrade = res;
      } catch (err: any) {
        console.error("Error creating grade:", err);
      }

      const updated = [...grades, newGrade];
      setGrades(updated);
      setStoredData("grades", updated);
      setExpandedGrades((prev) => ({ ...prev, [newGrade.id]: true }));
    }

    setIsGradeModalOpen(false);
    setNewGradeName("");
    setNewGradeDesc("");
    setEditingGrade(null);
  };

  const handleSaveGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGradeForGroup || !newGroupName.trim()) return;

    const currentGradeId = activeGradeForGroup.id;
    const name = newGroupName.trim();

    let createdGroup: Group = {
      id: generateUUID(),
      gradeId: currentGradeId,
      grade_id: currentGradeId,
      name,
      studentCount: 0,
    };

    try {
      const res = await apiCreateGroup(currentGradeId, name);
      if (res && res.id) {
        createdGroup = normalizeGroup(res);
      }
    } catch (err: any) {
      console.error("Error creating group:", err);
    }

    const updated = [...groups, createdGroup];
    setGroups(updated);
    setStoredData("groups", updated);

    // Make sure grade is expanded so user sees the new group immediately
    setExpandedGrades((prev) => ({ ...prev, [currentGradeId]: true }));

    setActiveGradeForGroup(null);
    setNewGroupName("");
  };

  const confirmDeleteAction = async () => {
    if (!deleteTarget) return;

    if (deleteTarget.type === "grade") {
      await apiDeleteGrade(deleteTarget.id).catch(() => null);
      const updatedGrades = grades.filter((g) => g.id !== deleteTarget.id);
      const updatedGroups = groups.filter(
        (g) => (g.gradeId || g.grade_id) !== deleteTarget.id
      );
      setGrades(updatedGrades);
      setGroups(updatedGroups);
      setStoredData("grades", updatedGrades);
      setStoredData("groups", updatedGroups);
    } else if (deleteTarget.type === "group") {
      await apiDeleteGroup(deleteTarget.id).catch(() => null);
      const updated = groups.filter((g) => g.id !== deleteTarget.id);
      setGroups(updated);
      setStoredData("groups", updated);
    }

    setDeleteTarget(null);
  };

  return (
    <AuthGuard>
      <div className="min-h-screen flex flex-col pt-24 pb-12 antialiased">
        <TopNavBar activeTab="grades" />

        <main className="max-w-[1120px] mx-auto px-4 md:px-8 w-full space-y-10 my-auto flex-1">
          {/* Header Section */}
          <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-4xl font-bold text-[#171818] tracking-tight mb-1">
                Gestión de Grados
              </h1>
              <p className="text-sm text-[#737373]">
                Crea los grados escolares y sus respectivos grupos (ej: 6-01, 6-02).
              </p>
            </div>

            <button
              onClick={() => {
                setEditingGrade(null);
                setNewGradeName("");
                setNewGradeDesc("");
                setIsGradeModalOpen(true);
              }}
              className="bg-[#2c2c2c] hover:bg-[#171818] text-white rounded-full px-6 py-3.5 text-xs font-semibold flex items-center gap-2 shadow-ambient transition-all active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Nuevo Grado
            </button>
          </header>

          {/* Empty State */}
          {grades.length === 0 ? (
            <div className="bg-white rounded-[2.5rem] p-12 text-center shadow-ambient border border-[#e6e2da]/40 flex flex-col items-center">
              <div className="w-16 h-16 rounded-full bg-[#ffd659]/30 flex items-center justify-center text-[#745b00] mb-4">
                <School className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-[#171818] mb-2">No hay grados registrados</h3>
              <p className="text-xs text-[#737373] max-w-sm mb-6">
                Empieza creando un grado (por ejemplo: Sexto Grado) para organizar tus grupos y cuestionarios.
              </p>
              <button
                onClick={() => {
                  setEditingGrade(null);
                  setNewGradeName("");
                  setNewGradeDesc("");
                  setIsGradeModalOpen(true);
                }}
                className="bg-[#ffd659] text-[#171818] font-bold text-xs px-6 py-3.5 rounded-full hover:bg-[#eac247] shadow-sm transition-all cursor-pointer"
              >
                + Crear Primer Grado
              </button>
            </div>
          ) : (
            /* Grade Cards Grid */
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {grades.map((grade) => {
                const gradeGroups = groups.filter(
                  (grp) => (grp.gradeId || grp.grade_id) === grade.id
                );
                const gradeQuizzes = quizzes.filter(
                  (q) => (q.gradeId || q.grade_id) === grade.id
                );
                const isExpanded = !!expandedGrades[grade.id];

                return (
                  <article
                    key={grade.id}
                    className="bg-[#fcf8f0] rounded-[2.5rem] p-7 md:p-8 shadow-ambient border border-[#e6e2da]/40 flex flex-col justify-between hover:shadow-md transition-all"
                  >
                    <div>
                      {/* Card Header */}
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h2 className="text-2xl font-bold text-[#171818] mb-2">{grade.name}</h2>
                          <div className="flex flex-wrap gap-2">
                            <span className="bg-[#ffd659] text-[#745b00] px-3.5 py-1 rounded-full text-xs font-bold shadow-xs">
                              {gradeGroups.length} {gradeGroups.length === 1 ? "Grupo" : "Grupos"}
                            </span>
                            <Link
                              href={`/grades/${grade.id}/quizzes`}
                              className="bg-[#e6e2da] hover:bg-[#d8d3c9] text-[#444748] px-3.5 py-1 rounded-full text-xs font-semibold transition-colors flex items-center gap-1"
                            >
                              <FileQuestion className="w-3.5 h-3.5" />
                              {gradeQuizzes.length} Evaluaciones
                            </Link>
                          </div>
                        </div>

                        <div className="flex gap-1.5">
                          <button
                            onClick={() => {
                              setEditingGrade(grade);
                              setNewGradeName(grade.name);
                              setNewGradeDesc(grade.description || "");
                              setIsGradeModalOpen(true);
                            }}
                            className="p-2 text-[#737373] hover:text-[#171818] hover:bg-white rounded-full transition-colors cursor-pointer"
                            title="Editar Grado"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() =>
                              setDeleteTarget({
                                type: "grade",
                                id: grade.id,
                                name: grade.name,
                              })
                            }
                            className="p-2 text-[#737373] hover:text-[#ba1a1a] hover:bg-[#ffdad6]/60 rounded-full transition-colors cursor-pointer"
                            title="Eliminar Grado"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Expanded Section */}
                      {isExpanded && (
                        <div className="mt-4 pt-4 border-t border-[#e6e2da]/60 flex flex-col gap-4 animate-fade-in">
                          <div className="flex justify-between items-center">
                            <h3 className="font-bold text-sm text-[#171818] flex items-center gap-1.5">
                              <Users className="w-4 h-4 text-[#745b00]" />
                              Grupos en {grade.name}
                            </h3>
                            <button
                              onClick={() => {
                                setNewGroupName("");
                                setActiveGradeForGroup(grade);
                              }}
                              className="text-xs font-bold text-[#745b00] hover:text-[#171818] transition-colors flex items-center gap-1 bg-[#ffd659]/30 hover:bg-[#ffd659] px-3.5 py-1.5 rounded-full cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Añadir Grupo
                            </button>
                          </div>

                          {/* Group List */}
                          {gradeGroups.length === 0 ? (
                            <div className="py-4 text-center bg-white/70 rounded-2xl border border-dashed border-[#e6e2da] p-3">
                              <p className="text-xs text-[#737373] mb-2">No hay grupos creados en este grado.</p>
                              <button
                                onClick={() => {
                                  setNewGroupName("");
                                  setActiveGradeForGroup(grade);
                                }}
                                className="text-xs font-bold text-[#171818] bg-[#ffd659] px-3 py-1 rounded-full hover:bg-[#eac247] cursor-pointer"
                              >
                                + Crear Grupo
                              </button>
                            </div>
                          ) : (
                            <ul className="flex flex-col gap-2.5">
                              {gradeGroups.map((grp) => (
                                <li
                                  key={grp.id}
                                  className="bg-white rounded-2xl p-3.5 px-4 flex justify-between items-center shadow-xs border border-[#e6e2da]/30 hover:border-[#ffd659] transition-all"
                                >
                                  <div className="flex items-center gap-3.5">
                                    <div className="w-10 h-10 rounded-full bg-[#ffd659]/25 flex items-center justify-center text-[#745b00] font-bold text-xs">
                                      {grp.name}
                                    </div>
                                    <div>
                                      <span className="font-bold text-sm text-[#171818] block">
                                        Grupo {grp.name}
                                      </span>
                                    </div>
                                  </div>

                                  <button
                                    onClick={() =>
                                      setDeleteTarget({
                                        type: "group",
                                        id: grp.id,
                                        name: `Grupo ${grp.name}`,
                                      })
                                    }
                                    className="text-[#737373] hover:text-[#ba1a1a] p-1.5 rounded-full hover:bg-[#ffdad6]/40 transition-colors cursor-pointer"
                                    title="Eliminar Grupo"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}

                          <Link
                            href={`/grades/${grade.id}/quizzes`}
                            className="mt-2 w-full py-3 rounded-full bg-[#ffd659] hover:bg-[#eac247] text-[#171818] font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all"
                          >
                            <FileQuestion className="w-4 h-4" />
                            Ver Evaluaciones de {grade.name}
                            <ArrowRight className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      )}
                    </div>

                    {/* Toggle Expand/Collapse Button */}
                    <button
                      onClick={() => toggleExpand(grade.id)}
                      className="mt-5 w-full py-2.5 rounded-full border-[1.5px] border-[#2c2c2c] text-[#2c2c2c] text-xs font-bold hover:bg-[#2c2c2c] hover:text-white transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {isExpanded ? (
                        <>
                          <span>Ocultar Grupos</span>
                          <ChevronUp className="w-4 h-4" />
                        </>
                      ) : (
                        <>
                          <span>Ver Grupos ({gradeGroups.length})</span>
                          <ChevronDown className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </main>

        {/* Modal: New / Edit Grade */}
        {isGradeModalOpen && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-ambient border border-[#e6e2da]">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-[#171818]">
                  {editingGrade ? "Editar Grado" : "Nuevo Grado"}
                </h3>
                <button
                  onClick={() => setIsGradeModalOpen(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[#737373] hover:bg-[#f0f0f0] cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveGrade} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[#444748] mb-1.5">
                    Nombre del Grado
                  </label>
                  <input
                    type="text"
                    value={newGradeName}
                    onChange={(e) => setNewGradeName(e.target.value)}
                    placeholder="Ej: Sexto Grado, Séptimo Grado"
                    required
                    autoFocus
                    className="w-full px-5 py-3 rounded-full bg-[#f0f0f0] border-2 border-transparent focus:border-[#ffd659] focus:bg-white text-sm outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#444748] mb-1.5">
                    Descripción (Opcional)
                  </label>
                  <input
                    type="text"
                    value={newGradeDesc}
                    onChange={(e) => setNewGradeDesc(e.target.value)}
                    placeholder="Ej: Educación Básica Secundaria"
                    className="w-full px-5 py-3 rounded-full bg-[#f0f0f0] border-2 border-transparent focus:border-[#ffd659] focus:bg-white text-sm outline-none transition-all"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsGradeModalOpen(false)}
                    className="flex-1 py-3 rounded-full border border-[#e6e2da] text-xs font-semibold text-[#737373] hover:bg-[#f0f0f0] cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 rounded-full bg-[#2c2c2c] hover:bg-[#171818] text-white text-xs font-semibold cursor-pointer"
                  >
                    Guardar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: New Group (Only Name/Code - No student count) */}
        {activeGradeForGroup && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-ambient border border-[#e6e2da]">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-xl font-bold text-[#171818]">Añadir Grupo</h3>
                  <p className="text-xs text-[#737373]">{activeGradeForGroup.name}</p>
                </div>
                <button
                  onClick={() => setActiveGradeForGroup(null)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[#737373] hover:bg-[#f0f0f0] cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveGroup} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[#171818] mb-1.5">
                    Nombre o Código del Grupo
                  </label>
                  <input
                    type="text"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="Ej: 6-01, 6-02, A, Grupo 1"
                    required
                    autoFocus
                    className="w-full px-5 py-3 rounded-full bg-[#f0f0f0] border-2 border-transparent focus:border-[#ffd659] focus:bg-white text-sm outline-none font-medium"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setActiveGradeForGroup(null)}
                    className="flex-1 py-3 rounded-full border border-[#e6e2da] text-xs font-semibold text-[#737373] hover:bg-[#f0f0f0] cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 rounded-full bg-[#ffd659] hover:bg-[#eac247] text-[#171818] text-xs font-bold cursor-pointer"
                  >
                    Crear Grupo
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Custom Confirmation Modal */}
        <ConfirmModal
          isOpen={!!deleteTarget}
          title={deleteTarget?.type === "grade" ? "Eliminar Grado" : "Eliminar Grupo"}
          message={
            deleteTarget?.type === "grade"
              ? `¿Estás seguro de que deseas eliminar "${deleteTarget?.name}"? Esta acción eliminará también sus grupos y cuestionarios asociados.`
              : `¿Estás seguro de que deseas eliminar el "${deleteTarget?.name}"?`
          }
          confirmText="Eliminar"
          isDestructive={true}
          onConfirm={confirmDeleteAction}
          onCancel={() => setDeleteTarget(null)}
        />

        <Footer />
      </div>
    </AuthGuard>
  );
}
