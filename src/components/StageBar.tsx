import { stageIndex, statusWord, toneOf } from '@shared/templates'
import type { Stage } from '@shared/types'

export function StageBar({ stage, labels, labelled = false }: { stage: Stage; labels: string[]; labelled?: boolean }) {
  const index = stageIndex(stage)
  const tone = toneOf(stage)
  return (
    <div className={`tone-${tone}`}>
      <div className="bar" role="img" aria-label={`${statusWord(stage)}. ${labels.join(', ')}`}>
        {labels.map((label, i) => {
          const state = stage === 'done' || i < index ? 'done' : i === index ? 'current' : 'ahead'
          return <i key={`${label}-${i}`} data-state={state} />
        })}
      </div>
      {labelled && (
        <div className="bar-labels">
          {labels.map((label, i) => (
            <span key={`${label}-${i}`} data-on={stage === 'done' || i === index ? 'true' : 'false'}>
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
