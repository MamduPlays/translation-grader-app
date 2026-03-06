import { useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { Session } from '@supabase/supabase-js';
import { Loader2, Calendar, CheckCircle2, AlertTriangle, ArrowLeft, User, Search, ChevronDown, ChevronUp, ChevronRight, ChevronLeft, Volume2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface TranslationHistoryProps {
  session: Session;
  onBack: () => void;
  isAdmin?: boolean;
}

interface HistoryItem {
  id: string;
  user_id: string;
  urdu_transcription: string;
  english_transcription: string;
  score: number;
  better_translation: string;
  mistakes: string[];
  feedback: string;
  created_at: string;
  audio_url?: string;
}

interface UserProfile {
  id: string;
  full_name: string;
  role: string;
}

export default function TranslationHistory({ session, onBack, isAdmin }: TranslationHistoryProps) {
  const [adminView, setAdminView] = useState<'users' | 'history'>(isAdmin ? 'users' : 'history');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    if (isAdmin && adminView === 'users') {
      fetchUsers();
    } else if (!isAdmin) {
      fetchHistory(session.user.id);
    }
  }, [session, isAdmin, adminView]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('role', 'user')
        .order('full_name');
      if (error) throw error;
      setUsers(data || []);
    } catch (err: any) {
      console.error('Error fetching users:', err);
      setError('Failed to load users.');
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async (userId: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('translations')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setHistory(data || []);
    } catch (err: any) {
      console.error('Error fetching history:', err);
      setError('Failed to load translation history.');
    } finally {
      setLoading(false);
    }
  };

  const handleUserSelect = (user: UserProfile) => {
    setSelectedUser(user);
    setAdminView('history');
    setCurrentPage(1);
    setSearchQuery('');
    setExpandedId(null);
    fetchHistory(user.id);
  };

  const handleBackToUsers = () => {
    setAdminView('users');
    setSelectedUser(null);
    setHistory([]);
    setCurrentPage(1);
    setSearchQuery('');
    setExpandedId(null);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  };

  const getScoreColor = (score: number) => {
    if (score >= 8) return 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20';
    if (score >= 5) return 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20';
    return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20';
  };

  // Pagination & Filtering Logic
  const filteredUsers = users.filter(u => 
    (u.full_name || '').toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const totalUserPages = Math.ceil(filteredUsers.length / ITEMS_PER_PAGE);
  const paginatedUsers = filteredUsers.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const totalHistoryPages = Math.ceil(history.length / ITEMS_PER_PAGE);
  const paginatedHistory = history.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const PaginationControls = ({ totalPages }: { totalPages: number }) => {
    if (totalPages <= 1) return null;
    return (
      <div className="flex items-center justify-between pt-6 border-t border-slate-200 dark:border-slate-800/60 mt-6">
        <button
          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
          disabled={currentPage === 1}
          className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Previous
        </button>
        <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">
          Page {currentPage} of {totalPages}
        </span>
        <button
          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
          disabled={currentPage === totalPages}
          className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Next <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
          {isAdmin && adminView === 'users' ? 'User Management' : 
           isAdmin && selectedUser ? `History: ${selectedUser.full_name}` : 
           'Your Translation History'}
        </h2>
        
        {isAdmin && adminView === 'history' ? (
          <button
            onClick={handleBackToUsers}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Users
          </button>
        ) : !isAdmin ? (
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Grader
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-red-500 mb-4" />
          <p className="text-slate-500 dark:text-slate-400">Loading data...</p>
        </div>
      ) : error ? (
        <div className="p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-2xl text-red-600 dark:text-red-400 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <p>{error}</p>
        </div>
      ) : isAdmin && adminView === 'users' ? (
        // --- ADMIN USERS VIEW ---
        <div className="space-y-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search users by name..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="w-full pl-12 pr-4 py-4 bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800/60 rounded-2xl focus:outline-none focus:ring-2 focus:ring-red-500/50 dark:text-white shadow-sm backdrop-blur-sm transition-all"
            />
          </div>

          {paginatedUsers.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-slate-900/50 rounded-3xl border border-slate-200 dark:border-slate-800/60">
              <User className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-slate-500 dark:text-slate-400">No users found.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {paginatedUsers.map(user => (
                <button
                  key={user.id}
                  onClick={() => handleUserSelect(user)}
                  className="flex items-center justify-between p-5 bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800/60 hover:border-red-300 dark:hover:border-red-500/50 hover:shadow-md transition-all text-left group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 font-bold">
                      {(user.full_name || 'U')[0].toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900 dark:text-white group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors">
                        {user.full_name || 'Unknown User'}
                      </h3>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-red-500 transition-colors" />
                </button>
              ))}
            </div>
          )}
          <PaginationControls totalPages={totalUserPages} />
        </div>
      ) : (
        // --- HISTORY VIEW (Admin viewing a user, or User viewing themselves) ---
        <div className="space-y-6">
          {history.length === 0 ? (
            <div className="text-center py-20 bg-white dark:bg-slate-900/50 rounded-3xl border border-slate-200 dark:border-slate-800/60 backdrop-blur-sm">
              <div className="bg-slate-100 dark:bg-slate-800 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <Calendar className="w-8 h-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">No translations yet</h3>
              <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                {isAdmin ? "This user hasn't made any translations yet." : "Your graded translations will appear here once you start using the app."}
              </p>
              {!isAdmin && (
                <button
                  onClick={onBack}
                  className="mt-6 px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl transition-colors shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                >
                  Start Translating
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {paginatedHistory.map((item) => {
                const isExpanded = expandedId === item.id;
                return (
                  <div key={item.id} className="bg-white dark:bg-slate-900/50 rounded-3xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-800/60 backdrop-blur-sm transition-all duration-300 hover:shadow-md">
                    {/* Card Header (Always visible) */}
                    <div 
                      onClick={() => setExpandedId(isExpanded ? null : item.id)}
                      className="p-6 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-md">
                            <Calendar className="w-3.5 h-3.5" />
                            {formatDate(item.created_at)}
                          </div>
                          <div className={`px-2.5 py-1 rounded-md border font-bold text-xs ${getScoreColor(item.score)}`}>
                            Score: {item.score}/10
                          </div>
                          {item.audio_url && (
                            <div className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 px-2.5 py-1 rounded-md border border-red-100 dark:border-red-500/20">
                              <Volume2 className="w-3.5 h-3.5" />
                              Audio
                            </div>
                          )}
                        </div>
                        <p className="text-slate-800 dark:text-slate-200 font-medium truncate" dir="rtl">
                          {item.urdu_transcription}
                        </p>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                        <span className="text-sm font-medium text-red-600 dark:text-red-400">
                          {isExpanded ? 'Hide Details' : 'View Details'}
                        </span>
                        <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400">
                          {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                        </div>
                      </div>
                    </div>

                    {/* Expanded Content */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                        >
                          <div className="border-t border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-950/30 p-6 space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div>
                                <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Urdu Transcription</h4>
                                <p className="text-slate-800 dark:text-slate-200 font-medium bg-white dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-800/60" dir="rtl">
                                  {item.urdu_transcription}
                                </p>
                              </div>
                              <div>
                                <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">User's English</h4>
                                <p className="text-slate-800 dark:text-slate-200 font-medium bg-white dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-800/60">
                                  {item.english_transcription}
                                </p>
                              </div>
                            </div>

                            {item.audio_url && (
                              <div className="bg-white dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-800/60 flex items-center gap-4">
                                <div className="bg-red-100 dark:bg-red-500/20 p-2 rounded-full text-red-600 dark:text-red-400">
                                  <Volume2 className="w-5 h-5" />
                                </div>
                                <div className="flex-1">
                                  <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Original Recording</h4>
                                  <audio src={item.audio_url} controls className="w-full h-8 accent-red-500" />
                                </div>
                              </div>
                            )}

                            <div className="bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-500/10 dark:to-orange-500/10 rounded-2xl p-5 border border-red-100 dark:border-red-500/20">
                              <div className="flex items-center gap-2 mb-3">
                                <CheckCircle2 className="w-5 h-5 text-red-600 dark:text-red-400" />
                                <h4 className="text-sm font-semibold text-red-800 dark:text-red-300 uppercase tracking-wider">Better Translation</h4>
                              </div>
                              <p className="text-slate-900 dark:text-white font-bold text-lg">{item.better_translation}</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="bg-white dark:bg-slate-900/50 p-5 rounded-2xl border border-slate-200 dark:border-slate-800/60">
                                <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Mistakes Identified</h4>
                                {item.mistakes && item.mistakes.length > 0 ? (
                                  <ul className="space-y-2">
                                    {item.mistakes.map((mistake, index) => (
                                      <li key={index} className="flex items-start gap-2 text-sm">
                                        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                        <span className="text-slate-700 dark:text-slate-300">{mistake}</span>
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1.5">
                                    <CheckCircle2 className="w-4 h-4" /> No major mistakes
                                  </p>
                                )}
                              </div>

                              <div className="bg-white dark:bg-slate-900/50 p-5 rounded-2xl border border-slate-200 dark:border-slate-800/60">
                                <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Feedback</h4>
                                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                                  {item.feedback}
                                </p>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
              <PaginationControls totalPages={totalHistoryPages} />
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
