'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FileSpreadsheet, 
  Upload, 
  AlertCircle, 
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

  // Auto-remove logs after 3 seconds
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
      // 1. Staff Header Detection (e.g. "16:31 凛 藤川凛" or "堀田渓介")
      const timeNameMatch = line.match(/^(\d{1,2}:\d{2})\s+(.+)$/);
      if (timeNameMatch) {
        const rawName = timeNameMatch[2].trim();
        const parts = rawName.split(/\s+/);
        // Take the last part as the real name if multiple parts exist
        currentStaffName = parts.length > 1 ? parts[parts.length - 1] : parts[0];
        // Clean up any remaining trailing text like "よろしく..." if it got caught
        currentStaffName = currentStaffName.replace(/[よろしく更新変りました]/g, '').trim();
        return;
      }

      // If a line is just a name like "篠塚昇太 篠塚昇太"
      if (!line.match(/^\d+日/) && !line.match(/\d\/\d/) && line.length > 1 && line.length < 20 && !line.includes('よろしく')) {
        const parts = line.split(/\s+/);
        const nameCandidate = parts.length > 1 ? parts[parts.length - 1] : parts[0];
        if (!nameCandidate.match(/^\d{4}/)) { // Skip date lines like 2026.03.26
          currentStaffName = nameCandidate;
          return;
        }
      }

      // 2. Date Header Detection (e.g. "3/28")
      const dateHeaderMatch = line.match(/^(\d{1,2})\/(\d{1,2})$/);
      if (dateHeaderMatch) {
        currentHeaderDate = `${new Date().getFullYear()}-${dateHeaderMatch[1].padStart(2, '0')}-${dateHeaderMatch[2].padStart(2, '0')}`;
        return;
      }

      // 3. Date with Day Pattern (e.g. "6日(月)")
      const dateDayMatch = line.match(/^(\d{1,2})日\s*[\(（][月火水木金土日][\)）]/);
      const timeRangeMatch = line.match(/(\d{1,2}(?:\.\d)?(?::\d{2})?)\s*-\s*(\d{1,2}(?:\.\d)?(?::\d{2})?)/);

      if (dateDayMatch && currentStaffName) {
        const day = dateDayMatch[1].padStart(2, '0');
        const now = new Date();
        let month = now.getMonth() + 1;
        let year = now.getFullYear();
        
        // Context-aware month selection:
        // If the day is small (e.g. 6th) and today is late in the month (e.g. 28th), assume next month.
        if (Number(day) < now.getDate() - 5) {
          month += 1;
          if (month > 12) { month = 1; year += 1; }
        }
        
        const targetDate = `${year}-${String(month).padStart(2, '0')}-${day}`;
        if (!firstDetectedDate || targetDate < firstDetectedDate) firstDetectedDate = targetDate;

        if (timeRangeMatch) {
          // Normalize decimal times (e.g. 18.5 -> 18:30)
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

      // 4. Fallback for older inline patterns
      const inlineDateMatch = line.match(/(\d{1,2})\/(\d{1,2})/);
      const fallbackTimeMatch = line.match(/(\d{1,2}(?::\d{2})?)\s*-\s*(\d{1,2}(?::\d{2})?)/);

      let targetDateFallback = currentHeaderDate;
      if (inlineDateMatch) {
        targetDateFallback = `${new Date().getFullYear()}-${inlineDateMatch[1].padStart(2, '0')}-${inlineDateMatch[2].padStart(2, '0')}`;
      }

      if (targetDateFallback && fallbackTimeMatch) {
        let name = line;
        if (inlineDateMatch) name = name.replace(inlineDateMatch[0], '');
        name = name.replace(fallbackTimeMatch[0], '')
                   .replace(/[\(\)（）月火水木金土日]/g, ' ')
                   .replace(/\s+/g, ' ')
                   .trim();
        
        const nameToUse = name || currentStaffName;
        if (nameToUse) {
          const timeValue = fallbackTimeMatch[0];
          const shiftId = `${nameToUse}-${targetDateFallback}`;
          const existingIndex = updatedShifts.findIndex(s => s.id === shiftId);

          if (existingIndex > -1) {
            if (updatedShifts[existingIndex].time !== timeValue) {
              updatedShifts[existingIndex].time = timeValue;
              newLogs.push({ id: Math.random().toString(), message: `Updated: ${nameToUse} on ${formatDateShort(targetDateFallback)}`, type: 'update' });
              newHighlighted.add(shiftId);
            }
          } else {
            updatedShifts.push({ id: shiftId, name: nameToUse, date: targetDateFallback, time: timeValue });
            newLogs.push({ id: Math.random().toString(), message: `Added: ${nameToUse} on ${formatDateShort(targetDateFallback)}`, type: 'insert' });
            newHighlighted.add(shiftId);
          }
        }
      }
    });

    if (firstDetectedDate) setStartDate(firstDetectedDate);
    setShifts(updatedShifts);
    setLogs(prev => [...prev, ...newLogs]);
    setHighlightedCells(newHighlighted);
    setTextInput('');
    setIsAnalyzing(false);
    setTimeout(() => setHighlightedCells(new Set()), 2000);
  };

  const handleExport = () => {
    const names = Array.from(new Set(shifts.map(s => s.name))).sort();
    // Use a wider range for export, perhaps the month or all detected dates
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
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#050505] text-foreground p-4 md:p-8 font-sans transition-colors duration-500">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-gray-200 dark:border-white/10 pb-6">
          <div className="space-y-1">
            <h1 className="text-4xl font-bold tracking-tighter flex items-center gap-2">
              <FileSpreadsheet className="w-8 h-8 opacity-90" />
              Shift Assistant
            </h1>
            <p className="text-muted-foreground font-mono text-xs uppercase tracking-widest opacity-60">
              Line Text → Master Excel Matrix
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={handleExport}
              disabled={shifts.length === 0}
              className="flex items-center gap-2 px-5 py-2.5 bg-foreground text-background font-medium rounded-full active:scale-95 transition-transform disabled:opacity-50 disabled:active:scale-100"
            >
              <Download className="w-4 h-4" />
              Excel Export
            </button>
          </div>
        </header>

        {/* Main Content: Bento Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Input Area */}
          <section className="lg:col-span-5 space-y-4">
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-gray-200 to-gray-400 dark:from-white/10 dark:to-white/20 rounded-2xl blur opacity-30 group-focus-within:opacity-100 transition duration-500"></div>
              <div className="relative bg-white dark:bg-[#111] border border-gray-200 dark:border-white/10 rounded-2xl overflow-hidden shadow-sm">
                <div className="p-4 border-b border-gray-100 dark:border-white/5 flex items-center justify-between">
                  <span className="text-xs font-mono opacity-50 flex items-center gap-2">
                    <Upload className="w-3 h-3" />
                    PASTE LINE TEXT HERE
                  </span>
                  {isAnalyzing && (
                    <div className="flex items-center gap-2 text-xs text-blue-500 font-mono animate-pulse">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      ANALYZING...
                    </div>
                  )}
                </div>
                <textarea
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Example:
3/28
田中 9:00-18:00
佐藤 10:00-19:00

OR 

田中 3/28 9-18"
                  className="w-full h-80 bg-transparent p-6 outline-none resize-none font-mono text-sm placeholder:opacity-30 leading-relaxed"
                />
                <div className="p-4 bg-gray-50 dark:bg-white/5 border-t border-gray-100 dark:border-white/5">
                  <button 
                    onClick={handleParse}
                    disabled={!textInput.trim() || isAnalyzing}
                    className="w-full py-4 bg-foreground text-background rounded-xl font-bold flex items-center justify-center gap-3 active:scale-[0.98] transition-all disabled:opacity-50"
                  >
                    {isAnalyzing ? "Processing..." : "Sync Shifts"}
                    {!isAnalyzing && <Plus className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Logs Area */}
            <div className="h-24 overflow-hidden relative">
              <AnimatePresence mode="popLayout">
                {logs.map((log) => (
                  <motion.div
                    key={log.id}
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95, filter: "blur(4px)" }}
                    className={cn(
                      "flex items-center gap-3 p-3 mb-2 rounded-lg text-sm border font-medium",
                      log.type === 'update' 
                        ? "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400" 
                        : "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                    )}
                  >
                    {log.type === 'update' ? <CheckCircle2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    {log.message}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </section>

          {/* Dashboard Preview */}
          <section className="lg:col-span-7 space-y-4">
            <div className="bg-white dark:bg-[#111] border border-gray-200 dark:border-white/10 rounded-2xl shadow-sm overflow-hidden flex flex-col h-full">
              <div className="p-6 border-b border-gray-200 dark:border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <TableIcon className="w-5 h-5" />
                    Preview Dashboard
                  </h2>
                  <div className="flex items-center bg-gray-100 dark:bg-white/5 rounded-full p-1 border border-gray-200 dark:border-white/10">
                    <button 
                      onClick={() => {
                        const d = new Date(startDate);
                        d.setDate(d.getDate() - 7);
                        setStartDate(d.toISOString().split('T')[0]);
                      }}
                      className="p-1 hover:bg-white dark:hover:bg-white/10 rounded-full transition-all"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-mono px-3">
                      {formatDateShort(previewDates[0])} ~ {formatDateShort(previewDates[6])}
                    </span>
                    <button 
                      onClick={() => {
                        const d = new Date(startDate);
                        d.setDate(d.getDate() + 7);
                        setStartDate(d.toISOString().split('T')[0]);
                      }}
                      className="p-1 hover:bg-white dark:hover:bg-white/10 rounded-full transition-all"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-amber-500 rounded-full animate-pulse" />
                  <span className="text-[10px] font-mono opacity-50 uppercase tracking-tighter">Real-time Preview</span>
                </div>
              </div>

              <div className="overflow-x-auto flex-1">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="p-4 text-left text-xs font-mono opacity-40 sticky left-0 bg-white dark:bg-[#111] z-10 border-b border-r border-gray-100 dark:border-white/5">STAFF NAME</th>
                      {previewDates.map(date => {
                        const count = getStaffCountForDate(date);
                        const isUnderstaffed = count <= 2 && count > 0;
                        return (
                          <th key={date} className={cn(
                            "p-4 text-center min-w-[100px] border-b border-gray-100 dark:border-white/5 transition-colors",
                            isUnderstaffed ? "bg-red-500/5" : ""
                          )}>
                            <div className="text-sm font-bold">{formatDateShort(date)}</div>
                            <div className={cn(
                              "text-[10px] font-mono mt-1",
                              isUnderstaffed ? "text-red-500 font-bold" : "opacity-40"
                            )}>
                              {count}人{isUnderstaffed && " ⚠"}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {staffNames.length === 0 ? (
                      <tr>
                        <td colSpan={daysToPreview + 1} className="py-20 text-center opacity-20 font-mono italic text-sm">
                          {isAnalyzing ? (
                            <div className="flex flex-col items-center gap-4">
                              <Loader2 className="w-8 h-8 animate-spin" />
                              Analyzing shift patterns...
                            </div>
                          ) : (
                            "No shift data yet. Paste text to begin."
                          )}
                        </td>
                      </tr>
                    ) : (
                      staffNames.map(name => (
                        <tr key={name} className="group hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors">
                          <td className="p-4 text-sm font-bold sticky left-0 bg-white dark:bg-[#111] z-10 border-r border-gray-100 dark:border-white/5 group-hover:bg-gray-50 dark:group-hover:bg-white/[0.02]">
                            {name}
                          </td>
                          {previewDates.map(date => {
                            const shift = shifts.find(s => s.name === name && s.date === date);
                            const isHighlighted = highlightedCells.has(`${name}-${date}`);
                            return (
                              <td key={date} className={cn(
                                "p-4 text-center text-xs font-mono relative border-b border-gray-100 dark:border-white/5 transition-all duration-500",
                                isHighlighted ? "bg-blue-500/20 text-blue-600 dark:text-blue-400" : ""
                              )}>
                                {shift ? shift.time : '-'}
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
                <div className="p-6 border-t border-gray-200 dark:border-white/10 flex items-center justify-between text-xs opacity-50 font-mono">
                  <div className="flex gap-4">
                    <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-500/40" /> Updated</span>
                    <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-500/20" /> Understaffed</span>
                  </div>
                  <button 
                    onClick={() => { if(confirm("Clear all data?")) setShifts([]); }}
                    className="flex items-center gap-1 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                    Reset Dashboard
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Footer info */}
        <footer className="pt-8 text-center text-[10px] font-mono opacity-30 uppercase tracking-[0.2em]">
          Shift Assistant Pro • Precision Engineering for Workflow Optimization
        </footer>
      </div>
    </div>
  );
}
