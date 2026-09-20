import type { Detection } from './types'
import { detectStructured } from './structured'
import { mergeDetections } from './spans'

export type ContextualDetector = {
  detect(text: string): Promise<Detection[]>
}

export type StructuredDetector = (
  text: string,
) => readonly Detection[] | Promise<readonly Detection[]>

export async function detectText(
  text: string,
  contextualDetector: ContextualDetector,
  structuredDetector: StructuredDetector = detectStructured,
): Promise<Detection[]> {
  const contextual = contextualDetector.detect(text)
  const structured = structuredDetector(text)
  const [modelDetections, structuredDetections] = await Promise.all([
    contextual,
    structured,
  ])

  return mergeDetections(
    [...modelDetections, ...structuredDetections],
    text.length,
  )
}
