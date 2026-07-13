import type { Card, Stage } from '../types';
import { STAGES } from '../types';
import type { CardSelectTarget } from '../lib/cardInput';
import { FULL_DECK, boardCardLimit, formatCard, isRedSuit } from '../lib/cards';
import { PlayingCard } from './PlayingCard';

export type { CardSelectTarget };

interface CardSelectorProps {
  stage: Stage;
  heroCards: [Card | null, Card | null];
  boardCards: (Card | null)[];
  usedCards: Set<Card>;
  activeTarget: CardSelectTarget | null;
  onActiveTargetChange: (target: CardSelectTarget | null) => void;
  onSelectHero: (slot: 0 | 1, card: Card | null) => void;
  onSelectBoard: (index: number, card: Card | null) => void;
}

export function CardSelector({
  stage,
  heroCards,
  boardCards,
  usedCards,
  activeTarget,
  onActiveTargetChange,
  onSelectHero,
  onSelectBoard,
}: CardSelectorProps) {
  const boardLimit = boardCardLimit(stage);

  const handleCardPick = (card: Card) => {
    if (!activeTarget) return;

    if (activeTarget.type === 'hero') {
      const otherSlot = activeTarget.slot === 0 ? 1 : 0;
      if (heroCards[otherSlot] === card) return;
      onSelectHero(activeTarget.slot, card);
    } else {
      onSelectBoard(activeTarget.index, card);
    }
    onActiveTargetChange(null);
  };

  const clearTarget = () => {
    if (!activeTarget) return;
    if (activeTarget.type === 'hero') {
      onSelectHero(activeTarget.slot, null);
    } else {
      onSelectBoard(activeTarget.index, null);
    }
    onActiveTargetChange(null);
  };

  const toggleTarget = (target: CardSelectTarget) => {
    const isSame =
      activeTarget?.type === target.type &&
      (target.type === 'hero'
        ? activeTarget.slot === target.slot
        : activeTarget.index === target.index);
    onActiveTargetChange(isSame ? null : target);
  };

  const isCardDisabled = (card: Card) => {
    if (!activeTarget) return usedCards.has(card);
    if (activeTarget.type === 'hero') {
      const otherSlot = activeTarget.slot === 0 ? 1 : 0;
      return usedCards.has(card) && heroCards[otherSlot] !== card;
    }
    return usedCards.has(card) && boardCards[activeTarget.index] !== card;
  };

  return (
    <div className="flex flex-col gap-4">
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-400">
          ไพ่ในมือ Hero
        </h3>
        <div className="flex gap-2">
          {([0, 1] as const).map((slot) => (
            <PlayingCard
              key={slot}
              card={heroCards[slot]}
              size="lg"
              placeholder={`H${slot + 1}`}
              selected={
                activeTarget?.type === 'hero' && activeTarget.slot === slot
              }
              onClick={() => toggleTarget({ type: 'hero', slot })}
            />
          ))}
        </div>
      </section>

      {boardLimit > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-400">
            ไพ่บน Board ({boardLimit} ใบ)
          </h3>
          <div className="flex gap-2">
            {Array.from({ length: boardLimit }, (_, i) => (
              <PlayingCard
                key={i}
                card={boardCards[i]}
                size="lg"
                placeholder={`B${i + 1}`}
                selected={
                  activeTarget?.type === 'board' && activeTarget.index === i
                }
                onClick={() => toggleTarget({ type: 'board', index: i })}
              />
            ))}
          </div>
        </section>
      )}

      {stage === 'PREFLOP' && (
        <p className="text-sm text-zinc-500 italic">
          Preflop — ไม่ต้องเลือกไพ่บน Board
        </p>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
            เลือกไพ่
          </h3>
          {activeTarget && (
            <div className="flex gap-2">
              <span className="text-xs text-gold">
                กำลังเลือก:{' '}
                {activeTarget.type === 'hero'
                  ? `Hero ใบที่ ${activeTarget.slot + 1}`
                  : `Board ใบที่ ${activeTarget.index + 1}`}
                <span className="ml-1 text-zinc-500">· พิมพ์ AsKd ได้</span>
              </span>
              <button
                type="button"
                onClick={clearTarget}
                className="text-xs text-red-400 hover:text-red-300"
              >
                ล้าง
              </button>
            </div>
          )}
        </div>

        {!activeTarget && (
          <p className="mb-2 text-xs text-zinc-500">
            คลิกช่องไพ่ด้านบน แล้วพิมพ์รหัสไพ่ (เช่น AsKd) หรือเลือกจากกริด
          </p>
        )}

        <div className="grid grid-cols-[repeat(13,minmax(0,1fr))] gap-1 overflow-x-auto rounded-xl border border-zinc-700/50 bg-zinc-900/50 p-3">
          {FULL_DECK.map((card) => {
            const disabled = isCardDisabled(card);
            const red = isRedSuit(card);
            const { rank } = { rank: card.slice(0, -1) };
            const symbol = formatCard(card).slice(rank.length);

            return (
              <button
                key={card}
                type="button"
                disabled={disabled || !activeTarget}
                onClick={() => handleCardPick(card)}
                className={`flex h-10 w-8 flex-col items-center justify-center rounded border font-mono text-[10px] font-semibold transition-all ${
                  disabled
                    ? 'cursor-not-allowed border-zinc-800 bg-zinc-800/30 text-zinc-600 line-through'
                    : !activeTarget
                      ? 'border-zinc-700 bg-zinc-800/50 text-zinc-500'
                      : red
                        ? 'border-zinc-600 bg-zinc-100 text-red-600 hover:scale-110 hover:ring-2 hover:ring-gold cursor-pointer'
                        : 'border-zinc-600 bg-zinc-100 text-zinc-900 hover:scale-110 hover:ring-2 hover:ring-gold cursor-pointer'
                }`}
              >
                <span>{rank}</span>
                <span className="text-xs leading-none">{symbol}</span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="flex flex-wrap gap-1">
        {STAGES.map((s) => (
          <span
            key={s}
            className={`rounded px-2 py-0.5 text-[10px] ${
              s === stage
                ? 'bg-gold/20 text-gold ring-1 ring-gold/40'
                : 'bg-zinc-800 text-zinc-500'
            }`}
          >
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}
