import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Trans } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { Building2, Server, BarChart3, Info } from 'lucide-react'

function InfoTip({ text }: { text: string }) {
  return (
    <span className="relative group inline-flex items-center ml-1.5 align-middle cursor-default">
      <Info className="w-3.5 h-3.5 text-gray-500 group-hover:text-gray-300 transition-colors" />
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-xs text-gray-300 leading-relaxed opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity z-50 shadow-xl">
        {text}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-600" />
      </span>
    </span>
  )
}
import { AppConfiguration } from '../../services/api'
import BIAManager, { BIAProcess } from './BIAManager'

interface OrganisationSectionProps {
  getAppConfigValue: <K extends keyof AppConfiguration>(key: K) => AppConfiguration[K]
  updateAppConfigField: <K extends keyof AppConfiguration>(key: K, value: AppConfiguration[K]) => void
  tenantLabel: string
  tenantSlug: string | null
}

type Tab = 'identity' | 'it_context' | 'bia'

// Mapping from FR DB value to i18n key suffix
const SECTOR_KEYS: { value: string; key: string }[] = [
  { value: 'Santé / hôpital', key: 'sante' },
  { value: 'Transport', key: 'transport' },
  { value: 'Énergie', key: 'energie' },
  { value: 'Eau / assainissement', key: 'eau' },
  { value: 'Télécommunications', key: 'telecom' },
  { value: 'Numérique / IT', key: 'numerique' },
  { value: 'Banque / finance / assurance', key: 'banque' },
  { value: 'Industrie / manufacture', key: 'industrie' },
  { value: 'Commerce / distribution', key: 'commerce' },
  { value: 'Logistique', key: 'logistique' },
  { value: 'Agroalimentaire', key: 'agroalimentaire' },
  { value: 'Agriculture', key: 'agriculture' },
  { value: 'Construction / BTP', key: 'construction' },
  { value: 'Immobilier', key: 'immobilier' },
  { value: 'Éducation / recherche', key: 'education' },
  { value: 'Administration publique', key: 'administration' },
  { value: 'Défense / sécurité', key: 'defense' },
  { value: 'Justice', key: 'justice' },
  { value: 'Tourisme / hôtellerie', key: 'tourisme' },
  { value: 'Culture / médias', key: 'culture' },
  { value: 'Pharmaceutique / biotechnologie', key: 'pharma' },
  { value: 'Environnement', key: 'environnement' },
  { value: 'Spatial / aéronautique', key: 'spatial' },
  { value: 'Automobile', key: 'auto' },
  { value: 'Maritime / portuaire', key: 'maritime' },
  { value: 'Retail / e-commerce', key: 'retail' },
  { value: 'Services professionnels (conseil, audit, juridique)', key: 'services' },
  { value: 'ONG / organisations internationales', key: 'ong' },
]

const inputCls =
  'w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500'

