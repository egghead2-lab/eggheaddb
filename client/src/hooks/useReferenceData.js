import { useQuery } from '@tanstack/react-query';
import { getGeneralData, getAreas, getProfessorList, getLocationList } from '../api/reference';

export function useGeneralData() {
  return useQuery({ queryKey: ['general-data'], queryFn: getGeneralData, staleTime: 10 * 60 * 1000 });
}
export function useAreas() {
  return useQuery({ queryKey: ['areas'], queryFn: getAreas, staleTime: 10 * 60 * 1000 });
}
export function useProfessorList() {
  return useQuery({ queryKey: ['professors', 'list'], queryFn: getProfessorList, staleTime: 5 * 60 * 1000 });
}
export function useLocationList() {
  return useQuery({ queryKey: ['locations', 'list'], queryFn: getLocationList, staleTime: 5 * 60 * 1000 });
}
