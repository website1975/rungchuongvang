
import React, { useState, useEffect } from 'react';
import ExamLibrary from './ExamLibrary';
import AdminPanel from './AdminPanel';
import TeacherManagement from './TeacherManagement';
import { Round, GameSettings, GameState, Player, AdminTab, InteractiveMechanic, QuestionType, Difficulty, DisplayChallenge } from '../types';

interface TeacherPortalProps {
  adminTab: AdminTab;
  setAdminTab: (tab: AdminTab) => void;
  playerName: string;
  teacherId: string;
  teacherMaGV?: string;
  teacherSubject?: string; 
  teacherRole?: 'ADMIN' | 'TEACHER';
  onLogout: () => void;
  examSets: any[];
  searchLibrary: string;
  setSearchLibrary: (s: string) => void;
  activeCategory: string;
  setActiveCategory: (s: string) => void;
  categories: string[];
  onLoadSet: (setId: string, title: string) => Promise<boolean>;
  onDeleteSet: (setId: string, title: string) => Promise<boolean>;
  onStartGame: (roomCode?: string) => void;
  rounds: Round[];
  setRounds: (r: Round[]) => void;
  settings: GameSettings;
  setSettings: (s: GameSettings) => void;
  currentGameState: GameState;
  onNextQuestion: () => void;
  players: Player[];
  myPlayerId: string;
  onSaveSet: (title: string, asNew: boolean, topic: string, grade: string) => Promise<void>;
  loadedSetTitle: string | null;
  loadedSetTopic?: string | null;
  loadedSetId: string | null;
  onResetToNew: () => void;
  onRefreshSets: () => void;
  isLoadingSets?: boolean;
  onLive: (setId: string, title: string) => void;
  liveSessionKey?: number;
}

