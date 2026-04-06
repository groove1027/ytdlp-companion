import React from 'react';
import type { Scene } from '../../../types';
import { getSceneNarrationText } from '../../../utils/sceneText';

interface SceneTextInfoProps {
  scene: Scene;
}

const SceneTextInfo: React.FC<SceneTextInfoProps> = ({ scene }) => {
  const narrationText = getSceneNarrationText(scene);

  return (
    <div className="flex-1 min-w-0 space-y-1">
      {/* 한국어 대본 */}
      <p className="text-base text-gray-200 leading-snug line-clamp-2" title={narrationText}>
        {narrationText || '(대본 없음)'}
      </p>

      {/* 영문 비주얼 프롬프트 */}
      {scene.visualPrompt && (
        <p className="text-sm text-gray-500 leading-snug line-clamp-1 italic" title={scene.visualPrompt}>
          {scene.visualPrompt}
        </p>
      )}

      {/* 메타 배지들 */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {scene.cameraAngle && (
          <span className="text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded border border-gray-700">
            {scene.cameraAngle}
          </span>
        )}
        {scene.compositionMode && (
          <span className="text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded border border-gray-700">
            {scene.compositionMode}
          </span>
        )}
        {scene.castType && scene.castType !== 'NOBODY' && (
          <span className="text-xs bg-purple-900/30 text-purple-400 px-1.5 py-0.5 rounded border border-purple-700/30">
            {scene.entityName || scene.castType}
            {scene.castType === 'KEY_ENTITY' && scene.entityComposition && (
              <span className="ml-1 opacity-70">
                {scene.entityComposition === 'ENTITY_SOLO' ? '(단독)' : scene.entityComposition === 'ENTITY_WITH_MAIN' ? '(동반)' : scene.entityComposition === 'MAIN_OBSERVING' ? '(관찰)' : scene.entityComposition === 'ENTITY_FG_MAIN_BG' ? '(전경)' : '(후경)'}
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
};

export default SceneTextInfo;
