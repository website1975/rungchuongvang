
export interface Question {
  id: number;
  content: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
}

export enum GameStatus {
  LOBBY = 'LOBBY',
  PLAYING = 'PLAYING',
  EXPLAINING = 'EXPLAINING',
  FINISHED = 'FINISHED'
}

export type ExplanationMode = 'TEXT' | 'WHITEBOARD' | 'VOICE';

export interface DrawingPath {
  color: string;
  width: number;
  points: { x: number; y: number }[];
}

export interface Student {
  id: string;
  name: string;
  status: 'online' | 'buzzed' | 'correct' | 'wrong' | 'answering';
  score: number;
  lastBuzzedTime?: number;
  selectedOption?: number;
  failedCurrentQuestion?: boolean;
}

export interface GameState {
  questions: Question[];
  currentQuestionIndex: number;
  status: GameStatus;
  timer: number;
  isTimerRunning: boolean;
  buzzedStudentId: string | null;
  explanationMode: ExplanationMode;
  whiteboardPaths: DrawingPath[];
}

export type MessageType = 
  | { type: 'SYNC_STATE', state: GameState, students?: Student[] }
  | { type: 'STUDENT_JOIN', student: Student }
  | { type: 'STUDENT_BUZZ', studentId: string, timestamp: number }
  | { type: 'STUDENT_ANSWER', studentId: string, optionIndex: number }
  | { type: 'DRAW', path: DrawingPath }
  | { type: 'CLEAR_CANVAS' }
  | { type: 'SET_EXPLANATION_MODE', mode: ExplanationMode }
  | { type: 'REQUEST_SYNC' };
