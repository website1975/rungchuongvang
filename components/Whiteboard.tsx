
import React, { useRef, useEffect, useState } from 'react';

interface WhiteboardProps {
  isTeacher: boolean;
  channel: any;
  roomCode: string;
}

const Whiteboard: React.FC<WhiteboardProps> = ({ isTeacher, channel, roomCode }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#ffffff');
  const [brushSize, setBrushSize] = useState(3);
  const [showStatus, setShowStatus] = useState(false);
  
  const ASPECT_RATIO = 16 / 9;

  const getCanvasCoords = (e: React.PointerEvent | PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  const resizeCanvas = () => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const parentRect = container.getBoundingClientRect();
    if (parentRect.width === 0 || parentRect.height === 0) return;

    let targetWidth = parentRect.width;
    let targetHeight = targetWidth / ASPECT_RATIO;

    if (targetHeight > parentRect.height) {
      targetHeight = parentRect.height;
      targetWidth = targetHeight * ASPECT_RATIO;
    }

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    if (tempCtx) tempCtx.drawImage(canvas, 0, 0);

    canvas.style.width = `${targetWidth}px`;
    canvas.style.height = `${targetHeight}px`;
    canvas.width = 1920; 
    canvas.height = 1080; 
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = color;
      ctx.lineWidth = brushSize * 2;
      contextRef.current = ctx;
      ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
    }
  };

  useEffect(() => {
    resizeCanvas();
    const observer = new ResizeObserver(() => {
      window.requestAnimationFrame(resizeCanvas);
    });
    if (containerRef.current) observer.observe(containerRef.current);

    if (!isTeacher && channel) {
      const handleDraw = ({ payload }: any) => drawRemote(payload);
      const handleClear = () => clearLocal();
      channel.on('broadcast', { event: 'draw_stroke' }, handleDraw);
      channel.on('broadcast', { event: 'clear_canvas' }, handleClear);
    }
    return () => observer.disconnect();
  }, [isTeacher, channel]);

  useEffect(() => {
    if (contextRef.current) {
      contextRef.current.strokeStyle = color;
      contextRef.current.lineWidth = brushSize * 2;
    }
  }, [color, brushSize]);

  const drawRemote = (data: any) => {
    const ctx = contextRef.current;
    if (!ctx || !canvasRef.current) return;
    const prevColor = ctx.strokeStyle;
    const prevWidth = ctx.lineWidth;
    ctx.beginPath();
    ctx.strokeStyle = data.color;
    ctx.lineWidth = data.size * 2;
    ctx.moveTo(data.x0 * canvasRef.current.width, data.y0 * canvasRef.current.height);
    ctx.lineTo(data.x1 * canvasRef.current.width, data.y1 * canvasRef.current.height);
    ctx.stroke();
    ctx.strokeStyle = prevColor;
    ctx.lineWidth = prevWidth;
  };

  const clearLocal = () => {
    const ctx = contextRef.current;
    if (!ctx || !canvasRef.current) return;
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
  };

  const handleClear = () => {
    clearLocal();
    if (isTeacher && channel) channel.send({ type: 'broadcast', event: 'clear_canvas' });
  };

  const lastPos = useRef({ x: 0, y: 0 });
  const startDrawing = (e: React.PointerEvent) => {
    if (!isTeacher) return;
    const coords = getCanvasCoords(e);
    lastPos.current = coords;
    setIsDrawing(true);
  };

  const draw = (e: React.PointerEvent) => {
    if (!isDrawing || !isTeacher || !contextRef.current || !canvasRef.current) return;
    const coords = getCanvasCoords(e);
    const ctx = contextRef.current;
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
    if (channel) {
      channel.send({
        type: 'broadcast',
        event: 'draw_stroke',
        payload: {
          x0: lastPos.current.x / canvasRef.current.width,
          y0: lastPos.current.y / canvasRef.current.height,
          x1: coords.x / canvasRef.current.width,
          y1: coords.y / canvasRef.current.height,
          color,
          size: brushSize
        }
      });
    }
    lastPos.current = coords;
  };

  return (
    <div className="relative w-full h-full bg-[#0a0f1d] rounded-[2.5rem] overflow-hidden border-4 border-slate-800 shadow-2xl flex flex-col group/whiteboard">
      {isTeacher && (
        <div className="z-20 w-full flex flex-wrap items-center justify-between gap-4 bg-slate-900/90 backdrop-blur-md px-6 py-3 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex gap-2">
              {['#ffffff', '#ffeb3b', '#4caf50', '#2196f3', '#f44336'].map(c => (
                <button 
                  key={c} 
                  onClick={() => setColor(c)} 
                  className={`w-8 h-8 rounded-full border-2 transition-all ${color === c ? 'border-white scale-125 shadow-lg' : 'border-transparent opacity-50 hover:opacity-100'}`} 
                  style={{ backgroundColor: c }} 
                />
              ))}
            </div>
            <div className="flex items-center gap-3 ml-4 bg-slate-800 px-4 py-1.5 rounded-full">
               <span className="text-[9px] font-black text-slate-400 uppercase italic">Cỡ bút</span>
               <input type="range" min="1" max="15" value={brushSize} onChange={(e) => setBrushSize(parseInt(e.target.value))} className="w-24 accent-yellow-500 cursor-pointer" />
            </div>
          </div>
          <button onClick={handleClear} className="px-5 py-2 bg-red-600 text-white rounded-xl font-black text-[9px] uppercase transition-all shadow-lg hover:bg-red-500 active:scale-95">Xoá Bảng 🧹</button>
        </div>
      )}

      <div ref={containerRef} className="relative flex-1 bg-[#0a0f1d] flex items-center justify-center overflow-hidden">
        <canvas
          ref={canvasRef}
          onPointerDown={startDrawing}
          onPointerMove={draw}
          onPointerUp={() => setIsDrawing(false)}
          onPointerOut={() => setIsDrawing(false)}
          className={`bg-[#1a2333] shadow-inner touch-none ${isTeacher ? 'cursor-crosshair' : 'cursor-default'}`}
        />
        
        <div 
          className="absolute top-4 left-4 z-50 flex items-center gap-3 pointer-events-none"
        >
           <div className="relative flex items-center justify-center w-8 h-8">
              <div className="absolute inset-0 bg-yellow-500 rounded-full animate-ping opacity-20" />
              <div className="relative w-3 h-3 bg-yellow-500 rounded-full border-2 border-white" />
           </div>
           <div className="bg-slate-900/80 backdrop-blur-sm px-4 py-1.5 rounded-full border border-white/10">
              <span className="text-white text-[9px] font-black uppercase tracking-widest italic">
                 {isTeacher ? 'CHẾ ĐỘ GIẢNG BÀI' : 'MÀN HÌNH THEO DÕI'}
              </span>
           </div>
        </div>
      </div>
    </div>
  );
};

export default Whiteboard;
