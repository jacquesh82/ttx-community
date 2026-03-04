import { useState } from 'react'
import { useUpdateDelivery, useCreateDecision } from '../../contexts/PlayerContext'
import { PlayerInject } from '../../services/playerApi'
import { 
  Eye, 
  CheckCircle, 
  FileText, 
  AlertTriangle, 
  Clock, 
  ChevronDown, 
  ChevronUp 
} from 'lucide-react'

interface InjectActionsProps {
  inject: PlayerInject
  onAction?: () => void
}

export default function InjectActions({ inject, onAction }: InjectActionsProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [showDecisionForm, setShowDecisionForm] = useState(false)
  
  const updateDeliveryMutation = useUpdateDelivery()
  const createDecisionMutation = useCreateDecision()

  const handleAcknowledge = async () => {
    if (inject.delivery_id) {
      await updateDeliveryMutation.mutateAsync({
        deliveryId: inject.delivery_id,
        acknowledge: true
      })
      onAction?.()
    }
  }

  const handleTreat = async () => {
    if (inject.delivery_id) {
      await updateDeliveryMutation.mutateAsync({
        deliveryId: inject.delivery_id,
        treat: true
      })
      onAction?.()
    }
  }

  const handleCreateDecision = async (data: {
    title: string
    description?: string
    impact?: string
  }) => {
    await createDecisionMutation.mutateAsync({
      title: data.title,
      description: data.description,
      impact: data.impact,
      source_inject_id: inject.id
    })
    setShowDecisionForm(false)
    onAction?.()
  }

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'delivered':
        return { label: 'À traiter', color: 'text-red-400', icon: <AlertTriangle size={16} /> }
      case 'opened':
        return { label: 'Ouvert', color: 'text-yellow-400', icon: <Eye size={16} /> }
      case 'acknowledged':
        return { label: 'Accusé', color: 'text-primary-400', icon: <Eye size={16} /> }
      case 'in_progress':
        return { label: 'En cours', color: 'text-orange-400', icon: <Clock size={16} /> }
      case 'treated':
        return { label: 'Traité', color: 'text-green-400', icon: <CheckCircle size={16} /> }
      default:
        return { label: 'Inconnu', color: 'text-gray-400', icon: <AlertTriangle size={16} /> }
    }
  }

  const statusInfo = getStatusInfo(inject.delivery_status || 'delivered')

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
      {/* Header with status */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {statusInfo.icon}
          <span className={`font-medium ${statusInfo.color}`}>
            {statusInfo.label}
          </span>
          {inject.criticity && (
            <span className={`px-2 py-0.5 text-xs font-bold rounded ${
              inject.criticity === 'critical' ? 'bg-red-900/30 text-red-400' :
              inject.criticity === 'important' ? 'bg-yellow-900/30 text-yellow-400' :
              'bg-primary-900/30 text-primary-400'
            }`}>
              {inject.criticity.toUpperCase()}
            </span>
          )}
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1 hover:bg-gray-700 rounded transition-colors"
        >
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {/* Actions */}
      <div className="space-y-2">
        {/* Acknowledge button */}
        {inject.delivery_status === 'delivered' && (
          <button
            onClick={handleAcknowledge}
            disabled={updateDeliveryMutation.isPending}
            className="w-full flex items-center gap-2 px-3 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 rounded transition-colors"
          >
            <Eye size={16} />
            Accuser réception
          </button>
        )}

        {/* Treat button */}
        {inject.delivery_status !== 'treated' && (
          <button
            onClick={handleTreat}
            disabled={updateDeliveryMutation.isPending}
            className="w-full flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded transition-colors"
          >
            <CheckCircle size={16} />
            Marquer comme traité
          </button>
        )}

        {/* Create decision button */}
        <button
          onClick={() => setShowDecisionForm(!showDecisionForm)}
          className="w-full flex items-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-700 rounded transition-colors"
        >
          <FileText size={16} />
          Créer une décision
        </button>
      </div>

      {/* Decision form */}
      {showDecisionForm && (
        <div className="mt-3 p-3 bg-gray-700 rounded-lg border border-gray-600">
          <DecisionForm onSubmit={handleCreateDecision} onCancel={() => setShowDecisionForm(false)} />
        </div>
      )}

      {/* Expanded details */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-gray-700 text-sm text-gray-400 space-y-1">
          <div>Type: <span className="text-white">{inject.type}</span></div>
          <div>Cible: <span className="text-white">{inject.target_type}</span></div>
          {inject.sent_at && (
            <div>Envoyé: <span className="text-white">{new Date(inject.sent_at).toLocaleString('fr-FR')}</span></div>
          )}
          {inject.delivered_at && (
            <div>Reçu: <span className="text-white">{new Date(inject.delivered_at).toLocaleString('fr-FR')}</span></div>
          )}
          {inject.acknowledged_at && (
            <div>Accusé: <span className="text-white">{new Date(inject.acknowledged_at).toLocaleString('fr-FR')}</span></div>
          )}
          {inject.treated_at && (
            <div>Traité: <span className="text-white">{new Date(inject.treated_at).toLocaleString('fr-FR')}</span></div>
          )}
        </div>
      )}
    </div>
  )
}

interface DecisionFormProps {
  onSubmit: (data: { title: string; description?: string; impact?: string }) => void
  onCancel: () => void
}

function DecisionForm({ onSubmit, onCancel }: DecisionFormProps) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    impact: ''
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (formData.title.trim()) {
      onSubmit(formData)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs text-gray-400 mb-1">Titre *</label>
        <input
          type="text"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          className="w-full bg-gray-600 border border-gray-500 rounded px-2 py-1 text-sm text-white"
          placeholder="Titre de la décision"
          required
        />
      </div>
      
      <div>
        <label className="block text-xs text-gray-400 mb-1">Description</label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          rows={2}
          className="w-full bg-gray-600 border border-gray-500 rounded px-2 py-1 text-sm text-white"
          placeholder="Description de la décision..."
        />
      </div>
      
      <div>
        <label className="block text-xs text-gray-400 mb-1">Impact</label>
        <textarea
          value={formData.impact}
          onChange={(e) => setFormData({ ...formData, impact: e.target.value })}
          rows={2}
          className="w-full bg-gray-600 border border-gray-500 rounded px-2 py-1 text-sm text-white"
          placeholder="Impact de cette décision..."
        />
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          className="flex-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded text-sm transition-colors"
        >
          Créer
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-3 py-1.5 bg-gray-600 hover:bg-gray-500 rounded text-sm transition-colors"
        >
          Annuler
        </button>
      </div>
    </form>
  )
}