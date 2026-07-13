import type { Card } from '../types';
import { formatCard, isRedSuit } from '../lib/cards';

interface PlayingCardProps {
  card: Card | null;
  size?: 'sm' | 'md' | 'lg';
  placeholder?: string;
  onClick?: () => void;
  selected?: boolean;
  disabled?: boolean;
}

const sizeClasses = {
  sm: 'w-9 h-12 text-xs',
  md: 'w-11 h-[3.75rem] text-sm',
  lg: 'w-14 h-20 text-base',
};

export function PlayingCard({
  card,
  size = 'md',
  placeholder = '?',
  onClick,
  selected = false,
  disabled = false,
}: PlayingCardProps) {
  const base =
    'relative flex flex-col items-center justify-center rounded-lg border font-mono font-semibold transition-all select-none';

  if (!card) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`${base} ${sizeClasses[size]} border-dashed border-zinc-600 bg-zinc-800/50 text-zinc-500 ${
          onClick && !disabled ? 'hover:border-gold hover:text-gold cursor-pointer' : ''
        } ${selected ? 'ring-2 ring-gold' : ''}`}
      >
        {placeholder}
      </button>
    );
  }

  const red = isRedSuit(card);
  const { rank } = { rank: card.slice(0, -1) };
  const symbol = formatCard(card).slice(rank.length);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${sizeClasses[size]} bg-gradient-to-b from-zinc-100 to-zinc-200 border-zinc-300 shadow-md ${
        red ? 'text-red-600' : 'text-zinc-900'
      } ${onClick && !disabled ? 'hover:scale-105 hover:shadow-lg cursor-pointer' : ''} ${
        selected ? 'ring-2 ring-gold scale-105' : ''
      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      <span className="leading-none">{rank}</span>
      <span className="leading-none text-lg">{symbol}</span>
    </button>
  );
}