const TeacherPortal: React.FC<TeacherPortalProps> = (props) => {
  // Fix: Added onStartGame to the destructuring list to resolve "Cannot find name 'onStartGame'" error.
  const { adminTab, setAdminTab, playerName, teacherId, teacherMaGV, teacherSubject, teacherRole, onLogout, examSets, searchLibrary, setSearchLibrary, activeCategory, setActiveCategory, categories, onLoadSet, onDeleteSet, onStartGame, rounds, setRounds, settings, setSettings, currentGameState, onNextQuestion, players, myPlayerId, onSaveSet, loadedSetTitle, loadedSetTopic, loadedSetId, onResetToNew, onRefreshSets, isLoadingSets, onLive, liveSessionKey } = props;

  // Tự động chuyển về CLOUD nếu tab hiện tại không hợp lệ (do xóa EDITOR)
  useEffect(() => {
    if (adminTab as any === 'EDITOR' || adminTab as any === 'LAB') {
      setAdminTab('CLOUD');
    }
  }, [adminTab, setAdminTab]);

  return (
    <div className="min-h-screen bg-slate-50 flex relative">
      <aside className="w-80 bg-slate-900 text-white p-8 flex flex-col shrink-0">
        <div className="mb-12 text-center">
          <div className="w-20 h-20 bg-gradient-to-tr from-blue-600 to-emerald-500 rounded-[2rem] flex items-center justify-center mx-auto mb-4 shadow-xl">
             <span className="text-4xl">🎓</span>
          </div>
          <h2 className="text-2xl font-black italic tracking-tighter text-white uppercase leading-none">ARENA PRO</h2>
          <div className="text-[10px] text-emerald-400 font-bold uppercase mt-2 tracking-widest">Hệ thống giáo viên</div>
        </div>
        
        <nav className="flex-1 space-y-4">
           <div className="bg-white/5 p-6 rounded-[2.5rem] border border-white/10 mb-6">
             <span className="text-[8px] font-black uppercase text-slate-500 block mb-3 tracking-widest">Tài khoản giáo viên</span>
             <div className="flex flex-col mb-4">
                <span className="text-base font-black italic text-white uppercase truncate">{playerName}</span>
                <span className="text-[9px] font-bold text-slate-400 uppercase italic mt-0.5">{teacherSubject || 'Giáo viên'}</span>
             </div>
             
             <div className="bg-blue-600/20 border-2 border-blue-500/30 rounded-2xl p-4 text-center">
                <span className="text-[8px] font-black uppercase text-blue-400 block mb-1">Mã định danh Arena</span>
                <div className="text-2xl font-black text-white tracking-widest uppercase italic">{teacherMaGV}</div>
             </div>
           </div>

           <div className="space-y-1">
              <button onClick={() => { setAdminTab('CLOUD'); }} className={`w-full text-left p-5 rounded-2xl font-black text-[11px] uppercase flex items-center gap-4 transition-all ${adminTab === 'CLOUD' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-slate-400 hover:bg-white/5'}`}>
                <span className="text-xl">📚</span> Kho đề của tôi
              </button>
              <button onClick={() => { setAdminTab('CONTROL'); }} className={`w-full text-left p-5 rounded-2xl font-black text-[11px] uppercase flex items-center gap-4 transition-all ${adminTab === 'CONTROL' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-400 hover:bg-white/5'}`}>
                <span className="text-xl">🕹️</span> Quản lý Arena
              </button>
              
              {teacherRole === 'ADMIN' && (
                <button onClick={() => { setAdminTab('MANAGEMENT'); }} className={`w-full text-left p-5 rounded-2xl font-black text-[11px] uppercase flex items-center gap-4 transition-all ${adminTab === 'MANAGEMENT' ? 'bg-amber-600 text-white shadow-lg shadow-amber-500/20' : 'text-slate-400 hover:bg-white/5'}`}>
                  <span className="text-xl">👥</span> Danh sách GV
                </button>
              )}
           </div>
        </nav>

        <button onClick={onLogout} className="mt-auto p-5 text-slate-500 font-black text-[10px] uppercase flex items-center gap-3 hover:text-white transition-colors"><span>🚪</span> Đăng xuất</button>
      </aside>

      <main className="flex-1 p-12 overflow-y-auto no-scrollbar bg-[#f8fafc]">
         <header className="flex flex-col xl:flex-row justify-between items-center gap-8 mb-16">
            <div className="flex-1 w-full text-center xl:text-left">
              <h3 className="text-7xl font-black italic uppercase text-slate-900 tracking-tighter leading-none animate-in slide-in-from-left">
                {adminTab === 'CLOUD' ? 'KHO ĐỀ' : adminTab === 'CONTROL' ? 'BẢNG ĐIỀU KHIỂN' : adminTab === 'MANAGEMENT' ? 'QUẢN LÝ GV' : 'HỆ THỐNG'}
              </h3>
              <p className="text-slate-400 font-bold italic text-base mt-4">Điều hành đấu trường trực tuyến thời gian thực</p>
            </div>
         </header>

         {adminTab === 'CLOUD' ? (
           <ExamLibrary 
             examSets={examSets} searchLibrary={searchLibrary} setSearchLibrary={setSearchLibrary} 
             activeCategory={activeCategory} setActiveCategory={setActiveCategory} categories={categories}
             onLoadSet={onLoadSet} onDeleteSet={onDeleteSet} 
             onEdit={(id, title) => { onLoadSet(id, title); setAdminTab('CONTROL'); }} // Chuyển sang control khi chọn đề
             onLive={onLive} 
             onRefresh={onRefreshSets} teacherId={teacherId} teacherSubject={teacherSubject} isLoadingSets={isLoadingSets}
           />
         ) : adminTab === 'MANAGEMENT' ? (
           <TeacherManagement />
         ) : (
           <div className="h-full">
              <AdminPanel 
                rounds={rounds} setRounds={setRounds} settings={settings} setSettings={setSettings} onStartGame={onStartGame} currentGameState={currentGameState} onNextQuestion={onNextQuestion} currentProblemIdx={0} totalProblems={rounds[0]?.problems?.length || 0} players={players} myPlayerId={myPlayerId} teacherId={teacherId} examSets={examSets} onSaveSet={onSaveSet} adminTab={adminTab as any} setAdminTab={setAdminTab as any} loadedSetTitle={loadedSetTitle} loadedSetTopic={loadedSetTopic} loadedSetId={loadedSetId} categories={categories} fullView={true} onResetToNew={onResetToNew} onLoadSet={onLoadSet} liveSessionKey={liveSessionKey}
              />
           </div>
         )}
      </main>
    </div>
  );
};

export default TeacherPortal;
