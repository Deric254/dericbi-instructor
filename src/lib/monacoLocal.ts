/**
 * Makes the code editor (Monaco) load from the app bundle instead of the internet.
 *
 * Without this, @monaco-editor/react silently downloads the editor from the jsDelivr CDN at
 * runtime, so offline / firewalled / slow-network learners saw "Loading..." forever and could
 * not type or run any SQL, Python or Statistics exercise.
 *
 * Imported once by every page that uses <Editor>.
 */
import * as monaco from 'monaco-editor'
import { loader } from '@monaco-editor/react'
// `?worker&inline` embeds the worker in the bundle so it also works from file:// in the packaged app.
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker&inline'

;(self as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
}

loader.config({ monaco })
