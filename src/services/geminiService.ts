
// Barrel file — re-exports all public functions from gemini/ modules.
// Consumer import paths remain unchanged: import { ... } from '../services/geminiService'

export { urlToBase64, fetchCurrentExchangeRate, validateGeminiConnection } from './gemini/geminiProxy';
export { analyzeScriptContext, estimateSceneCount, parseScriptToScenes } from './gemini/scriptAnalysis';
export { generateSceneImage } from './gemini/imageGeneration';
export { analyzeImageUnified, generatePromptFromScript, analyzeStyleReference } from './gemini/imageAnalysis';
export { generateCharacterDialogue, sanitizePromptWithGemini, editThumbnailText, editThumbnailTextStyled, generateCharacterVariations, generateStylePreviewPrompts, generateThumbnailConcepts, generateHighQualityThumbnail } from './gemini/thumbnailService';
