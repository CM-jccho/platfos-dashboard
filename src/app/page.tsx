"use client";

import React, { useState, useEffect, useRef } from 'react';
import {
  Upload,
  ChevronLeft,
  ChevronRight,
  FileCode,
  Plus,
  Database,
  Calendar as CalendarIcon2,
  Info,
  ExternalLink,
  BookOpen,
  Menu,
  X
} from 'lucide-react';
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  isSameDay,
  addDays,
  parseISO
} from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const CONFLUENCE_LINKS = [
  { title: "1. Run", links: [
    { name: "[Run][S7]", url: "https://platfos.atlassian.net/wiki/x/BIBnNw" },
    { name: "[Run][S1]", url: "https://platfos.atlassian.net/wiki/x/AYB8Nw" },
    { name: "[Run][S3]", url: "https://platfos.atlassian.net/wiki/x/AYB9Nw" },
    { name: "[Run][S4]", url: "https://platfos.atlassian.net/wiki/x/EIB8Nw" },
  ]},
  { title: "2. Core", links: [
    { name: "[Core][S1]", url: "https://platfos.atlassian.net/wiki/x/AQB_Nw" },
    { name: "[Core][S2]", url: "https://platfos.atlassian.net/wiki/x/EAB_Nw" },
    { name: "[Core][S3]", url: "https://platfos.atlassian.net/wiki/x/HwB_Nw" },
    { name: "[Core][S4]", url: "https://platfos.atlassian.net/wiki/x/LgB_Nw" },
    { name: "[Core][S5]", url: "https://platfos.atlassian.net/wiki/x/H4B8Nw" },
    { name: "[Core][S6]", url: "https://platfos.atlassian.net/wiki/x/PQB_Nw" },
  ]},
  { title: "3. Grow", links: [
    { name: "[Grow][S1]", url: "https://platfos.atlassian.net/wiki/x/EIB9Nw" },
    { name: "[Grow][S2]", url: "https://platfos.atlassian.net/wiki/x/AYB_Nw" },
    { name: "[Grow][S7]", url: "https://platfos.atlassian.net/wiki/x/H4B9Nw" },
  ]},
  { title: "4. Expand", links: [
    { name: "[Expand][S8]", url: "https://platfos.atlassian.net/wiki/x/EIB_Nw" },
  ]},
];

