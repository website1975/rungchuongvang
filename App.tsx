
import React, { useState, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { GameState, Round, Teacher, GameSettings, AdminTab } from './types';
import { loginTeacher, fetchTeacherByMaGV, supabase, fetchAllExamSets, fetchSetData, saveExamSet, updateExamSet, deleteExamSet } from './services/supabaseService';
import TeacherPortal from './components/TeacherPortal';
import StudentArenaFlow from './components/StudentArenaFlow';
import GameEngine from './components/GameEngine';

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>('LOBBY');
  const [playerName, setPlayerName] = useState('');
  const [teacherIdInput, setTeacherIdInput] = useState('');
  const [teacherPass, setTeacherPass] = useState('');
  const [currentTeacher, setCurrentTeacher] = useState<Teacher | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  
  const [activeCategory, setActiveCategory] = useState('Tất cả');
  const [adminTab, setAdminTab] = useState<AdminTab>('CLOUD');
  const [examSets, setExamSets] = useState<any[]>([]);
  const [loadedSetTitle, setLoadedSetTitle] = useState<string | null>(null);
  const [loadedSetId, setLoadedSetId] = useState<string | null>(null);
  const [rounds, setRounds] = useState<Round[]>([{ number: 1, problems: [], description: '' }]);
  const [settings, setSettings] = useState<GameSettings>({ autoNext: false, autoNextDelay: 20, maxPlayers: 100 });
  const [matchData, setMatchData] = useState<{ setId: string, title: string, rounds: Round[], opponentName?: string, joinedRoom?: any, startIndex?: number, roomCode?: string } | null>(null);
  const [liveSessionKey, setLiveSessionKey] = useState<number>(Date.now());

  const checkAI = async () => {
    setApiStatus('checking');
    if (!process.env.API_KEY) { setApiStatus('offline'); return; }
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      await ai.models.generateContent({ 
        model: 'gemini-3-flash-preview', 
        contents: 'ping', 
        config: { maxOutputTokens: 10, thinkingConfig: { thinkingBudget: 0 } } 
      });
      setApiStatus('online');
    } catch (e) { setApiStatus('offline'); }
  };

  useEffect(() => { checkAI(); }, []);

  const refreshSets = async (tId: string) => {
    setIsLoading(true);
    try {
      const sets = await fetchAllExamSets(tId);
      setExamSets(sets);
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  };

  const handleLiveNow = async (id: string, title: string) => {
    setIsLoading(true);
    try {
      const data = await fetchSetData(id);
      setRounds(data.rounds);
      setLoadedSetId(id);
      setLoadedSetTitle(title);
      setLiveSessionKey(Date.now());
      setAdminTab('CONTROL');
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  };

  // Hàm xử lý đăng xuất an toàn
  const handleTeacherLogout = () => {
    // 1. Reset thông tin giáo viên
    setCurrentTeacher(null);
    setTeacherIdInput('');
    setTeacherPass('');
    setErrorMsg('');
    
    // 2. Reset trạng thái bộ đề và quản lý
    setLoadedSetId(null);
    setLoadedSetTitle(null);
    setExamSets([]);
    setRounds([{ number: 1, problems: [], description: '' }]);
    setAdminTab('CLOUD');
    
    // 3. Reset các key phiên làm việc
    setLiveSessionKey(Date.now());
    
    // 4. Quay về màn hình Lobby
    setGameState('LOBBY');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-900">
      {gameState === 'LOBBY' && (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="bg-white rounded-[4rem] p-12 shadow-2xl max-w-2xl w-full text-center border-b-[12px] border-blue-600 animate-in zoom-in duration-500">
            <div className="text-8xl mb-6">🔔</div>
            <h1 className="text-6xl font-black text-slate-800 mb-2 uppercase italic tracking-tighter">ĐẤU TRƯỜNG LIVE</h1>
            <p className="text-slate-400 font-bold uppercase text-[10px] mb-8 tracking-[0.3em]">Hệ Thống Rung Chuông Vàng 2.0</p>
            
            <input type="text" placeholder="Tên của bạn..." className="w-full p-6 bg-slate-50 border-4 border-slate-100 rounded-3xl font-black text-center text-2xl mb-8 outline-none focus:border-blue-600 transition-all" value={playerName} onChange={e => setPlayerName(e.target.value)} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button disabled={!playerName} onClick={() => setGameState('ENTER_CODE')} className="py-6 bg-blue-600 text-white font-black rounded-3xl uppercase italic shadow-xl text-xl hover:scale-105 active:scale-95 transition-all">Vào Thi Đấu 🎒</button>
              <button disabled={!playerName} onClick={() => setGameState('TEACHER_LOGIN')} className="py-6 bg-slate-900 text-white font-black rounded-3xl uppercase italic shadow-xl text-xl hover:scale-105 active:scale-95 transition-all">Giáo Viên 👨‍🏫</button>
            </div>
          </div>
        </div>
      )}

      {gameState === 'TEACHER_LOGIN' && (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="bg-white rounded-[4rem] p-12 shadow-2xl max-w-md w-full text-center animate-in slide-in-from-bottom-4">
            <h2 className="text-3xl font-black text-slate-800 uppercase italic mb-4">ĐĂNG NHẬP GV</h2>
            {errorMsg && <div className="mb-6 p-4 bg-red-50 text-red-500 rounded-2xl font-bold text-xs border-2 border-red-100">{errorMsg}</div>}
            <div className="space-y-4 mb-8">
               <input type="text" placeholder="MÃ GIÁO VIÊN" className="w-full p-5 bg-slate-50 border-4 border-slate-100 rounded-3xl font-black text-center text-xl uppercase outline-none focus:border-blue-600" value={teacherIdInput} onChange={e => setTeacherIdInput(e.target.value)} />
               <input type="password" placeholder="MẬT KHẨU" className="w-full p-5 bg-slate-50 border-4 border-slate-100 rounded-3xl font-black text-center text-xl outline-none focus:border-blue-600" value={teacherPass} onChange={e => setTeacherPass(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setGameState('LOBBY')} className="py-5 bg-slate-100 text-slate-400 rounded-3xl font-black uppercase italic">Hủy</button>
              <button onClick={async () => {
                const { teacher, error } = await loginTeacher(teacherIdInput, teacherPass);
                if (teacher) { setCurrentTeacher(teacher); setGameState('ADMIN'); refreshSets(teacher.id); }
                else setErrorMsg(error || 'Lỗi');
              }} className="py-5 bg-blue-600 text-white font-black rounded-3xl uppercase italic shadow-lg">ĐĂNG NHẬP</button>
            </div>
          </div>
        </div>
      )}

      {gameState === 'ADMIN' && currentTeacher && (
        <TeacherPortal 
          adminTab={adminTab} setAdminTab={setAdminTab} playerName={currentTeacher.tengv} teacherId={currentTeacher.id} 
          teacherMaGV={currentTeacher.magv} teacherSubject={currentTeacher.monday} teacherRole={currentTeacher.role} 
          onLogout={handleTeacherLogout}
          examSets={examSets} searchLibrary="" setSearchLibrary={() => {}} 
          activeCategory={activeCategory} setActiveCategory={setActiveCategory} categories={[]} 
          onLoadSet={async (id, title) => { const data = await fetchSetData(id); setRounds(data.rounds); setLoadedSetId(id); setLoadedSetTitle(title); return true; }}
          onDeleteSet={async (id) => { await deleteExamSet(id); refreshSets(currentTeacher.id); return true; }}
          onStartGame={() => {}} rounds={rounds} setRounds={setRounds} settings={settings} setSettings={setSettings}
          currentGameState={gameState} onNextQuestion={() => {}} players={[]} myPlayerId={playerName}
          onSaveSet={async (title, asNew, topic, grade) => {
            if (asNew) await saveExamSet(currentTeacher.id, title, rounds, topic, grade, currentTeacher.monday);
            else await updateExamSet(loadedSetId!, title, rounds, topic, grade, currentTeacher.id);
            refreshSets(currentTeacher.id);
          }}
          loadedSetTitle={loadedSetTitle} loadedSetTopic={null} loadedSetId={loadedSetId}
          onResetToNew={() => { setRounds([{ number: 1, problems: [], description: '' }]); setLoadedSetId(null); setLoadedSetTitle(null); }}
          onRefreshSets={() => refreshSets(currentTeacher.id)} isLoadingSets={isLoading}
          onLive={handleLiveNow}
          liveSessionKey={liveSessionKey}
        />
      )}

      {(['ENTER_CODE', 'WAITING_FOR_PLAYERS'].includes(gameState)) && (
        <StudentArenaFlow 
          gameState={gameState} setGameState={setGameState} playerName={playerName} 
          onStartMatch={(data) => { setMatchData(data); setGameState('ROUND_INTRO'); }}
        />
      )}

      {matchData && ['ROUND_INTRO', 'STARTING_ROUND', 'WAITING_FOR_BUZZER', 'ANSWERING', 'FEEDBACK', 'GAME_OVER'].includes(gameState) && (
        <GameEngine 
          gameState={gameState} 
          setGameState={setGameState} 
          playerName={playerName} 
          currentTeacher={currentTeacher || undefined} 
          matchData={matchData} 
          onExit={() => { setMatchData(null); setGameState('LOBBY'); }} 
        />
      )}
    </div>
  );
};

export default App;
