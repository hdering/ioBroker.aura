import type React from 'react';

const POSITION_CLASSES: Record<string, string> = {
  tl: 'justify-start items-start',
  tc: 'justify-start items-center',
  tr: 'justify-start items-end',
  cl: 'justify-center items-start',
  cc: 'justify-center items-center',
  cr: 'justify-center items-end',
  bl: 'justify-end items-start',
  bc: 'justify-end items-center',
  br: 'justify-end items-end',
};

export function contentPositionClass(pos: string | undefined): string {
  return pos ? (POSITION_CLASSES[pos] ?? 'justify-between') : 'justify-between';
}

// Returns inline styles to absolutely position the title within a position:relative container
export function titlePositionStyle(pos: string | undefined): React.CSSProperties | undefined {
  if (!pos) return undefined;
  const vert = pos[0];   // t | c | b
  const horiz = pos[1];  // l | c | r

  const style: React.CSSProperties = { position: 'absolute', zIndex: 1, maxWidth: '100%' };

  if (vert === 't') style.top = 0;
  else if (vert === 'c') style.top = '50%';
  else style.bottom = 0;

  if (horiz === 'l') style.left = 0;
  else if (horiz === 'c') style.left = '50%';
  else style.right = 0;

  if (vert === 'c' && horiz === 'c') style.transform = 'translate(-50%, -50%)';
  else if (vert === 'c') style.transform = 'translateY(-50%)';
  else if (horiz === 'c') style.transform = 'translateX(-50%)';

  return style;
}

export function titleTextAlign(pos: string | undefined): React.CSSProperties['textAlign'] {
  if (!pos) return undefined;
  const horiz = pos[1];
  if (horiz === 'c') return 'center';
  if (horiz === 'r') return 'right';
  return 'left';
}