export default function OrganisationSection({
  getAppConfigValue,
  updateAppConfigField,
  tenantLabel,
  tenantSlug,
}: OrganisationSectionProps) {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const initialTab = (['identity', 'it_context', 'bia'] as Tab[]).includes(searchParams.get('tab') as Tab)
    ? (searchParams.get('tab') as Tab)
    : 'identity'
  const [activeTab, setActiveTab] = useState<Tab>(initialTab)

  const tabs: { id: Tab; label: string; Icon: React.ElementType }[] = [
    { id: 'identity', label: t('organisation.tab_identity'), Icon: Building2 },
    { id: 'it_context', label: t('organisation.tab_it_context'), Icon: Server },
    { id: 'bia', label: t('organisation.tab_bia'), Icon: BarChart3 },
  ]

  // Identity fields
  const [orgName, setOrgName] = useState(() => String(getAppConfigValue('organization_name') ?? ''))
  const [orgSector, setOrgSector] = useState(() => String(getAppConfigValue('organization_sector') ?? ''))
  const [orgLogo, setOrgLogo] = useState(() => String(getAppConfigValue('organization_logo_url') ?? ''))
  const [orgDesc, setOrgDesc] = useState(() => String(getAppConfigValue('organization_description') ?? ''))
  const [orgRefUrl, setOrgRefUrl] = useState(() => String(getAppConfigValue('organization_reference_url') ?? ''))
  const [orgKeywords, setOrgKeywords] = useState(() => String(getAppConfigValue('organization_keywords') ?? ''))
  const [orgTechStack, setOrgTechStack] = useState(() => String(getAppConfigValue('organization_tech_stack') ?? ''))

  // IT context fields
  const [windowsDomain, setWindowsDomain] = useState(() => String(getAppConfigValue('windows_domain') ?? ''))
  const [publicDomain, setPublicDomain] = useState(() => String(getAppConfigValue('public_domain') ?? ''))
  const [mailDomain, setMailDomain] = useState(() => String(getAppConfigValue('mail_domain') ?? ''))
  const [internalIpRanges, setInternalIpRanges] = useState(() => String(getAppConfigValue('internal_ip_ranges') ?? ''))
  const [dmzIpRanges, setDmzIpRanges] = useState(() => String(getAppConfigValue('dmz_ip_ranges') ?? ''))
  const [domainControllers, setDomainControllers] = useState(() => String(getAppConfigValue('domain_controllers') ?? ''))
  const [serverNamingExamples, setServerNamingExamples] = useState(() => String(getAppConfigValue('server_naming_examples') ?? ''))
  const [technologicalDependencies, setTechnologicalDependencies] = useState(() => String(getAppConfigValue('technological_dependencies') ?? ''))
  const [cloudProviders, setCloudProviders] = useState(() => String(getAppConfigValue('cloud_providers') ?? ''))
  const [criticalApplications, setCriticalApplications] = useState(() => String(getAppConfigValue('critical_applications') ?? ''))

  // BIA state
  const [biaProcesses, setBiaProcesses] = useState<BIAProcess[]>(() => {
    try {
      const raw = getAppConfigValue('bia_processes')
      const parsed = raw ? JSON.parse(raw) : null
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  })

  function handleBiaChange(updated: BIAProcess[]) {
    setBiaProcesses(updated)
    updateAppConfigField('bia_processes', JSON.stringify(updated))
  }

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
      <div className="flex items-center gap-3 mb-4">
        <Building2 className="w-5 h-5 text-gray-400" />
        <h2 className="text-lg font-medium text-white">{t('organisation.title')}</h2>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-gray-700 mb-6 gap-1">
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === id
                ? 'border-primary-500 text-white'
                : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Identité */}
      {activeTab === 'identity' && (
        <div>
        <p className="mb-6 text-sm text-gray-400 leading-relaxed">{t('organisation.intro_identity')}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              {t('organisation.name')}
            </label>
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              onBlur={() => updateAppConfigField('organization_name', orgName)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              {t('organisation.sector')}
            </label>
            <select
              value={orgSector}
              onChange={(e) => {
                setOrgSector(e.target.value)
                updateAppConfigField('organization_sector', e.target.value || null)
              }}
              className={inputCls}
            >
              <option value="">{t('organisation.not_defined')}</option>
              {SECTOR_KEYS.map(({ value, key }) => (
                <option key={value} value={value}>{t(`organisation.sectors.${key}`)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              {t('organisation.logo_url')}
            </label>
            <input
              type="url"
              value={orgLogo}
              onChange={(e) => setOrgLogo(e.target.value)}
              onBlur={() => updateAppConfigField('organization_logo_url', orgLogo || null)}
              className={inputCls}
              placeholder={t('organisation.logo_url_placeholder')}
            />
            <p className="mt-1 text-xs text-gray-500">{t('organisation.logo_url_hint')}</p>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              {t('organisation.description')}
            </label>
            <textarea
              value={orgDesc}
              onChange={(e) => setOrgDesc(e.target.value)}
              onBlur={() => updateAppConfigField('organization_description', orgDesc || null)}
              className={inputCls}
              placeholder={t('organisation.description_placeholder')}
              rows={3}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              {t('organisation.reference_url')}
            </label>
            <input
              type="url"
              value={orgRefUrl}
              onChange={(e) => setOrgRefUrl(e.target.value)}
              onBlur={() => updateAppConfigField('organization_reference_url', orgRefUrl || null)}
              className={inputCls}
              placeholder={t('organisation.reference_url_placeholder')}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              {t('organisation.keywords')}
            </label>
            <input
              type="text"
              value={orgKeywords}
              onChange={(e) => setOrgKeywords(e.target.value)}
              onBlur={() => updateAppConfigField('organization_keywords', orgKeywords || null)}
              className={inputCls}
              placeholder={t('organisation.keywords_placeholder')}
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              {t('organisation.tech_stack')}
            </label>
            <textarea
              value={orgTechStack}
              onChange={(e) => setOrgTechStack(e.target.value)}
              onBlur={() => updateAppConfigField('organization_tech_stack', orgTechStack || null)}
              className={inputCls}
              placeholder={"Éditeurs logiciels : Microsoft 365, SAP ERP\nCloud providers : AWS (région eu-west-1), Azure AD\nCybersécurité : CrowdStrike EDR, Palo Alto NGFW, SIEM Splunk\nSystèmes métiers : progiciel de paie ADP, ERP interne, SCADA Siemens\nFournisseurs critiques : OVHcloud, Telecom SFR, prestataire SOC ExternoCo"}
              rows={5}
            />
            <p className="mt-1 text-xs text-gray-500">
              {t('organisation.tech_stack_hint')}
            </p>
          </div>
        </div>
        </div>
      )}

      {/* Contexte IT */}
      {activeTab === 'it_context' && (
        <div>
          <p className="mb-4 text-sm text-gray-400 leading-relaxed">{t('organisation.intro_it_context')}</p>
          <p className="text-xs text-gray-500 mb-5">
            {t('organisation.it_context_hint')}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">{t('organisation.windows_domain')}<InfoTip text={t('organisation.tips.windows_domain')} /></label>
              <input
                type="text"
                value={windowsDomain}
                onChange={(e) => setWindowsDomain(e.target.value)}
                onBlur={() => updateAppConfigField('windows_domain', windowsDomain || null)}
                className={inputCls}
                placeholder="corp.example.local"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">{t('organisation.public_domain')}<InfoTip text={t('organisation.tips.public_domain')} /></label>
              <input
                type="text"
                value={publicDomain}
                onChange={(e) => setPublicDomain(e.target.value)}
                onBlur={() => updateAppConfigField('public_domain', publicDomain || null)}
                className={inputCls}
                placeholder="example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">{t('organisation.mail_domain')}<InfoTip text={t('organisation.tips.mail_domain')} /></label>
              <input
                type="text"
                value={mailDomain}
                onChange={(e) => setMailDomain(e.target.value)}
                onBlur={() => updateAppConfigField('mail_domain', mailDomain || null)}
                className={inputCls}
                placeholder="example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">{t('organisation.internal_ip_ranges')}<InfoTip text={t('organisation.tips.internal_ip_ranges')} /></label>
              <textarea
                value={internalIpRanges}
                onChange={(e) => setInternalIpRanges(e.target.value)}
                onBlur={() => updateAppConfigField('internal_ip_ranges', internalIpRanges || null)}
                className={inputCls}
                placeholder={"10.0.0.0/8\n192.168.1.0/24"}
                rows={3}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">{t('organisation.dmz_ip_ranges')}<InfoTip text={t('organisation.tips.dmz_ip_ranges')} /></label>
              <textarea
                value={dmzIpRanges}
                onChange={(e) => setDmzIpRanges(e.target.value)}
                onBlur={() => updateAppConfigField('dmz_ip_ranges', dmzIpRanges || null)}
                className={inputCls}
                placeholder={"172.16.0.0/24\n172.16.1.0/24"}
                rows={3}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">{t('organisation.domain_controllers')}<InfoTip text={t('organisation.tips.domain_controllers')} /></label>
              <textarea
                value={domainControllers}
                onChange={(e) => setDomainControllers(e.target.value)}
                onBlur={() => updateAppConfigField('domain_controllers', domainControllers || null)}
                className={inputCls}
                placeholder={"DC01.corp.example.local\nDC02.corp.example.local"}
                rows={3}
              />
            </div>
            <div className="md:col-span-3">
              <label className="block text-sm font-medium text-gray-300 mb-1">{t('organisation.server_naming')}<InfoTip text={t('organisation.tips.server_naming')} /></label>
              <textarea
                value={serverNamingExamples}
                onChange={(e) => setServerNamingExamples(e.target.value)}
                onBlur={() => updateAppConfigField('server_naming_examples', serverNamingExamples || null)}
                className={inputCls}
                placeholder={"SRV-FILE-01, SRV-PRINT-02 (serveurs de fichiers/impression)\nSRV-APP-ERP-01 (serveur applicatif ERP)\nSRV-SQL-PROD-01, SRV-SQL-PROD-02 (bases de données production)"}
                rows={3}
              />
            </div>
            <div className="md:col-span-3">
              <label className="block text-sm font-medium text-gray-300 mb-1">{t('organisation.tech_dependencies')}<InfoTip text={t('organisation.tips.tech_dependencies')} /></label>
              <textarea
                value={technologicalDependencies}
                onChange={(e) => setTechnologicalDependencies(e.target.value)}
                onBlur={() => updateAppConfigField('technological_dependencies', technologicalDependencies || null)}
                className={inputCls}
                placeholder={"Virtualisation : VMware vSphere 8.0 (300 VMs)\nSécurité réseau : Palo Alto PA-5250 (NGFW), Fortinet FortiGate (VPN)\nSauvegarde : Veeam Backup & Replication v12\nAntivirus/EDR : CrowdStrike Falcon\nSIEM : IBM QRadar"}
                rows={4}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-300 mb-1">{t('organisation.cloud_providers')}<InfoTip text={t('organisation.tips.cloud_providers')} /></label>
              <textarea
                value={cloudProviders}
                onChange={(e) => setCloudProviders(e.target.value)}
                onBlur={() => updateAppConfigField('cloud_providers', cloudProviders || null)}
                className={inputCls}
                placeholder={"Microsoft Azure (région France Central) — Active Directory, Exchange Online\nAWS (eu-west-3 Paris) — hébergement site web, S3 backups\nOVHcloud — infogérance serveurs physiques"}
                rows={3}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">{t('organisation.critical_apps')}<InfoTip text={t('organisation.tips.critical_apps')} /></label>
              <textarea
                value={criticalApplications}
                onChange={(e) => setCriticalApplications(e.target.value)}
                onBlur={() => updateAppConfigField('critical_applications', criticalApplications || null)}
                className={inputCls}
                placeholder={"ERP : SAP S/4HANA\nGRC : ServiceNow\nMail : Microsoft 365\nVisioconférence : Teams"}
                rows={3}
              />
            </div>
          </div>
        </div>
      )}

      {/* BIA */}
      {activeTab === 'bia' && (
        <div>
          <p className="mb-4 text-sm text-gray-400 leading-relaxed">{t('organisation.intro_bia')}</p>
          <p className="text-xs text-gray-500 mb-5">
            {t('organisation.bia_hint')}
          </p>
          <BIAManager processes={biaProcesses} onChange={handleBiaChange} sector={orgSector || null} />
        </div>
      )}
    </div>
  )
}
