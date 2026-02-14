
import React, { useRef, useEffect, useState } from 'react';
import { DrawingPath } from '../types';

interface WhiteboardProps {
  paths: DrawingPath[];
  isTeacher: boolean;
  onDraw?: (path: DrawingPath) => void;
  onClear?: () => void;
  isVoiceActive?: boolean;
}

const Whiteboard: React.FC<WhiteboardProps> = ({ paths, isTeacher, onDraw, onClear, isVoiceActive }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState<{ x: number; y: number }[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    paths.forEach(path => {
      if (path.points.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = path.color;
      ctx.lineWidth = path.width;
      ctx.moveTo(path.points[0].x, path.points[0].y);
      for (let i = 1; i < path.points.length; i++) {
        ctx.lineTo(path.points[i].x, path.points[i].y);
      }
      ctx.stroke();
    });
  }, [paths]);

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isTeacher) return;
    setIsDrawing(true);
    const pos = getPos(e);
    setCurrentPath([pos]);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !isTeacher) return;
    const pos = getPos(e);
    setCurrentPath(prev => [...prev, pos]);
    
    // Preview
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx && currentPath.length > 0) {
      ctx.beginPath();
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3;
      ctx.moveTo(currentPath[currentPath.length - 1].x, currentPath[currentPath.length - 1].y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    }
  };

  const endDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (currentPath.length > 1 && onDraw) {
      onDraw({ color: '#ef4444', width: 3, points: currentPath });
    }
    setCurrentPath([]);
  };

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    // Adjust for canvas scaling
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  return (
    <div className="relative w-full h-full bg-gray-900 rounded-2xl overflow-hidden border-4 border-gray-800 shadow-inner">
      <canvas
        ref={canvasRef}
        width={800}
        height={600}
        className={`w-full h-full touch-none ${isTeacher ? 'cursor-crosshair' : 'cursor-default'}`}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={endDrawing}
        onMouseLeave={endDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={endDrawing}
      />
      {isTeacher && (
        <button 
          onClick={onClear}
          className="absolute top-4 right-4 bg-red-600 hover:bg-red-700 text-white p-2 rounded-lg shadow-lg text-xs font-bold"
        >
          XÓA BẢNG
        </button>
      )}
      {isVoiceActive && (
        <div className="absolute bottom-4 left-4 flex items-center gap-3 bg-green-600/80 px-4 py-2 rounded-full backdrop-blur-sm animate-pulse border border-green-400">
          <i className="fas fa-microphone text-white text-lg"></i>
          <span className="text-white text-xs font-bungee">MICRO ĐANG BẬT</span>
        </div>
      )}
      <div className="absolute top-4 left-4 text-white/20 font-bungee text-2xl pointer-events-none">
        BẢNG TRẮNG GIẢNG GIẢI
      </div>
    </div>
  );
};

export default Whiteboard;
