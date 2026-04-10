import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { Spinner } from '../components/ui/Spinner';
import { formatDate, formatPhone } from '../lib/utils';

function InfoRow({ label, value, fallback }) {
  const display = value || fallback || null;
  if (!display) return null;
  const isFallback = !value && fallback;
  return (
    <div className="py-3 border-b border-gray-100 last:border-0">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-sm ${isFallback ? 'text-gray-400 italic' : 'text-gray-800'} whitespace-pre-wrap`}>{display}</div>
    </div>
  );
}

export default function SchoolInfoSheetPage() {
  const { id } = useParams();

  const { data, isLoading } = useQuery({
    queryKey: ['info-sheet', id],
    queryFn: () => api.get(`/locations/${id}/info-sheet`).then(r => r.data),
  });
  const loc = data?.data || {};

  if (isLoading) return <AppShell><div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div></AppShell>;

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900">{loc.school_name || loc.nickname || 'School Info'}</h1>
          {loc.nickname && loc.school_name && loc.nickname !== loc.school_name && (
            <div className="text-sm text-gray-500">{loc.nickname}</div>
          )}
          {loc.ts_updated && (
            <div className="text-[10px] text-gray-400 mt-1">Last updated: {formatDate(loc.ts_updated)}</div>
          )}
        </div>

        {/* Info card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Quick facts */}
          <div className="grid grid-cols-2 gap-x-4 px-5 py-4 bg-gray-50 border-b border-gray-200">
            <div>
              <div className="text-[10px] text-gray-400">Location Type</div>
              <div className="text-sm font-medium text-gray-800">{loc.location_type_name || '—'}</div>
            </div>
            <div>
              <div className="text-[10px] text-gray-400">Client</div>
              <div className="text-sm font-medium text-gray-800">{loc.contractor_name || 'Direct'}</div>
            </div>
            <div className="mt-2">
              <div className="text-[10px] text-gray-400">Address</div>
              <div className="text-sm text-gray-800">{loc.address || '—'}</div>
            </div>
            <div className="mt-2">
              <div className="text-[10px] text-gray-400">Retained Client</div>
              <div className="text-sm text-gray-800">{loc.retained ? 'Yes' : 'No'}</div>
            </div>
          </div>

          {/* Contacts */}
          <div className="px-5 py-3 border-b border-gray-200 bg-blue-50/30">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-[10px] text-gray-400">Site Contact</div>
                <div className="text-sm font-medium text-gray-800">{loc.point_of_contact || '—'}</div>
              </div>
              <div>
                <div className="text-[10px] text-gray-400">Onsite Coordinator</div>
                <div className="text-sm font-medium text-gray-800">{loc.site_coordinator_name || '—'}</div>
              </div>
              <div>
                <div className="text-[10px] text-gray-400">Location Phone</div>
                <div className="text-sm text-gray-800">
                  {loc.location_phone ? <a href={`tel:${loc.location_phone}`} className="text-[#1e3a5f] hover:underline">{formatPhone(loc.location_phone)}</a> : '—'}
                </div>
              </div>
              {loc.classroom_location && (
                <div>
                  <div className="text-[10px] text-gray-400">Classroom</div>
                  <div className="text-sm text-gray-800">{loc.classroom_location}</div>
                </div>
              )}
            </div>
          </div>

          {/* Procedures */}
          <div className="px-5">
            {loc.attendance_required ? (
              <InfoRow label="Attendance" value={loc.attendance_directions || 'Attendance is required each session.'} />
            ) : (
              <InfoRow label="Attendance" value="Attendance not required at this location." />
            )}

            <InfoRow label="Parking" value={[loc.parking_difficulty_name && `Difficulty: ${loc.parking_difficulty_name}`, loc.parking_information].filter(Boolean).join('\n') || null} />
            <InfoRow label="Arrival & Check-in Procedures" value={loc.arrival_checkin_procedures || loc.school_procedure_Info} />
            <InfoRow label="Student Pick-up & Classroom Procedures" value={loc.student_pickup_procedures} />
            <InfoRow label="Student Dismissal Procedures" value={loc.dismissal_procedures} />
            <InfoRow label="Emergency Procedures" value={loc.emergency_procedures} fallback="Follow standard Professor Egghead emergency procedures." />
            <InfoRow label="Egghead Tips for Success" value={loc.egghead_tips} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
