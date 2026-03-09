import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { adminApi, AppConfiguration } from '../services/api'
import { useAuthStore } from '../stores/authStore'
import { useAutoSaveStore } from '../stores/autoSaveStore'
import { Building2 } from 'lucide-react'
import AutoSaveIndicator, { AutoSaveStatus } from '../components/AutoSaveIndicator'
import OrganisationSection from '../components/options/OrganisationSection'

export default function ExercisePreparationHubPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const tenant = useAuthStore((state) => state.user?.tenant ?? null)
  const [editedAppConfig, setEditedAppConfig] = useState<Partial<AppConfiguration>>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const lastFailedSignatureRef = useRef<string | null>(null)

  const setGlobalAutoSaveStatus = useAutoSaveStore((s) => s.setStatus)

  const { data: appConfig } = useQuery({
    queryKey: ['app-configuration'],
    queryFn: adminApi.getAppConfiguration,
  })

  const updateAppConfigMutation = useMutation({
    mutationFn: (data: Partial<AppConfiguration>) => adminApi.updateAppConfiguration(data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['app-configuration'] })
      lastFailedSignatureRef.current = null
      setSaveError(null)
      setLastSavedAt(Date.now())
      setEditedAppConfig((prev) => {
        const next = { ...prev }
        for (const [key, value] of Object.entries(variables || {})) {
          const typedKey = key as keyof AppConfiguration
          if (Object.is(next[typedKey], value)) {
            delete next[typedKey]
          }
        }
        return next
      })
    },
    onError: (error: any) => {
      const msg = error?.message || t('exercises.save_error')
      setSaveError(msg)
    },
  })

  const appConfigChanged = Object.keys(editedAppConfig).length > 0

  // Stable refs to avoid re-triggering the debounce effect
  const mutateRef = useRef(updateAppConfigMutation.mutate)
  mutateRef.current = updateAppConfigMutation.mutate
  const isPendingRef = useRef(updateAppConfigMutation.isPending)
  isPendingRef.current = updateAppConfigMutation.isPending

  // Debounced autosave — 700 ms after last change
  useEffect(() => {
    if (!appConfigChanged) return
    const payload = { ...editedAppConfig }
    const signature = JSON.stringify(payload)
    if (signature === '{}' || lastFailedSignatureRef.current === signature) return

    const timer = window.setTimeout(() => {
      if (isPendingRef.current) return
      mutateRef.current(payload, {
        onSuccess: () => {
          lastFailedSignatureRef.current = null
          setSaveError(null)
          setLastSavedAt(Date.now())
        },
        onError: (error: any) => {
          lastFailedSignatureRef.current = signature
          setSaveError(error?.message || t('exercises.save_error'))
        },
      })
    }, 700)

    return () => window.clearTimeout(timer)
  }, [appConfigChanged, editedAppConfig])

  // Broadcast autosave status globally (shown in Layout)
  useEffect(() => {
    if (updateAppConfigMutation.isPending) {
      setGlobalAutoSaveStatus('saving')
      return
    }
    if (saveError) {
      setGlobalAutoSaveStatus('error', saveError)
      return
    }
    if (lastSavedAt) {
      setGlobalAutoSaveStatus('saved')
      const timer = window.setTimeout(() => setGlobalAutoSaveStatus('idle'), 3000)
      return () => window.clearTimeout(timer)
    }
    setGlobalAutoSaveStatus('idle')
  }, [updateAppConfigMutation.isPending, saveError, lastSavedAt, setGlobalAutoSaveStatus])

  // Reset global status on unmount
  useEffect(() => {
    return () => setGlobalAutoSaveStatus('idle')
  }, [setGlobalAutoSaveStatus])

  const getAppConfigValue = <K extends keyof AppConfiguration>(key: K): AppConfiguration[K] => {
    if (key in editedAppConfig) return editedAppConfig[key] as AppConfiguration[K]
    return appConfig?.[key] as AppConfiguration[K]
  }

  const updateAppConfigField = <K extends keyof AppConfiguration>(key: K, value: AppConfiguration[K]) => {
    setSaveError(null)
    lastFailedSignatureRef.current = null
    setEditedAppConfig((prev) => ({ ...prev, [key]: value }))
  }

  const localSaveStatus: AutoSaveStatus = updateAppConfigMutation.isPending
    ? 'saving'
    : saveError
      ? 'error'
      : lastSavedAt && !appConfigChanged
        ? 'saved'
        : 'idle'

  const tenantLabel = tenant?.name?.trim() || t('exercises.tenant_not_resolved')
  const tenantSlug = tenant?.slug?.trim() || null

  return (
    <div className="options-theme space-y-6">
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Building2 className="w-5 h-5 text-gray-400" />
            <div>
              <h1 className="text-2xl font-bold text-white">{t('exercises.hub_title')}</h1>
              <p className="text-sm text-gray-400 mt-0.5">{t('exercises.hub_subtitle')}</p>
            </div>
          </div>
          <AutoSaveIndicator status={localSaveStatus} errorMessage={saveError} savedLabel={t('common.saved')} />
        </div>
      </div>
      <OrganisationSection
        key={appConfig ? 'loaded' : 'loading'}
        getAppConfigValue={getAppConfigValue}
        updateAppConfigField={updateAppConfigField}
        tenantLabel={tenantLabel}
        tenantSlug={tenantSlug}
      />
    </div>
  )
}
