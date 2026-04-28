import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Spinner } from '../components/ui/Spinner';
import { formatDate } from '../lib/utils';

const RANGES = [
  { key: '7', label: 'Past 7 days' },
  { key: '30', label: 'Past 30 days' },
  { key: '90', label: 'Past 90 days' },
  { key: 'all', label: 'All time' },
];

function sinceFor(rangeKey) {
  if (rangeKey === 'all') return '2000-01-01';
  const days = parseInt(rangeKey);
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

export default function CurriculumFeedbackPage() {
  const [range, setRange] = useState('7');
  const since = sinceFor(range);

  const { data, isLoading } = useQuery({
    queryKey: ['curriculum-feedback-summary', range],
    queryFn: () => api.get('/curriculum/feedback-summary', { params: { since } }).then(r => r.data),
  });

  const submissions = data?.submissions ?? 0;
  const flagged = data?.flagged ?? [];
  const allRated = data?.all_rated ?? [];
  const threshold = data?.flag_threshold ?? 0.25;
  const minRatings = data?.min_ratings_to_flag ?? 4;

  return (
    <AppShell>
      <PageHeader title="Curriculum Feedback" />
      <div className="p-6 max-w-6xl">
        {/* Range picker */}
        <div className="mb-4 flex items-center gap-2">
          {RANGES.map(r => (
            <button key={r.key} onClick={() => setRange(r.key)}
              className={`text-xs px-3 py-1.5 rounded border ${range === r.key ? 'bg-[#1e3a5f] border-[#1e3a5f] text-white' : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'}`}>
              {r.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
        ) : (
          <>
            {/* Top stats */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <Stat label="Submissions" value={submissions} />
              <Stat label="Lessons rated" value={allRated.length} />
              <Stat label="Flagged lessons" value={flagged.length} highlight={flagged.length > 0} />
            </div>

            {/* Flagged */}
            <div className="mb-6">
              <h2 className="text-sm font-bold text-gray-800 mb-2">
                Flagged Lessons
                <span className="ml-2 text-[11px] text-gray-400 font-normal">
                  ≥{Math.round(threshold * 100)}% 👎 on Fun or Easy · min {minRatings} ratings
                </span>
              </h2>
              {flagged.length === 0 ? (
                <div className="bg-white rounded-lg border border-green-200 p-6 text-center">
                  <div className="text-green-600 font-bold mb-0.5">All clear</div>
                  <div className="text-xs text-gray-400">No lessons crossed the flag threshold in this window</div>
                </div>
              ) : (
                <FeedbackTable rows={flagged} highlight />
              )}
            </div>

            {/* All rated lessons */}
            <div>
              <h2 className="text-sm font-bold text-gray-800 mb-2">All Rated Lessons</h2>
              {allRated.length === 0 ? (
                <div className="text-sm text-gray-400 py-6">No feedback in this window</div>
              ) : (
                <FeedbackTable rows={allRated} />
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function Stat({ label, value, highlight }) {
  return (
    <div className={`bg-white rounded-lg border px-4 py-3 ${highlight ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}>
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${highlight ? 'text-amber-700' : 'text-gray-800'}`}>{value}</div>
    </div>
  );
}

function FeedbackTable({ rows, highlight }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left px-3 py-2 font-medium text-gray-600">Lesson</th>
            <th className="text-center px-3 py-2 font-medium text-gray-600 w-20">Ratings</th>
            <th className="text-left px-3 py-2 font-medium text-gray-600 w-44">Fun for Students</th>
            <th className="text-left px-3 py-2 font-medium text-gray-600 w-44">Easy to Teach</th>
            <th className="text-left px-3 py-2 font-medium text-gray-600 w-32">Last Rating</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map(l => {
            const funYesPct = l.total_responses ? l.fun_yes / l.total_responses : 0;
            const easyYesPct = l.total_responses ? l.easy_yes / l.total_responses : 0;
            const funFlagged = l.flags?.includes('fun');
            const easyFlagged = l.flags?.includes('easy');
            return (
              <tr key={l.lesson_id} className={highlight ? 'bg-amber-50/30' : 'hover:bg-gray-50/50'}>
                <td className="px-3 py-2">
                  <Link to={`/lessons/${l.lesson_id}`} className="text-[#1e3a5f] hover:underline font-medium">{l.lesson_name}</Link>
                </td>
                <td className="px-3 py-2 text-center font-medium">{l.total_responses}</td>
                <td className="px-3 py-2"><Bar yes={l.fun_yes} no={l.fun_no} pct={funYesPct} flagged={funFlagged} /></td>
                <td className="px-3 py-2"><Bar yes={l.easy_yes} no={l.easy_no} pct={easyYesPct} flagged={easyFlagged} /></td>
                <td className="px-3 py-2 text-xs text-gray-500">{l.last_rating_at ? formatDate(l.last_rating_at) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Bar({ yes, no, pct, flagged }) {
  const yesPct = Math.round(pct * 100);
  return (
    <div className="flex items-center gap-2">
      <div className={`flex-1 h-2 rounded overflow-hidden ${flagged ? 'bg-red-100' : 'bg-gray-100'}`}>
        <div className={`h-full ${flagged ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${flagged ? (100 - yesPct) : yesPct}%` }} />
      </div>
      <span className={`text-xs font-medium tabular-nums ${flagged ? 'text-red-700' : 'text-gray-700'}`}>
        {yesPct}% 👍
      </span>
      <span className="text-[10px] text-gray-400 tabular-nums">({yes}/{yes + no})</span>
    </div>
  );
}
