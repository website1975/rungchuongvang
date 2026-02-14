
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Question, GameStatus, GameState, Student, MessageType, ExplanationMode, DrawingPath } from './types';
import { generateQuestions, getDeepExplanation } from './services/geminiService';
import Timer from './components/Timer';
import Whiteboard from './components/Whiteboard';

const MathContent: React.FC<{ content: string }> = ({ content }) => {
  const containerRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (containerRef.current && (window as any).katex) {
      const parts = content.split(/(\$.*?\$)/g);
      const html = parts.map(part => {
        if (part.startsWith('$') && part.endsWith('$')) {
          const latex = part.slice(1, -1);
          try {
            return (window as any).katex.renderToString(latex, { throwOnError: false });
          } catch (e) { return part; }
        }
        return part;
      }).join('');
      containerRef.current.innerHTML = html;
    }
  }, [content]);
  return <span ref={containerRef}>{content}</span>;
};

const INITIAL_TIMER = 15;
const CHANNEL_NAME = 'rung_chuong_vang_pro';

const SAMPLE_QUESTIONS: Question[] = [
  { id: 1, content: "Tính $x$ trong phương trình: $2x + 5 = 15$", options: ["$x=5$", "$x=10$", "$x=20$", "$x=7,5$"], correctAnswer: 0, difficulty: 'Easy', explanation: "Ta có $2x = 10 \\Rightarrow x = 5$." },
  { id: 2, content: "Định luật Vạn vật hấp dẫn của Newton có công thức là gì?", options: ["$F = m.a$", "$F = G \\frac{m_1 m_2}{r^2}$", "$P = m.g$", "$W = F.s$"], correctAnswer: 1, difficulty: 'Medium', explanation: "Lực hấp dẫn tỉ lệ thuận với tích hai khối lượng và tỉ lệ nghịch với bình phương khoảng cách." },
  { id: 3, content: "Đơn vị của hiệu điện thế là gì?", options: ["Ampe (A)", "Ohm (Ω)", "Volt (V)", "Watt (W)"], correctAnswer: 2, difficulty: 'Easy', explanation: "Volt (V) là đơn vị đo hiệu điện thế." },
  { id: 4, content: "Trong tam giác vuông, bình phương cạnh huyền bằng tổng bình phương hai cạnh góc vuông là định lý nào?", options: ["Thales", "Pytago", "Euclid", "Newton"], correctAnswer: 1, difficulty: 'Easy', explanation: "Đây là định lý Pytago nổi tiếng." }
];

