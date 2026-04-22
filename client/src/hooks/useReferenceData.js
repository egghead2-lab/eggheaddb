import { useQuery } from '@tanstack/react-query';
import { getGeneralData, getAreas, getProfessorList, getLocationList, getLessons } from '../api/reference';

export function useGeneralData() {
  return useQuery({ queryKey: ['general-data'], queryFn: getGeneralData, staleTime: 10 * 60 * 1000 });
}
export function useAreas() {
  return useQuery({ queryKey: ['areas'], queryFn: getAreas, staleTime: 10 * 60 * 1000 });
}
export function useProfessorList(params) {
  const key = params && Object.keys(params).length ? ['professors', 'list', params] : ['professors', 'list'];
  return useQuery({ queryKey: key, queryFn: () => getProfessorList(params), staleTime: 5 * 60 * 1000 });
}
export function useLocationList() {
  return useQuery({ queryKey: ['locations', 'list'], queryFn: getLocationList, staleTime: 5 * 60 * 1000 });
}
export function useLessons() {
  return useQuery({ queryKey: ['lessons'], queryFn: getLessons, staleTime: 10 * 60 * 1000 });
}
