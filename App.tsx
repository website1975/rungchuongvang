
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Question, GameStatus, GameState, Student, MessageType } from './types';
import { generateQuestions, getDeepExplanation } from './services/geminiService';
import Timer from './components/Timer';

const INITIAL_TIMER = 15;
const CHANNEL_NAME = 'rung_chuong_vang_pro';

// Bộ đề mẫu soạn sẵn cho Giáo viên thử nghiệm
const SAMPLE_QUESTIONS: Question[] = [
  {
    id: 1,
    content: "Vị tướng nào là người chỉ huy trực tiếp chiến dịch Điện Biên Phủ năm 1954, 'lừng lẫy năm châu, chấn động địa cầu'?",
    options: ["Đại tướng Văn Tiến Dũng", "Đại tướng Võ Nguyên Giáp", "Đại tướng Nguyễn Chí Thanh", "Đại tướng Chu Huy Mân"],
    correctAnswer: 1,
    difficulty: 'Medium',
    explanation: "Đại tướng Võ Nguyên Giáp (1911-2013) là Tổng tư lệnh Quân đội Nhân dân Việt Nam, người đã trực tiếp chỉ huy và đưa chiến dịch Điện Biên Phủ đến thắng lợi hoàn toàn vào ngày 7/5/1954. Đây là thắng lợi quyết định kết thúc cuộc kháng chiến chống Pháp."
  },
  {
    id: 2,
    content: "Con sông nào sau đây được mệnh danh là 'con sông dài nhất thế giới'?",
    options: ["Sông Amazon", "Sông Nile (Ni-lơ)", "Sông Mê Kông", "Sông Trường Giang"],
    correctAnswer: 1,
    difficulty: 'Easy',
    explanation: "Sông Nile nằm ở Châu Phi, với chiều dài khoảng 6.650 km, chảy qua 11 quốc gia. Tuy có những tranh luận với sông Amazon về độ dài, nhưng sông Nile vẫn thường được công nhận là con sông dài nhất thế giới trong hầu hết các tài liệu địa lý."
  }
];