const App: React.FC = () => {
  const [role, setRole] = useState<'SELECT' | 'TEACHER' | 'STUDENT'>('SELECT');
  const [studentName, setStudentName] = useState('');
  const [myId] = useState(() => 'stu_' + Math.random().toString(36).substr(2, 5));
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  
  const [gameState, setGameState] = useState<GameState>({
    questions: [],
    currentQuestionIndex: -1,
    status: GameStatus.LOBBY,
    timer: INITIAL_TIMER,
    isTimerRunning: false,
    buzzedStudentId: null,
    explanationMode: 'TEXT',
    whiteboardPaths: []
  });

  const [students, setStudents] = useState<Student[]>([]);
  const [topic, setTopic] = useState('Toán Lý Cơ Bản');
  const bc = useRef<BroadcastChannel | null>(null);
  const timerInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const gameStateRef = useRef(gameState);
  const studentsRef = useRef(students);
  const roleRef = useRef(role);
  const myIdRef = useRef(myId);

  useEffect(() => {
    gameStateRef.current = gameState;
    studentsRef.current = students;
    roleRef.current = role;
    myIdRef.current = myId;
  }, [gameState, students, role, myId]);

  const sendSync = useCallback((state: GameState, stus: Student[]) => {
    bc.current?.postMessage({ type: 'SYNC_STATE', state, students: stus });
  }, []);

  useEffect(() => {
    bc.current = new BroadcastChannel(CHANNEL_NAME);
    bc.current.onmessage = (event: MessageEvent<MessageType>) => {
      const msg = event.data;
      const currentRole = roleRef.current;
      switch (msg.type) {
        case 'REQUEST_SYNC':
          if (currentRole === 'TEACHER') sendSync(gameStateRef.current, studentsRef.current);
          break;
        case 'SYNC_STATE':
          if (currentRole === 'STUDENT') {
            setGameState(msg.state);
            if (msg.students) setStudents(msg.students);
          }
          break;
        case 'STUDENT_JOIN':
          if (currentRole === 'TEACHER') {
            setStudents(prev => {
              if (prev.find(s => s.id === msg.student.id)) return prev;
              const newStus = [...prev, msg.student];
              sendSync(gameStateRef.current, newStus);
              return newStus;
            });
          }
          break;
        case 'STUDENT_BUZZ':
          if (currentRole === 'TEACHER' && gameStateRef.current.isTimerRunning && !gameStateRef.current.buzzedStudentId) {
            handleStudentBuzz(msg.studentId);
          }
          break;
        case 'STUDENT_ANSWER':
          if (currentRole === 'TEACHER') handleStudentAnswer(msg.studentId, msg.optionIndex);
          break;
        case 'DRAW':
          if (currentRole === 'STUDENT') {
            setGameState(prev => ({ ...prev, whiteboardPaths: [...prev.whiteboardPaths, msg.path] }));
          }
          break;
        case 'CLEAR_CANVAS':
          if (currentRole === 'STUDENT') {
            setGameState(prev => ({ ...prev, whiteboardPaths: [] }));
          }
          break;
        case 'SET_EXPLANATION_MODE':
          if (currentRole === 'STUDENT') {
            setGameState(prev => ({ ...prev, explanationMode: msg.mode }));
          }
          break;
      }
    };
    if (role !== 'SELECT') bc.current.postMessage({ type: 'REQUEST_SYNC' });
    return () => bc.current?.close();
  }, [role, sendSync]);

  const handleStudentBuzz = (id: string) => {
    if (timerInterval.current) clearInterval(timerInterval.current);
    const newState = { ...gameStateRef.current, buzzedStudentId: id, isTimerRunning: false };
    const newStus = studentsRef.current.map(s => s.id === id ? { ...s, status: 'answering' as const } : s);
    setGameState(newState);
    setStudents(newStus);
    sendSync(newState, newStus);
  };

  const handleStudentAnswer = (id: string, optionIndex: number) => {
    const currentQ = gameStateRef.current.questions[gameStateRef.current.currentQuestionIndex];
    const isCorrect = currentQ.correctAnswer === optionIndex;
    
    if (isCorrect) {
      const newStus = studentsRef.current.map(s => s.id === id ? { ...s, status: 'correct' as const, score: s.score + 10 } : s);
      const newState = { ...gameStateRef.current, status: GameStatus.EXPLAINING };
      setGameState(newState);
      setStudents(newStus);
      sendSync(newState, newStus);
    } else {
      const newStus = studentsRef.current.map(s => s.id === id ? { ...s, status: 'wrong' as const, failedCurrentQuestion: true } : s);
      const newState = { ...gameStateRef.current, buzzedStudentId: null };
      setGameState(newState);
      setStudents(newStus);
      sendSync(newState, newStus);
      if (newState.timer > 0) resumeTimer();
    }
  };

  const resumeTimer = () => {
    if (timerInterval.current) clearInterval(timerInterval.current);
    setGameState(prev => ({ ...prev, isTimerRunning: true }));
    timerInterval.current = setInterval(() => {
      setGameState(prev => {
        if (prev.timer <= 1) {
          clearInterval(timerInterval.current!);
          const timedOut = { ...prev, timer: 0, isTimerRunning: false };
          sendSync(timedOut, studentsRef.current);
          return timedOut;
        }
        return { ...prev, timer: prev.timer - 1 };
      });
    }, 1000);
  };

  const startTimer = () => {
    if (timerInterval.current) clearInterval(timerInterval.current);
    const newState = { ...gameState, isTimerRunning: true, buzzedStudentId: null, timer: INITIAL_TIMER, status: GameStatus.PLAYING };
    setGameState(newState);
    sendSync(newState, students);
    resumeTimer();
  };

  const handleStartGameAI = async () => {
    setLoading(true);
    try {
      const qs = await generateQuestions(topic);
      if (qs.length > 0) startGame(qs);
    } catch(e) {
      alert("Lỗi AI: " + (e as Error).message + ". Vui lòng dùng bộ đề mẫu.");
    } finally { setLoading(false); }
  };

  const startGame = (qs: Question[]) => {
    const newState: GameState = {
      questions: qs,
      currentQuestionIndex: 0,
      status: GameStatus.PLAYING,
      timer: INITIAL_TIMER,
      isTimerRunning: false,
      buzzedStudentId: null,
      explanationMode: 'TEXT',
      whiteboardPaths: []
    };
    setGameState(newState);
    const resetStus: Student[] = students.map(s => ({ ...s, failedCurrentQuestion: false, status: 'online' as const }));
    setStudents(resetStus);
    sendSync(newState, resetStus);
  };

  const nextQuestion = () => {
    const nextIdx = gameState.currentQuestionIndex + 1;
    if (nextIdx >= gameState.questions.length) {
      const finished = { ...gameState, status: GameStatus.FINISHED };
      setGameState(finished);
      sendSync(finished, students);
      return;
    }
    const newState = { ...gameState, currentQuestionIndex: nextIdx, status: GameStatus.PLAYING, timer: INITIAL_TIMER, isTimerRunning: false, buzzedStudentId: null, whiteboardPaths: [] };
    setGameState(newState);
    const resetStus: Student[] = students.map(s => ({ ...s, failedCurrentQuestion: false, status: 'online' as const }));
    setStudents(resetStus);
    sendSync(newState, resetStus);
  };

  const setExplanationMode = (mode: ExplanationMode) => {
    setGameState(p => {
      const newState = { ...p, explanationMode: mode };
      bc.current?.postMessage({ type: 'SET_EXPLANATION_MODE', mode });
      return newState;
    });
  };

  const onTeacherDraw = (path: DrawingPath) => {
    setGameState(prev => {
      const newState = { ...prev, whiteboardPaths: [...prev.whiteboardPaths, path] };
      bc.current?.postMessage({ type: 'DRAW', path });
      return newState;
    });
  };

  const onTeacherClear = () => {
    setGameState(prev => ({ ...prev, whiteboardPaths: [] }));
    bc.current?.postMessage({ type: 'CLEAR_CANVAS' });
  };

  const submitAnswer = () => {
    if (selectedOption === null) return;
    bc.current?.postMessage({ type: 'STUDENT_ANSWER', studentId: myId, optionIndex: selectedOption });
    setSelectedOption(null);
  };

  if (role === 'SELECT') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl max-w-md w-full border-t-[12px] border-red-600 animate-fade-in text-center">
          <i className="fas fa-bell text-7xl text-yellow-500 mb-6 bell-shake"></i>
          <h1 className="text-4xl font-bungee text-red-800 tracking-tighter mb-2">RUNG CHUÔNG VÀNG</h1>
          <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-8">Professional Game Show</p>
          <div className="space-y-4">
            <button onClick={() => setRole('TEACHER')} className="w-full bg-red-600 p-5 rounded-2xl hover:bg-red-700 transition-all text-white font-bungee text-lg shadow-xl active:scale-95">GIÁO VIÊN</button>
            <div className="bg-yellow-50 p-6 rounded-2xl border-2 border-yellow-200">
              <input type="text" placeholder="Tên học sinh..." className="w-full p-4 border-2 border-gray-300 rounded-xl mb-3 outline-none focus:border-yellow-500 font-bold text-center" value={studentName} onChange={e => setStudentName(e.target.value)} />
              <button onClick={() => { if(studentName.trim()) setRole('STUDENT'); }} disabled={!studentName.trim()} className="w-full bg-yellow-500 text-white font-bungee p-4 rounded-xl shadow-lg hover:bg-yellow-600 disabled:opacity-50">VÀO THI</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const currentQ = gameState.questions[gameState.currentQuestionIndex];
  const buzzedStudent = students.find(s => s.id === gameState.buzzedStudentId);
  const myStatus = students.find(s => s.id === myId);

  return (
    <div className="h-screen flex flex-col bg-gray-100 overflow-hidden font-montserrat">
      <header className={`${role === 'TEACHER' ? 'red-gradient' : 'gold-gradient'} p-4 text-white shadow-xl flex justify-between items-center z-30`}>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center text-2xl shadow-inner"><i className={`fas ${role === 'TEACHER' ? 'fa-chalkboard-teacher' : 'fa-user-graduate'}`}></i></div>
          <div>
            <h2 className="font-bungee text-lg leading-none">{role === 'TEACHER' ? 'Teacher Dashboard' : studentName}</h2>
            <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest">{role === 'TEACHER' ? 'Live Admin' : `Hạng: ${students.sort((a,b)=>b.score-a.score).findIndex(s=>s.id===myId)+1} • ${myStatus?.score || 0}đ`}</p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="bg-black/20 px-6 py-2 rounded-2xl border border-white/10 flex flex-col items-center min-w-[100px]">
            <span className="text-[9px] font-black opacity-60 uppercase">THỜI GIAN</span>
            <span className="font-bungee text-2xl leading-none">{gameState.timer}s</span>
          </div>
          <button onClick={() => setRole('SELECT')} className="bg-white/10 hover:bg-white/30 w-10 h-10 rounded-xl flex items-center justify-center transition-all"><i className="fas fa-power-off"></i></button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* PANEL TRÁI: Câu hỏi & Bảng trắng */}
        <section className="flex-1 bg-white flex flex-col overflow-hidden relative border-r-4 border-gray-200">
          <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
            <div className="flex gap-2">
              <button onClick={() => setExplanationMode('TEXT')} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${gameState.explanationMode === 'TEXT' ? 'bg-red-600 text-white shadow-lg' : 'bg-white text-gray-500 hover:bg-gray-100'}`}><i className="fas fa-align-left mr-2"></i> VĂN BẢN</button>
              <button onClick={() => setExplanationMode('WHITEBOARD')} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${gameState.explanationMode === 'WHITEBOARD' ? 'bg-red-600 text-white shadow-lg' : 'bg-white text-gray-500 hover:bg-gray-100'}`}><i className="fas fa-chalkboard mr-2"></i> BẢNG TRẮNG</button>
              <button onClick={() => setExplanationMode('VOICE')} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${gameState.explanationMode === 'VOICE' ? 'bg-red-600 text-white shadow-lg' : 'bg-white text-gray-500 hover:bg-gray-100'}`}><i className="fas fa-microphone mr-2"></i> GIỌNG NÓI</button>
            </div>
            {role === 'TEACHER' && (
              <div className="flex gap-2">
                {gameState.status === GameStatus.LOBBY ? (
                  <>
                    <button onClick={() => startGame(SAMPLE_QUESTIONS)} className="bg-blue-600 text-white px-4 py-2 rounded-xl font-bungee text-xs shadow-md hover:bg-blue-700">DÙNG BỘ ĐỀ MẪU</button>
                    <button onClick={handleStartGameAI} disabled={loading} className="bg-purple-600 text-white px-4 py-2 rounded-xl font-bungee text-xs shadow-md hover:bg-purple-700">{loading ? 'AI ĐANG SOẠN...' : 'SOẠN BẰNG AI'}</button>
                  </>
                ) : (
                  <button onClick={nextQuestion} className="bg-orange-600 text-white px-6 py-2 rounded-xl font-bungee text-sm shadow-md">CÂU TIẾP THEO</button>
                )}
              </div>
            )}
          </div>

          <div className="flex-1 p-8 overflow-y-auto">
            {gameState.explanationMode === 'WHITEBOARD' ? (
              <Whiteboard 
                paths={gameState.whiteboardPaths} 
                isTeacher={role === 'TEACHER'} 
                onDraw={onTeacherDraw} 
                onClear={onTeacherClear}
                isVoiceActive={role === 'TEACHER'}
              />
            ) : (
              <div className="max-w-4xl mx-auto space-y-10 animate-fade-in h-full">
                {currentQ ? (
                  <div className="flex flex-col gap-8">
                    <div className="inline-block bg-yellow-400 px-6 py-2 rounded-full text-sm font-black text-red-900 shadow-sm uppercase tracking-wider self-start">CÂU HỎI {gameState.currentQuestionIndex + 1}</div>
                    <h2 className="text-4xl md:text-6xl font-bold text-gray-800 leading-tight border-l-8 border-red-600 pl-8"><MathContent content={currentQ.content} /></h2>
                    
                    {gameState.status === GameStatus.EXPLAINING && (
                      <div className="bg-purple-50 p-10 rounded-[3rem] border-4 border-purple-200 shadow-xl animate-fade-in mt-10">
                        <div className="flex items-center gap-4 mb-6"><i className="fas fa-graduation-cap text-4xl text-purple-600"></i><h4 className="font-bungee text-purple-800 text-2xl uppercase">GIẢI THÍCH CHI TIẾT</h4></div>
                        <div className="text-2xl text-gray-700 leading-relaxed font-medium"><MathContent content={currentQ.explanation} /></div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center opacity-40 text-center py-20 grayscale">
                    <i className="fas fa-satellite-dish text-[10rem] mb-6 animate-pulse"></i>
                    <h2 className="text-3xl font-bungee text-gray-600">ĐANG CHỜ TÍN HIỆU TỪ GIÁO VIÊN</h2>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* PANEL PHẢI: Tương tác (Chuông / Danh sách) */}
        <section className={`w-96 ${role === 'TEACHER' ? 'bg-gray-50' : 'gold-gradient'} p-6 flex flex-col border-l-4 border-gray-200 z-20 shadow-[-10px_0_30px_rgba(0,0,0,0.05)]`}>
          {role === 'TEACHER' ? (
            <div className="flex flex-col h-full">
              <div className="flex justify-between items-center mb-6 border-b pb-4">
                <h3 className="font-black text-gray-800 flex items-center gap-2 uppercase tracking-tighter"><i className="fas fa-users text-red-600"></i> THÍ SINH ONLINE</h3>
                <span className="bg-red-100 px-3 py-1 rounded-lg shadow-sm font-bold text-xs text-red-600">{students.length} BẠN</span>
              </div>
              <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                {students.length === 0 && <div className="text-center py-10 italic text-gray-400">Chưa có ai tham gia...</div>}
                {students.sort((a,b) => b.score - a.score).map((s, idx) => (
                  <div key={s.id} className={`p-4 rounded-2xl border-2 transition-all duration-300 ${s.status === 'answering' ? 'border-blue-500 bg-blue-50 ring-4 ring-blue-100 scale-105 shadow-xl' : s.failedCurrentQuestion ? 'bg-gray-100 border-gray-200 opacity-60' : 'bg-white border-transparent shadow-md'}`}>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-xs font-bold text-gray-600">#{idx+1}</span>
                        <span className="font-bold text-gray-800 text-sm truncate max-w-[120px]">{s.name}</span>
                      </div>
                      <span className="font-bungee text-red-600 text-lg">{s.score}đ</span>
                    </div>
                    {s.status === 'answering' && (
                      <div className="mt-4 flex gap-2">
                        <button onClick={() => handleStudentAnswer(s.id, currentQ.correctAnswer)} className="flex-1 bg-green-500 hover:bg-green-600 text-white font-bold py-2 rounded-xl text-xs transition-colors"><i className="fas fa-check mr-1"></i> ĐÚNG</button>
                        <button onClick={() => handleStudentAnswer(s.id, -1)} className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-2 rounded-xl text-xs transition-colors"><i className="fas fa-times mr-1"></i> SAI</button>
                      </div>
                    )}
                    {s.failedCurrentQuestion && (
                      <div className="mt-2 text-[10px] text-red-500 font-black uppercase flex items-center gap-1"><i className="fas fa-lock text-[8px]"></i> ĐÃ SAI & BỊ KHÓA</div>
                    )}
                  </div>
                ))}
              </div>
              <div className="pt-6 mt-6 border-t">
                {gameState.status !== GameStatus.LOBBY && (
                  <button onClick={startTimer} className="w-full bg-green-600 text-white font-bungee p-5 rounded-2xl shadow-xl hover:bg-green-700 active:scale-95 transition-all flex items-center justify-center gap-3">
                    <i className="fas fa-play"></i> BẮT ĐẦU ĐẾM GIỜ
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center">
              <div className="flex-1 w-full flex flex-col justify-center gap-8">
                {gameState.status === GameStatus.PLAYING ? (
                  <>
                    {myStatus?.status === 'answering' ? (
                      <div className="bg-white p-8 rounded-[3rem] shadow-2xl space-y-6 animate-fade-in border-4 border-blue-500 ring-8 ring-white/20">
                        <div className="text-center">
                          <h3 className="text-blue-800 font-bungee text-xl">CHỌN ĐÁP ÁN</h3>
                          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">BẠN ĐÃ GIÀNH QUYỀN TRẢ LỜI!</p>
                        </div>
                        <div className="space-y-3">
                          {currentQ?.options.map((opt, i) => (
                            <button key={i} onClick={() => setSelectedOption(i)} className={`w-full p-5 rounded-2xl border-2 text-left text-sm font-bold transition-all flex items-center gap-4 ${selectedOption === i ? 'bg-blue-600 border-white text-white scale-105 shadow-xl' : 'bg-gray-50 border-transparent hover:bg-gray-100'}`}>
                              <span className={`w-8 h-8 rounded-full flex items-center justify-center font-black ${selectedOption === i ? 'bg-white text-blue-600' : 'bg-gray-200 text-gray-500'}`}>{String.fromCharCode(65+i)}</span>
                              <MathContent content={opt} />
                            </button>
                          ))}
                        </div>
                        <button onClick={submitAnswer} disabled={selectedOption === null} className="w-full bg-red-600 text-white font-bungee py-5 rounded-2xl shadow-xl hover:bg-red-700 disabled:opacity-50 active:scale-95 transition-all">XÁC NHẬN ĐÁP ÁN</button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center space-y-12">
                        <div className="relative">
                          {gameState.isTimerRunning && !gameState.buzzedStudentId && !myStatus?.failedCurrentQuestion && (
                            <div className="absolute inset-0 bg-white/40 rounded-full animate-ping scale-150"></div>
                          )}
                          <button 
                            onClick={() => bc.current?.postMessage({ type: 'STUDENT_BUZZ', studentId: myId, timestamp: Date.now() })}
                            disabled={!gameState.isTimerRunning || !!gameState.buzzedStudentId || myStatus?.failedCurrentQuestion}
                            className={`w-64 h-64 rounded-full border-[15px] shadow-[0_25px_60px_rgba(0,0,0,0.3)] flex flex-col items-center justify-center transition-all active:scale-90 relative z-10 ${
                              myStatus?.failedCurrentQuestion ? 'bg-gray-800 border-gray-600 cursor-not-allowed grayscale' :
                              gameState.isTimerRunning && !gameState.buzzedStudentId ? 'bg-red-600 border-red-400 hover:bg-red-700 active:bg-red-900' : 'bg-gray-400 border-gray-300 opacity-50 cursor-not-allowed'
                            }`}
                          >
                            <i className={`fas fa-bell text-[7rem] text-white mb-2 ${gameState.isTimerRunning && !gameState.buzzedStudentId && !myStatus?.failedCurrentQuestion ? 'bell-shake' : ''}`}></i>
                            <span className="text-white font-bungee text-sm tracking-widest">{myStatus?.failedCurrentQuestion ? 'ĐÃ SAI' : 'RUNG CHUÔNG'}</span>
                          </button>
                        </div>
                        <div className="text-center bg-black/10 p-6 rounded-3xl backdrop-blur-md border border-white/20 w-full">
                          <h3 className="text-red-900 font-bungee text-lg">
                            {myStatus?.failedCurrentQuestion ? 'MÀN HÌNH ĐÃ KHÓA' : !!gameState.buzzedStudentId ? 'BẠN KHÁC ĐANG TRẢ LỜI' : 'SẴN SÀNG GIÀNH QUYỀN?'}
                          </h3>
                          <p className="text-white text-[10px] font-black uppercase tracking-widest mt-2">{myStatus?.failedCurrentQuestion ? 'Hãy chờ câu hỏi tiếp theo' : !!gameState.buzzedStudentId ? 'Vui lòng chờ giây lát' : 'Bấm chuông khi có hiệu lệnh'}</p>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center space-y-8 animate-fade-in flex-1 flex flex-col justify-center">
                    <div className="bg-white/30 p-12 rounded-[4rem] backdrop-blur-xl border-4 border-white/40 shadow-2xl">
                      <i className={`fas ${gameState.status === GameStatus.EXPLAINING ? 'fa-graduation-cap' : 'fa-trophy'} text-8xl text-white mb-6 drop-shadow-lg`}></i>
                      <h3 className="font-bungee text-white text-3xl uppercase tracking-tighter leading-none">{gameState.status === GameStatus.EXPLAINING ? 'DỪNG ĐỂ GIẢNG BÀI' : 'KẾT THÚC CUỘC THI'}</h3>
                      <p className="text-white font-bold text-sm mt-4 opacity-90">Theo dõi màn hình bên trái để xem lời giải chi tiết</p>
                      
                      {gameState.status === GameStatus.EXPLAINING && (
                        <div className="mt-8 flex flex-col gap-2">
                          {myStatus?.status === 'correct' && <div className="bg-green-500 text-white px-6 py-3 rounded-2xl font-bungee text-sm shadow-lg animate-bounce"><i className="fas fa-check-circle mr-2"></i> CHÍNH XÁC (+10đ)</div>}
                          {myStatus?.status === 'wrong' && <div className="bg-red-800 text-white px-6 py-3 rounded-2xl font-bungee text-sm shadow-lg"><i className="fas fa-times-circle mr-2"></i> CHƯA ĐÚNG</div>}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
      <footer className="bg-gray-900 text-white/20 text-[8px] font-black uppercase tracking-[0.5em] p-2 text-center z-40 border-t border-white/5">Rung Chuông Vàng Pro v3.1 • Layout Live Classroom • Fixed Logic Buzz</footer>
    </div>
  );
};

export default App;
