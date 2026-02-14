
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Question, GameStatus, GameState, Student, MessageType, ExplanationMode } from './types';
import { generateQuestions, getDeepExplanation } from './services/geminiService';
import Timer from './components/Timer';

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
          } catch (e) {
            return part;
          }
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
  {
    id: 1,
    content: "Tính giá trị của biểu thức: $A = \\frac{2x^2 + 5x - 3}{x + 3}$ khi $x = 2$.",
    options: ["$A = 1$", "$A = 3$", "$A = 5$", "$A = 7$"],
    correctAnswer: 1,
    difficulty: 'Hard',
    explanation: "Phân tích: $2x^2 + 5x - 3 = (x+3)(2x-1)$. Rút gọn biểu thức ta được $A = 2x - 1$. Với $x = 2$, $A = 2(2) - 1 = 3$."
  },
  {
    id: 2,
    content: "Trong lượng giác, đẳng thức nào sau đây là đúng?",
    options: ["$\\sin^2\\alpha + \\cos^2\\alpha = 1$", "$\\sin^2\\alpha - \\cos^2\\alpha = 1$", "$\\tan\\alpha = \\frac{\\cos\\alpha}{\\sin\\alpha}$", "$\\sin 2\\alpha = \\sin\\alpha \\cos\\alpha$"],
    correctAnswer: 0,
    difficulty: 'Medium',
    explanation: "Đây là hệ thức lượng giác cơ bản dựa trên định lý Pythagoras."
  },
  {
    id: 3,
    content: "Một mạch dao động LC lý tưởng đang có dao động điện từ tự do. Tần số góc $\\omega$ của mạch được tính bằng công thức nào?",
    options: ["$\\omega = \\frac{1}{LC}$", "$\\omega = \\frac{1}{\\sqrt{LC}}$", "$\\omega = \\sqrt{LC}$", "$\\omega = \\frac{2\\pi}{\\sqrt{LC}}$"],
    correctAnswer: 1,
    difficulty: 'Medium',
    explanation: "Tần số góc riêng của mạch LC là $\\omega = \\frac{1}{\\sqrt{LC}}$."
  }
];