export default function Dashboard() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [files, setFiles] = useState<{ date: string; filename: string }[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [viewFile, setViewFile] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIsMounted(true);
    fetchFiles();
  }, []);

  useEffect(() => {
    const file = files.find(f => f.date === format(selectedDate, 'yyyy-MM-dd'));
    setViewFile(file ? `/data/${file.filename}` : null);
  }, [selectedDate, files]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const fetchFiles = async () => {
    try {
      const res = await fetch('/api/files');
      const data = await res.json();
      setFiles(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const dashMatch = file.name.match(/(?:^|_)(\d{4}-\d{2}-\d{2})(?=\.|$|_)/);
    const yyyymmddMatch = file.name.match(/(?:^|_)(\d{4})(\d{2})(\d{2})(?=\.|$|_)/);
    const yymmddMatch = file.name.match(/(?:^|_)(\d{2})(\d{2})(\d{2})(?=\.|$|_)/);

    if (!file.name.toLowerCase().endsWith('.html') || (!dashMatch && !yyyymmddMatch && !yymmddMatch)) {
      setToast({ message: "해당 파일은 관리자만 업로드 가능합니다.", type: "error" });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      setIsUploading(true);
      try {
        let uploadDate = format(selectedDate, 'yyyy-MM-dd');
        if (dashMatch) uploadDate = dashMatch[1];
        else if (yyyymmddMatch) uploadDate = `${yyyymmddMatch[1]}-${yyyymmddMatch[2]}-${yyyymmddMatch[3]}`;
        else if (yymmddMatch) uploadDate = `20${yymmddMatch[1]}-${yymmddMatch[2]}-${yymmddMatch[3]}`;

        await fetch('/api/upload', {
          method: 'POST',
          body: JSON.stringify({ htmlContent: content, date: uploadDate }),
        });
        await fetchFiles();
        const newDate = parseISO(uploadDate);
        setSelectedDate(newDate);
        setCurrentDate(newDate);
      } catch (err) {
        console.error(err);
      } finally {
        setIsUploading(false);
      }
    };
    reader.readAsText(file);
  };

  // ── 캘린더 렌더 (컴포넌트 아닌 함수) ──
  const renderCalendar = (onDateSelect?: () => void) => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const rows = [];
    let days: React.ReactNode[] = [];
    let day = startDate;

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        const cloneDay = new Date(day);
        const hasFile = files.some(f => f.date === format(cloneDay, "yyyy-MM-dd"));
        const isSelected = isSameDay(cloneDay, selectedDate);
        const isCurrentMonth = isSameMonth(cloneDay, monthStart);

        days.push(
          <div
            key={cloneDay.toString()}
            className={cn(
              "relative h-10 sm:h-11 flex items-center justify-center cursor-pointer transition-all rounded-xl",
              !isCurrentMonth ? "text-gray-300" : "text-gray-600 font-medium",
              isSelected
                ? "bg-violet-600 text-white shadow-lg shadow-violet-500/40 scale-105 z-10"
                : "hover:bg-violet-50 hover:text-violet-600 active:scale-95"
            )}
            onClick={() => {
              setSelectedDate(cloneDay);
              onDateSelect?.();
            }}
          >
            <span className="text-sm z-10">{format(cloneDay, "d")}</span>
            {hasFile && (
              <div className={cn(
                "absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full",
                isSelected ? "bg-white" : "bg-violet-500 animate-pulse"
              )} />
            )}
          </div>
        );
        day = addDays(day, 1);
      }
      rows.push(
        <div className="grid grid-cols-7 gap-1 sm:gap-1.5 px-4 sm:px-6 mb-1 sm:mb-1.5" key={day.toString()}>
          {days}
        </div>
      );
      days = [];
    }

    return (
      <div className="flex flex-col h-full overflow-y-auto">
        <div className="p-6 sm:p-8">
          <div className="flex items-center justify-between mb-8 sm:mb-10">
            <div>
              <h2 className="text-2xl font-black text-gray-900 leading-none mb-1">{format(currentDate, "MMMM")}</h2>
              <p className="text-sm font-bold text-gray-400 tracking-widest">{format(currentDate, "yyyy")}</p>
            </div>
            <div className="flex space-x-1">
              <button onClick={() => setCurrentDate(subMonths(currentDate, 1))}
                className="p-2 hover:bg-violet-50 hover:text-violet-600 rounded-xl text-gray-400 transition-all active:scale-90">
                <ChevronLeft size={22} />
              </button>
              <button onClick={() => setCurrentDate(addMonths(currentDate, 1))}
                className="p-2 hover:bg-violet-50 hover:text-violet-600 rounded-xl text-gray-400 transition-all active:scale-90">
                <ChevronRight size={22} />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5 px-4 sm:px-6 mb-4 sm:mb-6 text-center">
            {['S','M','T','W','T','F','S'].map((d, i) => (
              <span key={i} className="text-[10px] font-black text-gray-300 uppercase tracking-widest">{d}</span>
            ))}
          </div>
          {rows}
        </div>

        <div className="mt-auto p-6 sm:p-8 border-t border-gray-50/80 bg-gradient-to-b from-transparent to-gray-50/30">
          <div className="bg-violet-50/50 rounded-2xl p-4 sm:p-5 border border-violet-100/20 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[10px] font-black text-violet-400 uppercase tracking-[0.2em]">Dashboard Metrics</h3>
              <Info size={12} className="text-violet-300" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-gray-500">Total Activity</span>
              <span className="text-lg font-black text-violet-600">{files.length}</span>
            </div>
          </div>

          <div>
            <div className="flex items-center space-x-2 mb-4">
              <BookOpen size={14} className="text-violet-500" />
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Confluence Index</h3>
            </div>
            <div className="space-y-5 max-h-[280px] overflow-y-auto pr-1">
              {CONFLUENCE_LINKS.map((cat, idx) => (
                <div key={idx} className="space-y-2">
                  <h4 className="text-[11px] font-black text-gray-900 flex items-center">
                    <span className="w-1.5 h-1.5 bg-violet-400 rounded-full mr-2 shrink-0" />
                    {cat.title}
                  </h4>
                  <div className="grid grid-cols-2 gap-1.5">
                    {cat.links.map((link, lIdx) => (
                      <a key={lIdx} href={link.url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center justify-between p-2 bg-gray-50/50 hover:bg-violet-50 rounded-xl group transition-all border border-transparent hover:border-violet-100">
                        <span className="text-[10px] font-bold text-gray-500 group-hover:text-violet-600 uppercase truncate">{link.name}</span>
                        <ExternalLink size={9} className="text-gray-300 group-hover:text-violet-400 shrink-0 ml-1" />
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (!isMounted) return <div className="h-screen bg-gray-50" />;

  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-900 font-sans overflow-hidden">

      {/* ── Header ── */}
      <header className="flex items-center justify-between px-4 sm:px-8 py-4 sm:py-5 bg-white/70 backdrop-blur-xl border-b border-gray-100/50 shrink-0 z-30">
        <div className="flex items-center space-x-3 sm:space-x-5">
          <button
            className="sm:hidden p-2 rounded-xl hover:bg-violet-50 text-gray-500 active:scale-95 transition-all"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={22} />
          </button>
          <div className="p-2 sm:p-2.5 bg-violet-600 rounded-xl sm:rounded-2xl text-white shadow-lg shadow-violet-500/30">
            <Database size={18} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-base sm:text-xl font-extrabold text-gray-900 tracking-tight">Platfos Dashboard</h1>
            <div className="flex items-center space-x-1.5 text-violet-600">
              <CalendarIcon2 size={10} strokeWidth={2.5} />
              <p className="text-[10px] sm:text-xs font-bold tracking-wider uppercase">{format(selectedDate, "yyyy . MM . dd")}</p>
            </div>
          </div>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11 bg-violet-600 text-white rounded-xl sm:rounded-2xl hover:bg-violet-700 transition-all shadow-lg shadow-violet-200 active:scale-95"
        >
          <Plus size={20} strokeWidth={2.5} />
        </button>
        <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* 데스크톱 사이드바 */}
        <aside className="hidden sm:block w-80 lg:w-85 bg-white border-r border-gray-100/80 overflow-y-auto shrink-0">
          {renderCalendar()}
        </aside>

        {/* 모바일 드로어 */}
        <AnimatePresence>
          {sidebarOpen && (
            <>
              <motion.div
                key="overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/40 z-40 sm:hidden"
                onClick={() => setSidebarOpen(false)}
              />
              <motion.aside
                key="drawer"
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "spring", damping: 30, stiffness: 300 }}
                className="fixed left-0 top-0 h-full w-[80vw] max-w-xs bg-white z-50 sm:hidden shadow-2xl overflow-y-auto"
              >
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
                  <span className="font-black text-gray-900 text-sm">캘린더</span>
                  <button onClick={() => setSidebarOpen(false)}
                    className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-500 active:scale-95">
                    <X size={18} />
                  </button>
                </div>
                {renderCalendar(() => setSidebarOpen(false))}
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* 메인 */}
        <main className="flex-1 overflow-hidden p-3 sm:p-10 bg-gray-50/50">
          <AnimatePresence mode="wait">
            {viewFile ? (
              <motion.div
                key={selectedDate.toString()}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className="w-full h-full rounded-2xl sm:rounded-[2.5rem] overflow-auto bg-white shadow-lg border border-violet-100/50"
              >
                <iframe
                  src={viewFile}
                  className="w-full h-full border-none min-h-[600px]"
                  title="Dashboard Preview"
                  scrolling="yes"
                />
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full h-full flex items-center justify-center"
              >
                <div className="p-8 sm:p-12 bg-white rounded-[2rem] border border-violet-50 shadow-md flex flex-col items-center text-center max-w-xs w-full mx-4">
                  <div className="p-5 bg-violet-50 rounded-[1.5rem] mb-6 text-violet-600">
                    <FileCode size={40} strokeWidth={1.2} />
                  </div>
                  <h3 className="text-lg sm:text-2xl font-black text-gray-900 mb-2 tracking-tight">Archive Empty</h3>
                  <p className="text-gray-400 text-sm leading-relaxed mb-7 font-medium">
                    {format(selectedDate, "MMMM d")}에 저장된 대시보드가 없습니다.
                  </p>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-3.5 bg-violet-600 text-white rounded-[1.2rem] font-bold hover:bg-violet-700 transition-all active:scale-[0.97] flex items-center justify-center space-x-2"
                  >
                    <span>업로드</span>
                    <Plus size={16} strokeWidth={3} />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* 업로드 오버레이 */}
      <AnimatePresence>
        {isUploading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-gray-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="p-8 bg-white rounded-[2rem] shadow-2xl flex flex-col items-center space-y-6 max-w-xs w-full text-center"
            >
              <div className="relative">
                <div className="w-16 h-16 border-4 border-violet-50 rounded-full" />
                <motion.div
                  className="absolute top-0 w-16 h-16 border-4 border-violet-600 border-t-transparent rounded-full"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                />
                <div className="absolute inset-0 flex items-center justify-center text-violet-600">
                  <Upload size={24} />
                </div>
              </div>
              <div>
                <h4 className="text-lg font-black text-gray-900 mb-1">업로드 중</h4>
                <p className="text-sm text-gray-400 font-medium">잠시만 기다려주세요.</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 토스트 */}
      <AnimatePresence>
        {isMounted && toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: '-50%' }}
            animate={{ opacity: 1, y: 16, x: '-50%' }}
            exit={{ opacity: 0, y: -20, x: '-50%' }}
            className={cn(
              "fixed top-0 left-1/2 z-[100] px-5 py-3 rounded-2xl shadow-xl flex items-center space-x-2.5 border text-sm font-bold",
              toast.type === 'error' ? "bg-red-50 text-red-600 border-red-100" : "bg-violet-50 text-violet-600 border-violet-100"
            )}
          >
            <Info size={16} />
            <span>{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
