import type { SourceImporter } from './SourceImporter'
import { xlsHtmlImporter } from './xlsHtmlImporter'

/** All registered source importers. Add new formats here. */
export const importers: SourceImporter[] = [xlsHtmlImporter]

export function pickImporter(fileName: string, text: string): SourceImporter | null {
  return importers.find((i) => i.detect(fileName, text)) ?? null
}
