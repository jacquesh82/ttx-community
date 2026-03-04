import { useState, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { injectsApi } from '../services/api'
import { Upload, Download, FileText, AlertCircle, CheckCircle, X } from 'lucide-react'

interface ImportCSVModalProps {
  isOpen: boolean
  onClose: () => void
  exerciseId: number
}

export default function ImportCSVModal({ isOpen, onClose, exerciseId }: ImportCSVModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [result, setResult] = useState<{
    success: number
    errors: Array<{ row: number; error: string }>
  } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  const importMutation = useMutation({
    mutationFn: (file: File) => injectsApi.importCsv(exerciseId, file),
    onSuccess: (data) => {
      setResult({ success: data.success, errors: data.errors })
      queryClient.invalidateQueries({ queryKey: ['injects', exerciseId] })
    },
    onError: (error: any) => {
      setResult({
        success: 0,
        errors: [{ row: 0, error: error.response?.data?.detail || 'Import failed' }],
      })
    },
  })

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0]
      if (droppedFile.name.endsWith('.csv')) {
        setFile(droppedFile)
        setResult(null)
      }
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0])
      setResult(null)
    }
  }

  const handleImport = () => {
    if (file) {
      importMutation.mutate(file)
    }
  }

  const handleDownloadTemplate = async () => {
    try {
      const blob = await injectsApi.downloadTemplate()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'inject_template.csv'
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to download template', error)
    }
  }

  const handleClose = () => {
    setFile(null)
    setResult(null)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Importer des injects (CSV)</h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Instructions */}
          <div className="text-sm text-gray-600">
            <p className="mb-2">
              Importez plusieurs injects à partir d'un fichier CSV. Colonnes requises :
            </p>
            <ul className="list-disc list-inside text-xs text-gray-500 space-y-1">
              <li><code className="bg-gray-100 px-1">type</code> - mail, twitter, tv, decision, score, system</li>
              <li><code className="bg-gray-100 px-1">title</code> - Titre de l'inject</li>
              <li><code className="bg-gray-100 px-1">time_offset</code> - Minutes depuis T+0 (optionnel)</li>
              <li><code className="bg-gray-100 px-1">content</code> - Contenu JSON ou texte</li>
              <li><code className="bg-gray-100 px-1">target_teams</code> - Équipes cibles (séparées par des virgules)</li>
            </ul>
          </div>

          {/* Download template */}
          <button
            onClick={handleDownloadTemplate}
            className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700"
          >
            <Download size={16} />
            Télécharger le modèle CSV
          </button>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragOver
                ? 'border-primary-500 bg-primary-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="hidden"
            />
            
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <FileText className="text-primary-500" size={24} />
                <span className="text-sm font-medium text-gray-700">{file.name}</span>
                <button
                  onClick={() => { setFile(null); setResult(null) }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div>
                <Upload className="mx-auto text-gray-400 mb-3" size={32} />
                <p className="text-sm text-gray-600 mb-2">
                  Glissez-déposez un fichier CSV ici
                </p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-sm text-primary-600 hover:text-primary-700"
                >
                  ou cliquez pour sélectionner
                </button>
              </div>
            )}
          </div>

          {/* Results */}
          {result && (
            <div className={`rounded-lg p-4 ${
              result.errors.length > 0 && result.success === 0
                ? 'bg-red-50 border border-red-200'
                : result.errors.length > 0
                ? 'bg-yellow-50 border border-yellow-200'
                : 'bg-green-50 border border-green-200'
            }`}>
              {result.success > 0 && (
                <div className="flex items-center gap-2 text-green-700 mb-2">
                  <CheckCircle size={16} />
                  <span className="text-sm font-medium">
                    {result.success} inject{result.success > 1 ? 's' : ''} importé{result.success > 1 ? 's' : ''} avec succès
                  </span>
                </div>
              )}
              
              {result.errors.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-red-700">
                    <AlertCircle size={16} />
                    <span className="text-sm font-medium">
                      {result.errors.length} erreur{result.errors.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  <ul className="text-xs text-red-600 max-h-32 overflow-y-auto">
                    {result.errors.slice(0, 10).map((err, i) => (
                      <li key={i}>
                        {err.row > 0 ? `Ligne ${err.row}: ` : ''}{err.error}
                      </li>
                    ))}
                    {result.errors.length > 10 && (
                      <li className="text-gray-500">
                        ... et {result.errors.length - 10} autres erreurs
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Error from mutation */}
          {importMutation.isError && !result && (
            <div className="rounded-lg p-4 bg-red-50 border border-red-200">
              <div className="flex items-center gap-2 text-red-700">
                <AlertCircle size={16} />
                <span className="text-sm">Erreur lors de l'import</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 bg-gray-50 rounded-b-lg">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            {result?.success ? 'Fermer' : 'Annuler'}
          </button>
          {!result?.success && (
            <button
              onClick={handleImport}
              disabled={!file || importMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {importMutation.isPending ? 'Import en cours...' : 'Importer'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}