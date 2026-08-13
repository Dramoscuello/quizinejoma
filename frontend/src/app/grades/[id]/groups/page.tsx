"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import AuthGuard from "@/components/AuthGuard";
import TopNavBar from "@/components/TopNavBar";
import Footer from "@/components/Footer";
import ConfirmModal from "@/components/ConfirmModal";
import {
  ChevronRight,
  Plus,
  Users,
  Edit2,
  Trash2,
  X,
  FileQuestion,
} from "lucide-react";
import {
  Grade,
  Group,
  Quiz,
  getStoredData,
  setStoredData,
  normalizeGroup,
  generateUUID,
} from "@/lib/store";
import {
  apiGetGrades,
  apiGetGroups,
  apiCreateGroup,
  apiDeleteGroup,
  apiGetQuizzes,
} from "@/lib/api";

export default function GradeGroupsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const gradeId = resolvedParams.id;

  const [grade, setGrade] = useState<Grade | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [groupName, setGroupName] = useState("");

  // Custom Delete Confirm State
  const [groupToDelete, setGroupToDelete] = useState<{ id: string; name: string } | null>(null);

  const fetchGroupsData = async () => {
    try {
      const gradesList = await apiGetGrades();
      const found = gradesList.find((g: Grade) => g.id === gradeId);
      if (found) setGrade(found);

      const groupsData = await apiGetGroups(gradeId);
      if (Array.isArray(groupsData)) {
        const normalized = groupsData.map(normalizeGroup);
        setGroups(normalized);
      }

      const quizzesData = await apiGetQuizzes(gradeId);
      if (Array.isArray(quizzesData)) {
        setQuizzes(quizzesData);
      }
    } catch (err) {
      console.warn("Groups fetch failed, fallback:", err);
      const storedGrades = getStoredData<Grade[]>("grades", []);
      const found = storedGrades.find((g) => g.id === gradeId);
      if (found) setGrade(found);

      const storedGroups = getStoredData<Group[]>("groups", []);
      setGroups(
        storedGroups
          .filter((g) => (g.gradeId || g.grade_id) === gradeId)
          .map(normalizeGroup)
      );

      const storedQuizzes = getStoredData<Quiz[]>("quizzes", []);
      setQuizzes(storedQuizzes.filter((q) => (q.gradeId || q.grade_id) === gradeId));
    }
  };

  useEffect(() => {
    fetchGroupsData();
  }, [gradeId]);

  const handleSaveGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) return;

    const name = groupName.trim();
    let savedGroup: Group = {
      id: generateUUID(),
      gradeId,
      grade_id: gradeId,
      name,
      studentCount: 0,
    };

    try {
      const res = await apiCreateGroup(gradeId, name);
      if (res && res.id) {
        savedGroup = normalizeGroup(res);
      }
    } catch (err) {
      console.error("Error creating group:", err);
    }

    const allGroups = getStoredData<Group[]>("groups", []);
    const updated = editingGroup
      ? allGroups.map((g) => (g.id === editingGroup.id ? savedGroup : g))
      : [savedGroup, ...allGroups.filter((g) => g.id !== savedGroup.id)];

    setStoredData("groups", updated);
    setGroups(
      updated
        .filter((g) => (g.gradeId || g.grade_id) === gradeId)
        .map(normalizeGroup)
    );
    setIsModalOpen(false);
    setGroupName("");
    setEditingGroup(null);
  };

  const confirmDeleteGroupAction = async () => {
    if (!groupToDelete) return;

    await apiDeleteGroup(groupToDelete.id).catch(() => null);

    const allGroups = getStoredData<Group[]>("groups", []);
    const updated = allGroups.filter((g) => g.id !== groupToDelete.id);
    setStoredData("groups", updated);
    setGroups(
      updated
        .filter((g) => (g.gradeId || g.grade_id) === gradeId)
        .map(normalizeGroup)
    );
    setGroupToDelete(null);
  };

  return (
    <AuthGuard>
      <div className="min-h-screen flex flex-col pt-24 pb-12 antialiased">
        <TopNavBar activeTab="grades" />

        <main className="max-w-[1120px] mx-auto px-4 md:px-8 w-full space-y-8 my-auto flex-1">
          {/* Header & Breadcrumb */}
          <section className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
            <div className="space-y-2">
              <nav className="flex items-center gap-2 text-[#737373] text-xs font-medium">
                <Link href="/grades" className="hover:text-[#171818]">
                  Grados
                </Link>
                <ChevronRight className="w-3.5 h-3.5" />
                <span className="text-[#171818] font-bold">{grade?.name || "Grado"}</span>
                <ChevronRight className="w-3.5 h-3.5" />
                <span className="text-[#745b00] font-semibold bg-[#ffd659]/30 px-2.5 py-0.5 rounded-full">
                  Grupos
                </span>
              </nav>
              <h1 className="text-3xl md:text-4xl font-bold text-[#171818] tracking-tight">
                Grupos de {grade?.name || "este Grado"}
              </h1>
            </div>

            <div className="flex gap-3">
              <Link
                href={`/grades/${gradeId}/quizzes`}
                className="px-5 py-3 rounded-full bg-[#f0f0f0] hover:bg-[#e6e2da] text-[#171818] text-xs font-bold flex items-center gap-1.5 transition-all"
              >
                <FileQuestion className="w-4 h-4" />
                Ver Evaluaciones ({quizzes.length})
              </Link>
              <button
                onClick={() => {
                  setEditingGroup(null);
                  setGroupName("");
                  setIsModalOpen(true);
                }}
                className="px-6 py-3 rounded-full bg-[#2c2c2c] hover:bg-[#171818] text-white text-xs font-bold shadow-ambient flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Nuevo Grupo
              </button>
            </div>
          </section>

          {/* Groups Grid */}
          {groups.length === 0 ? (
            <div className="bg-white rounded-[2.5rem] p-12 text-center shadow-ambient border border-[#e6e2da]/40 flex flex-col items-center">
              <div className="w-14 h-14 rounded-full bg-[#ffd659]/30 flex items-center justify-center text-[#745b00] mb-3">
                <Users className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold text-[#171818] mb-1">No hay grupos en este grado</h3>
              <p className="text-xs text-[#737373] mb-5">Crea los grupos correspondientes para este nivel (ej: 6-01, 6-02, A, B).</p>
              <button
                onClick={() => {
                  setEditingGroup(null);
                  setGroupName("");
                  setIsModalOpen(true);
                }}
                className="bg-[#ffd659] text-[#171818] font-bold text-xs px-6 py-3 rounded-full hover:bg-[#eac247] cursor-pointer"
              >
                + Añadir Primer Grupo
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {groups.map((grp) => (
                <div
                  key={grp.id}
                  className="bg-white rounded-[2rem] p-6 shadow-ambient border border-[#e6e2da]/40 flex flex-col justify-between hover:shadow-md transition-all gap-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-[#ffd659]/25 text-[#745b00] font-black text-sm flex items-center justify-center">
                        {grp.name}
                      </div>
                      <div>
                        <h3 className="font-bold text-base text-[#171818]">Grupo {grp.name}</h3>
                        <p className="text-xs text-[#737373]">
                          Grado: {grade?.name}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          setEditingGroup(grp);
                          setGroupName(grp.name);
                          setIsModalOpen(true);
                        }}
                        className="p-2 text-[#737373] hover:text-[#171818] hover:bg-[#f0f0f0] rounded-full cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setGroupToDelete({ id: grp.id, name: `Grupo ${grp.name}` })}
                        className="p-2 text-[#737373] hover:text-[#ba1a1a] hover:bg-[#ffdad6]/40 rounded-full cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[#e6e2da]/30 flex justify-between items-center text-xs text-[#737373]">
                    <span>Nivel: {grade?.name}</span>
                    <span className="font-semibold text-[#166534] bg-[#dcfce7] px-2.5 py-0.5 rounded-full text-[10px]">
                      Activo
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>

        {/* Modal: New Group */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-ambient border border-[#e6e2da]">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-[#171818]">
                  {editingGroup ? "Editar Grupo" : "Nuevo Grupo"}
                </h3>
                <button
                  onClick={() => setIsModalOpen(false)}
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
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="Ej: 6-01, 6-02, A, Grupo 1"
                    required
                    autoFocus
                    className="w-full px-5 py-3 rounded-full bg-[#f0f0f0] border-2 border-transparent focus:border-[#ffd659] focus:bg-white text-sm outline-none font-medium"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 py-3 rounded-full border border-[#e6e2da] text-xs font-semibold text-[#737373] cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 rounded-full bg-[#ffd659] hover:bg-[#eac247] text-[#171818] text-xs font-bold cursor-pointer"
                  >
                    Guardar Grupo
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Custom Confirmation Modal */}
        <ConfirmModal
          isOpen={!!groupToDelete}
          title="Eliminar Grupo"
          message={`¿Estás seguro de que deseas eliminar el "${groupToDelete?.name}"?`}
          confirmText="Eliminar"
          isDestructive={true}
          onConfirm={confirmDeleteGroupAction}
          onCancel={() => setGroupToDelete(null)}
        />

        <Footer />
      </div>
    </AuthGuard>
  );
}
