import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { usePlayer, useCreateDecision } from '../../contexts/PlayerContext'
import type { Decision } from '../../services/playerApi'
import { 
  FileText, 
  Plus, 
  Edit, 
  Trash2, 
  Clock, 
  CheckCircle, 
  X, 
  ChevronDown, 
  ChevronUp,
  Users,
  AlertTriangle
} from 'lucide-react'

interface DecisionSystemProps {
  onBack?: () => void
}

export default function DecisionSystem({ onBack }: DecisionSystemProps) {
  const { exerciseId } = useParams<{ exerciseId: string }>()
  const { decisions, isLoadingDecisions } = usePlayer()
  
  const [isExpanded, setIsExpanded] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingDecision, setEditingDecision] = useState<any | null>(null)

  const createDecisionMutation = useCreateDecision()

  const handleCreateDecision = async (data: {
    title: string
    description?: string
    impact?: string
    source_event_id?: number
    source_inject_id?: number
  }) => {
    await createDecisionMutation.mutateAsync(data)
    setShowCreateForm(false)
  }

  const handleUpdateDecision = async (decisionId: number, updates: Partial<any>) => {
    // Would need update API endpoint
    console.log('Update decision:', decisionId, updates)
  }

  const handleDeleteDecision = async (decisionId: number) => {
    // Would need delete API endpoint
    console.log('Delete decision:', decisionId)
  }

  const getDecisionStatusInfo = (decision: any) => {
    if (decision.decided_at) {
      return { label: 'Décidée', color: 'text-green-400', icon: <CheckCircle size={16} /> }
    } else if (decision.created_at) {
      return { label: 'En cours', color: 'text-yellow-400', icon: <Clock size={16} /> }
    }
    return { label: 'Nouvelle', color: 'text-primary-400', icon: <FileText size={16} /> }
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString('fr-FR', { 
      day: 'numeric', 
      month: 'short', 
      hour: '2-digit', 
      minute: '2-digit' 
    })
  }

  return (
    <div className="h-full flex flex-col bg-gray-800 rounded-lg border border-gray-700">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText size={24} className="text-purple-400" />
            <div>
              <h2 className="text-lg font-semibold text-white">Décisions</h2>
              <p className="text-sm text-gray-400">Prise de décision collaborative</p>
            </div>
          </div>
          <div className="flex gap-2">
            {onBack && (
              <button
                onClick={onBack}
                className="p-2 hover:bg-gray-700 rounded transition-colors"
              >
                <X size={20} />
              </button>
            )}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-2 hover:bg-gray-700 rounded transition-colors"
            >
              {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex gap-2">
          <button
            onClick={() => setShowCreateForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
          >
            <Plus size={16} />
            Nouvelle décision
          </button>
        </div>
      </div>

      {/* Create decision form */}
      {showCreateForm && (
        <div className="p-4 border-b border-gray-700 bg-gray-700/50">
          <DecisionForm 
            onSubmit={handleCreateDecision}
            onCancel={() => setShowCreateForm(false)}
          />
        </div>
      )}

      {/* Decisions list */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoadingDecisions ? (
          <div className="text-center py-8 text-gray-400">Chargement...</div>
        ) : decisions.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <FileText size={48} className="mx-auto mb-3 opacity-50" />
            <p>Aucune décision en cours</p>
            <button
              onClick={() => setShowCreateForm(true)}
              className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
            >
              Créer une décision
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {decisions.map((decision) => (
              <DecisionCard
                key={decision.id}
                decision={decision}
                onEdit={(d) => setEditingDecision(d)}
                onDelete={(id) => handleDeleteDecision(id)}
                onUpdate={(id, updates) => handleUpdateDecision(id, updates)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

interface DecisionFormProps {
  onSubmit: (data: {
    title: string
    description?: string
    impact?: string
    source_event_id?: number
    source_inject_id?: number
  }) => void
  onCancel: () => void
}

function DecisionForm({ onSubmit, onCancel }: DecisionFormProps) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    impact: '',
    source_event_id: undefined as number | undefined,
    source_inject_id: undefined as number | undefined
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (formData.title.trim()) {
      onSubmit(formData)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs text-gray-400 mb-1">Titre *</label>
        <input
          type="text"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          className="w-full bg-gray-600 border border-gray-500 rounded px-3 py-2 text-sm text-white"
          placeholder="Titre de la décision"
          required
        />
      </div>
      
      <div>
        <label className="block text-xs text-gray-400 mb-1">Description</label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          rows={3}
          className="w-full bg-gray-600 border border-gray-500 rounded px-3 py-2 text-sm text-white"
          placeholder="Description de la décision..."
        />
      </div>
      
      <div>
        <label className="block text-xs text-gray-400 mb-1">Impact</label>
        <textarea
          value={formData.impact}
          onChange={(e) => setFormData({ ...formData, impact: e.target.value })}
          rows={2}
          className="w-full bg-gray-600 border border-gray-500 rounded px-3 py-2 text-sm text-white"
          placeholder="Impact de cette décision..."
        />
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
        >
          Créer
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition-colors"
        >
          Annuler
        </button>
      </div>
    </form>
  )
}

interface DecisionCardProps {
  decision: Decision
  onEdit: (decision: Decision) => void
  onDelete: (id: number) => void
  onUpdate: (id: number, updates: Partial<Decision>) => void
}

function DecisionCard({ decision, onEdit, onDelete, onUpdate }: DecisionCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const statusInfo = decision.decided_at 
    ? { label: 'Décidée', color: 'text-green-400', icon: <CheckCircle size={16} /> }
    : { label: 'En cours', color: 'text-yellow-400', icon: <Clock size={16} /> }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString('fr-FR', { 
      day: 'numeric', 
      month: 'short', 
      hour: '2-digit', 
      minute: '2-digit' 
    })
  }

  return (
    <div className="bg-gray-700 rounded-lg border border-gray-600 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center">
            <FileText size={16} />
          </div>
          <div>
            <h3 className="font-medium text-white">{decision.title}</h3>
            <div className="flex items-center gap-2 text-sm text-gray-400">
              {statusInfo.icon}
              <span className={statusInfo.color}>{statusInfo.label}</span>
              <span>•</span>
              <span>Créée: {formatTime(decision.created_at)}</span>
              {decision.decided_at && (
                <>
                  <span>•</span>
                  <span>Décidée: {formatTime(decision.decided_at)}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => onEdit(decision)}
            className="p-1 hover:bg-gray-600 rounded transition-colors"
          >
            <Edit size={16} />
          </button>
          <button
            onClick={() => onDelete(decision.id)}
            className="p-1 hover:bg-gray-600 rounded transition-colors"
          >
            <Trash2 size={16} />
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 hover:bg-gray-600 rounded transition-colors"
          >
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-3">
        {decision.description && (
          <div className="text-sm text-gray-300">
            <strong>Description:</strong>
            <p className="mt-1 text-gray-400">{decision.description}</p>
          </div>
        )}

        {decision.impact && (
          <div className="text-sm text-gray-300">
            <strong>Impact:</strong>
            <p className="mt-1 text-gray-400">{decision.impact}</p>
          </div>
        )}

        {decision.source_inject_id && (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <AlertTriangle size={16} />
            <span>Issue d'un inject</span>
          </div>
        )}

        {decision.source_event_id && (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Users size={16} />
            <span>Issue d'un événement</span>
          </div>
        )}
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-gray-600 text-sm text-gray-400 space-y-2">
          <div>ID: <span className="text-white">{decision.id}</span></div>
          <div>Créateur: <span className="text-white">{decision.created_by}</span></div>
          {decision.decided_by && (
            <div>Décidée par: <span className="text-white">{decision.decided_by}</span></div>
          )}
          {decision.decided_at && (
            <div>Décidée le: <span className="text-white">{formatTime(decision.decided_at)}</span></div>
          )}
        </div>
      )}
    </div>
  )
}
