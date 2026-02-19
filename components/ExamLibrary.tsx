
import React, { useState, useMemo } from 'react';
import ConfirmModal from './ConfirmModal';
import { updateExamSetTitle } from '../services/supabaseService';

interface ExamLibraryProps {
  examSets: any[];
  searchLibrary: string;
  setSearchLibrary: (s: string) => void;
  activeCategory: string;
  setActiveCategory: (s: string) => void;
  // Fix: Add missing categories to interface
  categories: string[];
  onLoadSet: (setId: string, title: string) => Promise<boolean>;
  onDeleteSet: (setId: string, title: string) => Promise<boolean>;
  onEdit: (setId: string, title: string) => void;
  onLive: (setId: string, title: string) => void;
  onRefresh: () => void;
  teacherId: string;
  teacherSubject?: string;
  isLoadingSets?: boolean;
}

const ExamLibrary: React.FC<ExamLibraryProps> = ({
  examSets,
  searchLibrary,
  setSearchLibrary,
  activeCategory,
  setActiveCategory,
  categories,
  onLoadSet,
  onDeleteSet,
  onEdit,
  onLive,
  onRefresh,
  teacherSubject,
  isLoadingSets
}) => {
  const [deleteTarget, setDeleteTarget] = useState<{ id: string, title: string } | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ id: string, title: string } | null>(null);
  const [newName, setNewName] = useState('');
  const [showSearchInput, setShowSearchInput] = useState(false);

  const filteredExamSets = useMemo(() => {
    return examSets.filter(set => {
      const matchSearch = (set.title || "").toLowerCase().includes(searchLibrary.toLowerCase());
      if (!matchSearch) return false;
      if (activeCategory === 'Tất cả') return true;
      if (['10', '11', '12'].includes(activeCategory)) return String(set.grade) === activeCategory;
      return (set.topic && set.topic === activeCategory) || (set.title || "").toLowerCase().includes(activeCategory.toLowerCase());
    });
  }, [examSets, searchLibrary, activeCategory]);

  const handleRename = async () => {
    if (!renameTarget || !newName.trim()) return;
    try {
      await updateExamSetTitle(renameTarget.id, newName.trim());
      onRefresh();
      setRenameTarget(null);
      setNewName('');
    } catch (e) { alert("Lỗi đổi tên"); }
  };

  return (
    <div className="flex-1 flex flex-col h-full animate-in fade-in duration-500">
      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Xóa bộ đề?"
        message={`Bạn có chắc muốn xóa vĩnh viễn bộ đề "${deleteTarget?.title}"?`}
        onConfirm={() => {
          if (deleteTarget) onDeleteSet(deleteTarget.id, deleteTarget.title);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
        isDestructive={true}
      />

      <div className="mb-12 flex flex-wrap items-center gap-4">
        <button onClick={() => setShowSearchInput(!showSearchInput)} className={`w-16 h-16 rounded-full flex items-center justify-center shadow-xl border-4 ${showSearchInput ? 'bg-slate-900 text-white border-slate-800' : 'bg-white text-slate-400 border-slate-50'}`}><span className="text-xl">🔍</span></button>
        <div className="flex flex-wrap gap-4">
          {['Tất cả', '10', '11', '12'].map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)} className={`px-10 py-5 rounded-full font-black text-xs uppercase italic transition-all shadow-xl border-4 ${activeCategory === cat ? 'bg-yellow-500 text-slate-900 border-yellow-400 scale-105' : 'bg-white text-slate-400 border-slate-50 hover:border-yellow-200'}`}>{cat === 'Tất cả' ? cat : `KHỐI ${cat}`}</button>
          ))}
          <button onClick={onRefresh} className={`w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center shadow-xl border-4 border-emerald-100 hover:bg-emerald-600 hover:text-white transition-all ${isLoadingSets ? 'animate-spin' : ''}`}><span className="text-xl">🔄</span></button>
        </div>
        {showSearchInput && (
          <div className="flex-1 min-w-[300px] animate-in slide-in-from-left-4">
             <input type="text" placeholder="Tìm kiếm bộ đề..." className="w-full px-8 py-5 bg-white border-4 border-slate-50 rounded-full shadow-xl text-xs font-black uppercase italic outline-none focus:border-yellow-200" value={searchLibrary} onChange={e => setSearchLibrary(e.target.value)} autoFocus />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 overflow-y-auto no-scrollbar pb-20">
        {isLoadingSets ? (
          <div className="col-span-full py-40 text-center flex flex-col items-center justify-center"><div className="w-16 h-16 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mb-4"></div><p className="font-black uppercase italic text-slate-400">Đang đồng bộ...</p></div>
        ) : filteredExamSets.length > 0 ? filteredExamSets.map(set => (
          <div key={set.id} className="bg-white p-8 rounded-[3.5rem] border-4 border-slate-50 shadow-2xl hover:border-yellow-100 transition-all flex flex-col group relative overflow-hidden">
             <div className="flex items-center gap-2 mb-4">
                <span className="px-3 py-1 bg-yellow-500 text-slate-900 text-[9px] font-black uppercase rounded-lg shadow-sm">{set.topic || 'BÀI TẬP'}</span>
                <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">K{set.grade || '10'}</span>
             </div>

             <h4 className="text-2xl font-black text-slate-800 uppercase italic mb-8 line-clamp-2 leading-tight">{set.title}</h4>
             
             <div className="grid grid-cols-2 gap-3 mb-10">
                <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100 flex flex-col items-center"><div className="text-[9px] font-black text-slate-400 uppercase mb-1">Cấu trúc</div><div className="text-xl font-black text-slate-700 italic leading-none">{set.round_count || 1} <span className="text-[10px] uppercase">vòng</span></div></div>
                <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100 flex flex-col items-center"><div className="text-[9px] font-black text-slate-400 uppercase mb-1">Câu hỏi</div><div className="text-xl font-black text-slate-700 italic leading-none">{set.question_count || 0}</div></div>
             </div>

             <div className="mt-auto flex flex-col gap-2 pt-4 border-t-2 border-slate-50">
                <button onClick={() => onLive(set.id, set.title)} className="w-full py-5 bg-slate-900 text-white hover:bg-black rounded-2xl font-black uppercase italic transition-all text-sm flex items-center justify-center gap-3 shadow-lg border-b-8 border-slate-700 active:translate-y-1 active:border-b-4"><span className="text-xl">🔔</span> MỞ SHOW LIVE</button>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => onEdit(set.id, set.title)} className="py-4 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white border-2 border-blue-100 rounded-[1.2rem] font-black uppercase italic transition-all text-[10px]">Sửa đề</button>
                  <button onClick={() => setDeleteTarget({ id: set.id, title: set.title })} className="py-4 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white border-2 border-red-100 rounded-[1.2rem] font-black uppercase italic transition-all text-[10px]">Xóa</button>
                </div>
             </div>
          </div>
        )) : (
          <div className="col-span-full py-40 text-center opacity-30"><p className="font-black uppercase italic text-2xl text-slate-400">Kho đề trống</p></div>
        )}
      </div>
    </div>
  );
};

export default ExamLibrary;
