import Ajv, { ErrorObject } from 'ajv'

export interface JsonSchemaValidationResult {
  valid: boolean
  errors: ErrorObject[]
}

export function validateWithSchema(
  schema: Record<string, any>,
  data: unknown,
  additionalSchemas: Array<Record<string, any>> = []
): JsonSchemaValidationResult {
  const ajv = new Ajv({ allErrors: true, jsonPointers: true })
  for (const extraSchema of additionalSchemas) {
    ajv.addSchema(extraSchema)
  }
  const validate = ajv.compile(schema)
  const valid = !!validate(data)
  return {
    valid,
    errors: validate.errors || [],
  }
}

export function formatSchemaError(error: ErrorObject): string {
  const path = error.dataPath && error.dataPath.length > 0 ? `$${error.dataPath}` : '$'
  return `${path}: ${error.message || 'invalid value'}`
}
