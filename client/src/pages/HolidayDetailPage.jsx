import { useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { getHoliday, createHoliday, updateHoliday, deleteHoliday } from '../api/holidays';
import { AppShell } from '../components/layout/AppShell';
import { Section } from '../components/ui/Section';
import { Input } from '../components/ui/Input';

import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { toFormData } from '../lib/utils';

export default function HolidayDetailPage() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: holidayData, isLoading } = useQuery({
    queryKey: ['holidays', id],
    queryFn: () => getHoliday(id),
    enabled: !isNew,
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  useEffect(() => {
    if (holidayData?.data) reset(toFormData(holidayData.data));
  }, [holidayData]);

  const mutation = useMutation({
    mutationFn: (data) => isNew ? createHoliday(data) : updateHoliday(id, data),
    onSuccess: (res) => {
      qc.invalidateQueries(['holidays']);
      if (isNew && res?.id) navigate(`/holidays/${res.id}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteHoliday(id),
    onSuccess: () => {
      qc.invalidateQueries(['holidays']);
      navigate('/holidays');
    },
  });

  const onSubmit = (data) => mutation.mutate(data);

  const handleDelete = () => {
    if (window.confirm('Delete this holiday?')) {
      deleteMutation.mutate();
    }
  };

  if (!isNew && isLoading) {
    return <AppShell><div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div></AppShell>;
  }

  return (
    <AppShell>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <Link to="/holidays" className="text-sm text-gray-500 hover:text-[#1e3a5f]">← Holidays</Link>
            <h1 className="text-xl font-bold text-gray-900 mt-0.5">
              {isNew ? 'New Holiday' : (holidayData?.data?.holiday_name || 'Holiday')}
            </h1>
          </div>
          {!isNew && (
            <button type="button" onClick={handleDelete} className="text-sm text-red-500 hover:text-red-700">
              Delete Holiday
            </button>
          )}
        </div>

        <div className="p-6 space-y-4 pb-32">
          <Section title="Holiday Info" defaultOpen={true}>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Holiday Name" required {...register('holiday_name', { required: 'Required' })} error={errors.holiday_name?.message} />
              <Input label="Date" type="date" required {...register('holiday_date', { required: 'Required' })} error={errors.holiday_date?.message} />
            </div>
          </Section>
        </div>

        <div className="fixed bottom-0 left-[220px] right-0 bg-white border-t border-gray-200 px-6 py-3 flex items-center gap-4">
          {mutation.isError && (
            <p className="text-sm text-red-600">{mutation.error?.response?.data?.error || 'Save failed'}</p>
          )}
          {mutation.isSuccess && <p className="text-sm text-green-600">Saved successfully</p>}
          <div className="ml-auto flex gap-3">
            <Link to="/holidays" className="text-sm text-gray-500 hover:text-gray-700 py-2">Discard</Link>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </form>
    </AppShell>
  );
}
