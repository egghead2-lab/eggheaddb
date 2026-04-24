import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth';
import api from '../api/client';

export function BugReportButton() {
  const { user } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [pageName, setPageName] = useState('');
  const [category, setCategory] = useState('bug');
  const [submitted, setSubmitted] = useState(false);

  const mutation = useMutation({
    mutationFn: (data) => api.post('/bug-reports', data),
    onSuccess: () => { setSubmitted(true); setTimeout(() => { setOpen(false); setSubmitted(false); setDescription(''); setPageName(''); setCategory('bug'); }, 2000); },
  });

  if (!user) return null;

  return (
    <>
      {/* Bug icon button */}
      <button onClick={() => setOpen(v => !v)}
        className="fixed bottom-4 right-4 z-50 w-12 h-12 bg-[#1e3a5f] text-white rounded-full shadow-lg hover:bg-[#152a47] active:scale-95 transition-all flex items-center justify-center"
        title="Report a bug">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 12.75c1.148 0 2.278.08 3.383.237 1.037.146 1.866.966 1.866 2.013 0 3.728-2.35 6.75-5.25 6.75S6.75 18.728 6.75 15c0-1.046.83-1.867 1.866-2.013A24.204 24.204 0 0112 12.75zm0 0c2.883 0 5.647.508 8.207 1.44a23.91 23.91 0 01-1.152-6.135 23.998 23.998 0 00-14.11 0 23.91 23.91 0 01-1.152 6.135A23.965 23.965 0 0112 12.75zM2.695 8.126l.566-.317A23.91 23.91 0 004.577 3.2l-.458-.913M21.305 8.126l-.566-.317A23.91 23.91 0 0019.423 3.2l.458-.913M12 2.25c-2.676 0-5.216.584-7.499 1.632M12 2.25c2.676 0 5.216.584 7.499 1.632" />
        </svg>
      </button>

      {/* Bug report form */}
      {open && (
        <div className="fixed bottom-20 right-4 z-50 w-80 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
          <div className="bg-[#1e3a5f] text-white px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-semibold">{category === 'idea' ? 'Share an Idea' : 'Report a Bug'}</span>
            <button onClick={() => setOpen(false)} className="text-white/60 hover:text-white">&times;</button>
          </div>

          {submitted ? (
            <div className="p-6 text-center">
              <div className="text-2xl mb-2">🎉</div>
              <div className="text-sm font-medium text-green-700">
                {category === 'idea' ? 'Idea submitted! Thanks for sharing.' : 'Bug reported! Thanks for helping.'}
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-3">
              <div className="flex gap-1">
                <button onClick={() => setCategory('bug')}
                  className={`flex-1 text-xs px-2 py-1 rounded font-medium border ${category === 'bug' ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-white text-gray-600 border-gray-200'}`}>
                  🐛 Bug
                </button>
                <button onClick={() => setCategory('idea')}
                  className={`flex-1 text-xs px-2 py-1 rounded font-medium border ${category === 'idea' ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-white text-gray-600 border-gray-200'}`}>
                  💡 Idea / QOL
                </button>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">{category === 'idea' ? "What's the idea?" : "What's the bug?"}</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
                  placeholder={category === 'idea' ? "Describe your idea or quality-of-life improvement..." : "Describe what happened or what's broken..."}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 focus:border-[#1e3a5f]" autoFocus />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Page / Tool</label>
                <input type="text" value={pageName} onChange={e => setPageName(e.target.value)}
                  placeholder={location.pathname}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 focus:border-[#1e3a5f]" />
              </div>
              <div className="text-xs text-gray-400">
                Reporting as <span className="font-medium text-gray-600">{user.name}</span>
              </div>
              <button onClick={() => mutation.mutate({ description, page_url: location.pathname, page_name: pageName || location.pathname, category })}
                disabled={!description.trim() || mutation.isPending}
                className="w-full py-2 bg-[#1e3a5f] text-white text-sm font-medium rounded-lg hover:bg-[#152a47] disabled:opacity-50 transition-colors">
                {mutation.isPending ? 'Submitting...' : category === 'idea' ? 'Submit Idea' : 'Submit Bug Report'}
              </button>
              {mutation.isError && <p className="text-xs text-red-600">{mutation.error?.response?.data?.error || 'Failed'}</p>}
            </div>
          )}
        </div>
      )}
    </>
  );
}