const App: React.FC = () => {
  const [role, setRole] = useState<'SELECT' | 'TEACHER' | 'STUDENT'>('SELECT');
  const [studentName, setStudentName] = useState('');
  const [myId] = useState(() => 'stu_' + Math.random().toString(36).substr(2, 5));
  
  const [gameState, setGameState] = useState<GameState>({
    questions: [],
    currentQuestionIndex: -1,
    status: GameStatus.LOBBY,
    timer: INITIAL_TIMER,
    isTimerRunning: false,
    buzzedStudentId: null
  });

  const [students, setStudents] = useState<Student[]>([]);
  const [topic, setTopic] = useState('Kiến thức tổng quát');
  const [loading, setLoading] = useState(false);
  const [explanationText, setExplanationText] = useState<string | null>(null);
  
  const bc = useRef<BroadcastChannel | null>(null);
  const timerInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    bc.current = new BroadcastChannel(CHANNEL_NAME);
    
    bc.current.onmessage = (event: MessageEvent<MessageType>) => {
      const msg = event.data;
      switch (msg.type) {
        case 'REQUEST_SYNC':
          if (role === 'TEACHER') {
            bc.current?.postMessage({ type: 'SYNC_STATE', state: gameState, students: students });
          }
          break;
        case 'SYNC_STATE':
          setGameState(msg.state);
          if (msg.students) setStudents(msg.students);
          break;
        case 'STUDENT_JOIN':
          if (role === 'TEACHER') {
            setStudents(prev => {
              if (prev.find(s => s.id === msg.student.id)) return prev;
              const newStudents = [...prev, msg.student];
              bc.current?.postMessage({ type: 'SYNC_STATE', state: gameState, students: newStudents });
              return newStudents;
            });
          }
          break;
        case 'STUDENT_BUZZ':
          if (role === 'TEACHER' && gameState.isTimerRunning && !gameState.buzzedStudentId) {
            handleStudentBuzz(msg.studentId, msg.timestamp);
          }
          break;
      }
    };
    if (role === 'STUDENT') bc.current.postMessage({ type: 'REQUEST_SYNC' });
    return () => bc.current?.close();
  }, [role, gameState, students]);

  const handleStudentBuzz = (id: string, time: number) => {
    if (timerInterval.current) clearInterval(timerInterval.current);
    const newState = { ...gameState, buzzedStudentId: id, isTimerRunning: false };
    const newStudents = students.map(s => s.id === id ? { ...s, status: 'buzzed' as const, lastBuzzedTime: time } : s);
    setGameState(newState);
    setStudents(newStudents);
    bc.current?.postMessage({ type: 'SYNC_STATE', state: newState, students: newStudents });
  };

  const judgeStudent = (id: string, isCorrect: boolean) => {
    const newStudents = students.map(s => {
      if (s.id === id) {
        return { 
          ...s, 
          status: (isCorrect ? 'correct' : 'wrong') as any,
          score: isCorrect ? s.score + 10 : s.score
        };
      }
      return s;
    });
    setStudents(newStudents);
    bc.current?.postMessage({ type: 'SYNC_STATE', state: gameState, students: newStudents });
  };

  const startTimer = () => {
    if (timerInterval.current) clearInterval(timerInterval.current);
    const startState = { ...gameState, isTimerRunning: true, buzzedStudentId: null };
    const resetStudents = students.map(s => ({ ...s, status: 'online' as const }));
    setGameState(startState);
    setStudents(resetStudents);
    bc.current?.postMessage({ type: 'SYNC_STATE', state: startState, students: resetStudents });
    
    timerInterval.current = setInterval(() => {
      setGameState(prev => {
        const nextTimer = prev.timer - 1;
        if (nextTimer <= 0) {
          if (timerInterval.current) clearInterval(timerInterval.current);
          const timeoutState = { ...prev, timer: 0, isTimerRunning: false };
          bc.current?.postMessage({ type: 'SYNC_STATE', state: timeoutState, students: students });
          return timeoutState;
        }
        const activeState = { ...prev, timer: nextTimer };
        bc.current?.postMessage({ type: 'SYNC_STATE', state: activeState, students: students });
        return activeState;
      });
    }, 1000);
  };

  const handleStartGame = async () => {
    setLoading(true);
    const qs = await generateQuestions(topic);
    if (qs.length > 0) {
      startGameWithQuestions(qs);
    }
    setLoading(false);
  };

  const handleStartWithSample = () => {
    startGameWithQuestions(SAMPLE_QUESTIONS);
  };

  const startGameWithQuestions = (qs: Question[]) => {
    const newState: GameState = {
      questions: qs,
      currentQuestionIndex: 0,
      status: GameStatus.PLAYING,
      timer: INITIAL_TIMER,
      isTimerRunning: false,
      buzzedStudentId: null
    };
    setGameState(newState);
    setExplanationText(null);
    bc.current?.postMessage({ type: 'SYNC_STATE', state: newState, students: students });
  };

  const handleExplain = async () => {
    const q = gameState.questions[gameState.currentQuestionIndex];
    if (q.explanation) {
      setExplanationText(q.explanation);
    } else {
      setLoading(true);
      const text = await getDeepExplanation(q);
      setExplanationText(text);
      setLoading(false);
    }
    const newState = { ...gameState, status: GameStatus.EXPLAINING };
    setGameState(newState);
    bc.current?.postMessage({ type: 'SYNC_STATE', state: newState, students: students });
  };

  const nextQuestion = () => {
    const nextIndex = gameState.currentQuestionIndex + 1;
    let newState: GameState;
    if (nextIndex >= gameState.questions.length) {
      newState = { ...gameState, status: GameStatus.FINISHED };
    } else {
      newState = {
        ...gameState,
        currentQuestionIndex: nextIndex,
        timer: INITIAL_TIMER,
        isTimerRunning: false,
        buzzedStudentId: null,
        status: GameStatus.PLAYING
      };
    }
    setGameState(newState);
    setExplanationText(null);
    const resetStudents = students.map(s => ({ ...s, status: 'online' as const }));
    setStudents(resetStudents);
    bc.current?.postMessage({ type: 'SYNC_STATE', state: newState, students: resetStudents });
  };

  const joinGame = () => {
    if (!studentName.trim()) return;
    setRole('STUDENT');
    bc.current?.postMessage({
      type: 'STUDENT_JOIN',
      student: { id: myId, name: studentName, status: 'online', score: 0 }
    });
  };

  const studentBuzz = () => {
    if (!gameState.isTimerRunning || gameState.buzzedStudentId) return;
    bc.current?.postMessage({ type: 'STUDENT_BUZZ', studentId: myId, timestamp: Date.now() });
  };

  // Hàm thoát sạch sẽ không reload trang
  const handleExit = () => {
    if (timerInterval.current) clearInterval(timerInterval.current);
    setRole('SELECT');
    setGameState({
      questions: [],
      currentQuestionIndex: -1,
      status: GameStatus.LOBBY,
      timer: INITIAL_TIMER,
      isTimerRunning: false,
      buzzedStudentId: null
    });
    setStudents([]);
    setExplanationText(null);
    setLoading(false);
  };

  if (role === 'SELECT') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-6">
        <div className="bg-white p-10 rounded-3xl shadow-2xl max-w-lg w-full border-t-8 border-red-600">
          <div className="text-center mb-10">
            <i className="fas fa-bell text-7xl text-yellow-500 mb-4 bell-shake"></i>
            <h1 className="text-4xl font-bungee text-red-800 tracking-tighter">RUNG CHUÔNG VÀNG</h1>
            <p className="text-gray-500 font-medium">Hệ thống thi đấu trực tuyến đồng bộ</p>
          </div>
          <div className="grid grid-cols-1 gap-6">
            <button onClick={() => setRole('TEACHER')} className="group bg-red-600 p-6 rounded-2xl hover:bg-red-700 transition-all text-left flex items-center gap-6 shadow-xl">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center text-3xl text-white">
                <i className="fas fa-chalkboard-teacher"></i>
              </div>
              <div>
                <h3 className="text-white font-bold text-xl">DÀNH CHO GIÁO VIÊN</h3>
                <p className="text-red-100 text-sm">Quản lý lớp học, soạn đề, chấm điểm</p>
              </div>
            </button>
            <div className="bg-yellow-50 p-6 rounded-2xl border-2 border-yellow-200">
              <h3 className="text-yellow-800 font-bold mb-4 flex items-center gap-2"><i className="fas fa-user-graduate"></i> DÀNH CHO THÍ SINH</h3>
              <div className="flex gap-2">
                <input type="text" placeholder="Nhập họ và tên..." className="flex-1 border-2 border-gray-300 p-3 rounded-xl focus:border-yellow-500 outline-none font-bold" value={studentName} onChange={e => setStudentName(e.target.value)} onKeyPress={e => e.key === 'Enter' && joinGame()} />
                <button onClick={joinGame} disabled={!studentName.trim()} className="bg-yellow-500 text-white font-bold px-6 rounded-xl hover:bg-yellow-600 disabled:bg-gray-300 transition-all shadow-md">VÀO THI</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (role === 'TEACHER') {
    const currentQ = gameState.questions[gameState.currentQuestionIndex];
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col overflow-hidden">
        <header className="red-gradient text-white p-4 shadow-xl flex justify-between items-center z-10">
          <div className="flex items-center gap-4"><i className="fas fa-desktop text-2xl"></i><h2 className="text-xl font-bungee">Teacher Console</h2></div>
          <div className="flex gap-4 items-center">
            <span className="bg-white/20 px-4 py-1 rounded-full font-bold">{students.length} Thí sinh online</span>
            <button onClick={handleExit} className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl transition-all flex items-center gap-2 font-bold">
              <i className="fas fa-sign-out-alt"></i> Thoát
            </button>
          </div>
        </header>
        <div className="flex-1 flex overflow-hidden">
          <main className="flex-1 p-6 overflow-y-auto bg-gray-100">
            {gameState.status === GameStatus.LOBBY && (
              <div className="max-w-2xl mx-auto mt-10 animate-fade-in">
                <div className="bg-white p-10 rounded-3xl shadow-2xl border-b-8 border-red-600">
                  <h3 className="text-3xl font-bold mb-6 text-gray-800">Khởi tạo trận đấu</h3>
                  <div className="space-y-6">
                    <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                      <h4 className="font-bold text-blue-800 mb-2 flex items-center gap-2"><i className="fas fa-vial"></i> Chế độ thử nghiệm</h4>
                      <p className="text-sm text-blue-600 mb-4">Sử dụng bộ đề soạn sẵn gồm 2 câu hỏi để kiểm tra tính năng đồng bộ và chuông bấm.</p>
                      <button onClick={handleStartWithSample} className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-all shadow-md">DÙNG BỘ ĐỀ MẪU (2 CÂU)</button>
                    </div>
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-gray-200"></span></div>
                      <div className="relative flex justify-center text-sm"><span className="px-2 bg-white text-gray-400">HOẶC TẠO MỚI BẰNG AI</span></div>
                    </div>
                    <div>
                      <label className="block text-gray-600 font-bold mb-2">Chủ đề mong muốn:</label>
                      <input className="w-full p-4 border-2 border-gray-200 rounded-2xl text-xl focus:border-red-500 outline-none transition-all" value={topic} onChange={e => setTopic(e.target.value)} placeholder="VD: Lịch sử, Địa lý, Khoa học..." />
                    </div>
                    <button onClick={handleStartGame} disabled={loading} className="w-full red-gradient text-white font-bungee text-2xl py-5 rounded-2xl shadow-xl hover:scale-[1.02] transition-all flex items-center justify-center gap-4">
                      {loading ? <><i className="fas fa-circle-notch fa-spin"></i> ĐANG SOẠN ĐỀ...</> : <><i className="fas fa-rocket"></i> BẮT ĐẦU VỚI AI</>}
                    </button>
                  </div>
                </div>
              </div>
            )}
            {currentQ && (
              <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
                <div className="bg-white p-8 rounded-3xl shadow-xl border-4 border-red-800 relative">
                  <div className="flex justify-between items-center mb-6">
                    <span className="bg-yellow-400 text-red-900 px-6 py-2 rounded-full font-bungee text-lg shadow-inner">CÂU {gameState.currentQuestionIndex + 1} / {gameState.questions.length}</span>
                    <Timer seconds={gameState.timer} total={INITIAL_TIMER} />
                  </div>
                  <h3 className="text-3xl font-bold text-center mb-10 leading-relaxed text-gray-800">{currentQ.content}</h3>
                  <div className="grid grid-cols-2 gap-4 mb-10">
                    {currentQ.options.map((opt, i) => (
                      <div key={i} className={`p-5 border-2 rounded-2xl text-lg flex items-center gap-4 ${gameState.status === GameStatus.EXPLAINING && i === currentQ.correctAnswer ? 'bg-green-100 border-green-500 font-bold text-green-800 shadow-md' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>
                         <span className="w-10 h-10 flex items-center justify-center bg-white rounded-full font-bungee shadow-sm">{String.fromCharCode(65 + i)}</span>{opt}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-4">
                    {!gameState.isTimerRunning && gameState.status === GameStatus.PLAYING && !gameState.buzzedStudentId && (
                      <button onClick={startTimer} className="flex-1 bg-green-600 text-white font-bungee py-4 rounded-2xl shadow-lg hover:bg-green-700 active:scale-95 transition-all text-xl"><i className="fas fa-play mr-2"></i> BẮT ĐẦU ĐẾM GIỜ</button>
                    )}
                    {gameState.status === GameStatus.PLAYING && (
                      <button onClick={handleExplain} disabled={loading} className="flex-1 bg-purple-600 text-white font-bungee py-4 rounded-2xl shadow-lg hover:bg-purple-700 disabled:opacity-50 text-xl">
                        {loading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-lightbulb mr-2"></i>} GIẢNG GIẢI {currentQ.explanation ? '(CÓ SẴN)' : '(AI)'}
                      </button>
                    )}
                    {gameState.status === GameStatus.EXPLAINING && (
                      <button onClick={nextQuestion} className="flex-1 bg-blue-600 text-white font-bungee py-4 rounded-2xl shadow-lg hover:bg-blue-700 text-xl">CÂU KẾ TIẾP <i className="fas fa-arrow-right ml-2"></i></button>
                    )}
                  </div>
                </div>
                {explanationText && (
                  <div className="bg-purple-900 text-white p-8 rounded-3xl shadow-2xl animate-fade-in border-l-8 border-yellow-400">
                    <h4 className="text-xl font-bold mb-4 flex items-center gap-3 text-yellow-400"><i className="fas fa-graduation-cap text-3xl"></i> LỜI GIẢI CHI TIẾT:</h4>
                    <div className="prose prose-invert max-w-none text-lg leading-relaxed opacity-90 whitespace-pre-wrap font-medium">{explanationText}</div>
                  </div>
                )}
              </div>
            )}
            {gameState.status === GameStatus.FINISHED && (
               <div className="text-center mt-20">
                  <i className="fas fa-trophy text-9xl text-yellow-500 mb-6 drop-shadow-xl animate-bounce"></i>
                  <h2 className="text-5xl font-bungee text-red-800">KẾT THÚC CUỘC THI!</h2>
                  <button onClick={handleExit} className="mt-8 bg-red-600 text-white px-10 py-4 rounded-full font-bungee text-xl shadow-xl hover:scale-110 transition-all">TỔ CHỨC TRẬN MỚI</button>
               </div>
            )}
          </main>
          <aside className="w-96 bg-white border-l-2 shadow-2xl flex flex-col z-20">
            <div className="p-6 border-b bg-gray-50"><h3 className="text-xl font-black text-gray-800 flex items-center gap-3"><i className="fas fa-users-viewfinder text-red-600"></i> GIÁM SÁT LỚP HỌC</h3></div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {students.length === 0 ? (
                 <div className="text-center py-20 opacity-30"><i className="fas fa-user-clock text-5xl mb-4"></i><p className="font-bold italic">Đang chờ học sinh...</p></div>
              ) : (
                students.sort((a,b) => b.score - a.score).map((s, idx) => (
                  <div key={s.id} className={`p-4 rounded-2xl border-2 transition-all duration-500 ${s.status === 'buzzed' ? 'border-yellow-400 bg-yellow-50 scale-[1.02] shadow-lg animate-pulse' : s.status === 'correct' ? 'border-green-400 bg-green-50' : s.status === 'wrong' ? 'border-red-400 bg-red-50' : 'border-gray-100 bg-white'}`}>
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-3"><span className="text-xs font-bold bg-gray-200 w-6 h-6 rounded-full flex items-center justify-center">#{idx + 1}</span><span className="font-bold text-gray-800 text-lg truncate max-w-[120px]">{s.name}</span></div>
                      <span className="font-bungee text-red-600">{s.score}đ</span>
                    </div>
                    {s.status === 'buzzed' && (
                      <div className="flex gap-2 animate-fade-in">
                        <button onClick={() => judgeStudent(s.id, true)} className="flex-1 bg-green-500 hover:bg-green-600 text-white font-bold py-2 rounded-lg text-sm shadow-md"><i className="fas fa-check"></i> ĐÚNG</button>
                        <button onClick={() => judgeStudent(s.id, false)} className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-2 rounded-lg text-sm shadow-md"><i className="fas fa-times"></i> SAI</button>
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-2"><span className={`w-2 h-2 rounded-full ${s.status === 'online' ? 'bg-green-400' : 'bg-gray-400'}`}></span><span className="text-[10px] uppercase font-bold text-gray-400">{s.status === 'online' ? 'Đang online' : s.status}</span></div>
                  </div>
                ))
              )}
            </div>
          </aside>
        </div>
      </div>
    );
  }

  const myStatus = students.find(s => s.id === myId);
  const isMeBuzzed = gameState.buzzedStudentId === myId;
  const someoneElseBuzzed = gameState.buzzedStudentId && !isMeBuzzed;
  const currentQ = gameState.questions[gameState.currentQuestionIndex];

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="gold-gradient p-5 text-white shadow-xl flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-white/30 rounded-full flex items-center justify-center text-xl shadow-inner"><i className="fas fa-graduation-cap"></i></div>
          <div><h2 className="font-bungee text-lg leading-none">{studentName}</h2><p className="text-xs font-bold opacity-75">Hạng {students.sort((a,b)=>b.score-a.score).findIndex(s=>s.id===myId)+1} • {myStatus?.score || 0} Điểm</p></div>
        </div>
        <div className="flex gap-4 items-center">
          <div className="flex flex-col items-end"><span className="text-xs font-black uppercase tracking-widest opacity-60">PHÒNG THI #1</span><span className="font-bungee text-2xl">{gameState.timer}s</span></div>
          <button onClick={handleExit} className="bg-black/10 hover:bg-black/20 p-2 rounded-lg transition-all" title="Thoát">
            <i className="fas fa-sign-out-alt"></i>
          </button>
        </div>
      </header>
      <main className="flex-1 flex flex-col items-center justify-center p-6 space-y-8 relative overflow-hidden">
        <i className="fas fa-bell absolute -bottom-10 -right-10 text-[20rem] text-black/5 rotate-12"></i>
        {gameState.status === GameStatus.LOBBY && (
          <div className="text-center space-y-6 animate-pulse">
            <div className="relative"><i className="fas fa-satellite-dish text-8xl text-red-500"></i><div className="absolute top-0 right-0 w-6 h-6 bg-green-500 rounded-full border-4 border-white"></div></div>
            <h3 className="text-3xl font-bold text-gray-700">Đang đợi thầy cô...</h3>
            <p className="text-gray-500 font-medium max-w-xs mx-auto">Cuộc thi sẽ sớm bắt đầu. Hãy chuẩn bị sẵn sàng kiến thức!</p>
          </div>
        )}
        {gameState.status === GameStatus.PLAYING && currentQ && (
          <>
            <div className="w-full max-w-md bg-white p-8 rounded-3xl shadow-2xl text-center border-b-8 border-yellow-500 animate-fade-in">
               <span className="text-red-600 font-bungee mb-2 block tracking-widest">CÂU HỎI SỐ {gameState.currentQuestionIndex + 1}</span>
               <p className="text-2xl font-bold text-gray-800 leading-snug">{currentQ.content}</p>
            </div>
            <div className="relative group">
              {gameState.isTimerRunning && !gameState.buzzedStudentId && (<div className="absolute inset-0 bg-red-500/30 rounded-full animate-ping"></div>)}
              <button onClick={studentBuzz} disabled={!gameState.isTimerRunning || !!gameState.buzzedStudentId} className={`w-72 h-72 rounded-full flex flex-col items-center justify-center shadow-[0_20px_50px_rgba(0,0,0,0.2)] transition-all active:scale-90 border-[12px] relative z-10 ${isMeBuzzed ? 'bg-green-600 border-green-300 shadow-green-500/40' : someoneElseBuzzed ? 'bg-gray-400 border-gray-300 grayscale cursor-not-allowed opacity-50' : gameState.isTimerRunning ? 'bg-red-600 border-red-400 hover:scale-105 shadow-red-500/50' : 'bg-gray-300 border-gray-200 cursor-not-allowed'}`}>
                <i className={`fas fa-bell text-8xl text-white mb-4 ${gameState.isTimerRunning && !gameState.buzzedStudentId ? 'bell-shake' : ''}`}></i>
                <span className="text-white font-bungee text-2xl tracking-tighter">{isMeBuzzed ? 'ĐÃ GIÀNH QUYỀN!' : someoneElseBuzzed ? 'HẾT LƯỢT' : gameState.isTimerRunning ? 'RUNG CHUÔNG!' : 'CHỜ...'}</span>
              </button>
            </div>
            <div className={`text-5xl font-bungee transition-colors ${gameState.timer <= 5 ? 'text-red-600 animate-pulse' : 'text-gray-800'}`}>{gameState.timer}s</div>
          </>
        )}
        {gameState.status === GameStatus.EXPLAINING && (
          <div className="text-center space-y-6 animate-fade-in">
            <div className="bg-white p-10 rounded-full shadow-2xl inline-block"><i className="fas fa-lightbulb text-8xl text-yellow-500 animate-yellow-glow"></i></div>
            <h3 className="text-3xl font-black text-gray-800">THẦY CÔ ĐANG GIẢNG BÀI</h3>
            <p className="text-lg text-gray-500 font-medium">Hãy tập trung lắng nghe để hiểu rõ đáp án nhé!</p>
            {myStatus?.status === 'correct' && (<div className="bg-green-100 text-green-700 px-6 py-3 rounded-full font-bold flex items-center gap-2 mx-auto w-fit"><i className="fas fa-check-circle"></i> BẠN TRẢ LỜI ĐÚNG (+10đ)</div>)}
            {myStatus?.status === 'wrong' && (<div className="bg-red-100 text-red-700 px-6 py-3 rounded-full font-bold flex items-center gap-2 mx-auto w-fit"><i className="fas fa-times-circle"></i> BẠN TRẢ LỜI CHƯA ĐÚNG</div>)}
          </div>
        )}
        {gameState.status === GameStatus.FINISHED && (
          <div className="text-center space-y-6 animate-fade-in bg-white p-10 rounded-[3rem] shadow-2xl border-t-8 border-yellow-500">
             <i className="fas fa-medal text-9xl text-yellow-500 mb-4"></i>
             <h2 className="text-4xl font-bungee text-red-800">KẾT THÚC!</h2>
             <div className="text-2xl font-bold text-gray-700">TỔNG ĐIỂM: {myStatus?.score || 0}</div>
          </div>
        )}
      </main>
      <footer className="p-4 bg-gray-200 text-center text-gray-500 text-[10px] font-bold uppercase tracking-widest">DỰ THI RUNG CHUÔNG VÀNG v2.0 • ĐỒNG BỘ THỜI GIAN THỰC</footer>
      <style>{`
        @keyframes yellow-glow {
          0%, 100% { filter: drop-shadow(0 0 10px rgba(234, 179, 8, 0.4)); }
          50% { filter: drop-shadow(0 0 30px rgba(234, 179, 8, 0.8)); }
        }
        .animate-yellow-glow { animation: yellow-glow 2s infinite; }
      `}</style>
    </div>
  );
};

export default App;
