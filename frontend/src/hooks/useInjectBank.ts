import { useQuery } from '@tanstack/react-query'
import { injectBankApi, injectsApi, InjectBankKind, InjectBankStatus, InjectType } from '../services/api'

export function useInjectBankKinds() {
  return useQuery<InjectBankKind[]>({
    queryKey: ['inject-bank-kinds'],
    queryFn: () => injectBankApi.getKinds(),
    staleTime: Infinity,
  })
}

export function useInjectBankStatuses() {
  return useQuery<InjectBankStatus[]>({
    queryKey: ['inject-bank-statuses'],
    queryFn: () => injectBankApi.getStatuses(),
    staleTime: Infinity,
  })
}

export function useInjectTypes() {
  return useQuery<InjectType[]>({
    queryKey: ['inject-types'],
    queryFn: () => injectsApi.getTypes(),
    staleTime: Infinity,
  })
}