const App: React.FC = () => {
  const [role, setRole] = useState<'SELECT' | 'TEACHER' | 'STUDENT'>('SELECT');
  const [studentName, setStudentName] = useState('');
  const [myId] = useState(() => 'stu_' + Math.random().toString(36).substr(2, 5));
  const [isAiMode, setIsAiMode] = useState(false);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  
  const [gameState, setGameState] = useState<GameState>({
    questions: [],
    currentQuestionIndex: -1,
    status: GameStatus.LOBBY,
    timer: INITIAL_TIMER,
    isTimerRunning: false,
    buzzedStudentId: null,
    explanationMode: 'TEXT'
  });

  const [students, setStudents] = useState<Student[]>([]);
  const [topic, setTopic] = useState('Toán Lý nâng cao');
  const [loading, setLoading] = useState(false);
  const [explanationText, setExplanationText] = useState<string | null>(null);
  
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

  const sendJoinMessage = useCallback(() => {
    bc.current?.postMessage({
      type: 'STUDENT_JOIN',
      student: { id: myIdRef.current, name: studentName, status: 'online', score: 0 }
    });
  }, [studentName]);

  useEffect(() => {
    bc.current = new BroadcastChannel(CHANNEL_NAME);
    
    bc.current.onmessage = (event: MessageEvent<MessageType>) => {
      const msg = event.data;
      const currentRole = roleRef.current;

      switch (msg.type) {
        case 'REQUEST_SYNC':
          if (currentRole === 'TEACHER') {
            bc.current?.postMessage({ type: 'SYNC_STATE', state: gameStateRef.current, students: studentsRef.current });
          } else if (currentRole === 'STUDENT') {
            sendJoinMessage();
          }
          break;

        case 'SYNC_STATE':
          if (currentRole === 'STUDENT') {
            setGameState(msg.state);
            if (msg.students) {
              setStudents(msg.students);
              const amIInList = msg.students.some(s => s.id === myIdRef.current);
              if (!amIInList) sendJoinMessage();
            }
          }
          break;

        case 'STUDENT_JOIN':
          if (currentRole === 'TEACHER') {
            setStudents(prev => {
              if (prev.find(s => s.id === msg.student.id)) return prev;
              const newStudents = [...prev, msg.student];
              bc.current?.postMessage({ type: 'SYNC_STATE', state: gameStateRef.current, students: newStudents });
              return newStudents;
            });
          }
          break;

        case 'STUDENT_BUZZ':
          if (currentRole === 'TEACHER' && gameStateRef.current.isTimerRunning && !gameStateRef.current.buzzedStudentId) {
            handleStudentBuzz(msg.studentId, msg.timestamp);
          }
          break;

        case 'STUDENT_ANSWER':
          if (currentRole === 'TEACHER') {
            handleStudentAnswer(msg.studentId, msg.optionIndex);
          }
          break;

        case 'SET_EXPLANATION_MODE':
          if (currentRole === 'STUDENT') {
            setGameState(prev => ({ ...prev, explanationMode: msg.mode }));
          }
          break;
      }
    };

    if (role !== 'SELECT') {
      bc.current.postMessage({ type: 'REQUEST_SYNC' });
    }

    return () => bc.current?.close();
  }, [role, sendJoinMessage]);

  const handleStudentBuzz = (id: string, time: number) => {
    if (timerInterval.current) clearInterval(timerInterval.current);
    const newState = { ...gameStateRef.current, buzzedStudentId: id, isTimerRunning: false };
    const newStudents = studentsRef.current.map(s => s.id === id ? { ...s, status: 'answering' as const, lastBuzzedTime: time } : s);
    setGameState(newState);
    setStudents(newStudents);
    bc.current?.postMessage({ type: 'SYNC_STATE', state: newState, students: newStudents });
  };

  const handleStudentAnswer = (id: string, optionIndex: number) => {
    const currentQ = gameStateRef.current.questions[gameStateRef.current.currentQuestionIndex];
    const isCorrect = currentQ.correctAnswer === optionIndex;
    
    const newStudents = studentsRef.current.map(s => {
      if (s.id === id) {
        return { 
          ...s, 
          status: (isCorrect ? 'correct' : 'wrong') as any,
          score: isCorrect ? s.score + 10 : s.score,
          selectedOption: optionIndex
        };
      }
      return s;
    });
    setStudents(newStudents);
    bc.current?.postMessage({ type: 'SYNC_STATE', state: gameStateRef.current, students: newStudents });
  };

  const setExplanationMode = (mode: ExplanationMode) => {
    const newState = { ...gameState, explanationMode: mode };
    setGameState(newState);
    bc.current?.postMessage({ type: 'SYNC_STATE', state: newState, students: students });
  };

  const handleExplain = async () => {
    const q = gameState.questions[gameState.currentQuestionIndex];
    if (q.explanation && q.explanation.trim() !== "") {
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
    const startState = { ...gameState, isTimerRunning: true, buzzedStudentId: null, status: GameStatus.PLAYING };
    const resetStudents = students.map(s => ({ ...s, status: 'online' as const, selectedOption: undefined }));
    setGameState(startState);
    setStudents(resetStudents);
    setSelectedOption(null);
    bc.current?.postMessage({ type: 'SYNC_STATE', state: startState, students: resetStudents });
    
    timerInterval.current = setInterval(() => {
      setGameState(prev => {
        const nextTimer = prev.timer - 1;
        if (nextTimer <= 0) {
          if (timerInterval.current) clearInterval(timerInterval.current);
          const timeoutState = { ...prev, timer: 0, isTimerRunning: false };
          bc.current?.postMessage({ type: 'SYNC_STATE', state: timeoutState, students: studentsRef.current });
          return timeoutState;
        }
        const activeState = { ...prev, timer: nextTimer };
        bc.current?.postMessage({ type: 'SYNC_STATE', state: activeState, students: studentsRef.current });
        return activeState;
      });
    }, 1000);
  };

  const handleStartGame = async () => {
    setLoading(true);
    try {
      const qs = await generateQuestions(topic);
      if (qs.length > 0) {
        setIsAiMode(true);
        startGameWithQuestions(qs);
      }
    } finally {
      setLoading(false);
    }
  };

  const startGameWithQuestions = (qs: Question[]) => {
    const newState: GameState = {
      questions: qs,
      currentQuestionIndex: 0,
      status: GameStatus.PLAYING,
      timer: INITIAL_TIMER,
      isTimerRunning: false,
      buzzedStudentId: null,
      explanationMode: 'TEXT'
    };
    setGameState(newState);
    setExplanationText(null);
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
    setSelectedOption(null);
    const resetStudents = students.map(s => ({ ...s, status: 'online' as const, selectedOption: undefined }));
    setStudents(resetStudents);
    bc.current?.postMessage({ type: 'SYNC_STATE', state: newState, students: resetStudents });
  };

  // Student action: buzz to claim the right to answer
  const studentBuzz = () => {
    if (gameState.isTimerRunning && !gameState.buzzedStudentId) {
      bc.current?.postMessage({
        type: 'STUDENT_BUZZ',
        studentId: myId,
        timestamp: Date.now()
      });
    }
  };

  // Student action: submit their selected answer
  const submitAnswer = () => {
    if (selectedOption !== null) {
      bc.current?.postMessage({
        type: 'STUDENT_ANSWER',
        studentId: myId,
        optionIndex: selectedOption
      });
    }
  };

  const handleExit = () => {
    if (timerInterval.current) clearInterval(timerInterval.current);
    setRole('SELECT');
  };

  if (role === 'SELECT') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-md w-full border-t-8 border-red-600 animate-fade-in">
          <div className="text-center mb-6">
            <i className="fas fa-bell text-5xl text-yellow-500 mb-3 bell-shake"></i>
            <h1 className="text-3xl font-bungee text-red-800 tracking-tighter">RUNG CHUÔNG VÀNG</h1>
            <p className="text-xs text-gray-500 font-medium">Hệ thống thi đấu chuyên nghiệp</p>
          </div>
          <div className="space-y-4">
            <button onClick={() => setRole('TEACHER')} className="w-full bg-red-600 p-4 rounded-2xl hover:bg-red-700 transition-all text-left flex items-center gap-4 shadow-md group">
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center text-xl text-white"><i className="fas fa-chalkboard-teacher"></i></div>
              <div><h3 className="text-white font-bold">GIÁO VIÊN</h3><p className="text-red-100 text-xs">Quản lý & Giảng dạy</p></div>
            </button>
            <div className="bg-yellow-50 p-4 rounded-2xl border-2 border-yellow-200">
               <input type="text" placeholder="Nhập tên học sinh..." className="w-full border-2 border-gray-300 px-3 py-2 rounded-xl mb-2 outline-none focus:border-yellow-500 font-bold" value={studentName} onChange={e => setStudentName(e.target.value)} />
               <button onClick={() => setRole('STUDENT')} disabled={!studentName.trim()} className="w-full bg-yellow-500 text-white font-bold py-3 rounded-xl hover:bg-yellow-600 shadow-sm uppercase">VÀO THI</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (role === 'TEACHER') {
    const currentQ = gameState.questions[gameState.currentQuestionIndex];
    const buzzedStudent = students.find(s => s.id === gameState.buzzedStudentId);

    return (
      <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
        <header className="red-gradient text-white p-3 flex justify-between items-center shadow-lg z-10">
          <div className="flex items-center gap-3"><i className="fas fa-desktop text-xl"></i><h2 className="font-bungee text-sm">Teacher Control Panel</h2></div>
          <div className="flex gap-2">
            <button onClick={() => setRole('SELECT')} className="bg-white/10 px-3 py-1 rounded text-xs font-bold">Menu</button>
          </div>
        </header>
        <div className="flex-1 flex overflow-hidden">
          <main className="flex-1 p-4 md:p-6 overflow-y-auto bg-gray-100 space-y-6">
            {gameState.status === GameStatus.LOBBY && (
              <div className="max-w-xl mx-auto bg-white p-8 rounded-3xl shadow-xl border-b-8 border-red-600">
                <h3 className="text-xl font-bold mb-6">Khởi tạo trận đấu</h3>
                <div className="space-y-4">
                  <input className="w-full p-4 border-2 border-gray-100 rounded-xl focus:border-red-500 outline-none" value={topic} onChange={e => setTopic(e.target.value)} placeholder="Chủ đề (VD: Toán lớp 12...)" />
                  <div className="flex gap-2">
                    <button onClick={handleStartGame} disabled={loading} className="flex-1 bg-red-600 text-white font-bungee py-4 rounded-xl shadow-lg hover:bg-red-700">{loading ? 'Đang soạn...' : 'Bắt đầu với AI'}</button>
                    <button onClick={() => startGameWithQuestions(SAMPLE_QUESTIONS)} className="px-6 bg-blue-600 text-white font-bungee py-4 rounded-xl shadow-lg">Bộ đề mẫu</button>
                  </div>
                </div>
              </div>
            )}

            {currentQ && (
              <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
                <div className="bg-white p-6 rounded-3xl shadow-lg border-2 border-red-800">
                  <div className="flex justify-between items-center mb-6">
                    <span className="bg-yellow-400 text-red-900 px-6 py-2 rounded-full font-bungee text-sm">CÂU {gameState.currentQuestionIndex + 1} / {gameState.questions.length}</span>
                    <Timer seconds={gameState.timer} total={INITIAL_TIMER} />
                  </div>
                  <h3 className="text-2xl font-bold text-center mb-8"><MathContent content={currentQ.content} /></h3>
                  <div className="grid grid-cols-2 gap-4 mb-8">
                    {currentQ.options.map((opt, i) => (
                      <div key={i} className={`p-4 border-2 rounded-2xl flex items-center gap-3 ${gameState.status === GameStatus.EXPLAINING && i === currentQ.correctAnswer ? 'bg-green-50 border-green-500' : 'bg-gray-50'}`}>
                        <span className="w-8 h-8 rounded-full bg-white flex items-center justify-center font-bold shadow-sm">{String.fromCharCode(65 + i)}</span>
                        <MathContent content={opt} />
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={startTimer} className="flex-1 bg-green-600 text-white font-bungee py-3 rounded-xl shadow-md hover:bg-green-700 transition-all">TIẾP TỤC/ĐẾM GIỜ</button>
                    <button onClick={handleExplain} className="flex-1 bg-purple-600 text-white font-bungee py-3 rounded-xl shadow-md"> GIẢI THÍCH CHI TIẾT</button>
                    <button onClick={nextQuestion} className="flex-1 bg-blue-600 text-white font-bungee py-3 rounded-xl shadow-md">CÂU TIẾP THEO</button>
                  </div>
                </div>

                {gameState.status === GameStatus.EXPLAINING && (
                  <div className="bg-white p-6 rounded-3xl shadow-lg border-l-8 border-purple-600">
                    <h4 className="font-bold text-purple-800 mb-4 uppercase tracking-wider flex items-center gap-2">
                      <i className="fas fa-chalkboard"></i> Hình thức giảng giải cho học sinh:
                    </h4>
                    <div className="flex gap-4 mb-6">
                      <button onClick={() => setExplanationMode('TEXT')} className={`flex-1 py-3 rounded-xl border-2 transition-all font-bold ${gameState.explanationMode === 'TEXT' ? 'bg-purple-600 border-purple-800 text-white' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>VĂN BẢN</button>
                      <button onClick={() => setExplanationMode('WHITEBOARD')} className={`flex-1 py-3 rounded-xl border-2 transition-all font-bold ${gameState.explanationMode === 'WHITEBOARD' ? 'bg-purple-600 border-purple-800 text-white' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>BẢNG TRẮNG</button>
                      <button onClick={() => setExplanationMode('VOICE')} className={`flex-1 py-3 rounded-xl border-2 transition-all font-bold ${gameState.explanationMode === 'VOICE' ? 'bg-purple-600 border-purple-800 text-white' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>GIỌNG NÓI (AI)</button>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200 whitespace-pre-wrap leading-relaxed italic text-gray-700">
                       <MathContent content={explanationText || currentQ.explanation} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </main>
          <aside className="w-80 bg-white border-l shadow-2xl p-4 flex flex-col">
            <h3 className="font-black text-gray-800 mb-4 border-b pb-2"><i className="fas fa-users text-red-600"></i> LỚP HỌC TRỰC TUYẾN</h3>
            <div className="flex-1 overflow-y-auto space-y-3">
              {students.sort((a,b)=>b.score - a.score).map((s, i) => (
                <div key={s.id} className={`p-3 rounded-2xl border flex justify-between items-center ${s.status === 'answering' ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'bg-white shadow-sm'}`}>
                  <div><p className="text-xs font-bold text-gray-800">#{i+1} {s.name}</p><p className="text-[10px] text-gray-400 font-bold uppercase">{s.status}</p></div>
                  <div className="flex flex-col items-end">
                    <span className="text-red-600 font-bungee text-sm">{s.score}đ</span>
                    {s.status === 'answering' && (
                      <div className="flex gap-1 mt-1">
                        <button onClick={()=>judgeStudent(s.id, true)} className="bg-green-500 text-white p-1 rounded-md text-[10px]"><i className="fas fa-check"></i></button>
                        <button onClick={()=>judgeStudent(s.id, false)} className="bg-red-500 text-white p-1 rounded-md text-[10px]"><i className="fas fa-times"></i></button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    );
  }

  // Giao diện HỌC SINH
  const currentQ = gameState.questions[gameState.currentQuestionIndex];
  const myStatus = students.find(s => s.id === myId);
  const isMeBuzzed = gameState.buzzedStudentId === myId;
  const isSomeoneElseBuzzed = gameState.buzzedStudentId && !isMeBuzzed;
  const isAnswering = myStatus?.status === 'answering';

  return (
    <div className="h-screen bg-gray-100 flex flex-col overflow-hidden">
      <header className="gold-gradient p-3 text-white shadow-md flex justify-between items-center z-20">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-white/30 rounded-full flex items-center justify-center"><i className="fas fa-user-graduate"></i></div>
          <div><h2 className="font-bungee text-xs">{studentName}</h2><p className="text-[10px] opacity-80 font-bold">Điểm: {myStatus?.score || 0}</p></div>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-black/10 px-4 py-1 rounded-full"><span className="font-bungee text-lg">{gameState.timer}s</span></div>
          <button onClick={handleExit} className="text-white/70 hover:text-white transition-all"><i className="fas fa-sign-out-alt"></i></button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* PHẦN TRÁI: Nội dung học tập & Giải thích */}
        <section className="flex-1 bg-white p-6 md:p-10 overflow-y-auto relative">
          <div className="max-w-2xl mx-auto space-y-8 animate-fade-in">
            {gameState.status === GameStatus.LOBBY ? (
               <div className="h-full flex flex-col items-center justify-center text-center py-20">
                  <i className="fas fa-satellite-dish text-6xl text-red-500 mb-6 animate-pulse"></i>
                  <h2 className="text-2xl font-bold text-gray-800 mb-2">Đang chờ tín hiệu...</h2>
                  <p className="text-gray-500">Giáo viên đang chuẩn bị bộ đề thi cho em.</p>
               </div>
            ) : gameState.status === GameStatus.FINISHED ? (
              <div className="text-center py-20">
                <i className="fas fa-trophy text-7xl text-yellow-500 mb-6"></i>
                <h2 className="text-4xl font-bungee text-red-800 mb-4">CHÚC MỪNG!</h2>
                <p className="text-xl font-bold text-gray-600">Em đã hoàn thành bài thi với {myStatus?.score} điểm.</p>
              </div>
            ) : (
              <>
                <div className="border-b-4 border-yellow-500 pb-6">
                  <span className="text-red-600 font-black uppercase text-xs tracking-widest mb-2 block">Câu hỏi số {gameState.currentQuestionIndex + 1}</span>
                  <div className="text-xl md:text-3xl font-bold text-gray-800 leading-tight">
                    <MathContent content={currentQ?.content || ''} />
                  </div>
                </div>

                {gameState.status === GameStatus.EXPLAINING && (
                  <div className="bg-purple-50 rounded-3xl p-6 border-2 border-purple-200 animate-fade-in shadow-inner">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-purple-600 text-white rounded-full flex items-center justify-center shadow-md">
                        {gameState.explanationMode === 'TEXT' && <i className="fas fa-file-alt"></i>}
                        {gameState.explanationMode === 'WHITEBOARD' && <i className="fas fa-chalkboard"></i>}
                        {gameState.explanationMode === 'VOICE' && <i className="fas fa-microphone"></i>}
                      </div>
                      <h4 className="font-bungee text-purple-800 text-sm">BÀI GIẢNG CHI TIẾT</h4>
                    </div>
                    <div className="text-lg text-gray-800 leading-relaxed font-medium bg-white p-6 rounded-2xl shadow-sm border border-purple-100">
                       <MathContent content={explanationText || currentQ?.explanation || ''} />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        {/* PHẦN PHẢI: Khu vực tương tác (Chuông & Đáp án) */}
        <section className="w-80 md:w-96 gold-gradient p-6 flex flex-col items-center border-l-4 border-yellow-600 shadow-2xl relative">
          <div className="absolute top-4 left-4 flex gap-1 opacity-20">
             <i className="fas fa-circle text-[8px]"></i><i className="fas fa-circle text-[8px]"></i><i className="fas fa-circle text-[8px]"></i>
          </div>

          {gameState.status === GameStatus.PLAYING && (
            <div className="w-full flex-1 flex flex-col justify-center gap-8 animate-fade-in">
              {isMeBuzzed && isAnswering ? (
                <div className="space-y-4">
                  <div className="text-center mb-6">
                    <h3 className="text-red-900 font-bungee text-sm">CHỌN ĐÁP ÁN ĐÚNG</h3>
                    <p className="text-[10px] font-bold text-red-700 uppercase">Em đã giành được quyền trả lời!</p>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    {currentQ.options.map((opt, i) => (
                      <button 
                        key={i} 
                        onClick={() => setSelectedOption(i)}
                        className={`p-4 rounded-2xl border-2 text-left text-xs font-bold transition-all shadow-md active:scale-95 flex items-center gap-3 ${selectedOption === i ? 'bg-blue-600 border-white text-white scale-105 ring-4 ring-blue-300' : 'bg-white/90 border-transparent text-gray-800'}`}
                      >
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${selectedOption === i ? 'bg-white text-blue-600' : 'bg-gray-200 text-gray-600'}`}>{String.fromCharCode(65+i)}</span>
                        <MathContent content={opt} />
                      </button>
                    ))}
                  </div>
                  <button 
                    onClick={submitAnswer} 
                    disabled={selectedOption === null}
                    className="w-full bg-red-700 text-white font-bungee py-4 rounded-2xl shadow-xl hover:bg-red-800 disabled:opacity-50 transition-all border-b-4 border-red-900"
                  >
                    XÁC NHẬN ĐÁP ÁN
                  </button>
                </div>
              ) : isSomeoneElseBuzzed ? (
                <div className="text-center space-y-4">
                   <div className="bg-black/20 p-8 rounded-full inline-block mb-4"><i className="fas fa-lock text-6xl text-white"></i></div>
                   <h3 className="text-red-900 font-bungee text-lg">MÀN HÌNH KHÓA</h3>
                   <p className="text-white text-sm font-bold bg-black/30 px-4 py-2 rounded-xl">Bạn khác đang trả lời, vui lòng chờ em nhé!</p>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <div className="relative mb-10">
                    {gameState.isTimerRunning && !gameState.buzzedStudentId && <div className="absolute inset-0 bg-white/30 rounded-full animate-ping scale-150"></div>}
                    <button 
                      onClick={studentBuzz}
                      disabled={!gameState.isTimerRunning || gameState.buzzedStudentId !== null}
                      className={`w-52 h-52 rounded-full border-[10px] shadow-2xl transition-all active:scale-90 flex flex-col items-center justify-center relative z-10 ${gameState.isTimerRunning && !gameState.buzzedStudentId ? 'bg-red-600 border-red-400 hover:bg-red-700 active:bg-red-900' : 'bg-gray-400 border-gray-300 opacity-50 cursor-not-allowed'}`}
                    >
                      <i className={`fas fa-bell text-7xl text-white mb-2 ${gameState.isTimerRunning && !gameState.buzzedStudentId ? 'bell-shake' : ''}`}></i>
                      <span className="text-white font-bungee text-xs uppercase tracking-tighter">RUNG CHUÔNG</span>
                    </button>
                  </div>
                  <p className="text-red-900 font-black text-center text-[10px] uppercase animate-pulse">
                    {gameState.isTimerRunning ? 'Bấm chuông ngay để giành quyền!' : 'Chờ giáo viên ra hiệu lệnh...'}
                  </p>
                </div>
              )}
            </div>
          )}

          {gameState.status === GameStatus.EXPLAINING && (
            <div className="flex-1 flex flex-col items-center justify-center text-center animate-fade-in">
               <div className="bg-white p-6 rounded-[2rem] shadow-xl border-t-8 border-purple-600">
                  <i className="fas fa-graduation-cap text-5xl text-purple-600 mb-4"></i>
                  <h3 className="font-bungee text-gray-800 text-sm mb-2">ĐANG GIẢNG BÀI</h3>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">Em hãy chú ý nhìn sang màn hình bên trái</p>
                  {myStatus?.status === 'correct' && <div className="bg-green-100 text-green-700 px-4 py-2 rounded-xl font-bold text-xs"><i className="fas fa-check-circle mr-1"></i> CHÍNH XÁC (+10đ)</div>}
                  {myStatus?.status === 'wrong' && <div className="bg-red-100 text-red-700 px-4 py-2 rounded-xl font-bold text-xs"><i className="fas fa-times-circle mr-1"></i> SAI RỒI</div>}
               </div>
            </div>
          )}
        </section>
      </div>

      <footer className="bg-gray-800 text-gray-500 text-[8px] font-black uppercase text-center p-1.5 tracking-widest z-20">
        Rung Chuông Vàng Pro v2.5 • Live Classroom Layout
      </footer>

      <style>{`
        @keyframes shake {
          0% { transform: rotate(0); }
          25% { transform: rotate(15deg); }
          50% { transform: rotate(0); }
          75% { transform: rotate(-15deg); }
          100% { transform: rotate(0); }
        }
        .bell-shake { animation: shake 0.3s infinite; }
      `}</style>
    </div>
  );
};

export default App;
