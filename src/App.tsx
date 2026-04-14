/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Trash2, CheckCircle2, Settings as SettingsIcon, X, AlignLeft, Minus } from 'lucide-react';

type Priority = 'overtime' | 'urgent' | 'waiting' | 'not-yet';

interface Task {
  id: string;
  text: string;
  details?: string;
  priority: Priority;
  completed: boolean;
  createdAt: number;
  completedAt?: number;
  isChecking?: boolean;
  priorityUpdatedAt: number;
}

interface AppSettings {
  autoOpenDetails: boolean;
  autoStart: boolean;
  enableTimeShift: boolean;
  waitingToUrgentDays: number;
  urgentToOvertimeDays: number;
  theme: 'dark' | 'light';
  opacity: number;
  bgColor: string;
  alwaysOnTop: boolean;
}

const defaultSettings: AppSettings = {
  autoOpenDetails: false,
  autoStart: false,
  enableTimeShift: false,
  waitingToUrgentDays: 3,
  urgentToOvertimeDays: 2,
  theme: 'dark',
  opacity: 70,
  bgColor: '#0f172a',
  alwaysOnTop: false,
};

const priorities: { value: Priority; label: string; color: string; bg: string; border: string }[] = [
  { value: 'overtime', label: 'Overtime', color: 'text-red-400', bg: 'bg-red-500/20', border: 'border-red-500/50' },
  { value: 'urgent', label: 'Urgent', color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20' },
  { value: 'waiting', label: 'Waiting', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  { value: 'not-yet', label: 'Not Yet', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
];

let isTrayInitialized = false;

const isTauriEnv = () => {
  return typeof window !== 'undefined' && 
    ('__TAURI_INTERNALS__' in window || '__TAURI_IPC__' in window || '__TAURI__' in window);
};

const performTauriAction = async (action: string, args?: any) => {
  if (!isTauriEnv()) return false;
  try {
    const windowApi = await import('@tauri-apps/api/window');
    const win = windowApi.getCurrentWindow ? windowApi.getCurrentWindow() : (windowApi as any).appWindow;
    if (win) {
      if (action === 'minimize') await win.minimize();
      else if (action === 'close') {
        if (win.hide) await win.hide();
        else await win.close();
      }
      else if (action === 'setAlwaysOnTop') await win.setAlwaysOnTop(args);
      else if (action === 'startResizeDragging') {
        if (win.startResizeDragging) await win.startResizeDragging(args);
        else if (win.startResizing) await win.startResizing('bottomRight');
      }
      return true;
    }
  } catch (e) {
    console.error(`Tauri action ${action} failed. Check capabilities/permissions:`, e);
    return true; // Return true to prevent falling back to browser behavior
  }
  return false;
};

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [activeTab, setActiveTab] = useState<'todo' | 'finished'>('todo');
  const [newTaskText, setNewTaskText] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<Priority>('not-yet');
  const [isLoaded, setIsLoaded] = useState(false);
  
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isClosed, setIsClosed] = useState(false);

  // Load from local storage on mount
  useEffect(() => {
    const savedTasks = localStorage.getItem('glass-todos');
    if (savedTasks) {
      try { setTasks(JSON.parse(savedTasks)); } catch (e) {}
    }
    const savedSettings = localStorage.getItem('glass-settings');
    if (savedSettings) {
      try { setSettings({ ...defaultSettings, ...JSON.parse(savedSettings) }); } catch (e) {}
    }
    setIsLoaded(true);
  }, []);

  // Tauri Tray and Taskbar Initialization
  useEffect(() => {
    const initTauri = async () => {
      if (!isTauriEnv() || isTrayInitialized) return;
      isTrayInitialized = true;
      
      try {
        const windowApi = await import('@tauri-apps/api/window');
        const win = windowApi.getCurrentWindow ? windowApi.getCurrentWindow() : (windowApi as any).appWindow;
        
        // Hide from taskbar
        if (win && win.setSkipTaskbar) {
          await win.setSkipTaskbar(true);
        }

        // Setup System Tray
        const trayApi = await import('@tauri-apps/api/tray');
        const existingTray = await trayApi.TrayIcon.getById('main-tray');
        
        if (!existingTray) {
          const menuApi = await import('@tauri-apps/api/menu');
          const appApi = await import('@tauri-apps/api/app');
          
          const toggleVisibility = async () => {
            if (win) {
              const isVisible = await win.isVisible();
              if (isVisible) {
                await win.hide();
              } else {
                await win.show();
                await win.setFocus();
              }
            }
          };

          const toggleItem = await menuApi.MenuItem.new({ text: 'Show/Hide', action: toggleVisibility });
          const quitItem = await menuApi.MenuItem.new({ text: 'Quit', action: () => win?.close() });
          const menu = await menuApi.Menu.new({ items: [toggleItem, quitItem] });
          
          let defaultIcon;
          try {
            defaultIcon = await appApi.defaultWindowIcon();
          } catch (e) {
            console.warn('Could not load default window icon (missing app:allow-default-window-icon permission?)', e);
          }

          await trayApi.TrayIcon.new({
            id: 'main-tray',
            tooltip: 'Todo Widget',
            icon: defaultIcon || undefined,
            menu,
            action: (e) => {
              if (e.type === 'Click') {
                toggleVisibility();
              }
            }
          });
        }
      } catch (e) {
        console.error('Failed to initialize Tauri tray/taskbar:', e);
      }
    };
    
    initTauri();
  }, []);

  useEffect(() => {
    const updateAlwaysOnTop = async () => {
      await performTauriAction('setAlwaysOnTop', settings.alwaysOnTop);
    };
    if (isLoaded) {
      updateAlwaysOnTop();
    }
  }, [settings.alwaysOnTop, isLoaded]);

  // Save to local storage on change
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('glass-todos', JSON.stringify(tasks));
      localStorage.setItem('glass-settings', JSON.stringify(settings));
    }
  }, [tasks, settings, isLoaded]);

  // Time-Shift Logic
  useEffect(() => {
    if (!isLoaded || !settings.enableTimeShift) return;

    const checkTimeShift = () => {
      setTasks(prev => {
        let changed = false;
        const now = Date.now();
        const updated = prev.map(t => {
          if (t.completed) return t;
          const lastUpdate = t.priorityUpdatedAt || t.createdAt;
          const daysSinceUpdate = (now - lastUpdate) / (1000 * 60 * 60 * 24);
          
          if (t.priority === 'waiting' && daysSinceUpdate >= settings.waitingToUrgentDays) {
            changed = true;
            return { ...t, priority: 'urgent', priorityUpdatedAt: now };
          }
          if (t.priority === 'urgent' && daysSinceUpdate >= settings.urgentToOvertimeDays) {
            changed = true;
            return { ...t, priority: 'overtime', priorityUpdatedAt: now };
          }
          return t;
        });
        return changed ? updated : prev;
      });
    };

    checkTimeShift();
    const interval = setInterval(checkTimeShift, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [isLoaded, settings]);

  const addTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskText.trim()) return;

    const newTask: Task = {
      id: crypto.randomUUID(),
      text: newTaskText.trim(),
      priority: newTaskPriority,
      completed: false,
      createdAt: Date.now(),
      priorityUpdatedAt: Date.now(),
    };

    setTasks(prev => [newTask, ...prev]);
    setNewTaskText('');
    
    if (settings.autoOpenDetails) {
      setEditingTaskId(newTask.id);
    }
  };

  const updateTask = (id: string, updates: Partial<Task>) => {
    setTasks(prev => prev.map(t => {
      if (t.id === id) {
        const updatedTask = { ...t, ...updates };
        if (updates.priority && updates.priority !== t.priority) {
          updatedTask.priorityUpdatedAt = Date.now();
        }
        return updatedTask;
      }
      return t;
    }));
  };

  const toggleTask = (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    if (!task.completed && !task.isChecking) {
      setTasks(prev => prev.map(t => t.id === id ? { ...t, isChecking: true } : t));
      setTimeout(() => {
        setTasks(prev => {
          const updated = prev.map(t => t.id === id ? { ...t, completed: true, isChecking: false, completedAt: Date.now() } : t);
          const finished = updated.filter(t => t.completed).sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
          const keptFinishedIds = new Set(finished.slice(0, 15).map(t => t.id));
          return updated.filter(t => !t.completed || keptFinishedIds.has(t.id));
        });
      }, 400);
    } else if (task.completed) {
      setTasks(prev => prev.map(t => t.id === id ? { ...t, completed: false, completedAt: undefined, isChecking: false } : t));
    }
  };

  const deleteTask = (id: string) => setTasks(prev => prev.filter(t => t.id !== id));

  const handleAutoStartToggle = async (checked: boolean) => {
    setSettings(s => ({ ...s, autoStart: checked }));
    try {
      if (isTauriEnv()) {
        const autostart = await import('@tauri-apps/plugin-autostart');
        if (checked) await autostart.enable();
        else await autostart.disable();
      }
    } catch (e) {
      console.warn('Autostart plugin not available or failed', e);
    }
  };

  const getPriorityWeight = (p: Priority) => {
    switch(p) {
      case 'overtime': return 4;
      case 'urgent': return 3;
      case 'waiting': return 2;
      case 'not-yet': return 1;
      default: return 0;
    }
  };

  const todoTasks = tasks
    .filter(t => !t.completed)
    .sort((a, b) => {
      const weightDiff = getPriorityWeight(b.priority) - getPriorityWeight(a.priority);
      if (weightDiff !== 0) return weightDiff;
      return b.createdAt - a.createdAt;
    });

  const finishedTasks = tasks
    .filter(t => t.completed)
    .sort((a, b) => {
      const weightDiff = getPriorityWeight(b.priority) - getPriorityWeight(a.priority);
      if (weightDiff !== 0) return weightDiff;
      return (b.completedAt || 0) - (a.completedAt || 0);
    });
  const displayedTasks = activeTab === 'todo' ? todoTasks : finishedTasks;
  const editingTask = tasks.find(t => t.id === editingTaskId);

  const isLight = settings.theme === 'light';
  const textColor = isLight ? 'text-slate-800' : 'text-white';
  const textMuted = isLight ? 'text-slate-500' : 'text-white/50';
  const textFaint = isLight ? 'text-slate-400' : 'text-white/30';
  const borderLight = isLight ? 'border-slate-200/50' : 'border-white/10';
  const bgInput = isLight ? 'bg-white/50' : 'bg-black/20';
  const bgHover = isLight ? 'hover:bg-slate-200/50' : 'hover:bg-white/10';
  const bgCard = isLight ? 'bg-white/40 border-white/40 hover:bg-white/60' : 'bg-white/10 border-white/10 hover:bg-white/15';
  const bgCardDone = isLight ? 'bg-slate-100/30 border-slate-200/30' : 'bg-white/5 border-white/5';
  
  // Convert hex to rgba for the background
  const hexToRgba = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha / 100})`;
  };

  const currentOpacity = settings.opacity;
  
  const widgetBgStyle = {
    backgroundColor: hexToRgba(settings.bgColor, currentOpacity),
    transition: 'background-color 0.3s ease',
  };

  if (!isLoaded) return null;
  if (isClosed) return null;

  return (
    <div className={`w-screen h-screen font-sans selection:bg-indigo-500/30 overflow-hidden ${textColor} ${settings.theme === 'dark' ? 'dark' : ''} ${!isTauriEnv() ? 'bg-gradient-to-br from-slate-800 via-indigo-900 to-slate-900' : 'bg-transparent'}`}>
      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}
        className={`glass-widget w-full h-full flex flex-col relative ${!isTauriEnv() ? 'backdrop-blur-xl' : ''}`}
        style={widgetBgStyle}
      >
        {/* Resize Handle */}
        {!isMinimized && (
          <div className={`absolute bottom-1 right-1 ${textFaint} z-50 cursor-se-resize`} onMouseDown={async (e) => {
            e.preventDefault();
            await performTauriAction('startResizeDragging', 'SouthEast');
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="21 15 15 21"></polyline><polyline points="21 8 8 21"></polyline>
            </svg>
          </div>
        )}

        {/* Header */}
        <div className="p-4 pb-0 shrink-0 select-none flex flex-col" style={{ WebkitAppRegion: 'drag' } as any} data-tauri-drag-region>
          <div className="flex justify-between items-center mb-4" data-tauri-drag-region>
            <h1 className={`text-lg font-semibold ${isLight ? 'text-slate-800' : 'text-white/90'} tracking-tight pointer-events-none`}>Tasks</h1>
            <div className="flex items-center space-x-1" style={{ WebkitAppRegion: 'no-drag' } as any}>
              <button 
                onClick={() => setIsSettingsOpen(true)}
                className={`p-1.5 ${textMuted} ${bgHover} rounded-lg transition-all`}
              >
                <SettingsIcon size={14} />
              </button>
              <button 
                onClick={async () => { 
                  const handled = await performTauriAction('close');
                  if (!handled) {
                    setIsClosed(true);
                    window.close();
                  }
                }}
                className={`p-1.5 ${textMuted} hover:bg-red-500/20 hover:text-red-500 rounded-lg transition-all`}
              >
                <X size={14} />
              </button>
            </div>
          </div>
          
          <AnimatePresence>
            {!isMinimized && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }} 
                animate={{ opacity: 1, height: 'auto' }} 
                exit={{ opacity: 0, height: 0 }}
                className={`flex space-x-1 ${bgInput} p-1 rounded-xl mb-4`} 
                style={{ WebkitAppRegion: 'no-drag' } as any}
              >
                <button onClick={() => setActiveTab('todo')} className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-colors relative ${activeTab === 'todo' ? textColor : `${textMuted} hover:${textColor}`}`}>
                  {activeTab === 'todo' && <motion.div layoutId="activeTab" className={`absolute inset-0 ${isLight ? 'bg-white shadow-sm' : 'bg-white/10 border border-white/10'} rounded-lg`} transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }} />}
                  <span className="relative z-10 whitespace-nowrap">To Do ({todoTasks.length})</span>
                </button>
                <button onClick={() => setActiveTab('finished')} className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-colors relative ${activeTab === 'finished' ? textColor : `${textMuted} hover:${textColor}`}`}>
                  {activeTab === 'finished' && <motion.div layoutId="activeTab" className={`absolute inset-0 ${isLight ? 'bg-white shadow-sm' : 'bg-white/10 border border-white/10'} rounded-lg`} transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }} />}
                  <span className="relative z-10 whitespace-nowrap">Finished ({finishedTasks.length})</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Task Input */}
        <AnimatePresence mode="popLayout">
          {!isMinimized && activeTab === 'todo' && (
            <motion.div initial={{ opacity: 0, y: -10, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }} exit={{ opacity: 0, y: -10, height: 0 }} className="px-4 pb-3 shrink-0 overflow-hidden">
              <form onSubmit={addTask} className="space-y-2.5">
                <div className="relative">
                  <input type="text" value={newTaskText} onChange={(e) => setNewTaskText(e.target.value)} placeholder="What needs to be done?" className={`w-full ${bgInput} ${borderLight} border rounded-xl py-2 pl-3 pr-10 text-sm ${textColor} placeholder-${isLight ? 'slate-400' : 'white/30'} focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-inset focus:ring-indigo-500/50 transition-all shadow-inner`} />
                  <button type="submit" disabled={!newTaskText.trim()} className={`absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 ${isLight ? 'bg-slate-200 hover:bg-slate-300 text-slate-700' : 'bg-white/10 hover:bg-white/20 text-white'} rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-95`}><Plus size={14} /></button>
                </div>
                <div className="flex space-x-1.5">
                  {priorities.filter(p => p.value !== 'overtime').map(p => (
                    <button key={p.value} type="button" onClick={() => setNewTaskPriority(p.value)} className={`flex-1 py-1 px-1 rounded-lg text-[10px] font-medium border transition-all active:scale-95 ${newTaskPriority === p.value ? `${p.bg} ${p.border} ${p.color}` : `bg-transparent ${borderLight} ${textMuted} ${bgHover}`}`}>{p.label}</button>
                  ))}
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Task List */}
        <AnimatePresence>
          {!isMinimized && (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="flex-1 overflow-y-auto px-4 pb-4 custom-scrollbar relative flex flex-col"
            >
              <div className="space-y-2 flex-1 relative">
                <AnimatePresence mode="popLayout">
                  {displayedTasks.length === 0 && (
                    <motion.div key="empty-state" layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className={`absolute inset-0 flex flex-col items-center justify-center ${textFaint} space-y-3 pointer-events-none`}>
                      <CheckCircle2 size={36} strokeWidth={1.5} />
                      <p className="text-xs font-medium">{activeTab === 'todo' ? 'All caught up!' : 'No finished tasks.'}</p>
                    </motion.div>
                  )}
                  {displayedTasks.map(task => {
                    const priorityStyle = priorities.find(p => p.value === task.priority)!;
                    const isDone = task.completed || task.isChecking;
                    return (
                      <motion.div layout initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, x: activeTab === 'todo' ? 20 : -20 }} transition={{ type: 'spring', bounce: 0.25, duration: 0.4 }} key={task.id} 
                        onContextMenu={(e) => { e.preventDefault(); setEditingTaskId(task.id); }}
                        className={`group flex items-center justify-between p-2.5 rounded-xl border backdrop-blur-md transition-all gap-2 cursor-context-menu ${isDone ? bgCardDone : task.priority === 'overtime' ? 'bg-red-500/10 border-red-500/30 shadow-sm' : `${bgCard} shadow-sm hover:shadow-md`}`}
                      >
                      <div className="flex items-center gap-2.5 overflow-hidden flex-1">
                        <button onClick={() => toggleTask(task.id)} className={`flex-shrink-0 w-4 h-4 rounded-full border flex items-center justify-center transition-all active:scale-90 ${isDone ? 'bg-indigo-500/80 border-indigo-500/80 text-white' : `${isLight ? 'border-slate-300 hover:border-slate-400 hover:bg-slate-200/50' : 'border-white/30 hover:border-white/60 hover:bg-white/5'} text-transparent`}`}>
                          {isDone && <motion.svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-2.5 h-2.5"><motion.path d="M20 6L9 17l-5-5" initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 0.3, ease: "easeOut" }} /></motion.svg>}
                        </button>
                        <div className="flex flex-col overflow-hidden">
                          <span className={`text-xs truncate transition-all duration-300 ${isDone ? `${textFaint} line-through` : textColor}`}>{task.text}</span>
                          {task.details && !isDone && <span className={`text-[10px] ${textMuted} truncate flex items-center gap-1 mt-0.5`}><AlignLeft size={10} /> {task.details}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded border whitespace-nowrap ${isDone ? `${isLight ? 'bg-slate-200/50 border-slate-200' : 'bg-white/5 border-white/5'} ${textFaint}` : `${priorityStyle.bg} ${priorityStyle.border} ${priorityStyle.color}`} transition-colors duration-300`}>{priorityStyle.label}</span>
                        <button onClick={() => deleteTask(task.id)} className={`flex-shrink-0 p-1 ${textFaint} hover:text-rose-400 hover:bg-rose-400/10 rounded-md opacity-0 group-hover:opacity-100 transition-all focus:opacity-100 active:scale-90`}><Trash2 size={12} /></button>
                      </div>
                    </motion.div>
                  );
                })}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

    {/* Details Modal */}
        <AnimatePresence>
          {editingTask && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className={`absolute inset-0 z-50 ${isLight ? 'bg-white/90' : 'bg-[#0f172a]/90'} backdrop-blur-xl flex flex-col p-4`}>
              <div className="flex justify-between items-center mb-4">
                <h2 className={`text-sm font-semibold ${isLight ? 'text-slate-800' : 'text-white/90'}`}>Task Details</h2>
                <button onClick={() => setEditingTaskId(null)} className={`p-1 ${textMuted} ${bgHover} rounded-lg`}><X size={16} /></button>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pb-4">
                <div>
                  <label className={`text-[10px] ${textMuted} uppercase tracking-wider mb-1 block`}>Task Name</label>
                  <input type="text" value={editingTask.text} onChange={(e) => updateTask(editingTask.id, { text: e.target.value })} className={`w-full ${bgInput} border ${borderLight} rounded-lg py-2 px-3 text-sm ${textColor} focus:outline-none focus:border-indigo-500/50`} />
                </div>
                <div>
                  <label className={`text-[10px] ${textMuted} uppercase tracking-wider mb-1 block`}>Priority</label>
                  <div className="grid grid-cols-2 gap-2">
                    {priorities.map(p => (
                      <button key={p.value} onClick={() => updateTask(editingTask.id, { priority: p.value })} className={`py-1.5 px-2 rounded-lg text-xs font-medium border transition-all ${editingTask.priority === p.value ? `${p.bg} ${p.border} ${p.color}` : `bg-transparent ${borderLight} ${textMuted} ${bgHover}`}`}>{p.label}</button>
                    ))}
                  </div>
                </div>
                <div className="flex-1 flex flex-col h-full">
                  <label className={`text-[10px] ${textMuted} uppercase tracking-wider mb-1 block`}>Notes / Details</label>
                  <textarea value={editingTask.details || ''} onChange={(e) => updateTask(editingTask.id, { details: e.target.value })} placeholder="Add some details..." className={`w-full flex-1 min-h-[120px] ${bgInput} border ${borderLight} rounded-lg py-2 px-3 text-sm ${textColor} focus:outline-none focus:border-indigo-500/50 resize-none custom-scrollbar`} />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Settings Modal */}
        <AnimatePresence>
          {isSettingsOpen && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className={`absolute inset-0 z-50 ${isLight ? 'bg-white/95' : 'bg-[#0f172a]/95'} backdrop-blur-2xl flex flex-col p-4`}>
              <div className="flex justify-between items-center mb-6">
                <h2 className={`text-sm font-semibold ${isLight ? 'text-slate-800' : 'text-white/90'}`}>Settings</h2>
                <button onClick={() => setIsSettingsOpen(false)} className={`p-1 ${textMuted} ${bgHover} rounded-lg`}><X size={16} /></button>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pb-4 pr-1">
                
                {/* Appearance Settings */}
                <div className="space-y-3">
                  <div className={`flex items-center justify-between border-b ${borderLight} pb-1`}>
                    <h3 className={`text-[10px] ${textMuted} uppercase tracking-wider`}>Appearance</h3>
                    <button 
                      onClick={() => setSettings(s => ({ 
                        ...s, 
                        theme: s.theme,
                        opacity: s.theme === 'dark' ? 70 : 60,
                        bgColor: s.theme === 'dark' ? '#0f172a' : '#ffffff'
                      }))}
                      className={`text-[10px] ${textMuted} hover:${textColor} transition-colors`}
                    >
                      Restore Defaults
                    </button>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className={`text-xs ${textColor}`}>Theme</span>
                    <div className={`flex space-x-1 ${bgInput} p-1 rounded-lg`}>
                      <button onClick={() => setSettings(s => ({ ...s, theme: 'dark', bgColor: '#0f172a', opacity: 70 }))} className={`px-2 py-1 rounded text-xs transition-all ${settings.theme === 'dark' ? 'bg-slate-700 text-white shadow-sm' : textMuted}`}>Dark</button>
                      <button onClick={() => setSettings(s => ({ ...s, theme: 'light', bgColor: '#ffffff', opacity: 60 }))} className={`px-2 py-1 rounded text-xs transition-all ${settings.theme === 'light' ? 'bg-white text-slate-800 shadow-sm' : textMuted}`}>Light</button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className={`text-xs ${textColor}`}>Background Opacity</span>
                      <span className={`text-[10px] ${textMuted}`}>{settings.opacity}%</span>
                    </div>
                    <input type="range" min="0" max="100" value={settings.opacity} onChange={(e) => setSettings(s => ({ ...s, opacity: parseInt(e.target.value) }))} className={`w-full accent-indigo-500 h-1.5 ${bgInput} rounded-lg appearance-none cursor-pointer`} />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className={`text-xs ${textColor}`}>Background Color</span>
                    <div className="flex items-center gap-2">
                      <input type="color" value={settings.bgColor} onChange={(e) => setSettings(s => ({ ...s, bgColor: e.target.value }))} className="w-6 h-6 p-0 border-0 rounded cursor-pointer bg-transparent" />
                      <span className={`text-[10px] ${textMuted} uppercase`}>{settings.bgColor}</span>
                    </div>
                  </div>
                </div>

                {/* General Settings */}
                <div className="space-y-3">
                  <h3 className={`text-[10px] ${textMuted} uppercase tracking-wider border-b ${borderLight} pb-1`}>General</h3>
                  <label className="flex items-center justify-between group cursor-pointer">
                    <span className={`text-xs ${textMuted} group-hover:${textColor} transition-colors`}>Auto-open details on add</span>
                    <input type="checkbox" checked={settings.autoOpenDetails} onChange={(e) => setSettings(s => ({ ...s, autoOpenDetails: e.target.checked }))} className={`w-4 h-4 accent-indigo-500 ${bgInput} border-white/20 rounded cursor-pointer`} />
                  </label>
                  <label className="flex items-center justify-between group cursor-pointer">
                    <span className={`text-xs ${textMuted} group-hover:${textColor} transition-colors`}>Launch on startup</span>
                    <input type="checkbox" checked={settings.autoStart} onChange={(e) => handleAutoStartToggle(e.target.checked)} className={`w-4 h-4 accent-indigo-500 ${bgInput} border-white/20 rounded cursor-pointer`} />
                  </label>
                  <label className="flex items-center justify-between group cursor-pointer">
                    <span className={`text-xs ${textMuted} group-hover:${textColor} transition-colors`}>Always on top</span>
                    <input type="checkbox" checked={settings.alwaysOnTop} onChange={(e) => setSettings(s => ({ ...s, alwaysOnTop: e.target.checked }))} className={`w-4 h-4 accent-indigo-500 ${bgInput} border-white/20 rounded cursor-pointer`} />
                  </label>
                </div>

                {/* Time-Shift Settings */}
                <div className="space-y-3">
                  <div className={`flex items-center justify-between border-b ${borderLight} pb-1`}>
                    <h3 className={`text-[10px] ${textMuted} uppercase tracking-wider`}>Time-Shift (Auto Priority)</h3>
                    <input type="checkbox" checked={settings.enableTimeShift} onChange={(e) => setSettings(s => ({ ...s, enableTimeShift: e.target.checked }))} className={`w-4 h-4 accent-indigo-500 ${bgInput} border-white/20 rounded cursor-pointer`} />
                  </div>
                  
                  <div className={`space-y-3 transition-opacity ${settings.enableTimeShift ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs ${textColor}`}>Waiting → Urgent (Days)</span>
                      <input type="number" min="1" max="30" value={settings.waitingToUrgentDays} onChange={(e) => setSettings(s => ({ ...s, waitingToUrgentDays: parseInt(e.target.value) || 1 }))} className={`w-16 ${bgInput} border ${borderLight} rounded-md py-1 px-2 text-xs text-center ${textColor} focus:outline-none focus:border-indigo-500/50`} />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs ${textColor}`}>Urgent → Overtime (Days)</span>
                      <input type="number" min="1" max="30" value={settings.urgentToOvertimeDays} onChange={(e) => setSettings(s => ({ ...s, urgentToOvertimeDays: parseInt(e.target.value) || 1 }))} className={`w-16 ${bgInput} border ${borderLight} rounded-md py-1 px-2 text-xs text-center ${textColor} focus:outline-none focus:border-indigo-500/50`} />
                    </div>
                    <p className={`text-[10px] ${textFaint} leading-relaxed`}>
                      Tasks will automatically escalate in priority based on the days elapsed since their last priority change.
                    </p>
                  </div>
                </div>

              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </motion.div>
    </div>
  );
}
