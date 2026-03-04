import Modal from '../Modal'

interface PresetApplyModalProps {
  isOpen: boolean
  presetName: string
  previewItems: string[]
  isApplying: boolean
  onClose: () => void
  onConfirm: () => void
}

export default function PresetApplyModal({
  isOpen,
  presetName,
  previewItems,
  isApplying,
  onClose,
  onConfirm,
}: PresetApplyModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Appliquer le preset: ${presetName}`}>
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          L'application est non destructive: seules les informations manquantes seront ajoutees.
        </p>

        {previewItems.length > 0 ? (
          <ul className="space-y-2 text-sm text-gray-700 max-h-64 overflow-auto">
            {previewItems.map((item) => (
              <li key={item} className="p-2 rounded bg-gray-50 border border-gray-100">
                {item}
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-sm text-gray-500 p-3 bg-gray-50 rounded border">
            Aucune modification necessaire, l'exercice est deja aligne avec ce preset.
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isApplying || previewItems.length === 0}
            className="px-3 py-2 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
          >
            {isApplying ? 'Application...' : 'Appliquer'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
