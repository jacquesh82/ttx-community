import { useState } from 'react'
import { Building2 } from 'lucide-react'
import { AppConfiguration } from '../../services/api'

interface OrganisationSectionProps {
  getAppConfigValue: <K extends keyof AppConfiguration>(key: K) => AppConfiguration[K]
  updateAppConfigField: <K extends keyof AppConfiguration>(key: K, value: AppConfiguration[K]) => void
  tenantLabel: string
  tenantSlug: string | null
}

export default function OrganisationSection({
  getAppConfigValue,
  updateAppConfigField,
  tenantLabel,
  tenantSlug,
}: OrganisationSectionProps) {
  // Local draft state — avoids re-rendering the parent on every keystroke.
  // Values are flushed to the parent (and saved) only on blur.
  const [orgName, setOrgName] = useState(() => String(getAppConfigValue('organization_name') ?? ''))
  const [orgLogo, setOrgLogo] = useState(() => String(getAppConfigValue('organization_logo_url') ?? ''))
  const [orgDesc, setOrgDesc] = useState(() => String(getAppConfigValue('organization_description') ?? ''))
  const [orgRefUrl, setOrgRefUrl] = useState(() => String(getAppConfigValue('organization_reference_url') ?? ''))
  const [orgKeywords, setOrgKeywords] = useState(() => String(getAppConfigValue('organization_keywords') ?? ''))

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
      <div className="flex items-center gap-3 mb-6">
        <Building2 className="w-5 h-5 text-gray-400" />
        <h2 className="text-lg font-medium text-white">Organisation</h2>
      </div>
      <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
        Les valeurs affichées et enregistrées ici sont désormais tenant-scopées pour <strong>{tenantLabel}</strong>.
        {tenantSlug ? ` (slug: ${tenantSlug})` : ''}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Nom de l'organisation
          </label>
          <input
            type="text"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            onBlur={() => updateAppConfigField('organization_name', orgName)}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            URL du logo
          </label>
          <input
            type="url"
            value={orgLogo}
            onChange={(e) => setOrgLogo(e.target.value)}
            onBlur={() => updateAppConfigField('organization_logo_url', orgLogo || null)}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="https://example.com/logo.png"
          />
          <p className="mt-1 text-xs text-gray-500">URL directe vers un fichier image (PNG, SVG, JPG). Ne pas utiliser l'URL d'une page web.</p>
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Description de l'organisation
          </label>
          <textarea
            value={orgDesc}
            onChange={(e) => setOrgDesc(e.target.value)}
            onBlur={() => updateAppConfigField('organization_description', orgDesc || null)}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="Décrivez brièvement le métier, le contexte et les enjeux de l'organisation..."
            rows={3}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            URL de référence de l'organisation
          </label>
          <input
            type="url"
            value={orgRefUrl}
            onChange={(e) => setOrgRefUrl(e.target.value)}
            onBlur={() => updateAppConfigField('organization_reference_url', orgRefUrl || null)}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="https://organisation.exemple"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Mots-clés organisation (séparés par des virgules)
          </label>
          <input
            type="text"
            value={orgKeywords}
            onChange={(e) => setOrgKeywords(e.target.value)}
            onBlur={() => updateAppConfigField('organization_keywords', orgKeywords || null)}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="secteur, technologies, domaines, filiales, SI, IOC..."
          />
        </div>
      </div>
    </div>
  )
}
