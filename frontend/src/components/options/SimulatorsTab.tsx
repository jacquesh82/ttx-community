import { Save, X, Loader2, RotateCcw, BookOpen, Tv, Mail, MessageCircle, Newspaper, MessageSquare, Landmark, Shield, Box, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { PluginConfiguration, PluginType } from '../../services/api'

const ICON_MAP: Record<string, LucideIcon> = {
  BookOpen,
  Tv,
  Mail,
  MessageCircle,
  Newspaper,
  MessageSquare,
  Landmark,
  Shield,
  Box,
}

const COLORS = [
  { value: 'green', label: 'Vert', class: 'bg-green-500' },
  { value: 'blue', label: 'Bleu', class: 'bg-primary-500' },
  { value: 'purple', label: 'Violet', class: 'bg-purple-500' },
  { value: 'teal', label: 'Turquoise', class: 'bg-teal-500' },
  { value: 'gray', label: 'Gris', class: 'bg-gray-500' },
  { value: 'red', label: 'Rouge', class: 'bg-red-500' },
  { value: 'orange', label: 'Orange', class: 'bg-orange-500' },
  { value: 'yellow', label: 'Jaune', class: 'bg-yellow-500' },
]

const ICONS = ['BookOpen', 'Tv', 'Mail', 'MessageCircle', 'Newspaper', 'MessageSquare', 'Landmark', 'Shield', 'Box']

const COLOR_BAND_MAP: Record<string, string> = {
  green: 'bg-green-500',
  blue: 'bg-primary-500',
  purple: 'bg-purple-500',
  teal: 'bg-teal-500',
  gray: 'bg-gray-500',
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  yellow: 'bg-yellow-500',
}

interface SimulatorsTabProps {
  plugins: PluginConfiguration[]
  editingPlugin: PluginType | null
  editPluginValues: Partial<PluginConfiguration>
  onEdit: (plugin: PluginConfiguration) => void
  onSave: (pluginType: PluginType) => void
  onCancel: () => void
  onFieldChange: (field: keyof PluginConfiguration, value: unknown) => void
  onToggleEnabled: (pluginType: PluginType, enabled: boolean) => void
  onReset: () => void
  isSaving: boolean
  isResetting: boolean
}

export default function SimulatorsTab({
  plugins,
  editingPlugin,
  editPluginValues,
  onEdit,
  onSave,
  onCancel,
  onFieldChange,
  onToggleEnabled,
  onReset,
  isSaving,
  isResetting,
}: SimulatorsTabProps) {
  const { t } = useTranslation()
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-6">
        <p className="text-sm text-gray-400 leading-relaxed">{t('admin.options.intros.simulators')}</p>
        <button
          onClick={onReset}
          disabled={isResetting}
          className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-gray-100 border border-gray-600 rounded-lg hover:bg-gray-600 disabled:opacity-50"
        >
          <RotateCcw className="w-4 h-4" />
          Réinitialiser
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {plugins.map((plugin) => {
          const Icon = ICON_MAP[plugin.icon] ?? Box
          const bandClass = COLOR_BAND_MAP[plugin.color] ?? 'bg-gray-500'
          const isEditing = editingPlugin === plugin.plugin_type

          return (
            <div key={plugin.plugin_type} className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
              {/* Color band */}
              <div className={`h-1.5 ${bandClass}`} />

              <div className="p-4 space-y-3">
                {/* Icon + Name + coming_soon badge */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className="w-5 h-5 flex-shrink-0 text-gray-300" />
                    <span className="font-medium text-white truncate">{plugin.name}</span>
                  </div>
                  {plugin.coming_soon && (
                    <span className="flex-shrink-0 text-xs px-1.5 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded">
                      Bientôt
                    </span>
                  )}
                </div>

                {/* Plugin type code */}
                <code className="text-xs text-gray-500 bg-gray-900 px-1.5 py-0.5 rounded">
                  {plugin.plugin_type}
                </code>

                {/* Toggle + Edit actions */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={plugin.default_enabled}
                      onClick={() => onToggleEnabled(plugin.plugin_type, !plugin.default_enabled)}
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none ${
                        plugin.default_enabled ? 'bg-primary-600' : 'bg-gray-600'
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                          plugin.default_enabled ? 'translate-x-4' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                    <span className="text-xs text-gray-400">Par défaut</span>
                  </div>

                  {isEditing ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onSave(plugin.plugin_type)}
                        disabled={isSaving}
                        className="p-1 text-green-400 hover:text-green-300 disabled:opacity-50"
                        title="Sauvegarder"
                      >
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      </button>
                      <button onClick={onCancel} className="p-1 text-gray-300 hover:text-white" title="Annuler">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => onEdit(plugin)}
                      className="px-2 py-1 text-xs bg-gray-700 text-gray-200 border border-gray-600 rounded hover:bg-gray-600"
                    >
                      Modifier
                    </button>
                  )}
                </div>

                {/* Inline edit form */}
                {isEditing && (
                  <div className="pt-3 border-t border-gray-700 space-y-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Nom</label>
                      <input
                        type="text"
                        value={editPluginValues.name ?? ''}
                        onChange={(e: { target: { value: string } }) => onFieldChange('name', e.target.value)}
                        className="w-full px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Icône</label>
                      <select
                        value={editPluginValues.icon ?? ''}
                        onChange={(e: { target: { value: string } }) => onFieldChange('icon', e.target.value)}
                        className="w-full px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-white text-sm"
                      >
                        {ICONS.map((icon) => (
                          <option key={icon} value={icon}>{icon}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Couleur</label>
                      <div className="flex gap-1.5 flex-wrap">
                        {COLORS.map((color) => (
                          <button
                            key={color.value}
                            type="button"
                            onClick={() => onFieldChange('color', color.value)}
                            className={`w-6 h-6 rounded-full ${color.class} transition-transform hover:scale-110 ${
                              editPluginValues.color === color.value
                                ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-800'
                                : ''
                            }`}
                            title={color.label}
                          />
                        ))}
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editPluginValues.default_enabled ?? false}
                        onChange={(e: { target: { checked: boolean } }) => onFieldChange('default_enabled', e.target.checked)}
                        className="rounded border-gray-600 bg-gray-900 text-primary-600"
                      />
                      Activé par défaut
                    </label>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-4">
        <h3 className="text-sm font-medium text-gray-300 mb-2">Information</h3>
        <ul className="text-sm text-gray-400 space-y-1">
          <li>• Les modifications apportées ici affectent les nouveaux exercices créés.</li>
          <li>• Les exercices existants conservent leur configuration de simulateurs actuelle.</li>
          <li>• Le toggle « Par défaut » active le simulateur automatiquement à la création d'un exercice.</li>
        </ul>
      </div>
    </div>
  )
}
