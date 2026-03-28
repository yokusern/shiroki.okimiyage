'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FileSpreadsheet, 
  Upload, 
  CheckCircle2, 
  Trash2, 
  Plus, 
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Table as TableIcon
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface Shift {
  id: string; // name-date
  name: string;
  date: string; // YYYY-MM-DD
  time: string;
}

interface LogEntry {
  id: string;
  message: string;
  type: 'update' | 'insert';
}

// --- Utils ---
const getTodayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const getDatesInRange = (startDate: string, days: number) => {
  const dates = [];
  const start = new Date(startDate);
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return dates;
};

const formatDateShort = (dateStr: string) => {
  const [y, m, d] = dateStr.split('-');
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  const dow = ['日', '月', '火', '水', '木', '金', '土'][date.getDay()];
  return `${m}/${d}(${dow})`;
};

// --- Page Component ---
export default function ShiftPage() {
  const [textInput, setTextInput] = useState('');
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [startDate, setStartDate] = useState(getTodayStr());
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [highlightedCells, setHighlightedCells] = useState<Set<string>>(new Set());

  const daysToPreview = 7;
  const previewDates = getDatesInRange(startDate, daysToPreview);

  useEffect(() => {
    if (logs.length > 0) {
      const timer = setTimeout(() => {
        setLogs(prev => prev.slice(1));
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [logs]);

  const handleParse = async () => {
    if (!textInput.trim()) return;

    setIsAnalyzing(true);
    await new Promise(r => setTimeout(r, 600));

    const lines = textInput.split('\n').map(l => l.trim()).filter(l => l !== '');
    const newLogs: LogEntry[] = [];
    const updatedShifts = [...shifts];
    const newHighlighted = new Set<string>();

    let currentStaffName: string | null = null;
    let currentHeaderDate: string | null = null;
    let firstDetectedDate: string | null = null;

    lines.forEach(line => {
      // 1. Staff Header Detection
      const timeNameMatch = line.match(/^(\d{1,2}:\d{2})\s+(.+)$/);
      if (timeNameMatch) {
        const rawName = timeNameMatch[2].trim();
        const parts = rawName.split(/\s+/);
        currentStaffName = parts.length > 1 ? parts[parts.length - 1] : parts[0];
        currentStaffName = currentStaffName.replace(/[よろしく更新変りました]/g, '').trim();
        return;
      }

      if (!line.match(/^\d+日/) && !line.match(/\d\/\d/) && line.length > 1 && line.length < 20 && !line.includes('よろしく')) {
        const parts = line.split(/\s+/);
        const nameCandidate = parts.length > 1 ? parts[parts.length - 1] : parts[0];
        if (!nameCandidate.match(/^\d{4}/)) {
          currentStaffName = nameCandidate;
          return;
        }
      }

      // 2. Date Header
      const dateHeaderMatch = line.match(/^(\d{1,2})\/(\d{1,2})$/);
      if (dateHeaderMatch) {
        currentHeaderDate = `${new Date().getFullYear()}-${dateHeaderMatch[1].padStart(2, '0')}-${dateHeaderMatch[2].padStart(2, '0')}`;
        return;
      }

      // 3. Date with Day Pattern
      const dateDayMatch = line.match(/^(\d{1,2})日\s*[\(（][月火水木金土日][\)）]/);
      const timeRangeMatch = line.match(/(\d{1,2}(?:\.\d)?(?::\d{2})?)\s*-\s*(\d{1,2}(?:\.\d)?(?::\d{2})?)/);

      if (dateDayMatch && currentStaffName) {
        const day = dateDayMatch[1].padStart(2, '0');
        const now = new Date();
        let month = now.getMonth() + 1;
        let year = now.getFullYear();
        
        if (Number(day) < now.getDate() - 5) {
          month += 1;
          if (month > 12) { month = 1; year += 1; }
        }
        
        const targetDate = `${year}-${String(month).padStart(2, '0')}-${day}`;
        if (!firstDetectedDate || targetDate < firstDetectedDate) firstDetectedDate = targetDate;

        if (timeRangeMatch) {
          const normalizeTime = (t: string) => {
            if (t.includes('.')) {
              const [h, f] = t.split('.');
              return `${h.padStart(2, '0')}:${f === '5' ? '30' : '00'}`;
            }
            if (!t.includes(':')) return `${t.padStart(2, '0')}:00`;
            return t.padStart(5, '0');
          };
          
          const timeValue = `${normalizeTime(timeRangeMatch[1])}-${normalizeTime(timeRangeMatch[2])}`;
          const shiftId = `${currentStaffName}-${targetDate}`;
          const existingIndex = updatedShifts.findIndex(s => s.id === shiftId);

          if (existingIndex > -1) {
            if (updatedShifts[existingIndex].time !== timeValue) {
              updatedShifts[existingIndex].time = timeValue;
              newLogs.push({ id: Math.random().toString(), message: `Updated: ${currentStaffName} on ${formatDateShort(targetDate)}`, type: 'update' });
              newHighlighted.add(shiftId);
            }
          } else {
            updatedShifts.push({ id: shiftId, name: currentStaffName, date: targetDate, time: timeValue });
            newLogs.push({ id: Math.random().toString(), message: `Added: ${currentStaffName} on ${formatDateShort(targetDate)}`, type: 'insert' });
            newHighlighted.add(shiftId);
          }
        }
        return;
      }
    });

    if (firstDetectedDate && firstDetectedDate < startDate) setStartDate(firstDetectedDate);
    setShifts(updatedShifts);
    setLogs(prev => [...prev, ...newLogs]);
    setHighlightedCells(newHighlighted);
    setTextInput('');
    setIsAnalyzing(false);
    setTimeout(() => setHighlightedCells(new Set()), 2000);
  };

  const handleExport = () => {
    const names = Array.from(new Set(shifts.map(s => s.name))).sort();
    const allDates = Array.from(new Set(shifts.map(s => s.date))).sort();

    const data = names.map(name => {
      const row: any = { '氏名': name };
      allDates.forEach(date => {
        const s = shifts.find(sh => sh.name === name && sh.date === date);
        row[formatDateShort(date)] = s ? s.time : '';
      });
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Shift_Data");
    XLSX.writeFile(wb, `shift_export_${getTodayStr()}.xlsx`);
  };

  const staffNames = Array.from(new Set(shifts.map(s => s.name))).sort();

  const getStaffCountForDate = (date: string) => {
    return shifts.filter(s => s.date === date).length;
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070708] text-slate-900 dark:text-slate-100 font-sans selection:bg-indigo-500/30 selection:text-indigo-900 dark:selection:text-indigo-200">
      <div className="fixed inset-0 pointer-events-none opacity-40 dark:opacity-20 z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-200 dark:bg-indigo-900/30 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-200 dark:bg-blue-900/30 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 md:px-8 py-10 lg:py-16 space-y-12">
        
        <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold tracking-widest uppercase">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
              </span>
              Shift Assistant V2
            </div>
            <h1 className="text-5xl lg:text-7xl font-extrabold tracking-tight leading-[0.9] text-slate-900 dark:text-white">
              Shift <span className="text-slate-400 dark:text-slate-600">to</span> Success.
            </h1>
            <p className="max-w-md text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
              LINEのテキストを解析し、最適なシフト表を1秒で生成。
              複雑な事務作業から、あなたを解放します。
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={handleExport}
              disabled={shifts.length === 0}
              className="group relative inline-flex items-center gap-3 px-8 py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-2xl overflow-hidden active:scale-95 transition-all shadow-xl shadow-slate-900/10 dark:shadow-white/5 disabled:opacity-50 disabled:active:scale-100"
            >
              <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500 to-blue-500 opacity-0 group-hover:opacity-10 dark:group-hover:opacity-100 dark:bg-none transition-opacity" />
              <Download className="w-5 h-5 relative z-10" />
              <span className="relative z-10">Excel Export</span>
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
          <section className="space-y-6">
            <div className="flex items-center justify-between px-2">
              <h3 className="text-sm font-bold tracking-widest uppercase opacity-40">Intelligence Input</h3>
              {isAnalyzing && (
                <div className="flex items-center gap-2 text-[10px] font-bold text-indigo-500 uppercase animate-pulse">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Neural Processing...
                </div>
              )}
            </div>
            
            <div className="group relative">
              <div className="absolute -inset-px bg-gradient-to-tr from-slate-200 to-slate-300 dark:from-white/10 dark:to-white/5 rounded-[2rem] transition-colors" />
              <div className="relative h-[480px] bg-white dark:bg-[#0c0c0e] border border-slate-200 dark:border-white/5 rounded-[2rem] overflow-hidden flex flex-col shadow-sm group-focus-within:shadow-2xl group-focus-within:shadow-indigo-500/10 transition-all duration-500">
                <textarea
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="ここにLINEのトークを丸ごと貼り付けてください..."
                  className="flex-1 w-full bg-transparent p-8 outline-none resize-none font-sans text-lg lg:text-xl placeholder:text-slate-300 dark:placeholder:text-slate-800 leading-[1.6]"
                />
                
                <div className="p-8 bg-slate-50/50 dark:bg-white/[0.02] border-t border-slate-100 dark:border-white/5 backdrop-blur-xl">
                  <button 
                    onClick={handleParse}
                    disabled={!textInput.trim() || isAnalyzing}
                    className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold flex items-center justify-center gap-4 shadow-lg shadow-indigo-600/20 active:scale-[0.98] transition-all disabled:opacity-30 disabled:bg-slate-400 dark:disabled:bg-slate-800"
                  >
                    {isAnalyzing ? (
                      <Loader2 className="w-6 h-6 animate-spin" />
                    ) : (
                      <>
                        <Upload className="w-5 h-5" />
                        <span>解析して反映</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="h-20 pointer-events-none relative overflow-visible">
              <AnimatePresence mode="popLayout">
                {logs.map((log) => (
                  <motion.div
                    key={log.id}
                    layout
                    initial={{ opacity: 0, x: -20, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9, filter: "blur(8px)" }}
                    className={cn(
                      "flex items-center gap-3 p-4 mb-3 rounded-2xl text-xs font-bold border shadow-lg backdrop-blur-md",
                      log.type === 'update' 
                        ? "bg-amber-400/5 dark:bg-amber-500/10 border-amber-400/20 text-amber-600 dark:text-amber-400 shadow-amber-500/5" 
                        : "bg-emerald-400/5 dark:bg-emerald-500/10 border-emerald-400/20 text-emerald-600 dark:text-emerald-400 shadow-emerald-500/5"
                    )}
                  >
                    <div className={cn("p-1 rounded-full", log.type === 'update' ? "bg-amber-500" : "bg-emerald-500")}>
                      {log.type === 'update' ? <CheckCircle2 className="w-3 h-3 text-white" /> : <Plus className="w-3 h-3 text-white" />}
                    </div>
                    {log.message}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </section>

          <section className="space-y-6">
            <div className="flex items-center justify-between px-2">
              <h3 className="text-sm font-bold tracking-widest uppercase opacity-40">Preview Analytics</h3>
              <div className="flex items-center gap-1.5 overflow-hidden rounded-full border border-slate-200 dark:border-white/5 p-0.5 bg-white/50 dark:bg-white/5 backdrop-blur-sm">
                <button 
                  onClick={() => {
                    const d = new Date(startDate);
                    d.setDate(d.getDate() - 7);
                    setStartDate(d.toISOString().split('T')[0]);
                  }}
                  className="p-1.5 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-all"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-[10px] font-bold px-3 tabular-nums">
                  {previewDates[0].replace(/-/g, '/')} ~ {previewDates[6].replace(/-/g, '/')}
                </span>
                <button 
                  onClick={() => {
                    const d = new Date(startDate);
                    d.setDate(d.getDate() + 7);
                    setStartDate(d.toISOString().split('T')[0]);
                  }}
                  className="p-1.5 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-all"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="relative group">
              <div className="absolute -inset-px bg-gradient-to-tr from-slate-200 to-slate-300 dark:from-white/10 dark:to-white/5 rounded-[2rem]" />
              <div className="relative h-[480px] bg-white dark:bg-[#0c0c0e] border border-slate-200 dark:border-white/5 rounded-[2rem] overflow-hidden flex flex-col shadow-sm">
                
                <div className="overflow-auto flex-1 custom-scrollbar">
                  <table className="w-full border-collapse">
                    <thead className="sticky top-0 z-20">
                      <tr>
                        <th className="p-6 text-left text-[10px] font-black tracking-widest text-slate-400 bg-white/95 dark:bg-[#0c0c0e]/95 backdrop-blur-sm border-b border-r border-slate-100 dark:border-white/5">STAFF</th>
                        {previewDates.map(date => {
                          const count = getStaffCountForDate(date);
                          const isUnderstaffed = count <= 2 && count > 0;
                          return (
                            <th key={date} className={cn(
                              "p-4 min-w-[120px] bg-white/95 dark:bg-[#0c0c0e]/95 backdrop-blur-sm border-b border-slate-100 dark:border-white/5 transition-colors text-center",
                              isUnderstaffed ? "bg-red-500/5" : ""
                            )}>
                              <div className="text-[11px] font-black opacity-30 tabular-nums">{date.split('-')[1]}/{date.split('-')[2]}</div>
                              <div className="text-xs font-black tracking-tighter">{['日', '月', '火', '水', '木', '金', '土'][new Date(date).getDay()]}</div>
                              <div className={cn(
                                "mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-black",
                                count === 0 ? "bg-slate-100 dark:bg-white/5 text-slate-400" :
                                isUnderstaffed ? "bg-red-500/10 text-red-500 animate-pulse" : "bg-emerald-500/10 text-emerald-500"
                              )}>
                                {count}名{isUnderstaffed && "！"}
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {staffNames.length === 0 ? (
                        <tr>
                          <td colSpan={daysToPreview + 1} className="py-32 text-center">
                            <div className="flex flex-col items-center gap-6 opacity-20">
                              <CalendarIcon className="w-16 h-16 stroke-[1]" />
                              <p className="text-sm font-bold tracking-widest uppercase">Select text to process</p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        staffNames.map(name => (
                          <tr key={name} className="group/row">
                            <td className="p-6 text-sm font-black sticky left-0 bg-white dark:bg-[#0c0c0e] z-10 border-b border-r border-slate-100 dark:border-white/5 group-hover/row:bg-slate-50 dark:group-hover/row:bg-white/5 transition-colors">
                              {name}
                            </td>
                            {previewDates.map(date => {
                              const shift = shifts.find(s => s.name === name && s.date === date);
                              const isHighlighted = highlightedCells.has(`${name}-${date}`);
                              return (
                                <td key={date} className={cn(
                                  "p-4 text-center tabular-nums border-b border-slate-100 dark:border-white/5 transition-all duration-300",
                                  isHighlighted ? "bg-indigo-500/20" : "group-hover/row:bg-slate-50/50 dark:group-hover/row:bg-white/[0.01]"
                                )}>
                                  {shift ? (
                                    <span className={cn(
                                      "inline-block px-3 py-1.5 rounded-xl text-[11px] font-bold tracking-tight shadow-sm border transition-transform group-hover:scale-110",
                                      isHighlighted ? "bg-indigo-500 text-white border-transparent" : "bg-white dark:bg-white/5 border-slate-200 dark:border-white/10"
                                    )}>
                                      {shift.time}
                                    </span>
                                  ) : (
                                    <span className="opacity-10 text-[10px]">—</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {shifts.length > 0 && (
                  <div className="p-6 border-t border-slate-100 dark:border-white/5 flex items-center justify-between text-[10px] font-black tracking-widest opacity-40 transition-opacity hover:opacity-100">
                    <div className="flex gap-6">
                      <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-indigo-500" /> SYNCED</div>
                      <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-red-500" /> ALERT</div>
                    </div>
                    <button 
                      onClick={() => { if(confirm("データを全てリセットしますか？")) setShifts([]); }}
                      className="flex items-center gap-2 hover:text-red-500 transition-colors uppercase"
                    >
                      <Trash2 className="w-4 h-4" />
                      Reset ALL
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

        <footer className="pt-16 flex items-center justify-between border-t border-slate-200 dark:border-white/5">
          <div className="flex items-center gap-3 grayscale opacity-30 hover:grayscale-0 hover:opacity-100 transition-all cursor-crosshair">
            <div className="w-8 h-8 bg-slate-900 dark:bg-white rounded-lg flex items-center justify-center text-white dark:text-slate-900 font-black">S</div>
            <span className="text-[10px] font-black tracking-[0.3em] uppercase">Shift Assistant Utility</span>
          </div>
          <p className="text-[9px] font-black opacity-20 uppercase tracking-[0.4em]">Designed for Performance • Built by Intelligence</p>
        </footer>
      </div>
      
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(0,0,0,0.05);
          border-radius: 20px;
        }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.05);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(0,0,0,0.1);
        }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.1);
        }
      `}</style>
    </div>
  );
}
